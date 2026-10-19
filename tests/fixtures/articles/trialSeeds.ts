// SEEDED TRIAL RUNS - for the trial gate's probe (tests/golden-path/articles-trial-gate.probe.spec.ts).
//
// The engine can only take a run to the gate by doing the work, so one real run is driven to
// `awaiting-approval` (stub agent, throwaway registry: tests/golden-path/_articles.ts) and this
// file CLONES its directory once per trial verdict, writes the clone's `experiment/` and rewrites
// its run.json, sources and patches to say what a trial run holds at the gate. The manifests are
// written directly, not through lib/articles/store.ts: nothing here is a claim about what the
// engine would do. (The /articles page states this file once also seeded retired with the v1 pages.)

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { summarizeCritique } from "@/lib/articles/critique";
import { trialRecordPatch } from "@/lib/articles/ingestDraft";
import { experimentSource, trialApplicationPath } from "@/lib/articles/trial/record";
import type {
  ArticleRun,
  ArticleTrialRef,
  CritiqueDecisionRecord,
  CritiqueDetail,
  CritiqueRoundDetail,
  FindingDisposition,
  RegistryPatch,
  Review,
  ReviewerOutcome,
  ReviewerReceipt,
  ReviewerSpec,
  ReviewFinding,
  Source,
  TrialExecRecord,
  TrialPrereg,
  TrialRecord,
  TrialResults,
  TrialValidity,
  TrialVerdict,
} from "@/lib/articles/types";

/* ── the critique, written as its files ──────────────────────────────────── */

export const SEED_PANEL: ReviewerSpec[] = [
  { id: "opus", engine: "claude", model: "claude-opus-5-5", effort: "high", timeoutMin: 25 },
  { id: "gemini4", engine: "agy", model: "gemini-4-argon", effort: "medium", timeoutMin: 35 },
  { id: "gemini", engine: "agy", model: "gemini-3.8-flash", effort: "high", timeoutMin: 25 },
  { id: "gpt", engine: "codex", model: "gpt-6-astra", effort: "high", timeoutMin: 25 },
];

const ERRORS: Partial<Record<ReviewerOutcome, string>> = {
  unavailable: 'Internal error: { "message": "API error (status 402 Payment Required): Build usage balance exhausted", "http_status": 402 } (http 402)',
  "seat-limit": "RESOURCE_EXHAUSTED: quota exceeded",
  "timed-out": "did not finish within 25 min",
  errored: "malformed review twice: the final message holds no JSON object",
};

function seedFindings(id: string, round: number): ReviewFinding[] {
  if (round > 1) return [{ id: "f1", kind: "engagement", severity: "minor", location: "Closing section", claim: `The closing does not return to the opening question (${id}).`, evidence: [], suggestion: "Close on the opening question." }];
  return [
    { id: "f1", kind: "factual", severity: "blocker", location: "Section 2, first paragraph", claim: `The per-token price cited to [2] is from June; the pricing page changed in September (${id}).`, evidence: ["https://example.org/pricing"], suggestion: "Use the current price and date it." },
    { id: "f2", kind: "insight", severity: "major", location: "Section 3", claim: "The limit of the claim is stated but not measured.", evidence: [], suggestion: "Add the measurement that shows where it stops holding." },
    { id: "f3", kind: "format", severity: "minor", location: "Figure 3", claim: "The caption repeats the paragraph above it.", evidence: [], suggestion: "Caption what the figure shows." },
  ];
}

function seedDisposition(reviewer: string, f: ReviewFinding): FindingDisposition {
  if (f.severity === "blocker") return { reviewer, findingId: f.id, disposition: "accepted", reason: "The pricing page shows a newer price.", action: "Replace the price and date it." };
  if (f.severity === "major") return { reviewer, findingId: f.id, disposition: "deferred", reason: "A measurement of its own belongs in a follow-up post." };
  return { reviewer, findingId: f.id, disposition: "rejected", reason: f.kind === "format" ? "The caption names its source; the repetition is deliberate." : "The closing already returns to the opening number." };
}

interface SeedRound {
  /** Per reviewer: an outcome, or `pending` (no receipt yet). */
  outcomes: Record<string, ReviewerOutcome | "pending">;
  decision?: Omit<CritiqueDecisionRecord, "round">;
  revised?: { research: boolean };
}

