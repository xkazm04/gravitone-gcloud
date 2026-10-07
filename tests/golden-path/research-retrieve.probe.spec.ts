// LANE — RESEARCHED, NOT REASONED: receipts, the cross-check, and the flag (research-run-engine-B).
//
// /api/research could not search on either rung, and said so in three places
// (the prompt, `engine.searched: false`, the `reasoned` origin). This card adds
// a retrieval rung behind an operator flag (TEXT_RETRIEVE, off by default), and
// these cases pin what "researched" is allowed to mean once it exists:
//
//   case 2  every WebFetch the engine ran becomes a SourceReceipt, parsed out of
//           the stream-json the CLI writes, and `searched` is derived from the
//           receipts — never set by hand;
//   case 3  a `high` fact citing a URL this run never fetched is downgraded to
//           `medium`, with the finding "cited, not fetched";
//   case 4  a retrieval run that made no tool call is `searched: false`, and the
//           validator still requires researchGaps[0] to say no search was run;
//   case 6  with the flag off, the pre-flight names the retrieval candidate as
//           policy-forbidden and the run is today's run, byte for byte: the
//           reasoning door, `searched: false`, no receipt fields.
//
// Nothing reaches a network or a model. The stream is a hand-written cassette
// in the CLI's stream-json shape (tests/_engine/cassettes/research-retrieve.json),
// replayed by the stand-in `claude` withFakeEngine puts first on PATH.
//
// SINCE AIO-A STAGE 4b the POST starts a server-owned `research` turn and
// answers 202. The route cases here ask it with `?wait=1` and a `projectId`,
// over a temp TEXT_TURN_DIR, and assert the SAME bodies they always did: the
// synchronous answer is the route's contract for scripts and probes.
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { GET, POST } from "@/app/api/research/route";
import { CliError } from "@/lib/claudeCli";
import { crossCheckRetrieval, NotebookError, parseNotebook } from "@/lib/notebook/validate";
import { retrievalEnabled } from "@/lib/text/env";
import { TextError } from "@/lib/text/errors";
import { parseRetrieveStream, runClaudeRetrieve } from "@/lib/text/providers/claudeCliRetrieve";
import { retrieve } from "@/lib/text/router";
import { whenIdle } from "@/lib/turns/runner";
import type { Notebook } from "@/app/_phases/_shared/notebook/types";

import {
  cliArgsFingerprint,
  FAKE_ENGINE_ENV,
  keepEnv,
  loadCassette,
  withFakeEngine,
  type Cassette,
  type CassetteTurn,
} from "./_helpers";

keepEnv([
  ...FAKE_ENGINE_ENV,
  "TEXT_ENV",
  "LOCAL_BINARIES",
  "GOOGLE_AI_API_KEY",
  "NEXT_PUBLIC_DEV_AUTH",
  "LIGHTTRACK_DISABLE",
  "TEXT_RETRIEVE",
  "TEXT_TURN_DIR",
]);

let dir = "";
test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "gravitone-research-retrieve-"));
  process.env.TEXT_TURN_DIR = dir;
  process.env.NEXT_PUBLIC_DEV_AUTH = "1";
  process.env.TEXT_ENV = "local";
  process.env.LOCAL_BINARIES = "on";
  // No cloud key: a local rung that failed has nowhere metered to go.
  delete process.env.GOOGLE_AI_API_KEY;
  process.env.LIGHTTRACK_DISABLE = "1";
  delete process.env.TEXT_RETRIEVE;
});
test.afterEach(async () => {
  await whenIdle();
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = "";
});

const CLOCK = "2026-10-06T09:00:00.000Z";
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

const RECORDED = loadCassette("research-retrieve");
const TURN = RECORDED.turns[0]! as CassetteTurn & { stream: Record<string, unknown>[] };
const NOTEBOOK = TURN.resultJson as Record<string, unknown>;

/** The stream exactly as the stand-in writes it: one JSON event per line, the
 *  turn's `resultJson` serialised into the result event. */
function streamText(events: readonly Record<string, unknown>[], resultJson: unknown = NOTEBOOK): string {
  return events
    .map((e) => (e.type === "result" && e.result === undefined ? { ...e, result: JSON.stringify(resultJson) } : e))
    .map((e) => JSON.stringify(e))
    .join("\n");
}

/** A retrieval cassette with one stream turn, for a case the recorded one does not cover. */
function retrieveCassette(stream: Record<string, unknown>[], resultJson: unknown, extra: Partial<CassetteTurn> = {}): Cassette {
  return { ...RECORDED, turns: [{ prompt: null, mode: "stream", stream, resultJson, ...extra } as CassetteTurn] };
}

const INIT = TURN.stream[0]!;
const RESULT = TURN.stream[TURN.stream.length - 1]!;

