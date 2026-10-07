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
//
// THE LEDGER HAS A READ SIDE (2026-10-07, card IMG-A stage 2). It used to
// export reserve, settle, release and a stats total, and nothing else: the class
// declares three attribution axes and no export could read one, so a spend
// surface could say how much the clips cost and not which project spent it.
// The shared conformance kit (tests/golden-path/_meterKit.ts) found it: 10 of
// its 18 cases could not be run against this meter. `videoSpendByAxis`,
// `videoSpendRows` and `recordVideoSpend` are the kernel's own views, in the
// shape every other meter hands out.

import { SPEND_CLASSES } from "../../spend/classes";
import { createMeter, type MeterAxes, type MeterRow, type MeterStats } from "../../spend/meter";
import { VideoError } from "./errors";
import type { CostBasis } from "./types";

const CLASS = SPEND_CLASSES["video-usd"];

export const VIDEO_BUDGET_VAR = CLASS.ceilingVar;
export const VIDEO_WINDOW_VAR = CLASS.windowVar;
/** The bottom of the expected band, in USD. Reporting only. */
export const VIDEO_FLOOR_VAR = CLASS.floorVar;

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

/** Replace the hold with what happened — one row, or several. An unpriced row
 *  books nothing and is counted (lib/spend/meter.ts: unpriced is not free). The
 *  hold is gone afterwards even if a row throws while being read. */
export function settleVideo(hold: VideoHold, entries: VideoSpendEntry | VideoSpendEntry[]): void {
  meter.settle(hold, entries);
}

/** Book a clip with no hold to settle. The clip route always holds first; this
 *  is the kernel's `book`, for a cost learned after its hold is gone. */
export function recordVideoSpend(entry: VideoSpendEntry): void {
  meter.book(entry);
}

export function videoBudgetStats(now: number = Date.now()): MeterStats {
  return meter.stats(now);
}

/** The window split by project, provider, model and outcome. `unattributed` is
 *  the honesty field: spend on rows that named no project. */
export function videoSpendByAxis(now: number = Date.now()): MeterAxes {
  return meter.byAxis(now);
}

/** The window's rows, oldest first, as copies. */
export function videoSpendRows(now: number = Date.now()): MeterRow<VideoAxes, CostBasis>[] {
  return meter.rows(now);
}

/** Test hook — clear the window and the counters. */
export function __resetVideoBudget(): void {
  meter.reset();
}
