import { randomUUID } from "node:crypto";
import { parseAt } from "@gt/domain/door";
import { AppError, ok, type Result } from "@gt/domain/errors";
import { eventDataSchema } from "@gt/domain/event";
import type { Holder, Job } from "@gt/domain/job";
import { canonical } from "./canonical.ts";
import type { Effects } from "./effects.ts";
import { BREAKER_LIMIT, book, claimed, failed, interrupted, move, next, started, stopped, type MissingStep, type Outputs, type Producer, type StepOutcome } from "./job-core.ts";
import { jobEvent, loadJob, loadOutputs, putJob } from "./job.ts";
import { DEFAULT_TTL_S, fenceLoss, gone, type Alive } from "./lease-core.ts";
import type { SpendClass } from "./spend/core.ts";
import { lapseOwner } from "./spend/ledger.ts";
import { actorOf, assertFence, claimIn, heartbeatIn, pidAlive, processHolder, releaseIn, snapshotOf } from "./lease.ts";
import type { Tx } from "./store.ts";

// THE JOB DRIVER - the one place a job meets the world. It claims the job's
// LANE through kernel/lease, then loops: decide (job-core `next`) and mark the
// step in flight in one transaction, perform it through `fx.call`, book the
// outcome in the next transaction. Every transaction presents the lane fence
// (`assertFence`), so a driver that woke after a take-over writes nothing.
//
// Absorbed from v1's extract step machine (lib/foundry/extract/perform.ts
// `step`: one unit, ceiling first, then save) and the MV worker's lease
// (lib/sound/mv/queue.ts: "taken BEFORE crash recovery: recovery would
// otherwise requeue the job the other process is rendering"). Kept: the claim
// comes first, and the sweep it does in the same transaction can only touch
// running jobs on this lane holding an OLDER fence - provably not anyone's
// live work, because the lane is now ours.
//
// A LANE IS DECLARED, NEVER INFERRED (plan §3.1, v1 dojo_run's stack purity):
// a producer whose lane is not the job's is refused at the claim, before any
// lease is taken.
//
// A CRASH IS AN INTERRUPTION, AND AN OPERATOR LOOKS. Nothing here resumes an
// interrupted job; `recover` only names it, and job.ts `retry` is the
// operator's door. The step that was in flight is named in `interruption.stage`.
//
// THE DEADLINE ADMITS, IT DOES NOT BOUND (job-coordination:
// no-wall-clock-in-the-advance-contract). It is checked between steps only; a
// step admitted before it runs to its own end, and the producer, which owns
// the call, is told the deadline to bound it. A drive that reaches it yields:
// the job goes back to the queue (running -> paused -> queued, one
// transaction) and the lane is released, so the next drive claims it fresh,
// with a new fence.

export type RunOptions = {
  readonly holder?: Holder;
  readonly alive?: Alive;
  readonly ttlS?: number;
  readonly ticket?: string;
  /** Epoch ms after which no new step is admitted. */
  readonly deadlineMs?: number;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
  /** Wait before re-performing a step after a vendor failure, by streak. */
  readonly backoffMs?: (streak: number) => number;
  /** Lane heartbeat cadence; default a third of the TTL (job-coordination: lease-renewal). */
  readonly heartbeatMs?: number;
};

export type RunReport = {
  readonly outcome: "done" | "failed" | "stopped" | "yielded" | "busy" | "not-queued" | "unhealthy";
  readonly job?: Job;
  readonly reason?: string;
};

/** Exponential with full jitter on its upper half, capped (retry-backoff: backoff-design). */
export const defaultBackoff = (streak: number, random: () => number = Math.random): number =>
  Math.min(30_000, 1000 * 2 ** Math.max(0, streak - 1)) * (0.5 + random() / 2);

/** The spend owner of a drive: one process incarnation, so a reused pid is a different owner. */
export const spendOwner = (h: Holder): string => `${h.host}/${h.pid}/${h.bootId}`;

const sleepMs = (n: number): Promise<void> => new Promise((r) => setTimeout(r, n));

/** Interrupt one orphaned running job, naming its holder and the step in flight. */
function interrupt(t: Tx, job: Job, by: Holder, why: string): Job {
  const holder = job.lease?.holder ?? by;
  const out = interrupted(job, holder, t.at);
  putJob(t, out);
  jobEvent(t, actorOf(by), out, "job.interrupted", { why, holder: { bootId: holder.bootId, pid: holder.pid, host: holder.host }, ...(out.interruption?.stage === undefined ? {} : { stage: out.interruption.stage }) });
  return out;
}

function runningOn(t: Tx, lane: string): Job[] {
  return t.all("SELECT id FROM jobs WHERE state = 'running' AND lane = ? ORDER BY n", lane).map((r) => loadJob(t, String(r["id"])).job);
}

