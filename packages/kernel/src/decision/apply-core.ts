import type { AppErrorCode } from "@gt/domain/errors";

// THE APPLY OUTBOX, pure: given one outbox row and the clock, what a take and a
// finish WOULD write. ./apply.ts reads the row, calls these, writes.
//
// The row is a committed (or returned) packet whose outcome v1 has not taken
// yet (./commit.ts writes it in the act's transaction). Delivering it is a call
// to v1's own writer, which is outside the store, so it is at-least-once and
// each source adapter's `apply` is idempotent (v1's writers replace rows and
// reuse journal revisions). What this core decides is the rest of the
// delivery-guarantees subject, for one row:
//
//   atomic-claiming   a take is a conditional write that names its HOLDER and
//                     a LEASE deadline; the finish conditions on still holding
//                     it, so a slow applier that was reaped loses politely
//                     instead of overwriting the reaper's verdict.
//   retry-escalation  every take is an attempt, counted on the row, so an
//                     apply that kills its applier is counted too (a reaped
//                     claim is not a free retry); at MAX_ATTEMPTS the row
//                     MOVES to `stuck` - a state the Floor shows - rather than
//                     retrying forever while it reads as pending. A failure v1
//                     classifies as permanent (it refused, or the record is
//                     gone) escalates at once: more attempts will not heal it.
//   stuck-reaping     an expired lease is the evidence; no folklore threshold.
//   dead-letter       the stuck row keeps v1's sentence verbatim and its
//                     attempt count, and an operator's redrive is the only way
//                     back to pending.
//
// v1 had no outbox: lib/foundry/store.ts commitRun wrote its journal line and
// then the files in one call, and a crash between them was recovered by the
// journal's reused revision on the next commit. The idempotent-writer half of
// that is kept (it is what makes at-least-once safe); the "retry happens when
// someone commits again" half is replaced by a row that a reconciler drains.

export const MAX_ATTEMPTS = 5;
/** Delay before attempt n+1 after a failed attempt n (n = 1..4), in ms. */
export const BACKOFF_MS: readonly number[] = [30_000, 120_000, 600_000, 1_800_000];
/** How long a take holds its row. Longer than any v1 commit takes (a forge commit
 *  deletes plates and rewrites two indices; seconds), short enough that a dead
 *  applier's row is retried within the minute the Floor would notice. */
export const LEASE_MS = 120_000;

export type ApplyRowState = "pending" | "applied" | "stuck";

export type ApplyRow = {
  readonly packetId: string;
  readonly act: "commit" | "return";
  readonly ticket: string;
  readonly state: ApplyRowState;
  readonly attempts: number;
  readonly lastError: string | null;
  readonly nextAt: string;
  readonly holder: string | null;
  readonly leaseUntil: string | null;
};

const plus = (iso: string, ms: number): string => new Date(Date.parse(iso) + ms).toISOString();

export type TakePlan =
  | { readonly kind: "skip" }
  | { readonly kind: "claim"; readonly attempts: number; readonly leaseUntil: string; readonly reaped: boolean }
  | { readonly kind: "stuck"; readonly attempts: number; readonly error: string };

/** Whether `holder` may take this row now. */
export function planTake(row: ApplyRow, now: string, leaseMs: number = LEASE_MS): TakePlan {
  if (row.state !== "pending" || row.nextAt > now) return { kind: "skip" };
  const held = row.leaseUntil !== null && row.leaseUntil > now;
  if (held) return { kind: "skip" };
  const reaped = row.holder !== null;
  // A claim that expired was an attempt that never reported: at the ceiling it
  // is the last one, and the row escalates instead of being taken again.
  if (reaped && row.attempts >= MAX_ATTEMPTS) {
    return { kind: "stuck", attempts: row.attempts, error: `the applier ${row.holder} held attempt ${row.attempts} past its lease and never reported; ${row.lastError ?? "no earlier error"}` };
  }
  return { kind: "claim", attempts: row.attempts + 1, leaseUntil: plus(now, leaseMs), reaped };
}

/** What an apply reports: done, or v1's own sentence and the class of failure. */
export type ApplyOutcome = { readonly ok: true } | { readonly ok: false; readonly error: string; readonly code: AppErrorCode };

/** v1 refused the act or the record is gone: another attempt will meet the same answer. */
const PERMANENT: ReadonlySet<AppErrorCode> = new Set<AppErrorCode>(["invalid", "refused", "not-found"]);

export type FinishPlan =
  | { readonly kind: "lost" }
  | { readonly kind: "applied" }
  | { readonly kind: "retry"; readonly nextAt: string; readonly error: string }
  | { readonly kind: "stuck"; readonly error: string; readonly permanent: boolean };

/** The row after `holder`'s attempt reported. */
export function planFinish(row: ApplyRow, holder: string, outcome: ApplyOutcome, now: string): FinishPlan {
  if (row.state !== "pending" || row.holder !== holder) return { kind: "lost" };
  if (outcome.ok) return { kind: "applied" };
  const permanent = PERMANENT.has(outcome.code);
  if (permanent || row.attempts >= MAX_ATTEMPTS) return { kind: "stuck", error: outcome.error, permanent };
  const wait = BACKOFF_MS[Math.min(row.attempts, BACKOFF_MS.length) - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1] ?? 0;
  return { kind: "retry", nextAt: plus(now, wait), error: outcome.error };
}
