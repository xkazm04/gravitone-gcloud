// LANE: THE CHECK BETWEEN WRITER TURNS, offline (2026-10-06).
//
// The deterministic check used to run once, after the last rewrite, and failed three
// dimensions nobody could still fix. lib/articles/engine.ts `checkLoop` now runs it after the
// draft and after every critique revision, hands what failed to the writer as a mandatory fix
// turn, and stops after MAX_FIX_PASSES with the failures recorded. Driven end to end through
// the real seam with tests/fixtures/articles/stub-agent.mjs, whose STUB_POST_DEFECT seeds one
// em dash (the check fails `no-em-dash` by name) in the phases it names. What is pinned:
//
//   · a failure after the draft reaches the writer: the fix prompt and inputs/check-failures.json
//     carry the item, the fix replaces the post, the next pass is clean, the cost lands on the step
//   · the bound: a fix that does not meet the failure runs MAX_FIX_PASSES times, never more, the
//     run still reaches the gate, the remaining failure is recorded and the final check fails it
//   · a failed fix turn is recorded (fixError), not fatal
//   · a critique revision is checked before the next round reviews it
//   · the loop is idempotent on resume (state is the pass files)
//   · agy's start-up 503 is stopped at once and classified `unavailable`; the panel's agy timeout
//   · the word ceiling is a prompt rule and the fix prompt fills every slot
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { classifyOutcome, earlyUnavailable, parseAgyEnvelope, runReviewer } from "@/lib/agent/cliSeam";
import { loadPanel } from "@/lib/articles/critique";
import { checkLoop, createRun, defaultDeps, driveRun, failuresText, getRunDetail, MAX_FIX_PASSES } from "@/lib/articles/engine";
import { THRESHOLDS } from "@/lib/articles/checks";
import { buildPrompt, loadPromptFile } from "@/lib/articles/prompt";
import { runDir } from "@/lib/articles/store";
import type { CheckPassRecord } from "@/lib/articles/types";

import { keepEnv } from "./_helpers";
import { ARTICLE_ENV, articleSandbox, ROOT, type ArticleSandbox } from "./_articles";

keepEnv([...ARTICLE_ENV]);
test.describe.configure({ timeout: 180_000 });

let box: ArticleSandbox;
test.beforeEach(() => {
  box = articleSandbox();
});
test.afterEach(() => box.cleanup());

const deps = () => defaultDeps({ render: false });
const at = (id: string, rel: string) => path.join(runDir(id), ...rel.split("/"));
const json = <T>(id: string, rel: string) => JSON.parse(readFileSync(at(id, rel), "utf8")) as T;
const DASH = /[—–]/;

async function toGate() {
  const run = await createRun({ topic: { kind: "free", text: "the token tax" } }, deps());
  return driveRun(run.id, deps());
}

test("a failure after the draft reaches the writer, is fixed, and the cost lands on the draft step", async () => {
  process.env.STUB_POST_DEFECT = "draft";
  process.env.STUB_AGENT_COST = "0.5";
  const run = await toGate();
  expect(run.status, run.error).toBe("awaiting-approval");

  const first = json<CheckPassRecord>(run.id, "checks/draft-1.json");
  expect(first.failed.map((f) => f.id)).toEqual(["no-em-dash"]);
  expect(first).toMatchObject({ label: "draft", pass: 1, fixed: true });
  expect(json<CheckPassRecord>(run.id, "checks/draft-2.json")).toMatchObject({ pass: 2, failed: [], fixed: false });
  expect(existsSync(at(run.id, "checks/draft-3.json"))).toBe(false);

  // the writer was told, in the prompt and in a file, and answered as a fix turn
  const prompt = readFileSync(at(run.id, "agent/fix-draft-1-prompt.md"), "utf8");
  expect(prompt).toContain("ARTICLE-PHASE: fix");
  expect(prompt).toContain("`no-em-dash` (voice)");
  expect(prompt).toContain("Required: 0 (house rule");
  expect(prompt).not.toMatch(/\{\{[A-Z_0-9]+\}\}/);
  expect(json<{ turn: string; outcome: string }>(run.id, "agent/fix-draft-1.json")).toMatchObject({ turn: "article-critique-writer", outcome: "completed" });

  // the post the gate sees is the fixed one, and the final check is clean of it
  expect(readFileSync(at(run.id, "post/post.md"), "utf8")).not.toMatch(DASH);
  const detail = await getRunDetail(run.id);
  expect(detail.check?.items.find((i) => i.id === "no-em-dash")?.status).toBe("pass");
  expect(detail.checkPasses?.map((p) => `${p.label}-${p.pass}`)).toEqual(["draft-1", "draft-2"]);

  // draft turn 0.5 + one fix turn 0.5, on the draft step
  expect(run.steps.find((s) => s.name === "draft")?.costUsd).toBe(1);
  // the patches the draft proposed survive a fix
  expect(detail.patches.map((p) => p.id)).toEqual(["p1", "p2"]);
});

