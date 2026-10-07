// LANE — RESEARCH IS A SERVER-SIDE TURN KIND (dynamic, AIO-A stage 4a).
//
// WHAT CHANGED. Step 1's research run was a request held open for minutes by
// /api/research. 4a registers `research` as a turn kind (lib/turns/kinds/
// research.ts) so the generic door, /api/turns, can start, watch and cancel it
// like recalibrate and frames. /api/research itself is untouched and stays
// synchronous: the client half is 4b.
//
// WHAT THIS PROBE DRIVES. The real exported route handlers, the real runner and
// the real `reason()` / `retrieve()`; `withFakeEngine` puts the stand-in
// `claude` first on PATH, so no case can reach a real engine. Nothing is mocked.
//
// Cases 1-7 of the stage's acceptance, in order, plus the ones that keep the
// kind honest about the route it was lifted from.
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { POST as turnsPOST } from "@/app/api/turns/route";
import { GET as turnGET } from "@/app/api/turns/[id]/route";
import { POST as cancelPOST } from "@/app/api/turns/[id]/cancel/route";
import type { Notebook } from "@/app/_phases/_shared/notebook/types";
import { RETRIEVE_NOTEBOOK_SCHEMA } from "@/lib/notebook/validate";
import { syncBody } from "@/lib/turns/answer";
import { reasonPrompt, retrievePrompt } from "@/lib/turns/assemble/research";
import { digestOf, type TurnRecord } from "@/lib/turns/ledger";
import { whenIdle } from "@/lib/turns/runner";

import { FAKE_ENGINE_ENV, keepEnv, loadCassette, schemaSha256, withFakeEngine, type Cassette, type FakeCall } from "./_helpers";

keepEnv([
  ...FAKE_ENGINE_ENV,
  "TEXT_TURN_DIR",
  "TEXT_ENV",
  "LOCAL_BINARIES",
  "GOOGLE_AI_API_KEY",
  "NEXT_PUBLIC_DEV_AUTH",
  "LIGHTTRACK_DISABLE",
  "TEXT_RETRIEVE",
]);

let dir = "";
test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "gravitone-turn-research-"));
  process.env.TEXT_TURN_DIR = dir;
  process.env.NEXT_PUBLIC_DEV_AUTH = "1";
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

/* ── helpers ──────────────────────────────────────────────────────────────── */

const TOPIC = "harbour dredging costs";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let ip = 0;