/** Write critique/ for one seeded run and return the run's summary. A round
 *  is closed when it reached quorum and nothing in it is pending. */
export function writeSeedCritique(dir: string, rounds: SeedRound[], at: (min: number) => string): ArticleRun["critique"] {
  rmSync(path.join(dir, "critique"), { recursive: true, force: true });
  const w = (rel: string, v: unknown) => {
    const f = path.join(dir, "critique", ...rel.split("/"));
    mkdirSync(path.dirname(f), { recursive: true });
    writeFileSync(f, `${JSON.stringify(v, null, 2)}\n`);
  };
  w("reviewers.json", { schema: "article-reviewers/1", maxCritiqueRounds: 2, minCompleted: 2, reviewers: SEED_PANEL });
  const detail: CritiqueDetail = { reviewers: SEED_PANEL, maxRounds: 2, minCompleted: 2, rounds: [] };
  rounds.forEach((plan, i) => {
    const round = i + 1;
    const receipts: ReviewerReceipt[] = [];
    const reviews: Review[] = [];
    for (const spec of SEED_PANEL) {
      const outcome = plan.outcomes[spec.id] ?? "pending";
      if (outcome === "pending") continue;
      const receipt: ReviewerReceipt = {
        id: spec.id, engine: spec.engine, model: spec.model, effort: spec.effort, round, attempts: 1, turns: outcome === "completed" ? 4 : 0, durationMs: outcome === "completed" ? 412_000 : 900,
        outcome, errors: outcome === "completed" ? [] : [ERRORS[outcome] ?? outcome],
        ...(outcome === "completed" && (spec.engine === "claude") ? { costUsd: 0.4213 } : {}),
      };
      receipts.push(receipt);
      w(`round-${round}/receipts/${spec.id}.json`, receipt);
      if (outcome === "completed") {
        const review: Review = { reviewer: spec.id, model: spec.model, effort: spec.effort, verdict: round === 1 ? "revise" : "publish", summary: `Round ${round} review by ${spec.id}.`, findings: seedFindings(spec.id, round) };
        reviews.push(review);
        w(`round-${round}/reviews/${spec.id}.json`, review);
      }
    }
    const pending = SEED_PANEL.some((s) => (plan.outcomes[s.id] ?? "pending") === "pending");
    const closed = !pending && reviews.length >= 2;
    if (closed) w(`round-${round}/closed.json`, { round, at: at(30 + round), completed: reviews.map((r) => r.reviewer) });
    const r: CritiqueRoundDetail = { round, receipts, reviews, closed };
    if (plan.decision) {
      const dispositions = reviews.flatMap((rv) => rv.findings.map((f) => seedDisposition(rv.reviewer, f)));
      const decision: CritiqueDecisionRecord = { round, ...plan.decision };
      w(`round-${round}/dispositions.json`, dispositions);
      w(`round-${round}/decision.json`, decision);
      r.dispositions = dispositions;
      r.decision = decision;
    }
    if (plan.revised) {
      const revised = { at: at(34 + round), research: plan.revised.research };
      w(`round-${round}/revised.json`, revised);
      r.revised = revised;
    }
    detail.rounds.push(r);
  });
  return summarizeCritique(detail);
}

const ALL_OK = { opus: "completed", gemini4: "completed", gemini: "completed", gpt: "completed" } as const;

const AT = (min: number) => new Date(Date.UTC(2026, 9, 5, 9, min, 0)).toISOString();

export type TrialSeedState = "trial-upheld" | "trial-challenged";
export const TRIAL_SEED_STATES: readonly TrialSeedState[] = ["trial-upheld", "trial-challenged"];

/** The repo's registry remote, spelled the way .ai/manifest.yaml does. */
const SEED_REMOTE = "github:xkazm04/ai-registry";

interface TrialSeed {
  id: string;
  subjectFile: string;
  title: string;
  prereg: TrialPrereg;
  results: TrialResults;
  execs: TrialExecRecord[];
  verdict: TrialVerdict["verdict"];
  reason: string;
  ci: [number, number];
  validity: TrialValidity;
  /** A model's technique amendment kept beside t1, as a diff. */
  amendment?: { target: string; diff: string; rationale: string };
  /** Model proposals the trial scope refused, with the engine's reasons. */
  refused?: { entry: unknown; reason: string }[];
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
};

