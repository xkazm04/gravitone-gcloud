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
// change: the ledger already books the quote alongside the seconds, so the
// same window can be read in credits or dollars the moment those exist.
//
// DEFAULTS ARE SAFE, NOT UNLIMITED. MUSIC_BUDGET_SECONDS_PER_WINDOW defaults to
// 600 seconds of audio per 1-hour window — about forty-six renders of Glass
// Harbor's 13-second cue, generous for a working session and bounded for a
// loop. That default is a POLICY CHOICE, not a measurement, and it is the only
// invented number in this file; everything else is arithmetic over the request.
// An unset ceiling is a bounded ceiling, not an open tab.
//
// SERVER ONLY, in-memory, per-process — good enough for a single-instance
// prototype; a scaled-out deployment moves the ledger to a shared store. It
// imports pricing.ts (pure, env-free) and so does NOT compromise that module's
// no-env property: this file reads env, that one still does not.
//
// The lines it writes are safe by construction: numbers, env-var NAMES and the
// operation, and nothing else. No vendor text, no plan, no script, no
// credential ever reaches them, so they need none of log.ts's scrubbing — and
// this module deliberately does not depend on log.ts.

import { MusicError } from "./errors";
import { priceCall, type MusicCostBasis, type MusicOp } from "./pricing";

export const MUSIC_BUDGET_VAR = "MUSIC_BUDGET_SECONDS_PER_WINDOW";
export const MUSIC_WINDOW_VAR = "MUSIC_BUDGET_WINDOW_MS";

/** POLICY, not measurement — see the header. */
const DEFAULT_CEILING_S = 600;
const DEFAULT_WINDOW_MS = 3_600_000; // one hour

/** The ceiling in seconds of audio. Unset/negative/NaN → the safe default.
 *  `0` is a valid ceiling meaning "render nothing", not "disabled". */
export function musicCeilingSeconds(): number {
  const n = Number(process.env[MUSIC_BUDGET_VAR]);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_CEILING_S;
}