export async function runJob(fx: Effects, producer: Producer, jobId: string, opts: RunOptions = {}): Promise<Result<RunReport>> {
  const holder = opts.holder ?? processHolder();
  const alive = opts.alive ?? pidAlive;
  const ttlS = opts.ttlS ?? DEFAULT_TTL_S;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? sleepMs;
  const backoff = opts.backoffMs ?? ((s: number) => defaultBackoff(s));
  const limit = producer.breakerLimit ?? BREAKER_LIMIT;
  const actor = actorOf(holder);

  if (producer.health !== undefined) {
    const check = producer.health;
    const h = await fx.call("health", () => check());
    if (!h.ok) return ok({ outcome: "unhealthy", reason: h.reason });
  }

  const claim = fx.tx("claim", (t): { kind: "granted"; fence: number; lane: string } | { kind: "report"; report: RunReport } => {
    const { job } = loadJob(t, jobId);
    if (job.lane !== producer.lane) throw new AppError("refused", `job ${job.id} is declared on ${job.lane}; a ${producer.lane} producer may not run it`);
    if (job.state !== "queued") return { kind: "report", report: { outcome: "not-queued", job } };
    const c = claimIn(t, { resource: job.lane, holder, ticket: opts.ticket ?? randomUUID(), ttlS, wait: false }, alive);
    if (c.kind !== "granted") return { kind: "report", report: { outcome: "busy", job, ...(c.holder === undefined ? {} : { reason: `${c.holder.host}/${c.holder.pid} holds ${job.lane}` }) } };
    for (const orphan of runningOn(t, job.lane)) {
      if ((orphan.lease?.fence ?? 0) < c.lease.fence) interrupt(t, orphan, holder, "lane-taken-over");
    }
    const run = claimed(job, c.lease);
    putJob(t, run);
    jobEvent(t, actor, run, "job.claimed", { fence: c.lease.fence });
    return { kind: "granted", fence: c.lease.fence, lane: job.lane };
  });
  if (!claim.ok) return claim;
  if (claim.value.kind === "report") return ok(claim.value.report);
  const { fence, lane } = claim.value;

  // The heartbeat runs on a timer, never per unit: the unit that takes an hour
  // is exactly when the lease matters. A heartbeat that fails is carried to the
  // loop, which stops at its next boundary; a throw (a crash) is carried too.
  let lost: unknown;
  const beat = setInterval(() => {
    try {
      const r = fx.tx("heartbeat", (t) => void heartbeatIn(t, lane, fence));
      if (!r.ok) lost = r.error;
    } catch (e) {
      lost = e;
    }
  }, opts.heartbeatMs ?? Math.max(1000, Math.floor((ttlS * 1000) / 3)));
  // The heartbeat never keeps a process alive on its own: a process with nothing else to do has stopped working.
  beat.unref();
  // A lost lease stops the drive at its next boundary; a crash is rethrown as it is.
  const halt = (): Result<RunReport> | undefined => {
    if (lost === undefined) return undefined;
    if (lost instanceof AppError) return { ok: false, error: lost };
    throw lost;
  };

  try {
    for (;;) {
      const stop = halt();
      if (stop !== undefined) return stop;
      if (opts.deadlineMs !== undefined && now() >= opts.deadlineMs) {
        return fx.tx("yield", (t): RunReport => {
          assertFence(t, lane, fence);
          const { job } = loadJob(t, jobId);
          releaseIn(t, lane, fence);
          if (job.state !== "running") return { outcome: "stopped", job };
          const back = move(move(job, "paused"), "queued");
          putJob(t, back);
          jobEvent(t, actor, back, "job.yielded", { fence });
          return { outcome: "yielded", job: back };
        });
      }

      const decided = fx.tx("next", (t): { kind: "perform"; step: MissingStep; job: Job; outputs: Outputs } | { kind: "end"; report: RunReport } => {
        assertFence(t, lane, fence);
        const { job, terms } = loadJob(t, jobId);
        const outputs = loadOutputs(t, jobId);
        const missing = producer.plan(job, outputs);
        const d = next(job, { missing, breakerLimit: limit, ...terms });
        const finish = (j: Job, type: string, outcome: RunReport["outcome"], data: Record<string, unknown> = {}): { kind: "end"; report: RunReport } => {
          putJob(t, j);
          jobEvent(t, actor, j, type, data);
          releaseIn(t, lane, fence);
          return { kind: "end", report: { outcome, job: j } };
        };
        switch (d.kind) {
          case "perform": {
            heartbeatIn(t, lane, fence);
            const flying = started(job, d.step.name, outputs.size, outputs.size + missing.length, t.at);
            putJob(t, flying);
            jobEvent(t, actor, flying, "job.step-started", { step: d.step.name, estimateUsd: d.step.estimate.usd });
            return { kind: "perform", step: d.step, job: flying, outputs };
          }
          case "stop":
            return finish(stopped(job, d, t.at), "job.stopped", "failed", { by: "run-ceiling", step: d.step, ceilingUsd: d.ceilingUsd, spentUsd: job.spend.usd });
          case "trip":
            return finish(failed(job, "unavailable", d.message), "job.failed", "failed", { code: "unavailable", message: d.message });
          case "finish":
            return finish(move(job, "done"), "job.done", "done", { spendUsd: job.spend.usd });
          case "claim":
          case "idle":
            releaseIn(t, lane, fence);
            return { kind: "end", report: { outcome: "stopped", job } };
        }
      });
      if (!decided.ok) return decided;
      if (decided.value.kind === "end") return ok(decided.value.report);
      const { step, job, outputs } = decided.value;
      const ctx = { job, outputs, key: `${jobId}/${step.name}`, owner: spendOwner(holder), deadlineMs: opts.deadlineMs ?? Number.POSITIVE_INFINITY };
      // The try is INSIDE the call: a producer's throw becomes its outcome, and
      // anything the effect port itself throws (a crash) passes through untouched.
      const outcome = await fx.call(`perform:${step.name}`, async (): Promise<StepOutcome> => {
        try {
          const o = await producer.perform(step, ctx);
          if (o.kind !== "produced") return o;
          // An output is stored and hashed as plain JSON; one that is not is the producer's defect.
          const p = parseAt(`output of ${step.name}`, eventDataSchema, o.output);
          return p.ok ? { ...o, output: p.value } : { kind: "fatal", code: "invalid", message: p.error.message };
        } catch (e) {
          return { kind: "fatal", code: e instanceof AppError ? e.code : "internal", message: e instanceof Error ? e.message : String(e) };
        }
      });
      // A lost heartbeat does not discard what was made: the booking's fence decides.
      if (lost !== undefined && !(lost instanceof AppError)) throw lost;

      const booked = fx.tx(`book:${step.name}`, (t): { ended: boolean; streak: number; job: Job } => {
        assertFence(t, lane, fence);
        const { job: cur } = loadJob(t, jobId);
        const b = book(cur, step, outcome, t.at, limit);
        if (b.output !== undefined) {
          t.run("INSERT INTO job_outputs (job_id, step, output, fence, at) VALUES (?, ?, ?, ?, ?)", jobId, step.name, canonical(b.output), fence, t.at);
        }
        putJob(t, b.job);
        const data = outcome.kind === "produced" ? { step: step.name } : { step: step.name, kind: outcome.kind, message: outcome.message, failStreak: b.job.failStreak };
        jobEvent(t, actor, b.job, outcome.kind === "produced" ? "job.step-done" : "job.step-failed", data, b.cost);
        if (b.ended !== undefined) {
          jobEvent(t, actor, b.job, outcome.kind === "money-stop" ? "job.stopped" : "job.failed", { code: b.job.error?.code ?? "internal", message: b.job.error?.message ?? "" });
          releaseIn(t, lane, fence);
        }
        return { ended: b.ended !== undefined, streak: b.job.failStreak, job: b.job };
      });
      if (!booked.ok) return booked;
      if (booked.value.ended) return ok({ outcome: "failed", job: booked.value.job });
      if (outcome.kind === "vendor-failure") await sleep(backoff(booked.value.streak));
    }
  } finally {
    clearInterval(beat);
  }
}

