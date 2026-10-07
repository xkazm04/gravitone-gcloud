// LANE — ONE SPEND WINDOW PER MACHINE (dynamic).
//
// Card IMG-A stage 3a (docs/concepts/moonshots-2026-10-05/06-imaging-music.md,
// acceptance cases 1-6), built as the operator decided on 2026-10-07 (ask
// c4c3335e, "Local now, hosted later"): a file spend store behind the async
// SpendStore seam, so the Next server, a pipeline script and a second process on
// this machine spend from ONE window, and a restart forgets nothing.
//
// EVERY OTHER PROBE STAYS IN MEMORY. playwright.config.ts pins the node lane to
// SPEND_STORE=memory; the first case below proves that pin reaches this worker.
// Only this file opts into the file store, and every case that does gets its own
// mkdtempSync directory, removed afterwards, so no probe ever writes the real
// foundry-out/spend/.
//
// TWO PROCESSES MEANS TWO PROCESSES. Cases that need another process spawn a
// real Node child (tsx's own loader, resolved once from `npx tsx`), importing
// the repo's modules fresh: a module instance that shares nothing with this
// worker but the directory. Children that must act "at the same moment" meet at
// a file barrier first, so a race is real and not an artefact of start-up time.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { FAKE_ENGINE_ENV, keepEnv, loadCassette, withFakeEngine, type Cassette } from "./_helpers";
import { meterConformance } from "./_meterKit";
import { MANAGED_MARKERS } from "@/lib/deployment";
import { BUDGET_VAR, budgetStats } from "@/lib/imaging/budget";
import { videoBudgetStats } from "@/lib/imaging/video/budget";
import { musicBudgetStats } from "@/lib/music/budget";
import { SPEND_CLASSES, type SpendClassDef } from "@/lib/spend/classes";
import { createMeter, type MeterRow } from "@/lib/spend/meter";
import { fileStore, HOSTED_NOT_BUILT, HostedSpendStoreNotBuilt } from "@/lib/spend/fileStore";
import type { SpendStore } from "@/lib/spend/store";
import { reason } from "@/lib/text/router";
import { textSpendStats } from "@/lib/text/spend";

test.describe.configure({ timeout: 120_000 });

const STORE_VARS = ["SPEND_STORE", "SPEND_STORE_DIR", "SPEND_HOLD_TTL_MS"] as const;
keepEnv([...STORE_VARS, ...MANAGED_MARKERS, "LOCAL_BINARIES", BUDGET_VAR]);

const ROOT = process.cwd();

/** Directories this file made; every one is removed after its case. */
const made: string[] = [];
function scratch(): string {
  const d = mkdtempSync(path.join(tmpdir(), "spend-ledger-"));
  made.push(d);
  return d;
}
test.afterEach(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});

// ── children ───────────────────────────────────────────────────────────────

let loaderArgs: string[] | null = null;
/** tsx's loader flags, read once from inside a tsx process. Children then run
 *  as plain `node <flags> file.mts`: a second each, not an npx resolve each. */
function tsxLoader(): string[] {
  if (loaderArgs) return loaderArgs;
  const d = mkdtempSync(path.join(tmpdir(), "spend-ledger-argv-"));
  try {
    const f = path.join(d, "argv.mts");
    writeFileSync(f, "console.log(JSON.stringify(process.execArgv));\n");
    const r = spawnSync(`npx --no-install tsx "${f}"`, { shell: true, cwd: ROOT, encoding: "utf8", timeout: 60_000 });
    const line = r.stdout.trim().split(/\r?\n/).pop() ?? "";
    loaderArgs = JSON.parse(line) as string[];
    return loaderArgs;
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
}

/** The environment a child gets: this worker's, minus every managed marker,
 *  on the FILE store over `dir`. */
function childEnv(dir: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, SPEND_STORE: "file", SPEND_STORE_DIR: dir, ...extra };
  for (const m of MANAGED_MARKERS) delete env[m];
  return env;
}

