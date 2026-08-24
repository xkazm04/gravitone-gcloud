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
import type { Capability, ProviderId } from "./types";

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

/**
 * Did the vendor serve the request, or bill us for a call that failed?
 *
 * `failed` rows are the reason this file stopped booking only on success — see
 * `recordSpend`. They are tagged rather than merged so a reader can subtract
 * them: "how much of this window went on calls that produced nothing" is the
 * question an incident actually asks.
 */
export type SpendOutcome = "served" | "failed";

/** Where the dollar figure came from. A vendor-reported figure is a fact; an
 *  estimate is our dearest declared rate standing in for one, and a window made
 *  mostly of estimates should be read as such rather than as an invoice. */
export type SpendBasis = "vendor" | "estimate";

/**
 * One booked call.
 *
 * ── WHY THE ROW IS WIDE (widened 2026-08-24) ───────────────────────────────
 *
 * It used to be `{ at, usd }` and nothing else, which meant the ledger could not
 * answer a single question anyone asks of a spend ledger. "Which step spent this
 * month's budget", "is the fallback vendor costing more than the primary", "how
 * much went on calls that failed" — all unanswerable, and the server log line
 * (log.ts) that DOES carry capability, provider and model had no key to join on.
 * Two records of the same event, neither complete.
 *
 * The axes below are exactly the ones log.ts already emits, deliberately: the
 * ledger and the log now describe the same call in the same vocabulary.
 */
export interface SpendRow {
  /** When the call SETTLED. The window is measured against this. */
  at: number;
  usd: number;
  /** What was asked for — the attribution axis a spend surface leads with. */
  cap: Capability;
  /** Who actually served (or failed), after any re-route. Not who was preferred. */
  provider: ProviderId;
  /** The vendor's own model id, when the call carried one. */
  model?: string;
  outcome: SpendOutcome;
  basis: SpendBasis;
}

let ledger: SpendRow[] = [];

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
  /** Of those, rows booked for a call that FAILED after reaching the vendor.
   *  Booking these is what stopped the meter under-reading precisely during an
   *  incident; counting them separately is what stops them being mistaken for
   *  work delivered. */
  bookedFailed: number;
  /** The spend those failed rows carried — money with nothing to show for it. */
  failedUsd: number;
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
  bookedFailed: 0,
  failedUsd: 0,
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
  const kept: SpendRow[] = [];
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

/** What a caller hands `recordSpend`. `at` defaults to now. */
export interface SpendEntry {
  usd: number | undefined;
  cap: Capability;
  provider: ProviderId;
  model?: string;
  outcome: SpendOutcome;
  basis: SpendBasis;
  at?: number;
}

/**
 * Book spend against the window, with the axes that make it answerable.
 *
 * Called after a call SETTLES — served or failed — with the figure the call
 * carried (vendor-reported) or the pre-call estimate standing in for one. A
 * non-positive or non-finite figure is ignored: an unpriced call books nothing,
 * which is honest (see pricing.ts on why a call we cannot price must not surface
 * as spend), and the drop is counted rather than silent, so the window total can
 * be read as the lower bound it is.
 *
 * ── FAILED CALLS ARE BOOKED TOO (changed 2026-08-24) ───────────────────────
 *
 * This function used to be reached only from the router's success branch. That
 * made the meter under-read in exactly the situation where an accurate reading
 * matters most: a call that reached the vendor, ran, and then timed out or came
 * back unusable consumed units the vendor WILL bill, and the ceiling saw none of
 * it. The failure mode was an incident that drove real spend up while the meter
 * showed it flat — an under-count correlated with trouble, which is the worst
 * shape a meter can have.
 *
 * The router decides WHICH failures reached the vendor (see its inner catch);
 * this function's only job is to keep them separable once booked. They enter the
 * same window total — the money is the same money and the ceiling must see it —
 * and carry `outcome: "failed"` so a reader can subtract them.
 */
export function recordSpend(entry: SpendEntry): void {
  const { usd, cap, provider, model, outcome, basis } = entry;
  const now = entry.at ?? Date.now();
  if (typeof usd === "number" && Number.isFinite(usd) && usd > 0) {
    prune(now);
    ledger.push({ at: now, usd, cap, provider, model, outcome, basis });
    counters.booked++;
    if (outcome === "failed") {
      counters.bookedFailed++;
      counters.failedUsd += usd;
    }
    return;
  }
  counters.unpriced++;
}

/**
 * The window's spend, split by each axis the row carries.
 *
 * This is the whole point of widening the row: `{at, usd}` could report a total
 * and nothing else, so "which capability spent the budget" had no answer and the
 * log line that carried the axes had no key to join on. Returned as plain records
 * so a surface renders them without re-deriving anything — the same reason
 * `budgetStats` hands out its window boundary.
 *
 * `unattributedUsd` is not a bucket; it is the honesty field. Nothing writes it
 * today because every booking path supplies axes, and it stays so that a future
 * path that does not is visible as a number rather than as a silently smaller
 * total.
 */
export function spendByAxis(now: number = Date.now()): {
  totalUsd: number;
  byCapability: Record<string, number>;
  byProvider: Record<string, number>;
  byModel: Record<string, number>;
  byOutcome: Record<SpendOutcome, number>;
  unattributedUsd: number;
} {
  prune(now);
  const byCapability: Record<string, number> = {};
  const byProvider: Record<string, number> = {};
  const byModel: Record<string, number> = {};
  const byOutcome: Record<SpendOutcome, number> = { served: 0, failed: 0 };
  let totalUsd = 0;
  let unattributedUsd = 0;
  for (const r of ledger) {
    totalUsd += r.usd;
    byOutcome[r.outcome] += r.usd;
    if (r.cap) byCapability[r.cap] = (byCapability[r.cap] ?? 0) + r.usd;
    else unattributedUsd += r.usd;
    if (r.provider) byProvider[r.provider] = (byProvider[r.provider] ?? 0) + r.usd;
    if (r.model) byModel[r.model] = (byModel[r.model] ?? 0) + r.usd;
  }
  return { totalUsd, byCapability, byProvider, byModel, byOutcome, unattributedUsd };
}

/** The window's rows, newest last. A copy — a reader cannot reach in and edit
 *  the ledger by mutating what it was shown. */
export function spendRows(now: number = Date.now()): readonly SpendRow[] {
  prune(now);
  return ledger.map((r) => ({ ...r }));
}

/** Test hook — clear the window ledger AND the counters, so one probe's
 *  refusals never show up in the next one's reading. */
export function __resetBudget(): void {
  ledger = [];
  counters = zeroCounters();
}
