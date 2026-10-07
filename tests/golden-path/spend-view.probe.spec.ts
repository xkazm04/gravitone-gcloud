// LANE — GET /api/spend, EVERY CLASS IN ONE WINDOW VIEW (dynamic).
//
// Card IMG-A stage 3c (docs/concepts/moonshots-2026-10-05/06-imaging-music.md:24
// and the GET /api/spend bullet under "The move"). Q4: the view reads FRESH,
// through each meter's locked stats(now) and byAxis(now), never a store's
// lastSeen — so the cross-process case below is the one that matters.
//
// Synthetic rows only, booked through the adapters' own record functions. No
// vendor and no engine.

import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { keepEnv } from "./_helpers";
import { ACCESS_SECRET_VAR, __resetRateLimit } from "@/lib/apiAuth";
import { MANAGED_MARKERS } from "@/lib/deployment";
import { BUDGET_VAR, WINDOW_VAR, budgetStats, recordSpend, __resetBudget } from "@/lib/imaging/budget";
import { __resetVideoBudget } from "@/lib/imaging/video/budget";
import { musicBudgetStats, recordMusicSpend, __resetMusicBudget } from "@/lib/music/budget";
import { SPEND_CLASSES } from "@/lib/spend/classes";
import { __resetTextSpend } from "@/lib/text/spend";
import { GET as spendGET } from "@/app/api/spend/route";
import { spendView } from "@/lib/spendView";
import { POST as generatePOST } from "@/app/api/imaging/generate/route";

test.describe.configure({ timeout: 120_000 });

const ROOT = process.cwd();
const STORE_VARS = ["SPEND_STORE", "SPEND_STORE_DIR", "SPEND_HOLD_TTL_MS"] as const;
keepEnv([...STORE_VARS, ...MANAGED_MARKERS, "LOCAL_BINARIES", BUDGET_VAR, WINDOW_VAR, ACCESS_SECRET_VAR]);

const CEILING_KEYS = ["ceiling", "floor", "held", "remaining", "underFloor"] as const;
const HEADERS = { authorization: "Bearer probe-secret", "x-forwarded-for": "198.51.100.1" };

const made: string[] = [];
const scratch = (): string => {
  const d = mkdtempSync(path.join(tmpdir(), "spend-view-"));
  made.push(d);
  return d;
};

test.beforeEach(() => {
  for (const m of MANAGED_MARKERS) delete process.env[m];
  process.env.SPEND_STORE = "memory";
  process.env[ACCESS_SECRET_VAR] = "probe-secret";
  delete process.env[BUDGET_VAR];
  delete process.env[WINDOW_VAR];
  __resetBudget();
  __resetMusicBudget();
  __resetVideoBudget();
  __resetTextSpend();
  __resetRateLimit();
});
test.afterEach(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});

const getSpend = async (headers?: Record<string, string>): Promise<Response> => {
  return spendGET(new Request("http://localhost/api/spend", { method: "GET", headers }));
};

interface ClassView {
  id: string;
  unit: string;
  countOnly: boolean;
  windowMs: number;
  windowStart: number;
  windowEnd: number;
  spent: number;
  rows: number;
  store: string;
  storeReason?: string;
  ceiling?: number;
  held?: number;
  remaining?: number;
  byAxis: Record<string, Record<string, number>>;
}
interface View {
  at: number;
  classes: ClassView[];
}

test("1. no access header is 401; with it, 200", async () => {
  expect((await getSpend()).status).toBe(401);
  expect((await getSpend({ authorization: "Bearer wrong", "x-forwarded-for": "198.51.100.9" })).status).toBe(401);
  expect((await getSpend(HEADERS)).status).toBe(200);
});

test("2. shape: four classes in declaration order, one window each, text-usd count-only with no ceiling keys", async () => {
  process.env[BUDGET_VAR] = "2";
  const view = (await (await getSpend(HEADERS)).json()) as View;
  expect(view.classes.map((c) => c.id)).toEqual(Object.keys(SPEND_CLASSES));
  expect(view.classes).toHaveLength(4);
  for (const c of view.classes) {
    expect(c.windowEnd, c.id).toBe(view.at);
    expect(c.windowEnd - c.windowStart, c.id).toBe(c.windowMs);
    expect(Object.keys(c.byAxis), c.id).toEqual([...SPEND_CLASSES[c.id as keyof typeof SPEND_CLASSES].axes]);
  }
  const text = view.classes.find((c) => c.id === "text-usd")!;
  expect(text.countOnly).toBe(true);
  for (const k of CEILING_KEYS) expect(k in text, `text-usd must not carry ${k}`).toBe(false);
  for (const c of view.classes.filter((x) => x.id !== "text-usd")) {
    expect(c.countOnly, c.id).toBe(false);
    for (const k of CEILING_KEYS) expect(k in c, `${c.id} carries ${k}`).toBe(true);
  }
  expect(view.classes.find((c) => c.id === "imaging-usd")!.ceiling).toBe(2);
});