const PRELUDE = `
import { existsSync as __ex, writeFileSync as __wr } from "node:fs";
async function barrier(): Promise<void> {
  const sync = process.env.SYNC_DIR;
  if (!sync) return;
  __wr(sync + "/ready-" + process.env.CHILD_NAME, "");
  while (!__ex(sync + "/go")) await new Promise((r) => setTimeout(r, 2));
}
const out = (v: unknown) => console.log("RESULT " + JSON.stringify(v));
`;

interface ChildResult {
  pid: number;
  code: number | null;
  result: Record<string, unknown>;
  stdout: string;
}

/** Start one child running `body` (top-level await allowed). Its script lives
 *  in a scratch directory of its own, never in the store's directory. */
function startChild(name: string, body: string, env: NodeJS.ProcessEnv): Promise<ChildResult> {
  const file = path.join(scratch(), `${name}.mts`);
  writeFileSync(file, PRELUDE + body);
  const cp = spawn(process.execPath, [...tsxLoader(), file], { cwd: ROOT, env: { ...env, CHILD_NAME: name } });
  let stdout = "";
  let stderr = "";
  cp.stdout.on("data", (b) => (stdout += String(b)));
  cp.stderr.on("data", (b) => (stderr += String(b)));
  return new Promise<ChildResult>((resolve, reject) => {
    cp.on("error", reject);
    cp.on("close", (code) => {
      const line = stdout.split(/\r?\n/).find((l) => l.startsWith("RESULT "));
      if (!line) return reject(new Error(`child ${name} printed no RESULT (exit ${code})\n${stdout}\n${stderr}`));
      resolve({ pid: cp.pid!, code, result: JSON.parse(line.slice(7)), stdout });
    });
  });
}

const alone = (dir: string, name: string, body: string, extra: Record<string, string> = {}) =>
  startChild(name, body, childEnv(dir, extra));

/** Run children that meet at a barrier and then act at the same moment. */
async function together(dir: string, bodies: Record<string, string>, extra: Record<string, string> = {}): Promise<ChildResult[]> {
  const sync = scratch();
  const env = childEnv(dir, { ...extra, SYNC_DIR: sync });
  const running = Object.entries(bodies).map(([name, body]) => startChild(name, body, env));
  const names = Object.keys(bodies);
  for (let i = 0; i < 6000 && !names.every((n) => existsSync(path.join(sync, `ready-${n}`))); i++)
    await new Promise((r) => setTimeout(r, 10));
  writeFileSync(path.join(sync, "go"), "");
  return Promise.all(running);
}

// ── the pin ────────────────────────────────────────────────────────────────

test("the node lane is pinned to the memory store, and the pin reaches this worker", async () => {
  // Read before any case of this file sets anything: keepEnv restores it.
  expect(process.env.SPEND_STORE, "playwright.config.ts sets SPEND_STORE=memory for every worker").toBe("memory");
  for (const m of MANAGED_MARKERS) delete process.env[m];
  expect((await budgetStats()).store).toBe("memory");
  expect((await musicBudgetStats()).store).toBe("memory");
  expect((await videoBudgetStats()).store).toBe("memory");
  expect((await textSpendStats()).store).toBe("memory");
});

// ── case 1: one window across two processes ────────────────────────────────

test("case 1: two processes each reserve 60% of a $1 ceiling at once; exactly one is refused over-budget", async () => {
  const dir = scratch();
  const body = `
import { reserve } from "@/lib/imaging/budget";
await barrier();
try {
  const h = await reserve(0.6);
  out({ ok: true, id: h.id });
} catch (e) {
  out({ ok: false, kind: (e as { kind?: string }).kind, message: (e as Error).message });
}
`;
  const results = (await together(dir, { a: body, b: body }, { [BUDGET_VAR]: "1" })).map((c) => c.result);
  console.log(`[spend-ledger] case 1 -> ${JSON.stringify(results.map((x) => (x.ok ? "held" : x.kind)))}`);
  expect(results.filter((x) => x.ok)).toHaveLength(1);
  const refused = results.filter((x) => !x.ok);
  expect(refused).toHaveLength(1);
  expect(refused[0].kind).toBe("over-budget");
  expect(String(refused[0].message)).toContain("Imaging spend ceiling reached");
});

