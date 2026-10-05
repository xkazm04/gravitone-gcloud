// SEEDED ARTICLE RUNS, ONE PER STATE — for the /articles surface's probes and
// its browser drive (tests/golden-path/articles-ui.probe.spec.ts).
//
// The engine can only take a run to the gate and past it by doing the work, and
// the in-between states (a step mid-flight, a seat limit, a red registry gate)
// are exactly the ones nobody wants to cause on purpose. So: one real run is
// driven to `awaiting-approval` by the engine (stub agent, throwaway registry —
// tests/golden-path/_articles.ts), and this file CLONES its directory once per
// state and rewrites the clone's run.json to say where it stopped, removing the
// files a run in that state would not have yet.
//
// The manifests are written directly, NOT through lib/articles/store.ts
// updateRun: half of these states are unreachable by a legal transition from a
// run at the gate (a run cannot go back to `researching`). That is the point of
// a fixture; nothing here is a claim about what the engine would do.
//
// `.driver` is the store's lease file. A state seeded with `driverPid` gets one
// naming that process, so it reads as being driven (a live pid) — pass the pid
// of a process that outlives the read, e.g. the test runner's own.

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { summarizeCritique } from "@/lib/articles/critique";
import type {
  ArticleRun,
  CritiqueDecisionRecord,
  CritiqueDetail,
  CritiqueRoundDetail,
  FindingDisposition,
  Review,
  ReviewerOutcome,
  ReviewerReceipt,
  ReviewerSpec,
  ReviewFinding,
} from "@/lib/articles/types";

export type SeedState =
  | "researching"
  | "drafting"
  | "stalled"
  | "failed"
  | "unreachable"
  | "critique-running"
  | "critique-partial"
  | "critique-quorum"
  | "critique-keep"
  | "critique-rewrite"
  | "gate"
  | "landing"
  | "landed"
  | "land-failed"
  | "rejected";

export const SEED_STATES: readonly SeedState[] = [
  "researching",
  "drafting",
  "stalled",
  "failed",
  "unreachable",
  "critique-running",
  "critique-partial",
  "critique-quorum",
  "critique-keep",
  "critique-rewrite",
  "gate",
  "landing",
  "landed",
  "land-failed",
  "rejected",
];

/* ── the critique, written as its files ──────────────────────────────────── */

export const SEED_PANEL: ReviewerSpec[] = [
  { id: "fable", engine: "claude", model: "claude-fable-5-1", effort: "high", timeoutMin: 25 },
  { id: "grok", engine: "grok", model: "grok-4.7", effort: "high", timeoutMin: 25 },
  { id: "gemini", engine: "agy", model: "gemini-3.8-flash", effort: "high", timeoutMin: 25 },
  { id: "gpt", engine: "codex", model: "gpt-6-astra", effort: "high", timeoutMin: 25 },
];

