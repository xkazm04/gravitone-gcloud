import { AppError, type AppErrorCode } from "@gt/domain/errors";
import type { Estimate } from "@gt/domain/estimate";
import type { EventData } from "@gt/domain/event";
import { jobMachine, type Holder, type Job, type JobState, type Lease } from "@gt/domain/job";
import type { ResourceLane } from "@gt/domain/lane";

// THE JOB, PURE - what a job does next, and what each outcome does to its
// record, as functions of the record, the facts and an instant. job-run.ts is
// the one driver that reads the facts and applies these inside transactions.
//
// Absorbed from four v1 engines, and what each contributes here:
//   lib/foundry/extract/engine.ts  a pure `next()` and a `perform` that does ONE
//     unit; the run ceiling checked BEFORE the unit against its estimate, so
//     nothing is spent past it; a breaker after three consecutive vendor
//     failures that a money stop never feeds (extract once counted its own
//     meter's refusal as a vendor failure and read "3 consecutive vendor
//     failures" over a budget stop - breaker.ts tells that story).
//   lib/sound/mv/queue.ts  the plan IS the missing outputs: a step runs when its
//     output is absent, so resume needs no bookkeeping.
//   lib/suno (types.ts `interrupted`) + MV  a crash mid-step may already have
//     spent; the job is interrupted, names what was running, and waits for an
//     operator.
//   lib/turns/ledger.ts  the record names its holder (bootId, pid, host).
// Upgraded: v1 kept "is a step in flight" implicitly (MV's `phase`, extract's
// unit derived again from the manifest), so recovery could not tell a step
// that was dispatched from one that never started. Here `progress.stage` is
// set in the transaction BEFORE the call and cleared in the one that books
// it: present means dispatched-and-unbooked (job-coordination:
// in-flight-is-a-position), and an interruption copies it, so the operator
// reads which step may have spent instead of guessing.

/** A booked output: what one step produced, as plain JSON. */
export type Output = { readonly step: string; readonly value: EventData; readonly at: string };
export type Outputs = ReadonlyMap<string, Output>;

/** A step the plan says is still missing. Its estimate is what the ceiling
 *  is checked against before it runs. */
export type MissingStep = { readonly name: string; readonly estimate: Estimate };

/**
 * What one bounded `perform` reports. A cost is what the vendor charged; an
 * absent cost on a produced step is UNPRICED, never free - it is booked at the
 * step's estimate and counted (v1 extract `book`). A failed call was not
 * served and books only the cost it reports.
 */
export type StepOutcome =
  | { readonly kind: "produced"; readonly output: EventData; readonly costUsd?: number }
  | { readonly kind: "vendor-failure"; readonly message: string; readonly costUsd?: number }
  /** The spend window refused the call: a money stop, never a breaker count. */
  | { readonly kind: "money-stop"; readonly message: string }
  /** Anything else: the job fails with this sentence verbatim (v1 MV). */
  | { readonly kind: "fatal"; readonly code: AppErrorCode; readonly message: string };

export type StepContext = {
  readonly job: Job;
  readonly outputs: Outputs;
  /** Stable across retries and attempts: a vendor that dedupes can key on it. */
  readonly key: string;
  /**
   * The spend owner for this drive. A producer whose step pays reserves under
   * it (spend/settler.ts `meteredCall`) and maps a reservation refused for
   * `budget` to a `money-stop`; job-run.ts `recover` lapses this owner's holds
   * when the drive is found dead, so a hold whose outcome is unknown keeps
   * counting at its estimate (spend/ledger.ts `lapseOwner`).
   */
  readonly owner: string;
  /** Advisory. The driver admits no new step after it; bounding the call
   *  itself is the producer's, which owns it. */
  readonly deadlineMs: number;
};

/** A producer is data and a step function, never a class. */
export type Producer = {
  readonly lane: ResourceLane;
  /** Consecutive vendor failures before the job fails; default BREAKER_LIMIT. */
  readonly breakerLimit?: number;
  plan(job: Job, outputs: Outputs): readonly MissingStep[];
  perform(step: MissingStep, ctx: StepContext): Promise<StepOutcome>;
  /** v1 MV/Suno driver health: asked before a claim; unhealthy claims nothing. */
  health?(): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }>;
};

/** v1 extract BREAKER_LIMIT: one refused frame is normal, two bad luck, three a wall. */
export const BREAKER_LIMIT = 3;

/** Micro-dollar rounding, so a $0.10 ceiling is not crossed by 1e-17 (v1 extract `usd6`). */
export const usd6 = (x: number): number => Math.round(x * 1e6) / 1e6;

export type Facts = {
  readonly missing: readonly MissingStep[];
  /** The job's own ceiling, frozen at enqueue. Absent is unlimited. */
  readonly ceilingUsd?: number;
  readonly breakerLimit: number;
};

export type Decision =
  | { readonly kind: "claim" }
  | { readonly kind: "perform"; readonly step: MissingStep }
  | { readonly kind: "stop"; readonly step: string; readonly ceilingUsd: number; readonly message: string }
  | { readonly kind: "trip"; readonly message: string }
  | { readonly kind: "finish" }
  | { readonly kind: "idle"; readonly state: JobState };