// ── case 2: a restart forgets nothing ──────────────────────────────────────

test("case 2: book $4, and another process on the same directory reads $4 spent", async () => {
  const dir = scratch();
  const booked = await alone(
    dir,
    "book",
    `
import { recordSpend } from "@/lib/imaging/budget";
await recordSpend({ usd: 4, cap: "generate", provider: "google", model: "probe", outcome: "served", basis: "vendor" });
out({ ok: true });
`,
  );
  expect(booked.result.ok).toBe(true);
  const read = await alone(
    dir,
    "read",
    `
import { budgetStats } from "@/lib/imaging/budget";
const s = await budgetStats();
out({ spentUsd: s.spentUsd, rows: s.rows, store: s.store });
`,
  );
  console.log(`[spend-ledger] case 2 -> ${JSON.stringify(read.result)}`);
  expect(read.result.store).toBe("file");
  expect(read.result.spentUsd).toBeCloseTo(4, 9);
  expect(read.result.rows).toBe(1);
});

// ── case 3: music, across processes, refused before the vendor ─────────────

test("case 3: two concurrent music renders summing past the ceiling: the second is refused before fetch", async () => {
  const dir = scratch();
  const body = `
import { composeMusic } from "@/lib/music/elevenlabs";
let fetches = 0;
globalThis.fetch = (async () => {
  fetches++;
  return new Response(new Uint8Array(2048), { status: 200, headers: { "content-type": "audio/mpeg" } });
}) as typeof fetch;
const PLAN = {
  positiveGlobalStyles: ["warm"],
  negativeGlobalStyles: ["harsh"],
  sections: [{ name: "bed", durationMs: 12000, positiveStyles: ["warm"], negativeStyles: ["harsh"] }],
};
await barrier();
try {
  await composeMusic(PLAN);
  out({ ok: true, fetches });
} catch (e) {
  out({ ok: false, kind: (e as { kind?: string }).kind, fetches });
}
`;
  const results = (
    await together(dir, { a: body, b: body }, {
      MUSIC_BUDGET_SECONDS_PER_WINDOW: "20", // each 12 s render is 60% of it
      ELEVENLABS_API_KEY: "probe-key-not-a-real-one",
    })
  ).map((c) => c.result);
  console.log(`[spend-ledger] case 3 -> ${JSON.stringify(results)}`);
  // "Reached" is judged by the fake fetch, not by how the render ended: what
  // the case proves is which call the ceiling stopped before the vendor.
  const refused = results.filter((x) => x.kind === "over-budget");
  const reached = results.filter((x) => x.kind !== "over-budget");
  expect(refused).toHaveLength(1);
  expect(refused[0].fetches, "the refused render reached the vendor").toBe(0);
  expect(reached).toHaveLength(1);
  expect(reached[0].fetches).toBeGreaterThanOrEqual(1);
});

// ── case 4: text, counted on the shared ledger ─────────────────────────────

const SCHEMA = { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] } as const;

function costing(usd: number): Cassette {
  const base = loadCassette("engine-door");
  const ok = base.turns.find((t) => t.match?.heading === "# DOOR ok")!;
  return { ...base, turns: [{ ...ok, match: { heading: "# SPEND" }, envelope: { ...ok.envelope!, total_cost_usd: usd } }] };
}

