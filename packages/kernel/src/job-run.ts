import { randomUUID } from "node:crypto";
import { parseAt } from "@gt/domain/door";
import { AppError, isAppError, ok, type Result } from "@gt/domain/errors";
import { eventDataSchema } from "@gt/domain/event";
import type { Holder, Job } from "@gt/domain/job";
import { laneSlots } from "@gt/domain/lane";
import { canonical } from "./canonical.ts";
import { DRY, kernelCall, withDryRun, type WouldCall } from "./dryrun.ts";
import type { Effects } from "./effects.ts";
import { BREAKER_LIMIT, book, claimed, failed, interrupted, move, next, started, stopped, type MissingStep, type Outputs, type Producer, type StepOutcome } from "./job-core.ts";
import { holdLaneIn, laneHold } from "./job-queue.ts";
import { settleAfter } from "./job-settle.ts";
import { jobEvent, loadJob, loadOutputs, putJob } from "./job.ts";
import { DEFAULT_TTL_S, fenceLoss, gone, type Alive } from "./lease-core.ts";
import { sleep as sleepMs } from "./sleep.ts";
import type { SpendClass } from "./spend/core.ts";
import { gateFacts } from "./parts/gates.ts";
import { releaseHeldIn } from "./records/write.ts";
import { lapseOwner } from "./spend/ledger.ts";
import { lapseOpen, stepMeter } from "./spend/meter.ts";
import { chargeOutcome, meterOf } from "./spend/projection.ts";
import { actorOf, assertFence, claimIn, heartbeatIn, pidAlive, processHolder, releaseIn, snapshotOf } from "./lease.ts";
import type { Reader, Tx } from "./store.ts";

// THE JOB DRIVER - the one place a job meets the world. It claims a SLOT of
// the job's lane through kernel/lease, then loops: decide (job-core `next`) and
// mark the step in flight in one transaction, perform it through `fx.call`,
// book the outcome in the next transaction. Every transaction presents the
// slot's fence (`assertFence`), so a driver that woke after a take-over writes
// nothing.
//
// Absorbed from v1's extract step machine (lib/foundry/extract/perform.ts
// `step`: one unit, ceiling first, then save) and the MV worker's lease
// (lib/sound/mv/queue.ts: "taken BEFORE crash recovery: recovery would
// otherwise requeue the job the other process is rendering"). Kept: the claim
// comes first, and the sweep it does in the same transaction can only touch
// running jobs on this slot holding an OLDER fence - provably not anyone's
// live work, because the slot is now ours.
//
// A LANE HAS SLOTS (decision 5): `<lane>#<i>`, LANE_CAPACITY of them, each a
// lease of its own; a claim takes the first free one. Two text turns share the
// seat; the one GPU still runs one thing.
//
// A LANE IS DECLARED, NEVER INFERRED (plan §3.1, v1 dojo_run's stack purity):
// a producer whose lane is not the job's is refused at the claim, before any
// lease is taken.
//
// A CRASH IS AN INTERRUPTION, AND AN OPERATOR LOOKS. Nothing here resumes an
// interrupted job; `recover` only names it, and job.ts `retry` is the
// operator's door. The step that was in flight is named in `interruption.stage`,
// and on a paid lane the lane HOLDS until `ackLane` (job-queue.ts).
//
// DRY IS THE JOB'S MODE, NOT THE CALLER'S PORT (G-dry). The driver's own calls
// (`health`, `perform:<step>`) are kernel calls and pass any dry port; the
// producer's vendor calls go through `ctx.fx`, which is the dry port unless
// the job was armed live. So a dry job runs end to end, books would-calls and
// finishes. A live job in a process that may only run dry is refused before
// anything is claimed (decision 4: GRAVITONE_DRY_ONLY, read by the caller).
//
// A THROW NEVER LEAVES A JOB RUNNING. A drive that dies by an exception (not a
// process death) records it: `failed` with the error while its fence holds,
// `interrupted` when the fence was lost - in which case its outcome is as
// unknown as a crash's. Only a throw that is not an Error passes untouched:
// that is the crash harness ending the process, which no real code can catch.
// The one exception is a store that refuses the recording write as well: the
// job stays running until recovery, and the returned error says so.
//
// THE DEADLINE ADMITS, IT DOES NOT BOUND (job-coordination:
// no-wall-clock-in-the-advance-contract). It is checked between steps only; a
// step admitted before it runs to its own end, and the producer, which owns
// the call, is told the deadline to bound it. A drive that reaches it yields:
// the job goes back to the queue (running -> paused -> queued, one
// transaction) and the slot is released, so the next drive claims it fresh,
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
  /** Slot heartbeat cadence; default a third of the TTL (job-coordination: lease-renewal). */
  readonly heartbeatMs?: number;
  /** `dryOnlyFrom(env)`: this process may not run a live job. */
  readonly dryOnly?: boolean;
  /** The producers' preflights, by job (the worker's map): a part whose act waits on a human act
   *  stays planned at the release instead of being released into a certain failure (L45). */
  readonly preflightOf?: (job: Job, r: Reader) => string | undefined;
  /** The classes whose holds a dead drive leaves behind: lapsed when this drive interrupts an orphan (take-over, fence loss), as `recover` does. */
  readonly spendClasses?: readonly SpendClass[];
};

