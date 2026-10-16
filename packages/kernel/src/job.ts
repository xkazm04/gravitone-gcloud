import { z } from "zod";
import { parseAt, parseJsonAt } from "@gt/domain/door";
import { AppError, type AppErrorCode, type Result } from "@gt/domain/errors";
import { eventDataSchema, type Actor } from "@gt/domain/event";
import { jobIdSchema, type JobId } from "@gt/domain/ids";
import { jobSchema, runModeSchema, steerSchema, type Job, type JobState, type Steer } from "@gt/domain/job";
import { resourceLaneSchema, type ResourceLane } from "@gt/domain/lane";
import { canonical } from "./canonical.ts";
import { append } from "./events.ts";
import { failed, move, retried, type Output } from "./job-core.ts";
import type { ModuleMigrations } from "./migrate.ts";
import type { RouteOutcome, Steer as RouterSteer } from "./router/types.ts";
import type { Reader, Store, Tx } from "./store.ts";

// THE JOB STORE AND ITS OPERATOR ACTS - the durable record, and every move a
// person makes on it, each one transition through `jobMachine` plus its Event
// in one transaction (job-coordination: the record is the job; the process is
// its executor). The driver that runs a job is job-run.ts.
//
// ENQUEUE NEVER SPENDS (v1 Suno and MV: queueing a track never starts it). It
// writes a record and an event and returns; nothing here can reach a producer.
//
// RETRY IS AN OPERATOR'S ACT. `interrupted` is an unknown outcome - the vendor
// may have been paid for the step in flight - so only an actor of kind
// `operator` may send it, or a `failed` job, back to the queue. v1 expressed
// this by switching a whole queue off (MV `queue.interrupted`); here one job
// carries it and its lane's neighbours keep running.
//
// THE CEILING TRAVELS WITH THE JOB (job-coordination: terms-travel-permission-
// does-not): frozen at enqueue, raised only by the operator's retry - never
// read from a setting that may change while the queue drains.

export const jobMigrations: ModuleMigrations = {
  module: "job",
  steps: [
    {
      version: 1,
      sql: `
CREATE TABLE jobs (
  n INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  lane TEXT NOT NULL,
  state TEXT NOT NULL,
  ceiling_usd REAL CHECK (ceiling_usd IS NULL OR ceiling_usd > 0),
  record TEXT NOT NULL
);
CREATE INDEX jobs_lane_state ON jobs (lane, state);
CREATE INDEX jobs_state ON jobs (state);
CREATE TABLE job_outputs (
  job_id TEXT NOT NULL REFERENCES jobs (id),
  step TEXT NOT NULL,
  output TEXT NOT NULL,
  fence INTEGER NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY (job_id, step)
) WITHOUT ROWID;`,
    },
    {
      // Phase 4 (L25): the operator's queue order, and the paid-lane holds a
      // crash leaves (job-queue.ts). `ord` is REAL so a move never renumbers a
      // lane; existing rows keep enqueue order. A hold is its own row, not a
      // job state: the job it names is retried and finishes while the lane it
      // crashed on stays held until an operator says they looked.
      version: 2,
      sql: `
ALTER TABLE jobs ADD COLUMN ord REAL;
UPDATE jobs SET ord = n;
CREATE INDEX jobs_lane_queue ON jobs (lane, state, ord, n);
CREATE TABLE lane_holds (
  lane TEXT NOT NULL,
  job_id TEXT NOT NULL REFERENCES jobs (id),
  stage TEXT,
  at TEXT NOT NULL,
  PRIMARY KEY (lane, job_id)
) WITHOUT ROWID;`,
    },
  ],
};

/** v1 extract MAX_CEILING_USD. Refused above, not clamped: a typo is not a wish. */
export const MAX_CEILING_USD = 10_000;
const ceilingSchema = z.number().positive().max(MAX_CEILING_USD);