const TOKEN_TECHNIQUE = "knowledge/software-engineering/llm-agent/token-budgeting/techniques/count-before-send.md";

const TRIAL_SEEDS: Record<TrialSeedState, TrialSeed> = {
  "trial-upheld": {
    id: "token-budgeting-2026-10-17",
    subjectFile: "knowledge/software-engineering/llm-agent/token-budgeting/token-budgeting.md",
    title: "Token budgeting",
    prereg: {
      schema: "article-trial-prereg/1",
      subject: { bundle: "software-engineering", slug: "token-budgeting" },
      technique: "count-before-send",
      claim: "Count the request's tokens with the model's own tokenizer before sending it, because a character estimate is wrong by up to a third.",
      alternative: {
        name: "Character estimate (chars / 4)",
        description: "Divide the request's characters by four and keep a 10% margin under the window.",
        source: { url: "https://example.org/tokens/rule-of-thumb", title: "What are tokens and how to count them", date: "2026-03-02" },
      },
      prior: "The estimate overflows on non-English text; on English prose it is close enough.",
      question: "On a mixed-language request set, does counting with the tokenizer avoid the overflows a chars/4 estimate causes?",
      arms: [
        { id: "golden", label: "Tokenizer count", description: "Count with the model's tokenizer; trim to the window." },
        { id: "alternative", label: "chars / 4", description: "Estimate from characters with a 10% margin; trim to the estimate." },
      ],
      metric: { id: "overflows", label: "context overflows per 100 requests", unit: "overflows", direction: "lower" },
      minEffect: { kind: "absolute", value: 1 },
      thresholds: [{ metric: "p95_added_ms", op: "<=", value: 15, label: "p95 added latency (ms)" }],
      n: 12,
      controls: [
        { id: "same-requests", statement: "both arms send the same 1,200 requests" },
        { id: "same-model", statement: "one model and one window for both arms" },
      ],
      stack: "python",
      environment: "python@3.13.1",
      budget: { wallMin: 40, modelCalls: 0 },
    },
    results: {
      schema: "article-trial-results/1",
      arms: [
        { id: "golden", observations: [0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], guards: { p95_added_ms: 9.2 } },
        { id: "alternative", observations: [6, 4, 7, 5, 6, 8, 5, 6, 7, 4, 6, 5], guards: { p95_added_ms: 0.4 } },
      ],
      controls: [
        { id: "same-requests", held: true, evidence: "request set sha256 4be1…09 in both arms' logs" },
        { id: "same-model", held: true, evidence: "window 128000 read from the model card both runs" },
      ],
      modelCalls: 0,
    },
    execs: [
      { at: "2026-10-17T09:02:10.000Z", cmd: ["python", "harness/count.py", "--arm", "golden", "--batch", "1"], pilot: true, exitCode: 0, durationMs: 3_910, timedOut: false },
      { at: "2026-10-17T09:20:44.000Z", cmd: ["python", "harness/count.py", "--arm", "golden", "--batches", "12"], pilot: false, exitCode: 0, durationMs: 48_220, timedOut: false },
      { at: "2026-10-17T09:22:01.000Z", cmd: ["python", "harness/count.py", "--arm", "alternative", "--batches", "12"], pilot: false, exitCode: 0, durationMs: 21_480, timedOut: false },
    ],
    verdict: "upheld",
    reason: "the golden arm cleared every guard and measured 5.5 fewer overflows per 100 requests, beyond the band of 1",
    ci: [4.6, 6.4],
    validity: { state: "current", reasons: ["the tokenizer-first rule is the vendor's documented practice"], sources: [{ url: "https://example.org/tokens/counting", title: "Counting tokens", date: "2026-09-12" }] },
    amendment: {
      target: TOKEN_TECHNIQUE,
      rationale: "The trial measured the overflow on mixed-language requests; the rule gains the condition it was measured under.",
      diff: [
        `diff --git a/${TOKEN_TECHNIQUE} b/${TOKEN_TECHNIQUE}`,
        `--- a/${TOKEN_TECHNIQUE}`,
        `+++ b/${TOKEN_TECHNIQUE}`,
        "@@ -13,3 +13,4 @@",
        " ## Decision rules",
        " ",
        " - When a request may exceed the window, count it with the model's tokenizer first.",
        "+- When requests mix scripts, never trust a character estimate: it overflowed 5.75 times per 100 requests where the count overflowed 0.25 (n=12 batches per arm).",
        "",
      ].join("\n"),
    },
  },
  "trial-challenged": {
    id: "cost-metering-2026-10-16",
    subjectFile: "knowledge/software-engineering/llm-agent/evaluation-and-cost/cost-metering/cost-metering.md",
    title: "Cost metering",
    prereg: {
      schema: "article-trial-prereg/1",
      subject: { bundle: "software-engineering", slug: "cost-metering" },
      technique: "preflight-estimation",
      claim: "Estimate a call's cost before sending it and refuse the call when the estimate exceeds the remaining budget.",
      alternative: {
        name: "Reserve and settle",
        description: "Debit a fixed reserve per call, send it, then settle the reserve to the metered cost.",
        source: { url: "https://example.org/billing/reserve-and-settle", title: "Reserve, then settle: metering LLM spend", date: "2026-06-21" },
      },
      prior: "Preflight estimation overruns less; reserve-and-settle refuses less.",
      question: "Under a fixed daily budget, does preflight estimation hold spend inside it better than reserve-and-settle?",
      arms: [
        { id: "golden", label: "Preflight estimate", description: "Estimate each call from its prompt and max tokens; refuse past the remaining budget." },
        { id: "alternative", label: "Reserve and settle", description: "Debit a $0.02 reserve, send, settle to the metered cost." },
      ],
      metric: { id: "overrun_usd", label: "budget overrun per 1,000 calls", unit: "USD", direction: "lower" },
      minEffect: { kind: "relative", value: 0.1 },
      thresholds: [{ metric: "false_refusals", op: "<=", value: 5, label: "false refusals per 1,000 calls" }],
      n: 10,
      controls: [
        { id: "same-trace", statement: "both arms replay the same 10 day traces" },
        { id: "same-prices", statement: "one price table for both arms" },
      ],
      stack: "node",
      environment: "node@22.11.0",
      budget: { wallMin: 30, modelCalls: 0 },
    },
    results: {
      schema: "article-trial-results/1",
      arms: [
        { id: "golden", observations: [0.42, 0.38, 0.51, 0.47, 0.4, 0.44, 0.49, 0.39, 0.45, 0.43], guards: { false_refusals: 9.4 } },
        { id: "alternative", observations: [0.21, 0.18, 0.25, 0.22, 0.19, 0.24, 0.2, 0.23, 0.17, 0.21], guards: { false_refusals: 1.2 } },
      ],
      controls: [
        { id: "same-trace", held: true, evidence: "trace files hashed identical before both replays" },
        { id: "same-prices", held: true, evidence: "price table v2026-10-01 loaded by both arms" },
      ],
      modelCalls: 0,
      notes: "Day 7 of the golden arm was replayed after a harness crash; the first attempt is in the exec log.",
    },
    execs: [
      { at: "2026-10-16T15:01:02.000Z", cmd: ["node", "harness/replay.mjs", "--arm", "golden", "--days", "1"], pilot: true, exitCode: 0, durationMs: 2_140, timedOut: false },
      { at: "2026-10-16T15:12:40.000Z", cmd: ["node", "harness/replay.mjs", "--arm", "golden", "--days", "1-10"], pilot: false, exitCode: 1, durationMs: 31_007, timedOut: false },
      { at: "2026-10-16T15:14:12.000Z", cmd: ["node", "harness/replay.mjs", "--arm", "golden", "--days", "7-10"], pilot: false, exitCode: 0, durationMs: 14_552, timedOut: false },
      { at: "2026-10-16T15:15:30.000Z", cmd: ["node", "harness/replay.mjs", "--arm", "alternative", "--days", "1-10"], pilot: false, exitCode: 0, durationMs: 36_918, timedOut: false },
    ],
    verdict: "challenged",
    reason: "the alternative cleared every guard and measured 0.228 USD less overrun per 1,000 calls, beyond the band of 0.0438; the golden arm missed false refusals per 1,000 calls",
    ci: [0.19, 0.26],
    validity: { state: "current", reasons: ["preflight estimation is the subject's stated default"], sources: [{ url: "https://example.org/billing/metering-2026", title: "Metering LLM spend in 2026", date: "2026-08-30" }] },
    refused: [
      { entry: { id: "p1", target: "knowledge/technical-writing/craft/article-structure/article-structure.md", kind: "technique" }, reason: "a trial run's patch must sit under the subject's directory knowledge/software-engineering/llm-agent/evaluation-and-cost/cost-metering/" },
    ],
  },
};