test("3. one window, one answer: imaging and music equal their adapters' stats at the same now", async () => {
  await recordSpend({ usd: 0.25, cap: "generate", provider: "google", model: "probe", outcome: "served", basis: "vendor" });
  await recordMusicSpend({ seconds: 12, op: "compose", model: "probe", outcome: "served" } as Parameters<typeof recordMusicSpend>[0]);
  const now = Date.now();
  const view = await spendView(now);
  expect(view.at).toBe(now);
  const img = view.classes.find((c) => c.id === "imaging-usd")!;
  const is = await budgetStats(now);
  expect(img.spent).toBe(is.spentUsd);
  expect(img.held).toBe(is.heldUsd);
  expect(img.remaining).toBe(is.remainingUsd);
  expect(img.windowStart).toBe(is.windowStart);
  expect(img.windowEnd).toBe(is.windowEnd);
  expect(img.spent).toBeCloseTo(0.25, 9);
  const mus = view.classes.find((c) => c.id === "music-audio-s")!;
  const ms = await musicBudgetStats(now);
  expect(mus.spent).toBe(ms.spentSeconds);
  expect(mus.held).toBe(ms.heldSeconds);
  expect(mus.remaining).toBe(ms.remainingSeconds);
  expect(mus.windowStart).toBe(ms.windowStart);
  expect(mus.windowEnd).toBe(ms.windowEnd);
  expect(mus.spent).toBe(12);
});

let loaderArgs: string[] | null = null;
/** tsx's loader flags, read once from inside a tsx process. */
function tsxLoader(): string[] {
  if (loaderArgs) return loaderArgs;
  const d = scratch();
  const f = path.join(d, "argv.mts");
  writeFileSync(f, "console.log(JSON.stringify(process.execArgv));\n");
  const r = spawnSync(`npx --no-install tsx "${f}"`, { shell: true, cwd: ROOT, encoding: "utf8", timeout: 60_000 });
  loaderArgs = JSON.parse(r.stdout.trim().split(/\r?\n/).pop() ?? "[]") as string[];
  return loaderArgs;
}

/** Run `body` in a real tsx child; resolves once the process has EXITED and its
 *  streams have drained, so nothing is read or removed under a live child. */
function runChild(body: string, env: NodeJS.ProcessEnv): Promise<{ code: number | null; output: string }> {
  const file = path.join(scratch(), "child.mts");
  writeFileSync(file, body);
  const cp = spawn(process.execPath, [...tsxLoader(), file], { cwd: ROOT, env });
  let output = "";
  cp.stdout.on("data", (b) => (output += String(b)));
  cp.stderr.on("data", (b) => (output += String(b)));
  return new Promise((resolve, reject) => {
    cp.on("error", reject);
    // `close` fires after `exit` and after both streams end.
    cp.on("close", (code) => resolve({ code, output }));
  });
}

test("4. fresh across processes: a child's booking is in this worker's view", async () => {
  const dir = scratch();
  const env: NodeJS.ProcessEnv = { ...process.env, SPEND_STORE: "file", SPEND_STORE_DIR: dir };
  for (const m of MANAGED_MARKERS) delete env[m];
  const child = await runChild(
    `
import { recordSpend } from "@/lib/imaging/budget";
import { recordMusicSpend } from "@/lib/music/budget";
await recordSpend({ usd: 0.4, cap: "generate", provider: "google", model: "probe", outcome: "served", basis: "vendor" });
await recordMusicSpend({ seconds: 12, op: "compose", model: "probe", outcome: "served" });
`,
    env,
  );
  expect(child.code, child.output).toBe(0);

  process.env.SPEND_STORE = "file";
  process.env.SPEND_STORE_DIR = dir;
  const view = (await (await getSpend(HEADERS)).json()) as View;
  const img = view.classes.find((c) => c.id === "imaging-usd")!;
  const mus = view.classes.find((c) => c.id === "music-audio-s")!;
  expect(img.store).toBe("file");
  expect(img.spent).toBeCloseTo(0.4, 9);
  expect(mus.spent).toBe(12);
});

test("5. rate-limit isolation: 40 authorised GETs leave the origin limiter unconsumed", async () => {
  const ip = "198.51.100.2";
  for (let i = 0; i < 40; i++) {
    const res = await getSpend({ authorization: "Bearer probe-secret", "x-forwarded-for": ip });
    expect(res.status).toBe(200);
  }
  const post = await generatePOST(
    new Request("http://localhost/api/imaging/generate", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer probe-secret", "x-forwarded-for": ip },
      body: JSON.stringify({}),
    }),
  );
  expect(post.status).not.toBe(429);
  expect(post.status).toBe(400);
});

test("6. managed posture: every class reports store memory with its reason", async () => {
  delete process.env.SPEND_STORE;
  process.env.SPEND_STORE_DIR = scratch();
  process.env.K_SERVICE = "probe-service";
  const view = (await (await getSpend(HEADERS)).json()) as View;
  expect(view.classes).toHaveLength(4);
  for (const c of view.classes) {
    expect(c.store, c.id).toBe("memory");
    expect(c.storeReason, c.id).toBe("hosted spend store not built (operator 2026-10-07: local now, hosted later)");
  }
});
