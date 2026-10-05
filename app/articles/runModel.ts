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

import type { ArticleRun, ArticleStatus, CheckItem, CheckReport, StepName } from "@/lib/articles/types";

export type Tone = "cyan" | "amber" | "rose" | "emerald" | "neutral";

/** What the page draws a run as. */
export type RunPhase = "running" | "stalled" | "failed" | "gate" | "landing" | "landed" | "rejected";

export const WORKING: readonly ArticleStatus[] = ["queued", "researching", "drafting", "checking", "approved", "landing"];

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
export const NODES: readonly NodeId[] = ["research", "outline", "draft", "check", "gate"];
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

/** The topic as one line: `bundle/slug` for a registry subject, else the text. */
export function topicLine(run: Pick<ArticleRun, "topic">): { address: string | null; text: string } {
  const t = run.topic;
  return { address: t.kind === "subject" && t.bundle && t.subject ? `${t.bundle}/${t.subject}` : null, text: t.text };
}