/**
 * The money terms a job travels with. Since Phase 4 the ceiling is on the
 * record (`Job.ceilingUsd`); the `ceiling_usd` column is kept as a query copy,
 * written from the record on every put, never read as the truth.
 */
export type JobTerms = { readonly ceilingUsd?: number };

function must<T>(r: Result<T>): T {
  if (!r.ok) throw r.error;
  return r.value;
}

const termsOf = (job: Job): JobTerms => (job.ceilingUsd === undefined ? {} : { ceilingUsd: job.ceilingUsd });

export function loadJob(r: Reader, id: string): { job: Job; terms: JobTerms } {
  const raw = r.get("SELECT record FROM jobs WHERE id = ?", id);
  if (raw === undefined) throw new AppError("not-found", `no job ${id}`);
  const job = must(parseJsonAt("job record", jobSchema, String(raw["record"])));
  return { job, terms: termsOf(job) };
}

/** Write the record back. The record is re-validated: a write cannot store a Job the door would refuse. */
export function putJob(t: Tx, job: Job): void {
  const valid = must(parseAt("job", jobSchema, job));
  const changed = t.run("UPDATE jobs SET state = ?, record = ?, ceiling_usd = ? WHERE id = ?", valid.state, canonical(valid), valid.ceilingUsd ?? null, valid.id).changes;
  if (changed !== 1) throw new AppError("not-found", `no job ${valid.id}`);
}

/** The correlation keys every job event carries, so events.project_id/run_id fill. */
export function correlationData(job: Job): Record<string, string> {
  const c = job.correlation;
  const run = c?.runId ?? (job.of.kind === "run" ? job.of.id : undefined);
  return { ...(c?.projectId === undefined ? {} : { projectId: c.projectId }), ...(run === undefined ? {} : { runId: run }) };
}

export function jobEvent(t: Tx, actor: Actor, job: Job, type: string, data: Record<string, unknown> = {}, cost?: { usd: number; src: "real" | "model" }): void {
  append(t, {
    actor,
    type,
    subject: { kind: "job", id: job.id },
    lane: job.lane,
    ...(cost === undefined ? {} : { cost }),
    data: { state: job.state, attempt: job.attempt, ...correlationData(job), ...data },
  });
}

const outputRow = z.object({ step: z.string(), output: z.string(), at: z.string() });

export function loadOutputs(r: Reader, id: string): Map<string, Output> {
  const out = new Map<string, Output>();
  for (const raw of r.all("SELECT step, output, at FROM job_outputs WHERE job_id = ? ORDER BY at, step", id)) {
    const row = must(parseAt("job output row", outputRow, raw));
    out.set(row.step, { step: row.step, value: must(parseJsonAt("job output", eventDataSchema, row.output)), at: row.at });
  }
  return out;
}

/* ── The operator's acts ──────────────────────────────────────────────────── */

const enqueueSchema = z.object({
  id: jobIdSchema,
  of: z.discriminatedUnion("kind", [z.object({ kind: z.literal("part"), id: z.string().min(1) }), z.object({ kind: z.literal("run"), id: z.string().min(1) })]),
  /** Who makes it: the worker's producer table is keyed by this name. */
  producer: z.string().min(1),
  lane: resourceLaneSchema,
  ceilingUsd: ceilingSchema.optional(),
  /** `planned` waits on upstream work (a Part behind its dependencies) and is never claimed until `releaseIn`. Absent is queued. */
  state: z.enum(["queued", "planned"]).optional(),
  /** Absent is dry (plan §3.2): a job that never said it may spend does not. */
  mode: runModeSchema.optional(),
  /** Queue order within the lane; absent is the end of the lane. */
  order: z.number().finite().optional(),
  steer: steerSchema.optional(),
  correlation: z.object({ projectId: z.string().min(1).optional(), runId: z.string().min(1).optional() }).optional(),
});
export type EnqueueInput = z.input<typeof enqueueSchema>;