async function start(projectId: string, input: unknown, query = "") {
  const res = await turnsPOST(
    new Request(`http://localhost/api/turns${query}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `10.93.0.${(++ip % 250) + 1}` },
      body: JSON.stringify({ kind: "research", projectId, input }),
    }),
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

async function read(id: string): Promise<TurnRecord> {
  const res = await turnGET(
    new Request(`http://localhost/api/turns/${id}`, { headers: { "x-forwarded-for": "10.93.1.1" } }),
    { params: Promise.resolve({ id }) },
  );
  return ((await res.json()) as { turn: TurnRecord }).turn;
}

async function until(id: string, statuses: string[], ms = 20_000): Promise<TurnRecord> {
  const t0 = Date.now();
  let last: TurnRecord | null = null;
  while (Date.now() - t0 < ms) {
    last = await read(id);
    if (last && statuses.includes(last.status)) return last;
    await wait(50);
  }
  throw new Error(`turn ${id} never reached ${statuses.join("|")}; last: ${JSON.stringify(last).slice(0, 300)}`);
}

async function cancel(id: string) {
  return cancelPOST(
    new Request(`http://localhost/api/turns/${id}/cancel`, { method: "POST", headers: { "x-forwarded-for": "10.93.1.2" } }),
    { params: Promise.resolve({ id }) },
  );
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

const slowOf = (c: Cassette, ms: number): Cassette => ({
  ...c,
  name: `${c.name}-slow-${ms}`,
  turns: c.turns.map((t) => ({ ...t, mode: t.mode === "stream" ? t.mode : ("slow" as const), slowMs: ms })),
});

type Result = { notebook: Notebook; engine: Record<string, unknown> };

/* ── case 1: 202, then done with the notebook, searched:false ─────────────── */

test("POST /api/turns {kind:'research'} answers 202; the turn reaches done with the notebook and searched:false", async () => {
  await withEngine("research-ok", async (engine) => {
    const out = await start("p-research-1", { topic: TOPIC });
    console.log(`[turn-research] start -> ${out.status} ${JSON.stringify(out.json)}`);
    expect(out.status).toBe(202);
    const turnId = out.json.turnId as string;
    expect(turnId).toMatch(/^tn-[0-9a-f]{12}$/);

    const done = await until(turnId, ["done", "failed"]);
    expect(done.status, JSON.stringify(done.error)).toBe("done");
    expect(done.kind).toBe("research");
    expect(done.turn).toBe("research");
    const result = done.result as Result;
    expect(result.notebook.topic).toBe(TOPIC);
    expect(result.engine.searched).toBe(false);
    expect(result.engine.kind).toBe("local-claude-code");
    expect(Object.keys(result.engine)).not.toContain("sources");
    expect(Object.keys(result.engine)).not.toContain("crossCheck");
    expect(done.receipt?.costUsd).toBe(0.2);
    expect(engine.turns(), "one prompt reached the engine").toHaveLength(1);
    const argv = engine.turns()[0]!.argv;
    expect(argv[argv.indexOf("--allowed-tools") + 1], "the reasoning door").toBe("");
  });
});

/* ── case 2: a notebook that fails parseNotebook ──────────────────────────── */

test("a notebook that fails parseNotebook ends failed/bad-response with every finding on the record, and the sync body is a 502 carrying them", async () => {
  await withEngine("research-refused", async () => {
    const out = await start("p-research-2", { topic: TOPIC });
    expect(out.status).toBe(202);
    const done = await until(out.json.turnId as string, ["done", "failed"]);
    console.log(`[turn-research] refused -> ${done.status} ${JSON.stringify(done.error).slice(0, 240)}`);
    expect(done.status).toBe("failed");
    expect(done.error?.kind).toBe("bad-response");
    expect(done.error?.findings?.length, "findings were dropped").toBeGreaterThan(1);
    expect(done.error?.message).toContain("NOTEBOOK-SCHEMA");
    for (const f of done.error!.findings!) expect(done.error!.message, f).toContain(f.split(" · ")[0]!.slice(0, 20));
    expect(done.result).toBeUndefined();
    // The receipt is kept: the turn was paid for whether or not its answer was usable.
    expect(done.receipt?.costUsd).toBe(0.2);

    // `?wait=1`'s mapping (lib/turns/answer.ts) over the settled record.
    const res = syncBody(done, "The research run failed. Nothing was saved.");
    const body = (await res.json()) as { detail: string; findings?: string[] };
    expect(res.status).toBe(502);
    expect(body.findings).toEqual(done.error!.findings);
  });
});

test("?wait=1 on the generic door answers the settled record", async () => {
  await withEngine("research-ok", async () => {
    const out = await start("p-research-wait", { topic: TOPIC }, "?wait=1");
    expect(out.status).toBe(200);
    const turn = out.json.turn as TurnRecord;
    expect(turn.status).toBe("done");
    expect((turn.result as Result).notebook.topic).toBe(TOPIC);
  });
});

/* ── case 3: cancel ───────────────────────────────────────────────────────── */

test("cancel mid-run: the record says cancelled and the engine's process tree is dead", async () => {
  await withEngine(slowOf(loadCassette("research-ok"), 20_000), async (engine) => {
    const out = await start("p-research-3", { topic: TOPIC });
    const turnId = out.json.turnId as string;
    await until(turnId, ["running"]);
    const pid = await enginePid(engine);
    expect(alive(pid)).toBe(true);

    expect((await cancel(turnId)).status).toBe(200);
    expect(await stillAliveAfterKill(pid), "cancel left the engine running").toBe(false);
    const final = await until(turnId, ["cancelled", "done", "failed"]);
    expect(final.status).toBe("cancelled");
    expect(final.result).toBeUndefined();
  });
});

test("cancel mid-run with TEXT_RETRIEVE on: the retrieve door receives the signal too", async () => {
  process.env.TEXT_RETRIEVE = "1";
  await withEngine(slowOf(loadCassette("research-retrieve"), 20_000), async (engine) => {
    const out = await start("p-research-3b", { topic: TOPIC });
    const turnId = out.json.turnId as string;
    await until(turnId, ["running"]);
    const pid = await enginePid(engine);
    const argv = engine.turns()[0]!.argv;
    expect(argv[argv.indexOf("--allowed-tools") + 1], "the retrieval door").toBe("WebSearch,WebFetch");

    expect((await cancel(turnId)).status).toBe(200);
    expect(await stillAliveAfterKill(pid), "cancel never reached the retrieve door").toBe(false);
    expect((await until(turnId, ["cancelled", "done", "failed"])).status).toBe("cancelled");
    expect(engine.turns(), "a cancelled retrieval fell back to a reasoning turn").toHaveLength(1);
  });
});

/* ── case 4: the topic refusals ───────────────────────────────────────────── */

test("a topic over MAX_TOPIC_CHARS is a 400 and no record is written; neither is an empty one", async () => {
  await withEngine("research-ok", async (engine) => {
    const long = await start("p-research-4", { topic: "x".repeat(301) });
    expect(long.status).toBe(400);
    expect(String(long.json.detail)).toContain("301 characters");
    const none = await start("p-research-4", { topic: "   " });
    expect(none.status).toBe(400);
    const missing = await start("p-research-4", {});
    expect(missing.status).toBe(400);
    expect(readdirSync(dir), "a refused request wrote a record").toEqual([]);
    expect(engine.turns()).toHaveLength(0);
  });
});

/* ── case 5: one live run per project ─────────────────────────────────────── */

test("a second research turn for the same project while one runs is a 409 naming the holder", async () => {
  await withEngine(slowOf(loadCassette("research-ok"), 20_000), async (engine) => {
    const first = await start("p-research-5", { topic: TOPIC });
    const holder = first.json.turnId as string;
    await until(holder, ["running"]);

    const second = await start("p-research-5", { topic: TOPIC });
    expect(second.status).toBe(409);
    expect(second.json.holder).toBe(holder);
    expect(String(second.json.detail)).toContain(holder);

    const other = await start("p-research-5b", { topic: TOPIC });
    expect(other.status, "another project's slot was held").toBe(202);

    const pid = await enginePid(engine);
    await cancel(holder);
    await cancel(other.json.turnId as string);
    expect(await stillAliveAfterKill(pid)).toBe(false);
  });
});

/* ── case 6: the flag on with no retrieval engine ─────────────────────────── */

test("flag on, retrieval engine unavailable: the turn falls back to reason(), and the retrieval trail leads reroutedFrom", async () => {
  process.env.TEXT_RETRIEVE = "1";
  const ok = loadCassette("research-ok");
  // The router appends each rung's own schema, so the retrieval prompt is told apart by its hash.
  const cassette: Cassette = {
    ...ok,
    name: "research-retrieve-unavailable",
    turns: [{ match: { schemaSha256: schemaSha256(RETRIEVE_NOTEBOOK_SCHEMA) }, prompt: null, mode: "login-stderr" }, ...ok.turns],
  };
  await withEngine(cassette, async (engine) => {
    const out = await start("p-research-6", { topic: TOPIC });
    const done = await until(out.json.turnId as string, ["done", "failed"]);
    console.log(`[turn-research] fallback -> ${done.status} ${JSON.stringify((done.result as Result | undefined)?.engine?.reroutedFrom)}`);
    expect(done.status, JSON.stringify(done.error)).toBe("done");
    const e = (done.result as Result).engine;
    expect(e.provider).toBe("claude-cli");
    expect(e.searched).toBe(false);
    const trail = e.reroutedFrom as { provider: string; why: string }[];
    expect(trail[0]!.provider).toBe("claude-cli-retrieve");
    expect(engine.turns().map((t) => t.argv[t.argv.indexOf("--allowed-tools") + 1])).toEqual(["WebSearch,WebFetch", ""]);

    // The prompt that was sent last is the reasoning one, and the record says so.
    expect(done.promptDigest).toBe(digestOf(await reasonPrompt(TOPIC)));
  });
});

/* ── case 7: promptDigest covers the prompt actually dispatched ───────────── */

test("promptDigest is the digest of the prompt actually dispatched, on each rung", async () => {
  const reasoning = await reasonPrompt(TOPIC);
  const retrieving = await retrievePrompt(TOPIC);
  expect(digestOf(reasoning)).not.toBe(digestOf(retrieving));

  await withEngine("research-ok", async () => {
    const out = await start("p-research-7a", { topic: TOPIC });
    const done = await until(out.json.turnId as string, ["done", "failed"]);
    expect(done.promptDigest).toBe(digestOf(reasoning));
    expect(done.promptChars).toBe(reasoning.length);
  });

  process.env.TEXT_RETRIEVE = "1";
  await withEngine("research-retrieve", async (engine) => {
    const out = await start("p-research-7b", { topic: TOPIC });
    const done = await until(out.json.turnId as string, ["done", "failed"]);
    expect(done.status, JSON.stringify(done.error)).toBe("done");
    // The retrieval rung served; the reason prompt was never sent.
    expect(engine.turns()).toHaveLength(1);
    expect(done.promptDigest).toBe(digestOf(retrieving));
    expect(done.promptChars).toBe(retrieving.length);
    const e = (done.result as Result).engine;
    expect(e.searched).toBe(true);
    expect((e.sources as unknown[]).length).toBe(3);
    expect((e.crossCheck as string[]).join(" ")).toMatch(/cited, not fetched/);
  });
});