test.describe("case 4: text on the file store", () => {
  keepEnv([...FAKE_ENGINE_ENV, "TEXT_ENV", "GOOGLE_AI_API_KEY", "LIGHTTRACK_DISABLE"]);

  test("a claude-cli turn reporting $0.31 books one vendor row; a google turn is counted unpriced with no $0 row", async () => {
    const dir = scratch();
    process.env.SPEND_STORE = "file";
    process.env.SPEND_STORE_DIR = dir;
    for (const m of MANAGED_MARKERS) delete process.env[m];
    process.env.TEXT_ENV = "local";
    process.env.LOCAL_BINARIES = "on";
    process.env.LIGHTTRACK_DISABLE = "1";
    delete process.env.GOOGLE_AI_API_KEY;

    await withFakeEngine(costing(0.31), async () => {
      const out = await reason({ prompt: "# SPEND\n", turn: "edit-plan", schema: SCHEMA });
      expect(out.provenance.provider).toBe("claude-cli");
    });
    process.env.GOOGLE_AI_API_KEY = "probe-google-key-0123456789";
    const real = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"ok":true}' }] }, finishReason: "STOP" }],
          usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 4 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as typeof fetch;
    try {
      const out = await reason({ prompt: "x", turn: "edit-plan", schema: SCHEMA, avoid: "claude-cli" });
      expect(out.provenance.provider).toBe("google");
    } finally {
      globalThis.fetch = real;
    }

    // Read back by ANOTHER process: what this worker booked is on disk.
    const read = await alone(
      dir,
      "read",
      `
import { textSpendRows, textSpendStats } from "@/lib/text/spend";
const s = await textSpendStats();
out({ rows: await textSpendRows(), unpriced: s.counters.unpriced, booked: s.counters.booked, store: s.store });
`,
    );
    console.log(`[spend-ledger] case 4 -> ${JSON.stringify(read.result)}`);
    const rows = read.result.rows as MeterRow[];
    expect(read.result.store).toBe("file");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amount: 0.31, basis: "vendor", outcome: "served" });
    expect(rows[0].axes.provider).toBe("claude-cli");
    expect(read.result.unpriced).toBe(1);
    expect(read.result.booked).toBe(1);
  });
});

// ── a kernel meter on the file store, for the cases below the adapters ─────

class KitInvalid extends Error {}
class KitOverBudget extends Error {}
class KitBusy extends Error {}
type KitAxes = { cap?: string };
type KitRowIn = { amount: number | undefined; outcome: "served" | "failed"; at?: number; attributed?: boolean };
type KitStore = SpendStore<MeterRow<KitAxes, "estimate">>;

const KIT_DEF: SpendClassDef = {
  ...SPEND_CLASSES["imaging-usd"],
  ceilingVar: "SPEND_KIT_FILE_CEILING",
  windowVar: "SPEND_KIT_FILE_WINDOW_MS",
  floorVar: "SPEND_KIT_FILE_FLOOR",
  defaultCeiling: 3,
  defaultWindowMs: 120_000,
};
keepEnv([KIT_DEF.ceilingVar]);

const kitMeter = (store: KitStore) =>
  createMeter<KitRowIn, KitAxes, "estimate">(
    KIT_DEF,
    {
      entry: (r) => ({
        amount: r.amount,
        outcome: r.outcome,
        basis: "estimate",
        axes: { cap: r.attributed === false ? undefined : "kit" },
        at: r.at,
      }),
      refuse: (r) => new KitOverBudget(`refused ${r.amount}`),
      invalid: (a) => new KitInvalid(`invalid ${a}`),
      busy: (m) => new KitBusy(m),
    },
    store,
  );

// ── case 5: a dead process's hold is reclaimed after its TTL ───────────────

