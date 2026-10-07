// SPEND CEILING — the enforcement metering the music engine never had.
//
// WHY THIS FILE EXISTS. `app/api/music/generate/route.ts` used to carry this
// sentence: "NOT yet under lib/imaging/budget.ts's spend ceiling: that ledger
// prices per-image USD and a music credit is a different unit … the ceiling on
// this route is the rate limit alone — stated here so nobody mistakes absence
// for coverage." A rate limit bounds REQUESTS PER MINUTE. It does not bound
// spend: thirty requests a minute for ten-minute renders is a different bill
// from thirty requests a minute for five-second ones, and the limiter cannot
// tell them apart.
//
// ── THE UNIT, AND WHY IT IS NOT DOLLARS ────────────────────────────────────
//
// lib/imaging/budget.ts meters USD because imaging has measured USD. This
// engine has not (lib/music/pricing.ts: ElevenLabs bills credits, and no
// credits-per-second figure has been measured here). A ceiling denominated in a
// unit nobody can compute is a ceiling that never fires, which is worse than no
// ceiling because it looks like one.
//
// So THIS METER IS DENOMINATED IN SECONDS OF AUDIO REQUESTED — the one link of
// pricing.ts's unit chain that is exact today. The request carries it, the plan
// sums to it, provenance records it as `requestedMs`, and nothing has to be
// measured for it to be true. It is also the quantity the bill is actually
// proportional to, so bounding it bounds the bill, whatever the unmeasured
// conversion turns out to be.
//
// When somebody fills the credits row in pricing.ts, this file does not have to
// change: every row carries its op, model and seconds, and `musicSpendRows`
// quotes them through pricing.ts on read, so the same window can be read in
// credits or dollars the moment those exist.
//
// DEFAULTS ARE SAFE, NOT UNLIMITED. MUSIC_BUDGET_SECONDS_PER_WINDOW defaults to
// 600 seconds of audio per 1-hour window — about forty-six renders of Glass
// Harbor's 13-second cue, generous for a working session and bounded for a
// loop. That default is a POLICY CHOICE, not a measurement, and it is the only
// invented number this meter has (declared with the class, in
// lib/spend/classes.ts); everything else is arithmetic over the request. An
// unset ceiling is a bounded ceiling, not an open tab.
//
// SERVER ONLY, in-memory, per-process — good enough for a single-instance
// prototype; a scaled-out deployment moves the ledger to a shared store. It
// imports pricing.ts (pure, env-free) and so does NOT compromise that module's
// no-env property: this file reads env, that one still does not.
//
// ── HOLDS, ON THE SHARED KERNEL (2026-10-07, card IMG-A stage 2) ───────────
//
// This file used to check and book and do nothing in between:
// `assertWithinMusicBudget` read the window, the adapter called the vendor, and
// the seconds were booked when it answered. Nothing was HELD while it rendered,
// so two renders that each fit were both admitted against the same un-updated
// total and the window ended above the ceiling — the check-then-act race
// imaging closed with holds. The mechanics now run on lib/spend/meter.ts, class
// `music-audio-s`, the kernel imaging and video already share: `reserveMusic`
// holds the seconds before the vendor is touched, `settleMusic` replaces the
// hold with what the vendor will bill, and `releaseMusic` drops it when nothing
// rendered. Still in memory and per process, exactly as "SERVER ONLY" above
// says: a shared store is a store swap, and an operator's call.
//
// Every export kept its name and signature; the vars, the defaults and the
// refusal sentence are the ones this file always had.
// tests/golden-path/meter-conformance.probe.spec.ts runs the shared kit against
// these exports.
//
// The lines it writes are safe by construction: numbers, env-var NAMES and the
// operation, and nothing else. No vendor text, no plan, no script, no
// credential ever reaches them, so they need none of log.ts's scrubbing — and
// this module deliberately does not depend on log.ts.

import { SPEND_CLASSES, ceilingOf, windowMsOf } from "../spend/classes";
import { createMeter } from "../spend/meter";
import { MusicError } from "./errors";
import { priceCall, type MusicCostBasis, type MusicOp } from "./pricing";

const CLASS = SPEND_CLASSES["music-audio-s"];