const ERRORS: Partial<Record<ReviewerOutcome, string>> = {
  unavailable: 'Internal error: { "message": "API error (status 402 Payment Required): Grok Build usage balance exhausted", "http_status": 402 } (http 402)',
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
        ...(outcome === "completed" && (spec.engine === "claude" || spec.engine === "grok") ? { costUsd: 0.4213 } : {}),
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

const ALL_OK = { fable: "completed", grok: "completed", gemini: "completed", gpt: "completed" } as const;

const AT = (min: number) => new Date(Date.UTC(2026, 9, 5, 9, min, 0)).toISOString();

/** Clone `templateId` (a run at the gate under `store`) into one run per state.
 *  Returns state -> run id. */
export function seedRunStates(store: string, templateId: string, opts: { driverPid?: number; now?: Date } = {}): Record<SeedState, string> {
  const src = path.join(store, templateId);
  const base = JSON.parse(readFileSync(path.join(src, "run.json"), "utf8")) as ArticleRun;
  const now = (opts.now ?? new Date()).toISOString();
  const out = {} as Record<SeedState, string>;

  for (const state of SEED_STATES) {
    const id = `${templateId}-${state}`.slice(0, 90);
    const dir = path.join(store, id);
    rmSync(dir, { recursive: true, force: true });
    cpSync(src, dir, { recursive: true, filter: (f) => !/[\\/]\.(lock|driver)$/.test(f) });
    const drop = (...rels: string[]) => rels.forEach((r) => rmSync(path.join(dir, r), { recursive: true, force: true }));
    const done = (name: ArticleRun["steps"][number]["name"], a: number, b: number, costUsd?: number) => ({ name, status: "done" as const, startedAt: AT(a), endedAt: AT(b), ...(costUsd !== undefined ? { costUsd } : {}) });
    const research = done("research", 0, 7, 1.2431);
    const outline = done("outline", 7, 9, 0.2107);
    const draft = done("draft", 9, 21, 1.8022);
    const critique = done("critique", 21, 38, 0.8426);
    const check = done("check", 38, 39);
    const approval = { at: AT(40), patches: ["p1"] };
    const landingBase = { slug: "a-stub-post-about-tokens", branch: "article/a-stub-post-about-tokens" };

    // Every state at or past the gate keeps a full critique: one round, four
    // reviewers completed, keep. States before the critique have none.
    let run: ArticleRun = { ...base, id, steps: [research, outline, draft, critique, check], updatedAt: now };
    const before = () => {
      drop("critique");
      delete run.critique;
    };
    const atGate = () => {
      run.critique = writeSeedCritique(dir, [{ outcomes: ALL_OK, decision: { decision: "keep", rationale: "Every accepted finding is a sentence-level fix already made." } }], AT);
    };
    switch (state) {
      case "researching":
        drop("sources.json", "claims.json", "outline.md", "post", "check.json", "check", "patches.json", "patches", "patches.rejected.json", "agent");
        before();
        run = { ...run, status: "researching", steps: [{ name: "research", status: "running", startedAt: AT(0) }] };
        break;
      case "drafting":
      case "stalled":
        drop("outline.md", "post", "check.json", "check", "patches.json", "patches", "patches.rejected.json");
        before();
        run = { ...run, status: "drafting", steps: [research, { name: "outline", status: "running", startedAt: AT(7) }], updatedAt: state === "stalled" ? AT(8) : now };
        break;
      case "failed":
        drop("post", "check.json", "check", "patches.json", "patches", "patches.rejected.json");
        before();
        run = { ...run, status: "failed", steps: [research, outline, { name: "draft", status: "failed", startedAt: AT(9), endedAt: AT(10), costUsd: 0.0412 }], error: "draft: the agent seat-limit: Claude AI usage limit reached" };
        mkdirSync(path.join(dir, "agent"), { recursive: true });
        writeFileSync(path.join(dir, "agent", "draft.json"), JSON.stringify({ turn: "article-draft", outcome: "seat-limit", turns: 2, durationMs: 41000, exitCode: 1, costUsd: 0.0412, errors: ["Claude AI usage limit reached"], final: "" }, null, 2));
        break;
      case "unreachable":
        drop("sources.json", "claims.json", "outline.md", "post", "check.json", "check", "patches.json", "patches", "patches.rejected.json", "agent");
        before();
        run = { ...run, status: "failed", steps: [], standard: { recipe: "technical-blog-post-authoring", bundle: "technical-writing", subjects: [] }, error: "registry-unreachable: no registry found; tried ../ai-registry (../ai-registry)." };
        break;
      case "critique-running":
        // Round 1 mid-flight: two reviewers back, two still out.
        drop("check.json", "check");
        run.critique = writeSeedCritique(dir, [{ outcomes: { fable: "completed", gpt: "completed" } }], AT);
        run = { ...run, status: "critiquing", steps: [research, outline, draft, { name: "critique", status: "running", startedAt: AT(21) }] };
        break;
      case "critique-partial":
        // grok out of balance (402), the other three completed: the run went on.
        run.critique = writeSeedCritique(dir, [{ outcomes: { ...ALL_OK, grok: "unavailable" }, decision: { decision: "keep", rationale: "The blocker was a stale price; the fix is one sentence and is already in the draft." } }], AT);
        run = { ...run, status: "awaiting-approval" };
        break;
      case "critique-quorum":
        // Only one reviewer completed: the run stopped before the gate.
        drop("check.json", "check");
        run.critique = writeSeedCritique(dir, [{ outcomes: { fable: "completed", grok: "unavailable", gemini: "seat-limit", gpt: "timed-out" } }], AT);
        run = {
          ...run,
          status: "failed",
          steps: [research, outline, draft, { name: "critique", status: "failed", startedAt: AT(21), endedAt: AT(47), costUsd: 0.4213 }],
          error: `critique: critique-quorum: round 1: 1 of 4 reviewers completed, 2 needed (grok unavailable: ${ERRORS.unavailable}; gemini seat-limit: ${ERRORS["seat-limit"]}; gpt timed-out: ${ERRORS["timed-out"]})`,
        };
        break;
      case "critique-keep":
        atGate();
        run = { ...run, status: "awaiting-approval" };
        break;
      case "critique-rewrite":
        // Round 1: research, then a rewrite; round 2 reviewed the rewrite and the writer kept it.
        run.critique = writeSeedCritique(
          dir,
          [
            { outcomes: { ...ALL_OK, grok: "unavailable" }, decision: { decision: "research", rationale: "Two reviewers found the price stale; the current figure needs a primary source the research does not hold." }, revised: { research: true } },
            { outcomes: { ...ALL_OK, grok: "unavailable" }, decision: { decision: "keep", rationale: "Only a minor engagement note remains; the closing already returns to the opening number." } },
          ],
          AT,
        );
        run = { ...run, status: "awaiting-approval", steps: [research, outline, draft, done("critique", 21, 66, 1.9031), done("check", 66, 67)] };
        break;
      case "gate":
        atGate();
        run = { ...run, status: "awaiting-approval" };
        break;
      case "landing":
        atGate();
        run = { ...run, status: "landing", approval, landing: { ...landingBase, gates: [{ lane: "publications", mode: "write", ok: true }], medium: "medium" } };
        break;
      case "landed":
        atGate();
        run = {
          ...run,
          status: "landed",
          approval,
          landing: {
            ...landingBase,
            commit: "4f1c2e9a7b3d5e6f8a9b0c1d2e3f4a5b6c7d8e9f",
            prUrl: "https://example.invalid/xkazm04/ai-registry/pull/1",
            gates: [
              { lane: "publications", mode: "write", ok: true },
              { lane: "publications", mode: "check", ok: true },
              { lane: "knowledge", mode: "write", ok: true },
              { lane: "knowledge", mode: "check", ok: true },
            ],
            medium: "medium",
          },
        };
        mkdirSync(path.join(dir, "medium"), { recursive: true });
        writeFileSync(path.join(dir, "medium", "story.html"), "<!doctype html><title>story</title><h1>A stub post about tokens</h1>\n");
        writeFileSync(path.join(dir, "medium", "tags.txt"), "tokens\nllm\n");
        writeFileSync(path.join(dir, "medium", "README.md"), "# Paste into Medium\n");
        break;
      case "land-failed":
        atGate();
        run = {
          ...run,
          status: "failed",
          approval,
          error: "landing: the registry gate failed: publications --lane check",
          landing: { ...landingBase, worktree: "C:/tmp/reg-wt-article", gates: [{ lane: "publications", mode: "write", ok: true }, { lane: "publications", mode: "check", ok: false }], medium: "medium" },
        };
        writeFileSync(path.join(dir, "landing.log"), "lane publications: 1 publication(s), 1 problem(s)\na-stub-post-about-tokens: title asks the gate to fail\n");
        break;
      case "rejected":
        atGate();
        run = { ...run, status: "rejected", rejection: { at: AT(41), note: "The counter-source is a news piece; find the primary." } };
        break;
    }
    writeFileSync(path.join(dir, "run.json"), `${JSON.stringify(run, null, 2)}\n`);
    if (opts.driverPid && (state === "researching" || state === "drafting" || state === "landing" || state === "critique-running")) {
      writeFileSync(path.join(dir, ".driver"), JSON.stringify({ pid: opts.driverPid, at: now }));
    }
    out[state] = id;
  }
  return out;
}
