// HOW LONG THIS KIND OF TURN HAS TAKEN HERE — a bounded ring of settled turns.
// SERVER ONLY. (AIO-B.)
//
// lib/text/log.ts wrote every turn's duration and cost to one console line and
// kept nothing, so "about how long will this take" had no answer anywhere in the
// app. `logTurn` now also feeds this ring, and the dispatch preview
// (app/api/turns/preview) reads a median out of it before a creator spends.
//
// WHAT A RECORD MAY HOLD: the turn class, provider, rung, elapsed ms, cost, and
// whether it succeeded. Built field by field from the log entry — never spread —
// so nothing the log line carries for its own reasons (prompt length, error
// text, the descent trail) can reach it by accident, and the prompt never could:
// it is not in a TurnLog to begin with. tests/golden-path/turn-preview.probe.spec.ts
// holds the record shape.
//
// PER PROCESS, AND IT SAYS SO. A restart empties it and two server instances
// keep two rings. That is an estimate's honest scope: `n` travels with every
// median, so "200s over n=3" is never read as a measured constant.

import type { TurnLog } from "./log";
import type { LadderRung, TextProviderId, TurnClass } from "./types";

export interface TurnStat {
  turn: TurnClass;
  provider?: TextProviderId;
  /** Present on a served turn only — a failure occupied no rung. */
  rung?: LadderRung;
  ms: number;
  costUsd?: number;
  ok: boolean;
  /** When it settled (epoch ms). */
  at: number;
}

export interface TurnEstimate {
  /** Median elapsed of the served turns that match, or null with none. */
  p50Ms: number | null;
  /** How many served turns the median is over. */
  n: number;
  /** Median cost over those of them that reported one, or null. */
  p50CostUsd: number | null;
}

/** Enough recent turns to give a stable median per class and rung, small
 *  enough that the ring never matters to memory. Oldest out first. */
export const TURN_STATS_CAP = 256;

const ring: TurnStat[] = [];

/** Record one settled turn. Called from `logTurn`; never throws. */
export function recordTurn(l: TurnLog, now: number = Date.now()): void {
  if (typeof l.ms !== "number" || !Number.isFinite(l.ms) || l.ms < 0) return;
  const r: TurnStat = { turn: l.turn, ms: l.ms, ok: !l.kind, at: now };
  if (l.provider) r.provider = l.provider;
  if (!l.kind && l.rung) r.rung = l.rung;
  if (typeof l.costUsd === "number" && Number.isFinite(l.costUsd)) r.costUsd = l.costUsd;
  ring.push(r);
  if (ring.length > TURN_STATS_CAP) ring.splice(0, ring.length - TURN_STATS_CAP);
}

/** A copy of the ring, oldest first. */
export function turnStats(): TurnStat[] {
  return ring.map((r) => ({ ...r }));
}

/** The middle value; with an even count, the mean of the two middles. */
function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** The median served duration (and cost) for a turn class, on one rung or on
 *  any. Failures are excluded: a timeout's 600s is not how long an answer takes. */
export function turnEstimate(turn: TurnClass, rung?: LadderRung): TurnEstimate {
  const served = ring.filter((r) => r.ok && r.turn === turn && (!rung || r.rung === rung));
  const ms = median(served.map((r) => r.ms));
  return {
    p50Ms: ms === null ? null : Math.round(ms),
    n: served.length,
    p50CostUsd: median(served.flatMap((r) => (r.costUsd === undefined ? [] : [r.costUsd]))),
  };
}

/** Test-only: empty the ring. */
export function __resetTurnStats(): void {
  ring.length = 0;
}