export type RunReport = {
  readonly outcome: "done" | "failed" | "stopped" | "yielded" | "busy" | "held" | "not-queued" | "unhealthy";
  readonly job?: Job;
  readonly reason?: string;
  /** What a dry drive would have called, in order: the receipts a dry launch shows. */
  readonly wouldCalls?: readonly WouldCall[];
  /** The producer's `settle` threw: its sentence. The job's ending stands regardless. */
  readonly settle?: { readonly ok: false; readonly message: string };
};

/** Exponential with full jitter on its upper half, capped (retry-backoff: backoff-design). */
export const defaultBackoff = (streak: number, random: () => number = Math.random): number =>
  Math.min(30_000, 1000 * 2 ** Math.max(0, streak - 1)) * (0.5 + random() / 2);

/** The spend owner of a drive: one process incarnation, so a reused pid is a different owner. */
export const spendOwner = (h: Holder): string => `${h.host}/${h.pid}/${h.bootId}`;

/** Interrupt one orphaned running job, naming its holder and the step in flight; a paid lane holds. */
function interrupt(t: Tx, job: Job, by: Holder, why: string, classes: readonly SpendClass[] = []): Job {
  const holder = job.lease?.holder ?? by;
  // The dead drive's holds: the vendor may have been paid, so they keep counting (job-core.ts: every dead drive).
  for (const cls of classes) lapseOwner(t, cls, spendOwner(holder));
  // The record is re-projected from the meter: a step that settled and then
  // died before its booking still shows its spend on the interrupted job.
  const out = { ...interrupted(job, holder, t.at), spend: meterOf(t, job.id) };
  putJob(t, out);
  jobEvent(t, actorOf(by), out, "job.interrupted", { why, holder: { bootId: holder.bootId, pid: holder.pid, host: holder.host }, ...(out.interruption?.stage === undefined ? {} : { stage: out.interruption.stage }) });
  holdLaneIn(t, out, actorOf(by));
  return out;
}

/** The running jobs recorded on one slot of a lane. */
function runningOn(t: Tx, lane: string, slot: string): Job[] {
  return t
    .all("SELECT id FROM jobs WHERE state = 'running' AND lane = ? ORDER BY n", lane)
    .map((r) => loadJob(t, String(r["id"])).job)
    .filter((j) => j.slot === slot);
}

type Claim = { kind: "granted"; fence: number; slot: string; job: Job } | { kind: "report"; report: RunReport };

/**
 * Drive one job (see `drive`), then tell its producer how it ended (job-settle.ts). The hook
 * runs HERE, in the one driver, so the CLI, a route and the worker cannot disagree on whether a
 * kernel stop reached the producer's own store.
 */
export async function runJob(fx: Effects, producer: Producer, jobId: string, opts: RunOptions = {}): Promise<Result<RunReport>> {
  return settleAfter(fx, producer, jobId, await drive(fx, producer, jobId, opts), actorOf(opts.holder ?? processHolder()));
}

