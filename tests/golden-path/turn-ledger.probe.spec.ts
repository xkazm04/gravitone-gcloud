// LANE — AI TURNS ARE SERVER-OWNED RECORDS, AND CANCEL ENDS THE ENGINE (dynamic, AIO-A stage 1).
//
// WHAT WAS WRONG. A minutes-long paid turn was one held-open request. Its only
// record was a localStorage row in one tab (lib/jobs.tsx, `gravitone.jobs.v1`),
// a reload rewrote it `interrupted`, and the Abort the client sent stopped at
// the fetch: `runClaude(prompt, timeoutMs)` took no signal, the text provider
// passed none and `reason()` had none to pass, so the `claude` process ran on
// to its 600s ceiling, on the operator's seat, for an answer nobody received.
//
// WHAT THIS PROBE DRIVES. Nothing inside the app is mocked. The routes are the
// real exported handlers, the runner calls the real `reason()`, the router walks
// its real ladder and lib/claudeCli.ts spawns "claude" through its real shell
// setting — which `withFakeEngine` (CIP-A) resolves to a stand-in that replays a
// cassette. The stand-in records its own pid, which is how a cancel is checked
// the way cli-kill-tree checks a timeout: the process at the bottom of the tree
// is asked whether it is still alive.
//
// THE TURN KIND IS THE PROBE'S OWN. Stage 1 is the kernel; no production kind is
// registered on it until /api/recalibrate hands its assembly over (stage 2). So
// this file registers one: an edit-plan turn whose prompt opens with the
// heading the recalibrate cassettes are keyed to, and whose settle hook is the
// real `parseEditPlan`. What it proves is the kernel's lifecycle, not
// recalibrate's prompt — that is recalibrate-route-e2e's job.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { CliError, runClaude } from "@/lib/claudeCli";
import { TextError } from "@/lib/text/errors";
import { reason } from "@/lib/text/router";
import { EDIT_PLAN_SCHEMA, parseEditPlan, type EditPlan } from "@/app/_phases/script/editPlan";
import { RENDERS } from "@/app/_phases/script/renders";
import { currentBootId, readTurn, sweepTurns, writeTurn, type TurnRecord } from "@/lib/turns/ledger";
import { registerTurnKind, TurnInputError, whenIdle, type TurnSpec } from "@/lib/turns/runner";
import { POST as startPOST } from "@/app/api/turns/route";
import { GET as turnGET } from "@/app/api/turns/[id]/route";
import { POST as cancelPOST } from "@/app/api/turns/[id]/cancel/route";

import { FAKE_ENGINE_ENV, keepEnv, loadCassette, withFakeEngine, type Cassette, type FakeCall } from "./_helpers";

keepEnv([
  ...FAKE_ENGINE_ENV,
  "TEXT_TURN_DIR",
  "TEXT_ENV",
  "LOCAL_BINARIES",
  "GOOGLE_AI_API_KEY",
  "NEXT_PUBLIC_DEV_AUTH",
  "LIGHTTRACK_DISABLE",
]);

let dir = "";
test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "gravitone-turns-"));
  process.env.TEXT_TURN_DIR = dir;
  process.env.NEXT_PUBLIC_DEV_AUTH = "1";
  process.env.TEXT_ENV = "local";
  process.env.LOCAL_BINARIES = "on";
  // No cloud key: a cancelled local turn must not "descend" to a metered rung.
  delete process.env.GOOGLE_AI_API_KEY;
  process.env.LIGHTTRACK_DISABLE = "1";
});
test.afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = "";
});

/* ── the probe's turn kind ────────────────────────────────────────────────── */

const KIND = "probe-edit-plan";
/** A line of creator text that must never land in a turn record on disk. */
const SENTINEL = "the creator's unpublished note, which no record on disk may carry verbatim";

/** Held by a test to park the settle hook AFTER the engine answered — the only
 *  deterministic way to put a cancel between "the engine resolved" and "the
 *  record settled", which is the window a late resolve could overwrite in. */
let settleGate: { entered: () => void; release: Promise<void> } | null = null;

const SPEC: TurnSpec<{ note: string }, EditPlan> = {
  kind: KIND,
  turn: "edit-plan",
  serialised: true,
  async prepare(input) {
    const note = (input as { note?: unknown } | null)?.note;
    if (typeof note !== "string" || !note) throw new TurnInputError("input.note is required.");
    return { prompt: `# RECALIBRATE-PROMPT\n\n${note}\n`, schema: EDIT_PLAN_SCHEMA, input: { note } };
  },
  async settle(result) {
    if (settleGate) {
      settleGate.entered();
      await settleGate.release;
    }
    return parseEditPlan(result.text, { renders: RENDERS });
  },
};

