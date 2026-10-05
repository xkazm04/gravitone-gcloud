// RENDER PLAN — budget-aware batch planning and pause-and-resume control.
//
// WHY THIS FILE EXISTS.
// FramesAssembly renders missing plates serially, but without budget projection
// it would run full cut batches into the ceiling and abruptly fail without
// knowing how many plates could be afforded or when to resume.
//
// This module computes:
//   1. planRender: How many plates to attempt, the affordance label, and resume time.
//   2. afterOutcome: Whether an individual plate result should pause-until a window rollover,
//      stop the batch on systemic failure, or continue.

export interface PlanQuote {
  verdict?: "fits" | "partial" | "blocked" | "unknown";
  affordableImages?: number;
  estimateUsd?: number | null;
  resumeAt?: number | null;
}

export interface RenderPlan {
  count: number;
  label: string;
  resumeAt: number | null;
}

export type PlanAction =
  | { action: "pause-until"; until?: number }
  | { action: "stop" }
  | { action: "continue" };

/**
 * Compute batch render sizing and descriptive label from missing plates and budget quote.
 */
export function planRender(args: { missing: number; quote?: PlanQuote | null }): RenderPlan {
  const { missing, quote } = args;

  if (missing <= 0) {
    return { count: 0, label: "all plates composed", resumeAt: null };
  }

  const verdict = quote?.verdict;
  const platePlural = missing === 1 ? "plate" : "plates";

  if (verdict === "unknown") {
    // Unpriced providers: render all missing plates with NO dollar figure, never $0.00
    return {
      count: missing,
      label: `render ${missing} missing ${platePlural}`,
      resumeAt: null,
    };
  }

  if (verdict === "partial") {
    const affordable = Math.min(missing, Math.max(0, quote?.affordableImages ?? 0));
    const costNote =
      typeof quote?.estimateUsd === "number" && quote.estimateUsd > 0
        ? ` (~$${quote.estimateUsd.toFixed(2)})`
        : "";
    return {
      count: affordable,
      label: `render ${affordable} of ${missing} missing ${platePlural}${costNote}`,
      resumeAt: quote?.resumeAt ?? null,
    };
  }

  if (verdict === "blocked") {
    return {
      count: 0,
      label: "budget ceiling reached",
      resumeAt: quote?.resumeAt ?? null,
    };
  }

  // "fits" or no quote:
  const costNote =
    typeof quote?.estimateUsd === "number" && quote.estimateUsd > 0
      ? ` (~$${quote.estimateUsd.toFixed(2)})`
      : "";
  return {
    count: missing,
    label: `render ${missing} missing ${platePlural}${costNote}`,
    resumeAt: null,
  };
}

/**
 * Decide whether to pause until a window reset or stop the batch.
 */
export function afterOutcome(outcome: string, retryAt?: number): PlanAction {
  if (outcome === "over-budget") {
    return { action: "pause-until", until: retryAt };
  }
  if (outcome === "failed") {
    return { action: "stop" };
  }
  return { action: "continue" };
}
