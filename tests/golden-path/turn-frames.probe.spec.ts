// LANE — SCENE DIRECTION RUNS ON THE TURN LEDGER (dynamic, AIO-A stage 3).
//
// WHAT WAS WRONG. Step 3's direction pass — the second-dearest turn in the app —
// was a plain `fetch("/api/frames")` held open inside useFrames. It never called
// `jobs.start`, so it never reached the bell; a reload lost it with no trace,
// and the `claude` process behind it ran on to its ceiling for an answer nobody
// would receive.
//
// WHAT THIS PROBE DRIVES. The `frames` turn kind (lib/turns/kinds/frames.ts) on the
// real runner (startTurn / readTurn / cancelTurn), the real `reason()`, and
// `withFakeEngine` (CIP-A) putting the stand-in `claude` first on PATH. Nothing in
// the app is mocked. Until Phase 6 L70 it went through the browser's client door
// (lib/turns/client.ts) and the HTTP routes (/api/frames, /api/turns, its cancel);
// those retired with the v1 pages, and the frames producer (lib/producers/frames.ts)
// runs the kind in process. DROPPED with them: the `?wait=1` body, the 202/409
// statuses, the access header on every request, the client's re-attach
// (`resumeTurn`) and HarnessBridge's ledger read (the bridge counts kernel Jobs
// now). KEPT: the record, the receipt, one live turn per project, a cancel that
// kills the tree, the kinds' refusal status (413 too large, 400 nothing to
// direct), the ledger count, and a walk that no fetch of a retired route is left.
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { test, expect } from "@playwright/test";

import { SCENE_SCHEMA } from "@/lib/frames/sceneSpec";
import { RENDERS } from "@/lib/script/renders";
import { jobCounts, type Job } from "@/lib/jobs";
import { FRAMES_SPEC } from "@/lib/turns/kinds/frames";
import { RECALIBRATE_SPEC } from "@/lib/turns/kinds/recalibrate";
import { listTurns, readTurn, type TurnRecord } from "@/lib/turns/ledger";
import { cancelTurn, startTurn, TurnInputError, whenIdle, type TurnSpec } from "@/lib/turns/runner";

import { FAKE_ENGINE_ENV, keepEnv, loadCassette, stripComments, withFakeEngine, type Cassette, type FakeCall } from "./_helpers";

keepEnv([...FAKE_ENGINE_ENV, "TEXT_TURN_DIR", "TEXT_ENV", "LOCAL_BINARIES", "GOOGLE_AI_API_KEY", "LIGHTTRACK_DISABLE"]);

let dir = "";
test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "gravitone-turn-frames-"));
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

const BEATS = [
  { at: "0:00", kind: "hook", text: "Bitcoin's four-year cycle broke the week the ETFs opened." },
  { at: "0:12", kind: "movement", text: "Inflows, not halvings, set the price for eighteen months." },
  { at: "0:31", kind: "claim", text: "The next drawdown is a liquidity event, not a miner event." },
];
const FACTS = [
  { id: "f-etf-inflows", claim: "Spot ETF net inflows over the first eighteen months." },
  { id: "f-halving-2024", claim: "The 2024 halving cut issuance to 3.125 BTC per block." },
];
const STYLE = { technique: "layered paper collage", palette: ["#0e1116", "#e8d9b0"], grain: "light" };
const RUN = { title: "The cycle that broke", schema: SCENE_SCHEMA, beats: BEATS, facts: FACTS, style: STYLE };

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
  const c = loadCassette("frames-ok");
  return { ...c, name: `frames-ok-slow-${ms}`, turns: c.turns.map((t) => ({ ...t, mode: "slow" as const, slowMs: ms })) };
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

/** The runner's answer to a start: a turn under way, the slot's holder, or the kind's
 *  refusal (thrown before any record exists), with its status and code. */
