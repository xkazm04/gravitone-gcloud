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

function prune(now: number): void {
  const cutoff = now - budgetWindowMs();
  ledger = ledger.filter((s) => s.at >= cutoff);
}

/** Total spend inside the current window. */
export function currentSpendUsd(now: number = Date.now()): number {
  prune(now);
  return ledger.reduce((a, s) => a + s.usd, 0);
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
  }
}

/** Test hook — clear the window ledger. */
export function __resetBudget(): void {
  ledger = [];
}
