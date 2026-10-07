// SPEND VIEW — every spend class in one window view, for GET /api/spend.
//
// A projection with no state. It reads each class's meter FRESH, through the
// adapters' locked stats(now) and byAxis(now), at ONE `now` for all four; it
// never reads seenSpendRows, seenRows or a store's lastSeen (Q4, App Master,
// IMG-A card 3c, docs/concepts/moonshots-2026-10-05/06-imaging-music.md:24).
// A second process's booking is therefore in the answer.
//
// The boundary travels with the total (the rule at lib/imaging/budget.ts
// budgetStats): every class carries its own windowMs, windowStart and
// windowEnd, so a consumer renders the window it was handed.
//
// text-usd has NO ceiling, floor, held, remaining or underFloor key: the
// operator ruled "Count only, refuse nothing" (card 3b), so those keys are
// absent rather than null or 0, which would read as a ceiling of nothing.
//
// It lives outside lib/spend/ so the kernel imports no adapter.

import { imagingSpendWindow } from "./imaging/budget";
import { videoBudgetStats, videoSpendByAxis } from "./imaging/video/budget";
import { musicSpendWindow } from "./music/budget";
import { SPEND_CLASSES, isCountOnly, type SpendClass, type SpendUnit } from "./spend/classes";
import type { CountStats, MeterAxes, MeterStats } from "./spend/meter";
import type { MeterCounters, SpendStoreKind } from "./spend/store";
import { textSpendByAxis, textSpendStats } from "./text/spend";

export interface SpendClassView {
  id: SpendClass;
  unit: SpendUnit;
  countOnly: boolean;
  windowMs: number;
  windowStart: number;
  windowEnd: number;
  spent: number;
  rows: number;
  counters: MeterCounters;
  store: SpendStoreKind;
  storeReason?: string;
  byOutcome: MeterAxes["byOutcome"];
  /** Keyed by the class's declared axes. */
  byAxis: MeterAxes["byAxis"];
  unattributed: number;
  /** Only a class with a ceiling carries these five. */
  ceiling?: number;
  floor?: number;
  held?: number;
  remaining?: number;
  underFloor?: boolean;
}

export interface SpendView {
  at: number;
  classes: SpendClassView[];
}

type Read = { stats: MeterStats | CountStats; axes: MeterAxes };

function project(id: SpendClass, { stats, axes }: Read): SpendClassView {
  const def = SPEND_CLASSES[id];
  const view: SpendClassView = {
    id,
    unit: def.unit,
    countOnly: isCountOnly(def),
    windowMs: stats.windowMs,
    windowStart: stats.windowStart,
    windowEnd: stats.windowEnd,
    spent: stats.spent,
    rows: stats.rows,
    counters: stats.counters,
    store: stats.store,
    ...(stats.storeReason ? { storeReason: stats.storeReason } : {}),
    byOutcome: axes.byOutcome,
    byAxis: Object.fromEntries(def.axes.map((a) => [a, axes.byAxis[a] ?? {}])),
    unattributed: axes.unattributed,
  };
  if ("ceiling" in stats) {
    view.ceiling = stats.ceiling;
    view.floor = stats.floor;
    view.held = stats.held;
    view.remaining = stats.remaining;
    view.underFloor = stats.underFloor;
  }
  return view;
}

export async function spendView(now: number = Date.now()): Promise<SpendView> {
  const [imaging, video, music, text] = await Promise.all([
    imagingSpendWindow(now),
    Promise.all([videoBudgetStats(now), videoSpendByAxis(now)]).then(([stats, axes]) => ({ stats, axes })),
    musicSpendWindow(now),
    Promise.all([textSpendStats(now), textSpendByAxis(now)]).then(([stats, axes]) => ({ stats, axes })),
  ]);
  const reads: Record<SpendClass, Read> = {
    "imaging-usd": imaging,
    "video-usd": video,
    "music-audio-s": music,
    "text-usd": text,
  };
  return {
    at: now,
    classes: (Object.keys(SPEND_CLASSES) as SpendClass[]).map((id) => project(id, reads[id])),
  };
}