/** Write `<runDir>/experiment/` for one seeded trial, as `createRun` copies a closed trial, and
 *  return the run's `trial` ref with the prereg and verdict. `stack` overrides the prereg's, so
 *  a probe can aim the record at a new file or at one the registry already holds. With no
 *  `runId` the trial is unclaimed, so the directory can stand in a trial store for createRun. */
export function writeSeedExperiment(dir: string, state: TrialSeedState, runId?: string, over: { stack?: string } = {}): { ref: ArticleTrialRef; prereg: TrialPrereg; verdict: TrialVerdict; subjectFile: string; title: string } {
  const seed = TRIAL_SEEDS[state];
  const p: TrialPrereg = { ...seed.prereg, ...(over.stack ? { stack: over.stack, environment: `${over.stack}@${seed.prereg.environment.split("@")[1]}` } : {}) };
  const at = (m: number) => new Date(Date.parse(seed.execs[0].at) + m * 60_000).toISOString();
  const [g, a] = seed.results.arms;
  const cleared = (guards: Record<string, number>) => p.thresholds.every((t) => (t.op === "<=" ? guards[t.metric] <= t.value : guards[t.metric] >= t.value));
  const golden = { id: "golden" as const, n: g.observations.length, mean: mean(g.observations), sd: sd(g.observations), guardsCleared: cleared(g.guards) };
  const alt = { id: "alternative" as const, n: a.observations.length, mean: mean(a.observations), sd: sd(a.observations), guardsCleared: cleared(a.guards) };
  const raw = alt.mean - golden.mean;
  const delta = p.metric.direction === "lower" ? -raw : raw;
  const band = p.minEffect.kind === "absolute" ? p.minEffect.value : p.minEffect.value * Math.abs(golden.mean);
  const verdict: TrialVerdict = { schema: "article-trial-verdict/1", verdict: seed.verdict, reason: seed.reason, arms: [golden, alt], delta, band, deltaCi95: seed.ci, at: at(40) };
  const exp = path.join(dir, "experiment");
  rmSync(exp, { recursive: true, force: true });
  mkdirSync(path.join(exp, "harness"), { recursive: true });
  const w = (rel: string, text: string) => writeFileSync(path.join(exp, rel), text);
  const record: TrialRecord = {
    schema: "article-trial/1",
    id: seed.id,
    status: "closed",
    subject: { bundle: p.subject.bundle, slug: p.subject.slug, file: seed.subjectFile },
    createdAt: seed.execs[0].at,
    updatedAt: verdict.at,
    seal: { sha256: "9f2c1e0d4b7a8c6e5f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e", at: at(10) },
    verdict: seed.verdict,
    closedAt: verdict.at,
    ...(runId ? { runId } : {}),
  };
  w("trial.json", `${JSON.stringify(record, null, 2)}\n`);
  w("prereg.json", `${JSON.stringify(p, null, 2)}\n`);
  w("seal.json", `${JSON.stringify(record.seal, null, 2)}\n`);
  w("exec.jsonl", seed.execs.map((e) => JSON.stringify(e)).join("\n") + "\n");
  w("results.json", `${JSON.stringify(seed.results, null, 2)}\n`);
  w("verdict.json", `${JSON.stringify(verdict, null, 2)}\n`);
  w("validity.json", `${JSON.stringify(seed.validity, null, 2)}\n`);
  w("frame.md", `# Frame\n\nPrior: ${p.prior}\n`);
  w("REPORT.md", `# ${p.arms[0].label} against ${p.alternative.name}\n\n${seed.reason}.\n`);
  w(path.join("harness", "README.md"), "# harness\n");

  const applicationPath = trialApplicationPath(seed.subjectFile, p.stack, p.technique);
  const ref: ArticleTrialRef = { id: seed.id, verdict: seed.verdict as ArticleTrialRef["verdict"], technique: p.technique, alternative: p.alternative.name, metric: p.metric.label, n: p.n, sourceN: 1, applicationPath };
  return { ref, prereg: p, verdict, subjectFile: seed.subjectFile, title: seed.title };
}

