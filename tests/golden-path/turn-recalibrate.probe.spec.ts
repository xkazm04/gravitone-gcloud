// LANE — RECALIBRATE RUNS ON THE TURN LEDGER, AND THE TAB ONLY WATCHES IT (dynamic, AIO-A stage 2).
//
// WHAT WAS WRONG. A recalibration was one held-open `fetch` inside the Script
// step's hook. Leaving the step aborted it — and the abort stopped at the
// fetch: the `claude` process ran on, on the operator's seat, for an answer no
// listener would receive. A reload lost the run outright, and the bell's only
// record was one tab's localStorage row.
//
// WHAT THIS PROBE DRIVES. The client door (lib/turns/client.ts) is called as
// the browser calls it — relative URLs, accessHeader() on every request — and a
// stand-in `fetch` hands each request to the REAL exported route handler. The
// handlers dispatch through the real runner and the real `reason()`, and
// `withFakeEngine` (CIP-A) puts the stand-in `claude` first on PATH. Nothing in
// the app is mocked.
//
// OPERATOR DECISION 2026-10-06 (binding): leaving the Script step no longer
// cancels the turn. Cases 6 and 7 below are that decision as measurements: the
// turn settles with nobody watching, the first poll after a mount produces ONE
// bell event, and a remount stages the done plan ONCE.
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { test, expect } from "@playwright/test";

import { POST as recalibratePOST } from "@/app/api/recalibrate/route";
import { GET as listGET, POST as turnsPOST } from "@/app/api/turns/route";
import { GET as turnGET } from "@/app/api/turns/[id]/route";
import { POST as cancelPOST } from "@/app/api/turns/[id]/cancel/route";
import { RENDERS } from "@/app/_phases/script/renders";
import type { EditPlan } from "@/app/_phases/script/editPlan";
import { pollTurns, trackTurn, turnEventsOf, turnJobsOf, turnsToPoll, EMPTY_TURNS, type TurnState } from "@/lib/jobs";
import { cancelTurn, getTurn, listTurns, resumeTurn, startRecalibrate, type TurnRecord } from "@/lib/turns/client";
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

const SECRET = "probe-turn-door-secret";

let dir = "";
test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "gravitone-turn-recal-"));
  process.env.TEXT_TURN_DIR = dir;
  process.env.NEXT_PUBLIC_DEV_AUTH = "1";
  // What the BROWSER bundle would carry. The server side passes on the dev
  // fixture; this is here so every request the door sends can be checked for it.
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
  headers.set("x-forwarded-for", `10.91.0.${(++ip % 250) + 1}`);
  const method = (init?.method ?? "GET").toUpperCase();
  sent.push({ method, url: url.pathname + url.search, auth: headers.get("authorization") });
  const req = new Request(url, { method, headers, body: init?.body ?? undefined });
  const p = url.pathname;
  let m: RegExpMatchArray | null;
  if (p === "/api/recalibrate" && method === "POST") return recalibratePOST(req);
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

test("POST /api/recalibrate answers 202 {turnId}; the turn reaches done with the plan and the receipt", async () => {
  const cassette = slow(800);
  const paid = cassette.turns[0]!.envelope!.total_cost_usd;
  await withEngine(cassette, async (engine) => {
    const out = await startRecalibrate("p-recal-1", BODY);
    console.log(`[turn-recal] start -> ${JSON.stringify(out)}`);
    expect(out.ok, JSON.stringify(out)).toBe(true);
    const turnId = (out as { turnId: string }).turnId;
    expect(turnId).toMatch(/^tn-[0-9a-f]{12}$/);

    const done = await until(turnId, ["done", "failed"]);
    console.log(`[turn-recal] settled -> ${done.status} cost=${done.receipt?.costUsd}`);
    expect(done.status, JSON.stringify(done.error)).toBe("done");
    expect(done.kind).toBe("recalibrate");
    expect(done.projectId).toBe("p-recal-1");
    const result = done.result as { plan: EditPlan; manifest: { renders?: { sent: string[] } }; engine: Record<string, unknown> };
    expect(result.plan.edits).toHaveLength(1);
    expect(result.manifest.renders?.sent).toEqual(["adjudication"]);
    // The synchronous body's `engine` block, kept on the record so a client
    // stages the same receipt it always has.
    expect(result.engine.kind).toBe("local-claude-code");
    expect(result.engine.costUsd).toBe(paid);
    expect(done.receipt?.costUsd).toBe(paid);
    expect(done.receipt?.rung).toBe("preferred");
    expect(engine.turns(), "one prompt reached the engine").toHaveLength(1);
    everyRequestCarriedTheHeader();
  });
});