/** The end of a lane's queue: one past the largest order any of its jobs has. */
function endOfLane(t: Reader, lane: string): number {
  const v = t.get("SELECT max(ord) AS m FROM jobs WHERE lane = ?", lane)?.["m"];
  return typeof v === "number" ? Math.floor(v) + 1 : 1;
}

/**
 * Enqueue inside the CALLER'S transaction (L26: a Run or a Part and its Job
 * are written in one commit, so a launch never leaves a Run with no job or a
 * job serving nothing). `enqueue` is this in a transaction of its own.
 */
export function enqueueIn(t: Tx, input: EnqueueInput, actor: Actor): Job {
  const v = must(parseAt("enqueue", enqueueSchema, input));
  const correlation = v.correlation === undefined ? {} : { correlation: v.correlation };
  const job = must(
    parseAt("job", jobSchema, {
      id: v.id,
      of: v.of,
      producer: v.producer,
      lane: v.lane,
      state: v.state ?? "queued",
      mode: v.mode ?? { kind: "dry" },
      ...(v.ceilingUsd === undefined ? {} : { ceilingUsd: v.ceilingUsd }),
      ...(v.steer === undefined ? {} : { steer: v.steer }),
      ...correlation,
      attempt: 1,
      progress: { done: 0, total: 0 },
      spend: { usd: 0, unpriced: 0, basis: "reported" },
      failStreak: 0,
    }),
  );
  if (t.get("SELECT 1 AS x FROM jobs WHERE id = ?", job.id) !== undefined) throw new AppError("conflict", `job ${job.id} already exists`);
  const ord = v.order ?? endOfLane(t, job.lane);
  t.run("INSERT INTO jobs (id, lane, state, ceiling_usd, record, ord) VALUES (?, ?, ?, ?, ?, ?)", job.id, job.lane, job.state, job.ceilingUsd ?? null, canonical(job), ord);
  jobEvent(t, actor, job, "job.enqueued", {
    of: { kind: job.of.kind, id: job.of.id },
    producer: job.producer,
    mode: job.mode.kind,
    order: ord,
    ...(job.ceilingUsd === undefined ? {} : { ceilingUsd: job.ceilingUsd }),
  });
  return job;
}

export function enqueue(store: Store, input: EnqueueInput, actor: Actor): Result<Job> {
  return store.tx((t) => enqueueIn(t, input, actor));
}

/** What an imported job stands for: the work, done elsewhere, and how much of it. */
export type ImportedJobInput = Omit<EnqueueInput, "state" | "mode" | "order" | "ceilingUsd" | "steer"> & {
  /** The units the work came to (a done job's progress reads `units / units`, stage `imported`). */
  readonly units: number;
  /** How it ended where it ran: done, or failed with the sentence that place recorded. */
  readonly ending?: { readonly state: "done" } | { readonly state: "failed"; readonly code: AppErrorCode; readonly message: string };
  /** What the import says about where the work was done (v1's project id, ...), on the event. */
  readonly data?: Record<string, unknown>;
};

/**
 * A TERMINAL JOB FOR WORK DONE ELSEWHERE (L43; v1 projects and runs, plan §6 Phase 4 "Import"),
 * written THROUGH the machine, not around it. L42 enqueued `planned` and then stored the record as
 * `done` - a planned -> done edge the machine does not have, invisible because nothing asked it.
 * Here the record is enqueued `queued` and walked queued -> running -> done (or failed, as the
 * place it ran recorded) through the machine's own moves, so a
 * future change to the machine that closes that road refuses an import instead of silently
 * minting a state history no driver could have produced. Only the terminal record is stored (a
 * running record must hold a lease; an imported one never claimed a lane), and its one
 * `job.imported` event names the path walked. Nothing ran and nothing spent: spend is 0, booked
 * nowhere, and reconciles to an empty meter.
 */
