// A LIVE VALUE TRAVELS WITH ITS AGE AND ITS EDGE'S HEALTH - and stale is never
// shown as current.
//
// v1's contract (lib/pollFreshness.ts, lib/usePolling.ts, app/foundry/StalePoll.tsx):
// a poll that fails KEEPS the last answer, because a failure must not blank the run
// - but the kept answer used to be shown unlabelled, so a "running" read from a
// server that stopped answering ten minutes ago looked exactly like one read a
// moment ago. Kept here, with the reason each rule exists:
//   · the edge is unhealthy only while the newest failure is NEWER than the newest
//     success; a success after a failure restores health, and nothing else does;
//   · past MAX_ACTIONABLE_AGE_MS the held value is no longer evidence of the state:
//     a different number from the poll interval ("ask again" vs "stop acting on
//     what you last got");
//   · the age is coarse on purpose (`formatAge`): the badge is a warning, not a clock.
//
// Upgraded for the new transport: live state arrives over SSE, with polling only as
// a slow backstop, so the core is transport-agnostic. `observe` takes what the edge
// said - a value, a heartbeat (the stream is alive and nothing changed), or a
// failure - and `view(state, now)` answers {value, ageMs, edge, since}. Under SSE,
// SILENCE is also a signal: a stream that stopped sending heartbeats is not live even
// though no request failed, which polling could never express.
//
//   live   heard from the edge within `silenceMs`, and no failure since
//   stale  not live, but the value was confirmed within MAX_ACTIONABLE_AGE_MS
//   down   not live, and nothing actionable is held (never heard, or too old)
//
// One rule v1 did not need: a value event older than the held one is IGNORED (an
// SSE replay or a slow poll landing after a fast one must not roll the value back;
// client-state async-race-guards).

/** Past this age the held value is no longer evidence (v1 MAX_ACTIONABLE_AGE_MS). */
export const MAX_ACTIONABLE_AGE_MS = 60_000;

/**
 * Silence longer than this means the edge is not live. Sized for an SSE heartbeat
 * every 15 s with one missed beat forgiven; the polling backstop sets its own
 * (interval x 2 + the in-flight cap is the honest bound for a poll).
 */
export const DEFAULT_SILENCE_MS = 35_000;

export type Edge = "live" | "stale" | "down";

export type EdgeEvent<T> =
  | { readonly kind: "value"; readonly value: T; readonly at: number }
  | { readonly kind: "heartbeat"; readonly at: number }
  | { readonly kind: "fail"; readonly at: number };

export type FreshState<T> = {
  readonly openedAt: number;
  /** The held value and when it was produced; absent until the first value arrives. */
  readonly held?: { readonly value: T; readonly at: number };
  /** When the held value was last CONFIRMED current: a value or a heartbeat while live. */
  readonly confirmedAt: number | null;
  readonly heardAt: number | null;
  readonly failAt: number | null;
  /** First contact after the last failure or silence gap: when "live" began. */
  readonly liveFrom: number | null;
  readonly silenceMs: number;
  readonly maxAgeMs: number;
};

export type FreshView<T> = {
  readonly value?: T;
  /** Absent while no value is held. */
  readonly ageMs?: number;
  readonly edge: Edge;
  /** When the edge entered its current state. */
  readonly since: number;
};

export function open<T>(now: number, opts: { silenceMs?: number; maxAgeMs?: number } = {}): FreshState<T> {
  return {
    openedAt: now,
    confirmedAt: null,
    heardAt: null,
    failAt: null,
    liveFrom: null,
    silenceMs: opts.silenceMs ?? DEFAULT_SILENCE_MS,
    maxAgeMs: opts.maxAgeMs ?? MAX_ACTIONABLE_AGE_MS,
  };
}

/** Was the edge live just before `at`? (contact within the silence bound, no failure since). */
function wasLive<T>(s: FreshState<T>, at: number): boolean {
  if (s.heardAt === null) return false;
  if (s.failAt !== null && s.failAt >= s.heardAt) return false;
  return at - s.heardAt <= s.silenceMs;
}

export function observe<T>(s: FreshState<T>, e: EdgeEvent<T>): FreshState<T> {
  if (e.kind === "fail") return s.failAt !== null && s.failAt >= e.at ? s : { ...s, failAt: e.at };
  const liveFrom = wasLive(s, e.at) ? s.liveFrom : e.at;
  const heardAt = s.heardAt === null ? e.at : Math.max(s.heardAt, e.at);
  if (e.kind === "heartbeat") {
    const confirmedAt = s.held === undefined ? s.confirmedAt : Math.max(s.confirmedAt ?? e.at, e.at);
    return { ...s, heardAt, liveFrom, confirmedAt };
  }
  if (s.held !== undefined && e.at < s.held.at) return { ...s, heardAt, liveFrom };
  return { ...s, held: { value: e.value, at: e.at }, confirmedAt: Math.max(s.confirmedAt ?? e.at, e.at), heardAt, liveFrom };
}

export function view<T>(s: FreshState<T>, now: number): FreshView<T> {
  const base = s.held === undefined ? {} : { value: s.held.value, ageMs: Math.max(0, now - (s.confirmedAt ?? s.held.at)) };
  const failing = s.failAt !== null && (s.heardAt === null || s.failAt >= s.heardAt);
  const silentFrom = s.heardAt === null ? null : s.heardAt + s.silenceMs;
  if (s.heardAt !== null && !failing && now <= (silentFrom ?? 0)) {
    return { ...base, edge: "live", since: s.liveFrom ?? s.heardAt };
  }
  const lostAt = Math.max(failing && s.failAt !== null ? s.failAt : -Infinity, silentFrom !== null && now > silentFrom ? silentFrom : -Infinity);
  const actionableUntil = s.confirmedAt === null ? null : s.confirmedAt + s.maxAgeMs;
  if (actionableUntil !== null && now <= actionableUntil) return { ...base, edge: "stale", since: lostAt };
  const downSince = actionableUntil === null ? Math.max(s.openedAt, lostAt) : Math.max(actionableUntil, lostAt);
  return { ...base, edge: "down", since: downSince };
}

/**
 * The next instant `view` would answer a different edge, or null when only new
 * events can change it. The hook arms ONE timer for it instead of re-rendering
 * every second (§9.5: no per-tick churn; the age text is coarse on purpose).
 */
export function nextChange<T>(s: FreshState<T>, now: number): number | null {
  const candidates: number[] = [];
  if (s.heardAt !== null) candidates.push(s.heardAt + s.silenceMs + 1);
  if (s.confirmedAt !== null) candidates.push(s.confirmedAt + s.maxAgeMs + 1);
  const future = candidates.filter((t) => t > now);
  return future.length === 0 ? null : Math.min(...future);
}

/** "42 s" / "3 min" - coarse on purpose; the badge is a warning, not a clock (v1). */
export function formatAge(ageMs: number): string {
  const s = Math.round(ageMs / 1000);
  return s < 90 ? `${s} s` : `${Math.round(s / 60)} min`;
}