test("the bound holds: a fix that does not meet the failure runs MAX_FIX_PASSES times, the run goes on and says so", async () => {
  process.env.STUB_POST_DEFECT = "draft,fix";
  const run = await toGate();
  expect(run.status, run.error).toBe("awaiting-approval");
  const passes = readdirSync(at(run.id, "checks")).sort();
  expect(passes).toEqual(Array.from({ length: MAX_FIX_PASSES + 1 }, (_, i) => `draft-${i + 1}.json`));
  for (let n = 1; n <= MAX_FIX_PASSES; n++) expect(existsSync(at(run.id, `agent/fix-draft-${n}-prompt.md`)), `fix ${n}`).toBe(true);
  expect(existsSync(at(run.id, `agent/fix-draft-${MAX_FIX_PASSES + 1}-prompt.md`))).toBe(false);
  const last = json<CheckPassRecord>(run.id, `checks/draft-${MAX_FIX_PASSES + 1}.json`);
  expect(last.failed.map((f) => f.id)).toEqual(["no-em-dash"]);
  expect(last.fixed).toBe(false);
  // the human's gate still shows the failure, by name
  expect((await getRunDetail(run.id)).check?.items.find((i) => i.id === "no-em-dash")?.status).toBe("fail");

  // a resume (or a second drive) adds no pass and no turn: state is the pass files
  const before = readdirSync(at(run.id, "agent")).length;
  expect(await checkLoop(run.id, "draft", deps())).toBeUndefined();
  expect(readdirSync(at(run.id, "checks")).sort()).toEqual(passes);
  expect(readdirSync(at(run.id, "agent")).length).toBe(before);
});

test("a failed fix turn is recorded as fixError and does not fail the run", async () => {
  process.env.STUB_POST_DEFECT = "draft";
  process.env.STUB_FIX_MODE = "error";
  const run = await toGate();
  expect(run.status, run.error).toBe("awaiting-approval");
  expect(readdirSync(at(run.id, "checks"))).toEqual(["draft-1.json"]);
  const rec = json<CheckPassRecord>(run.id, "checks/draft-1.json");
  expect(rec.fixed).toBe(true);
  expect(rec.fixError).toContain("fix-draft-1");
  expect(readFileSync(at(run.id, "post/post.md"), "utf8")).toMatch(DASH);
  expect((await getRunDetail(run.id)).check?.items.find((i) => i.id === "no-em-dash")?.status).toBe("fail");
});

test("a critique revision is checked before the next round reviews it", async () => {
  process.env.STUB_POST_DEFECT = "revise";
  process.env.STUB_CRITIQUE_DECISIONS = "rewrite,keep";
  const run = await toGate();
  expect(run.status, run.error).toBe("awaiting-approval");
  expect(run.critique).toMatchObject({ rounds: 2, decision: "keep" });
  // the clean draft needed no fix; the dirty revision did
  expect(readdirSync(at(run.id, "checks")).sort()).toEqual(["draft-1.json", "round-1-1.json", "round-1-2.json"]);
  expect(json<CheckPassRecord>(run.id, "checks/round-1-1.json")).toMatchObject({ fixed: true, failed: [{ id: "no-em-dash" }] });
  expect(json<CheckPassRecord>(run.id, "checks/round-1-2.json").failed).toEqual([]);
  expect(json<CheckPassRecord>(run.id, "checks/draft-1.json").failed).toEqual([]);
  // round 2's reviewers were given the FIXED post
  const r2 = readFileSync(at(run.id, "critique/round-2/prompts/fable.md"), "utf8");
  expect(r2).not.toContain("A pause");
  expect(readFileSync(at(run.id, "agent/fix-round-1-1-prompt.md"), "utf8")).toContain("`no-em-dash`");
});