export function recordImportedJobIn(t: Tx, input: ImportedJobInput, actor: Actor): Job {
  const units = must(parseAt("imported units", z.number().int().nonnegative(), input.units));
  const { units: _units, ending = { state: "done" }, data, ...enq } = input;
  const running = move(enqueueIn(t, { ...enq, state: "queued" }, actor), "running");
  const out: Job = ending.state === "done" ? { ...move(running, "done"), progress: { done: units, total: units, stage: "imported" } } : failed(running, ending.code, ending.message);
  putJob(t, out);
  jobEvent(t, actor, out, "job.imported", { imported: true, path: ["queued", "running", out.state], ...data });
  return out;
}

/**
 * A planned job's upstream is done: it joins its lane's line, at the place its
 * order already gives it (L26: a Part released when the parts before it
 * finish). Refused for any job not `planned` - releasing twice is a defect in
 * the caller's plan walk, not a no-op to hide.
 */
export function releaseIn(t: Tx, id: string, actor: Actor): Job {
  const { job } = loadJob(t, id);
  if (job.state !== "planned") throw new AppError("refused", `job ${id} is ${job.state}; only a planned job is released to the queue`);
  const out = move(job, "queued");
  putJob(t, out);
  jobEvent(t, actor, out, "job.released", { from: "planned" });
  return out;
}

export function release(store: Store, id: JobId, actor: Actor): Result<Job> {
  return store.tx((t) => releaseIn(t, id, actor));
}

export function get(store: Store, id: JobId): Result<{ job: Job; terms: JobTerms }> {
  return store.read((r) => loadJob(r, id));
}

/** Jobs in queue order (the operator's `ord`, then enqueue order), filtered by lane and/or state. */
export function list(store: Store, filter: { lane?: ResourceLane; state?: JobState } = {}): Result<Job[]> {
  return store.read((r) => {
    const where: string[] = [];
    const params: string[] = [];
    if (filter.lane !== undefined) {
      where.push("lane = ?");
      params.push(filter.lane);
    }
    if (filter.state !== undefined) {
      where.push("state = ?");
      params.push(filter.state);
    }
    const sql = `SELECT record FROM jobs${where.length === 0 ? "" : ` WHERE ${where.join(" AND ")}`} ORDER BY ord, n`;
    return r.all(sql, ...params).map((row) => must(parseJsonAt("job record", jobSchema, String(row["record"]))));
  });
}

function act(store: Store, id: JobId, actor: Actor, type: string, change: (job: Job) => { job: Job; data?: Record<string, unknown> }): Result<Job> {
  return store.tx((t) => {
    const cur = loadJob(t, id);
    const next = change(cur.job);
    putJob(t, next.job);
    jobEvent(t, actor, next.job, type, { from: cur.job.state, ...next.data });
    return next.job;
  });
}

/**
 * Stop between steps (v1 MV's Stop). A running job gives up its record's
 * lease at once; the driver finishes the step in flight, books it, sees the
 * pause and releases the lane - so the spend of that step is never lost.
 */
/** A planned job has not joined the line, so it has nothing to pause; the machine refuses it too. */
export const pause = (store: Store, id: JobId, actor: Actor): Result<Job> => act(store, id, actor, "job.paused", (j) => ({ job: move(j, "paused") }));

/** Only a paused job resumes: `planned -> queued` is the machine's too, but it is `release`, the upstream's act. */
export const resume = (store: Store, id: JobId, actor: Actor): Result<Job> =>
  act(store, id, actor, "job.resumed", (j) => {
    if (j.state !== "paused") throw new AppError("refused", `job ${id} is ${j.state}; only a paused job resumes`);
    return { job: move(j, "queued") };
  });

export const cancel = (store: Store, id: JobId, actor: Actor): Result<Job> => act(store, id, actor, "job.cancelled", (j) => ({ job: move(j, "cancelled") }));

/**
 * The operator's door out of `failed` and `interrupted`: the job goes back to
 * the queue holding every output it has (v1 MV `retryMv`), its attempt counted
 * and its breaker reset. A budget stop is retried with a raised ceiling.
 */