let unregister: (() => void) | null = null;
test.beforeAll(() => {
  unregister = registerTurnKind(SPEC as TurnSpec);
});
test.afterAll(() => {
  unregister?.();
});

/* ── helpers ──────────────────────────────────────────────────────────────── */

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** Up to three seconds for a tree to go; taskkill walks one in well under. */
async function stillAliveAfterKill(pid: number): Promise<boolean> {
  for (let i = 0; i < 60; i++) {
    if (!alive(pid)) return false;
    await wait(50);
  }
  return alive(pid);
}

/** The recalibrate-ok cassette, answering slowly — long enough to be cancelled. */
function slow(ms: number): Cassette {
  const c = loadCassette("recalibrate-ok");
  return { ...c, name: `recalibrate-ok-slow-${ms}`, turns: c.turns.map((t) => ({ ...t, mode: "slow" as const, slowMs: ms })) };
}

/** The engine-door cassette with one slow turn, for runClaude directly. */
function slowDoor(ms: number): Cassette {
  const c = loadCassette("engine-door");
  const ok = c.turns[0]!;
  return { ...c, name: `engine-door-slow-${ms}`, turns: [{ ...ok, match: { heading: "# DOOR slow" }, mode: "slow", slowMs: ms }] };
}

let ip = 0;
const headers = () => ({ "content-type": "application/json", "x-forwarded-for": `10.88.0.${(++ip % 250) + 1}` });

