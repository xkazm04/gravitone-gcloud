import { z } from "zod";

import { usdSchema } from "./estimate.ts";
import type { AppErrorCode } from "./errors.ts";
import { actorSchema } from "./event.ts";
import { jobIdSchema, partIdSchema, projectIdSchema, runIdSchema } from "./ids.ts";
import { resourceLaneSchema } from "./lane.ts";
import { jobMachine } from "./job.machine.ts";

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

/** The table and its union live in ./job.machine.ts, zod-free, so a client can hold them. */
export { jobMachine, type JobState } from "./job.machine.ts";
export const jobStateSchema = z.enum(jobMachine.states);

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

/**
 * HOW A JOB MAY SPEND (plan §3.2, Director's decision 4). Dry is the default
 * and needs nothing; live carries its arm - who, when, why - so every live
 * spend names its authority. Kernel dryrun.ts is the mechanism; the schema
 * lives here because the job RECORD carries it (a Run's receipt says `mode`,
 * and a retry must not silently change it).
 */
export const liveArmSchema = z.object({ by: actorSchema, at: z.iso.datetime(), reason: z.string().trim().min(1) });
export type LiveArm = z.output<typeof liveArmSchema>;
export const runModeSchema = z.discriminatedUnion("kind", [z.object({ kind: z.literal("dry") }), z.object({ kind: z.literal("live"), arm: liveArmSchema })]);
export type RunMode = z.output<typeof runModeSchema>;

/**
 * The operator's re-route, as the router reads it (kernel router/types.ts
 * `Steer`, held equal by a kernel test): a preference within the plan, never an
 * exemption from it. The router stays the judge of what it does.
 */
export const steerSchema = z.object({
  pin: z.string().min(1).optional(),
  prefer: z.string().min(1).optional(),
  exclude: z.array(z.string().min(1)).optional(),
});
export type Steer = z.output<typeof steerSchema>;

export const jobSchema = z
  .object({
    id: jobIdSchema,
    of: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("part"), id: partIdSchema }),
      z.object({ kind: z.literal("run"), id: runIdSchema }),
    ]),
    /** Who makes it (`of` says what it serves): the worker looks the producer up by this name. */
    producer: z.string().min(1),
    lane: resourceLaneSchema,
    state: jobStateSchema,
    mode: runModeSchema,
    /** The job's own USD ceiling, frozen at enqueue and raised only by the operator's retry. */
    ceilingUsd: z.number().positive().optional(),
    steer: steerSchema.optional(),
    /** What the job's events are about, so the ledger's project_id/run_id columns fill. */
    correlation: z.object({ projectId: projectIdSchema.optional(), runId: runIdSchema.optional() }).optional(),
    lease: leaseSchema.optional(),
    /** The lane slot (`<lane>#<i>`) the lease is on; present exactly with the lease. */
    slot: z.string().min(1).optional(),
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
    if ((j.lease !== undefined) !== (j.slot !== undefined)) issue("slot", "a lease is on a lane slot, and a slot is held only under a lease");
    if (j.slot !== undefined && !j.slot.startsWith(`${j.lane}#`)) issue("slot", "a job holds a slot of its own lane");
    if ((j.state === "failed") !== (j.error !== undefined)) issue("error", "a job carries an error exactly while it is failed");
    if ((j.state === "interrupted") !== (j.interruption !== undefined))
      issue("interruption", "a job names what was running exactly while it is interrupted");
    if ((j.stop !== undefined) !== (j.error?.code === "budget"))
      issue("stop", "a money stop is a failed job whose error is `budget`, and only that");
    if (j.progress.done > j.progress.total) issue("progress", "progress cannot pass its total");
  });
export type Job = z.output<typeof jobSchema>;