export const MUSIC_BUDGET_VAR = CLASS.ceilingVar;
export const MUSIC_WINDOW_VAR = CLASS.windowVar;
/** The bottom of the expected band, in seconds. Reporting only: nothing the
 *  gate reads, so declaring one can never change who is refused. */
export const MUSIC_FLOOR_VAR = CLASS.floorVar;

/** The ceiling in seconds of audio. Unset/negative/NaN → the safe default.
 *  `0` is a valid ceiling meaning "render nothing", not "disabled". */
export function musicCeilingSeconds(): number {
  return ceilingOf(CLASS);
}

/** The rolling window in ms. Unset/non-positive/NaN → the safe default. */
export function musicWindowMs(): number {
  return windowMsOf(CLASS);
}

/** Did the vendor serve the request, or run it and give us nothing usable?
 *  Tagged rather than merged so a reader can subtract the second kind —
 *  "how many seconds of this window produced nothing" is the question an
 *  incident actually asks. */
export type MusicOutcome = "served" | "failed";

export interface MusicSpendRow {
  /** When the call SETTLED. The window is measured against this. */
  at: number;
  /** Seconds of audio requested — the metered quantity. */
  seconds: number;
  op: MusicOp;
  model?: string;
  outcome: MusicOutcome;
  /** Which link of pricing.ts's unit chain the quote reached, carried so a
   *  window built entirely of unpriced rows cannot be read as an invoice. */
  basis: MusicCostBasis;
  /** Credits, when a rate is declared. Almost always absent today. */
  credits?: number;
  /** USD, when both links are declared. Absent today, by design. */
  usd?: number;
}

/**
 * What the meter has done to itself. Every field counts an event the gate would
 * otherwise perform silently; none is read by the gate, so none can change who
 * gets refused.
 */
export interface MusicBudgetCounters {
  /** Calls the ceiling refused. The budget system's own health metric: zero
   *  forever is indistinguishable from a gate that is not on the path. */
  refusals: number;
  /** Seconds of audio those refusals prevented — what the ceiling saved. */
  refusedSeconds: number;
  booked: number;
  /** Of those, calls that reached the vendor and produced nothing usable. */
  bookedFailed: number;
  failedSeconds: number;
  /** `recordMusicSpend` calls that booked NOTHING because the duration was
   *  absent, non-finite or non-positive. Counted rather than dropped. */
  unmetered: number;
  /** Rows the rolling window aged out. The window is the ONLY thing that may
   *  remove spend, so this is the whole explanation for any fall in the total. */
  evicted: number;
  evictedSeconds: number;
  lastEvictionAt: number | null;
}

/** One greppable line, same `[music]` prefix as log.ts's call lines so a single
 *  grep finds the engine's whole trace. Numbers only — see the header. */
function note(line: string): void {
  console.log(`[music] budget ${line}`);
}

/** The axes a music row is attributed on — the ones log.ts prints. */
type MusicAxes = { op: MusicOp; model?: string };

/**
 * The ledger. One kernel meter over the in-memory store; everything below is
 * this file's vocabulary laid over it.
 *
 * A row stores its seconds, op, model and basis, and NOT the quote's credits or
 * dollars: those are a pure function of the first three over pricing.ts's
 * committed table, so `musicSpendRows` derives them on read and the kernel's row
 * stays one shape for every class. That holds while rows live no longer than
 * the code that priced them, which an in-memory window guarantees. A durable
 * store must revisit it: a row kept across a deploy that declared a rate would
 * be re-quoted at the new rate.
 */