test("a clean post costs no fix turn and leaves one clean pass per label", async () => {
  process.env.STUB_CRITIQUE_DECISIONS = "rewrite,keep";
  const run = await toGate();
  expect(run.status, run.error).toBe("awaiting-approval");
  expect(readdirSync(at(run.id, "checks")).sort()).toEqual(["draft-1.json", "round-1-1.json"]);
  expect(readdirSync(at(run.id, "agent")).filter((f) => f.startsWith("fix-"))).toEqual([]);
});

test("the failures read as a list the writer can act on", () => {
  const text = failuresText([
    { id: "visual-cadence", dimension: "figures", label: "A visual at least after every second paragraph", value: "longest run 6 prose paragraphs", expected: "≤ 2", detail: ['run of 3+ reaching: "A tokenizer"'] },
    { id: "chrome-font", dimension: "medium-fidelity", label: "Chrome type size", value: "10.92px", expected: "≥ 13px" },
  ]);
  expect(text).toContain("- `visual-cadence` (figures): A visual at least after every second paragraph. Measured: longest run 6 prose paragraphs. Required: ≤ 2.");
  expect(text).toContain('    - run of 3+ reaching: "A tokenizer"');
  expect(text).toContain("`chrome-font` (medium-fidelity)");
});

test("prompts: the fix phase fills every slot, names the failures and the ceiling; the shared rules state the ceiling", async () => {
  const file = await loadPromptFile(ROOT);
  const ctx = { topic: { kind: "free" as const, text: "t" }, standard: "S", standardAddress: "A", today: "2026-10-06", round: 0, maxRounds: 2 };
  const w = buildPrompt(file, "fix", { ...ctx, checkFailures: "- `visual-cadence` (figures): X" });
  expect(w).not.toMatch(/\{\{[A-Z_0-9]+\}\}/);
  expect(w).toContain("ARTICLE-PHASE: fix");
  expect(w).toContain("- `visual-cadence` (figures): X");
  expect(w).toContain("out/post/post.md");
  expect(w).toContain(String(THRESHOLDS.maxWords));
  expect(w).toContain(`at least ${THRESHOLDS.minBodyPx1440}px at 1440`);
  // the ceiling is in the shared rules every phase carries
  for (const phase of ["draft", "revise"] as const) expect(buildPrompt(file, phase, ctx)).toContain(`holds the post to ${THRESHOLDS.maxWords} words`);
});

/* ── agy's start-up 503 ───────────────────────────────────────────────── */

const ELIGIBILITY =
  "ERROR: failed to send message: send failed; already reported to the user: Eligibility check failed: failed to get load code assist response: UNAVAILABLE (code 503): The service is currently unavailable.";

test("agy: the eligibility 503 is recognised from its text, for agy only, and classifies as unavailable", () => {
  expect(earlyUnavailable("agy", `noise\n${ELIGIBILITY}\n`)).toMatch(/^Eligibility check failed: failed to get load code assist response: UNAVAILABLE \(code 503\)/);
  expect(earlyUnavailable("codex", ELIGIBILITY)).toBeUndefined();
  expect(earlyUnavailable("agy", "a normal progress line")).toBeUndefined();
  const parsed = parseAgyEnvelope(JSON.stringify({ status: "ERROR", error: ELIGIBILITY, num_turns: 0 }));
  expect(classifyOutcome(parsed, { exit: 1, timedOut: false })).toBe("unavailable");
});