/**
 * The recovery sweep (v1 turns' orphan sweep, MV's first-start recovery): every
 * running job whose holder is provably gone becomes `interrupted`, naming the
 * holder and the step in flight. Gone means its lane fence no longer holds
 * (released, taken over, or past its TTL) or its holder is a dead process on
 * this host. A holder on another host inside its TTL is alive as far as
 * anyone here can know, and its job is left alone. Nothing is resumed.
 */
export function recover(fx: Effects, opts: { holder?: Holder; alive?: Alive; spendClasses?: readonly SpendClass[] } = {}): Result<Job[]> {
  const me = opts.holder ?? processHolder();
  const alive = opts.alive ?? pidAlive;
  return fx.tx("recover", (t) => {
    const out: Job[] = [];
    for (const r of t.all("SELECT id FROM jobs WHERE state = 'running' ORDER BY n")) {
      const { job } = loadJob(t, String(r["id"]));
      const lease = job.lease;
      if (lease === undefined) throw new AppError("internal", `job ${job.id} is running without a lease`);
      const loss = fenceLoss(snapshotOf(t, job.lane).row, lease.fence, Date.parse(t.at));
      const why = loss ?? (gone(lease.holder, me, alive) ? "holder-gone" : undefined);
      if (why === undefined) continue;
      out.push(interrupt(t, job, me, why));
      // The dead drive's holds: the vendor may have been paid, so they keep counting.
      for (const cls of opts.spendClasses ?? []) lapseOwner(t, cls, spendOwner(lease.holder));
    }
    return out;
  });
}