async function start(body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await startPOST(new Request("http://localhost/api/turns", { method: "POST", headers: headers(), body: JSON.stringify(body) }));
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

async function get(id: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await turnGET(new Request(`http://localhost/api/turns/${id}`, { headers: headers() }), {
    params: Promise.resolve({ id }),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

async function cancel(id: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await cancelPOST(new Request(`http://localhost/api/turns/${id}/cancel`, { method: "POST", headers: headers() }), {
    params: Promise.resolve({ id }),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

/** `withFakeEngine`, and no run of this process outlives it: a turn still in
 *  flight when PATH is restored would spawn whatever `claude` resolves to next
 *  — on this machine, possibly a real and logged-in one. */
function withEngine<T>(
  cassette: string | Cassette,
  fn: (engine: { calls: () => FakeCall[]; turns: () => FakeCall[] }) => Promise<T>,
): Promise<T> {
  return withFakeEngine(cassette, async (engine) => {
    try {
      return await fn(engine);
    } finally {
      await whenIdle();
    }
  });
}

/** Poll the GET route until the record reaches one of `statuses`. */
async function until(id: string, statuses: string[], ms = 15_000): Promise<Record<string, unknown>> {
  const t0 = Date.now();
  let last: Record<string, unknown> = {};
  while (Date.now() - t0 < ms) {
    const r = await get(id);
    last = r.json;
    if (r.status === 200 && statuses.includes(String((r.json.turn as TurnRecord | undefined)?.status))) return r.json.turn as Record<string, unknown>;
    await wait(50);
  }
  throw new Error(`turn ${id} never reached ${statuses.join("|")}; last: ${JSON.stringify(last).slice(0, 300)}`);
}

/** Wait for the stand-in to have read its prompt and recorded its pid. */
async function enginePid(engine: { turns: () => FakeCall[] }, n = 1): Promise<number> {
  for (let i = 0; i < 200; i++) {
    const t = engine.turns();
    if (t.length >= n && typeof t[n - 1]!.pid === "number") return t[n - 1]!.pid!;
    await wait(25);
  }
  throw new Error("the stand-in never recorded a turn - the engine was not reached");
}

/* ── 4. the signal reaches the process tree ───────────────────────────────── */

test("runClaude: an aborted signal rejects `cancelled` and the engine's process tree is dead", async () => {
  await withEngine(slowDoor(20_000), async (engine) => {
    const ac = new AbortController();
    const t0 = Date.now();
    const run = runClaude("# DOOR slow\n", { signal: ac.signal }).then(
      () => null,
      (e: unknown) => e,
    );
    const pid = await enginePid(engine);
    expect(alive(pid), "the stand-in should be running before the abort").toBe(true);
    ac.abort();
    const err = await run;
    const ms = Date.now() - t0;
    const still = await stillAliveAfterKill(pid);
    console.log(`[turns] runClaude abort -> ${err instanceof CliError ? err.kind : String(err)} in ${ms}ms, enginePid=${pid} alive=${still}`);
    expect(err, "runClaude resolved although its signal was aborted").toBeInstanceOf(CliError);
    expect((err as CliError).kind).toBe("cancelled");
    expect(ms, "the rejection waited for the engine instead of the signal").toBeLessThan(10_000);
    expect(still, "the abort left the engine running - killTree did not reach the bottom of the tree").toBe(false);
  });
});

test("runClaude: a signal already aborted spawns nothing", async () => {
  await withEngine(slowDoor(20_000), async (engine) => {
    const ac = new AbortController();
    ac.abort();
    const err = await runClaude("# DOOR slow\n", { signal: ac.signal }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(CliError);
    expect((err as CliError).kind).toBe("cancelled");
    expect(engine.turns(), "a cancelled turn still reached the engine").toHaveLength(0);
  });
});

test("reason(): a cancelled turn is `cancelled`, and it does not descend the ladder", async () => {
  // A key for the cloud rung is PRESENT here on purpose: if `cancelled` were
  // reroutable the router would walk on to it and spend on the second engine.
  process.env.GOOGLE_AI_API_KEY = "probe-key-never-sent";
  const fetched: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (u: unknown) => {
    fetched.push(String(u));
    throw new Error("the cloud rung was reached");
  }) as typeof fetch;
  try {
    await withEngine(slowDoor(20_000), async (engine) => {
      const ac = new AbortController();
      const run = reason({ prompt: "# DOOR slow\n", turn: "edit-plan", signal: ac.signal }).then(
        () => null,
        (e: unknown) => e,
      );
      const pid = await enginePid(engine);
      ac.abort();
      const err = await run;
      expect(err).toBeInstanceOf(TextError);
      expect((err as TextError).kind).toBe("cancelled");
      expect((err as TextError).dispatched, "the process was started - the seat may have been charged").toBe(true);
      expect(fetched, "a cancelled turn walked on to the metered rung").toEqual([]);
      expect(await stillAliveAfterKill(pid)).toBe(false);
    });
  } finally {
    globalThis.fetch = realFetch;
  }
});

/* ── 1. accept, run, settle — the record is the result ────────────────────── */

test("POST /api/turns: 202 {turnId}; GET reads running, then done with the plan and the receipt", async () => {
  const cassette = slow(1_500);
  const paid = cassette.turns[0]!.envelope!.total_cost_usd;
  await withEngine(cassette, async (engine) => {
    const out = await start({ kind: KIND, projectId: "p-ledger-1", input: { note: SENTINEL } });
    console.log(`[turns] start -> ${out.status} ${JSON.stringify(out.json)}`);
    expect(out.status, String(out.json.detail)).toBe(202);
    const turnId = String(out.json.turnId);
    expect(turnId).toMatch(/^tn-[0-9a-f]{12}$/);

    const running = await until(turnId, ["running"]);
    expect(running.kind).toBe(KIND);
    expect(running.projectId).toBe("p-ledger-1");
    expect(running.bootId).toBe(currentBootId());

    const done = (await until(turnId, ["done", "failed"])) as unknown as TurnRecord;
    console.log(`[turns] settled -> ${done.status} cost=${done.receipt?.costUsd} rung=${done.receipt?.rung}`);
    expect(done.status, JSON.stringify(done.error)).toBe("done");
    expect((done.result as EditPlan).edits).toHaveLength(1);
    expect(done.receipt?.costUsd).toBe(paid);
    expect(done.receipt?.rung).toBe("preferred");
    expect(done.receipt?.transport).toBe("local-subprocess");
    expect(done.endedAt).toBeTruthy();
    expect(engine.turns(), "one prompt reached the engine").toHaveLength(1);

    // The record keeps the prompt's digest and size, never its text
    // (lib/text/log.ts's rule, and text-engine-A's: a durable record keys on a digest).
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(files, "one record per turn").toEqual([`${turnId}.json`]);
    const raw = readFileSync(join(dir, files[0]!), "utf8");
    expect(done.promptDigest).toMatch(/^[0-9a-f]{64}$/);
    // The size of the prompt the KIND built; the engine saw that plus the
    // schema instruction the router appends, which the receipt reports.
    expect(done.promptChars).toBe(`# RECALIBRATE-PROMPT\n\n${SENTINEL}\n`.length);
    expect(done.receipt?.promptChars).toBe(engine.turns()[0]!.promptChars);
    expect(raw.includes(SENTINEL.slice(0, 40)), "the record on disk carries the prompt's text").toBe(false);
  });
});

test("POST /api/turns: a bad body is refused before anything is written", async () => {
  const noKind = await start({});
  expect(noKind.status).toBe(400);
  const unknownKind = await start({ kind: "no-such-kind", projectId: "p-x", input: {} });
  expect(unknownKind.status).toBe(400);
  expect(String(unknownKind.json.detail)).toMatch(/no-such-kind/);
  const badInput = await start({ kind: KIND, projectId: "p-x", input: {} });
  expect(badInput.status).toBe(400);
  expect(String(badInput.json.detail)).toMatch(/input\.note/);
  expect(readdirSync(dir), "a refused request left a record behind").toEqual([]);
});

/* ── 2. one serialised turn per project and kind ──────────────────────────── */

test("POST /api/turns: a second turn for the same project and serialised kind is a 409 naming the holder", async () => {
  await withEngine(slow(20_000), async (engine) => {
    const first = await start({ kind: KIND, projectId: "p-ledger-2", input: { note: "first" } });
    expect(first.status).toBe(202);
    const holder = String(first.json.turnId);
    await until(holder, ["running"]);

    const second = await start({ kind: KIND, projectId: "p-ledger-2", input: { note: "second" } });
    console.log(`[turns] second -> ${second.status} ${JSON.stringify(second.json)}`);
    expect(second.status).toBe(409);
    expect(second.json.holder).toBe(holder);

    // Another project is a different slot.
    const other = await start({ kind: KIND, projectId: "p-ledger-2b", input: { note: "other" } });
    expect(other.status).toBe(202);
    // Both engines are up — two slots, two processes — before either is stopped.
    await enginePid(engine, 2);

    for (const id of [holder, String(other.json.turnId)]) {
      expect((await cancel(id)).status).toBe(200);
      await until(id, ["cancelled"]);
    }
    await whenIdle();
    for (const t of engine.turns()) expect(await stillAliveAfterKill(t.pid!)).toBe(false);
  });
});

/* ── 3. cancel kills the tree, and a late resolve cannot overwrite it ──────── */

test("POST /api/turns/[id]/cancel: the engine's process tree is dead and the record says cancelled", async () => {
  await withEngine(slow(20_000), async (engine) => {
    const out = await start({ kind: KIND, projectId: "p-ledger-3", input: { note: "cancel me" } });
    expect(out.status).toBe(202);
    const id = String(out.json.turnId);
    await until(id, ["running"]);
    const pid = await enginePid(engine);
    expect(alive(pid)).toBe(true);

    const c = await cancel(id);
    console.log(`[turns] cancel -> ${c.status} ${JSON.stringify(c.json).slice(0, 200)}`);
    expect(c.status).toBe(200);
    expect((c.json.turn as TurnRecord).status).toBe("cancelled");
    expect(await stillAliveAfterKill(pid), "cancel left the engine running").toBe(false);

    const final = (await until(id, ["cancelled", "done", "failed"])) as unknown as TurnRecord;
    expect(final.status).toBe("cancelled");
    expect(final.result).toBeUndefined();

    // The slot is free again once the turn is over.
    const again = await start({ kind: KIND, projectId: "p-ledger-3", input: { note: "again" } });
    expect(again.status).toBe(202);
    expect((await cancel(String(again.json.turnId))).status).toBe(200);
    await until(String(again.json.turnId), ["cancelled"]);
  });
});

test("cancel: an engine answer that lands after the cancel does not overwrite it", async () => {
  let entered!: () => void;
  const inSettle = new Promise<void>((r) => (entered = r));
  let release!: () => void;
  settleGate = { entered, release: new Promise<void>((r) => (release = r)) };
  try {
    await withEngine("recalibrate-ok", async () => {
      const out = await start({ kind: KIND, projectId: "p-ledger-4", input: { note: "late" } });
      expect(out.status).toBe(202);
      const id = String(out.json.turnId);
      // The engine has ANSWERED: the run is inside its settle hook.
      await inSettle;
      const c = await cancel(id);
      expect(c.status).toBe(200);
      release();
      // Give the settle every chance to write over the cancel.
      await wait(300);
      const final = (await until(id, ["cancelled", "done", "failed"])) as unknown as TurnRecord;
      console.log(`[turns] late resolve -> ${final.status}`);
      expect(final.status, "a late resolve overwrote the cancel").toBe("cancelled");
      expect(final.result).toBeUndefined();
    });
  } finally {
    settleGate = null;
  }
});

test("cancel: an unknown id is a 404 and a settled turn is a 409", async () => {
  expect((await cancel("tn-000000000000")).status).toBe(404);
  expect((await cancel("../../etc")).status).toBe(400);
  await withEngine("recalibrate-ok", async () => {
    const out = await start({ kind: KIND, projectId: "p-ledger-5", input: { note: "quick" } });
    const id = String(out.json.turnId);
    await until(id, ["done"]);
    const c = await cancel(id);
    expect(c.status).toBe(409);
    expect((c.json.turn as TurnRecord).status).toBe("done");
  });
});

/* ── 5. the boot sweep ────────────────────────────────────────────────────── */

/** A pid that existed and has exited — a foreign boot's dead server. */
async function deadPid(): Promise<number> {
  const child = spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
  await new Promise<void>((r) => child.on("exit", () => r()));
  expect(alive(child.pid!)).toBe(false);
  return child.pid!;
}

function foreign(id: string, projectId: string, pid: number): TurnRecord {
  const at = new Date(Date.now() - 60_000).toISOString();
  return {
    v: 1,
    id,
    kind: KIND,
    turn: "edit-plan",
    projectId,
    slot: `${projectId}:${KIND}`,
    status: "running",
    bootId: "b-foreign-boot",
    pid,
    host: "probe-host",
    startedAt: at,
    updatedAt: at,
    promptDigest: "0".repeat(64),
    promptChars: 1,
  };
}

test("sweep: a running record from a foreign boot whose server is gone becomes orphaned, and its slot is free", async () => {
  const dead = await deadPid();
  await writeTurn({ ...foreign("tn-0000000000a1", "p-ledger-6", dead), host: undefined });
  // Before the sweep the record holds its slot — the ledger, not memory, is the truth.
  const swept = await sweepTurns();
  console.log(`[turns] sweep -> ${JSON.stringify(swept)}`);
  expect(swept.orphaned).toEqual(["tn-0000000000a1"]);
  const rec = await readTurn("tn-0000000000a1");
  expect(rec?.status).toBe("orphaned");
  expect(rec?.endedAt).toBeTruthy();
  expect(rec?.error?.kind).toBe("orphaned");

  await withEngine("recalibrate-ok", async () => {
    const out = await start({ kind: KIND, projectId: "p-ledger-6", input: { note: "after the sweep" } });
    expect(out.status, JSON.stringify(out.json)).toBe(202);
    await until(String(out.json.turnId), ["done"]);
  });
});

test("sweep: a foreign boot whose server is STILL ALIVE on this host keeps its turn and its slot", async () => {
  // Two servers on one checkout (`next dev` and the cx capture server on :3007)
  // share foundry-out/. The second to boot must not orphan the first's live turn.
  const { hostname } = await import("node:os");
  await writeTurn({ ...foreign("tn-0000000000b2", "p-ledger-7", process.ppid), host: hostname() });
  const swept = await sweepTurns();
  expect(swept.orphaned).toEqual([]);
  expect((await readTurn("tn-0000000000b2"))?.status).toBe("running");
  const blocked = await start({ kind: KIND, projectId: "p-ledger-7", input: { note: "blocked" } });
  expect(blocked.status).toBe(409);
  expect(blocked.json.holder).toBe("tn-0000000000b2");
  // And it cannot be cancelled from here: this process holds no handle on it.
  expect((await cancel("tn-0000000000b2")).status).toBe(409);
});

test("sweep: the routes run it on first touch of a turn directory", async () => {
  const dead = await deadPid();
  await writeTurn({ ...foreign("tn-0000000000c3", "p-ledger-8", dead), host: undefined });
  const r = await get("tn-0000000000c3");
  expect(r.status).toBe(200);
  expect((r.json.turn as TurnRecord).status).toBe("orphaned");
});

test("GET /api/turns/[id]: an unknown id is a 404, a malformed one a 400", async () => {
  expect((await get("tn-ffffffffffff")).status).toBe(404);
  expect((await get("..%2F..%2Fsecret")).status).toBe(400);
});