const meter = createMeter<MusicSpendEntry, MusicAxes, MusicCostBasis>(CLASS, {
  entry: (e) => {
    const seconds = e.seconds;
    return {
      amount: seconds,
      outcome: e.outcome,
      basis: priceCall({ op: e.op, model: e.model, seconds: seconds ?? 0 }).basis,
      axes: { op: e.op, model: e.model },
      at: e.at,
    };
  },
  refuse: ({ amount: pendingSeconds, spent: booked, held, ceiling, refusals }) => {
    // What the sentence calls "rendered" is everything the window already
    // carries: seconds booked AND seconds held by renders still in flight. The
    // comparison that refused counts both, and a sentence that named only one
    // would not add up to the ceiling it quotes.
    const spent = booked + held;
    note(
      `refused pending=${pendingSeconds} spent=${booked} held=${held} ceiling=${ceiling} ` +
        `windowMs=${musicWindowMs()} refusals=${refusals}`,
    );
    const windowMin = Math.round(musicWindowMs() / 60000);
    return new MusicError(
      "over-budget",
      `Music render ceiling reached: this cue asks for ${pendingSeconds}s of audio and ` +
        `${spent}s has already been rendered in the last ~${windowMin} min, which would exceed the ` +
        `${ceiling}s ceiling (${MUSIC_BUDGET_VAR}). Refused before the vendor was called, so nothing ` +
        `was billed. Wait for the window to roll over or raise the ceiling. The ceiling is in ` +
        `SECONDS OF AUDIO, not dollars — see lib/music/pricing.ts for why.`,
    );
  },
  // A duration that is not a finite, non-negative number is the caller's input,
  // not a budget verdict: a 400, nothing dispatched. It used to be admitted —
  // `spent + NaN > ceiling` is false — so an unreadable duration passed the
  // gate it was meant to be measured by.
  invalid: (amount) =>
    new MusicError(
      "bad-request",
      `Music spend cannot be reserved: ${String(amount)}s of audio is not a finite non-negative duration.`,
    ),
  // The reset is the ONLY sanctioned way the total falls, so it says so out
  // loud: a total that fell without one of these lines is a bug, not a roll.
  evicted: ({ dropped, droppedAmount, remaining, windowMs }) =>
    note(`window-reset evicted=${dropped} sec=${droppedAmount} remaining=${remaining} windowMs=${windowMs}`),
});

/** Seconds of audio requested inside the current window — booked rows only;
 *  renders still in flight are `musicBudgetStats().heldSeconds`. */
export function currentMusicSeconds(now: number = Date.now()): number {
  return meter.spent(now);
}

/**
 * The window's own numbers, for an operator or a spend surface. The BOUNDARY
 * travels with the total deliberately: a consumer renders the window it was
 * handed rather than re-deriving one, which is how a dashboard and an enforcer
 * end up disagreeing about the same screen. `counters` is a copy.
 */
export function musicBudgetStats(now: number = Date.now()): {
  ceilingSeconds: number;
  spentSeconds: number;
  /** Seconds reserved by renders in flight. They count against the ceiling
   *  until the vendor answers and they are settled or released. */
  heldSeconds: number;
  /** What the ceiling still admits: ceiling − spent − held, never below 0. */
  remainingSeconds: number;
  /** The bottom of the expected band (MUSIC_BUDGET_FLOOR_SECONDS); 0 when none
   *  is declared. Reporting only. */
  floorSeconds: number;
  /** A declared band, some traffic, and a total beneath the band's bottom. */
  underFloor: boolean;
  windowMs: number;
  windowStart: number;
  windowEnd: number;
  rows: number;
  counters: MusicBudgetCounters;
} {
  const s = meter.stats(now); // prunes first, so the counters are current
  const c = s.counters;
  return {
    ceilingSeconds: s.ceiling,
    spentSeconds: s.spent,
    heldSeconds: s.held,
    remainingSeconds: s.remaining,
    floorSeconds: s.floor,
    underFloor: s.underFloor,
    windowMs: s.windowMs,
    windowStart: s.windowStart,
    windowEnd: s.windowEnd,
    rows: s.rows,
    counters: {
      refusals: c.refusals,
      refusedSeconds: c.refused,
      booked: c.booked,
      bookedFailed: c.bookedFailed,
      failedSeconds: c.failed,
      unmetered: c.unpriced,
      evicted: c.evicted,
      evictedSeconds: c.evictedAmount,
      lastEvictionAt: c.lastEvictionAt,
    },
  };
}

/** A reservation of seconds held while a render is in flight. */
export interface MusicHold {
  readonly id: string;
  readonly seconds: number;
}

/**
 * HOLD `seconds` FOR A RENDER ABOUT TO BE DISPATCHED.
 *
 * Throws an `over-budget` MusicError (HTTP 402) when booked plus held plus this
 * would cross the ceiling, and it is thrown BEFORE the vendor is touched, so
 * nothing is billed on the call that trips it. The refusal is counted before
 * the throw. A duration that is not a finite, non-negative number throws
 * `bad-request` instead and is never held. `now` is injectable so window
 * rollover is testable.
 */
