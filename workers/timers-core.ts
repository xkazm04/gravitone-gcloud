// THE TIMER ENVELOPE, DECIDED - what one tick's ending does to a timer's state, when it fires
// next, and whether the time since its last heartbeat is a gap. Pure: the instants are
// parameters, nothing here reads a clock or a store. workers/timers.ts is the one driver.
//
// background-jobs: tick-isolation. Every exit of a tick is one of SIX outcomes, each recorded:
// succeeded, succeeded-empty (ran and found nothing - not the same fact as acting), failed (the
// body answered an error), crashed (it threw), timed-out (abandoned at its deadline), skipped (it
// was still running, or another process holds the timer). Consecutive failures stretch the
// cadence (backoff), and past QUARANTINE_AT the timer is parked - loudly, on the ledger - until
// the process restarts. A success resets both, so a dependency that fails nightly oscillates in
// backoff and never ratchets into quarantine.
//
// THE STATE CHANGES THAT DESERVE AN EVENT are returned as `transition`s - the first failure after
// a success, the recovery, the quarantine (loop-health-telemetry: stream transitions, not ticks).

import type { Gap } from "@gt/producers/publish/timers";

export const OUTCOMES = ["succeeded", "succeeded-empty", "failed", "crashed", "timed-out", "skipped"] as const;
export type Outcome = (typeof OUTCOMES)[number];

/** Failing outcomes: the body did not do its work. A skip is not a failure; it is a non-fire. */
const FAILING: ReadonlySet<Outcome> = new Set(["failed", "crashed", "timed-out"]);
export const isFailing = (o: Outcome): boolean => FAILING.has(o);

/** Consecutive failures that park a timer. Ten ticks of a 30 s timer is five minutes of backoff
 *  growth past the first failure - long enough that a blip never parks it. */
export const QUARANTINE_AT = 10;
/** The longest a failing timer waits between tries, unless its own cadence is longer. */
export const BACKOFF_CAP_MS = 30 * 60_000;
/** The soonest a tick may ask to be woken again: a hint is never a spin. */
export const WAKE_FLOOR_MS = 1_000;

export type TickEnd = {
  readonly outcome: Outcome;
  readonly at: string;
  readonly ms: number;
  readonly error?: string;
  /** The work count, with its predicate ("3 due slots claimed"). */
  readonly what?: string;
  /** The body's own "wake me sooner": the next due item's distance. */
  readonly wakeInMs?: number;
};

export type TimerState = {
  readonly runs: number;
  readonly skips: number;
  /** Failures in a row since the last success. */
  readonly failing: number;
  readonly quarantined: boolean;
  readonly last?: TickEnd;
  readonly lastOkAt?: string;
  /** The first failure of the current run of failures: what a recovery event names. */
  readonly firstError?: string;
};

export const FRESH: TimerState = { runs: 0, skips: 0, failing: 0, quarantined: false };

export type Transition =
  | { readonly kind: "fail"; readonly outcome: Outcome; readonly error: string }
  | { readonly kind: "recover"; readonly after: number; readonly error: string }
  | { readonly kind: "quarantine"; readonly failing: number; readonly error: string };

/** One tick's ending applied to the state, with the transition it crossed (if any). */
export function settle(s: TimerState, end: TickEnd): { state: TimerState; transition?: Transition } {
  if (end.outcome === "skipped") return { state: { ...s, skips: s.skips + 1, last: end } };
  const runs = s.runs + 1;
  if (!isFailing(end.outcome)) {
    const state: TimerState = { runs, skips: s.skips, failing: 0, quarantined: false, last: end, lastOkAt: end.at };
    return s.failing > 0 ? { state, transition: { kind: "recover", after: s.failing, error: s.firstError ?? "" } } : { state };
  }
  const error = end.error ?? end.outcome;
  const failing = s.failing + 1;
  const quarantined = failing >= QUARANTINE_AT;
  const state: TimerState = { ...s, runs, failing, quarantined, last: end, firstError: s.failing === 0 ? error : (s.firstError ?? error) };
  if (quarantined && !s.quarantined) return { state, transition: { kind: "quarantine", failing, error } };
  if (s.failing === 0) return { state, transition: { kind: "fail", outcome: end.outcome, error } };
  return { state };
}

/** How long until the next firing; undefined for a parked timer (it does not fire again). */
export function delayAfter(s: TimerState, everyMs: number): number | undefined {
  if (s.quarantined) return undefined;
  if (s.failing > 0) return Math.min(everyMs * 2 ** s.failing, Math.max(everyMs, BACKOFF_CAP_MS));
  const hint = s.last?.wakeInMs;
  // Adaptive cadence: the idle rate is the cadence, and a tick that knows when its next item is due
  // may pull the next firing in - never past the cadence, never under the floor.
  return hint === undefined ? everyMs : Math.min(everyMs, Math.max(WAKE_FLOOR_MS, hint));
}

/**
 * Was the timer down? (scheduling: missed-run-semantics, "detect the gap explicitly" - against
 * the loop's own last heartbeat.) More than two cadences since the last beat is downtime, not a
 * late tick; a beat in the future (a clock that jumped back) is reported as no gap, never as a
 * negative one that would un-fire anything.
 */
export function gapOf(lastBeatAt: string | undefined, now: string, everyMs: number): Gap | undefined {
  if (lastBeatAt === undefined) return undefined;
  const since = Date.parse(now) - Date.parse(lastBeatAt);
  return since > 2 * everyMs ? { from: lastBeatAt, to: now } : undefined;
}
