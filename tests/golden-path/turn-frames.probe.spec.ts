// LANE — SCENE DIRECTION RUNS ON THE TURN LEDGER, AND THE FRAMES STEP ONLY WATCHES IT (dynamic, AIO-A stage 3).
//
// WHAT WAS WRONG. Step 3's direction pass — the second-dearest turn in the app —
// was a plain `fetch("/api/frames")` held open inside useFrames. It never called
// `jobs.start`, so it never reached the bell; a reload lost it with no trace,
// and the `claude` process behind it ran on to its ceiling for an answer nobody
// would receive.
//
// WHAT THIS PROBE DRIVES. The same shape as turn-recalibrate: the client door
// (lib/turns/client.ts) is called as the browser calls it, a stand-in `fetch`
// hands each request to the REAL exported route handler, the handlers dispatch
// through the real runner and the real `reason()`, and `withFakeEngine` (CIP-A)
// puts the stand-in `claude` first on PATH. Nothing in the app is mocked.
//
// OPERATOR DECISION 2026-10-06 (the recalibrate one, applied to frames):
// leaving the step does not cancel; a reload re-attaches; an explicit stop
// kills the engine; a done direction is staged exactly once.
//
// ALSO HERE, because they are the same seam seen from two other sides: the
// harness's job count read from the ledger rather than one tab's memory, and
// the generic /api/turns door answering a kind's own refusal status (a
// too-large recalibrate is 413 there, as it is on /api/recalibrate).
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { test, expect } from "@playwright/test";

import { POST as framesPOST } from "@/app/api/frames/route";
import { POST as recalibratePOST } from "@/app/api/recalibrate/route";
import { GET as listGET, POST as turnsPOST } from "@/app/api/turns/route";
import { GET as turnGET } from "@/app/api/turns/[id]/route";
import { POST as cancelPOST } from "@/app/api/turns/[id]/cancel/route";
import { SCENE_SCHEMA } from "@/app/_phases/frames/sceneSpec";
import { RENDERS } from "@/app/_phases/script/renders";
import { jobCounts, pollTurns, trackTurn, turnEventsOf, turnJobsOf, EMPTY_TURNS, type Job, type TurnState } from "@/lib/jobs";
import { cancelTurn, getTurn, listTurns, resumeTurn, startFrames, type TurnRecord } from "@/lib/turns/client";
import { whenIdle } from "@/lib/turns/runner";

import { FAKE_ENGINE_ENV, keepEnv, loadCassette, stripComments, withFakeEngine, type Cassette, type FakeCall } from "./_helpers";

keepEnv([
  ...FAKE_ENGINE_ENV,
  "TEXT_TURN_DIR",
  "TEXT_ENV",
  "LOCAL_BINARIES",
  "GOOGLE_AI_API_KEY",
  "NEXT_PUBLIC_DEV_AUTH",
  "NEXT_PUBLIC_IMAGING_ACCESS_SECRET",
  "LIGHTTRACK_DISABLE",
]);

const SECRET = "probe-turn-frames-secret";

let dir = "";
test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "gravitone-turn-frames-"));
  process.env.TEXT_TURN_DIR = dir;
  process.env.NEXT_PUBLIC_DEV_AUTH = "1";
  process.env.NEXT_PUBLIC_IMAGING_ACCESS_SECRET = SECRET;
  process.env.TEXT_ENV = "local";
  process.env.LOCAL_BINARIES = "on";
  delete process.env.GOOGLE_AI_API_KEY;
  process.env.LIGHTTRACK_DISABLE = "1";
});
test.afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = "";
});

/* ── the browser's fetch, answered by the real handlers ───────────────────── */

const sent: { method: string; url: string; auth: string | null }[] = [];
let ip = 0;

async function route(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!raw.startsWith("/api/")) throw new Error(`the door fetched a non-relative URL: ${raw}`);
  const url = new URL(raw, "http://localhost");
  const headers = new Headers(init?.headers);
  headers.set("x-forwarded-for", `10.92.0.${(++ip % 250) + 1}`);
  const method = (init?.method ?? "GET").toUpperCase();
  sent.push({ method, url: url.pathname + url.search, auth: headers.get("authorization") });
  const req = new Request(url, { method, headers, body: init?.body ?? undefined });
  const p = url.pathname;
  let m: RegExpMatchArray | null;
  if (p === "/api/frames" && method === "POST") return framesPOST(req);
  if (p === "/api/turns" && method === "POST") return turnsPOST(req);
  if (p === "/api/turns" && method === "GET") return listGET(req);
  if ((m = p.match(/^\/api\/turns\/([^/]+)\/cancel$/)) && method === "POST")
    return cancelPOST(req, { params: Promise.resolve({ id: decodeURIComponent(m[1]!) }) });
  if ((m = p.match(/^\/api\/turns\/([^/]+)$/)) && method === "GET")
    return turnGET(req, { params: Promise.resolve({ id: decodeURIComponent(m[1]!) }) });
  throw new Error(`no handler for ${method} ${p}`);
}