test("case 5: a hold whose owner died is reclaimed after its TTL, counted, and never booked", async () => {
  const dir = scratch();
  process.env.SPEND_STORE_DIR = dir;
  const holder = await alone(
    dir,
    "holder",
    `
import { SPEND_CLASSES } from "@/lib/spend/classes";
import { createMeter } from "@/lib/spend/meter";
import { fileStore } from "@/lib/spend/fileStore";
const def = { ...SPEND_CLASSES["imaging-usd"], ceilingVar: "SPEND_KIT_FILE_CEILING", defaultCeiling: 3 };
const m = createMeter(def, {
  entry: (r: { amount: number }) => ({ amount: r.amount, outcome: "served" as const, basis: "estimate", axes: {} }),
  refuse: () => new Error("refused"),
  invalid: () => new Error("invalid"),
}, fileStore("spend-kit"));
const h = await m.reserve(0.3);
out({ id: h.id, pid: process.pid });
`,
  );
  // The child has exited without settling: its pid is dead and its hold is not.
  expect(holder.result.pid).toBe(holder.pid);
  expect(() => process.kill(holder.pid, 0)).toThrow();

  const m = kitMeter(fileStore("spend-kit"));

  // Control: inside its TTL a dead owner's hold still counts. A pid that has
  // only just exited is not proof the call it reserved for will not settle.
  process.env.SPEND_HOLD_TTL_MS = "3600000";
  const young = await m.stats();
  expect(young.held).toBeCloseTo(0.3, 9);
  expect(young.counters.expiredHolds).toBe(0);

  await new Promise((r) => setTimeout(r, 20));
  process.env.SPEND_HOLD_TTL_MS = "1";
  const old = await m.stats();
  console.log(
    `[spend-ledger] case 5 -> young held=${young.held} expired=${young.counters.expiredHolds}; ` +
      `old held=${old.held} expired=${old.counters.expiredHolds} expiredAmount=${old.counters.expiredAmount}`,
  );
  expect(old.counters.expiredHolds).toBe(1);
  expect(old.counters.expiredAmount).toBeCloseTo(0.3, 9);
  expect(old.held).toBe(0);
  expect(old.remaining).toBeCloseTo(3, 9); // the window total excludes it
  expect(old.spent).toBe(0); // reclaimed, never booked
  expect(old.counters.booked).toBe(0);
});

// ── case 6: the conformance kit, on the file store ─────────────────────────

const fileKernel = kitMeter(fileStore("spend-kit"));

test.describe("case 6", () => {
  test.beforeEach(() => {
    // A fresh directory per case, resolved per call by the store.
    process.env.SPEND_STORE_DIR = scratch();
    expect(fileKernel.store.kind).toBe("file");
  });

  meterConformance({
    name: "kernel (lib/spend/meter, FILE store)",
    ceilingVar: KIT_DEF.ceilingVar,
    windowVar: KIT_DEF.windowVar,
    floorVar: KIT_DEF.floorVar,
    defaultCeiling: KIT_DEF.defaultCeiling,
    defaultWindowMs: KIT_DEF.defaultWindowMs,
    attributionAxis: KIT_DEF.attributionAxis,
    extraEnv: ["SPEND_STORE_DIR"],
    reset: () => fileKernel.reset(),
    reserve: (a, now) => fileKernel.reserve(a, now),
    release: (h) => fileKernel.release(h),
    settle: (h, rows) => fileKernel.settle(h, rows),
    book: (r) => fileKernel.book(r),
    stats: async (now) => {
      const s = await fileKernel.stats(now);
      return { ...s, counters: { ...s.counters } };
    },
    byAxis: async (now) => {
      const a = await fileKernel.byAxis(now);
      return { total: a.total, served: a.byOutcome.served, failed: a.byOutcome.failed, unattributed: a.unattributed, axes: a.byAxis };
    },
    rows: (now) => fileKernel.rows(now),
    tamper: async () => {
      const s = await fileKernel.stats();
      s.counters.booked = 0;
      s.spent = 999;
      for (const r of await fileKernel.rows()) {
        r.amount = 999;
        r.axes.cap = "tampered";
      }
      const a = await fileKernel.byAxis();
      a.total = 999;
      a.byOutcome.served = 999;
      for (const axis of Object.values(a.byAxis)) for (const k of Object.keys(axis)) axis[k] = 999;
    },
    isOverBudget: (e) => e instanceof KitOverBudget,
    isInvalid: (e) => e instanceof KitInvalid,
  });
});

