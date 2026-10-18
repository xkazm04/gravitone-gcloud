// LANE — THE ARTICLE ENGINE END TO END, offline (lib/articles/engine.ts,
// lib/agent/cliSeam.ts, lib/articles/registryWrite.ts, lib/articles/mediumPackage.ts).
//
// The agent is tests/fixtures/articles/stub-agent.mjs spawned THROUGH THE REAL
// SEAM (ARTICLES_AGENT_BIN), so the argv fence, the isolated workspace and the
// environment strip are exercised, not mocked. The registry is a throwaway
// clone with a bare origin; `gh` is a stub. What is pinned:
//
//   · a run reaches `awaiting-approval` with every file of the run contract
//   · approval lands: a branch on the origin, publication/1 written, approved
//     patches applied (unapproved ones not), the gates run per touched lane,
//     a PR requested — and the medium package built with no script in it
//   · a gate failure leaves the branch LOCAL: nothing pushed, no PR, `failed`
//   · reject records the note; approve/reject refuse the wrong state
//   · agent outcomes: errored and seat-limit fail the step by name; resume
//     re-runs only what did not finish; a hung agent is killed at its timeout
//   · a proposed patch outside knowledge/ and recipes/ never becomes a patch
//   · a run written around a closed trial (seeded on disk): the bundle copied to
//     experiment/, source 1 = the trial's record (ingest refuses anything else),
//     every writer turn and reviewer reads the experiment, the trial prompt
//     sections and the two trial check items; a void, unclosed, dropped, taken,
//     missing or mismatched trial creates nothing
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { agentArgs, assertIsolatedWorkspace, classifyOutcome, parseEnvelope, runAgent } from "@/lib/agent/cliSeam";
import { approveRun, createRun, defaultDeps, driveRun, getRunDetail, rejectRun, resumeRun } from "@/lib/articles/engine";
import { markdownToStoryHtml } from "@/lib/articles/mediumPackage";
import { patchIsSafe } from "@/lib/articles/registryWrite";
import { ArticleError, readRun, runDir } from "@/lib/articles/store";
import type { CreateRunInput, TrialExecRecord, TrialPrereg, TrialRecord, TrialResults, TrialSeal, TrialValidity, TrialVerdict } from "@/lib/articles/types";

import { keepEnv } from "./_helpers";
import { ARTICLE_ENV, articleSandbox, type ArticleSandbox } from "./_articles";

keepEnv(ARTICLE_ENV);
test.describe.configure({ timeout: 120_000 });

let box: ArticleSandbox;
test.beforeEach(() => {
  box = articleSandbox();
});
test.afterEach(() => box.cleanup());

// The rendered check is covered by articles-checks; here it would only add
// browser time to every case.
const deps = () => defaultDeps({ render: false });
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" });
const originHas = (ref: string) => {
  try {
    git(box.origin, "rev-parse", "--verify", "--quiet", ref);
    return true;
  } catch {
    return false;
  }
};

async function toGate(text = "the token tax") {
  const run = await createRun({ topic: { kind: "free", text } }, deps());
  return driveRun(run.id, deps());
}

