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
//   - A COOLING LANE OR PRODUCER TAKES NOTHING. A drive that came back busy (a
//     slot held by a lease the job table does not show - a v1 GPU shim, another
//     worker between its claim and its record), held (a hold that landed
//     between the look and the claim) or unhealthy (the producer's driver is
//     down) changed nothing, so the next look would pick the same head and get
//     the same answer at the speed of the loop: L27 measured the worker spinning
//     on exactly that. The worker cools what refused it for one idle period;
//     a cooled head is neither a pick nor an orphan - it is simply waited for.
//   - A PRODUCER IS CARRIED PER LANE (L41). A name may be bound once on each
//     lane its part options reach (research on seat.text AND cloud.google), so
//     "does this worker make the head" asks for the name AT the head's lane:
//     a worker binding Dojo's google stack must not take a gpu.local Dojo head
//     (that one is Python's), and before the key carried the lane it would
//     have claimed it and been refused by runJob - a drive per look, forever.

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

/** A bound producer's key: its name AT a lane. The producer map a worker runs is keyed by it. */
export type ProducerKey = `${string}@${ResourceLane}`;
export const producerKey = (name: string, lane: ResourceLane): ProducerKey => `${name}@${lane}`;

export type Picked = {
  readonly picks: readonly Pick[];
  /** Heads that wait because no producer here makes them. */
  readonly orphans: readonly Pick[];
};

/** What the worker is waiting out: lanes that answered busy or held, producers (by key) that answered unhealthy. */
export type Cooling = { readonly lanes: ReadonlySet<ResourceLane>; readonly producers: ReadonlySet<ProducerKey> };
export const NOT_COOLING: Cooling = { lanes: new Set(), producers: new Set() };

/** Which of a drive's outcomes cool what, and which do not (anything that moved the job). */
export function coolingOf(outcome: string, pick: Pick): { readonly lane?: ResourceLane; readonly producer?: ProducerKey } {
  if (outcome === "busy" || outcome === "held") return { lane: pick.lane };
  // An engine down on one lane (the google stack) says nothing about the same name on another.
  if (outcome === "unhealthy") return { producer: producerKey(pick.producer, pick.lane) };
  return {};
}

export function pickWork(looks: readonly LaneLook[], carries: (producer: string, lane: ResourceLane) => boolean, mine: ReadonlyMap<ResourceLane, readonly string[]>, cooling: Cooling = NOT_COOLING): Picked {
  const picks: Pick[] = [];
  const orphans: Pick[] = [];
  for (const l of looks) {
    if (l.held || l.head === undefined) continue;
    if (cooling.lanes.has(l.lane) || cooling.producers.has(producerKey(l.head.producer, l.lane))) continue;
    const started = mine.get(l.lane) ?? [];
    if (started.includes(l.head.id)) continue;
    if (Math.max(l.running, started.length) >= l.capacity) continue;
    const pick = { lane: l.lane, jobId: l.head.id, producer: l.head.producer };
    if (carries(l.head.producer, l.lane)) picks.push(pick);
    else orphans.push(pick);
  }
  return { picks, orphans };
}
