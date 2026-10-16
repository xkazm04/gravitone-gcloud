import { parseJsonAt } from "@gt/domain/door";
import { AppError, err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { jobSchema, type Job, type JobState, type RunMode } from "@gt/domain/job";
import type { ResourceLane } from "@gt/domain/lane";
import type { StepContext } from "@gt/kernel/job-core";
import { enqueueIn } from "@gt/kernel/job";
import { assertFence } from "@gt/kernel/lease";
import { planWrites } from "@gt/kernel/parts/core";
import { readPartIn, writePartIn, type PartSnapshot } from "@gt/kernel/parts/driver";
import type { Reader, Store } from "@gt/kernel/store";
import { askOf, partJobId, type ActAsk } from "./partAct.ts";

// A PART ACT'S JOB IN THE STORE - the three kernel acts every studio step producer shares,
// beside the definition (./partAct.ts) because none of them reads lib/: enqueue an act on its
// receipt's confirm, land a job's outputs into the part's records, read what a part has running.
//
// v1 kept a part's jobs in localStorage (`gravitone.jobs.v1`, lib/jobs.tsx) with no cost and no
// owner, and serialised four kinds per TAB. Here the job row is the record, the lane slot is the
// serialisation (decision 5), and one confirm per receipt is one job: a second confirm of the
// same receipt finds the job it already made (enqueue idempotency, v1 mv's per-track rule).

/** A job of a part not yet ended: what a view's `running` lists and what a second confirm adopts. */
const LIVE_STATES: ReadonlySet<JobState> = new Set<JobState>(["planned", "queued", "running", "paused", "interrupted"]);

function jobsOf(r: Reader, partId: string): Job[] {
  const out: Job[] = [];
  for (const row of r.all("SELECT record FROM jobs WHERE id = ? OR id LIKE ? ORDER BY n", `job:part:${partId}`, `job:part:${partId}:%`)) {
    const p = parseJsonAt("job record", jobSchema, String(row["record"]));
    if (!p.ok) throw p.error;
    if (p.value.of.kind === "part" && p.value.of.id === partId) out.push(p.value);
  }
  return out;
}

export type RunningAct = { readonly jobId: string; readonly act: string | null; readonly state: JobState; readonly stage?: string; readonly target?: string };

/** The part's jobs that have not ended, oldest first, with the act each serves. */
export function runningActs(r: Reader, partId: string): RunningAct[] {
  return jobsOf(r, partId)
    .filter((j) => LIVE_STATES.has(j.state))
    .map((j) => {
      const a = askOf(j);
      const ask = a.ok ? a.value : { partId, act: null };
      return { jobId: j.id, act: ask.act, state: j.state, ...(j.progress.stage === undefined ? {} : { stage: j.progress.stage }), ...(ask.target === undefined ? {} : { target: ask.target }) };
    });
}

export type ActLaunch = {
  readonly ask: ActAsk & { readonly act: string };
  readonly projectId: string;
  /** The `@gt/producers` name the part kind runs under (catalog PART_OPTIONS). */
  readonly producer: string;
  readonly lane: ResourceLane;
  readonly mode: RunMode;
  readonly ceilingUsd?: number;
};

/**
 * Enqueue one act's job inside the caller's transaction (the confirm that checked the receipt's
 * token). The same act on the same unit (target) while a job of it is still live is THAT job - a
 * double click is one purchase, at any rev. One that ended at this rev (a landing that changed
 * nothing, a failure the operator chose not to retry) is launched again as `~n`.
 */
export function enqueueActIn(t: Parameters<typeof enqueueIn>[0], l: ActLaunch, actor: Actor): { jobId: string; adopted: boolean } {
  const base = partJobId({ ...l.ask, n: 1 });
  const mine = jobsOf(t, l.ask.partId);
  const prior = mine.filter((j) => j.id === base || j.id.startsWith(`${base}~`));
  // Single-flight per act and unit, whatever rev it was priced at (v1 useCueTakes: a second
  // click on a cue joins the request in flight instead of billing a second take).
  const live = mine.find((j) => {
    const a = askOf(j);
    return LIVE_STATES.has(j.state) && a.ok && a.value.act === l.ask.act && a.value.target === l.ask.target;
  });
  if (live !== undefined) return { jobId: live.id, adopted: true };
  const id = partJobId({ ...l.ask, n: prior.length + 1 });
  enqueueIn(
    t,
    {
      id,
      of: { kind: "part", id: l.ask.partId },
      producer: l.producer,
      lane: l.lane,
      mode: l.mode,
      ...(l.ceilingUsd === undefined ? {} : { ceilingUsd: l.ceilingUsd }),
      correlation: { projectId: l.projectId },
    },
    actor,
  );
  return { jobId: id, adopted: false };
}

export function enqueueAct(store: Store, l: ActLaunch, actor: Actor): Result<{ jobId: string; adopted: boolean }> {
  return store.tx((t) => enqueueActIn(t, l, actor));
}

/** The project a part job serves: its correlation, else the part id's prefix. */
export function projectOf(job: Job): string {
  const p = job.correlation?.projectId;
  if (p !== undefined) return p;
  const i = job.of.id.lastIndexOf("/");
  if (i <= 0) throw new AppError("invalid", `job ${job.id}: part ${job.of.id} names no project`);
  return job.of.id.slice(0, i);
}

/** The part this job serves, read in a store snapshot (a plan step's view of its records). */
export function partSnapshot(ctx: StepContext): Result<PartSnapshot> {
  return ctx.fx.tx("part.read", (t) => readPartIn(t, { projectId: projectOf(ctx.job), partId: ctx.job.of.id }));
}

export type Landed = { readonly rev: number; readonly unchanged: boolean };

/**
 * Land a job's outputs in the part's records: ONE transaction that first presents the job's slot
 * fence (a driver that was taken over writes nothing here either - the mv producer's artefact
 * fence), then writes as the job (`land`, by the job id, never undone by an operator's ⌫).
 * Outputs that equal what the records already hold land as `unchanged` - a dry re-run is a
 * success that moved nothing, not the kernel's "changes nothing" refusal.
 */
export function landPart(ctx: StepContext, label: string, next: (s: PartSnapshot) => Result<Readonly<Record<string, unknown>>>): Result<Landed> {
  const slot = ctx.job.slot;
  const fence = ctx.job.lease?.fence;
  if (slot === undefined || fence === undefined) return err("internal", `job ${ctx.job.id} lands without a lease`);
  const r = ctx.fx.tx("part.land", (t): Result<Landed> => {
    assertFence(t, slot, fence);
    const at = { projectId: projectOf(ctx.job), partId: ctx.job.of.id };
    const s = readPartIn(t, at);
    const n = next(s);
    if (!n.ok) return n;
    const writes = planWrites(s.kind, s.records, n.value);
    if (!writes.ok) return writes;
    if (writes.value.length === 0) return ok({ rev: s.rev, unchanged: true });
    const w = writePartIn(t, { ...at, baseRev: "current", act: "land", op: { job: ctx.job.id, label }, label, by: { kind: "machine", id: ctx.job.id }, next: () => n });
    if (!w.ok) return w;
    return w.value.kind === "applied" ? ok({ rev: w.value.rev, unchanged: false }) : err("internal", `${label}: a landing at the current rev met a conflict`);
  });
  return r.ok ? r.value : r;
}
