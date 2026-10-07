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
// ── THE KERNEL MOVED OUT (2026-10-05, card IMG-A stage 1) ──────────────────
//
// The reserve → settle → book mechanics below now run on lib/spend/meter.ts,
// the one kernel every metered vendor is meant to share, over its in-memory
// store — so "per-process" above is still exactly true, and moving to a shared
// store is now a store swap rather than a rewrite. This file keeps every name
// it always exported, the vocabulary (`usd`, `cap`, `provider`), and the lines
// and refusal sentence an operator greps for. Everything that is about
// imaging stays here; everything that is about a ceiling moved.
// tests/golden-path/meter-conformance.probe.spec.ts runs the shared kit against
// these exports.
//
// Every export that reads or writes the ledger returns a PROMISE since card
// IMG-A stage 3a: the store behind the kernel may be a file another process
// shares, and its lock is async. Names, arguments and refusal sentences are
// unchanged. `seenSpendRows` is the one synchronous read left, for the 402
// mapper (lib/imaging/api.ts) that cannot await.
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

import { SPEND_CLASSES, ceilingOf, floorOf, windowMsOf } from "../spend/classes";
import { createMeter } from "../spend/meter";
import { ImagingError, overBudget } from "./errors";
import { estimatePerImage } from "./pricing";
import type { Capability, ProviderId } from "./types";

const CLASS = SPEND_CLASSES["imaging-usd"];

export const BUDGET_VAR = CLASS.ceilingVar;
export const WINDOW_VAR = CLASS.windowVar;
export const FLOOR_VAR = CLASS.floorVar;

/** The ceiling in USD. Unset/negative/NaN → the safe default ($5). `0` is a
 *  valid ceiling meaning "spend nothing", not "disabled". */
export function budgetCeilingUsd(): number {
  return ceilingOf(CLASS);
}

/**
 * The floor in USD — the BOTTOM of the expected consumption band.
 *
 * Every other control in this file looks upward: the ceiling refuses, the
 * counters count what the ceiling saved. None of them can see a window that
 * spent almost nothing, and "almost nothing" is not automatically good news. A
 * run that finishes far under its band either never reached the work the budget
 * was raised for, or reached it and served it from the cheapest provider in the
 * plan — and both are findings that currently present as "under budget".
 *
 * Unset/negative/NaN → 0, which means NO band is declared and `underFloor` is
 * never reported. This is reporting only: nothing here is read by
 * `assertWithinBudget`, so declaring a floor can never change who gets refused.
 */
export function budgetFloorUsd(): number {
  return floorOf(CLASS);
}

/** The rolling window in ms. Unset/non-positive/NaN → the safe default (1 h). */
export function budgetWindowMs(): number {
  return windowMsOf(CLASS);
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

/**
 * A reservation of estimated spend held while a request is in flight.
 */
export interface Hold {
  id: string;
  amountUsd: number;
  createdAt: number;
}

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
  /** Holds reclaimed because their owner process died and their TTL ran out.
   *  Never booked. Only a store shared across processes can see one. */
  expiredHolds: number;
  /** What those reclaimed holds were reserving. */
  expiredUsd: number;
  /** Settles and bookings that missed the ledger's lock and were applied by a
   *  later transaction: late, never lost. */
  lateWrites: number;
}

/** One greppable line, same `[imaging]` prefix as log.ts's call lines so a
 *  single grep finds the engine's whole trace. Numbers only — see the header. */
function note(line: string): void {
  console.log(`[imaging] budget ${line}`);
}

/** The axes an imaging row is attributed on — the ones log.ts prints. */
type ImagingAxes = { cap: Capability; provider: ProviderId; model?: string };

/**
 * The ledger. One kernel meter over the in-memory store; everything below is
 * this file's vocabulary laid over it.
 */
