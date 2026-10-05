// THE VIDEO SPEND CEILING — class `video-usd` on the shared kernel.
//
// Server-only. The same reserve → settle → book discipline lib/imaging/budget.ts
// runs for plates (lib/spend/meter.ts holds the rules), with clip vocabulary:
// a row is attributed to the PROJECT that asked for it, the provider that ran
// it and the model it named. The clip route reserves BEFORE the adapter is
// touched (lib/imaging/video/clips.ts startClip), so the call that would cross
// the ceiling is refused with nothing dispatched and nothing billed.
//
// In-memory and per-process, exactly as imaging's ledger is; the window
// survives nothing but this process.

import { SPEND_CLASSES } from "../../spend/classes";
import { createMeter, type MeterStats } from "../../spend/meter";
import { VideoError } from "./errors";
import type { CostBasis } from "./types";

const CLASS = SPEND_CLASSES["video-usd"];

export const VIDEO_BUDGET_VAR = CLASS.ceilingVar;
export const VIDEO_WINDOW_VAR = CLASS.windowVar;

export interface VideoSpendEntry {
  usd: number | null | undefined;
  project: string;
  provider: string;
  model: string;
  outcome: "served" | "failed";
  basis: CostBasis;
  at?: number;
}

type VideoAxes = { project: string; provider: string; model: string };

const meter = createMeter<VideoSpendEntry, VideoAxes, CostBasis>(CLASS, {
  entry: (e) => ({
    amount: e.usd ?? undefined,
    outcome: e.outcome,
    basis: e.basis,
    axes: { project: e.project, provider: e.provider, model: e.model },
    at: e.at,
  }),
  refuse: ({ amount, spent, held, ceiling, windowMs, refusals }) => {
    console.log(
      `[video] budget refused est=$${amount.toFixed(4)} spent=$${spent.toFixed(4)} held=$${held.toFixed(4)} ` +
        `ceiling=$${ceiling.toFixed(2)} windowMs=${windowMs} refusals=${refusals}`,
    );
    const windowMin = Math.round(windowMs / 60000);
    return new VideoError(
      `Video spend ceiling reached: this clip holds $${amount.toFixed(2)} and $${(spent + held).toFixed(2)} ` +
        `is already spent or held in the last ~${windowMin} min, which would exceed the $${ceiling.toFixed(2)} ` +
        `ceiling (${VIDEO_BUDGET_VAR}). Refused before the vendor was called.`,
      "over-budget",
    );
  },
  invalid: (amount) =>
    new VideoError(`Video spend cannot be reserved: ${String(amount)} is not a finite non-negative amount.`, "invalid"),
  evicted: ({ dropped, droppedAmount, remaining, windowMs }) =>
    console.log(
      `[video] budget window-reset evicted=${dropped} usd=$${droppedAmount.toFixed(4)} ` +
        `remaining=$${remaining.toFixed(4)} windowMs=${windowMs}`,
    ),
});

export interface VideoHold {
  readonly id: string;
  readonly amount: number;
}

/** Hold `usd` for a clip about to be dispatched. Throws `over-budget` (402)
 *  when the hold would cross the ceiling — before any vendor is touched. */
export function reserveVideo(usd: number, now: number = Date.now()): VideoHold {
  const h = meter.reserve(usd, now);
  return { id: h.id, amount: h.amount };
}

/** Drop a hold without booking: the clip never reached the vendor. */
export function releaseVideo(hold: VideoHold): void {
  meter.release(hold);
}

/** Replace the hold with what happened. An unpriced row books nothing and is
 *  counted (lib/spend/meter.ts: unpriced is not free). */
export function settleVideo(hold: VideoHold, entry: VideoSpendEntry): void {
  meter.settle(hold, entry);
}

export function videoBudgetStats(now: number = Date.now()): MeterStats {
  return meter.stats(now);
}

/** Test hook — clear the window and the counters. */
export function __resetVideoBudget(): void {
  meter.reset();
}
