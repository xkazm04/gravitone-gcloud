// THE /articles SURFACE'S READING OF A RUN — pure, so the node lane can pin it
// (tests/golden-path/articles-ui.probe.spec.ts) without a DOM or a server.
//
// The engine's ten statuses (lib/articles/types.ts ARTICLE_STATUSES) are what a
// run IS. What the page has to draw is slightly different, in two places:
//
//   · A WORKING STATUS WITH NO DRIVER IS NOT RUNNING. `researching` on disk with
//     no live lease is a drive that died (a restarted server, a killed CLI).
//     Drawn as a spinner it would spin for ever; it is `stalled`, and the page
//     offers the same Resume a failure gets.
//   · `failed` AFTER APPROVAL is a landing failure: the post was approved, the
//     registry write-back broke. Resume re-lands; it never re-approves.

import {
  FINDING_KINDS,
  FINDING_SEVERITIES,
  type ArticleRun,
  type ArticleStatus,
  type CheckItem,
  type CheckReport,
  type CritiqueDetail,
  type CritiqueRoundDetail,
  type FindingDisposition,
  type FindingKind,
  type FindingSeverity,
  type ReviewerOutcome,
  type ReviewerSpec,
  type ReviewFinding,
  type ReviewVerdict,
  type StepName,
} from "@/lib/articles/types";

export type Tone = "cyan" | "amber" | "rose" | "emerald" | "neutral";

/** What the page draws a run as. */
export type RunPhase = "running" | "stalled" | "failed" | "gate" | "landing" | "landed" | "rejected";

export const WORKING: readonly ArticleStatus[] = ["queued", "researching", "drafting", "critiquing", "checking", "approved", "landing"];

export function phaseOf(run: Pick<ArticleRun, "status">, driving: boolean): RunPhase {
  switch (run.status) {
    case "awaiting-approval":
      return "gate";
    case "landed":
      return "landed";
    case "rejected":
      return "rejected";
    case "failed":
      return "failed";
    case "approved":
    case "landing":
      return driving ? "landing" : "stalled";
    default:
      return driving ? "running" : "stalled";
  }
}

/** The status chip: a word and a tone per phase. Never colour alone — the
 *  chip draws its glyph and the word beside the tone. */
export const PHASE_LOOK: Record<RunPhase, { word: string; tone: Tone }> = {
  running: { word: "running", tone: "cyan" },
  stalled: { word: "stalled", tone: "amber" },
  failed: { word: "failed", tone: "rose" },
  gate: { word: "awaiting approval", tone: "amber" },
  landing: { word: "landing", tone: "cyan" },
  landed: { word: "landed", tone: "emerald" },
  rejected: { word: "rejected", tone: "neutral" },
};

/** The run's own status word, for the chip's accessible name and the detail
 *  header — the engine's word, verbatim. */
export const statusWord = (s: ArticleStatus) => s.replace(/-/g, " ");

/** What the run has cost so far: the sum of every step that reported a figure,
 *  and how many agent steps ran without one. `usd` is null when no step has
 *  reported — an unpriced run is not a free one. */
export function costOf(run: Pick<ArticleRun, "steps">): { usd: number | null; unpriced: number } {
  let usd: number | null = null;
  let unpriced = 0;
  for (const s of run.steps) {
    if (s.costUsd !== undefined) usd = (usd ?? 0) + s.costUsd;
    else if (s.name !== "check" && s.status !== "running") unpriced++;
  }
  return { usd: usd === null ? null : Math.round(usd * 10_000) / 10_000, unpriced };
}

export const fmtUsd = (n: number) => `$${n < 0.01 && n > 0 ? n.toFixed(4) : n.toFixed(2)}`;

/* ── the stepper ───────────────────────────────────────────────────────── */

export type NodeId = StepName | "gate";
export const NODES: readonly NodeId[] = ["research", "outline", "draft", "critique", "check", "gate"];
export type NodeState = "pending" | "running" | "stalled" | "done" | "failed" | "waiting" | "rejected";

export interface StepNode {
  id: NodeId;
  state: NodeState;
  startedAt?: string;
  endedAt?: string;
  costUsd?: number;
}

export function nodesOf(run: Pick<ArticleRun, "status" | "steps" | "approval">, driving: boolean): StepNode[] {
  const out: StepNode[] = [];
  for (const id of NODES) {
    if (id === "gate") {
      const state: NodeState =
        run.status === "awaiting-approval"
          ? "waiting"
          : run.status === "rejected"
            ? "rejected"
            : run.approval
              ? "done"
              : "pending";
      out.push({ id, state });
      continue;
    }
    const s = run.steps.find((x) => x.name === id);
    if (!s) {
      out.push({ id, state: "pending" });
      continue;
    }
    const state: NodeState = s.status === "running" ? (driving ? "running" : "stalled") : s.status;
    out.push({ id, state, startedAt: s.startedAt, ...(s.endedAt ? { endedAt: s.endedAt } : {}), ...(s.costUsd !== undefined ? { costUsd: s.costUsd } : {}) });
  }
  return out;
}