let ip = 0;
const req = (method: "GET" | "POST", body?: unknown) =>
  new Request(`http://localhost/api/research${method === "POST" ? "?wait=1" : ""}`, {
    method,
    headers: { "content-type": "application/json", "x-forwarded-for": `10.88.0.${++ip}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

async function research(topic = "harbour dredging costs") {
  const res = await POST(req("POST", { topic, projectId: "p-research-retrieve" }));
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

/* ── case 2: the stream becomes receipts ─────────────────────────────────── */

test("retrieve stream: three WebFetch results are three receipts, each with its query, size and excerpt hash", () => {
  const run = parseRetrieveStream(streamText(TURN.stream), () => CLOCK);
  console.log(`[retrieve] receipts=${run.receipts.length} searches=${run.searches.length} turns=${run.numTurns}`);

  expect(run.receipts).toHaveLength(3);
  expect(run.receipts.map((r) => r.url)).toEqual([
    "https://example.org/one",
    "https://www.example.net/two/",
    "https://example.org/counter-case",
  ]);
  // The query is the search whose result list surfaced the URL; a URL the
  // engine went to directly has none, and says so with null.
  expect(run.receipts.map((r) => r.query)).toEqual([
    "harbour dredging cost per cubic metre 2026",
    "harbour dredging cost per cubic metre 2026",
    null,
  ]);
  // The CLI's own byte count where it reports one.
  expect(run.receipts.map((r) => r.bytes)).toEqual([48211, 20977, 9314]);
  expect(run.receipts.every((r) => r.fetchedAt === CLOCK)).toBe(true);
  // The hash of what the MODEL READ, so a later reader can tell two runs that
  // saw the same page from two that saw different text at the same address.
  expect(run.receipts[0]!.excerptHash).toBe(sha("The ledger reports 1.2 million cubic metres dredged in the 2025 season."));
  expect(run.receipts[1]!.excerptHash).toBe(sha("Quoted rate: 14 to 19 per cubic metre, mobilisation excluded."));

  expect(run.searches).toEqual([
    { query: "harbour dredging cost per cubic metre 2026", urls: ["https://example.org/one", "https://www.example.net/two/"] },
  ]);
  expect(JSON.parse(run.text)).toEqual(NOTEBOOK);
  expect(run.sessionId).toBe("00000000-fake-4000-8000-0000000000r1");
  expect(run.costUsd).toBe(0.4127);
  expect(run.numTurns).toBe(5);
});

test("retrieve stream: a failed fetch is not a receipt", () => {
  const failed = [
    INIT,
    {
      type: "assistant",
      message: { role: "assistant", content: [{ type: "tool_use", id: "toolu_x", name: "WebFetch", input: { url: "https://example.org/gone", prompt: "p" } }] },
    },
    {
      type: "user",
      message: { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_x", is_error: true, content: "Request failed with status code 404" }] },
    },
    RESULT,
  ];
  expect(parseRetrieveStream(streamText(failed), () => CLOCK).receipts).toEqual([]);
});

test("retrieve stream: a tool outside WebSearch,WebFetch is a fence breach, not a receipt", () => {
  const breach = [
    INIT,
    { type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id: "toolu_b", name: "Bash", input: { command: "env" } }] } },
    RESULT,
  ];
  let err: unknown;
  try {
    parseRetrieveStream(streamText(breach), () => CLOCK);
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(CliError);
  expect((err as CliError).message).toMatch(/Bash/);

  // And a session that STARTED with a workspace tool is refused on its init
  // line, before anything it did is believed.
  let init: unknown;
  try {
    parseRetrieveStream(streamText([{ ...INIT, tools: ["WebSearch", "WebFetch", "Read"] }, RESULT]), () => CLOCK);
  } catch (e) {
    init = e;
  }
  expect(init).toBeInstanceOf(CliError);
  expect((init as CliError).message).toMatch(/Read/);
});

/* ── case 3: the cross-check ─────────────────────────────────────────────── */

test("retrieve cross-check: a high fact citing an unfetched URL is downgraded, with 'cited, not fetched'", () => {
  const run = parseRetrieveStream(streamText(TURN.stream), () => CLOCK);
  const nb = parseNotebook(JSON.parse(run.text), "harbour dredging costs");
  const { notebook, findings } = crossCheckRetrieval(nb, run.receipts);
  console.log(`[retrieve] cross-check findings=${JSON.stringify(findings)}`);

  const byId = Object.fromEntries(notebook.facts.map((f) => [f.id, f]));
  expect(byId["f-recalled"]!.confidence).toBe("medium");
  expect(byId["f-recalled"]!.confidenceNote).toMatch(/cited, not fetched/);
  // Fetched — and the second one cites the address without www and without the
  // trailing slash it was fetched with. The same page is the same page.
  expect(byId["f-volume"]!.confidence).toBe("high");
  expect(byId["f-rate"]!.confidence).toBe("high");
  // Not high to begin with: nothing to downgrade.
  expect(byId["f-unfetched-low"]!.confidence).toBe("low");
  expect(byId["f-regional"]!.confidence).toBe("medium");

  expect(findings).toHaveLength(1);
  expect(findings[0]).toMatch(/cited, not fetched/);
  expect(findings[0]).toContain("f-recalled");
  expect(findings[0]).toContain("https://example.com/silt-audit-2019");
  // The input is not mutated: the caller's notebook is the record of what the
  // engine said, the returned one is what this app will stand behind.
  expect(nb.facts.find((f) => f.id === "f-recalled")!.confidence).toBe("high");
});

/* ── case 4: no tool call, no "researched" ───────────────────────────────── */

test("retrieve cross-check: zero receipts still requires researchGaps[0] to name the missing search", () => {
  const nb = parseNotebook(NOTEBOOK, "harbour dredging costs");
  let err: unknown;
  try {
    crossCheckRetrieval(nb, []);
  } catch (e) {
    err = e;
  }
  expect(err, "a no-search run whose gaps do not say so was accepted").toBeInstanceOf(NotebookError);
  expect((err as NotebookError).findings.join(" ")).toMatch(/researchGaps\[0\]/);

  const honest: Notebook = { ...nb, researchGaps: ["No search was run in this session; every source is recalled", ...nb.researchGaps] };
  const { notebook, findings } = crossCheckRetrieval(honest, []);
  // Every high fact that cites a URL rests on nothing fetched.
  expect(notebook.facts.filter((f) => f.confidence === "high")).toEqual([]);
  expect(findings.every((f) => /cited, not fetched/.test(f))).toBe(true);
});

test("retrieve route (flag on): a run with zero tool calls is searched:false, and an unconfessed one is refused", async () => {
  process.env.TEXT_RETRIEVE = "1";
  const quiet = [INIT, RESULT];

  const honest = { ...NOTEBOOK, researchGaps: ["No search was run: the session made no tool call", "Earlier seasons were not read"] };
  await withFakeEngine(retrieveCassette(quiet, honest), async () => {
    const { status, json } = await research();
    const e = json.engine as Record<string, unknown>;
    expect(status, String(json.detail)).toBe(200);
    expect(e.provider).toBe("claude-cli-retrieve");
    expect(e.searched).toBe(false);
    expect(e.sources).toEqual([]);
  });

  await withFakeEngine(retrieveCassette(quiet, NOTEBOOK), async () => {
    const { status, json } = await research();
    console.log(`[retrieve] unconfessed -> ${status} ${String(json.detail).slice(0, 160)}`);
    expect(status).toBe(502);
    expect(json.code).toBe("bad-response");
    expect((json.findings as string[]).join(" ")).toMatch(/researchGaps\[0\]/);
  });
});

/* ── cases 2 + 3 through the real route and the real door ────────────────── */

test("retrieve route (flag on): the retrieval door serves, searched is derived from three receipts, the unfetched fact is downgraded", async () => {
  process.env.TEXT_RETRIEVE = "1";
  await withFakeEngine(RECORDED, async (engine) => {
    const { status, json } = await research();
    const e = json.engine as Record<string, unknown>;
    console.log(`[retrieve] route -> ${status} provider=${e?.provider} searched=${e?.searched} sources=${(e?.sources as unknown[])?.length}`);
    expect(status, String(json.detail)).toBe(200);
    expect(e.provider).toBe("claude-cli-retrieve");
    expect(e.kind).toBe("local-claude-code");
    expect(e.transport).toBe("local-subprocess");
    expect(e.searched).toBe(true);
    expect((e.sources as unknown[]).length).toBe(3);
    expect(e.costUsd).toBe(0.4127);
    expect(e.costBasis).toBe("vendor-reported");
    expect((e.crossCheck as string[]).join(" ")).toMatch(/cited, not fetched/);

    const nb = json.notebook as Notebook;
    expect(nb.facts.find((f) => f.id === "f-recalled")!.confidence).toBe("medium");
    expect(nb.facts.find((f) => f.id === "f-volume")!.confidence).toBe("high");

    // One turn, through the retrieval door — not a reasoning turn behind it.
    const turns = engine.turns();
    expect(turns).toHaveLength(1);
    const argv = turns[0]!.argv;
    expect(argv[argv.indexOf("--allowed-tools") + 1]).toBe("WebSearch,WebFetch");
    expect(argv[argv.indexOf("--output-format") + 1]).toBe("stream-json");
  });
});

test("retrieve door: the caller's signal ends the run, and an aborted signal spawns nothing", async () => {
  await withFakeEngine(retrieveCassette(TURN.stream, NOTEBOOK, { slowMs: 20_000 }), async (engine) => {
    const already = new AbortController();
    already.abort();
    const e1 = await runClaudeRetrieve("# RETRIEVE cancel\n", { signal: already.signal }).catch((e: unknown) => e);
    expect(e1).toBeInstanceOf(CliError);
    expect((e1 as CliError).kind).toBe("cancelled");
    expect((e1 as CliError).spawned).toBe(false);
    expect(engine.turns()).toHaveLength(0);

    const ac = new AbortController();
    const started = Date.now();
    const pending = runClaudeRetrieve("# RETRIEVE cancel\n", { signal: ac.signal }).catch((e: unknown) => e);
    setTimeout(() => ac.abort(), 1_500);
    const e2 = await pending;
    expect(e2).toBeInstanceOf(CliError);
    expect((e2 as CliError).kind).toBe("cancelled");
    expect((e2 as CliError).spawned).toBe(true);
    expect(Date.now() - started, "the cancel waited for the engine").toBeLessThan(15_000);
  });
});

/* ── case 6: the flag ────────────────────────────────────────────────────── */

test("retrieve flag: only an explicit 1/on/true turns retrieval on", () => {
  for (const v of [undefined, "", "0", "off", "false", "yes", "TEXT_RETRIEVE"]) {
    if (v === undefined) delete process.env.TEXT_RETRIEVE;
    else process.env.TEXT_RETRIEVE = v;
    expect(retrievalEnabled(), `TEXT_RETRIEVE=${String(v)}`).toBe(false);
  }
  for (const v of ["1", "on", "true", " ON "]) {
    process.env.TEXT_RETRIEVE = v;
    expect(retrievalEnabled(), `TEXT_RETRIEVE=${v}`).toBe(true);
  }
});

test("retrieve flag off: the pre-flight names the retrieval candidate as policy-forbidden, and retrieve() refuses", async () => {
  await withFakeEngine(RECORDED, async (engine) => {
    const res = await GET(req("GET"));
    const pf = (await res.json()) as { serving: string | null; searched: boolean; candidates: { provider: string; ok: boolean; detail: string }[] };
    console.log(`[retrieve] preflight off -> serving=${pf.serving} candidates=${JSON.stringify(pf.candidates.map((c) => [c.provider, c.ok]))}`);
    expect(res.status).toBe(200);
    const r = pf.candidates.find((c) => c.provider === "claude-cli-retrieve");
    expect(r, "the retrieval candidate is missing from the pre-flight").toBeTruthy();
    expect(r!.ok).toBe(false);
    expect(r!.detail).toMatch(/TEXT_RETRIEVE/);
    expect(pf.serving).toBe("claude-cli");
    expect(pf.searched).toBe(false);

    const err = await retrieve({ prompt: "# RETRIEVE off\n", turn: "research" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TextError);
    expect((err as TextError).kind).toBe("policy-forbidden");
    expect(engine.turns(), "a forbidden rung was spawned").toHaveLength(0);
  });
});

test("retrieve flag off: the POST is today's run — the reasoning door, searched:false, no receipt fields", async () => {
  const reasoned: Cassette = {
    name: "research-reasoned-inline",
    source: "hand-written",
    recordedAt: "2026-10-06",
    cliVersion: "2.1.289",
    cliArgsFingerprint: cliArgsFingerprint(),
    turns: [
      {
        prompt: null,
        mode: "ok",
        envelope: {
          type: "result",
          subtype: "success",
          is_error: false,
          duration_ms: 51000,
          num_turns: 1,
          session_id: "00000000-fake-4000-8000-0000000000r0",
          total_cost_usd: 0.2,
        },
        resultJson: { ...NOTEBOOK, researchGaps: ["No search was run; every source is a recollection"] },
      },
    ],
  };
  await withFakeEngine(reasoned, async (engine) => {
    const { status, json } = await research();
    const e = json.engine as Record<string, unknown>;
    expect(status, String(json.detail)).toBe(200);
    expect(e.provider).toBe("claude-cli");
    expect(e.searched).toBe(false);
    expect(Object.keys(e)).not.toContain("sources");
    expect(Object.keys(e)).not.toContain("crossCheck");
    // Not cross-checked: the reasoning path's notebook is exactly what it was.
    const nb = json.notebook as Notebook;
    expect(nb.facts.find((f) => f.id === "f-recalled")!.confidence).toBe("high");

    const turns = engine.turns();
    expect(turns).toHaveLength(1);
    const argv = turns[0]!.argv;
    expect(argv[argv.indexOf("--allowed-tools") + 1]).toBe("");
    expect(argv[argv.indexOf("--max-turns") + 1]).toBe("1");
    expect(argv).not.toContain("stream-json");
  });
});
