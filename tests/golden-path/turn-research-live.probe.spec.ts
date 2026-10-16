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
// PATH with 4a's cassettes.
//
// RETIRED WITH THE v1 STUDIO (Phase 4 wave D): the step-side cases (4-6 and the
// wiring case) drove run/live.ts and useActiveNotebook, which are gone. A research
// run is a part act now - a kernel job that lands the project's own notebook once,
// survives the tab, and is swept, acknowledged and retried without re-buying a
// booked turn (tests/next-server/producer-step-research.test.ts,
// producer-step-crash.test.ts). The route cases stay.
//
// OPERATOR DECISION 2026-10-06 (recalibrate and scene direction), extended to
// research: leaving the step does not cancel; a reload re-attaches; an explicit
// stop kills the engine; a settled notebook is written exactly once.

import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { POST as researchPOST, GET as researchGET } from "@/app/api/research/route";
import { GET as listGET } from "@/app/api/turns/route";
import { GET as turnGET } from "@/app/api/turns/[id]/route";
import { POST as cancelPOST } from "@/app/api/turns/[id]/cancel/route";
import { MAX_TOPIC_CHARS } from "@/lib/turns/assemble/research";
import { getTurn, type TurnRecord } from "@/lib/turns/client";
import { whenIdle } from "@/lib/turns/runner";

import { FAKE_ENGINE_ENV, keepEnv, loadCassette, withFakeEngine, type Cassette, type FakeCall } from "./_helpers";

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