/** "4m 12s" between two ISO instants; null when either is missing. */
export function span(from?: string, to?: string): string | null {
  if (!from || !to) return null;
  const s = Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 1000));
  if (!Number.isFinite(s)) return null;
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/* ── the check report ─────────────────────────────────────────────────── */

const ORDER: Record<CheckItem["status"], number> = { fail: 0, "not-measured": 1, pass: 2 };

/** Failures first, then what nobody measured, then passes — the gate's order.
 *  Stable within a status, so the engine's own dimension order holds. */
export function checkOrder(report: Pick<CheckReport, "items">): CheckItem[] {
  return report.items.map((it, i) => ({ it, i })).sort((a, b) => ORDER[a.it.status] - ORDER[b.it.status] || a.i - b.i).map((x) => x.it);
}

/** A dimension the check could not measure at all (storytelling, depth: the
 *  human's judgement) is listed in `notMeasured` and has no item; it counts as
 *  not measured all the same, never as nothing. */
export function checkCounts(report: Pick<CheckReport, "items" | "notMeasured">): { fail: number; notMeasured: number; pass: number } {
  let fail = 0;
  let notMeasured = report.notMeasured.length;
  let pass = 0;
  for (const it of report.items) {
    if (it.status === "fail") fail++;
    else if (it.status === "pass") pass++;
    else notMeasured++;
  }
  return { fail, notMeasured, pass };
}

/** What Resume will do, in the verb on its button. */
export function resumeVerb(run: Pick<ArticleRun, "approval" | "status">): string {
  return run.approval ? "Re-land" : "Resume";
}

/* ── the critique ─────────────────────────────────────────────────────── */

/** A reviewer as the panel draws it in one round: its outcome once it has a
 *  receipt; `reviewing` while a live driver is on the round and it has none
 *  yet; `not run` when nothing is working on it (a stalled round, or a round
 *  that stopped before it). */
export type ReviewerState = ReviewerOutcome | "reviewing" | "not-run";

export const REVIEWER_LOOK: Record<ReviewerState, { word: string; tone: Tone }> = {
  completed: { word: "completed", tone: "emerald" },
  unavailable: { word: "unavailable", tone: "amber" },
  "seat-limit": { word: "seat limit", tone: "amber" },
  "timed-out": { word: "timed out", tone: "rose" },
  errored: { word: "errored", tone: "rose" },
  reviewing: { word: "reviewing", tone: "cyan" },
  "not-run": { word: "not run", tone: "neutral" },
};

export const VERDICT_TONE: Record<ReviewVerdict, Tone> = { publish: "emerald", revise: "amber", rework: "rose" };
export const SEVERITY_TONE: Record<FindingSeverity, Tone> = { blocker: "rose", major: "amber", minor: "neutral" };
/** A rejected finding is the writer's call, not a failure: neutral. An
 *  unanswered one is amber — the gate must see it. */
export const DISPOSITION_TONE: Record<FindingDisposition["disposition"] | "unanswered", Tone> = {
  accepted: "emerald",
  rejected: "neutral",
  deferred: "cyan",
  unanswered: "amber",
};

export interface ReviewerRow {
  spec: ReviewerSpec;
  state: ReviewerState;
  verdict?: ReviewVerdict;
  /** Findings by severity; absent when there is no review. */
  counts?: Record<FindingSeverity, number>;
  costUsd?: number;
  error?: string;
  attempts?: number;
  /** Files it left in its read-only workspace. */
  wrote?: string[];
}

/** The panel in one round, in panel order. */
export function reviewerRows(detail: CritiqueDetail, round: number, live: boolean): ReviewerRow[] {
  const r = detail.rounds.find((x) => x.round === round);
  return detail.reviewers.map((spec) => {
    const receipt = r?.receipts.find((x) => x.id === spec.id);
    const review = r?.reviews.find((x) => x.reviewer === spec.id);
    const state: ReviewerState = receipt ? receipt.outcome : live && r && !r.closed ? "reviewing" : live && !r && round === detail.rounds.length + 1 ? "reviewing" : "not-run";
    const counts = review ? countBySeverity(review.findings) : undefined;
    return {
      spec,
      state,
      ...(review ? { verdict: review.verdict } : {}),
      ...(counts ? { counts } : {}),
      ...(receipt?.costUsd !== undefined ? { costUsd: receipt.costUsd } : {}),
      ...(receipt && receipt.outcome !== "completed" && receipt.errors[0] ? { error: receipt.errors[0] } : {}),
      ...(receipt ? { attempts: receipt.attempts } : {}),
      ...(receipt?.wrote?.length ? { wrote: receipt.wrote } : {}),
    };
  });
}