/** The next act for `job`. Exhaustive over the states; nothing here performs. */
export function next(job: Job, facts: Facts): Decision {
  if (job.state === "queued") return { kind: "claim" };
  if (job.state !== "running") return { kind: "idle", state: job.state };
  if (job.failStreak >= facts.breakerLimit) return { kind: "trip", message: `${facts.breakerLimit} consecutive vendor failures` };
  const step = facts.missing[0];
  if (step === undefined) return { kind: "finish" };
  const ceiling = facts.ceilingUsd;
  if (ceiling !== undefined) {
    const spent = job.spend.usd;
    if (step.estimate.usd === null) {
      // Fail closed: a ceiling cannot be honoured over a step with no price.
      return { kind: "stop", step: step.name, ceilingUsd: ceiling, message: `Run ceiling of $${ceiling.toFixed(2)} cannot be checked: ${step.name} has no price (${step.estimate.unpricedReason ?? "unpriced"}).` };
    }
    const est = step.estimate.usd;
    if (est > 0 && usd6(spent + est) > ceiling) {
      return { kind: "stop", step: step.name, ceilingUsd: ceiling, message: `Run ceiling reached: $${spent.toFixed(4)} of $${ceiling.toFixed(2)} spent, and ${step.name} is estimated at $${est.toFixed(4)}. Raise the ceiling and retry to continue.` };
    }
  }
  return { kind: "perform", step };
}

/* ── Transitions: every one through jobMachine.assert ─────────────────────── */

/** Move to `to`, dropping the fields the record allows only in other states. */
export function move(job: Job, to: JobState): Job {
  const r = jobMachine.assert(job.state, to);
  if (!r.ok) throw new AppError("refused", `job ${job.id}: ${r.error.message}`);
  const { lease: _lease, error: _error, stop: _stop, interruption: _interruption, ...rest } = job;
  return { ...rest, state: to };
}

export function claimed(job: Job, lease: Lease): Job {
  const { stage: _stage, ...progress } = job.progress;
  return { ...move(job, "running"), lease, progress };
}

/** Dispatch: the step is in flight from this record on. */
export function started(job: Job, step: string, done: number, total: number, at: string): Job {
  const lease = job.lease === undefined ? {} : { lease: { ...job.lease, heartbeatAt: at } };
  return { ...job, ...lease, progress: { done, total: Math.max(total, done), stage: step } };
}

export function stopped(job: Job, d: { ceilingUsd: number; message: string }, at: string): Job {
  return { ...move(job, "failed"), error: { code: "budget", message: d.message }, stop: { by: "run-ceiling", spentUsd: job.spend.usd, ceilingUsd: d.ceilingUsd, at } };
}

export function failed(job: Job, code: AppErrorCode, message: string): Job {
  return { ...move(job, "failed"), error: { code, message } };
}

export function interrupted(job: Job, holder: Holder, at: string): Job {
  const stage = job.progress.stage;
  return { ...move(job, "interrupted"), interruption: stage === undefined ? { at, holder } : { at, holder, stage } };
}

/** Operator-only: back to the queue as it stands, every output kept. */
export function retried(job: Job): Job {
  const { stage: _stage, ...progress } = job.progress;
  return { ...move(job, "queued"), attempt: job.attempt + 1, failStreak: 0, progress };
}

export type Booked = {
  readonly job: Job;
  /** The output row to write, for a produced step. */
  readonly output?: EventData;
  /** The cost to put on the step's event, with where it came from. */
  readonly cost?: { readonly usd: number; readonly src: "real" | "model" };
  /** Set when this outcome ended the job. */
  readonly ended?: "failed";
};

/**
 * Book one outcome. The step leaves flight (`stage` cleared) whatever happened.
 * A job that left `running` while the step was in flight (an operator's pause
 * or cancel) keeps the output and the spend, and changes no state: the step
 * in flight finishes and the job holds what it made (v1 MV's Stop).
 */
export function book(job: Job, step: MissingStep, o: StepOutcome, at: string, breakerLimit: number): Booked {
  const { stage: _stage, ...progress } = job.progress;
  const base: Job = { ...job, progress };
  const running = job.state === "running";
  switch (o.kind) {
    case "produced": {
      const priced = o.costUsd !== undefined;
      const usd = o.costUsd ?? step.estimate.usd ?? 0;
      const spend = priced
        ? { ...job.spend, usd: usd6(job.spend.usd + usd) }
        : { usd: usd6(job.spend.usd + usd), unpriced: job.spend.unpriced + 1, basis: "estimate" as const };
      const done = progress.done + 1;
      const next: Job = { ...base, spend, failStreak: 0, progress: { ...progress, done, total: Math.max(progress.total, done) } };
      return { job: next, output: o.output, cost: { usd, src: priced ? "real" : "model" } };
    }
    case "vendor-failure": {
      const spend = o.costUsd === undefined ? job.spend : { ...job.spend, usd: usd6(job.spend.usd + o.costUsd) };
      const streak = job.failStreak + 1;
      const counted: Job = { ...base, spend, failStreak: streak };
      const cost = o.costUsd === undefined ? {} : { cost: { usd: o.costUsd, src: "real" as const } };
      if (running && streak >= breakerLimit) {
        const message = `${breakerLimit} consecutive vendor failures; the last: ${o.message}. Fix the cause, then retry.`;
        return { job: failed(counted, "unavailable", message), ended: "failed", ...cost };
      }
      return { job: counted, ...cost };
    }
    case "money-stop":
      if (!running) return { job: base };
      return { job: { ...move(base, "failed"), error: { code: "budget", message: o.message }, stop: { by: "period-ceiling", spentUsd: job.spend.usd, at } }, ended: "failed" };
    case "fatal":
      if (!running) return { job: base };
      return { job: failed(base, o.code, o.message), ended: "failed" };
  }
}