type Started =
  | { outcome: "started"; turnId: string }
  | { outcome: "busy"; holder: string }
  | { outcome: "refused"; status: number; code: string; detail: string };

async function start(spec: TurnSpec, projectId: string, input: unknown): Promise<Started> {
  try {
    const out = await startTurn(spec, projectId, input);
    return out.ok ? { outcome: "started", turnId: out.turnId } : { outcome: "busy", holder: out.holder.id };
  } catch (e) {
    if (e instanceof TurnInputError) return { outcome: "refused", status: e.status, code: e.code, detail: e.message };
    throw e;
  }
}

async function startFrames(projectId: string, input: unknown = RUN): Promise<string> {
  const out = await start(FRAMES_SPEC as TurnSpec, projectId, input);
  if (out.outcome !== "started") throw new Error(`the turn did not start: ${JSON.stringify(out)}`);
  return out.turnId;
}

const ofProject = async (projectId: string) => (await listTurns()).filter((t) => t.projectId === projectId);

/* ── start → done ─────────────────────────────────────────────────────────── */

test("a frames turn starts; it reaches done with raw, manifest and the receipt", async () => {
  const cassette = slow(800);
  const turn0 = cassette.turns[0]!;
  await withEngine(cassette, async (engine) => {
    const turnId = await startFrames("p-frames-1");
    expect(turnId).toMatch(/^tn-[0-9a-f]{12}$/);

    const done = await until(turnId, ["done", "failed"]);
    console.log(`[turn-frames] settled -> ${done.status} cost=${done.receipt?.costUsd}`);
    expect(done.status, JSON.stringify(done.error)).toBe("done");
    expect(done.kind).toBe("frames");
    expect(done.turn).toBe("scene-direction");
    expect(done.projectId).toBe("p-frames-1");
    const result = done.result as { raw: string; manifest: { totalChars: number }; engine: Record<string, unknown> };
    // `raw` is the engine's text, untouched: the caller owns the parse.
    expect(JSON.parse(result.raw)).toEqual(turn0.resultJson);
    expect(result.manifest.totalChars).toBe(done.promptChars);
    // The engine's receipt, kept on the record and in the result.
    expect(result.engine.kind).toBe("local-claude-code");
    expect(result.engine.costUsd).toBe(turn0.envelope!.total_cost_usd);
    expect(result.engine.durationMs).toBe(turn0.envelope!.duration_ms);
    expect(done.receipt?.costUsd).toBe(turn0.envelope!.total_cost_usd);
    expect(engine.turns(), "one prompt reached the engine").toHaveLength(1);
    expect(engine.turns()[0]!.schemaSha256, "the kind handed the router a schema").toBeNull();
  });
});

test("a second frames turn for the same project while one runs is refused, naming the holder", async () => {
  await withEngine(slow(20_000), async (engine) => {
    const holder = await startFrames("p-frames-2");
    await until(holder, ["running"]);

    expect(await start(FRAMES_SPEC as TurnSpec, "p-frames-2", RUN)).toEqual({ outcome: "busy", holder });

    const pid = await enginePid(engine);
    expect((await cancelTurn(holder)).ok).toBe(true);
    await until(holder, ["cancelled"]);
    expect(await stillAliveAfterKill(pid)).toBe(false);
    expect(engine.turns(), "one engine for one slot").toHaveLength(1);
  });
});

test("cancel mid-run: the record says cancelled and the engine's process tree is dead", async () => {
  await withEngine(slow(20_000), async (engine) => {
    const turnId = await startFrames("p-frames-3");
    await until(turnId, ["running"]);
    const pid = await enginePid(engine);
    expect(alive(pid)).toBe(true);

    expect((await cancelTurn(turnId)).ok).toBe(true);
    expect(await stillAliveAfterKill(pid), "cancel left the engine running").toBe(false);
    const final = await until(turnId, ["cancelled", "done", "failed"]);
    expect(final.status).toBe("cancelled");
    expect(final.result).toBeUndefined();
  });
});

