import { z } from "zod";
import { parseAt, parseJsonAt } from "@gt/domain/door";
import { AppError, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { JobId } from "@gt/domain/ids";
import { jobSchema, type Job } from "@gt/domain/job";
import { LANE_CAPACITY, LANE_PAYS, type ResourceLane } from "@gt/domain/lane";
import { append } from "./events.ts";
import { jobEvent, loadJob } from "./job.ts";
import type { Reader, Store, Tx } from "./store.ts";

// THE QUEUE - order, position, and the holds a crash leaves on a paid lane.
//
// ORDER IS A COLUMN THE OPERATOR MOVES; POSITION IS COMPUTED, NEVER STORED
// (decision 5). v1 had no order at all beyond arrival (MV's queue.json array,
// Suno's tracks list), and the prototype's Runs `[`/`]` moved an index in
// memory. Here `ord` is a REAL beside the record, so a move swaps two numbers
// and renumbers nothing, and a position is counted at read time from the
// running slots and the queued jobs ahead - a stored position is stale the
// moment the job in front of it finishes (admission-queue: wait-telemetry).
//
// A CRASH ON A PAID LANE HOLDS THE LANE (owner ruling 2026-10-16, decision 6).
// v1 MV and Suno switched their whole queue off when a step was found
// interrupted ("credits may be spent - look first"), because the step in
// flight may have been paid for and its output never stored, and the next job
// would spend again on top of an unknown. That intelligence is kept per LANE:
// a hold row names the job and the stage, nothing further is claimed there,
// and only an operator's `ackLane` - an event quoting what they acknowledged -
// clears it. A free local lane (the GPU, the render box) carries on: the worst
// a crash there costs is electricity. The hold is its own row, not a job
// state, so the job can be retried while its lane stays held (the operator
// retries and then, having looked, acknowledges - in either order).
// (delivery-guarantees: ordered-lane-blocking - "wedged is a state, and it is
// visible": the hold is what Runs draws as the lane's verdict.)

function must<T>(r: Result<T>): T {
  if (!r.ok) throw r.error;
  return r.value;
}

const recordOf = (row: Record<string, unknown>): Job => must(parseJsonAt("job record", jobSchema, String(row["record"])));

/** The jobs waiting on a lane, in the order they will be claimed. */
export function queueOf(r: Reader, lane: ResourceLane): Job[] {
  return r.all("SELECT record FROM jobs WHERE lane = ? AND state = 'queued' ORDER BY ord, n", lane).map(recordOf);
}

const runningCount = (r: Reader, lane: string): number => {
  const v = r.get("SELECT count(*) AS c FROM jobs WHERE lane = ? AND state = 'running'", lane)?.["c"];
  return typeof v === "number" ? v : 0;
};

export type QueuePosition = {
  /** 1-based; the running jobs on the lane count as ahead. */
  readonly position: number;
  readonly ahead: number;
  readonly running: number;
  readonly capacity: number;
  /** The lane is held by a crash; nothing is claimed until an operator acknowledges it. */
  readonly held?: LaneHold;
};

/** Where a queued job stands. `undefined` for a job that is not queued: it has no place in line. */
export function queuePosition(r: Reader, jobId: string): QueuePosition | undefined {
  const { job } = loadJob(r, jobId);
  if (job.state !== "queued") return undefined;
  const queue = queueOf(r, job.lane);
  const before = queue.findIndex((j) => j.id === job.id);
  const running = runningCount(r, job.lane);
  const held = laneHold(r, job.lane);
  const base = { position: running + before + 1, ahead: running + before, running, capacity: LANE_CAPACITY[job.lane] };
  return held === undefined ? base : { ...base, held };
}

export type LaneHold = { readonly jobId: string; readonly stage?: string; readonly at: string };

const holdRow = z.object({ job_id: z.string(), stage: z.string().nullable(), at: z.string() });

/** The oldest hold on a lane, or undefined while the lane is free to claim. */
export function laneHold(r: Reader, lane: ResourceLane): LaneHold | undefined {
  const raw = r.get("SELECT job_id, stage, at FROM lane_holds WHERE lane = ? ORDER BY at, job_id LIMIT 1", lane);
  if (raw === undefined) return undefined;
  const h = must(parseAt("lane hold", holdRow, raw));
  return h.stage === null ? { jobId: h.job_id, at: h.at } : { jobId: h.job_id, stage: h.stage, at: h.at };
}

/**
 * Called in the transaction that interrupts `job`: on a paid lane, the lane
 * holds. Returns whether it did. A free lane writes nothing.
 */
export function holdLaneIn(t: Tx, job: Job, actor: Actor): boolean {
  if (!LANE_PAYS[job.lane]) return false;
  const stage = job.interruption?.stage ?? null;
  t.run("INSERT OR IGNORE INTO lane_holds (lane, job_id, stage, at) VALUES (?, ?, ?, ?)", job.lane, job.id, stage, t.at);
  append(t, {
    actor,
    type: "lane.held",
    subject: { kind: "lane", id: job.lane },
    lane: job.lane,
    data: { jobId: job.id, ...(stage === null ? {} : { stage }), sentence: "credits may be spent - look first" },
  });
  return true;
}

/**
 * The operator's look, recorded (decision 6). Clears every hold on the lane,
 * one event per hold quoting the job and the stage that may have spent.
 * Refused for anyone but an operator: an agent cannot vouch that it looked.
 */
export function ackLane(store: Store, lane: ResourceLane, actor: Actor): Result<readonly LaneHold[]> {
  return store.tx((t) => {
    if (actor.kind !== "operator") throw new AppError("refused", `lane ${lane}: only an operator acknowledges a held lane; ${actor.kind} ${actor.id} may not`);
    const holds = t.all("SELECT job_id, stage, at FROM lane_holds WHERE lane = ? ORDER BY at, job_id", lane).map((raw) => must(parseAt("lane hold", holdRow, raw)));
    if (holds.length === 0) throw new AppError("refused", `lane ${lane} is not held`);
    t.run("DELETE FROM lane_holds WHERE lane = ?", lane);
    return holds.map((h) => {
      const quoted = h.stage === null ? `job ${h.job_id} (between steps)` : `job ${h.job_id} at ${h.stage}`;
      append(t, { actor, type: "lane.acknowledged", subject: { kind: "lane", id: lane }, lane, data: { jobId: h.job_id, ...(h.stage === null ? {} : { stage: h.stage }), heldAt: h.at, sentence: `acknowledged: ${quoted} may have spent` } });
      return h.stage === null ? { jobId: h.job_id, at: h.at } : { jobId: h.job_id, stage: h.stage, at: h.at };
    });
  });
}

/** The job a free slot on `lane` should take next: the head of its queue, unless the lane is held. */
export function nextClaimable(r: Reader, lane: ResourceLane): Job | undefined {
  if (laneHold(r, lane) !== undefined) return undefined;
  const raw = r.get("SELECT record FROM jobs WHERE lane = ? AND state = 'queued' ORDER BY ord, n LIMIT 1", lane);
  return raw === undefined ? undefined : recordOf(raw);
}

const ordRow = z.object({ id: z.string(), ord: z.number() });

/**
 * The operator's `[` / `]`: swap places with the neighbour in the lane's line.
 * Only a job still waiting (queued or planned) has a place to move; at either
 * end of the line it stays, and nothing is written.
 */
export function move(store: Store, jobId: JobId, dir: "earlier" | "later", actor: Actor): Result<Job> {
  return store.tx((t) => {
    const { job } = loadJob(t, jobId);
    if (job.state !== "queued" && job.state !== "planned") throw new AppError("refused", `job ${job.id} is ${job.state}; only a waiting job (queued or planned) moves in the line`);
    const line = t
      .all("SELECT id, ord FROM jobs WHERE lane = ? AND state IN ('queued', 'planned') ORDER BY ord, n", job.lane)
      .map((raw) => must(parseAt("job order", ordRow, raw)));
    const at = line.findIndex((x) => x.id === job.id);
    const mine = line[at];
    const other = line[dir === "earlier" ? at - 1 : at + 1];
    if (mine === undefined || other === undefined) return job;
    // Equal orders (two jobs enqueued with the same explicit `order`) cannot
    // be swapped by value; the mover takes a place strictly past its neighbour.
    const [a, b] = mine.ord === other.ord ? [other.ord + (dir === "earlier" ? -0.5 : 0.5), mine.ord] : [other.ord, mine.ord];
    t.run("UPDATE jobs SET ord = ? WHERE id = ?", a, mine.id);
    t.run("UPDATE jobs SET ord = ? WHERE id = ?", b, other.id);
    jobEvent(t, actor, job, "job.reordered", { dir, swappedWith: other.id, from: mine.ord, to: a });
    return job;
  });
}