test("?wait=1 keeps the synchronous body for scripts", async () => {
  await withEngine("recalibrate-ok", async () => {
    const res = await recalibratePOST(
      new Request("http://localhost/api/recalibrate?wait=1", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "10.91.1.1" },
        body: JSON.stringify({ ...BODY, projectId: "p-recal-wait" }),
      }),
    );
    const json = (await res.json()) as Record<string, unknown>;
    expect(res.status, String(json.detail)).toBe(200);
    expect((json.plan as EditPlan).edits).toHaveLength(1);
    expect((json.engine as Record<string, unknown>).kind).toBe("local-claude-code");
  });
});

test("a second POST for the same project while one runs is a 409 naming the holder", async () => {
  await withEngine(slow(20_000), async (engine) => {
    const first = await startRecalibrate("p-recal-2", BODY);
    expect(first.ok).toBe(true);
    const holder = (first as { turnId: string }).turnId;
    await until(holder, ["running"]);

    const second = await startRecalibrate("p-recal-2", BODY);
    console.log(`[turn-recal] second -> ${JSON.stringify(second)}`);
    expect(second.ok).toBe(false);
    expect((second as { status: number }).status).toBe(409);
    expect((second as { holder?: string }).holder).toBe(holder);
    expect((second as { detail: string }).detail).toContain(holder);
    expect(engine.turns().length, "the refused second run reached the engine").toBeLessThanOrEqual(1);

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
    const out = await startRecalibrate("p-recal-3", BODY);
    const turnId = (out as { turnId: string }).turnId;
    await until(turnId, ["running"]);
    const pid = await enginePid(engine);
    expect(alive(pid)).toBe(true);

    const c = await cancelTurn(turnId);
    console.log(`[turn-recal] cancel -> ${JSON.stringify(c).slice(0, 160)}`);
    expect(c.ok).toBe(true);
    expect(await stillAliveAfterKill(pid), "cancel left the engine running").toBe(false);
    const final = await until(turnId, ["cancelled", "done", "failed"]);
    expect(final.status).toBe("cancelled");
    expect(final.result).toBeUndefined();

    // The provider reads it as a stopped job and announces nothing: the
    // creator pressed stop, and a bell telling them so is noise.
    let state: TurnState = trackTurn(EMPTY_TURNS, { turnId, projectId: "p-recal-3", kind: "recalibrate", label: "1 note", startedAt: Date.now() });
    state = await pollTurns(state);
    expect(turnJobsOf(state).find((j) => j.id === turnId)?.status).toBe("failed");
    expect(turnEventsOf(state)).toEqual([]);
    everyRequestCarriedTheHeader();
  });
});

/* ── 6. settled with no tab mounted → exactly one bell event ──────────────── */

test("case 6: a turn that settled while no tab was mounted produces exactly one bell event on the first poll, deduped by turn id", async () => {
  await withEngine(slow(600), async () => {
    const out = await startRecalibrate("p-recal-6", BODY);
    const turnId = (out as { turnId: string }).turnId;
    // The tab that started it records the turn, persists, and goes away.
    const started = trackTurn(EMPTY_TURNS, { turnId, projectId: "p-recal-6", kind: "recalibrate", label: "1 note", startedAt: Date.now() });
    const persisted = JSON.parse(JSON.stringify(started.flags)) as TurnState["flags"];
    expect(Object.keys(persisted)).toEqual([turnId]);

    // ...and the turn settles with nobody watching.
    await until(turnId, ["done"]);

    // A fresh mount: only the flags came back from storage.
    let state: TurnState = { flags: persisted, records: {} };
    expect(turnsToPoll(state), "a mount with an unsettled flag must poll its project").toEqual(["p-recal-6"]);
    expect(turnEventsOf(state)).toEqual([]);

    state = await pollTurns(state);
    const events = turnEventsOf(state);
    console.log(`[turn-recal] first poll -> ${JSON.stringify(events.map((e) => [e.id, e.title, e.read]))}`);
    expect(events).toHaveLength(1);
    expect(events[0]!.id).toBe(`e-${turnId}`);
    expect(events[0]!.jobId).toBe(turnId);
    expect(events[0]!.ok).toBe(true);
    expect(events[0]!.read).toBe(false);
    expect(events[0]!.title).toBe("Recalibration returned");

    // A second poll, and a list that repeats the record, add nothing.
    state = await pollTurns(state);
    expect(turnEventsOf(state)).toHaveLength(1);
    expect(turnsToPoll(state), "polling continues after the turn settled").toEqual([]);
    expect(turnJobsOf(state).filter((j) => j.id === turnId)).toHaveLength(1);
    expect(turnJobsOf(state)[0]!.status).toBe("done");
  });
});

