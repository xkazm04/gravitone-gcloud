// LANE — THE MULTI-MODEL CRITIQUE (scope amendment 1), offline.
//
// lib/agent/cliSeam.ts (four engines, one read-only reviewer profile),
// lib/articles/critique.ts (the panel, the schema, the record) and the
// `critique` step of lib/articles/engine.ts, driven end to end with
// tests/fixtures/articles/stub-agent.mjs standing in for ALL FOUR CLIs through
// the real seam (ARTICLES_AGENT_BIN, ARTICLES_CODEX_BIN, ARTICLES_GROK_BIN,
// ARTICLES_AGY_BIN). Nothing spends, nothing reaches the network, the real
// registry is never named. What is pinned:
//
//   · each engine's argv and its read-only fence; the reviewer environment
//   · each engine's envelope, a 402 and a usage-limit text included, and the
//     outcome each classifies as
//   · the review / dispositions / decision schemas, refused when malformed
//   · the flow: keep after round 1; rewrite then keep; research then rewrite;
//     a last-round rewrite is not re-reviewed; one reviewer unavailable
//     continues; quorum short is `critique-quorum`; resume inside the step
//     never re-runs a reviewer whose review exists; a malformed review gets one
//     retry; a reviewer's write is recorded
//   · the `critique` check item; the registry write-back of the block and
//     critique/{reviews,dispositions}.json against the throwaway registry
//   · the review prompt's lenses and contract, the writer's critique phases
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

import {
  agentArgs,
  classifyOutcome,
  parseAgyEnvelope,
  parseCodexEvents,
  parseEngineEnvelope,
  parseEnvelope,
  parseGrokEnvelope,
  resolveEngineBin,
  REVIEW_POINTER,
  reviewerCommand,
  reviewerEnv,
  runReviewer,
} from "@/lib/agent/cliSeam";
import {
  critiqueCheckItem,
  extractJsonObject,
  loadPanel,
  readCritiqueDetail,
  registryCritique,
  scrubHomePaths,
  validateDecision,
  validateDispositions,
  validatePanel,
  validateReview,
} from "@/lib/articles/critique";
import { approveRun, createRun, defaultDeps, driveRun, getRunDetail, resumeRun } from "@/lib/articles/engine";
import { buildPrompt, buildReviewPrompt, loadPromptFile, loadReviewPromptFile } from "@/lib/articles/prompt";
import { runDir } from "@/lib/articles/store";
import type { CritiqueDetail, Review } from "@/lib/articles/types";

import { keepEnv } from "./_helpers";
import { ARTICLE_ENV, articleSandbox, ROOT, type ArticleSandbox } from "./_articles";

keepEnv([...ARTICLE_ENV, "PROBE_FAKE_API_KEY", "PROBE_SECRET_THING"]);
test.describe.configure({ timeout: 180_000 });

let box: ArticleSandbox;
test.beforeEach(() => {
  box = articleSandbox();
});
test.afterEach(() => box.cleanup());

