// LANE — AI TURNS ARE SERVER-OWNED RECORDS, AND CANCEL ENDS THE ENGINE (dynamic, AIO-A stage 1).
//
// WHAT WAS WRONG. A minutes-long paid turn was one held-open request. Its only
// record was a localStorage row in one tab (lib/jobs.tsx, `gravitone.jobs.v1`),
// a reload rewrote it `interrupted`, and the Abort the client sent stopped at
// the fetch: `runClaude(prompt, timeoutMs)` took no signal, the text provider
// passed none and `reason()` had none to pass, so the `claude` process ran on
// to its 600s ceiling, on the operator's seat, for an answer nobody received.
//
// WHAT THIS PROBE DRIVES. Nothing inside the app is mocked. The runner is driven
// directly (startTurn / readTurn / cancelTurn): the HTTP doors over it
// (/api/turns, /api/turns/[id], .../cancel) retired with the v1 pages in Phase 6
// L70, and their status codes with them. The runner calls the real `reason()`, the router walks
// its real ladder and lib/claudeCli.ts spawns "claude" through its real shell
// setting — which `withFakeEngine` (CIP-A) resolves to a stand-in that replays a
// cassette. The stand-in records its own pid, which is how a cancel is checked
// the way cli-kill-tree checks a timeout: the process at the bottom of the tree
// is asked whether it is still alive.
//
// THE TURN KIND IS THE PROBE'S OWN. Stage 1 is the kernel; no production kind is
// registered on it until /api/recalibrate hands its assembly over (stage 2). So
// this file defines one: an edit-plan turn whose prompt opens with the
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
import { EDIT_PLAN_SCHEMA, parseEditPlan, type EditPlan } from "@/lib/script/editPlan";
import { RENDERS } from "@/lib/script/renders";
import { currentBootId, readTurn, sweepTurns, TurnIdError, writeTurn, type TurnRecord } from "@/lib/turns/ledger";
import { cancelTurn, startTurn, TurnInputError, whenIdle, type TurnSpec } from "@/lib/turns/runner";

import { FAKE_ENGINE_ENV, keepEnv, loadCassette, withFakeEngine, type Cassette, type FakeCall } from "./_helpers";

keepEnv([
  ...FAKE_ENGINE_ENV,
  "TEXT_TURN_DIR",
  "TEXT_ENV",
  "LOCAL_BINARIES",
  "GOOGLE_AI_API_KEY",
  "LIGHTTRACK_DISABLE",
]);

let dir = "";
test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "gravitone-turns-"));
  process.env.TEXT_TURN_DIR = dir;
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

/** The runner's answer to a start on the probe's kind: a turn under way, the slot's holder,
 *  or the kind's refusal (thrown before any record exists). */
type Started =
  | { outcome: "started"; turnId: string }
  | { outcome: "busy"; holder: string }
  | { outcome: "refused"; status: number; detail: string };

async function start(projectId: string, input: unknown): Promise<Started> {
  try {
    const out = await startTurn(SPEC as TurnSpec, projectId, input);
    return out.ok ? { outcome: "started", turnId: out.turnId } : { outcome: "busy", holder: out.holder.id };
  } catch (e) {
    if (e instanceof TurnInputError) return { outcome: "refused", status: e.status, detail: e.message };
    throw e;
  }
}

function idOf(s: Started): string {
  if (s.outcome !== "started") throw new Error(`the turn did not start: ${JSON.stringify(s)}`);
  return s.turnId;
}

const cancel = (id: string) => cancelTurn(id);

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

