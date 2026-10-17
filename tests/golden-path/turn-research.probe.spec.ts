// LANE — RESEARCH IS A SERVER-SIDE TURN KIND (dynamic, AIO-A stage 4a).
//
// WHAT CHANGED. Step 1's research run was a request held open for minutes by
// /api/research. 4a registered `research` as a turn kind (lib/turns/kinds/
// research.ts) so the runner can start, watch and cancel it like recalibrate and
// frames. The HTTP doors (/api/research, /api/turns) retired with the v1 pages in
// Phase 6 L70; the research producer (lib/producers/research.ts) runs the kind in
// process. What they answered over HTTP (202, 409, the `?wait=1` body) went with
// them; what this probe keeps is the runner's and the kind's.
//
// WHAT THIS PROBE DRIVES. The real runner (startTurn / readTurn / cancelTurn), the
// real kind and the real `reason()` / `retrieve()`; `withFakeEngine` puts the
// stand-in `claude` first on PATH, so no case can reach a real engine. Nothing is
// mocked.
//
// Cases 1-7 of the stage's acceptance, in order, plus the ones that keep the
// kind honest about the route it was lifted from.
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import type { Notebook } from "@/lib/notebook/types";
import { RETRIEVE_NOTEBOOK_SCHEMA } from "@/lib/notebook/validate";
import { reasonPrompt, retrievePrompt } from "@/lib/turns/assemble/research";
import { RESEARCH_SPEC } from "@/lib/turns/kinds/research";
import { digestOf, readTurn, type TurnRecord } from "@/lib/turns/ledger";
import { cancelTurn, startTurn, TurnInputError, whenIdle } from "@/lib/turns/runner";

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

/** What the runner answers a start: a turn under way, the slot's holder, or the kind's
 *  refusal (thrown before any record exists). */
type Started =
  | { outcome: "started"; turnId: string; done: Promise<TurnRecord> }
  | { outcome: "busy"; holder: string }
  | { outcome: "refused"; status: number; detail: string };

async function start(projectId: string, input: unknown): Promise<Started> {
  try {
    const out = await startTurn(RESEARCH_SPEC, projectId, input);
    return out.ok ? { outcome: "started", turnId: out.turnId, done: out.done } : { outcome: "busy", holder: out.holder.id };
  } catch (e) {
    if (e instanceof TurnInputError) return { outcome: "refused", status: e.status, detail: e.message };
    throw e;
  }
}

function started(s: Started): Extract<Started, { outcome: "started" }> {
  if (s.outcome !== "started") throw new Error(`the turn did not start: ${JSON.stringify(s)}`);
  return s;
}