export function retry(store: Store, id: JobId, actor: Actor, opts: { ceilingUsd?: number } = {}): Result<Job> {
  return act(store, id, actor, "job.retried", (j) => {
    if (actor.kind !== "operator") throw new AppError("refused", `job ${id}: only an operator retries a ${j.state} job; ${actor.kind} ${actor.id} may not`);
    if (j.state !== "failed" && j.state !== "interrupted") throw new AppError("refused", `job ${id} is ${j.state}; only a failed or interrupted job is retried`);
    const raise = opts.ceilingUsd === undefined ? undefined : must(parseAt("retry ceiling", ceilingSchema, opts.ceilingUsd));
    const next = retried(j);
    if (raise === undefined) return { job: next };
    return { job: { ...next, ceilingUsd: raise }, data: { ceilingUsd: raise } };
  });
}

export type Rerouted = {
  readonly job: Job;
  /** The router's word for a preference it could not honour: reported, never silently applied. */
  readonly steerDropped?: string;
};

const choiceOf = (o: RouteOutcome): { provider: string; model: string } | null => (o.kind === "routed" ? { provider: o.choice.provider, model: o.choice.model } : null);

/** The record's steer as the router reads it: absent keys absent, never `undefined`. */
export function routerSteer(s: Steer | undefined): RouterSteer | undefined {
  if (s === undefined) return undefined;
  return { ...(s.pin === undefined ? {} : { pin: s.pin }), ...(s.prefer === undefined ? {} : { prefer: s.prefer }), ...(s.exclude === undefined ? {} : { exclude: s.exclude }) };
}

/**
 * The operator's re-route (Runs `r`, plan §8.7 steering): a new steer on the
 * record. THE ROUTER STAYS THE JUDGE - `judge` routes the job's own request
 * under a steer (the producer knows the request; the kernel knows no medium),
 * and a steer it refuses is refused here with its sentence, a preference it
 * drops is reported in `steerDropped` and on the event. A queued or paused job
 * keeps its place; a failed or interrupted one goes back to the queue as a
 * retry would (attempt++, operator only - prototype studio.js `reroute`).
 * Refused while running (the step in flight was routed already) or finished.
 */
export function reroute(store: Store, id: JobId, steer: RouterSteer, actor: Actor, judge: (steer: RouterSteer | undefined) => RouteOutcome): Result<Rerouted> {
  return store.tx((t) => rerouteIn(t, id, steer, actor, judge));
}

/** `reroute` inside the caller's transaction (records/reroute.ts moves the part or run row in the same one). */
export function rerouteIn(t: Tx, id: string, steer: RouterSteer, actor: Actor, judge: (steer: RouterSteer | undefined) => RouteOutcome): Rerouted {
  const { job } = loadJob(t, id);
  const s = must(parseAt("steer", steerSchema, steer));
  if (job.state === "running" || job.state === "done" || job.state === "cancelled") throw new AppError("refused", `job ${id} is ${job.state}; only a waiting, paused, failed or interrupted job is re-routed`);
  const requeue = job.state === "failed" || job.state === "interrupted";
  if (requeue && actor.kind !== "operator") throw new AppError("refused", `job ${id}: only an operator re-routes a ${job.state} job; ${actor.kind} ${actor.id} may not`);
  const before = judge(routerSteer(job.steer));
  const after = judge(routerSteer(s));
  if (after.kind === "refused") throw new AppError(after.code, `re-route of job ${id} refused by the router: ${after.message}`);
  const steered: Job = { ...(requeue ? retried(job) : job), steer: s };
  putJob(t, steered);
  const dropped = after.steerDropped;
  jobEvent(t, actor, steered, "job.rerouted", { from: job.state, was: choiceOf(before), now: choiceOf(after), steer: { ...s }, ...(dropped === undefined ? {} : { steerDropped: dropped }) });
  return dropped === undefined ? { job: steered } : { job: steered, steerDropped: dropped };
}