/** Clone `templateId` (a run at the gate under `store`) into one trial run per verdict, each
 *  with its `experiment/` written and `t1` built against `registry` (a registry checkout;
 *  absent, the record is a new file). Returns state -> run id. */
export async function seedTrialStates(store: string, templateId: string, opts: { registry?: string; now?: Date } = {}): Promise<Record<TrialSeedState, string>> {
  const src = path.join(store, templateId);
  const base = JSON.parse(readFileSync(path.join(src, "run.json"), "utf8")) as ArticleRun;
  const now = (opts.now ?? new Date()).toISOString();
  const out = {} as Record<TrialSeedState, string>;
  for (const state of TRIAL_SEED_STATES) {
    const seed = TRIAL_SEEDS[state];
    const id = `${templateId}-${state}`.slice(0, 90);
    const dir = path.join(store, id);
    rmSync(dir, { recursive: true, force: true });
    cpSync(src, dir, { recursive: true, filter: (f) => !/[\\/]\.(lock|driver)$/.test(f) });
    const { ref, prereg: p, verdict } = writeSeedExperiment(dir, state, id);

    // source 1 is the experiment's record, as `createRun` writes it
    const sources = JSON.parse(readFileSync(path.join(dir, "sources.json"), "utf8")) as Source[];
    const one = experimentSource(ref, p, verdict, SEED_REMOTE);
    writeFileSync(path.join(dir, "sources.json"), `${JSON.stringify(sources.map((s) => (s.n === 1 ? one : s)), null, 2)}\n`);
    writeFileSync(path.join(dir, "experiment-source.json"), `${JSON.stringify(one, null, 2)}\n`);

    // the patches: the model's own (in scope, or refused), then t1 by the engine's code
    rmSync(path.join(dir, "patches"), { recursive: true, force: true });
    rmSync(path.join(dir, "patches.rejected.json"), { force: true });
    mkdirSync(path.join(dir, "patches"), { recursive: true });
    const patches: RegistryPatch[] = [];
    if (seed.amendment) {
      writeFileSync(path.join(dir, "patches", "p1.patch"), seed.amendment.diff);
      patches.push({ id: "p1", target: seed.amendment.target, kind: "technique", rationale: seed.amendment.rationale, sources: [1], patchFile: "patches/p1.patch" });
    }
    const t1 = await trialRecordPatch(dir, ref, { dir: opts.registry ?? path.join(store, ".no-registry"), via: "env" });
    if (!("patch" in t1)) throw new Error(`seedTrialStates: ${t1.skipped}`);
    patches.push(t1.patch);
    writeFileSync(path.join(dir, "patches.json"), `${JSON.stringify(patches, null, 2)}\n`);
    if (seed.refused) writeFileSync(path.join(dir, "patches.rejected.json"), `${JSON.stringify(seed.refused, null, 2)}\n`);

    const run: ArticleRun = {
      ...base,
      id,
      status: "awaiting-approval",
      topic: { kind: "subject", bundle: p.subject.bundle, subject: p.subject.slug, text: seed.title, angle: p.question },
      critique: writeSeedCritique(dir, [{ outcomes: ALL_OK, decision: { decision: "keep", rationale: "Every accepted finding is a sentence-level fix already made." } }], AT),
      trial: ref,
      updatedAt: now,
    };
    delete run.approval;
    delete run.rejection;
    delete run.landing;
    delete run.error;
    writeFileSync(path.join(dir, "run.json"), `${JSON.stringify(run, null, 2)}\n`);
    out[state] = id;
  }
  return out;
}
