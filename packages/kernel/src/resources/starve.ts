import type { ResourceLane } from "@gt/domain/lane";
import type { WaitResource } from "@gt/domain/resource";

// HOW LONG A HEAD HAS BEEN HELD, PURE - what the admission gate (./gate.ts) remembers between looks
// so a held head stops starving its lane (spark scout-vision S6, WP-B).
//
// The measurement that set it: on the night of 2026-10-25/26 gpu.local (one slot, strict head of
// line) was held from ~00:10 to ~05:05Z. Admission charges commit charge, and commit headed for
// ~178 GB against a ~114 GB mark because ComfyUI kept Flux and LTX resident and a foreign app held
// ~22 GB more. One refused head kept 26 jobs behind it - 12 storyboards and 14 sheets never ran -
// and nothing in the kernel noticed the lane had been held for five hours. Two answers, both read
// off the same record:
//   SKIP-AHEAD  a head held past `skipAheadMs` lets the next queued job on its lane that admission
//     passes run in its place - one look at a time, so the head is asked FIRST at every look and
//     takes the slot the moment it fits. The head stays head; the order is not rewritten.
//   UNLOAD  a gpu.local head held on commit charge past `unloadAfterMs`, with no gpu.local job
//     running, asks ComfyUI to let its resident models go - once per held EPISODE, so a box whose
//     commit is somebody else's (the 22 GB foreign app) is not asked to unload every look all night.
//
// WHY MEMORY, NOT THE LEDGER. `job.waiting` is appended once per change of reason, so the store can
// say when a hold began - but the gate's own `said` map is in memory too, and a worker restart
// re-says every reason. A held-since read back from the ledger would then be the restart's instant
// anyway, or (reading the first unanswered wait) the instant of a wait from before the operator
// moved the job down the line and back. Kept in memory, a restart forgets the clock and the head
// waits one more `skipAheadMs` before anything passes it: the conservative error.
//
// AN EPISODE is one unbroken stretch of a job being its lane's head and refused for the same reason.
// It ends when the job is admitted, when it is no longer any lane's head (claimed elsewhere,
// cancelled, moved), or when the reason changes - a new reason is a new episode for the unload, but
// not for the skip-ahead clock, which asks only "how long has this head been refused at all". A head
// that was simply not asked at a look (its lane full - with a job that skipped ahead of it, say) is
// still held: its episode carries on.

/** Ten minutes: a held head lets a fitting job behind it run. */
export const SKIP_AHEAD_MS = 10 * 60_000;
/** Fifteen minutes: a gpu.local head held on commit charge asks ComfyUI to unload. */
export const UNLOAD_AFTER_MS = 15 * 60_000;
/** The lane whose engine an unload frees: ComfyUI shares the one card's lease. */
export const UNLOAD_LANE: ResourceLane = "gpu.local";

export type Episode = {
  readonly lane: ResourceLane;
  /** First look this job was refused as head, any reason. */
  readonly since: number;
  readonly reason: WaitResource;
  /** First look it was refused for `reason`. */
  readonly reasonSince: number;
  /** An unload was already asked for in this episode. */
  readonly freed: boolean;
};

export type Holds = ReadonlyMap<string, Episode>;

/**
 * The holds after one look: episodes of jobs no longer a head (or admitted) end; a refused head's
 * episode begins, carries on, or turns to a new reason. `heads` is every lane's head at the look.
 */
export function nextHolds(prev: Holds, heads: ReadonlySet<string>, admitted: readonly string[], refused: readonly { readonly jobId: string; readonly lane: ResourceLane; readonly resource: WaitResource }[], now: number): Map<string, Episode> {
  const out = new Map<string, Episode>();
  const gone = new Set(admitted);
  for (const [id, e] of prev) if (heads.has(id) && !gone.has(id)) out.set(id, e);
  for (const r of refused) {
    const e = out.get(r.jobId);
    if (e === undefined) out.set(r.jobId, { lane: r.lane, since: now, reason: r.resource, reasonSince: now, freed: false });
    else if (e.reason !== r.resource) out.set(r.jobId, { ...e, reason: r.resource, reasonSince: now, freed: false });
  }
  return out;
}

/** Has `jobId` been held as head long enough for a job behind it to pass? */
export function skipDue(holds: Holds, jobId: string, now: number, skipAheadMs: number): boolean {
  const e = holds.get(jobId);
  return e !== undefined && now - e.since >= skipAheadMs;
}

/**
 * The held head an unload is due for, if any: on UNLOAD_LANE, held on commit charge (`memory`; a
 * GPU-memory, CPU or queue hold is not ComfyUI's resident models) for `unloadAfterMs`, not yet
 * freed in this episode - and only while nothing runs on the lane, so a working job's models are
 * never pulled out from under it.
 */
export function unloadDue(holds: Holds, laneRunning: number, now: number, unloadAfterMs: number): string | undefined {
  if (laneRunning > 0) return undefined;
  for (const [id, e] of holds) {
    if (e.lane === UNLOAD_LANE && e.reason === "memory" && !e.freed && now - e.reasonSince >= unloadAfterMs) return id;
  }
  return undefined;
}

/** The holds with `jobId`'s episode marked freed. */
export function markFreed(holds: Holds, jobId: string): Map<string, Episode> {
  const out = new Map(holds);
  const e = out.get(jobId);
  if (e !== undefined) out.set(jobId, { ...e, freed: true });
  return out;
}
