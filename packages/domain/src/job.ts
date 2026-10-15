import { z } from "zod";

import { usdSchema } from "./estimate.ts";
import type { AppErrorCode } from "./errors.ts";
import { jobIdSchema, partIdSchema, runIdSchema } from "./ids.ts";
import { resourceLaneSchema } from "./lane.ts";
import { defineMachine } from "./transitions.ts";

// A JOB: the durable record of work occupying a resource lane (plan §2.2,
// §4.3 `kernel/job`). One per Part, or one per Run launched from the Floor.
//
// Absorbed from four v1 machines, each of which learned one thing the hard way:
//   lib/turns/ledger.ts          a running record names its owner (bootId, pid,
//                                host); a sweep marks it `orphaned` only when
//                                that owner is provably gone.
//   lib/foundry/extract/*        a lease on the manifest; a breaker that stops
//                                after three consecutive vendor failures; a
//                                MONEY stop that is not a vendor failure and
//                                never bumps that streak.
//   lib/sound/mv/queue.ts        a crash mid-step switches the queue off and
//   lib/suno/types.ts            names what was running: the step may already
//                                have spent a still or Suno credits that never
//                                reached the store, so the operator looks
//                                before anything re-spends.
//   prototype studio.js          paused, retry with `attempt++`, re-route.

/**
 * `interrupted` is v1's `orphaned` (turns) and `queue.interrupted` (MV, Suno)
 * made one state. It is deliberately NOT `failed`: a failure is a known
 * outcome with a reason, and a retry takes it again; an interruption is an
 * UNKNOWN outcome — the vendor may have been paid — and the only honest next
 * act is an operator's look. v1 expressed that by switching the whole queue
 * off; here the job itself carries it, so one crashed job does not stop its
 * lane's neighbours. Its exits are the same as `failed`'s; what differs is who
 * may take them, which the kernel's driver enforces (an automatic resume never
 * leaves `interrupted`), and what the Runs view says.
 *
 * A money stop is `failed` with a `stop` record and `error.code: "budget"`, as
 * v1 extract had it (`status: "failed"` plus `stopped`): one failed state, the
 * reason as data, and the breaker (`failStreak`) never counts it.
 *
 * `running -> paused` is v1's Stop-between-steps (MV): the step in flight
 * finishes and the job holds every file it has. `running -> cancelled` exists
 * because a text turn can be aborted mid-flight (lib/turns); a producer whose
 * step cannot be called back refuses that edge in its own driver, as v1 MV did.
 * There is no `interrupted -> running`: nothing resumes a crashed job without
 * passing back through the queue.
 */
export const jobMachine = defineMachine({
  planned: ["queued", "cancelled"],
  queued: ["running", "paused", "cancelled"],
  running: ["done", "failed", "interrupted", "paused", "cancelled"],
  paused: ["queued", "cancelled"],
  failed: ["queued", "cancelled"],
  interrupted: ["queued", "cancelled"],
  done: [],
  cancelled: [],
});
export const jobStateSchema = z.enum(jobMachine.states);
export type JobState = z.output<typeof jobStateSchema>;

/** The closed taxonomy of `@gt/domain/errors`, exhaustive by its mapped type:
 *  a code added there is a type error here until it is added. */
const ERROR_CODES: { readonly [K in AppErrorCode]: K } = {
  invalid: "invalid",
  "not-found": "not-found",
  conflict: "conflict",
  unauthenticated: "unauthenticated",
  refused: "refused",
  unavailable: "unavailable",
  budget: "budget",
  internal: "internal",
};

/** Who holds a running job. v1's turn-ledger ownership triple; a pid is only
 *  probed on the same host, and a different host is treated as gone. */
export const holderSchema = z.object({
  bootId: z.string().min(1),
  pid: z.number().int().positive(),
  host: z.string().min(1),
});
export type Holder = z.output<typeof holderSchema>;

/**
 * The lease (lib/gpu/lease.ts: heartbeat, TTL; extract's manifest lease) plus
 * the fencing token plan §3.1 adds: a number that only grows per job, so a
 * holder that wakes after its lease was taken over writes with a stale fence
 * and is refused. Validity is never a type — it has a clock — so this record
 * says who and since when, and the kernel decides whether it still holds.
 */
export const leaseSchema = z.object({
  holder: holderSchema,
  fence: z.number().int().positive(),
  acquiredAt: z.iso.datetime(),
  heartbeatAt: z.iso.datetime(),
  ttlS: z.number().int().positive(),
});
export type Lease = z.output<typeof leaseSchema>;

/** v1 extract's `ExtractSpend`: booked after every served call. An unpriced
 *  call is booked at its estimate and counted, so a total is a lower bound
 *  that says so (`basis: "estimate"`). */
export const jobSpendSchema = z.object({
  usd: usdSchema,
  unpriced: z.number().int().nonnegative(),
  basis: z.enum(["reported", "estimate"]),
});

export const jobSchema = z
  .object({
    id: jobIdSchema,
    of: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("part"), id: partIdSchema }),
      z.object({ kind: z.literal("run"), id: runIdSchema }),
    ]),
    lane: resourceLaneSchema,
    state: jobStateSchema,
    lease: leaseSchema.optional(),
    /** 1 on the first run; a retry or re-route adds one. */
    attempt: z.number().int().positive(),
    progress: z.object({
      done: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
      stage: z.string().min(1).optional(),
    }),
    spend: jobSpendSchema,
    /** Consecutive vendor failures (v1 extract `fail_streak`); a retry resets it. */
    failStreak: z.number().int().nonnegative(),
    /** The engine's sentence, verbatim (v1 MV: "ANY THROW fails the job with
     *  the engine's sentence VERBATIM"), classified into the one taxonomy. */
    error: z.object({ code: z.enum(ERROR_CODES), message: z.string().min(1) }).optional(),
    /** Why a job stopped for money: its own ceiling, or the spend window. */
    stop: z
      .object({
        by: z.enum(["run-ceiling", "period-ceiling"]),
        spentUsd: usdSchema,
        ceilingUsd: usdSchema.optional(),
        at: z.iso.datetime(),
      })
      .optional(),
    /** What was running when its holder died: the step, and whose it was. */
    interruption: z
      .object({ at: z.iso.datetime(), holder: holderSchema, stage: z.string().min(1).optional() })
      .optional(),
  })
  .superRefine((j, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if ((j.state === "running") !== (j.lease !== undefined)) issue("lease", "a job holds a lease exactly while it is running");
    if ((j.state === "failed") !== (j.error !== undefined)) issue("error", "a job carries an error exactly while it is failed");
    if ((j.state === "interrupted") !== (j.interruption !== undefined))
      issue("interruption", "a job names what was running exactly while it is interrupted");
    if ((j.stop !== undefined) !== (j.error?.code === "budget"))
      issue("stop", "a money stop is a failed job whose error is `budget`, and only that");
    if (j.progress.done > j.progress.total) issue("progress", "progress cannot pass its total");
  });
export type Job = z.output<typeof jobSchema>;
