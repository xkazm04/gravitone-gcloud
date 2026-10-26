import type { Holder } from "@gt/domain/job";
import { LOAD_SAMPLE_MS } from "@gt/domain/load";
import { statusIn } from "@gt/kernel/lease";
import type { Alive } from "@gt/kernel/lease-core";
import type { Reader } from "@gt/kernel/store";

// THE PUBLISH TIMERS, NAMED ONCE (background-jobs: loop-supervision - "names come from a single
// closed set"), and what anyone can read about them from the store (scheduling:
// schedule-observability, the forward ledger and the liveness signal; background-jobs:
// loop-health-telemetry, the current-state surface whose cardinality is the roster's).
//
// v1 had no timer at all: `tick` ran when someone typed `pipeline/publish.mts tick` (plan §3.1:
// "nothing in-app calls tick today"), so every slot was as punctual as the operator's memory.
// The worker's roster (workers/timers.ts) runs these; each timer is held as a kernel lease on
// `timer:<name>` - at most one live runner per store, a dead runner's timer taken over with a
// `lease.reclaimed` event that names it - and the lease's heartbeat, moved every tick, is the
// timer's persisted pulse. Transitions (a gap, the first failure, the recovery, a quarantine)
// are `timer.*` events on the same subject; a quiet healthy tick writes no event, because a
// thirty-second loop that announced itself would bury the ledger in "still here".

// `load-sample` (spark night-load-band): the box's load, one reading a minute, for a night's band.
// `night-fill` (spark scout-vision S6): the night's plan queue launched while the box sits under the band.
export const TIMER_NAMES = ["publish-tick", "metrics-refresh", "load-sample", "night-fill"] as const;
export type TimerName = (typeof TIMER_NAMES)[number];

export type TimerSpec = {
  readonly name: TimerName;
  /** The idle cadence: the loop's worst-case latency. A tick may ask to wake sooner. */
  readonly everyMs: number;
  /** Past this a tick is abandoned (its writes are fenced) and recorded timed-out. */
  readonly deadlineMs: number;
  /** Staggered first firing, so boot is a ramp, not a stampede. */
  readonly firstDelayMs: number;
};

/** Due slots are found within a tick of their time; a tick also wakes AT the next slot's time. */
export const PUBLISH_TICK: TimerSpec = { name: "publish-tick", everyMs: 30_000, deadlineMs: 30 * 60_000, firstDelayMs: 0 };
/** Lifetime statistics change slowly and spend quota; four reads a day. */
export const METRICS_REFRESH: TimerSpec = { name: "metrics-refresh", everyMs: 6 * 60 * 60_000, deadlineMs: 10 * 60_000, firstDelayMs: 60_000 };
/** One reading of the box a minute (a night's summary counts a waiting job one cadence per sample). A probe
 *  takes ~1 s; past half a cadence it is hung, not slow. First at ~5 s, after the publish tick's boot. */
export const LOAD_SAMPLE: TimerSpec = { name: "load-sample", everyMs: LOAD_SAMPLE_MS, deadlineMs: 30_000, firstDelayMs: 5_000 };
/** A /scout night's plan queue: one launch a tick at most, so five minutes is the slowest a band-low box refills. A
 *  draft item is written inside the tick (a local model's turn, minutes); past ten it is hung. First at ~90 s, once the
 *  sampler has a reading or two. */
export const NIGHT_FILL: TimerSpec = { name: "night-fill", everyMs: 5 * 60_000, deadlineMs: 10 * 60_000, firstDelayMs: 90_000 };

/** A stretch a timer was not ticking: from its last heartbeat to the tick that noticed. */
export type Gap = { readonly from: string; readonly to: string };

export const timerResource = (name: TimerName): string => `timer:${name}`;

/** The timer lease outlives three missed beats (slack against a slow disk, never one). */
export const timerTtlS = (spec: TimerSpec): number => Math.max(120, Math.ceil((3 * spec.everyMs) / 1000));

export type TimerStatus = {
  readonly name: TimerName;
  readonly everyMs: number;
  /** Who runs it now; absent when nobody does. */
  readonly holder?: Holder;
  /** The holder's beat has lapsed or its process is gone: the timer is NOT running. */
  readonly stale: boolean;
  /** The last heartbeat while held, else the instant it was last let go; null if never run. */
  readonly lastRunAt: string | null;
  /** When the next tick is due at the latest, while someone holds it. */
  readonly nextDueAt: string | null;
  /** The failure that is still standing (no recovery since), verbatim. */
  readonly failing: { readonly since: string; readonly error: string; readonly outcome: string } | null;
  readonly quarantined: boolean;
};

function lastOf(r: Reader, resource: string, types: readonly string[]): { type: string; at: string; error?: string; outcome?: string } | undefined {
  const row = r.get(
    `SELECT type, at, json_extract(data, '$.error') AS error, json_extract(data, '$.outcome') AS outcome FROM events WHERE subject_id = ? AND type IN (${types.map(() => "?").join(", ")}) ORDER BY seq DESC LIMIT 1`,
    resource,
    ...types,
  );
  if (row === undefined) return undefined;
  const error = row["error"];
  const outcome = row["outcome"];
  return { type: String(row["type"]), at: String(row["at"]), ...(typeof error === "string" ? { error } : {}), ...(typeof outcome === "string" ? { outcome } : {}) };
}

/** A timer as the store has it: what the Runs calendar row reads. Never a write. */
export function timerStatusIn(r: Reader, spec: TimerSpec, me: Holder, alive: Alive): TimerStatus {
  const resource = timerResource(spec.name);
  const lease = statusIn(r, resource, me, alive);
  const held = lease.holder;
  const released = held === undefined ? lastOf(r, resource, ["lease.released", "lease.reclaimed"]) : undefined;
  const lastRunAt = held?.heartbeatAt ?? released?.at ?? null;
  const running = held !== undefined && lease.stale === undefined;
  const verdict = lastOf(r, resource, ["timer.fail", "timer.recover", "timer.quarantine"]);
  const failing =
    verdict !== undefined && verdict.type !== "timer.recover" ? { since: verdict.at, error: verdict.error ?? "", outcome: verdict.outcome ?? "failed" } : null;
  return {
    name: spec.name,
    everyMs: spec.everyMs,
    ...(held === undefined ? {} : { holder: held.holder }),
    stale: held !== undefined && lease.stale !== undefined,
    lastRunAt,
    nextDueAt: running && lastRunAt !== null ? new Date(Date.parse(lastRunAt) + spec.everyMs).toISOString() : null,
    failing,
    quarantined: verdict?.type === "timer.quarantine",
  };
}
