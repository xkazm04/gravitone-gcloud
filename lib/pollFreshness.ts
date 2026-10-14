// A POLLED VALUE TRAVELS WITH ITS AGE AND ITS EDGE'S HEALTH.
//
// The foundry views poll a live run every four seconds and keep the last answer
// when a poll fails -- correctly: a failure must not blank the run. But the kept
// answer used to be shown unlabelled, so a "running" status read from a server
// that stopped answering ten minutes ago looked exactly like one read a moment
// ago. The failure surfaced only beside the run LIST, never beside the value it
// made stale. This is the pure decision; the hook and the banner sit on it.

/** Past this age the last answer is no longer evidence of the run's state. A
 *  different number from the poll interval: the interval says "ask again", the
 *  bound says "stop acting on what you last got". */
export const MAX_ACTIONABLE_AGE_MS = 60_000;

export type Freshness =
  | { state: "fresh" }
  | { state: "degraded"; ageMs: number }
  | { state: "lapsed"; ageMs: number };

/**
 * `okAt`   -- when the last poll succeeded (null: none has yet).
 * `failAt` -- when the last poll failed (null: none has).
 * The edge is unhealthy only while the failure is NEWER than the success: a
 * success after a failure restores health, and nothing else does.
 */
export function pollFreshness(
  okAt: number | null,
  failAt: number | null,
  now: number,
  maxAgeMs: number = MAX_ACTIONABLE_AGE_MS,
): Freshness {
  if (okAt === null || failAt === null || failAt <= okAt) return { state: "fresh" };
  const ageMs = Math.max(0, now - okAt);
  return ageMs > maxAgeMs ? { state: "lapsed", ageMs } : { state: "degraded", ageMs };
}

/** "42 s" / "3 min" -- coarse on purpose; the banner is a warning, not a clock. */
export function formatAge(ageMs: number): string {
  const s = Math.round(ageMs / 1000);
  return s < 90 ? `${s} s` : `${Math.round(s / 60)} min`;
}