/* ── nothing fetches a retired turn route ─────────────────────────────────── */

test("no fetch of /api/frames, /api/recalibrate or /api/turns is left in app/, components/ or lib/", () => {
  // The routes retired (Phase 6 L70); a fetch left behind would 404 at runtime with every
  // gate green. The matcher is the one that guarded the single client door.
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
  const RAW = /\bfetch\(\s*[`"'](\/api\/(?:frames|recalibrate|turns)\b[^`"']*)/g;
  const hits: string[] = [];
  for (const f of files) {
    const rel = relative(ROOT, f).split("\\").join("/");
    const src = stripComments(readFileSync(f, "utf8"));
    for (const m of src.matchAll(RAW)) hits.push(`${rel}:${src.slice(0, m.index).split("\n").length} ${m[1]}`);
  }
  expect(files.length).toBeGreaterThan(200);
  // The matcher still sees the shape it is for, or it is blind.
  expect([...'fetch("/api/turns?x=1")'.matchAll(RAW)].map((m) => m[1])).toEqual(["/api/turns?x=1"]);
  expect(hits).toEqual([]);
});

/* ── the harness reads the ledger ─────────────────────────────────────────── */

test("the job count over the ledger: a turn no tab is tracking is counted, once", async () => {
  await withEngine(slow(20_000), async () => {
    const turnId = await startFrames("p-frames-h");
    await until(turnId, ["running"]);

    const ledger = await ofProject("p-frames-h");
    expect(jobCounts([], ledger)).toEqual({ running: 1, total: 1 });

    // A server job the bell holds is counted beside the turn, not instead of it.
    const kernelJob: Job = { id: "job:run:local", projectId: "p-frames-h", kind: "image", label: "r", status: "done", startedAt: 1, endedAt: 2, href: "/projects/runs?job=job%3Arun%3Alocal", progress: 0, measured: false };
    expect(jobCounts([kernelJob], ledger)).toEqual({ running: 1, total: 2 });

    expect((await cancelTurn(turnId)).ok).toBe(true);
    await until(turnId, ["cancelled"]);
    // The ledger says it no longer runs.
    expect(jobCounts([], await ofProject("p-frames-h"))).toEqual({ running: 0, total: 1 });
  });
});

/* ── a kind's refusal keeps its status ────────────────────────────────────── */

test("a too-large run is refused 413 `too-large` by both kinds; an input error that is not a size stays 400", async () => {
  await withEngine("frames-ok", async (engine) => {
    // Recalibrate: material past the character ceiling.
    const notes = [{ kind: "less-focus", cardId: "f-macro-cause", text: "x".repeat(1_100_000) }];
    const big = await start(RECALIBRATE_SPEC as TurnSpec, "p-refusal", { notebook: {}, renders: RENDERS, scope: {}, notes });
    expect(big).toMatchObject({ outcome: "refused", status: 413, code: "too-large" });

    // Frames: 401 beats.
    const beats = Array.from({ length: 401 }, (_, i) => ({ at: `${i}`, text: `beat ${i}` }));
    expect(await start(FRAMES_SPEC as TurnSpec, "p-refusal", { ...RUN, beats })).toMatchObject({ outcome: "refused", status: 413, code: "too-large" });

    // And an input error that is not a size is still the 400 it always was.
    expect(await start(RECALIBRATE_SPEC as TurnSpec, "p-refusal", { notebook: {}, renders: RENDERS, scope: {}, notes: [] })).toMatchObject({ outcome: "refused", status: 400 });
    expect(await start(FRAMES_SPEC as TurnSpec, "p-refusal", { ...RUN, style: undefined })).toMatchObject({ outcome: "refused", status: 400 });
    expect(engine.turns(), "a refused run reached the engine").toHaveLength(0);
    expect(readdirSync(dir), "a refused run wrote a record").toEqual([]);
  });
});