const meter = createMeter<SpendEntry, ImagingAxes, SpendBasis>(CLASS, {
  entry: (e) => ({
    amount: e.usd,
    outcome: e.outcome,
    basis: e.basis,
    axes: { cap: e.cap, provider: e.provider, model: e.model },
    at: e.at,
  }),
  refuse: ({ amount, spent, held, ceiling, windowMs, refusals }) => {
    note(
      `refused est=$${amount.toFixed(4)} spent=$${spent.toFixed(4)} held=$${held.toFixed(4)} ` +
        `ceiling=$${ceiling.toFixed(2)} windowMs=${windowMs} refusals=${refusals}`,
    );
    const windowMin = Math.round(windowMs / 60000);
    const effectiveSpent = spent + held;
    return overBudget(
      `Imaging spend ceiling reached: this call is estimated at $${amount.toFixed(4)} and ` +
        `$${effectiveSpent.toFixed(4)} has already been spent in the last ~${windowMin} min, which would ` +
        `exceed the $${ceiling.toFixed(2)} ceiling (${BUDGET_VAR}). Refused before any vendor was ` +
        `called; wait for the window to roll over or raise the ceiling.`,
    );
  },
  // A reservation that is not a finite, non-negative number is the caller's
  // input, not a budget verdict: a 400, nothing dispatched, nothing billed.
  // Reached from a direct lib caller (a pipeline script) with a `count` that is
  // not a number — the HTTP route already validates it (api.ts asCount).
  invalid: (amount) =>
    new ImagingError(
      `Imaging spend cannot be reserved: the estimate for this call is ${String(amount)}, ` +
        `not a finite non-negative amount. Check the request's image count.`,
      "invalid-request",
    ),
  // The ledger's lock was held past its wait. Not a budget verdict and not the
  // caller's input: nothing was dispatched, so a retry may well pass.
  busy: (message) => new ImagingError(`Imaging spend could not be reserved. ${message}`, "timeout"),
  // The reset is the ONLY sanctioned way spend leaves the window, so it says so
  // out loud: a total that fell without one of these lines is a bug, not a roll.
  evicted: ({ dropped, droppedAmount, remaining, windowMs }) =>
    note(
      `window-reset evicted=${dropped} usd=$${droppedAmount.toFixed(4)} ` +
        `remaining=$${remaining.toFixed(4)} windowMs=${windowMs}`,
    ),
});

/** Total currently reserved across all active holds. */
export function heldUsd(): Promise<number> {
  return meter.held();
}

/** Total spend inside the current window. */
export function currentSpendUsd(now: number = Date.now()): Promise<number> {
  return meter.spent(now);
}

/**
 * The window's own numbers, for a spend surface or an operator.
 *
 * The BOUNDARY travels with the total deliberately: a consumer renders the
 * window it was handed rather than re-deriving one, which is how a dashboard
 * and an enforcer end up disagreeing about the same screen. `counters` is a
 * copy — a caller cannot reach in and reset the meter by mutating a snapshot.
 */
export async function budgetStats(now: number = Date.now()): Promise<{
  ceilingUsd: number;
  floorUsd: number;
  underFloor: boolean;
  spentUsd: number;
  heldUsd: number;
  remainingUsd: number;
  windowMs: number;
  windowStart: number;
  windowEnd: number;
  rows: number;
  counters: BudgetCounters;
}> {
  // The kernel prunes first, so the counters are current. `underFloor` is a
  // declared band, some traffic, and a total beneath the band's bottom — rows
  // must be non-zero: an idle window is not a thrifty one.
  const s = await meter.stats(now);
  const c = s.counters;
  return {
    ceilingUsd: s.ceiling,
    floorUsd: s.floor,
    underFloor: s.underFloor,
    spentUsd: s.spent,
    heldUsd: s.held,
    remainingUsd: s.remaining,
    windowMs: s.windowMs,
    windowStart: s.windowStart,
    windowEnd: s.windowEnd,
    rows: s.rows,
    counters: {
      refusals: c.refusals,
      refusedUsd: c.refused,
      booked: c.booked,
      bookedFailed: c.bookedFailed,
      failedUsd: c.failed,
      unpriced: c.unpriced,
      evicted: c.evicted,
      evictedUsd: c.evictedAmount,
      lastEvictionAt: c.lastEvictionAt,
      expiredHolds: c.expiredHolds,
      expiredUsd: c.expiredAmount,
      lateWrites: c.lateWrites,
    },
  };
}

/**
 * Which providers actually SERVED each capability in the window.
 *
 * `spendByAxis` already reports spend by provider, but flat across capabilities:
 * a provider that served one `recognize` call reads as "called" for `generate`
 * too. Reachability is a per-capability question — the plan is ordered per
 * capability — so it needs its own projection, and `failed` rows are excluded
 * because a vendor that was reached and fell over did not serve the work.
 *
 * This is the raw fact only. The plan lives in the router, so the VERDICT — was
 * the preferred provider ever called — is computed there, against this.
 */