export function reserveMusic(seconds: number, now: number = Date.now()): MusicHold {
  const h = meter.reserve(seconds, now);
  return { id: h.id, seconds: h.amount };
}

/** Drop a hold without booking: the vendor rendered nothing it will bill. A
 *  hold already settled or released is a no-op. */
export function releaseMusic(hold: MusicHold): void {
  meter.release(hold);
}

/** Replace a hold with what the vendor will bill. The hold is gone afterwards
 *  even if an entry throws while being read. */
export function settleMusic(hold: MusicHold, entries: MusicSpendEntry | MusicSpendEntry[]): void {
  meter.settle(hold, entries);
}

/**
 * REFUSE IF RENDERING `pendingSeconds` NOW WOULD CROSS THE CEILING.
 *
 * Throws an `over-budget` MusicError (HTTP 402), and it is thrown BEFORE the
 * vendor is touched, so nothing is billed on the call that trips it. That is
 * the whole distinction this file is for: the meter refuses rather than bills.
 * `now` is injectable so window rollover is testable.
 *
 * Kept as a reserve that is released at once. It holds nothing, so a caller
 * that goes on to render must take its own hold (`reserveMusic`) — which is
 * what lib/music/elevenlabs.ts `metered()` does.
 */
export function assertWithinMusicBudget(pendingSeconds: number, now: number = Date.now()): void {
  releaseMusic(reserveMusic(pendingSeconds, now));
}

export interface MusicSpendEntry {
  seconds: number | undefined;
  op: MusicOp;
  model?: string;
  outcome: MusicOutcome;
  at?: number;
}

/**
 * Book a settled call against the window.
 *
 * WHICH FAILURES ARE BOOKED is the caller's decision and a real one: a refusal
 * or a rate-limit never reached a renderer and costs nothing, while a timeout
 * mid-body or an unreadable response means the vendor DID render and will bill
 * for it. Booking only successes is how imaging's meter used to under-read
 * precisely during an incident; booking everything would let a 401 loop consume
 * a ceiling it never spent. The adapter decides; this function's job is to keep
 * the two separable once booked (`outcome`).
 *
 * A non-positive or non-finite duration books nothing and is COUNTED, so the
 * window total reads as the lower bound it is.
 */
export function recordMusicSpend(entry: MusicSpendEntry): void {
  meter.book(entry);
}

/** The window split by each axis the row carries — the same vocabulary log.ts
 *  emits, so the ledger and the log describe one call in one language. */
export function musicSpendByAxis(now: number = Date.now()): {
  totalSeconds: number;
  byOp: Record<string, number>;
  byModel: Record<string, number>;
  byOutcome: Record<MusicOutcome, number>;
  /** Seconds in rows whose price never reached money. Not a bucket — the
   *  honesty field: a large share here means the window is a duration, not a
   *  bill, and must not be rendered as one. */
  unpricedSeconds: number;
  /** Seconds in rows with no `op`. Not a bucket either: nothing writes it
   *  today, and a booking path that forgot its axes shows up here as a number
   *  rather than as a silently smaller split. */
  unattributedSeconds: number;
} {
  const a = meter.byAxis(now);
  let unpricedSeconds = 0;
  for (const r of meter.rows(now)) if (r.basis === "unpriced") unpricedSeconds += r.amount;
  return {
    totalSeconds: a.total,
    byOp: a.byAxis.op,
    byModel: a.byAxis.model,
    byOutcome: a.byOutcome,
    unpricedSeconds,
    unattributedSeconds: a.unattributed,
  };
}

/** The window's rows, newest last. A copy — a reader cannot edit the ledger by
 *  mutating what it was shown. Credits and dollars are quoted here, on read
 *  (see the meter's comment for why that is exact today). */
export function musicSpendRows(now: number = Date.now()): readonly MusicSpendRow[] {
  return meter.rows(now).map((r) => {
    const quote = priceCall({ op: r.axes.op, model: r.axes.model, seconds: r.amount });
    return {
      at: r.at,
      seconds: r.amount,
      op: r.axes.op,
      model: r.axes.model,
      outcome: r.outcome,
      basis: r.basis,
      credits: quote.credits,
      usd: quote.usd,
    };
  });
}

/** Test hook — clear the window, the holds AND the counters, so one probe's
 *  refusals never show up in the next one's reading. */
export function __resetMusicBudget(): void {
  meter.reset();
}