const deps = () => defaultDeps({ render: false });
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" });
const at = (id: string, rel: string) => path.join(runDir(id), ...rel.split("/"));
const json = <T>(id: string, rel: string) => JSON.parse(readFileSync(at(id, rel), "utf8")) as T;
const argvLog = () =>
  existsSync(path.join(box.dir, "argv.log"))
    ? readFileSync(path.join(box.dir, "argv.log"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as { engine: string; argv: string[]; entries: string[]; credentialVars: string[] })
    : [];

async function toGate(text = "the token tax") {
  const run = await createRun({ topic: { kind: "free", text } }, deps());
  return driveRun(run.id, deps());
}

/* ── the seam: four engines ───────────────────────────────────────────── */

const call = { model: "m", effort: "high", cwd: "C:/ws", prompt: "ARTICLE-REVIEW …", timeoutMin: 25 };

test("argv: each engine's read-only fence", () => {
  // claude: the writer's fence, research and read only
  const c = reviewerCommand({ ...call, engine: "claude", model: "claude-fable-5-1" });
  expect(c.argv).toEqual(agentArgs({ model: "claude-fable-5-1", effort: "high", tools: ["WebSearch", "WebFetch", "Read"] }));
  expect(c.argv[c.argv.indexOf("--tools") + 1]).toBe("WebSearch,WebFetch,Read");
  expect(c.argv[c.argv.indexOf("--allowed-tools") + 1]).toBe("WebSearch,WebFetch,Read");
  expect(c.argv).toEqual(expect.arrayContaining(["--restricted", "--safe-mode", "--strict-mcp-config", "--disable-slash-commands", "--no-session-persistence"]));
  expect(c.argv.join(" ")).not.toMatch(/Write|Edit|Bash|bypassPermissions/);
  expect(c.stdin).toBe(call.prompt);

  // codex: read-only sandbox, live web search, the operator's config ignored, prompt on stdin
  const x = reviewerCommand({ ...call, engine: "codex", model: "gpt-6-astra" });
  expect(x.argv.slice(0, 6)).toEqual(["exec", "--json", "--skip-git-repo-check", "--ephemeral", "--ignore-user-config", "--ignore-rules"]);
  expect(x.argv[x.argv.indexOf("--sandbox") + 1]).toBe("read-only");
  expect(x.argv[x.argv.indexOf("-C") + 1]).toBe("C:/ws");
  expect(x.argv[x.argv.indexOf("-m") + 1]).toBe("gpt-6-astra");
  expect(x.argv).toEqual(expect.arrayContaining(['model_reasoning_effort="high"', 'web_search="live"']));
  expect(x.argv.at(-1)).toBe("-");
  expect(x.argv.join(" ")).not.toMatch(/dangerously|workspace-write|danger-full-access/);
  expect(x.stdin).toBe(call.prompt);
  expect(reviewerCommand({ ...call, engine: "codex", effort: "max" }).argv).toContain('model_reasoning_effort="xhigh"');

  // agy: the slug carries the effort, the prompt is a pointer, stdin closed empty
  const a = reviewerCommand({ ...call, engine: "agy", model: "gemini-3.8-flash" });
  expect(a.argv.slice(0, 2)).toEqual(["-p", REVIEW_POINTER]);
  expect(a.argv[a.argv.indexOf("--model") + 1]).toBe("gemini-3.8-flash-high");
  expect(a.argv).toEqual(expect.arrayContaining(["--output-format", "json", "--sandbox", "--disable-slash-commands", "--dangerously-skip-permissions"]));
  expect(a.argv[a.argv.indexOf("--print-timeout") + 1]).toBe("25m");
  expect(a.argv).not.toContain("--effort");
  expect(a.stdin).toBe("");
  expect(reviewerCommand({ ...call, engine: "agy", model: "gemini-3.8-flash", effort: "max" }).argv).toContain("gemini-3.8-flash-high");
  expect(reviewerCommand({ ...call, engine: "agy", model: "gemini-3.8-flash-medium" }).argv).toContain("gemini-3.8-flash-medium");

  // grok (argv unproven against a live session: 402): plan mode, no subagents, memory off
  const g = reviewerCommand({ ...call, engine: "grok", model: "grok-4.7" });
  expect(g.argv.slice(0, 2)).toEqual(["-p", REVIEW_POINTER]);
  expect(g.argv[g.argv.indexOf("-m") + 1]).toBe("grok-4.7");
  expect(g.argv[g.argv.indexOf("--effort") + 1]).toBe("high");
  expect(g.argv[g.argv.indexOf("--cwd") + 1]).toBe("C:/ws");
  expect(g.argv[g.argv.indexOf("--permission-mode") + 1]).toBe("plan");
  expect(g.argv).toContain("--no-subagents");
  expect(g.argv.join(" ")).not.toMatch(/always-approve|bypassPermissions/);
  expect(g.env).toEqual({ GROK_MEMORY: "0", GROK_AGENT_DASHBOARD: "0" });
  expect(g.stdin).toBe("");
});

test("environment: a reviewer sees no credential-named variable and no metered key", () => {
  const env = reviewerEnv("codex", { PATH: "/bin", ANTHROPIC_API_KEY: "sk", PROBE_FAKE_API_KEY: "x", PROBE_SECRET_THING: "y", GH_TOKEN: "z", HOME: "/h" } as unknown as NodeJS.ProcessEnv);
  expect(Object.keys(env).sort()).toEqual(["HOME", "PATH"]);
  expect(reviewerEnv("grok", { PATH: "/bin" } as unknown as NodeJS.ProcessEnv)).toMatchObject({ PATH: "/bin", GROK_MEMORY: "0", GROK_AGENT_DASHBOARD: "0" });
});

test("binaries: an override wins; a CLI that is not installed is unavailable, by name", () => {
  expect(resolveEngineBin("codex", { ARTICLES_CODEX_BIN: "node|x.mjs|--as=codex" })).toEqual([process.execPath, "x.mjs", "--as=codex"]);
  let msg = "";
  try {
    resolveEngineBin("codex", { PATH: "" });
  } catch (e) {
    msg = (e as Error).message;
  }
  expect(msg).toMatch(/codex.*CLI was not found.*ARTICLES_CODEX_BIN/);
  expect(classifyOutcome({ final: "", errors: [msg], turns: 0 }, { exit: null, timedOut: false })).toBe("unavailable");
});

test("envelopes: each engine's success, a 402 and a usage limit", () => {
  const review = '{"verdict":"publish","summary":"s","findings":[]}';
  const outcome = (p: ReturnType<typeof parseEnvelope>, exit: number) => classifyOutcome(p, { exit, timedOut: false });

  // claude
  const c = parseEngineEnvelope("claude", JSON.stringify({ subtype: "success", result: review, num_turns: 4, total_cost_usd: 0.42 }));
  expect(c).toMatchObject({ final: review, turns: 4, costUsd: 0.42 });
  expect(outcome(c, 0)).toBe("completed");
  expect(outcome(parseEnvelope(JSON.stringify({ subtype: "error_during_execution", is_error: true, result: "API Error: 402 Payment Required" })), 1)).toBe("unavailable");
  expect(outcome(parseEnvelope(JSON.stringify({ subtype: "error_during_execution", is_error: true, result: "Claude AI usage limit reached" })), 1)).toBe("seat-limit");

  // codex: JSONL events, the last agent_message is final, no cost
  const x = parseCodexEvents(
    [
      { type: "thread.started" },
      { type: "item.completed", item: { type: "agent_message", text: "I'll check." } },
      { type: "item.completed", item: { type: "web_search", query: "q" } },
      { type: "item.completed", item: { type: "agent_message", text: review } },
      { type: "turn.completed", usage: {} },
    ]
      .map((l) => JSON.stringify(l))
      .join("\n"),
  );
  expect(x).toEqual({ final: review, errors: [], turns: 1 });
  expect(outcome(x, 0)).toBe("completed");
  const unsupported = parseCodexEvents(`${JSON.stringify({ type: "error", message: "The 'gpt-6.1-astra' model is not supported when using Codex with a ChatGPT account." })}\n${JSON.stringify({ type: "turn.failed", error: { message: "x" } })}`);
  expect(outcome(unsupported, 1)).toBe("unavailable");
  expect(outcome(parseCodexEvents(JSON.stringify({ type: "error", message: "You've hit your usage limit." })), 1)).toBe("seat-limit");
  expect(parseCodexEvents(`${JSON.stringify({ type: "error", message: "Reconnecting... 1/5" })}\n${JSON.stringify({ type: "turn.completed" })}`).errors, "a reconnect notice is not an error").toEqual([]);
  expect(outcome(parseCodexEvents(""), 0)).toBe("errored");

  // agy: status is the verdict; a denied tool with nothing said is an error
  expect(parseAgyEnvelope(JSON.stringify({ status: "SUCCESS", response: review, num_turns: 1 }))).toEqual({ final: review, errors: [], turns: 1 });
  const denied = parseAgyEnvelope(JSON.stringify({ status: "SUCCESS", response: "", num_turns: 1, denied_actions: [{ action: "read_url" }] }));
  expect(denied.errors[0]).toMatch(/denied: read_url/);
  expect(outcome(denied, 0)).toBe("errored");
  expect(outcome(parseAgyEnvelope(JSON.stringify({ status: "ERROR", error: "RESOURCE_EXHAUSTED: quota exceeded" })), 0)).toBe("seat-limit");
  expect(parseAgyEnvelope("banner\n").errors).toEqual(["no JSON envelope on stdout"]);

  // grok: the 402 envelope observed on 2026-10-05, and the contest runner's success shape
  const g402 = parseGrokEnvelope(JSON.stringify({ type: "error", message: 'Internal error: {\n  "message": "API error (status 402 Payment Required): Grok Build usage balance exhausted",\n  "http_status": 402\n}' }));
  expect(g402.errors[0]).toMatch(/402 Payment Required/);
  expect(outcome(g402, 1)).toBe("unavailable");
  expect(outcome(parseGrokEnvelope(JSON.stringify({ type: "error", message: "API error (status 429 Too Many Requests): rate limit", http_status: 429 })), 1)).toBe("seat-limit");
  const gok = parseGrokEnvelope(JSON.stringify({ text: review, stopReason: "end_turn", num_turns: 2, total_cost_usd: 0.31 }));
  expect(gok).toMatchObject({ final: review, errors: [], turns: 2, costUsd: 0.31 });
  expect(outcome(parseGrokEnvelope(JSON.stringify({ text: "", stopReason: "max_turns" })), 0)).toBe("errored");

  // outcomes in order: a timeout is a timeout whatever the envelope says
  expect(classifyOutcome(g402, { exit: 1, timedOut: true })).toBe("timed-out");
});

test("a hung reviewer is killed at its timeout, through the real seam", async () => {
  const ws = path.join(box.dir, "ws");
  mkdirSync(path.join(ws, "post"), { recursive: true });
  writeFileSync(path.join(ws, "sources.json"), "[]");
  writeFileSync(path.join(ws, "REVIEW.md"), "ARTICLE-REVIEW\nREVIEWER: gpt\nROUND: 1\n");
  process.env.STUB_REVIEWERS = "gpt=hang";
  const t0 = Date.now();
  const r = await runReviewer({ engine: "codex", cwd: ws, prompt: "ARTICLE-REVIEW\nREVIEWER: gpt\nROUND: 1\n", model: "m", effort: "high", timeoutMin: 0.05 });
  expect(r.outcome).toBe("timed-out");
  expect(Date.now() - t0).toBeLessThan(30_000);
  // and a workspace that holds anything else is refused before a spawn
  mkdirSync(path.join(ws, "inputs"));
  expect(() => runReviewer({ engine: "codex", cwd: ws, prompt: "x", model: "m", effort: "high", timeoutMin: 1 })).toThrow(/only post\/ and sources\.json and REVIEW\.md/);
});

/* ── the schemas ──────────────────────────────────────────────────────── */

const spec = { id: "gpt", model: "gpt-6-astra", effort: "high" as const };
const finding = (over: Record<string, unknown> = {}) => ({ id: "f1", kind: "factual", severity: "blocker", location: "Section 2", claim: "c", evidence: ["https://example.org/a"], suggestion: "s", ...over });

test("schema: a review is held to the contract; the panel says who reviewed", () => {
  const ok = validateReview(`Here it is:\n\`\`\`json\n${JSON.stringify({ reviewer: "someone-else", verdict: "revise", summary: "s", findings: [finding({ evidence: ["https://example.org/a", "not a url", "ftp://x.org/y"] })] })}\n\`\`\``, spec);
  expect(ok.review).toMatchObject({ reviewer: "gpt", model: "gpt-6-astra", effort: "high", verdict: "revise" });
  expect(ok.review.findings[0].evidence).toEqual(["https://example.org/a"]);
  expect(ok.dropped).toBe(2);
  expect(validateReview(JSON.stringify({ verdict: "publish", summary: "s", findings: [] }), spec).review.findings).toEqual([]);

  const bad = (body: unknown) => () => validateReview(typeof body === "string" ? body : JSON.stringify(body), spec);
  expect(bad("Looks great, ship it!")).toThrow(/no JSON object/);
  expect(bad({ verdict: "maybe", summary: "s", findings: [] })).toThrow(/verdict must be one of publish, revise, rework/);
  expect(bad({ verdict: "publish", summary: "", findings: [] })).toThrow(/summary/);
  expect(bad({ verdict: "publish", summary: "s" })).toThrow(/findings must be an array/);
  expect(bad({ verdict: "revise", summary: "s", findings: [finding({ kind: "opinion" })] })).toThrow(/kind must be one of/);
  expect(bad({ verdict: "revise", summary: "s", findings: [finding({ severity: "huge" })] })).toThrow(/severity/);
  expect(bad({ verdict: "revise", summary: "s", findings: [finding(), finding()] })).toThrow(/"f1" repeats/);
  expect(bad({ verdict: "revise", summary: "s", findings: [finding({ claim: " " })] })).toThrow(/claim is empty/);

  // a reviewer quoting its workspace path does not carry a home path into the registry
  expect(scrubHomePaths("see C:\\Users\\someone\\AppData\\Local\\Temp\\ws\\post\\post.md and /home/al/x/y")).toBe("see ~/AppData\\Local\\Temp\\ws\\post\\post.md and ~/x/y");
  expect(validateReview(JSON.stringify({ verdict: "publish", summary: "read C:/Users/someone/ws/post.md", findings: [] }), spec).review.summary).toBe("read ~/ws/post.md");
  expect(() => extractJsonObject("[1,2]")).toThrow();
});

const reviewsOf = (): Review[] => [
  { reviewer: "fable", model: "m", effort: "high", verdict: "revise", summary: "s", findings: [finding() as Review["findings"][number], finding({ id: "f2", severity: "minor", kind: "format" }) as Review["findings"][number]] },
  { reviewer: "gpt", model: "m", effort: "high", verdict: "publish", summary: "s", findings: [] },
];

test("schema: every finding exactly one disposition with a reason; the decision is a closed word", () => {
  const good = [
    { reviewer: "fable", findingId: "f1", disposition: "accepted", reason: "r", action: "a", round: 9, extra: true },
    { reviewer: "fable", findingId: "f2", disposition: "rejected", reason: "r", action: "  " },
  ];
  expect(validateDispositions(good, reviewsOf())).toEqual([
    { reviewer: "fable", findingId: "f1", disposition: "accepted", reason: "r", action: "a" },
    { reviewer: "fable", findingId: "f2", disposition: "rejected", reason: "r" },
  ]);
  expect(() => validateDispositions([good[0]], reviewsOf())).toThrow(/fable\/f2 has no disposition/);
  expect(() => validateDispositions([...good, good[1]], reviewsOf())).toThrow(/fable\/f2 has 2 dispositions/);
  expect(() => validateDispositions([good[0], { ...good[1], reason: "" }], reviewsOf())).toThrow(/empty reason/);
  expect(() => validateDispositions([...good, { reviewer: "gpt", findingId: "f9", disposition: "accepted", reason: "r" }], reviewsOf())).toThrow(/gpt\/f9, which no review in this round holds/);
  expect(() => validateDispositions([good[0], { ...good[1], disposition: "ignored" }], reviewsOf())).toThrow(/disposition must be one of accepted, rejected, deferred/);
  expect(() => validateDispositions({}, reviewsOf())).toThrow(/must be an array/);

  expect(validateDecision({ decision: "research", rationale: "why" }, 1, false)).toEqual({ round: 1, decision: "research", rationale: "why" });
  expect(() => validateDecision({ decision: "research", rationale: "why" }, 2, true)).toThrow(/keep, rewrite \(this is the last round\)/);
  expect(() => validateDecision({ decision: "keep", rationale: "" }, 1, false)).toThrow(/rationale is empty/);
  expect(() => validateDecision({ decision: "ship" }, 1, false)).toThrow(/decision must be one of/);
});

test("panel: the operator's four reviewers, and a malformed panel is refused by name", async () => {
  const p = await loadPanel(ROOT, {});
  expect(p.reviewers.map((r) => `${r.id}:${r.engine}:${r.model}@${r.effort}/${r.timeoutMin}`)).toEqual([
    "fable:claude:claude-fable-5-1@high/25",
    "grok:grok:grok-4.7@high/25",
    "gemini:agy:gemini-3.8-flash@high/25",
    "gpt:codex:gpt-6-astra@high/25",
  ]);
  expect(p).toMatchObject({ maxCritiqueRounds: 2, minCompleted: 2 });
  const one = { id: "a", engine: "claude", model: "m", effort: "high" };
  expect(() => validatePanel({ reviewers: [one, { ...one }] })).toThrow(/"a" repeats/);
  expect(() => validatePanel({ reviewers: [one, { ...one, id: "b", engine: "gemini" }] })).toThrow(/engine must be one of claude, codex, grok, agy/);
  expect(() => validatePanel({ minCompleted: 1, reviewers: [one, { ...one, id: "b" }] })).toThrow(/minCompleted must be an integer ≥ 2/);
  expect(() => validatePanel({ maxCritiqueRounds: 3, reviewers: [one, { ...one, id: "b" }] })).toThrow(/maxCritiqueRounds/);
  expect(validatePanel({ reviewers: [one, { ...one, id: "b" }] }).reviewers[0].timeoutMin).toBe(25);
});

/* ── the flow ─────────────────────────────────────────────────────────── */

test("flow: keep after round 1 — four reviewers in parallel, the writer answers every finding, the check item passes", async () => {
  process.env.STUB_AGENT_ARGV_LOG = path.join(box.dir, "argv.log");
  const run = await toGate();
  expect(run.status, run.error).toBe("awaiting-approval");
  expect(run.critique).toMatchObject({ rounds: 1, decision: "keep", findings: { total: 8, accepted: 4, rejected: 4, deferred: 0 } });
  expect(run.critique?.reviewers.map((r) => `${r.id}:${r.engine}:${r.outcome}`)).toEqual(["fable:claude:completed", "grok:grok:completed", "gemini:agy:completed", "gpt:codex:completed"]);
  expect(run.critique?.reviewers.every((r) => r.costUsd === undefined), "the stubs report no cost, so none is recorded").toBe(true);
  for (const id of ["fable", "grok", "gemini", "gpt"]) expect(existsSync(at(run.id, `critique/round-1/reviews/${id}.json`)), id).toBe(true);
  expect(json(run.id, "critique/round-1/decision.json")).toMatchObject({ round: 1, decision: "keep" });
  expect(existsSync(at(run.id, "critique/round-1/revised.json"))).toBe(false);
  expect(existsSync(at(run.id, "critique/round-2"))).toBe(false);
  // the writer's answer is the draft's model, with no web
  const writer = json<{ turn: string; outcome: string }>(run.id, "agent/critique-r1-writer.json");
  expect(writer).toMatchObject({ turn: "article-critique-writer", outcome: "completed" });
  const prompt = readFileSync(at(run.id, "agent/critique-r1-writer-prompt.md"), "utf8");
  expect(prompt).toContain("ARTICLE-PHASE: critique");
  expect(prompt).toContain("A hook, a content preview, a through-line");
  // every reviewer saw only its read-only workspace, and no credential
  for (const s of argvLog().filter((l) => !l.entries.includes("inputs"))) {
    expect(s.entries).toEqual(["REVIEW.md", "post", "sources.json"]);
    expect(s.credentialVars, `${s.engine} saw a credential-named variable`).toEqual([]);
  }
  // the reviewers' prompt inlines the standard and the post
  const rp = readFileSync(at(run.id, "critique/round-1/prompts/gemini.md"), "utf8");
  expect(rp).toMatch(/^ARTICLE-REVIEW\nREVIEWER: gemini \(gemini-3\.8-flash, effort high\)\nROUND: 1 of at most 2/);
  expect(rp).toContain("Third person, impersonal, varied rhythm.");
  expect(rp).toContain("# A stub post about tokens");
  // the check's critique item
  const item = (await getRunDetail(run.id)).check?.items.find((i) => i.id === "critique");
  expect(item).toMatchObject({ status: "pass", dimension: "truth", value: "r1 4/4; 4 blocker factual" });
});

test("flow: rewrite then keep — round 2 reviews the revised post", async () => {
  process.env.STUB_CRITIQUE_DECISIONS = "rewrite,keep";
  const run = await toGate();
  expect(run.status, run.error).toBe("awaiting-approval");
  expect(run.critique).toMatchObject({ rounds: 2, decision: "keep" });
  expect(json(run.id, "critique/round-1/revised.json")).toMatchObject({ research: false });
  expect(existsSync(at(run.id, "critique/round-1/researched.json"))).toBe(false);
  expect(readFileSync(at(run.id, "post/post.md"), "utf8")).toContain("The price was revised after review round 1 [2].");
  // round 2 reviewed the REVISED post
  expect(readFileSync(at(run.id, "critique/round-2/prompts/fable.md"), "utf8")).toContain("The price was revised after review round 1 [2].");
  expect(json<{ findings: unknown[] }>(run.id, "critique/round-2/reviews/gpt.json").findings).toHaveLength(1);
  // 4 x 2 round-1 findings + 4 x 1 round-2 findings, every one answered
  expect(run.critique?.findings.total).toBe(12);
  // the draft's patches survive a critique rewrite
  expect((await getRunDetail(run.id)).patches.map((p) => p.id)).toEqual(["p1", "p2"]);
});

test("flow: research then rewrite — new sources keep the old numbers; a last-round rewrite is final", async () => {
  process.env.STUB_AGENT_ARGV_LOG = path.join(box.dir, "argv.log");
  process.env.STUB_CRITIQUE_DECISIONS = "research,rewrite";
  const run = await toGate();
  expect(run.status, run.error).toBe("awaiting-approval");
  expect(json(run.id, "critique/round-1/researched.json")).toMatchObject({ sources: 9, added: 1 });
  expect(json(run.id, "critique/round-1/revised.json")).toMatchObject({ research: true });
  expect(json<{ n: number }[]>(run.id, "sources.json").map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  expect(readFileSync(at(run.id, "post/post.md"), "utf8")).toContain("[9]");
  expect(json(run.id, "agent/critique-r1-research.json")).toMatchObject({ turn: "article-research", outcome: "completed" });
  // the research turn has web tools; the rewrite does not
  const writer = argvLog().filter((l) => l.entries.includes("inputs"));
  const tools = writer.map((l) => l.argv[l.argv.indexOf("--tools") + 1]);
  expect(tools).toEqual(["WebSearch,WebFetch,Read,Write,Edit", "Read,Write,Edit", "Read,Write,Edit", "Read,Write,Edit", "WebSearch,WebFetch,Read,Write,Edit", "Read,Write,Edit", "Read,Write,Edit", "Read,Write,Edit"]);
  // round 2 decided rewrite: the post is rewritten once more and NOT reviewed again
  expect(run.critique).toMatchObject({ rounds: 2, decision: "rewrite" });
  expect(json(run.id, "critique/round-2/revised.json")).toMatchObject({ research: false });
  expect(existsSync(at(run.id, "critique/round-3"))).toBe(false);
  expect(readFileSync(at(run.id, "post/post.md"), "utf8")).toContain("revised after review round 2");
});

test("flow: a critique research that renumbers the sources fails the step by name", async () => {
  process.env.STUB_CRITIQUE_DECISIONS = "research";
  process.env.STUB_RESEARCH = "renumber";
  const run = await toGate();
  expect(run.status).toBe("failed");
  expect(run.error).toMatch(/^critique: round 1 research: out\/sources\.json dropped or renumbered \[1\]/);
  expect(json<unknown[]>(run.id, "sources.json"), "the run's sources are untouched").toHaveLength(8);
});

test("flow: one reviewer unavailable — recorded with its error, the run continues", async () => {
  process.env.STUB_REVIEWERS = "grok=unavailable";
  const run = await toGate();
  expect(run.status, run.error).toBe("awaiting-approval");
  const grok = run.critique?.reviewers.find((r) => r.id === "grok");
  expect(grok).toMatchObject({ outcome: "unavailable", engine: "grok" });
  expect(grok?.error).toMatch(/402 Payment Required/);
  expect(existsSync(at(run.id, "critique/round-1/reviews/grok.json"))).toBe(false);
  expect(json(run.id, "critique/round-1/receipts/grok.json")).toMatchObject({ outcome: "unavailable", attempts: 1 });
  expect(run.critique?.findings.total).toBe(6);
});

test("flow: two of a three-reviewer panel unavailable is critique-quorum, before the check", async () => {
  const panel = path.join(box.dir, "panel.json");
  writeFileSync(
    panel,
    JSON.stringify({
      reviewers: [
        { id: "fable", engine: "claude", model: "claude-fable-5-1", effort: "high" },
        { id: "grok", engine: "grok", model: "grok-4.7", effort: "high" },
        { id: "gpt", engine: "codex", model: "gpt-6-astra", effort: "high" },
      ],
    }),
  );
  process.env.ARTICLES_REVIEWERS_FILE = panel;
  process.env.STUB_REVIEWERS = "grok=unavailable,gpt=seat";
  const run = await toGate();
  expect(run.status).toBe("failed");
  expect(run.error).toMatch(/^critique: critique-quorum: round 1: 1 of 3 reviewers completed, 2 needed \(grok unavailable: .*402.*; gpt seat-limit: You've hit your usage limit\.\)$/);
  expect(run.steps.find((s) => s.name === "critique")?.status).toBe("failed");
  expect(run.steps.some((s) => s.name === "check"), "the check never ran").toBe(false);
  expect(existsSync(at(run.id, "critique/round-1/closed.json"))).toBe(false);
  expect(existsSync(at(run.id, "critique/round-1/decision.json")), "no writer turn without quorum").toBe(false);
  expect(run.critique?.reviewers.map((r) => r.outcome)).toEqual(["completed", "unavailable", "seat-limit"]);
});

test("resume inside the critique: a reviewer whose review exists never runs again", async () => {
  process.env.STUB_AGENT_ARGV_LOG = path.join(box.dir, "argv.log");
  process.env.STUB_REVIEWERS = "grok=unavailable,gemini=unavailable,gpt=unavailable";
  const failed = await toGate();
  expect(failed.error).toMatch(/critique-quorum/);
  const before = argvLog().filter((l) => !l.entries.includes("inputs"));
  expect(before.map((l) => l.engine).sort()).toEqual(["agy", "claude", "codex", "grok"]);

  delete process.env.STUB_REVIEWERS;
  const resumed = await resumeRun(failed.id);
  expect(resumed.status).toBe("critiquing");
  expect(resumed.error).toBeUndefined();
  const done = await driveRun(failed.id, deps());
  expect(done.status, done.error).toBe("awaiting-approval");
  const after = argvLog().filter((l) => !l.entries.includes("inputs")).slice(before.length);
  expect(after.map((l) => l.engine).sort(), "fable (claude) completed before and is not re-run").toEqual(["agy", "codex", "grok"]);
  expect(done.critique?.reviewers.every((r) => r.outcome === "completed")).toBe(true);
  // the research, outline and draft were not re-run either
  expect(argvLog().filter((l) => l.entries.includes("inputs"))).toHaveLength(3 + 1);
});

test("resume inside the critique: an invalid writer answer is retried once, then fails; resume reruns no reviewer", async () => {
  process.env.STUB_AGENT_ARGV_LOG = path.join(box.dir, "argv.log");
  process.env.STUB_DISPOSITIONS = "bad";
  const failed = await toGate();
  expect(failed.status).toBe("failed");
  expect(failed.error).toMatch(/^critique: round 1 writer: dispositions: .*empty reason.*has no disposition/);
  expect(json(failed.id, "agent/critique-r1-writer.json")).toMatchObject({ attempts: 2 });
  expect(existsSync(at(failed.id, "agent/critique-r1-writer-out/dispositions.json")), "the bad answer is kept").toBe(true);
  expect(existsSync(at(failed.id, "critique/round-1/closed.json"))).toBe(true);
  const reviewersBefore = argvLog().filter((l) => !l.entries.includes("inputs")).length;

  delete process.env.STUB_DISPOSITIONS;
  await resumeRun(failed.id);
  const done = await driveRun(failed.id, deps());
  expect(done.status, done.error).toBe("awaiting-approval");
  expect(argvLog().filter((l) => !l.entries.includes("inputs")).length, "a closed round runs no reviewer").toBe(reviewersBefore);
});

test("a malformed review gets one retry; twice malformed is errored; a reviewer's write is recorded", async () => {
  process.env.STUB_REVIEWERS = "gemini=garbage-once,gpt=garbage,fable=write";
  const run = await toGate();
  expect(run.status, run.error).toBe("awaiting-approval");
  expect(json(run.id, "critique/round-1/receipts/gemini.json")).toMatchObject({ outcome: "completed", attempts: 2 });
  expect(json(run.id, "critique/round-1/receipts/gpt.json")).toMatchObject({ outcome: "errored", attempts: 2, errors: [expect.stringMatching(/^malformed review twice: the final message holds no JSON object/)] });
  expect(json(run.id, "critique/round-1/receipts/fable.json")).toMatchObject({ outcome: "completed", wrote: ["notes.txt"] });
  expect(json(run.id, "critique/round-1/receipts/grok.json")).toMatchObject({ outcome: "completed", attempts: 1, dropped: 1 });
});

/* ── the check item and the registry ─────────────────────────────────── */

test("check item: quorum in every round and every blocker factual answered", () => {
  const detail = (over: Partial<CritiqueDetail["rounds"][number]> = {}): CritiqueDetail => ({
    reviewers: [],
    maxRounds: 2,
    minCompleted: 2,
    rounds: [
      {
        round: 1,
        closed: true,
        receipts: ["a", "b"].map((id) => ({ id, engine: "claude", model: "m", effort: "high", outcome: "completed", round: 1, attempts: 1, turns: 1, durationMs: 1, errors: [] })),
        reviews: reviewsOf().map((r, i) => ({ ...r, reviewer: ["a", "b"][i] })),
        dispositions: [
          { reviewer: "a", findingId: "f1", disposition: "rejected", reason: "the page says otherwise" },
          { reviewer: "a", findingId: "f2", disposition: "accepted", reason: "r" },
        ],
        ...over,
      },
    ],
  });
  expect(critiqueCheckItem(detail())).toMatchObject({ id: "critique", status: "pass", value: "r1 2/0; 1 blocker factual" });
  expect(critiqueCheckItem(detail({ dispositions: [] }))).toMatchObject({ status: "fail", detail: ["round 1: blocker factual a/f1 has no disposition with a reason"] });
  const short = detail();
  short.rounds[0].receipts[1].outcome = "unavailable";
  expect(critiqueCheckItem(short)).toMatchObject({ status: "fail", detail: [expect.stringMatching(/round 1: 1 of 0 reviewers completed/)] });
  expect(critiqueCheckItem(undefined)).toMatchObject({ status: "fail", value: "no critique record" });
});

test("write-back: publication.json `critique` and critique/{reviews,dispositions}.json, every round flattened", async () => {
  process.env.STUB_GH_LOG = path.join(box.dir, "gh.log");
  process.env.STUB_REVIEWERS = "grok=unavailable";
  process.env.STUB_CRITIQUE_DECISIONS = "rewrite,keep";
  process.env.STUB_AGENT_COST = "0.5";
  const run = await toGate();
  expect(run.status, run.error).toBe("awaiting-approval");
  await approveRun(run.id, []);
  const landed = await driveRun(run.id, deps());
  expect(landed.status, landed.error).toBe("landed");

  const ref = "refs/heads/article/a-stub-post-about-tokens";
  const base = "publications/a-stub-post-about-tokens";
  const pub = JSON.parse(git(box.origin, "show", `${ref}:${base}/publication.json`));
  const reviews = JSON.parse(git(box.origin, "show", `${ref}:${base}/critique/reviews.json`)) as Record<string, unknown>[];
  const dispositions = JSON.parse(git(box.origin, "show", `${ref}:${base}/critique/dispositions.json`)) as Record<string, unknown>[];

  expect(Object.keys(pub.critique)).toEqual(["rounds", "reviewers", "findings", "decision"]);
  expect(pub.critique).toMatchObject({ rounds: 2, decision: "keep" });
  expect(pub.critique.reviewers).toEqual([
    { id: "fable", engine: "claude", model: "claude-fable-5-1", effort: "high", outcome: "completed", costUsd: 1 },
    { id: "grok", engine: "grok", model: "grok-4.7", effort: "high", outcome: "unavailable" },
    { id: "gemini", engine: "agy", model: "gemini-3.8-flash", effort: "high", outcome: "completed" },
    { id: "gpt", engine: "codex", model: "gpt-6-astra", effort: "high", outcome: "completed" },
  ]);
  // counts are the flattened dispositions'
  expect(pub.critique.findings).toEqual({ total: dispositions.length, accepted: 3, rejected: 3, deferred: 3 });
  expect(dispositions).toHaveLength(9);
  // shapes, key for key, as the registry's gate reads them
  expect(reviews.map((r) => `${r.reviewer}#${r.round}`)).toEqual(["fable#1", "gemini#1", "gpt#1", "fable#2", "gemini#2", "gpt#2"]);
  for (const r of reviews) expect(Object.keys(r)).toEqual(["reviewer", "round", "model", "effort", "verdict", "summary", "findings"]);
  for (const f of reviews.flatMap((r) => r.findings as Record<string, unknown>[])) expect(Object.keys(f)).toEqual(["id", "kind", "severity", "location", "claim", "evidence", "suggestion"]);
  for (const d of dispositions) {
    expect(Object.keys(d).slice(0, 5)).toEqual(["reviewer", "round", "findingId", "disposition", "reason"]);
    expect(Object.keys(d).length === 5 || Object.keys(d)[5] === "action").toBe(true);
  }
  expect(JSON.stringify([pub, reviews, dispositions])).not.toContain("null");
  // the PR says who reviewed
  const gh = JSON.parse(readFileSync(path.join(box.dir, "gh.log"), "utf8").trim()) as string[];
  expect(gh[gh.indexOf("--body") + 1]).toMatch(/- Critique: 2 rounds, decision keep; reviewers fable \(claude claude-fable-5-1\) completed, grok \(grok grok-4\.7\) unavailable/);
  // and the stub gate learned the record (counts, both files, rounds)
  expect(landed.landing?.gates.every((g) => g.ok)).toBe(true);

  // a run with no decided critique writes neither the block nor the directory
  expect(registryCritique(undefined)).toBeUndefined();
  expect(registryCritique(await readCritiqueDetail(path.join(box.dir, "nowhere")))).toBeUndefined();
});

/* ── the prompts ──────────────────────────────────────────────────────── */

test("prompts: the review prompt's lenses and contract; the writer's critique phases fill every slot", async () => {
  const file = await loadReviewPromptFile(ROOT);
  expect(file.sha).toMatch(/^[0-9a-f]{64}$/);
  const p = buildReviewPrompt(file, {
    reviewer: "gpt",
    model: "gpt-6-astra",
    effort: "high",
    round: 2,
    maxRounds: 2,
    topic: { kind: "free", text: "the token tax" },
    standard: "THE-STANDARD-TEXT",
    standardAddress: "recipes/index.json#technical-blog-post-authoring@0.1.0",
    today: "2026-10-05",
    postMd: "# A post\n\nBody [1].",
    sourcesJson: '[{"n":1}]',
  });
  expect(p, "an unfilled slot").not.toMatch(/\{\{[A-Z_0-9]+\}\}/);
  expect(p).not.toContain("section:");
  for (const required of [
    "ARTICLE-REVIEW",
    "LENS: ACCURACY",
    "LENS: ENGAGEMENT",
    "LENS: INSIGHT",
    "LENS: FORMAT",
    "Open the cited pages",
    "WHEN A CLAIM CANNOT BE VERIFIED",
    "NEVER REWRITE THE POST",
    "YOU ARE READ-ONLY",
    "Your whole final message is ONE JSON object",
    '"verdict": "publish" | "revise" | "rework"',
    '"kind": "factual" | "format" | "engagement" | "insight" | "voice"',
    '"severity": "blocker" | "major" | "minor"',
    "THE-STANDARD-TEXT",
    "# A post",
    "This is review round 2",
  ]) {
    expect(p, required).toContain(required);
  }

  const writer = await loadPromptFile(ROOT);
  const ctx = { topic: { kind: "free" as const, text: "t" }, standard: "S", standardAddress: "A", today: "2026-10-05", maxRounds: 2 };
  for (const phase of ["critique", "revise-research", "revise"] as const) {
    const w = buildPrompt(writer, phase, { ...ctx, round: 1 });
    expect(w, `${phase}: an unfilled slot`).not.toMatch(/\{\{[A-Z_0-9]+\}\}/);
    expect(w).toContain(`ARTICLE-PHASE: ${phase}`);
  }
  const first = buildPrompt(writer, "critique", { ...ctx, round: 1 });
  expect(first).toContain('"keep", "rewrite" or "research"');
  for (const contract of ["out/dispositions.json", "out/decision.json", '"findingId"', "accepted", "rejected", "deferred"]) expect(first).toContain(contract);
  const last = buildPrompt(writer, "critique", { ...ctx, round: 2 });
  expect(last).toContain("this is the LAST round");
  expect(last).not.toContain('"keep", "rewrite" or "research"');
  expect(buildPrompt(writer, "revise-research", { ...ctx, round: 1 })).toContain("KEEPS ITS NUMBER and its URL");
});