// ── the file store's own edges ─────────────────────────────────────────────

test.describe("the file store", () => {
  test("a held lock refuses a reservation with its own sentence and defers a booking, never drops it", async () => {
    const dir = scratch();
    process.env.SPEND_STORE_DIR = dir;
    const m = kitMeter(fileStore("spend-busy", { timing: { staleMs: 60_000, waitMs: 80 } }));
    await m.book({ amount: 0.1, outcome: "served" });

    // Somebody else holds the lock, and is alive (a fresh lock is never broken).
    const lock = path.join(dir, "spend-busy.lock");
    writeFileSync(lock, JSON.stringify({ pid: 1, at: new Date().toISOString(), by: "probe" }));

    const refused = await m.reserve(0.2).then(
      () => null,
      (e: unknown) => e,
    );
    expect(refused).toBeInstanceOf(KitBusy);
    expect((refused as Error).message).toContain("nothing was spent");

    // A vendor already answered: its row must not be lost to a busy lock.
    await m.book({ amount: 0.25, outcome: "served" }); // resolves; never throws
    rmSync(lock, { force: true });

    const s = await m.stats();
    expect(s.spent).toBeCloseTo(0.35, 9);
    expect(s.counters.lateWrites).toBe(1);
    expect(s.held).toBe(0);
    expect(s.counters.refusals).toBe(0); // the busy refusal is not a budget verdict
  });

  test("a hold this process owns is never reclaimed, however old", async () => {
    process.env.SPEND_STORE_DIR = scratch();
    process.env.SPEND_HOLD_TTL_MS = "1";
    const m = kitMeter(fileStore("spend-own"));
    await m.reserve(0.4, 1); // createdAt in 1970
    await new Promise((r) => setTimeout(r, 10));
    const s = await m.stats();
    expect(s.held).toBeCloseTo(0.4, 9);
    expect(s.counters.expiredHolds).toBe(0);
  });

  test("a restart forgets nothing: a fresh store on the same directory reads the window", async () => {
    process.env.SPEND_STORE_DIR = scratch();
    const before = kitMeter(fileStore("spend-restart"));
    await before.book({ amount: 0.7, outcome: "served" });
    const h = await before.reserve(0.2);
    const after = kitMeter(fileStore("spend-restart"));
    const s = await after.stats();
    expect(s.spent).toBeCloseTo(0.7, 9);
    expect(s.held).toBeCloseTo(0.2, 9);
    expect(s.counters.booked).toBe(1);
    await after.settle(h, { amount: 0.15, outcome: "served" });
    expect((await before.stats()).held).toBe(0);
    expect((await before.stats()).spent).toBeCloseTo(0.85, 9);
  });

  test("the state is a file in SPEND_STORE_DIR, resolved per call", async () => {
    const a = scratch();
    const b = scratch();
    const m = kitMeter(fileStore("spend-dir"));
    process.env.SPEND_STORE_DIR = a;
    await m.book({ amount: 0.5, outcome: "served" });
    process.env.SPEND_STORE_DIR = b;
    expect((await m.stats()).spent).toBe(0);
    process.env.SPEND_STORE_DIR = a;
    expect((await m.stats()).spent).toBeCloseTo(0.5, 9);
    const onDisk = JSON.parse(readFileSync(path.join(a, "spend-dir.json"), "utf8")) as { rows: unknown[] };
    expect(onDisk.rows).toHaveLength(1);
    expect(existsSync(path.join(a, "spend-dir.lock")), "the lock is released after every transaction").toBe(false);
  });

  test("a ledger that is not valid JSON fails loudly and is never read as empty", async () => {
    const dir = scratch();
    process.env.SPEND_STORE_DIR = dir;
    const file = path.join(dir, "spend-bad.json");
    const m = kitMeter(fileStore("spend-bad"));
    for (const body of ['{"rows":[{"amount":', "null", ""]) {
      writeFileSync(file, body);
      await expect(m.reserve(0.1)).rejects.toThrow(/spend-bad\.json is not/);
      await expect(m.stats()).rejects.toThrow(/refusing to treat it as empty/);
      expect(readFileSync(file, "utf8"), "the bad ledger is left as found").toBe(body);
    }
  });

  test("on the managed posture the file store refuses to exist", async () => {
    process.env.SPEND_STORE_DIR = scratch();
    for (const marker of MANAGED_MARKERS) {
      for (const m of MANAGED_MARKERS) delete process.env[m];
      process.env[marker] = "probe";
      expect(() => fileStore("spend-managed"), marker).toThrow(HostedSpendStoreNotBuilt);
    }
    expect(() => fileStore("spend-managed")).toThrow(/hosted spend store is not built/);
    for (const m of MANAGED_MARKERS) delete process.env[m];
    process.env.LOCAL_BINARIES = "off"; // the CLI posture is not the disk posture
    expect(fileStore("spend-managed").kind).toBe("file");
  });

  test("on the managed posture every class is in memory, with the reason; asking for the file there is refused", async () => {
    process.env.SPEND_STORE_DIR = scratch();
    delete process.env.SPEND_STORE;
    process.env.K_SERVICE = "probe-service";
    for (const s of [await budgetStats(), await musicBudgetStats(), await videoBudgetStats(), await textSpendStats()]) {
      expect(s.store).toBe("memory");
      expect(s.storeReason).toBe("hosted spend store not built (operator 2026-10-07: local now, hosted later)");
    }
    expect(HOSTED_NOT_BUILT).toBe("hosted spend store not built (operator 2026-10-07: local now, hosted later)");

    // Asking for the file store on that posture is refused loudly, never run
    // quietly per instance.
    process.env.SPEND_STORE = "file";
    await expect(budgetStats()).rejects.toThrow(HostedSpendStoreNotBuilt);
    // And a value that names no store picks none.
    delete process.env.K_SERVICE;
    process.env.SPEND_STORE = "gcs";
    await expect(budgetStats()).rejects.toThrow(/SPEND_STORE=gcs is not a spend store/);
  });

  test("on this machine, with no pin, every class is on the file store", async () => {
    const dir = scratch();
    process.env.SPEND_STORE_DIR = dir;
    delete process.env.SPEND_STORE;
    for (const m of MANAGED_MARKERS) delete process.env[m];
    for (const s of [await budgetStats(), await musicBudgetStats(), await videoBudgetStats(), await textSpendStats()]) {
      expect(s.store).toBe("file");
      expect(s.storeReason).toBeUndefined();
    }
    for (const cls of ["imaging-usd", "music-audio-s", "video-usd", "text-usd"])
      expect(existsSync(path.join(dir, `${cls}.json`)), cls).toBe(true);
  });

  test("latency: 200 reserve+settle round trips on the file store", async () => {
    process.env.SPEND_STORE_DIR = scratch();
    process.env[KIT_DEF.ceilingVar] = "1000000";
    const m = kitMeter(fileStore("spend-latency"));
    const ms: number[] = [];
    for (let i = 0; i < 200; i++) {
      const t = performance.now();
      const h = await m.reserve(0.01);
      await m.settle(h, { amount: 0.01, outcome: "served" });
      ms.push(performance.now() - t);
    }
    ms.sort((x, y) => x - y);
    const p50 = ms[99];
    const p95 = ms[189];
    console.log(`[spend-ledger] latency reserve+settle n=200 p50=${p50.toFixed(2)}ms p95=${p95.toFixed(2)}ms max=${ms[199].toFixed(2)}ms`);
    const s = await m.stats();
    expect(s.counters.booked).toBe(200);
    expect(s.held).toBe(0);
  });
});