export async function reachByCapability(now: number = Date.now()): Promise<Record<string, ProviderId[]>> {
  const reach: Record<string, Set<ProviderId>> = {};
  for (const { outcome, axes } of await meter.rows(now)) {
    if (outcome !== "served" || !axes.cap || !axes.provider) continue;
    (reach[axes.cap] ??= new Set()).add(axes.provider);
  }
  const out: Record<string, ProviderId[]> = {};
  for (const [cap, set] of Object.entries(reach)) out[cap] = [...set].sort();
  return out;
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
 * Reserve estimated spend before dispatching a request to vendors.
 *
 * Refuses if spending `amountUsd` now would exceed the window ceiling
 * (taking into account already-booked spend and active holds).
 * Throws an `over-budget` ImagingError; returns a Hold on success.
 *
 * The refusal is counted BEFORE the throw, so it cannot escape unrecorded down
 * the one path that leaves without returning. The count is the difference
 * between "the ceiling is working" and "the ceiling is strangling something",
 * and neither is legible without it.
 *
 * An amount that is not a finite, non-negative number throws an
 * `invalid-request` ImagingError instead, and is never held: a NaN hold used to
 * be admitted and made every later comparison against the ceiling false.
 */
export async function reserve(amountUsd: number, now: number = Date.now()): Promise<Hold> {
  const h = await meter.reserve(amountUsd, now);
  return { id: h.id, amountUsd: h.amount, createdAt: h.createdAt };
}

/**
 * Release a hold without recording spend (e.g. on unbilled failure or cancellation).
 */
export function release(hold: Hold): Promise<void> {
  return meter.release(hold);
}

/**
 * Refuse if spending `pendingUsd` now would exceed the window ceiling.
 * Throws an `over-budget` ImagingError; returns nothing when the call may
 * proceed. It used to be a reserve and a release; it is now the kernel's
 * `check`, the same verdict counted the same way in ONE transaction, so no
 * await can leave a momentary hold for another caller to be refused against.
 */
export function assertWithinBudget(pendingUsd: number, now: number = Date.now()): Promise<void> {
  return meter.check(pendingUsd, now);
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
 * Settle a hold by removing the reservation and recording the actual spend.
 * The hold is gone afterwards even if an entry throws while being read.
 */
export function settle(hold: Hold, entries: SpendEntry | SpendEntry[]): Promise<void> {
  return meter.settle(hold, entries);
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
export function recordSpend(entry: SpendEntry): Promise<void> {
  return meter.book(entry);
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
export async function spendByAxis(now: number = Date.now()): Promise<{
  totalUsd: number;
  byCapability: Record<string, number>;
  byProvider: Record<string, number>;
  byModel: Record<string, number>;
  byOutcome: Record<SpendOutcome, number>;
  unattributedUsd: number;
}> {
  const a = await meter.byAxis(now);
  return {
    totalUsd: a.total,
    byCapability: a.byAxis.cap,
    byProvider: a.byAxis.provider,
    byModel: a.byAxis.model,
    byOutcome: a.byOutcome,
    unattributedUsd: a.unattributed,
  };
}

/** The window's rows, newest last. A copy — a reader cannot reach in and edit
 *  the ledger by mutating what it was shown. */
export async function spendRows(now: number = Date.now()): Promise<readonly SpendRow[]> {
  return (await meter.rows(now)).map(asSpendRow);
}

/** The rows as this process last read them, unpruned, without waiting for the
 *  ledger's lock. Only for a caller that cannot await and is answering a
 *  refusal that has just read the ledger (budgetForecast.ts earliestExpiry). */
export function seenSpendRows(): readonly SpendRow[] {
  return meter.seenRows().map(asSpendRow);
}

function asSpendRow(r: { at: number; amount: number; outcome: SpendOutcome; basis: SpendBasis; axes: ImagingAxes }): SpendRow {
  return {
    at: r.at,
    usd: r.amount,
    cap: r.axes.cap,
    provider: r.axes.provider,
    model: r.axes.model,
    outcome: r.outcome,
    basis: r.basis,
  };
}

/** Test hook — clear the window ledger AND the counters, so one probe's
 *  refusals never show up in the next one's reading. */
export function __resetBudget(): void {
  meter.reset();
}