async function read(id: string): Promise<TurnRecord> {
  const rec = await readTurn(id);
  if (!rec) throw new Error(`no record for ${id}`);
  return rec;
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

const cancel = (id: string) => cancelTurn(id);

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

test("a research turn starts; it reaches done with the notebook and searched:false", async () => {
  await withEngine("research-ok", async (engine) => {
    const turnId = started(await start("p-research-1", { topic: TOPIC })).turnId;
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

test("a notebook that fails parseNotebook ends failed/bad-response with every finding, the draft and the receipt on the record", async () => {
  await withEngine("research-refused", async () => {
    const done = await until(started(await start("p-research-2", { topic: TOPIC })).turnId, ["done", "failed"]);
    console.log(`[turn-research] refused -> ${done.status} ${JSON.stringify(done.error).slice(0, 240)}`);
    expect(done.status).toBe("failed");
    expect(done.error?.kind).toBe("bad-response");
    expect(done.error?.findings?.length, "findings were dropped").toBeGreaterThan(1);
    expect(done.error?.message).toContain("NOTEBOOK-SCHEMA");
    for (const f of done.error!.findings!) expect(done.error!.message, f).toContain(f.split(" · ")[0]!.slice(0, 20));
    expect(done.result).toBeUndefined();
    // The refused answer is kept, with the findings addressed by path, so a
    // repair turn can fix those paths instead of the run starting over.
    expect(done.error?.draft, "the refused answer was dropped").toBeTruthy();
    expect(done.error?.items?.length).toBe(done.error!.findings!.length);
    for (const it of done.error!.items!) expect(typeof it.path).toBe("string");
    // The receipt is kept: the turn was paid for whether or not its answer was usable.
    expect(done.receipt?.costUsd).toBe(0.2);
  });
});

test("`done` settles with the final record - what a caller that waits is handed", async () => {
  await withEngine("research-ok", async () => {
    const turn = await started(await start("p-research-wait", { topic: TOPIC })).done;
    expect(turn.status).toBe("done");
    expect((turn.result as Result).notebook.topic).toBe(TOPIC);
  });
});

/* ── case 3: cancel ───────────────────────────────────────────────────────── */

test("cancel mid-run: the record says cancelled and the engine's process tree is dead", async () => {
  await withEngine(slowOf(loadCassette("research-ok"), 20_000), async (engine) => {
    const turnId = started(await start("p-research-3", { topic: TOPIC })).turnId;
    await until(turnId, ["running"]);
    const pid = await enginePid(engine);
    expect(alive(pid)).toBe(true);

    expect((await cancel(turnId)).ok).toBe(true);
    expect(await stillAliveAfterKill(pid), "cancel left the engine running").toBe(false);
    const final = await until(turnId, ["cancelled", "done", "failed"]);
    expect(final.status).toBe("cancelled");
    expect(final.result).toBeUndefined();
  });
});

test("cancel mid-run with TEXT_RETRIEVE on: the retrieve door receives the signal too", async () => {
  process.env.TEXT_RETRIEVE = "1";
  await withEngine(slowOf(loadCassette("research-retrieve"), 20_000), async (engine) => {
    const turnId = started(await start("p-research-3b", { topic: TOPIC })).turnId;
    await until(turnId, ["running"]);
    const pid = await enginePid(engine);
    const argv = engine.turns()[0]!.argv;
    expect(argv[argv.indexOf("--allowed-tools") + 1], "the retrieval door").toBe("WebSearch,WebFetch");

    expect((await cancel(turnId)).ok).toBe(true);
    expect(await stillAliveAfterKill(pid), "cancel never reached the retrieve door").toBe(false);
    expect((await until(turnId, ["cancelled", "done", "failed"])).status).toBe("cancelled");
    expect(engine.turns(), "a cancelled retrieval fell back to a reasoning turn").toHaveLength(1);
  });
});

/* ── case 4: the topic refusals ───────────────────────────────────────────── */

test("a topic over MAX_TOPIC_CHARS is refused (400) and no record is written; neither is an empty one", async () => {
  await withEngine("research-ok", async (engine) => {
    const long = await start("p-research-4", { topic: "x".repeat(301) });
    expect(long).toMatchObject({ outcome: "refused", status: 400 });
    expect(long.outcome === "refused" ? long.detail : "").toContain("301 characters");
    expect(await start("p-research-4", { topic: "   " })).toMatchObject({ outcome: "refused", status: 400 });
    expect(await start("p-research-4", {})).toMatchObject({ outcome: "refused", status: 400 });
    expect(readdirSync(dir), "a refused request wrote a record").toEqual([]);
    expect(engine.turns()).toHaveLength(0);
  });
});

/* ── case 5: one live run per project ─────────────────────────────────────── */

test("a second research turn for the same project while one runs is refused, naming the holder", async () => {
  await withEngine(slowOf(loadCassette("research-ok"), 20_000), async (engine) => {
    const holder = started(await start("p-research-5", { topic: TOPIC })).turnId;
    await until(holder, ["running"]);

    expect(await start("p-research-5", { topic: TOPIC })).toEqual({ outcome: "busy", holder });

    const other = await start("p-research-5b", { topic: TOPIC });
    expect(other.outcome, "another project's slot was held").toBe("started");

    const pid = await enginePid(engine);
    await cancel(holder);
    await cancel(started(other).turnId);
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
    const done = await until(started(await start("p-research-6", { topic: TOPIC })).turnId, ["done", "failed"]);
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
    const done = await until(started(await start("p-research-7a", { topic: TOPIC })).turnId, ["done", "failed"]);
    expect(done.promptDigest).toBe(digestOf(reasoning));
    expect(done.promptChars).toBe(reasoning.length);
  });

  process.env.TEXT_RETRIEVE = "1";
  await withEngine("research-retrieve", async (engine) => {
    const done = await until(started(await start("p-research-7b", { topic: TOPIC })).turnId, ["done", "failed"]);

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