const realFetch = globalThis.fetch;
test.beforeEach(() => {
  sent.length = 0;
  globalThis.fetch = route as typeof fetch;
});
test.afterEach(() => {
  globalThis.fetch = realFetch;
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
    last = await getTurn(id);
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

function everyRequestCarriedTheHeader() {
  expect(sent.length, "the door sent nothing").toBeGreaterThan(0);
  const bare = sent.filter((s) => s.auth !== `Bearer ${SECRET}`).map((s) => `${s.method} ${s.url}`);
  expect(bare, "a turn request went out without accessHeader()").toEqual([]);
}

/* ── start → 202 → done, through the door ─────────────────────────────────── */

test("POST /api/frames answers 202 {turnId}; the turn reaches done with raw, manifest and the receipt", async () => {
  const cassette = slow(800);
  const turn0 = cassette.turns[0]!;
  await withEngine(cassette, async (engine) => {
    const out = await startFrames("p-frames-1", RUN);
    console.log(`[turn-frames] start -> ${JSON.stringify(out)}`);
    expect(out.ok, JSON.stringify(out)).toBe(true);
    const turnId = (out as { turnId: string }).turnId;
    expect(turnId).toMatch(/^tn-[0-9a-f]{12}$/);

    const done = await until(turnId, ["done", "failed"]);
    console.log(`[turn-frames] settled -> ${done.status} cost=${done.receipt?.costUsd}`);
    expect(done.status, JSON.stringify(done.error)).toBe("done");
    expect(done.kind).toBe("frames");
    expect(done.turn).toBe("scene-direction");
    expect(done.projectId).toBe("p-frames-1");
    const result = done.result as { raw: string; manifest: { totalChars: number }; engine: Record<string, unknown> };
    // `raw` is the engine's text, untouched: the client owns the parse.
    expect(JSON.parse(result.raw)).toEqual(turn0.resultJson);
    expect(result.manifest.totalChars).toBe(done.promptChars);
    // The synchronous body's receipt, kept on the record.
    expect(result.engine.kind).toBe("local-claude-code");
    expect(result.engine.costUsd).toBe(turn0.envelope!.total_cost_usd);
    expect(result.engine.durationMs).toBe(turn0.envelope!.duration_ms);
    expect(done.receipt?.costUsd).toBe(turn0.envelope!.total_cost_usd);
    expect(engine.turns(), "one prompt reached the engine").toHaveLength(1);
    expect(engine.turns()[0]!.schemaSha256, "the kind handed the router a schema the route never did").toBeNull();
    everyRequestCarriedTheHeader();
  });
});

test("?wait=1 keeps the synchronous body for scripts", async () => {
  await withEngine("frames-ok", async () => {
    const res = await framesPOST(
      new Request("http://localhost/api/frames?wait=1", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "10.92.1.1" },
        body: JSON.stringify({ ...RUN, projectId: "p-frames-wait" }),
      }),
    );
    const json = (await res.json()) as Record<string, unknown>;
    expect(res.status, String(json.detail)).toBe(200);
    expect(typeof json.raw).toBe("string");
    expect((json.engine as Record<string, unknown>).kind).toBe("local-claude-code");
  });
});

test("the generic door starts a frames turn too", async () => {
  await withEngine("frames-ok", async () => {
    const res = await turnsPOST(
      new Request("http://localhost/api/turns?wait=1", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "10.92.1.2" },
        body: JSON.stringify({ kind: "frames", projectId: "p-frames-generic", input: RUN }),
      }),
    );
    const json = (await res.json()) as { turn?: TurnRecord; detail?: string };
    expect(res.status, String(json.detail)).toBe(200);
    expect(json.turn?.status).toBe("done");
    expect(typeof (json.turn?.result as { raw?: unknown }).raw).toBe("string");
  });
});

test("a second frames turn for the same project while one runs is a 409 naming the holder", async () => {
  await withEngine(slow(20_000), async (engine) => {
    const first = await startFrames("p-frames-2", RUN);
    expect(first.ok).toBe(true);
    const holder = (first as { turnId: string }).turnId;
    await until(holder, ["running"]);

    const second = await startFrames("p-frames-2", RUN);
    console.log(`[turn-frames] second -> ${JSON.stringify(second)}`);
    expect(second.ok).toBe(false);
    expect((second as { status: number }).status).toBe(409);
    expect((second as { holder?: string }).holder).toBe(holder);
    expect((second as { detail: string }).detail).toContain(holder);

    const pid = await enginePid(engine);
    expect((await cancelTurn(holder)).ok).toBe(true);
    await until(holder, ["cancelled"]);
    expect(await stillAliveAfterKill(pid)).toBe(false);
    expect(engine.turns(), "one engine for one slot").toHaveLength(1);
    everyRequestCarriedTheHeader();
  });
});