test("agy: a reviewer that prints the eligibility 503 and then idles is stopped at once, not at its timeout", async () => {
  const ws = path.join(box.dir, "ws");
  mkdirSync(path.join(ws, "post"), { recursive: true });
  writeFileSync(path.join(ws, "sources.json"), "[]");
  const prompt = "ARTICLE-REVIEW\nREVIEWER: gemini\nROUND: 1\n";
  writeFileSync(path.join(ws, "REVIEW.md"), prompt);
  process.env.STUB_REVIEWERS = "gemini=eligibility";
  const t0 = Date.now();
  const r = await runReviewer({ engine: "agy", cwd: ws, prompt, model: "gemini-3.8-flash", effort: "high", timeoutMin: 5 });
  expect(r.outcome).toBe("unavailable");
  expect(r.errors.join(" ")).toContain("Eligibility check failed");
  expect(Date.now() - t0, "well inside the 5 minute timeout").toBeLessThan(30_000);
});

test("agy: through the engine the 503 is recorded by name and the quorum still holds", async () => {
  process.env.STUB_REVIEWERS = "gemini=eligibility";
  const t0 = Date.now();
  const run = await toGate();
  expect(run.status, run.error).toBe("awaiting-approval");
  const gemini = run.critique?.reviewers.find((r) => r.id === "gemini");
  expect(gemini).toMatchObject({ engine: "agy", outcome: "unavailable" });
  expect(gemini?.error).toContain("Eligibility check failed");
  expect(Date.now() - t0).toBeLessThan(120_000);
});

test("panel: the agy reviewer's timeout is the shorter one", async () => {
  const panel = await loadPanel(ROOT, {});
  const by = Object.fromEntries(panel.reviewers.map((r) => [r.id, r.timeoutMin]));
  expect(by.gemini).toBe(14);
  expect(by.gemini).toBeLessThan(by.fable);
});

test("the fix edits the seeded copy in place: unflagged bytes survive,", async () => {
  process.env.STUB_POST_DEFECT = "draft";
  process.env.STUB_FIX_MODE = "inplace";
  const run = await toGate();
  expect(run.status, run.error).toBe("awaiting-approval");
  const first = json<CheckPassRecord>(run.id, "checks/draft-1.json");
  expect(first).toMatchObject({ failed: [{ id: "no-em-dash" }], fixed: true });
  expect(json<CheckPassRecord>(run.id, "checks/draft-2.json")).toMatchObject({ failed: [], fixed: false });
  expect(json<{ outcome: string }>(run.id, "agent/fix-draft-1.json").outcome).toBe("completed");
  // the fix turn wrote no figures of its own: the post's figures are the draft's, carried over
  const fixed = readFileSync(at(run.id, "post/post.md"), "utf8");
  expect(fixed).not.toMatch(DASH);
  expect(readdirSync(at(run.id, "post/figures")).length).toBeGreaterThanOrEqual(5);
  // everything outside the seeded defect is the draft's text, byte for byte: the same post
  // drafted without the defect is the fixed one minus the sentence the defect added
  delete process.env.STUB_POST_DEFECT;
  const clean = await toGate();
  expect(fixed.replace(" A pause , and a dash.", "")).toBe(readFileSync(at(clean.id, "post/post.md"), "utf8"));
});

test("a rejected re-research retries once from its own files and is told only what was wrong", async () => {
  process.env.STUB_CRITIQUE_DECISIONS = "research,keep";
  process.env.STUB_RESEARCH = "badurl";
  const run = await toGate();
  expect(run.status, run.error).toBe("awaiting-approval");
  const receipt = json<{ outcome: string; attempts: number }>(run.id, "agent/critique-r1-research.json");
  expect(receipt).toMatchObject({ outcome: "completed", attempts: 2 });
  // the first attempt's rejected files were kept (the source with no url), the retry corrected it
  const kept = JSON.parse(readFileSync(at(run.id, "agent/critique-r1-research-out/sources.json"), "utf8")) as { url: string }[];
  expect(kept.at(-1)?.url).toBe("");
  const sources = json<{ n: number; url: string }[]>(run.id, "sources.json");
  expect(sources.every((s) => /^https?:\/\//.test(s.url))).toBe(true);
  expect(existsSync(at(run.id, "critique/round-1/researched.json"))).toBe(true);
});