/** The rolling window in ms. Unset/non-positive/NaN → the safe default. */
export function musicWindowMs(): number {
  const n = Number(process.env[MUSIC_WINDOW_VAR]);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_WINDOW_MS;
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

let ledger: MusicSpendRow[] = [];

/**
 * What the meter has done to itself. Every field counts an event the gate would
 * otherwise perform silently; none is read by `assertWithinMusicBudget`, so
 * none can change who gets refused.
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

const zeroCounters = (): MusicBudgetCounters => ({
  refusals: 0,
  refusedSeconds: 0,
  booked: 0,
  bookedFailed: 0,
  failedSeconds: 0,
  unmetered: 0,
  evicted: 0,
  evictedSeconds: 0,
  lastEvictionAt: null,
});

let counters: MusicBudgetCounters = zeroCounters();

/** One greppable line, same `[music]` prefix as log.ts's call lines so a single
 *  grep finds the engine's whole trace. Numbers only — see the header. */
function note(line: string): void {
  console.log(`[music] budget ${line}`);
}

function prune(now: number): void {
  const cutoff = now - musicWindowMs();
  const kept: MusicSpendRow[] = [];
  let droppedS = 0;
  let dropped = 0;
  for (const r of ledger) {
    if (r.at >= cutoff) kept.push(r);
    else {
      dropped++;
      droppedS += r.seconds;
    }
  }
  if (dropped === 0) return; // nothing rolled over; stay silent
  ledger = kept;
  counters.evicted += dropped;
  counters.evictedSeconds += droppedS;
  counters.lastEvictionAt = now;
  const remaining = kept.reduce((a, r) => a + r.seconds, 0);
  // The reset is the ONLY sanctioned way the total falls, so it says so out
  // loud: a total that fell without one of these lines is a bug, not a roll.
  note(
    `window-reset evicted=${dropped} sec=${droppedS} remaining=${remaining} windowMs=${musicWindowMs()}`,
  );
}

/** Seconds of audio requested inside the current window. */
export function currentMusicSeconds(now: number = Date.now()): number {
  prune(now);
  return ledger.reduce((a, r) => a + r.seconds, 0);
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
  remainingSeconds: number;
  windowMs: number;
  windowStart: number;
  windowEnd: number;
  rows: number;
  counters: MusicBudgetCounters;
} {
  const spentSeconds = currentMusicSeconds(now); // prunes first
  const ceilingSeconds = musicCeilingSeconds();
  const windowMs = musicWindowMs();
  return {
    ceilingSeconds,
    spentSeconds,
    remainingSeconds: Math.max(ceilingSeconds - spentSeconds, 0),
    windowMs,
    windowStart: now - windowMs,
    windowEnd: now,
    rows: ledger.length,
    counters: { ...counters },
  };
}

/**
 * REFUSE IF RENDERING `pendingSeconds` NOW WOULD CROSS THE CEILING.
 *
 * Throws an `over-budget` MusicError (HTTP 402), and it is thrown BEFORE the
 * vendor is touched, so nothing is billed on the call that trips it. That is
 * the whole distinction this file is for: the meter refuses rather than bills.
 * `now` is injectable so window rollover is testable.
 */
export function assertWithinMusicBudget(pendingSeconds: number, now: number = Date.now()): void {
  const ceiling = musicCeilingSeconds();
  const spent = currentMusicSeconds(now);
  if (spent + pendingSeconds > ceiling) {
    // Counted BEFORE the throw, so a refusal cannot escape unrecorded down the
    // one path that leaves this function without returning.
    counters.refusals++;
    counters.refusedSeconds += pendingSeconds;
    note(
      `refused pending=${pendingSeconds} spent=${spent} ceiling=${ceiling} ` +
        `windowMs=${musicWindowMs()} refusals=${counters.refusals}`,
    );
    const windowMin = Math.round(musicWindowMs() / 60000);
    throw new MusicError(
      "over-budget",
      `Music render ceiling reached: this cue asks for ${pendingSeconds}s of audio and ` +
        `${spent}s has already been rendered in the last ~${windowMin} min, which would exceed the ` +
        `${ceiling}s ceiling (${MUSIC_BUDGET_VAR}). Refused before the vendor was called, so nothing ` +
        `was billed. Wait for the window to roll over or raise the ceiling. The ceiling is in ` +
        `SECONDS OF AUDIO, not dollars — see lib/music/pricing.ts for why.`,
    );
  }
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
  const { seconds, op, model, outcome } = entry;
  const now = entry.at ?? Date.now();
  if (typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0) {
    prune(now);
    // The quote rides along so the same window can be read in credits or
    // dollars the day pricing.ts declares a rate — no migration, no backfill.
    const quote = priceCall({ op, model, seconds });
    ledger.push({
      at: now,
      seconds,
      op,
      model,
      outcome,
      basis: quote.basis,
      credits: quote.credits,
      usd: quote.usd,
    });
    counters.booked++;
    if (outcome === "failed") {
      counters.bookedFailed++;
      counters.failedSeconds += seconds;
    }
    return;
  }
  counters.unmetered++;
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
} {
  prune(now);
  const byOp: Record<string, number> = {};
  const byModel: Record<string, number> = {};
  const byOutcome: Record<MusicOutcome, number> = { served: 0, failed: 0 };
  let totalSeconds = 0;
  let unpricedSeconds = 0;
  for (const r of ledger) {
    totalSeconds += r.seconds;
    byOutcome[r.outcome] += r.seconds;
    byOp[r.op] = (byOp[r.op] ?? 0) + r.seconds;
    if (r.model) byModel[r.model] = (byModel[r.model] ?? 0) + r.seconds;
    if (r.basis === "unpriced") unpricedSeconds += r.seconds;
  }
  return { totalSeconds, byOp, byModel, byOutcome, unpricedSeconds };
}

/** The window's rows, newest last. A copy — a reader cannot edit the ledger by
 *  mutating what it was shown. */
export function musicSpendRows(now: number = Date.now()): readonly MusicSpendRow[] {
  prune(now);
  return ledger.map((r) => ({ ...r }));
}

/** Test hook — clear the window AND the counters, so one probe's refusals never
 *  show up in the next one's reading. */
export function __resetMusicBudget(): void {
  ledger = [];
  counters = zeroCounters();
}
