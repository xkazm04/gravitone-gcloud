// THE POLLING BACKSTOP'S ONE DECISION, pure (v1 lib/usePolling.ts `mayTick`).
//
// In-flight guard: while the last poll's promise is pending the next tick is
// SKIPPED, so a slow response stops multiplying requests against the rate limiter
// (lib/apiAuth.ts sizes itself against "a 4-second poll of a live run"). A promise
// that never settles must not stall the poll forever: a call older than the cap is
// abandoned and the tick proceeds.

export const IN_FLIGHT_CAP_MS = 30_000;

/** May a tick run, given when the pending call began (null: nothing pending)? */
export function mayTick(startedAt: number | null, now: number, cap: number = IN_FLIGHT_CAP_MS): boolean {
  return startedAt === null || now - startedAt >= cap;
}

/** The silence bound a poll at `intervalMs` earns: two missed answers, plus the in-flight cap. */
export const pollSilenceMs = (intervalMs: number, cap: number = IN_FLIGHT_CAP_MS): number => intervalMs * 2 + cap;