async function drive(fx: Effects, producer: Producer, jobId: string, opts: RunOptions): Promise<Result<RunReport>> {
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
    // The job is read first because health is the JOB's question, not the lane's: a dry job's
    // vendor is its stand-in, so a live vendor that is down must not hold it (L44: dry mv and
    // Suno jobs sat queued forever behind a closed studio browser). The claim re-reads it.
    const seen = fx.tx("health:job", (t) => loadJob(t, jobId).job);
    if (!seen.ok) return seen;
    const h = await fx.call("health", kernelCall(() => check(seen.value)));
    if (!h.ok) return ok({ outcome: "unhealthy", reason: h.reason });
  }

  const claim = fx.tx("claim", (t): Claim => {
    const { job } = loadJob(t, jobId);
    if (job.lane !== producer.lane) throw new AppError("refused", `job ${job.id} is declared on ${job.lane}; a ${producer.lane} producer may not run it`);
    if (job.state !== "queued") return { kind: "report", report: { outcome: "not-queued", job } };
    if (job.mode.kind === "live" && opts.dryOnly === true) throw new AppError("refused", `job ${job.id} is armed live and this process may only run dry (GRAVITONE_DRY_ONLY=1); nothing was claimed`, { detail: "dry-only" });
    const held = laneHold(t, job.lane);
    if (held !== undefined) return { kind: "report", report: { outcome: "held", job, reason: `${job.lane} is held by job ${held.jobId}${held.stage === undefined ? "" : ` at ${held.stage}`}: credits may be spent - look first` } };
    const ticket = opts.ticket ?? randomUUID();
    const holders: string[] = [];
    for (const slot of laneSlots(job.lane)) {
      const c = claimIn(t, { resource: slot, holder, ticket, ttlS, wait: false }, alive);
      if (c.kind !== "granted") {
        if (c.holder !== undefined) holders.push(`${c.holder.host}/${c.holder.pid}`);
        continue;
      }
      let heldNow = false;
      for (const orphan of runningOn(t, job.lane, slot)) {
        if ((orphan.lease?.fence ?? 0) < c.lease.fence) heldNow = interrupt(t, orphan, holder, "lane-taken-over", opts.spendClasses).state === "interrupted" && laneHold(t, job.lane) !== undefined;
      }
      if (heldNow) {
        // The take-over found a paid step that died unbooked: the lane holds, and this claim gives the slot back.
        releaseIn(t, slot, c.lease.fence);
        return { kind: "report", report: { outcome: "held", job, reason: `${job.lane} is held: a job on ${slot} was found interrupted - look first` } };
      }
      const run = claimed(job, c.lease, slot);
      putJob(t, run);
      jobEvent(t, actor, run, "job.claimed", { fence: c.lease.fence, slot });
      return { kind: "granted", fence: c.lease.fence, slot, job: run };
    }
    return { kind: "report", report: { outcome: "busy", job, ...(holders.length === 0 ? {} : { reason: `every ${job.lane} slot is held (${holders.join(", ")})` }) } };
  });
  if (!claim.ok) return claim;
  if (claim.value.kind === "report") return ok(claim.value.report);
  const { fence, slot } = claim.value;
  const mode = claim.value.job.mode;
  const port = withDryRun(fx, mode.kind === "live" ? mode : DRY, actor);
  const withCalls = (r: RunReport): RunReport => (port.wouldCalls.length === 0 ? r : { ...r, wouldCalls: [...port.wouldCalls] });

  // The heartbeat runs on a timer, never per unit: the unit that takes an hour
  // is exactly when the lease matters. A heartbeat that fails is carried to the
  // loop, which stops at its next boundary; a throw (a crash) is carried too.
  let lost: unknown;
  const beat = setInterval(() => {
    try {
      const r = fx.tx("heartbeat", (t) => void heartbeatIn(t, slot, fence));
      // A store busy past its timeout misses THIS beat; the next renews (lease-renewal: ttl/3 exists so that
      // one missed renewal does not forfeit a live lease). Any other failure is carried; fenced writes
      // still refuse if the lease did lapse.
      if (!r.ok && r.error.code !== "unavailable") lost = r.error;
    } catch (e) {
      lost = e;
    }
  }, opts.heartbeatMs ?? Math.max(1000, Math.floor((ttlS * 1000) / 3)));
  // The heartbeat never keeps a process alive on its own: a process with nothing else to do has stopped working.
  beat.unref();
  // Read through a function: the timer writes `lost`, which flow analysis cannot see.
  const lostNow = (): unknown => lost;

  /** A drive that ended in an error: the job leaves `running` before the error is returned. */
  const settleError = (e: AppError): Result<RunReport> => {
    const r = fx.tx("abandon", (t): Job | undefined => {
      const { job } = loadJob(t, jobId);
      if (job.state !== "running" || job.lease?.fence !== fence || job.slot !== slot) return undefined;
      const loss = fenceLoss(snapshotOf(t, slot).row, fence, Date.parse(t.at));
      if (loss !== undefined) return interrupt(t, job, holder, `fence-lost: ${loss}`, opts.spendClasses);
      const out = failed(job, e.code, e.message);
      putJob(t, out);
      jobEvent(t, actor, out, "job.failed", { code: e.code, message: e.message });
      releaseIn(t, slot, fence);
      return out;
    });
    // The one way a throw DOES leave a job running: the store refused the write that would have
    // ended it. Said with both sentences, so the caller does not read the job as failed; recovery
    // names it once the slot's fence lapses.
    if (!r.ok) return { ok: false, error: new AppError(e.code, `${e.message}; the job was left running - recording its end failed too: ${r.error.message}`, { cause: r.error, ...(e.detail === undefined ? {} : { detail: e.detail }) }) };
    return { ok: false, error: e };
  };

  try {
    for (;;) {
      const gone_ = lostNow();
      if (gone_ !== undefined) {
        if (isAppError(gone_)) return settleError(gone_);
        throw gone_;
      }
      if (opts.deadlineMs !== undefined && now() >= opts.deadlineMs) {
        return fx.tx("yield", (t): RunReport => {
          assertFence(t, slot, fence);
          const { job } = loadJob(t, jobId);
          releaseIn(t, slot, fence);
          if (job.state !== "running") return withCalls({ outcome: "stopped", job });
          const back = move(move(job, "paused"), "queued");
          putJob(t, back);
          jobEvent(t, actor, back, "job.yielded", { fence });
          return withCalls({ outcome: "yielded", job: back });
        });
      }

      const decided = fx.tx("next", (t): { kind: "perform"; step: MissingStep; job: Job; outputs: Outputs } | { kind: "end"; report: RunReport } => {
        assertFence(t, slot, fence);
        const { job, terms } = loadJob(t, jobId);
        const outputs = loadOutputs(t, jobId);
        const missing = producer.plan(job, outputs);
        const d = next(job, { missing, breakerLimit: limit, ...terms });
        const finish = (j: Job, type: string, outcome: RunReport["outcome"], data: Record<string, unknown> = {}): { kind: "end"; report: RunReport } => {
          putJob(t, j);
          jobEvent(t, actor, j, type, data);
          releaseIn(t, slot, fence);
          return { kind: "end", report: withCalls({ outcome, job: j }) };
        };
        switch (d.kind) {
          case "perform": {
            heartbeatIn(t, slot, fence);
            const flying = started(job, d.step.name, outputs.size, outputs.size + missing.length, t.at);
            putJob(t, flying);
            jobEvent(t, actor, flying, "job.step-started", { step: d.step.name, estimateUsd: d.step.estimate.usd });
            return { kind: "perform", step: d.step, job: flying, outputs };
          }
          case "stop":
            return finish(stopped(job, d, t.at), "job.stopped", "failed", { by: "run-ceiling", step: d.step, ceilingUsd: d.ceilingUsd, spentUsd: job.spend.usd });
          case "trip":
            return finish(failed(job, "unavailable", d.message), "job.failed", "failed", { code: "unavailable", message: d.message });
          case "finish": {
            const end = finish(move(job, "done"), "job.done", "done", { spendUsd: job.spend.usd, ...(port.wouldCalls.length === 0 ? {} : { wouldCalls: port.wouldCalls.length }) });
            // A part's job done is its part ratified: what waited for it is released in this same
            // transaction (records/write.ts `releaseHeldIn`), so no crash can leave it parked.
            // Only a part a plan launched (it names its project) - a bare part job has no plan to move.
            const projectId = job.of.kind === "part" ? job.correlation?.projectId : undefined;
            const pre = opts.preflightOf;
            if (projectId !== undefined) releaseHeldIn(t, projectId, actor, { ...gateFacts(Date.parse(t.at)), ...(pre === undefined ? {} : { preflightOf: pre }) });
            return end;
          }
          case "claim":
          case "idle":
            releaseIn(t, slot, fence);
            // An operator's pause then resume during the step leaves the job queued: it ends nothing and
            // will run again, so it is a yield (settle is told only real endings, job-settle.ts).
            return { kind: "end", report: withCalls({ outcome: job.state === "queued" ? "yielded" : "stopped", job }) };
        }
      });
      if (!decided.ok) return settleError(decided.error);
      if (decided.value.kind === "end") return ok(decided.value.report);
      const { step, job, outputs } = decided.value;
      const owner = spendOwner(holder);
      const meter = stepMeter(port.effects, job, step.name, owner);
      const ctx = { job, outputs, key: `${jobId}/${step.name}`, owner, deadlineMs: opts.deadlineMs ?? Number.POSITIVE_INFINITY, fx: port.effects, meter };
      // The try is INSIDE the call: a producer's throw becomes its outcome, and
      // anything the effect port itself throws (a crash) passes through untouched.
      const outcome = await fx.call(
        `perform:${step.name}`,
        kernelCall(async (): Promise<StepOutcome> => {
          try {
            const o = await producer.perform(step, ctx);
            if (o.kind !== "produced") return o;
            // An output is stored and hashed as plain JSON; one that is not is the producer's defect.
            const p = parseAt(`output of ${step.name}`, eventDataSchema, o.output);
            return p.ok ? { ...o, output: p.value } : { kind: "fatal", code: "invalid", message: p.error.message };
          } catch (e) {
            // A process death is not a producer's outcome (the crash harness's sentinel is not an Error).
            if (!(e instanceof Error)) throw e;
            return { kind: "fatal", code: isAppError(e) ? e.code : "internal", message: e.message };
          }
        }),
      );
      // A lost heartbeat does not discard what was made: the booking's fence decides.
      const dead = lostNow();
      if (dead !== undefined && !isAppError(dead)) throw dead;

      const booked = fx.tx(`book:${step.name}`, (t): { ended: boolean; streak: number; job: Job } => {
        assertFence(t, slot, fence);
        const { job: cur } = loadJob(t, jobId);
        lapseOpen(t, meter.open());
        // A producer that metered its own calls is the meter's already; one that did not is booked for here.
        if (!meter.used() && cur.mode.kind === "live") chargeOutcome(t, cur, step, outcome, owner);
        const b = book(cur, step, outcome, t.at, limit, meterOf(t, jobId));
        if (b.output !== undefined) {
          t.run("INSERT INTO job_outputs (job_id, step, output, fence, at) VALUES (?, ?, ?, ?, ?)", jobId, step.name, canonical(b.output), fence, t.at);
        }
        putJob(t, b.job);
        const data = outcome.kind === "produced" ? { step: step.name } : { step: step.name, kind: outcome.kind, message: outcome.message, failStreak: b.job.failStreak, ...(b.job.stop === undefined ? {} : { by: b.job.stop.by }) };
        jobEvent(t, actor, b.job, outcome.kind === "produced" ? "job.step-done" : "job.step-failed", data, b.cost);
        if (b.ended !== undefined) {
          jobEvent(t, actor, b.job, outcome.kind === "money-stop" ? "job.stopped" : "job.failed", { code: b.job.error?.code ?? "internal", message: b.job.error?.message ?? "", ...(b.job.stop === undefined ? {} : { by: b.job.stop.by }) });
          releaseIn(t, slot, fence);
        }
        return { ended: b.ended !== undefined, streak: b.job.failStreak, job: b.job };
      });
      if (!booked.ok) return settleError(booked.error);
      if (booked.value.ended) return ok(withCalls({ outcome: "failed", job: booked.value.job }));
      if (outcome.kind === "vendor-failure") await sleep(backoff(booked.value.streak));
    }
  } catch (e) {
    // A process death (the crash harness's sentinel) is not an Error and is not ours to record.
    if (!(e instanceof Error)) throw e;
    return settleError(isAppError(e) ? e : new AppError("internal", e.message, { cause: e }));
  } finally {
    clearInterval(beat);
  }
}