test("cancel mid-run: the record says cancelled, the engine's process tree is dead, and the bell stays quiet", async () => {
  await withEngine(slow(20_000), async (engine) => {
    const out = await startFrames("p-frames-3", RUN);
    const turnId = (out as { turnId: string }).turnId;
    await until(turnId, ["running"]);
    const pid = await enginePid(engine);
    expect(alive(pid)).toBe(true);

    const c = await cancelTurn(turnId);
    expect(c.ok).toBe(true);
    expect(await stillAliveAfterKill(pid), "cancel left the engine running").toBe(false);
    const final = await until(turnId, ["cancelled", "done", "failed"]);
    expect(final.status).toBe("cancelled");
    expect(final.result).toBeUndefined();

    let state: TurnState = trackTurn(EMPTY_TURNS, { turnId, projectId: "p-frames-3", kind: "frames", label: "scene direction", startedAt: Date.now() });
    state = await pollTurns(state);
    expect(turnJobsOf(state).find((j) => j.id === turnId)?.status).toBe("failed");
    expect(turnEventsOf(state)).toEqual([]);
    everyRequestCarriedTheHeader();
  });
});

/* ── the bell, and leaving the step ───────────────────────────────────────── */

test("a direction that settled while no tab was mounted reaches the bell once, as scene direction", async () => {
  await withEngine(slow(500), async () => {
    const out = await startFrames("p-frames-6", RUN);
    const turnId = (out as { turnId: string }).turnId;
    const started = trackTurn(EMPTY_TURNS, { turnId, projectId: "p-frames-6", kind: "frames", label: "scene direction", startedAt: Date.now() });
    const persisted = JSON.parse(JSON.stringify(started.flags)) as TurnState["flags"];
    await until(turnId, ["done"]);

    let state: TurnState = { flags: persisted, records: {} };
    state = await pollTurns(state);
    const events = turnEventsOf(state);
    console.log(`[turn-frames] first poll -> ${JSON.stringify(events.map((e) => [e.id, e.title]))}`);
    expect(events).toHaveLength(1);
    expect(events[0]!.id).toBe(`e-${turnId}`);
    expect(events[0]!.ok).toBe(true);
    expect(events[0]!.title).toBe("Scene direction returned");
    state = await pollTurns(state);
    expect(turnEventsOf(state)).toHaveLength(1);
  });
});

test("leaving the Frames step mid-run leaves the turn running; a remount takes the done direction exactly once", async () => {
  await withEngine(slow(1_000), async (engine) => {
    const out = await startFrames("p-frames-7", RUN);
    const turnId = (out as { turnId: string }).turnId;

    const first = await resumeTurn("p-frames-7", "frames", null);
    expect(first.action).toBe("watch");
    expect(first.turn?.id).toBe(turnId);

    // Unmounted: nothing is called, and the turn runs on.
    const done = await until(turnId, ["done", "cancelled", "failed"]);
    expect(done.status, "the turn did not survive the step being left").toBe("done");
    expect(engine.turns()).toHaveLength(1);

    const again = await resumeTurn("p-frames-7", "frames", null);
    expect(again.action).toBe("land");
    expect(again.turn?.id).toBe(turnId);
    expect(typeof ((again.turn as TurnRecord).result as { raw?: unknown }).raw).toBe("string");

    const later = await resumeTurn("p-frames-7", "frames", turnId);
    expect(later.action, "a consumed direction was staged a second time").toBe("none");
    everyRequestCarriedTheHeader();
  });
});