test("seam: the argv fence — five tools at most, no shell, user configuration excluded", () => {
  const a = agentArgs({ model: "claude-opus-5", effort: "high", tools: ["Read", "Write", "Edit"] });
  expect(a).toEqual(expect.arrayContaining(["-p", "--restricted", "--safe-mode", "--strict-mcp-config", "--no-session-persistence", "--disable-slash-commands"]));
  expect(a[a.indexOf("--tools") + 1]).toBe("Read,Write,Edit");
  expect(a[a.indexOf("--allowed-tools") + 1]).toBe("Read,Write,Edit");
  expect(a[a.indexOf("--permission-prompts") + 1]).toBe("none");
  expect(a.join(" ")).not.toMatch(/Bash|PowerShell|bypassPermissions|dangerously/);
  expect(agentArgs({ model: "m", effort: "high" })[agentArgs({ model: "m", effort: "high" }).indexOf("--tools") + 1]).toBe("WebSearch,WebFetch,Read,Write,Edit");
  expect(() => agentArgs({ model: "m", effort: "high", tools: ["Bash" as never] })).toThrow(/not allowed/);
  expect(() => assertIsolatedWorkspace(box.dir)).toThrow(/only inputs\/ and out\//);
});

test("seam: outcomes are the contest runner's", () => {
  expect(classifyOutcome(parseEnvelope('{"subtype":"success","result":"ok","num_turns":2,"total_cost_usd":0.5}'), { exit: 0, timedOut: false })).toBe("completed");
  expect(parseEnvelope('banner\n{"subtype":"success","result":"ok","num_turns":2,"total_cost_usd":0.5}')).toMatchObject({ final: "ok", turns: 2, costUsd: 0.5 });
  expect(parseEnvelope('{"subtype":"success","result":"ok"}').costUsd).toBeUndefined();
  expect(classifyOutcome(parseEnvelope('{"subtype":"error_during_execution","is_error":true,"result":"Claude AI usage limit reached"}'), { exit: 1, timedOut: false })).toBe("seat-limit");
  expect(classifyOutcome(parseEnvelope('{"subtype":"error_max_turns","is_error":true,"result":"x"}'), { exit: 1, timedOut: false })).toBe("errored");
  expect(classifyOutcome(parseEnvelope("not json"), { exit: 0, timedOut: false })).toBe("errored");
  expect(classifyOutcome(parseEnvelope(""), { exit: null, timedOut: true })).toBe("timed-out");
});

test("seam: a hung agent is killed at its timeout and reported timed-out", async () => {
  const ws = path.join(box.dir, "ws");
  mkdirSync(path.join(ws, "inputs"), { recursive: true });
  process.env.STUB_AGENT_MODE = "hang";
  const t0 = Date.now();
  const r = await runAgent({ cwd: ws, prompt: "ARTICLE-PHASE: research", model: "m", effort: "low", timeoutMin: 0.05, turn: "article-research" });
  expect(r.outcome).toBe("timed-out");
  expect(Date.now() - t0).toBeLessThan(30_000);
});

test("run to the gate: every file of the run contract, through the real seam", async () => {
  process.env.ANTHROPIC_API_KEY = "sk-ant-probe-must-not-reach-the-agent";
  process.env.STUB_AGENT_ARGV_LOG = path.join(box.dir, "argv.log");
  const run = await toGate();
  expect(run.status, run.error).toBe("awaiting-approval");
  expect(run.steps.map((s) => `${s.name}:${s.status}`)).toEqual(["research:done", "outline:done", "draft:done", "critique:done", "check:done"]);
  // the stub reports no cost, so none is recorded — never a zero
  expect(run.steps.every((s) => s.costUsd === undefined)).toBe(true);
  expect(run.standard.version).toBe("0.1.0");
  expect(run.promptRef.file).toBe("pipeline/ARTICLE-POST-PROMPT.md");
  const dir = runDir(run.id);
  for (const f of ["sources.json", "claims.json", "outline.md", "post/index.html", "post/post.md", "post/meta.json", "post/figures/01-figure-1.svg", "check.json", "patches.json", "patches/p1.patch", "agent/research.json", "agent/draft-prompt.md"]) {
    expect(existsSync(path.join(dir, f)), f).toBe(true);
  }
  const seen = readFileSync(path.join(box.dir, "argv.log"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  // three writer turns, four reviewers (one per engine), one writer answer
  expect(seen).toHaveLength(8);
  const writer = seen.filter((s) => s.entries.includes("inputs"));
  const reviewers = seen.filter((s) => !s.entries.includes("inputs"));
  expect(writer).toHaveLength(4);
  for (const s of seen) expect(s.meteredKeyVisible, "the metered key reached the agent").toBe(false);
  for (const s of writer) {
    expect(s.entries).toEqual(["inputs", "out"]);
    expect(s.argv).toContain("--restricted");
  }
  expect(writer[0].argv[writer[0].argv.indexOf("--tools") + 1]).toBe("WebSearch,WebFetch,Read,Write,Edit");
  expect(writer[2].argv[writer[2].argv.indexOf("--tools") + 1]).toBe("Read,Write,Edit");
  expect(reviewers.map((s) => s.engine).sort()).toEqual(["agy", "agy", "claude", "codex"]);
  for (const s of reviewers) expect(s.entries, `${s.engine}'s workspace`).toEqual(["REVIEW.md", "post", "sources.json"]);

  const detail = await getRunDetail(run.id);
  expect(detail.sources).toHaveLength(8);
  expect(detail.patches.map((p) => p.id)).toEqual(["p1", "p2"]);
  expect(detail.patches[1].diff).toMatch(/^new file mode/m);
  expect(detail.check?.dimensions.truth).toBe("pass");
  expect(detail.post).toBe("post/index.html");
});

test("approve lands: branch pushed, publication written, approved patch applied, PR requested", async () => {
  // Landing drives git worktree/push/gate children: 18-26 s idle, past the 120 s
  // describe budget under saturating load. Inherent work, so a longer budget.
  test.slow();
  process.env.STUB_GH_LOG = path.join(box.dir, "gh.log");
  const run = await toGate();
  await approveRun(run.id, ["p1"]);
  const landed = await driveRun(run.id, deps());
  expect(landed.status, landed.error).toBe("landed");
  expect(landed.landing).toMatchObject({ slug: "a-stub-post-about-tokens", branch: "article/a-stub-post-about-tokens", prUrl: "https://example.invalid/xkazm04/ai-registry/pull/1", medium: "medium" });
  expect(landed.landing?.worktree, "the worktree is removed on success").toBeUndefined();
  expect(landed.landing?.gates.map((g) => `${g.lane}:${g.mode}:${g.ok}`)).toEqual(["publications:write:true", "publications:check:true", "knowledge:write:true", "knowledge:check:true"]);

  const ref = "refs/heads/article/a-stub-post-about-tokens";
  expect(originHas(ref)).toBe(true);
  const pub = JSON.parse(git(box.origin, "show", `${ref}:publications/a-stub-post-about-tokens/publication.json`));
  expect(pub).toMatchObject({ schema: "publication/1", slug: "a-stub-post-about-tokens", status: "approved", standard: { recipe: "technical-blog-post-authoring", version: "0.1.0", bundle: "technical-writing" } });
  expect(pub.sources).toHaveLength(8);
  expect(pub.figures).toHaveLength(5);
  expect(pub.figures[0]).toEqual({ file: "figures/01-figure-1.svg", caption: "Figure 1: a labelled diagram of step 1 [1]", sources: [1] });
  expect("costUsd" in pub.run).toBe(false);
  expect(Object.values(pub).includes(null)).toBe(false);
  const files = git(box.origin, "ls-tree", "-r", "--name-only", ref).split("\n");
  expect(files).toEqual(expect.arrayContaining(["publications/a-stub-post-about-tokens/post.html", "publications/a-stub-post-about-tokens/SOURCES.md", "publications/a-stub-post-about-tokens/medium/story.html", "publications/index.json"]));
  expect(files.some((f) => f.endsWith(".png")), "the registry is text-only").toBe(false);
  // p1 approved -> applied; p2 not approved -> absent
  expect(git(box.origin, "show", `${ref}:knowledge/technical-writing/craft/article-structure/article-structure.md`)).toContain("A content preview states the read time it can honour [5].");
  expect(files.some((f) => f.endsWith("stub--read-time.md"))).toBe(false);
  expect(git(box.origin, "log", "-1", "--format=%an", ref).trim()).toBe("Fixture");

  const gh = JSON.parse(readFileSync(path.join(box.dir, "gh.log"), "utf8").trim());
  expect(gh.slice(0, 2)).toEqual(["pr", "create"]);
  expect(gh[gh.indexOf("--head") + 1]).toBe("article/a-stub-post-about-tokens");
  expect(gh[gh.indexOf("--base") + 1]).toBe("main");

  const story = readFileSync(path.join(runDir(run.id), "medium", "story.html"), "utf8");
  expect(story).not.toMatch(/<script|<style|class=/i);
  expect(story).toContain('<img src="figures/01-figure-1.png"');
  expect(existsSync(path.join(runDir(run.id), "medium", "figures", "01-figure-1.png"))).toBe(true);
  expect(readFileSync(path.join(runDir(run.id), "medium", "tags.txt"), "utf8").trim().split("\n")).toHaveLength(5);
});

test("a gate failure leaves the branch local: nothing pushed, no PR, status failed with the gate output", async () => {
  // Landing drives git worktree/push/gate children: 18-26 s idle, past the 120 s
  // describe budget under saturating load. Inherent work, so a longer budget.
  test.slow();
  process.env.STUB_GH_LOG = path.join(box.dir, "gh.log");
  const run = await toGate();
  // the stub gate fails any publication whose title asks it to
  const meta = path.join(runDir(run.id), "post", "meta.json");
  writeFileSync(meta, JSON.stringify({ ...JSON.parse(readFileSync(meta, "utf8")), title: "FAIL-GATE post" }));
  await approveRun(run.id, []);
  const r = await driveRun(run.id, deps());
  expect(r.status).toBe("failed");
  expect(r.error).toMatch(/^landing: registry gate failed: --lane publications exited 1/);
  expect(r.landing?.branch).toBe("article/fail-gate-post");
  expect(r.landing?.worktree && existsSync(r.landing.worktree), "the worktree is kept for inspection").toBeTruthy();
  expect(r.landing?.prUrl).toBeUndefined();
  expect(originHas("refs/heads/article/fail-gate-post"), "a red tree was pushed").toBe(false);
  expect(git(box.registry, "branch", "--list", "article/fail-gate-post").trim()).toContain("article/fail-gate-post");
  expect(existsSync(path.join(box.dir, "gh.log")), "gh was called for a red tree").toBe(false);
  expect(readFileSync(path.join(runDir(run.id), "landing.log"), "utf8")).toMatch(/title asks the gate to fail/);
  git(box.registry, "worktree", "remove", "--force", r.landing!.worktree!);
});

test("reject records the note; the gate's verbs refuse the wrong state and unknown patches", async () => {
  const run = await toGate();
  await expect(approveRun(run.id, ["p9"])).rejects.toMatchObject({ code: "bad-patch" });
  await expect(rejectRun(run.id, "  ")).rejects.toMatchObject({ code: "bad-note" });
  const r = await rejectRun(run.id, "Figures carry paragraphs.");
  expect(r.status).toBe("rejected");
  expect(r.rejection?.note).toBe("Figures carry paragraphs.");
  await expect(approveRun(run.id, [])).rejects.toBeInstanceOf(ArticleError);
  await expect(resumeRun(run.id)).rejects.toMatchObject({ code: "bad-transition" });
});

test("agent failures: errored and seat-limit fail the step by name; resume re-runs only what did not finish", async () => {
  process.env.STUB_AGENT_MODE = "seat";
  const created = await createRun({ topic: { kind: "free", text: "seat" } }, deps());
  const seat = await driveRun(created.id, deps());
  expect(seat.status).toBe("failed");
  expect(seat.error).toMatch(/^research: the agent seat-limit/);

  process.env.STUB_AGENT_MODE = "garbage";
  await resumeRun(created.id);
  const garbage = await driveRun(created.id, deps());
  expect(garbage.error).toMatch(/^research: sources.json: /);
  expect(existsSync(path.join(runDir(created.id), "agent", "research-out", "sources.json")), "the bad output is kept").toBe(true);

  delete process.env.STUB_AGENT_MODE;
  process.env.STUB_AGENT_COST = "0.25";
  const resumed = await resumeRun(created.id);
  expect(resumed.status).toBe("researching");
  const done = await driveRun(created.id, deps());
  expect(done.status).toBe("awaiting-approval");
  // cost accumulates per step across attempts that reported one
  expect(done.steps.find((s) => s.name === "research")?.costUsd).toBe(0.25);
  expect(done.steps.find((s) => s.name === "check")?.costUsd).toBeUndefined();
});

test("a proposal outside knowledge/ and recipes/ never becomes a patch", async () => {
  process.env.STUB_AGENT_BAD_PATCH = "1";
  const run = await toGate();
  const detail = await getRunDetail(run.id);
  expect(detail.patches.map((p) => p.target).every((t) => t.startsWith("knowledge/"))).toBe(true);
  const rejected = JSON.parse(readFileSync(path.join(runDir(run.id), "patches.rejected.json"), "utf8"));
  expect(rejected[0].reason).toMatch(/target must be under knowledge\/ or recipes\//);
  expect(patchIsSafe("--- a/scripts/gate.mjs\n+++ b/scripts/gate.mjs\n").ok).toBe(false);
  expect(patchIsSafe("--- a/knowledge/x/../../scripts/a.md\n+++ b/knowledge/x/../../scripts/a.md\n").ok).toBe(false);
  expect(patchIsSafe("--- /dev/null\n+++ b/knowledge/t/a.md\n").ok).toBe(true);
});

test("a run on a registry subject records the subject and reads its golden path", async () => {
  const run = await createRun({ topic: { kind: "subject", bundle: "software-engineering", subject: "token-budgeting", text: "" } }, deps());
  expect(run.topic).toEqual({ kind: "subject", bundle: "software-engineering", subject: "token-budgeting", text: "Token budgeting" });
  await expect(createRun({ topic: { kind: "subject", bundle: "software-engineering", subject: "nope", text: "" } }, deps())).rejects.toMatchObject({ code: "no-subject" });
  await expect(createRun({ topic: { kind: "free", text: "x" }, effort: "huge" as never }, deps())).rejects.toMatchObject({ code: "bad-effort" });
  const done = await driveRun(run.id, deps());
  expect(done.status).toBe("awaiting-approval");
  expect(readFileSync(path.join(runDir(run.id), "agent", "research-prompt.md"), "utf8")).toContain("Budgets are counted in tokens, not characters.");
  expect((await readRun(run.id)).steps).toHaveLength(5);
});

test("medium story: the Markdown subset, figures as PNG with captions", () => {
  const html = markdownToStoryHtml("# T\n\n*Sub*\n\nA [link](https://x.org) and `code` [1].\n\n![Fig 1 [2]](figures/01-a.png)\nFig 1 shows a thing [2]\n\n```js\nconst a = 1 < 2;\n```\n\n- one\n- two\n");
  expect(html).toContain("<h1>T</h1>");
  expect(html).toContain('<a href="https://x.org">link</a>');
  expect(html).toContain('<figure><img src="figures/01-a.png" alt="Fig 1 [2]"><figcaption>Fig 1 shows a thing [2]</figcaption></figure>');
  expect(html).toContain("<pre><code>const a = 1 &lt; 2;</code></pre>");
  expect(html).toContain("<ul><li>one</li><li>two</li></ul>");
});

/* ── a run written around a trial (2026-10-18) ─────────────────────────────── */
//
// A closed trial is seeded on disk exactly as the trial store lays it out (lib/articles/types.ts,
// "the trial"), never through the trial verbs: these cases pin what the ENGINE does with one.
// The fixture's numbers follow the verdict rule (metric lower-is-better, band 2 absolute,
// delta -10 with the golden arm eligible: upheld).

keepEnv(["ARTICLES_TRIALS_DIR", "ARTICLES_REGISTRY_REMOTE", "ARTICLES_LEADS_FILE", "STUB_TRIAL_SOURCE"]);

const TRIAL_SUBJECT_FILE = "knowledge/software-engineering/llm-agent/token-budgeting/token-budgeting.md";
const TRIAL_TECHNIQUE = "knowledge/software-engineering/llm-agent/token-budgeting/techniques/count-before-send.md";
const TRIAL_APPLICATION = "knowledge/software-engineering/llm-agent/token-budgeting/applications/node--count-before-send.md";
const TRIAL_PREREG: TrialPrereg = {
  schema: "article-trial-prereg/1",
  subject: { bundle: "software-engineering", slug: "token-budgeting" },
  technique: "count-before-send",
  claim: "Count the request's tokens with the model's own tokenizer before sending it.",
  alternative: { name: "character estimate", description: "Divide the character count by four and send when under the window.", source: { url: "https://example.org/docs/estimate", title: "Estimating tokens", date: "2026-05-01" } },
  prior: "The tokenizer count prevents overflows that the estimate lets through.",
  question: "Does counting with the model's tokenizer prevent more context overflows than a characters-over-four estimate?",
  arms: [
    { id: "golden", label: "counted", description: "Count with the model's tokenizer, then send." },
    { id: "alternative", label: "estimate", description: "Estimate characters over four, then send." },
  ],
  metric: { id: "overflow_rate", label: "overflow rate", unit: "percent", direction: "lower" },
  minEffect: { kind: "absolute", value: 2 },
  thresholds: [{ metric: "p95_ms", op: "<=", value: 50, label: "p95 latency" }],
  n: 20,
  controls: [{ id: "same-model", statement: "Both arms send to the same model." }],
  stack: "node",
  environment: "node@24.12.0",
  budget: { wallMin: 30, modelCalls: 0 },
};
const TRIAL_RESULTS: TrialResults = {
  schema: "article-trial-results/1",
  arms: [
    { id: "golden", observations: Array.from({ length: 20 }, () => 0), guards: { p95_ms: 12 } },
    { id: "alternative", observations: Array.from({ length: 20 }, (_, i) => (i % 2 ? 15 : 5)), guards: { p95_ms: 3 } },
  ],
  controls: [{ id: "same-model", held: true, evidence: "both arms logged the same model id" }],
  modelCalls: 0,
};
const TRIAL_VERDICT: TrialVerdict = {
  schema: "article-trial-verdict/1",
  verdict: "upheld",
  reason: "The golden arm's overflow rate is lower by 10, beyond the band of 2, and it clears every guard.",
  arms: [
    { id: "golden", n: 20, mean: 0, sd: 0, guardsCleared: true },
    { id: "alternative", n: 20, mean: 10, sd: 5.13, guardsCleared: true },
  ],
  delta: -10,
  band: 2,
  deltaCi95: [-12.2, -7.8],
  at: "2026-10-17T10:00:00.000Z",
};

/** Point the trial store, the leads file and the registry remote into the sandbox. */
function trialEnv(): string {
  const trials = path.join(box.dir, "trials");
  process.env.ARTICLES_TRIALS_DIR = trials;
  process.env.ARTICLES_LEADS_FILE = path.join(box.dir, "leads.jsonl");
  process.env.ARTICLES_REGISTRY_REMOTE = "github:fixture/ai-registry";
  return trials;
}

/** A trial directory on disk, closed `upheld` unless told otherwise. */
function seedTrial(over: { id?: string; status?: TrialRecord["status"]; verdict?: TrialVerdict["verdict"] | "none" } = {}): string {
  const id = over.id ?? "t-token-budgeting";
  const dir = path.join(process.env.ARTICLES_TRIALS_DIR!, id);
  const put = (rel: string, data: string | Buffer) => {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), data);
  };
  const kind = over.verdict ?? "upheld";
  const status = over.status ?? "closed";
  const seal: TrialSeal = { sha256: "0".repeat(64), at: "2026-10-17T09:00:00.000Z" };
  const record: TrialRecord = {
    schema: "article-trial/1",
    id,
    status,
    subject: { bundle: "software-engineering", slug: "token-budgeting", file: TRIAL_SUBJECT_FILE },
    createdAt: "2026-10-17T08:00:00.000Z",
    updatedAt: "2026-10-17T10:00:00.000Z",
    ...(status === "closed" || status === "sealed" ? { seal } : {}),
    ...(status === "closed" && kind !== "none" ? { verdict: kind, closedAt: "2026-10-17T10:00:00.000Z" } : {}),
  };
  put("trial.json", JSON.stringify(record, null, 2));
  put("prereg.json", JSON.stringify(TRIAL_PREREG, null, 2));
  put("seal.json", JSON.stringify(seal));
  const validity: TrialValidity = { state: "current", reasons: ["the technique is the vendor's documented practice"], sources: [TRIAL_PREREG.alternative.source] };
  put("validity.json", JSON.stringify(validity));
  const execs: TrialExecRecord[] = [
    { at: "2026-10-17T08:30:00.000Z", cmd: ["node", "run.mjs", "--pilot"], pilot: true, exitCode: 0, durationMs: 900, timedOut: false },
    { at: "2026-10-17T09:30:00.000Z", cmd: ["node", "run.mjs"], pilot: false, exitCode: 0, durationMs: 4200, timedOut: false },
  ];
  put("exec.jsonl", `${execs.map((e) => JSON.stringify(e)).join("\n")}\n`);
  put("REPORT.md", "# Report\n\nBoth arms ran against one fixture corpus.\n");
  put("harness/run.mjs", "console.log('measure both arms');\n");
  put("harness/node_modules/left-pad/index.js", "module.exports = 1;\n");
  put("harness/corpus.bin", Buffer.alloc(1024 * 1024 + 1, 7));
  if (status === "closed" && kind !== "none") {
    put("results.json", JSON.stringify(TRIAL_RESULTS, null, 2));
    const verdict: TrialVerdict = kind === "void" ? { ...TRIAL_VERDICT, verdict: "void", reason: "the control same-model did not hold" } : { ...TRIAL_VERDICT, verdict: kind };
    if (kind === "void") delete verdict.deltaCi95;
    put("verdict.json", JSON.stringify(verdict, null, 2));
  }
  return id;
}

const SUBJECT_TOPIC = { kind: "subject" as const, bundle: "software-engineering", subject: "token-budgeting", text: "" };
const storeEntries = () => (existsSync(box.store) ? readdirSync(box.store) : []);
type ArgvLine = { engine: string; entries: string[]; inputs?: string[]; registry?: string[]; experiment?: string[] };
const argvLines = () => readFileSync(path.join(box.dir, "argv.log"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as ArgvLine);

test("trial: a closed upheld trial becomes a run that reaches the gate on its own measurement", async () => {
  const trials = trialEnv();
  process.env.STUB_AGENT_ARGV_LOG = path.join(box.dir, "argv.log");
  const trialId = seedTrial();
  const created = await createRun({ topic: SUBJECT_TOPIC, trial: trialId }, deps());
  expect(created.trial).toEqual({ id: trialId, verdict: "upheld", technique: "count-before-send", alternative: "character estimate", metric: "overflow rate", n: 20, sourceN: 1, applicationPath: TRIAL_APPLICATION });
  expect(created.topic).toMatchObject({ kind: "subject", bundle: "software-engineering", subject: "token-budgeting", angle: TRIAL_PREREG.question });
  expect(JSON.parse(readFileSync(path.join(trials, trialId, "trial.json"), "utf8")).runId).toBe(created.id);

  // the bundle is copied to experiment/, environments and files over 1 MB left behind and named
  const dir = runDir(created.id);
  for (const f of ["trial.json", "prereg.json", "seal.json", "exec.jsonl", "results.json", "verdict.json", "validity.json", "REPORT.md", "harness/run.mjs"]) {
    expect(existsSync(path.join(dir, "experiment", f)), f).toBe(true);
  }
  expect(existsSync(path.join(dir, "experiment", "harness", "node_modules"))).toBe(false);
  expect(existsSync(path.join(dir, "experiment", "harness", "corpus.bin"))).toBe(false);
  const skipped = readFileSync(path.join(dir, "experiment", "SKIPPED.txt"), "utf8");
  expect(skipped).toContain("harness/node_modules/ (node_modules)");
  expect(skipped).toContain("harness/corpus.bin (1048577 bytes, over 1048576)");
  const source = JSON.parse(readFileSync(path.join(dir, "experiment-source.json"), "utf8"));
  expect(source).toMatchObject({ n: 1, url: `https://github.com/fixture/ai-registry/blob/main/${TRIAL_APPLICATION}`, date: "2026-10-17", primary: true, counter: false });

  const run = await driveRun(created.id, deps());
  expect(run.status, run.error).toBe("awaiting-approval");
  expect(run.trial).toEqual(created.trial);
  const sources = JSON.parse(readFileSync(path.join(dir, "sources.json"), "utf8"));
  expect(sources[0]).toEqual(source);
  const detail = await getRunDetail(run.id);
  for (const id of ["trial-preview", "trial-figure"]) expect(detail.check?.items.find((i) => i.id === id), id).toMatchObject({ status: "pass", dimension: "truth" });
  expect(detail.check?.dimensions.truth).toBe("pass");
  // no writing-standard patch: a trial run proposes against its subject only
  expect(detail.patches.every((p) => !p.target.startsWith("knowledge/technical-writing/"))).toBe(true);

  // the prompts carry the trial section and the code-rendered summary
  const draft = readFileSync(path.join(dir, "agent", "draft-prompt.md"), "utf8");
  expect(draft).toContain("ARTICLE-PHASE: draft");
  expect(draft).toContain("REGISTRY PATCHES, for this post, replace the draft phase's rule above.");
  expect(draft).toContain(`THE TRIAL ${trialId}, measured first-hand`);
  expect(draft).toContain("| golden (counted) | 20 | 0 | 0 | cleared: p95_ms 12 |");
  expect(draft).toContain(TRIAL_TECHNIQUE);
  expect(draft).not.toMatch(/\{\{[A-Z_0-9]+\}\}/);
  expect(readFileSync(path.join(dir, "agent", "research-prompt.md"), "utf8")).toContain("SOURCE 1 IS THE TRIAL.");
  expect(readFileSync(path.join(dir, "agent", "outline-prompt.md"), "utf8")).toContain("THE OPENING IS THE TRIAL'S OWN MEASURED NUMBER");
  expect(readFileSync(path.join(dir, "agent", "critique-r1-writer-prompt.md"), "utf8")).toContain("METHOD FINDINGS");
  const review = readFileSync(path.join(dir, "critique", "round-1", "prompts", "gpt.md"), "utf8");
  expect(review).toContain("LENS: METHOD.");
  expect(review).toContain(`THE TRIAL ${trialId}`);

  // every writer turn read the experiment; the draft read the subject, not the writing standard
  const seen = argvLines();
  const writer = seen.filter((s) => s.entries.includes("inputs"));
  expect(writer.length).toBeGreaterThanOrEqual(4);
  for (const s of writer) expect(s.inputs).toEqual(expect.arrayContaining(["experiment", "experiment-source.json"]));
  expect(writer.find((s) => s.registry)?.registry).toEqual([TRIAL_APPLICATION, TRIAL_TECHNIQUE, TRIAL_SUBJECT_FILE].sort());
  // every reviewer read the experiment's text files, and nothing that is not text
  const reviewers = seen.filter((s) => !s.entries.includes("inputs"));
  expect(reviewers).toHaveLength(4);
  for (const s of reviewers) {
    expect(s.entries, `${s.engine}'s workspace`).toEqual(["REVIEW.md", "experiment", "post", "sources.json"]);
    expect(s.experiment).toEqual(expect.arrayContaining(["prereg.json", "verdict.json", "results.json", "exec.jsonl", "REPORT.md", "SKIPPED.txt", "harness/run.mjs"]));
  }
  // a METHOD finding travels as a factual one, and the writer answered it
  const gpt = JSON.parse(readFileSync(path.join(dir, "critique", "round-1", "reviews", "gpt.json"), "utf8")) as { findings: { id: string; kind: string; location: string }[] };
  expect(gpt.findings.find((f) => f.location.startsWith("METHOD:"))).toMatchObject({ id: "f3", kind: "factual" });
  const dispositions = JSON.parse(readFileSync(path.join(dir, "critique", "round-1", "dispositions.json"), "utf8")) as { reviewer: string; findingId: string }[];
  expect(dispositions.filter((d) => d.findingId === "f3")).toHaveLength(4);
});

test("trial: a void, an unclosed, a dropped, a taken, a missing or a mismatched trial is refused and creates nothing", async () => {
  trialEnv();
  const create = (trial: string, topic: CreateRunInput["topic"] = SUBJECT_TOPIC) => createRun({ topic, trial }, deps());
  await expect(create(seedTrial({ id: "t-void", verdict: "void" }))).rejects.toMatchObject({ status: 400, code: "trial-void" });
  await expect(create(seedTrial({ id: "t-sealed", status: "sealed" }))).rejects.toMatchObject({ status: 409, code: "trial-not-closed" });
  await expect(create(seedTrial({ id: "t-dropped", verdict: "none" }))).rejects.toMatchObject({ status: 400, code: "trial-void" });
  await expect(create("t-nowhere")).rejects.toMatchObject({ status: 404, code: "no-trial" });
  // The agent harness refuses a subagent's REPORT.md; the orchestrator must save it, and a
  // trial without one is refused rather than written up blind to its anomalies.
  const unreported = seedTrial({ id: "t-unreported" });
  rmSync(path.join(process.env.ARTICLES_TRIALS_DIR!, unreported, "REPORT.md"));
  await expect(create(unreported)).rejects.toMatchObject({ status: 409, code: "trial-no-report" });
  const ok = seedTrial();
  await expect(create(ok, { kind: "free", text: "token budgets" })).rejects.toMatchObject({ status: 400, code: "trial-mismatch" });
  await expect(create(ok, { kind: "subject", bundle: "technical-writing", subject: "article-structure", text: "" })).rejects.toMatchObject({ status: 400, code: "trial-mismatch" });
  expect(storeEntries(), "a refused trial created a run directory").toEqual([]);

  // a trial is written up once: a second run on it is refused before it exists
  const first = await create(ok);
  await expect(create(ok)).rejects.toMatchObject({ status: 409, code: "trial-taken" });
  expect(storeEntries()).toEqual([first.id]);
});

test("trial: a research answer whose source 1 is not the trial's record fails the step by name", async () => {
  trialEnv();
  process.env.STUB_TRIAL_SOURCE = "reworded";
  const created = await createRun({ topic: SUBJECT_TOPIC, trial: seedTrial() }, deps());
  const run = await driveRun(created.id, deps());
  expect(run.status).toBe("failed");
  expect(run.error).toMatch(/^research: source 1 must be the trial's record \(experiment-source\.json\); its title differ/);
  expect(existsSync(path.join(runDir(created.id), "sources.json")), "a refused research wrote sources.json").toBe(false);
});

test("trial: the fix turn of a trial run reads the experiment and carries the trial-writer section", async () => {
  trialEnv();
  process.env.STUB_AGENT_ARGV_LOG = path.join(box.dir, "argv.log");
  process.env.STUB_POST_DEFECT = "draft";
  const created = await createRun({ topic: SUBJECT_TOPIC, trial: seedTrial() }, deps());
  const run = await driveRun(created.id, deps());
  expect(run.status, run.error).toBe("awaiting-approval");
  const fix = readFileSync(path.join(runDir(run.id), "agent", "fix-draft-1-prompt.md"), "utf8");
  expect(fix).toContain("ARTICLE-PHASE: fix");
  expect(fix).toContain("NEVER CHANGE A NUMBER ABOUT THE ARMS.");
  expect(fix).toContain("`trial-preview`");
  const fixes = argvLines().filter((s) => s.inputs?.includes("check-failures.json"));
  expect(fixes.length).toBeGreaterThan(0);
  for (const s of fixes) expect(s.inputs).toEqual(expect.arrayContaining(["experiment", "experiment-source.json"]));
});
