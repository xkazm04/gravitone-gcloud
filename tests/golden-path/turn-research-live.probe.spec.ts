// LANE — THE RESEARCH STEP ONLY WATCHES A SERVER-OWNED TURN (dynamic, AIO-A stage 4b).
//
// WHAT WAS WRONG. Stage 4a made `research` a turn kind, but /api/research still
// held its request open for minutes and run/live.ts wrote the notebook from the
// closure that held it. A reload, or a tab that went away, dropped the closure
// with the notebook already paid for.
//
// WHAT THIS PROBE DRIVES. The route's POST as the browser asks it, through the
// one client door (lib/turns/client.ts): a stand-in `fetch` hands each request
// to the REAL exported route handler, which starts the REAL runner over the
// REAL `reason()`, and `withFakeEngine` puts the stand-in `claude` first on
// PATH with 4a's cassettes. run/live.ts is driven as the step drives it, over a
// real IndexedDB engine (`fake-indexeddb`, imported first through the C1
// harness), and the board's answer is read through useActiveNotebook itself.
//
// OPERATOR DECISION 2026-10-06 (recalibrate and scene direction), extended to
// research: leaving the step does not cancel; a reload re-attaches; an explicit
// stop kills the engine; a settled notebook is written exactly once.
import "./_c1-harness";

import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { POST as researchPOST, GET as researchGET } from "@/app/api/research/route";
import { GET as listGET } from "@/app/api/turns/route";
import { GET as turnGET } from "@/app/api/turns/[id]/route";
import { POST as cancelPOST } from "@/app/api/turns/[id]/cancel/route";
import { fixtureSource } from "@/app/_phases/_shared/notebook/source";
import { LIVE_NOTEBOOK_PHASE, readActiveNotebook, useActiveNotebook } from "@/app/_phases/_shared/notebook/useActiveNotebook";
import { onSaveIssued, readStep, type ResearchNotebookStepData } from "@/app/_phases/_shared/stepStore";
import { __forgetLive, resetLive, resumeLive, startLive, stopLive, useLiveResearch } from "@/app/_phases/research/run/live";
import { MAX_TOPIC_CHARS } from "@/lib/turns/assemble/research";
import { getTurn, type TurnRecord } from "@/lib/turns/client";
import { whenIdle } from "@/lib/turns/runner";

import { harness } from "./_c1-harness";
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
  "TEXT_RETRIEVE",
]);

const SECRET = "probe-turn-research-live-secret";
const TOPIC = "harbour dredging costs";

