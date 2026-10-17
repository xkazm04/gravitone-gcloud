// LANE — RECALIBRATE RUNS ON THE TURN LEDGER (dynamic, AIO-A stage 2).
//
// WHAT WAS WRONG. A recalibration was one held-open `fetch` inside the Script
// step's hook. Leaving the step aborted it — and the abort stopped at the
// fetch: the `claude` process ran on, on the operator's seat, for an answer no
// listener would receive. A reload lost the run outright, and the bell's only
// record was one tab's localStorage row.
//
// WHAT THIS PROBE DRIVES. The `recalibrate` turn kind (lib/turns/kinds/
// recalibrate.ts) on the real runner (startTurn / readTurn / cancelTurn) and the
// real `reason()`; `withFakeEngine` (CIP-A) puts the stand-in `claude` first on
// PATH. Nothing in the app is mocked. Until Phase 6 L70 it went through the
// browser's client door (lib/turns/client.ts) and the HTTP routes
// (/api/recalibrate, /api/turns, its cancel); those retired with the v1 pages, and
// the script producer (lib/producers/script.ts) runs the kind in process. DROPPED
// with them: the `?wait=1` body, the 202/409 statuses, the access header on every
// request and the client's re-attach (`resumeTurn`, case 7). KEPT: the plan and
// the receipt on the record, one live turn per project, a cancel that kills the
// tree, a turn that settles with nobody watching (the operator decision of
// 2026-10-06: leaving the step does not cancel), and the walk that no fetch of a
// retired route is left (acceptance 8, now with no door to exempt).
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { test, expect } from "@playwright/test";

import { RENDERS } from "@/lib/script/renders";
import type { EditPlan } from "@/lib/script/editPlan";
import { RECALIBRATE_SPEC } from "@/lib/turns/kinds/recalibrate";
import { listTurns, readTurn, type TurnRecord } from "@/lib/turns/ledger";
import { cancelTurn, startTurn, whenIdle, type TurnSpec } from "@/lib/turns/runner";

import { FAKE_ENGINE_ENV, keepEnv, loadCassette, stripComments, withFakeEngine, type Cassette, type FakeCall } from "./_helpers";

keepEnv([...FAKE_ENGINE_ENV, "TEXT_TURN_DIR", "TEXT_ENV", "LOCAL_BINARIES", "GOOGLE_AI_API_KEY", "LIGHTTRACK_DISABLE"]);

let dir = "";
test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "gravitone-turn-recal-"));
  process.env.TEXT_TURN_DIR = dir;
  process.env.TEXT_ENV = "local";
  process.env.LOCAL_BINARIES = "on";
  delete process.env.GOOGLE_AI_API_KEY;
  process.env.LIGHTTRACK_DISABLE = "1";
});
test.afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = "";
});

/* ── helpers ──────────────────────────────────────────────────────────────── */

const NOTE = { kind: "less-focus", cardId: "f-macro-cause" };
const BODY = { notebook: {}, renders: RENDERS, scope: {}, notes: [NOTE] };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
async function stillAliveAfterKill(pid: number): Promise<boolean> {
  for (let i = 0; i < 60; i++) {
    if (!alive(pid)) return false;
    await wait(50);
  }
  return alive(pid);
}

function slow(ms: number): Cassette {
  const c = loadCassette("recalibrate-ok");
  return { ...c, name: `recalibrate-ok-slow-${ms}`, turns: c.turns.map((t) => ({ ...t, mode: "slow" as const, slowMs: ms })) };
}

/** No run of this process may outlive the fake engine (see turn-ledger). */
function withEngine<T>(cassette: string | Cassette, fn: (engine: { turns: () => FakeCall[] }) => Promise<T>): Promise<T> {
  return withFakeEngine(cassette, async (engine) => {
    try {
      return await fn(engine);
    } finally {
      await whenIdle();
    }
  });
}

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

async function enginePid(engine: { turns: () => FakeCall[] }): Promise<number> {
  for (let i = 0; i < 200; i++) {
    const t = engine.turns();
    if (t.length && typeof t[0]!.pid === "number") return t[0]!.pid!;
    await wait(25);
  }
  throw new Error("the stand-in never recorded a turn - the engine was not reached");
}

type Started = { outcome: "started"; turnId: string } | { outcome: "busy"; holder: string };

/** The runner's answer to a start of the recalibrate kind. */
async function start(projectId: string): Promise<Started> {
  const out = await startTurn(RECALIBRATE_SPEC as TurnSpec, projectId, BODY);
  return out.ok ? { outcome: "started", turnId: out.turnId } : { outcome: "busy", holder: out.holder.id };
}

async function startRecalibrate(projectId: string): Promise<string> {
  const out = await start(projectId);
  if (out.outcome !== "started") throw new Error(`the turn did not start: ${JSON.stringify(out)}`);
  return out.turnId;
}

/* ── start → done ─────────────────────────────────────────────────────────── */