/** Poll the ledger until the record reaches one of `statuses`. */
async function until(id: string, statuses: string[], ms = 15_000): Promise<TurnRecord> {
  const t0 = Date.now();
  let last: TurnRecord | null = null;
  while (Date.now() - t0 < ms) {
    last = await readTurn(id);
    if (last && statuses.includes(last.status)) return last;
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

test("start: a turn id; the record reads running, then done with the plan and the receipt", async () => {
  const cassette = slow(1_500);
  const paid = cassette.turns[0]!.envelope!.total_cost_usd;
  await withEngine(cassette, async (engine) => {
    const turnId = idOf(await start("p-ledger-1", { note: SENTINEL }));
    expect(turnId).toMatch(/^tn-[0-9a-f]{12}$/);

    const running = await until(turnId, ["running"]);
    expect(running.kind).toBe(KIND);
    expect(running.projectId).toBe("p-ledger-1");
    expect(running.bootId).toBe(currentBootId());

    const done = await until(turnId, ["done", "failed"]);
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

test("start: a bad input is refused before anything is written", async () => {
  const badInput = await start("p-x", {});
  expect(badInput).toMatchObject({ outcome: "refused", status: 400 });
  expect(badInput.outcome === "refused" ? badInput.detail : "").toMatch(/input\.note/);
  expect(await start("p-x", null)).toMatchObject({ outcome: "refused", status: 400 });
  expect(readdirSync(dir), "a refused request left a record behind").toEqual([]);
});

/* ── 2. one serialised turn per project and kind ──────────────────────────── */

test("start: a second turn for the same project and serialised kind is refused, naming the holder", async () => {
  await withEngine(slow(20_000), async (engine) => {
    const holder = idOf(await start("p-ledger-2", { note: "first" }));
    await until(holder, ["running"]);

    expect(await start("p-ledger-2", { note: "second" })).toEqual({ outcome: "busy", holder });

    // Another project is a different slot.
    const other = idOf(await start("p-ledger-2b", { note: "other" }));
    // Both engines are up — two slots, two processes — before either is stopped.
    await enginePid(engine, 2);

    for (const id of [holder, other]) {
      expect((await cancel(id)).ok).toBe(true);
      await until(id, ["cancelled"]);
    }
    await whenIdle();
    for (const t of engine.turns()) expect(await stillAliveAfterKill(t.pid!)).toBe(false);
  });
});

/* ── 3. cancel kills the tree, and a late resolve cannot overwrite it ──────── */

test("cancel: the engine's process tree is dead and the record says cancelled", async () => {
  await withEngine(slow(20_000), async (engine) => {
    const id = idOf(await start("p-ledger-3", { note: "cancel me" }));
    await until(id, ["running"]);
    const pid = await enginePid(engine);
    expect(alive(pid)).toBe(true);

    const c = await cancel(id);
    expect(c.ok).toBe(true);
    expect(c.ok && c.record.status).toBe("cancelled");
    expect(await stillAliveAfterKill(pid), "cancel left the engine running").toBe(false);

    const final = await until(id, ["cancelled", "done", "failed"]);
    expect(final.status).toBe("cancelled");
    expect(final.result).toBeUndefined();

    // The slot is free again once the turn is over.
    const again = idOf(await start("p-ledger-3", { note: "again" }));
    expect((await cancel(again)).ok).toBe(true);
    await until(again, ["cancelled"]);
  });
});

test("cancel: an engine answer that lands after the cancel does not overwrite it", async () => {
  let entered!: () => void;
  const inSettle = new Promise<void>((r) => (entered = r));
  let release!: () => void;
  settleGate = { entered, release: new Promise<void>((r) => (release = r)) };
  try {
    await withEngine("recalibrate-ok", async () => {
      const id = idOf(await start("p-ledger-4", { note: "late" }));
      // The engine has ANSWERED: the run is inside its settle hook.
      await inSettle;
      const c = await cancel(id);
      expect(c.ok).toBe(true);
      release();
      // Give the settle every chance to write over the cancel.
      await wait(300);
      const final = await until(id, ["cancelled", "done", "failed"]);
      console.log(`[turns] late resolve -> ${final.status}`);
      expect(final.status, "a late resolve overwrote the cancel").toBe("cancelled");
      expect(final.result).toBeUndefined();
    });
  } finally {
    settleGate = null;
  }
});

test("cancel: an unknown id is not-found, a malformed one is refused, and a settled turn stays as it is", async () => {
  expect(await cancel("tn-000000000000")).toEqual({ ok: false, why: "not-found" });
  await expect(cancel("../../etc")).rejects.toBeInstanceOf(TurnIdError);
  await withEngine("recalibrate-ok", async () => {
    const id = idOf(await start("p-ledger-5", { note: "quick" }));
    await until(id, ["done"]);
    const c = await cancel(id);
    expect(c.ok).toBe(false);
    expect(!c.ok && c.why).toBe("settled");
    expect("record" in c ? c.record.status : null).toBe("done");
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
    await until(idOf(await start("p-ledger-6", { note: "after the sweep" })), ["done"]);
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
  expect(await start("p-ledger-7", { note: "blocked" })).toEqual({ outcome: "busy", holder: "tn-0000000000b2" });
  // And it cannot be cancelled from here: this process holds no handle on it.
  const c = await cancel("tn-0000000000b2");
  expect(!c.ok && c.why).toBe("not-here");
});

test("sweep: the runner runs it on first touch of a turn directory", async () => {
  const dead = await deadPid();
  await writeTurn({ ...foreign("tn-0000000000c3", "p-ledger-8", dead), host: undefined });
  // A cancel is a touch: the sweep settles the record before the cancel reads it.
  const c = await cancel("tn-0000000000c3");
  expect(!c.ok && c.why).toBe("settled");
  expect((await readTurn("tn-0000000000c3"))?.status).toBe("orphaned");
});

test("readTurn: an unknown id is null, a malformed one is refused before any path is built", async () => {
  expect(await readTurn("tn-ffffffffffff")).toBeNull();
  await expect(readTurn("../../secret")).rejects.toBeInstanceOf(TurnIdError);
});

