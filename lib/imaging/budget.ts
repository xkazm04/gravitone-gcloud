// SPEND CEILING — the enforcement metering that lib/imaging/pricing.ts always
// implied but never applied.
//
// WHY THIS FILE EXISTS. pricing.ts can say what a call is likely to cost, and
// the router logs what each call DID cost, but nothing stood between a caller
// and an unbounded bill: a loop against /api/imaging/generate spent the
// operator's balance as fast as the vendor would answer. Metering you can read
// but not enforce is a dashboard, not a limit. This module is the limit.
//
// THE RULE. A rolling window holds recent spend. Before the chokepoint spends,
// it prices the PENDING call with the pre-call estimate (estimatePerImage —
// deliberately the DEAREST declared per-image rate, so the guard errs high, the
// right direction for money) and refuses when that would push the window past
// the ceiling. Refusal is an `over-budget` ImagingError (HTTP 402), thrown
// before any vendor is touched, so nothing is billed on the call that trips it.
//
// DEFAULTS ARE SAFE, NOT UNLIMITED. IMAGING_BUDGET_USD_PER_WINDOW defaults to
// $5 over a 1-hour window. An unset ceiling is a bounded ceiling, not an open
// tab — that is the whole point ("budget-defaults-unlimited").
//
// SERVER ONLY, like the rest of lib/imaging. In-memory and per-process: good
// enough for a single-instance prototype; a scaled-out deployment would move the
// ledger to a shared store. It imports estimatePerImage (pure, env-free) and so
// does NOT compromise pricing.ts's no-env property — this module reads env, that
// one still does not.
//
// ── THE METER WATCHES ITSELF (added 2026-08-24) ────────────────────────────
//
// A ceiling that never reports its own activity is only half a limit. Two things
// used to happen silently here and now do not:
//
//   · REFUSALS WERE NOT COUNTED. assertWithinBudget threw and that was the end of
//     it. Refusal volume is the budget system's own health metric — a spike is
//     either the ceiling doing its job or a ceiling strangling real work, and
//     without a count there is no way to tell which. Zero recorded refusals,
//     forever, is indistinguishable from a gate that is not on the spending path.
//   · THE WINDOW RESET WAS INVISIBLE. `prune` dropped aged-out rows with no trace,
//     so spend appeared to vanish: an operator reading `currentSpendUsd` across a
//     rollover sees a number fall and cannot tell a reset from a mis-booking. The
//     window is now the only thing that may remove spend, and it says so.
//
// ENFORCEMENT SEMANTICS ARE UNCHANGED — the same calls pass and the same calls
// are refused, with the same message. Everything below is accounting ADDED beside
// the gate, never a new condition inside it. The counters are read through
// `budgetStats()`, which returns the window boundary WITH the total so a reader
// renders the window it was actually given instead of re-deriving its own.
//
// The lines these counters write are safe by construction: numbers, env-var
// NAMES, and nothing else. No vendor text, no prompt, no credential ever reaches
// them, so they need none of log.ts's scrubbing (and this module deliberately
// does not depend on log.ts).

import { overBudget } from "./errors";
import { estimatePerImage } from "./pricing";

export const BUDGET_VAR = "IMAGING_BUDGET_USD_PER_WINDOW";
export const WINDOW_VAR = "IMAGING_BUDGET_WINDOW_MS";

const DEFAULT_CEILING_USD = 5;
const DEFAULT_WINDOW_MS = 3_600_000; // one hour

/** The ceiling in USD. Unset/negative/NaN → the safe default. `0` is a valid
 *  ceiling meaning "spend nothing", not "disabled". */
export function budgetCeilingUsd(): number {
  const n = Number(process.env[BUDGET_VAR]);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_CEILING_USD;
}

/** The rolling window in ms. Unset/non-positive/NaN → the safe default. */
export function budgetWindowMs(): number {
  const n = Number(process.env[WINDOW_VAR]);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_WINDOW_MS;
}

interface Spend {
  at: number;
  usd: number;
}
let ledger: Spend[] = [];

/**
 * What the meter has done to itself. Every field is a COUNT of an event the
 * gate would otherwise have performed silently; none of them is read by
 * `assertWithinBudget`, so none of them can change who gets refused.
 */
export interface BudgetCounters {
  /** Calls `assertWithinBudget` refused. The budget system's health metric. */
  refusals: number;
  /** Estimated spend those refusals prevented — what the ceiling saved. */
  refusedUsd: number;
  /** Rows `recordSpend` actually booked. */
  booked: number;
  /** `recordSpend` calls that booked NOTHING because the figure was absent,
   *  non-finite or non-positive. An unpriced call is unpriced, not free, so it
   *  is counted rather than dropped: a high share here means the window total
   *  is a lower bound wearing a number's confidence. */
  unpriced: number;
  /** Rows the rolling window aged out. The window is the ONLY thing that may
   *  remove spend, so this is the whole explanation for any fall in the total. */
  evicted: number;
  /** The spend those aged-out rows carried. */
  evictedUsd: number;
  /** When the window last dropped anything, or null if it never has. */
  lastEvictionAt: number | null;
}

const zeroCounters = (): BudgetCounters => ({
  refusals: 0,
  refusedUsd: 0,
  booked: 0,
  unpriced: 0,
  evicted: 0,
  evictedUsd: 0,
  lastEvictionAt: null,
});

let counters: BudgetCounters = zeroCounters();

/** One greppable line, same `[imaging]` prefix as log.ts's call lines so a
 *  single grep finds the engine's whole trace. Numbers only — see the header. */