test("a recalibrate turn starts; it reaches done with the plan and the receipt", async () => {
  const cassette = slow(800);
  const paid = cassette.turns[0]!.envelope!.total_cost_usd;
  await withEngine(cassette, async (engine) => {
    const turnId = await startRecalibrate("p-recal-1");
    expect(turnId).toMatch(/^tn-[0-9a-f]{12}$/);

    const done = await until(turnId, ["done", "failed"]);
    console.log(`[turn-recal] settled -> ${done.status} cost=${done.receipt?.costUsd}`);
    expect(done.status, JSON.stringify(done.error)).toBe("done");
    expect(done.kind).toBe("recalibrate");
    expect(done.projectId).toBe("p-recal-1");
    const result = done.result as { plan: EditPlan; manifest: { renders?: { sent: string[] } }; engine: Record<string, unknown> };
    expect(result.plan.edits).toHaveLength(1);
    expect(result.manifest.renders?.sent).toEqual(["adjudication"]);
    // The `engine` block, kept on the record so a caller stages the same receipt.
    expect(result.engine.kind).toBe("local-claude-code");
    expect(result.engine.costUsd).toBe(paid);
    expect(done.receipt?.costUsd).toBe(paid);
    expect(done.receipt?.rung).toBe("preferred");
    expect(engine.turns(), "one prompt reached the engine").toHaveLength(1);
  });
});

test("a second start for the same project while one runs is refused, naming the holder", async () => {
  await withEngine(slow(20_000), async (engine) => {
    const holder = await startRecalibrate("p-recal-2");
    await until(holder, ["running"]);

    expect(await start("p-recal-2")).toEqual({ outcome: "busy", holder });
    expect(engine.turns().length, "the refused second run reached the engine").toBeLessThanOrEqual(1);

    const pid = await enginePid(engine);
    expect((await cancelTurn(holder)).ok).toBe(true);
    await until(holder, ["cancelled"]);
    expect(await stillAliveAfterKill(pid)).toBe(false);
    expect(engine.turns(), "one engine for one slot").toHaveLength(1);
  });
});

test("cancel mid-run: the record says cancelled and the engine's process tree is dead", async () => {
  await withEngine(slow(20_000), async (engine) => {
    const turnId = await startRecalibrate("p-recal-3");
    await until(turnId, ["running"]);
    const pid = await enginePid(engine);
    expect(alive(pid)).toBe(true);

    const c = await cancelTurn(turnId);
    expect(c.ok).toBe(true);
    expect(await stillAliveAfterKill(pid), "cancel left the engine running").toBe(false);
    const final = await until(turnId, ["cancelled", "done", "failed"]);
    expect(final.status).toBe("cancelled");
    expect(final.result).toBeUndefined();
  });
});

/* ── 7. nobody watching: the turn settles, once, on the ledger ────────────── */

test("case 7: a turn nobody watches runs on to done; the ledger holds the plan once", async () => {
  await withEngine(slow(1_200), async (engine) => {
    const turnId = await startRecalibrate("p-recal-7");
    // Nothing is called while it runs - that is the decision - and the turn runs on.
    const done = await until(turnId, ["done", "cancelled", "failed"]);
    expect(done.status, "the turn did not survive nobody watching").toBe("done");
    expect(engine.turns()).toHaveLength(1);
    expect(((done.result as { plan: EditPlan }).plan).edits).toHaveLength(1);
    expect((await listTurns()).filter((t) => t.projectId === "p-recal-7").map((t) => t.id)).toEqual([turnId]);
  });
});

/* ── 8, scoped to turns: no fetch of a retired route ──────────────────────── */

test("acceptance 8: no fetch of /api/recalibrate, /api/research or /api/turns is left in app/, components/ or lib/", () => {
  const ROOT = process.cwd();
  const files: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx|mts)$/.test(e)) files.push(p);
    }
  };
  for (const top of ["app", "components", "lib"]) walk(join(ROOT, top));
  const RAW = /\bfetch\(\s*[`"'](\/api\/(?:recalibrate|research|turns)\b[^`"']*)/g;
  const hits: string[] = [];
  const walked: string[] = [];
  for (const f of files) {
    const rel = relative(ROOT, f).split("\\").join("/");
    walked.push(rel);
    const src = stripComments(readFileSync(f, "utf8"));
    for (const m of src.matchAll(RAW)) hits.push(`${rel}:${src.slice(0, m.index).split("\n").length} ${m[1]}`);
  }
  console.log(`[turn-recal] walked ${files.length} files; ${hits.length} fetches of a retired turn route`);
  // The walk must have read the tree, the research producer among it, and the
  // matcher must still see the shape it is for.
  expect(files.length).toBeGreaterThan(200);
  expect(walked, "the walk never reached the research producer").toContain("lib/producers/research.ts");
  expect([...'await fetch(`/api/research?x=${y}`)'.matchAll(RAW)].map((m) => m[1]!.split(/[?$]/)[0])).toEqual(["/api/research"]);
  expect(hits).toEqual([]);
});
