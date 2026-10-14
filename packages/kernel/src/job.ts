import { z } from "zod";
import { parseAt, parseJsonAt } from "@gt/domain/door";
import { AppError, type Result } from "@gt/domain/errors";
import { eventDataSchema, type Actor } from "@gt/domain/event";
import { jobIdSchema, type JobId } from "@gt/domain/ids";
import { jobSchema, type Job, type JobState } from "@gt/domain/job";
import { resourceLaneSchema, type ResourceLane } from "@gt/domain/lane";
import { canonical } from "./canonical.ts";
import { append } from "./events.ts";
import { move, retried, type Output } from "./job-core.ts";
import type { ModuleMigrations } from "./migrate.ts";
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
  ],
};

/** v1 extract MAX_CEILING_USD. Refused above, not clamped: a typo is not a wish. */
export const MAX_CEILING_USD = 10_000;
const ceilingSchema = z.number().positive().max(MAX_CEILING_USD);

/**
 * TODO(director): `ceilingUsd` belongs on the domain `Job` record (plan §6
 * "per-job ceiling"); packages/domain/src/job.ts has no field for it, so the
 * kernel keeps it in its own column and returns it beside the record.
 */
export type JobTerms = { readonly ceilingUsd?: number };

function must<T>(r: Result<T>): T {
  if (!r.ok) throw r.error;
  return r.value;
}

const rowSchema = z.object({ record: z.string(), ceiling_usd: z.number().nullable() });

export function loadJob(r: Reader, id: string): { job: Job; terms: JobTerms } {
  const raw = r.get("SELECT record, ceiling_usd FROM jobs WHERE id = ?", id);
  if (raw === undefined) throw new AppError("not-found", `no job ${id}`);
  const row = must(parseAt("job row", rowSchema, raw));
  const job = must(parseJsonAt("job record", jobSchema, row.record));
  return { job, terms: row.ceiling_usd === null ? {} : { ceilingUsd: row.ceiling_usd } };
}

/** Write the record back. The record is re-validated: a write cannot store a Job the door would refuse. */
export function putJob(t: Tx, job: Job, terms?: JobTerms): void {
  const valid = must(parseAt("job", jobSchema, job));
  const ceiling = terms === undefined ? [] : [terms.ceilingUsd ?? null];
  const sql = terms === undefined ? "UPDATE jobs SET state = ?, record = ? WHERE id = ?" : "UPDATE jobs SET state = ?, record = ?, ceiling_usd = ? WHERE id = ?";
  const changed = t.run(sql, valid.state, canonical(valid), ...ceiling, valid.id).changes;
  if (changed !== 1) throw new AppError("not-found", `no job ${valid.id}`);
}

export function jobEvent(t: Tx, actor: Actor, job: Job, type: string, data: Record<string, unknown> = {}, cost?: { usd: number; src: "real" | "model" }): void {
  append(t, { actor, type, subject: { kind: "job", id: job.id }, lane: job.lane, ...(cost === undefined ? {} : { cost }), data: { state: job.state, attempt: job.attempt, ...data } });
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
  lane: resourceLaneSchema,
  ceilingUsd: ceilingSchema.optional(),
});
export type EnqueueInput = z.input<typeof enqueueSchema>;

export function enqueue(store: Store, input: EnqueueInput, actor: Actor): Result<Job> {
  return store.tx((t) => {
    const v = must(parseAt("enqueue", enqueueSchema, input));
    const job = must(
      parseAt("job", jobSchema, {
        id: v.id,
        of: v.of,
        lane: v.lane,
        state: "queued",
        attempt: 1,
        progress: { done: 0, total: 0 },
        spend: { usd: 0, unpriced: 0, basis: "reported" },
        failStreak: 0,
      }),
    );
    if (t.get("SELECT 1 AS x FROM jobs WHERE id = ?", job.id) !== undefined) throw new AppError("conflict", `job ${job.id} already exists`);
    t.run("INSERT INTO jobs (id, lane, state, ceiling_usd, record) VALUES (?, ?, ?, ?, ?)", job.id, job.lane, job.state, v.ceilingUsd ?? null, canonical(job));
    jobEvent(t, actor, job, "job.enqueued", { of: { kind: job.of.kind, id: job.of.id }, ...(v.ceilingUsd === undefined ? {} : { ceilingUsd: v.ceilingUsd }) });
    return job;
  });
}

export function get(store: Store, id: JobId): Result<{ job: Job; terms: JobTerms }> {
  return store.read((r) => loadJob(r, id));
}

/** Jobs in enqueue order, filtered by lane and/or state. */
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
    const sql = `SELECT record FROM jobs${where.length === 0 ? "" : ` WHERE ${where.join(" AND ")}`} ORDER BY n`;
    return r.all(sql, ...params).map((row) => must(parseJsonAt("job record", jobSchema, String(row["record"]))));
  });
}

function act(store: Store, id: JobId, actor: Actor, type: string, change: (job: Job, terms: JobTerms) => { job: Job; terms?: JobTerms; data?: Record<string, unknown> }): Result<Job> {
  return store.tx((t) => {
    const cur = loadJob(t, id);
    const next = change(cur.job, cur.terms);
    putJob(t, next.job, next.terms);
    jobEvent(t, actor, next.job, type, { from: cur.job.state, ...next.data });
    return next.job;
  });
}

/**
 * Stop between steps (v1 MV's Stop). A running job gives up its record's
 * lease at once; the driver finishes the step in flight, books it, sees the
 * pause and releases the lane - so the spend of that step is never lost.
 */
export const pause = (store: Store, id: JobId, actor: Actor): Result<Job> => act(store, id, actor, "job.paused", (j) => ({ job: move(j, "paused") }));

export const resume = (store: Store, id: JobId, actor: Actor): Result<Job> => act(store, id, actor, "job.resumed", (j) => ({ job: move(j, "queued") }));

export const cancel = (store: Store, id: JobId, actor: Actor): Result<Job> => act(store, id, actor, "job.cancelled", (j) => ({ job: move(j, "cancelled") }));

/**
 * The operator's door out of `failed` and `interrupted`: the job goes back to
 * the queue holding every output it has (v1 MV `retryMv`), its attempt counted
 * and its breaker reset. A budget stop is retried with a raised ceiling.
 */
export function retry(store: Store, id: JobId, actor: Actor, opts: { ceilingUsd?: number } = {}): Result<Job> {
  return act(store, id, actor, "job.retried", (j, terms) => {
    if (actor.kind !== "operator") throw new AppError("refused", `job ${id}: only an operator retries a ${j.state} job; ${actor.kind} ${actor.id} may not`);
    if (j.state !== "failed" && j.state !== "interrupted") throw new AppError("refused", `job ${id} is ${j.state}; only a failed or interrupted job is retried`);
    const raise = opts.ceilingUsd === undefined ? undefined : must(parseAt("retry ceiling", ceilingSchema, opts.ceilingUsd));
    const next = retried(j);
    if (raise === undefined) return { job: next };
    return { job: next, terms: { ...terms, ceilingUsd: raise }, data: { ceilingUsd: raise } };
  });
}