export function countBySeverity(findings: Pick<ReviewFinding, "severity">[]): Record<FindingSeverity, number> {
  const c = { blocker: 0, major: 0, minor: 0 } as Record<FindingSeverity, number>;
  for (const f of findings) c[f.severity]++;
  return c;
}

export interface FindingRow {
  reviewer: string;
  finding: ReviewFinding;
  /** Absent until the writer has answered the round. */
  disposition?: FindingDisposition;
}

/** A round's findings grouped by kind (the lenses' order), blockers first
 *  inside each group, then by reviewer. Empty groups are left out. */
export function findingGroups(round: Pick<CritiqueRoundDetail, "reviews" | "dispositions">): { kind: FindingKind; rows: FindingRow[] }[] {
  const sev = (s: FindingSeverity) => FINDING_SEVERITIES.indexOf(s);
  const rows: FindingRow[] = round.reviews.flatMap((rv) =>
    rv.findings.map((f) => {
      const d = round.dispositions?.find((x) => x.reviewer === rv.reviewer && x.findingId === f.id);
      return { reviewer: rv.reviewer, finding: f, ...(d ? { disposition: d } : {}) };
    }),
  );
  return FINDING_KINDS.map((kind) => ({
    kind,
    rows: rows.filter((x) => x.finding.kind === kind).sort((a, b) => sev(a.finding.severity) - sev(b.finding.severity) || a.reviewer.localeCompare(b.reviewer)),
  })).filter((g) => g.rows.length > 0);
}

export interface RoundLine {
  round: number;
  completed: number;
  of: number;
  findings: number;
  closed: boolean;
  decision?: CritiqueRoundDetail["decision"];
  revised?: CritiqueRoundDetail["revised"];
}

/** One line per round that ran: who completed, how much was found, what the
 *  writer decided and whether the post was revised after it. */
export function roundTimeline(detail: CritiqueDetail): RoundLine[] {
  return detail.rounds.map((r) => ({
    round: r.round,
    completed: r.receipts.filter((x) => x.outcome === "completed").length,
    of: detail.reviewers.length,
    findings: r.reviews.reduce((a, rv) => a + rv.findings.length, 0),
    closed: r.closed,
    ...(r.decision ? { decision: r.decision } : {}),
    ...(r.revised ? { revised: r.revised } : {}),
  }));
}

/** The round the panel opens on: the last one that has anything to show. */
export function latestRound(detail: CritiqueDetail): number {
  return detail.rounds.length ? detail.rounds[detail.rounds.length - 1].round : 1;
}

/** The topic as one line: `bundle/slug` for a registry subject, else the text. */
export function topicLine(run: Pick<ArticleRun, "topic">): { address: string | null; text: string } {
  const t = run.topic;
  return { address: t.kind === "subject" && t.bundle && t.subject ? `${t.bundle}/${t.subject}` : null, text: t.text };
}

/* ── the gate, at a glance ────────────────────────────────────────────── */

export interface GateFigures {
  fail: number;
  notMeasured: number;
  pass: number;
  /** Blocker findings of the latest round the writer did not accept: rejected,
   *  deferred or unanswered. An accepted blocker was acted on; one the writer
   *  overruled is exactly what the human has to weigh. */
  blockers: number;
  /** Findings of the latest round with no disposition yet. */
  unanswered: number;
}

/** The figures the gate is decided on, read off the check report and the
 *  critique's latest round. Zero where the file is absent. */
export function gateFigures(d: { check?: Pick<CheckReport, "items" | "notMeasured">; critique?: CritiqueDetail }): GateFigures {
  const c = d.check ? checkCounts(d.check) : { fail: 0, notMeasured: 0, pass: 0 };
  let blockers = 0;
  let unanswered = 0;
  const round = d.critique?.rounds.find((r) => r.round === latestRound(d.critique!));
  if (round) {
    for (const g of findingGroups(round)) {
      for (const x of g.rows) {
        if (!x.disposition) unanswered++;
        if (x.finding.severity === "blocker" && x.disposition?.disposition !== "accepted") blockers++;
      }
    }
  }
  return { ...c, blockers, unanswered };
}