/* ── 7. unmount mid-run does not cancel; remount stages once ─────────────── */

test("case 7: leaving the Script step mid-run leaves the turn running; a remount takes the done plan exactly once", async () => {
  await withEngine(slow(1_200), async (engine) => {
    const out = await startRecalibrate("p-recal-7", BODY);
    const turnId = (out as { turnId: string }).turnId;

    // Mounted while it runs: watch it.
    const first = await resumeTurn("p-recal-7", "recalibrate", null);
    expect(first.action).toBe("watch");
    expect(first.turn?.id).toBe(turnId);

    // Unmounted. Nothing is called — that is the decision — and the turn runs on.
    const done = await until(turnId, ["done", "cancelled", "failed"]);
    expect(done.status, "the turn did not survive the step being left").toBe("done");
    expect(engine.turns()).toHaveLength(1);

    // Remounted: the plan lands, once.
    const again = await resumeTurn("p-recal-7", "recalibrate", null);
    expect(again.action).toBe("land");
    const landed = again.turn as TurnRecord;
    expect(landed.id).toBe(turnId);
    expect(((landed.result as { plan: EditPlan }).plan).edits).toHaveLength(1);

    const later = await resumeTurn("p-recal-7", "recalibrate", turnId);
    expect(later.action, "a consumed turn was staged a second time").toBe("none");
    expect((await listTurns("p-recal-7", "recalibrate")).map((t) => t.id)).toEqual([turnId]);
    everyRequestCarriedTheHeader();
  });
});

test("case 7: useVersions has no unmount path that aborts or cancels the run, and resumes from the ledger", () => {
  const src = stripComments(readFileSync(join(process.cwd(), "app/_phases/script/useVersions.ts"), "utf8"));
  expect(src.length).toBeGreaterThan(1000);
  expect(src, "useVersions still aborts a request").not.toMatch(/\.abort\(/);
  expect(src, "useVersions still settles a run `interrupted`").not.toMatch(/["']interrupted["']/);
  expect(src, "useVersions does not ask the ledger on mount").toMatch(/\bresumeTurn\(/);
});

/* ── 8, scoped to turns: one client door ──────────────────────────────────── */

test("acceptance 8: no raw fetch of /api/recalibrate or /api/turns outside lib/turns/client.ts", () => {
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
  const RAW = /\bfetch\(\s*[`"'](\/api\/(?:recalibrate|turns)\b[^`"']*)/g;
  const hits: string[] = [];
  let inDoor = 0;
  for (const f of files) {
    const rel = relative(ROOT, f).split("\\").join("/");
    const src = stripComments(readFileSync(f, "utf8"));
    for (const m of src.matchAll(RAW)) {
      if (rel === "lib/turns/client.ts") inDoor++;
      else hits.push(`${rel}:${src.slice(0, m.index).split("\n").length} ${m[1]}`);
    }
  }
  console.log(`[turn-recal] walked ${files.length} files; ${inDoor} turn fetches in the door, ${hits.length} outside`);
  // The walk must have read the tree, and the matcher must see the door's own calls.
  expect(files.length).toBeGreaterThan(200);
  expect(inDoor, "the matcher found none of the door's own fetches - it is blind").toBeGreaterThanOrEqual(4);
  expect(hits).toEqual([]);
});