test("useFrames has no unmount path that aborts the pass, resumes from the ledger, and persists the turn it took", () => {
  const hook = stripComments(readFileSync(join(process.cwd(), "app/_phases/frames/useFrames.ts"), "utf8"));
  expect(hook.length).toBeGreaterThan(1000);
  expect(hook, "useFrames still aborts a request").not.toMatch(/\.abort\(/);
  expect(hook, "useFrames does not ask the ledger on mount").toMatch(/\bresumeTurn\(/);
  expect(hook, "useFrames does not start the pass through the door").toMatch(/\bstartFrames\(/);
  // "Exactly once" survives a reload only if the consumed id is on the record.
  expect(hook, "the frames record does not carry the consumed turn id").toMatch(/\bturn\?:\s*string/);
});

/* ── one client door, frames included ─────────────────────────────────────── */

test("no raw fetch of /api/frames, /api/recalibrate or /api/turns outside lib/turns/client.ts", () => {
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
  const door = new Set<string>();
  for (const f of files) {
    const rel = relative(ROOT, f).split("\\").join("/");
    const src = stripComments(readFileSync(f, "utf8"));
    for (const m of src.matchAll(RAW)) {
      if (rel === "lib/turns/client.ts") door.add(m[1]!.split(/[?$]/)[0]!);
      else hits.push(`${rel}:${src.slice(0, m.index).split("\n").length} ${m[1]}`);
    }
  }
  console.log(`[turn-frames] walked ${files.length} files; door routes ${[...door].sort().join(", ")}; ${hits.length} outside`);
  expect(files.length).toBeGreaterThan(200);
  // The matcher must see the door's own calls, frames among them, or it is blind.
  expect([...door].sort()).toEqual(expect.arrayContaining(["/api/frames", "/api/recalibrate", "/api/turns"]));
  expect(hits).toEqual([]);
});

/* ── the harness reads the ledger ─────────────────────────────────────────── */

test("the harness's job count comes from the ledger: a turn no tab is tracking is counted, once", async () => {
  await withEngine(slow(20_000), async () => {
    // Started by "another tab": this one tracks nothing.
    const out = await startFrames("p-frames-h", RUN);
    const turnId = (out as { turnId: string }).turnId;
    await until(turnId, ["running"]);

    const ledger = await listTurns("p-frames-h");
    expect(jobCounts([], ledger)).toEqual({ running: 1, total: 1 });

    // This tab's own view of the same turn is not a second job, and a local
    // (non-turn) job is still counted beside it.
    const tracked = turnJobsOf(trackTurn(EMPTY_TURNS, { turnId, projectId: "p-frames-h", kind: "frames", label: "scene direction", startedAt: Date.now() }));
    const research: Job = { id: "j-local", projectId: "p-frames-h", kind: "research", label: "r", status: "done", startedAt: 1, progress: 1, measured: true };
    expect(jobCounts([...tracked, research], ledger)).toEqual({ running: 1, total: 2 });

    expect((await cancelTurn(turnId)).ok).toBe(true);
    await until(turnId, ["cancelled"]);
    // The tab still thinks it runs (it has not polled); the ledger says it does not.
    expect(jobCounts(tracked, await listTurns("p-frames-h"))).toEqual({ running: 0, total: 1 });
  });
});

test("HarnessBridge counts jobs through the ledger, not the tab's list alone", () => {
  const bridge = stripComments(readFileSync(join(process.cwd(), "components/ui/HarnessBridge.tsx"), "utf8"));
  expect(bridge.length).toBeGreaterThan(500);
  expect(bridge).toMatch(/\bjobCounts\(/);
  expect(bridge).toMatch(/\blistTurns\(/);
  expect(bridge, "the snapshot still counts the tab's list by hand").not.toMatch(/jobs\.filter\(\(j\) => j\.status === "running"\)/);
});

/* ── a kind's refusal keeps its status through the generic door ───────────── */

async function viaTurns(kind: string, input: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await turnsPOST(
    new Request("http://localhost/api/turns", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `10.92.2.${(++ip % 250) + 1}` },
      body: JSON.stringify({ kind, projectId: "p-refusal", input }),
    }),
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

test("/api/turns answers a too-large run 413, as the kind's own route does; a 400 stays 400", async () => {
  await withEngine("frames-ok", async (engine) => {
    // Recalibrate: material past the route's character ceiling.
    const notes = [{ kind: "less-focus", cardId: "f-macro-cause", text: "x".repeat(1_100_000) }];
    const big = { notebook: {}, renders: RENDERS, scope: {}, notes };
    const direct = await recalibratePOST(
      new Request("http://localhost/api/recalibrate", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "10.92.3.1" },
        body: JSON.stringify({ ...big, projectId: "p-refusal" }),
      }),
    );
    const directJson = (await direct.json()) as Record<string, unknown>;
    const generic = await viaTurns("recalibrate", big);
    console.log(`[turn-frames] too-large recalibrate -> route ${direct.status}, /api/turns ${generic.status}`);
    expect(direct.status).toBe(413);
    expect(generic.status, String(generic.json.detail)).toBe(413);
    expect(generic.json.code).toBe("too-large");
    expect(generic.json.detail).toBe(directJson.detail);

    // Frames: 401 beats.
    const beats = Array.from({ length: 401 }, (_, i) => ({ at: `${i}`, text: `beat ${i}` }));
    const framesBig = await viaTurns("frames", { ...RUN, beats });
    expect(framesBig.status).toBe(413);
    expect(framesBig.json.code).toBe("too-large");

    // And an input error that is not a size is still the 400 it always was.
    const empty = await viaTurns("recalibrate", { notebook: {}, renders: RENDERS, scope: {}, notes: [] });
    expect(empty.status).toBe(400);
    const noStyle = await viaTurns("frames", { ...RUN, style: undefined });
    expect(noStyle.status).toBe(400);
    expect(engine.turns(), "a refused run reached the engine").toHaveLength(0);
  });
});
