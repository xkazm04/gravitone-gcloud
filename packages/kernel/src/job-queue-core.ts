import type { ResourceLane } from "@gt/domain/lane";

// WHICH JOB RUNS NEXT, PURE - the worker loop's one decision, as a function of
// what the store says about each lane and what this worker already started.
// job-worker.ts reads the facts and runs the picks; nothing here does I/O.
//
// The rules, each from a failure somebody paid for:
//   - A HELD LANE TAKES NOTHING (decision 6; v1 MV/Suno's `queue.interrupted`).
//   - A FULL LANE TAKES NOTHING: slots running here or elsewhere, plus picks
//     this worker started that have not claimed yet, against LANE_CAPACITY.
//     Over-counting is safe (the job waits a tick); under-counting is not
//     dangerous either - the claim finds no free slot and reports `busy` - but
//     it wastes a drive, so the larger of the two counts is used.
//   - ONE PICK PER LANE PER LOOK. A second pick would read the same head of
//     the line the first one has not claimed yet.
//   - A HEAD WHOSE PRODUCER THIS WORKER DOES NOT CARRY IS NAMED, NOT SKIPPED.
//     Skipping it would run the line out of order behind it (delivery-
//     guarantees: ordered-lane-blocking - an operator's order is meaning); the
//     lane waits for a worker that has the producer, and the look says so.

export type LaneLook = {
  readonly lane: ResourceLane;
  readonly capacity: number;
  /** Jobs the store records as running on the lane, any worker's. */
  readonly running: number;
  readonly held: boolean;
  /** The head of the lane's line (nextClaimable), when there is one. */
  readonly head?: { readonly id: string; readonly producer: string };
};

export type Pick = { readonly lane: ResourceLane; readonly jobId: string; readonly producer: string };

export type Picked = {
  readonly picks: readonly Pick[];
  /** Heads that wait because no producer here makes them. */
  readonly orphans: readonly Pick[];
};

export function pickWork(looks: readonly LaneLook[], carries: (producer: string) => boolean, mine: ReadonlyMap<ResourceLane, readonly string[]>): Picked {
  const picks: Pick[] = [];
  const orphans: Pick[] = [];
  for (const l of looks) {
    if (l.held || l.head === undefined) continue;
    const started = mine.get(l.lane) ?? [];
    if (started.includes(l.head.id)) continue;
    if (Math.max(l.running, started.length) >= l.capacity) continue;
    const pick = { lane: l.lane, jobId: l.head.id, producer: l.head.producer };
    if (carries(l.head.producer)) picks.push(pick);
    else orphans.push(pick);
  }
  return { picks, orphans };
}