let dir = "";
test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "gravitone-turn-research-live-"));
  process.env.TEXT_TURN_DIR = dir;
  process.env.NEXT_PUBLIC_DEV_AUTH = "1";
  process.env.NEXT_PUBLIC_IMAGING_ACCESS_SECRET = SECRET;
  process.env.TEXT_ENV = "local";
  process.env.LOCAL_BINARIES = "on";
  delete process.env.GOOGLE_AI_API_KEY;
  process.env.LIGHTTRACK_DISABLE = "1";
  delete process.env.TEXT_RETRIEVE;
});
test.afterEach(() => {
  __forgetLive();
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
  headers.set("x-forwarded-for", `10.94.0.${(++ip % 250) + 1}`);
  const method = (init?.method ?? "GET").toUpperCase();
  sent.push({ method, url: url.pathname + url.search, auth: headers.get("authorization") });
  const req = new Request(url, { method, headers, body: init?.body ?? undefined });
  const p = url.pathname;
  let m: RegExpMatchArray | null;
  if (p === "/api/research" && method === "POST") return researchPOST(req);
  if (p === "/api/research" && method === "GET") return researchGET(req);
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

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The route asked directly, as a script asks it. */
async function post(body: unknown, query = "") {
  const res = await researchPOST(
    new Request(`http://localhost/api/research${query}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `10.94.1.${(++ip % 250) + 1}`, authorization: `Bearer ${SECRET}` },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

async function until(id: string, statuses: string[], ms = 20_000): Promise<TurnRecord> {
  const t0 = Date.now();
  let last: TurnRecord | null = null;
  while (Date.now() - t0 < ms) {
    last = await getTurn(id);
    if (last && statuses.includes(last.status)) return last;
    await wait(50);
  }
  throw new Error(`turn ${id} never reached ${statuses.join("|")}; last: ${JSON.stringify(last).slice(0, 300)}`);
}

async function eventually(what: string, ok: () => boolean, ms = 20_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (ok()) return;
    await wait(50);
  }
  throw new Error(`never: ${what}`);
}

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
async function enginePid(engine: { turns: () => FakeCall[] }): Promise<number> {
  for (let i = 0; i < 200; i++) {
    const t = engine.turns();
    if (t.length && typeof t[0]!.pid === "number") return t[0]!.pid!;
    await wait(25);
  }
  throw new Error("the stand-in never recorded a turn - the engine was not reached");
}

const slowOf = (name: string, ms: number): Cassette => {
  const c = loadCassette(name);
  return { ...c, name: `${c.name}-slow-${ms}`, turns: c.turns.map((t) => ({ ...t, mode: "slow" as const, slowMs: ms })) };
};

/** No run of this process may outlive the fake engine. */
function withEngine<T>(cassette: string | Cassette, fn: (engine: { turns: () => FakeCall[] }) => Promise<T>): Promise<T> {
  return withFakeEngine(cassette, async (engine) => {
    try {
      return await fn(engine);
    } finally {
      await whenIdle();
    }
  });
}

/** Every `research-notebook` save issued for one project, as issued. */
function spy(projectId: string) {
  const writes: ResearchNotebookStepData[] = [];
  const off = onSaveIssued((p, phase, data) => {
    if (p === projectId && phase === LIVE_NOTEBOOK_PHASE) writes.push(data as ResearchNotebookStepData);
  });
  return { writes, landed: () => writes.filter((w) => w.notebook !== null), off };
}

async function saved(projectId: string): Promise<ResearchNotebookStepData | undefined> {
  const r = await readStep<ResearchNotebookStepData>(projectId, LIVE_NOTEBOOK_PHASE);
  expect(r.ok, "the record could not be read").toBe(true);
  return r.ok ? r.data : undefined;
}

function everyRequestCarriedTheHeader() {
  expect(sent.length, "the door sent nothing").toBeGreaterThan(0);
  const bare = sent.filter((s) => s.auth !== `Bearer ${SECRET}`).map((s) => `${s.method} ${s.url}`);
  expect(bare, "a research request went out without accessHeader()").toEqual([]);
}

/* ── 1-3: the route ───────────────────────────────────────────────────────── */

test("1: POST /api/research {projectId, topic} answers 202 {turnId}; ?wait=1 answers today's 200 body", async () => {
  await withEngine("research-ok", async (engine) => {
    const out = await post({ projectId: "p-rl-1", topic: TOPIC });
    console.log(`[turn-research-live] 202 -> ${out.status} ${JSON.stringify(out.json)}`);
    expect(out.status).toBe(202);
    expect(Object.keys(out.json)).toEqual(["turnId"]);
    expect(out.json.turnId).toMatch(/^tn-[0-9a-f]{12}$/);
    expect((await until(out.json.turnId as string, ["done", "failed"])).status).toBe("done");

    const sync = await post({ projectId: "p-rl-1", topic: TOPIC }, "?wait=1");
    expect(sync.status, String(sync.json.detail)).toBe(200);
    expect(Object.keys(sync.json).sort()).toEqual(["engine", "notebook"]);
    expect((sync.json.notebook as { topic: string }).topic).toBe(TOPIC);
    const e = sync.json.engine as Record<string, unknown>;
    expect(e.kind).toBe("local-claude-code");
    expect(e.provider).toBe("claude-cli");
    expect(e.searched).toBe(false);
    expect(e.costUsd).toBe(0.2);
    expect(engine.turns(), "one engine turn per POST").toHaveLength(2);
  });
});

test("2: ?wait=1 on a notebook that fails NOTEBOOK-SCHEMA answers 502 bad-response carrying every finding", async () => {
  await withEngine("research-refused", async () => {
    const out = await post({ projectId: "p-rl-2", topic: TOPIC }, "?wait=1");
    console.log(`[turn-research-live] refused -> ${out.status} ${String(out.json.detail).slice(0, 160)}`);
    expect(out.status).toBe(502);
    expect(out.json.code).toBe("bad-response");
    const findings = out.json.findings as string[];
    expect(findings.length, "findings were dropped").toBeGreaterThan(1);
    expect(String(out.json.detail)).toContain("NOTEBOOK-SCHEMA");
    // The same findings the ledger holds.
    const [rec] = readdirSync(dir).filter((f) => f.endsWith(".json"));
    const onDisk = JSON.parse(readFileSync(join(dir, rec!), "utf8")) as TurnRecord;
    expect(findings).toEqual(onDisk.error!.findings);
  });
});

test("3: no projectId is 400; an over-long topic is 400 with no record; a second run while one runs is 409 naming it", async () => {
  await withEngine(slowOf("research-ok", 3_000), async (engine) => {
    const none = await post({ topic: TOPIC });
    expect(none.status).toBe(400);
    expect(String(none.json.detail)).toMatch(/projectId/);
    const long = await post({ projectId: "p-rl-3", topic: "x".repeat(MAX_TOPIC_CHARS + 1) });
    expect(long.status).toBe(400);
    expect(String(long.json.detail)).toContain(`${MAX_TOPIC_CHARS + 1} characters`);
    expect(readdirSync(dir), "a refused request wrote a record").toEqual([]);
    expect(engine.turns()).toHaveLength(0);

    const first = await post({ projectId: "p-rl-3", topic: TOPIC });
    expect(first.status).toBe(202);
    const second = await post({ projectId: "p-rl-3", topic: "another subject" });
    console.log(`[turn-research-live] second -> ${second.status} ${JSON.stringify(second.json)}`);
    expect(second.status).toBe(409);
    expect(second.json.holder).toBe(first.json.turnId);
    expect(String(second.json.detail)).toContain(first.json.turnId as string);
    await until(first.json.turnId as string, ["done", "failed"]);
  });
});

/* ── 4-6: the step watches ────────────────────────────────────────────────── */

test("4: a reload before the turn settles loses nothing - the remount watches, lands, and writes the notebook exactly once", async () => {
  const P = "p-rl-4";
  const s = spy(P);
  try {
    await withEngine(slowOf("research-ok", 1_500), async (engine) => {
      const turnId = await startLive(P, TOPIC);
      expect(turnId, "startLive did not start a turn").toMatch(/^tn-/);

      // THE RELOAD: everything this module held is gone; the ledger and the
      // step store are not.
      __forgetLive();
      expect((await getTurn(turnId!))!.status, "the turn did not outlive the page").not.toBe("cancelled");

      const remount = await resumeLive(P, await saved(P), TOPIC);
      expect(remount?.id, "the remount did not watch the live turn").toBe(turnId);

      await eventually("the remount landed the notebook", () => s.landed().length > 0);
      expect(s.landed()).toHaveLength(1);
      expect(s.landed()[0]!.turn).toBe(turnId);

      // A second remount (a second reload, or a mount after the landing) finds
      // the turn taken.
      __forgetLive();
      expect(await resumeLive(P, await saved(P), TOPIC)).toBeNull();
      await wait(2_000);
      expect(s.landed(), "the notebook was written twice").toHaveLength(1);
      expect(engine.turns()).toHaveLength(1);

      expect((await readActiveNotebook(P))!.kind).toBe("reasoned");
      const h = harness(() => useActiveNotebook(P));
      const board = await h.settleUp();
      expect(board.hydrated).toBe(true);
      expect(board.source.kind).toBe("reasoned");
      expect(board.source.notebook.topic).toBe(TOPIC);
      h.unmount();
    });
  } finally {
    s.off();
  }
  everyRequestCarriedTheHeader();
});

test("4b: a turn that lands while the step is mounted is written once, and a later mount does not write it again", async () => {
  const P = "p-rl-4b";
  const s = spy(P);
  try {
    await withEngine("research-ok", async () => {
      const turnId = await startLive(P, TOPIC);
      await eventually("the watcher landed the notebook", () => s.landed().length > 0);
      const live = harness(() => useLiveResearch(P));
      expect((await live.settleUp()).state.status).toBe("done");
      live.unmount();

      __forgetLive();
      expect(await resumeLive(P, await saved(P))).toBeNull();
      await wait(500);
      expect(s.landed()).toHaveLength(1);
      expect(s.landed()[0]!.turn).toBe(turnId);
    });
  } finally {
    s.off();
  }
});

test("5: after resetLive, a turn that was already taken is never landed again: no write, and the board deals the replay", async () => {
  const P = "p-rl-5";
  const s = spy(P);
  try {
    await withEngine("research-ok", async () => {
      const turnId = await startLive(P, TOPIC);
      await eventually("the watcher landed the notebook", () => s.landed().length > 0);

      resetLive(P);
      // The clear is on the board in the same tick, and it carries the id it saw.
      expect(s.writes.at(-1)!.notebook).toBeNull();
      expect(s.writes.at(-1)!.turn).toBe(turnId);
      await expect.poll(async () => (await readActiveNotebook(P))?.kind).toBe("replay");

      // In this page, and after a reload.
      expect(await resumeLive(P, await saved(P))).toBeNull();
      __forgetLive();
      expect(await resumeLive(P, await saved(P))).toBeNull();
      await wait(500);
      expect(s.landed(), "a consumed turn re-wrote a cleared notebook").toHaveLength(1);
      expect(await readActiveNotebook(P)).toBe(fixtureSource());
    });
  } finally {
    s.off();
  }
});

test("6: stopLive ends the record cancelled, kills the engine's process tree, and writes no notebook", async () => {
  const P = "p-rl-6";
  const s = spy(P);
  try {
    await withEngine(slowOf("research-ok", 20_000), async (engine) => {
      const turnId = await startLive(P, TOPIC);
      await until(turnId!, ["running"]);
      const pid = await enginePid(engine);
      expect(alive(pid)).toBe(true);

      const turn = await stopLive(P);
      expect(turn?.status).toBe("cancelled");
      expect(await stillAliveAfterKill(pid), "stop left the engine running").toBe(false);
      expect((await until(turnId!, ["cancelled", "done", "failed"])).status).toBe("cancelled");

      __forgetLive();
      expect(await resumeLive(P, await saved(P))).toBeNull();
      expect(s.writes, "a stopped run wrote to the notebook record").toEqual([]);
    });
  } finally {
    s.off();
  }
});

/* ── wiring ───────────────────────────────────────────────────────────────── */

test("the step starts, stops and resumes through the turn, and has no path that aborts or cancels on unmount", () => {
  const live = stripComments(readFileSync(join(process.cwd(), "app/_phases/research/run/live.ts"), "utf8"));
  expect(live, "live.ts still aborts a request").not.toMatch(/\.abort\(/);
  expect(live).toMatch(/\bstartResearch\(/);
  expect(live).toMatch(/\bresumeTurn\(/);
  expect(live).toMatch(/\bcancelTurn\(/);

  const hook = stripComments(readFileSync(join(process.cwd(), "app/_phases/research/guided/useEducationalResearch.ts"), "utf8"));
  expect(hook).toMatch(/\bresumeLive\(/);
  expect(hook).toMatch(/\btrack\(\{ turnId/);
  // The replay keeps its local job: start, settle, cancel.
  expect(hook).toMatch(/jobs\.start\("research"/);
  expect(hook).toMatch(/\bsettle\(j\.id, "done"/);
  // Nothing on unmount reaches the turn.
  expect(hook, "the hook cancels on unmount").not.toMatch(/return \(\) => [^\n]*(stop|cancel)/);

  const stepData = readFileSync(join(process.cwd(), "app/_phases/_shared/stepStore.ts"), "utf8");
  expect(stepData, "the notebook record does not carry the consumed turn id").toMatch(/\bturn\?:\s*string/);
});