/**
 * The recovery sweep (v1 turns' orphan sweep, MV's first-start recovery): every
 * running job whose holder is provably gone becomes `interrupted`, naming the
 * holder and the step in flight. Gone means its slot fence no longer holds
 * (released, taken over, or past its TTL) or its holder is a dead process on
 * this host. A holder on another host inside its TTL is alive as far as
 * anyone here can know, and its job is left alone. Nothing is resumed; a paid
 * lane holds.
 */
export function recover(fx: Effects, opts: { holder?: Holder; alive?: Alive; spendClasses?: readonly SpendClass[] } = {}): Result<Job[]> {
  const me = opts.holder ?? processHolder();
  const alive = opts.alive ?? pidAlive;
  return fx.tx("recover", (t) => {
    const out: Job[] = [];
    for (const r of t.all("SELECT id FROM jobs WHERE state = 'running' ORDER BY n")) {
      const { job } = loadJob(t, String(r["id"]));
      const lease = job.lease;
      if (lease === undefined || job.slot === undefined) throw new AppError("internal", `job ${job.id} is running without a lease`);
      const loss = fenceLoss(snapshotOf(t, job.slot).row, lease.fence, Date.parse(t.at));
      const why = loss ?? (gone(lease.holder, me, alive) ? "holder-gone" : undefined);
      if (why === undefined) continue;
      out.push(interrupt(t, job, me, why, opts.spendClasses));
    }
    return out;
  });
}