function note(line: string): void {
  console.log(`[imaging] budget ${line}`);
}

function prune(now: number): void {
  const cutoff = now - budgetWindowMs();
  const kept: Spend[] = [];
  let droppedUsd = 0;
  let dropped = 0;
  for (const s of ledger) {
    if (s.at >= cutoff) kept.push(s);
    else {
      dropped++;
      droppedUsd += s.usd;
    }
  }
  if (dropped === 0) return; // nothing rolled over; stay silent
  ledger = kept;
  counters.evicted += dropped;
  counters.evictedUsd += droppedUsd;
  counters.lastEvictionAt = now;
  const remaining = kept.reduce((a, s) => a + s.usd, 0);
  // The reset is the ONLY sanctioned way spend leaves the window, so it says so
  // out loud: a total that fell without one of these lines is a bug, not a roll.
  note(
    `window-reset evicted=${dropped} usd=$${droppedUsd.toFixed(4)} ` +
      `remaining=$${remaining.toFixed(4)} windowMs=${budgetWindowMs()}`,
  );
}

/** Total spend inside the current window. */
export function currentSpendUsd(now: number = Date.now()): number {
  prune(now);
  return ledger.reduce((a, s) => a + s.usd, 0);
}

/**
 * The window's own numbers, for a spend surface or an operator.
 *
 * The BOUNDARY travels with the total deliberately: a consumer renders the
 * window it was handed rather than re-deriving one, which is how a dashboard
 * and an enforcer end up disagreeing about the same screen. `counters` is a
 * copy — a caller cannot reach in and reset the meter by mutating a snapshot.
 */
export function budgetStats(now: number = Date.now()): {
  ceilingUsd: number;
  spentUsd: number;
  remainingUsd: number;
  windowMs: number;
  windowStart: number;
  windowEnd: number;
  rows: number;
  counters: BudgetCounters;
} {
  const spentUsd = currentSpendUsd(now); // prunes first, so the counters are current
  const ceilingUsd = budgetCeilingUsd();
  const windowMs = budgetWindowMs();
  return {
    ceilingUsd,
    spentUsd,
    remainingUsd: Math.max(ceilingUsd - spentUsd, 0),
    windowMs,
    windowStart: now - windowMs,
    windowEnd: now,
    rows: ledger.length,
    counters: { ...counters },
  };
}

/**
 * What the PENDING call is likely to cost, from the pre-call estimate.
 *
 * `estimatePerImage` is the dearest declared per-image rate, so this errs high.
 * When no per-image row carries a figure it is `undefined`, and we return 0:
 * an unpriceable call cannot be gated on cost, but its ACTUAL figure is still
 * booked afterwards via recordSpend, so it counts toward the NEXT call's check.
 */
export function estimatePendingUsd(images: number = 1): number {
  const q = estimatePerImage();
  if (typeof q.usd !== "number") return 0;
  return q.usd * Math.max(images, 1);
}

/**
 * Refuse if spending `pendingUsd` now would exceed the window ceiling.
 * Throws an `over-budget` ImagingError; returns nothing when the call may
 * proceed. `now` is injectable so window-reset is testable.
 */
export function assertWithinBudget(pendingUsd: number, now: number = Date.now()): void {
  const ceiling = budgetCeilingUsd();
  const spent = currentSpendUsd(now);
  if (spent + pendingUsd > ceiling) {
    // Counted BEFORE the throw, so a refusal cannot escape unrecorded down the
    // one path that leaves this function without returning. The count is the
    // difference between "the ceiling is working" and "the ceiling is
    // strangling something", and neither is legible without it.
    counters.refusals++;
    counters.refusedUsd += pendingUsd;
    note(
      `refused est=$${pendingUsd.toFixed(4)} spent=$${spent.toFixed(4)} ` +
        `ceiling=$${ceiling.toFixed(2)} windowMs=${budgetWindowMs()} refusals=${counters.refusals}`,
    );
    const windowMin = Math.round(budgetWindowMs() / 60000);
    throw overBudget(
      `Imaging spend ceiling reached: this call is estimated at $${pendingUsd.toFixed(4)} and ` +
        `$${spent.toFixed(4)} has already been spent in the last ~${windowMin} min, which would ` +
        `exceed the $${ceiling.toFixed(2)} ceiling (${BUDGET_VAR}). Refused before any vendor was ` +
        `called; wait for the window to roll over or raise the ceiling.`,
    );
  }
}

/**
 * Book spend against the window. Called AFTER a vendor served, with the figure
 * the call actually carried (vendor-reported or estimated) — the pre-call
 * estimate is a fallback when the call reported nothing. A non-positive or
 * non-finite figure is ignored: an unpriced call books nothing, which is honest
 * (see pricing.ts on why a call we cannot price must not surface as spend).
 */
export function recordSpend(usd: number | undefined, now: number = Date.now()): void {
  if (typeof usd === "number" && Number.isFinite(usd) && usd > 0) {
    prune(now);
    ledger.push({ at: now, usd });
    counters.booked++;
    return;
  }
  // The drop is deliberate (see above) but it is no longer silent: a booking
  // that wrote nothing is counted, so the window total can be read as the lower
  // bound it is rather than as a complete figure.
  counters.unpriced++;
}

/** Test hook — clear the window ledger AND the counters, so one probe's
 *  refusals never show up in the next one's reading. */
export function __resetBudget(): void {
  ledger = [];
  counters = zeroCounters();
}
