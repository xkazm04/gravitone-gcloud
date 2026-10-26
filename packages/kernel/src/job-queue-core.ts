import type { ResourceLane } from "@gt/domain/lane";
import { admit, type Admission, type Baseline, type Costed, type MachineLoad, type MachineProfile, type ResourceCost } from "@gt/domain/resource";

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

// ADMISSION, PURE - the second question a pick is asked, after "is there a slot" (spark
// game-3d-assets, WP1): can the MACHINE pay what the pick's engine costs, beside what is already
// running? A slot count says two jobs may run on two lanes; it cannot say that ComfyUI holding
// 55 GB and a Blender bake beside it will page the box (@gt/domain/resource says why, and the
// rules). The look reads the load once; this decides every pick against it, each admitted pick
// joining the running set the next one is measured against.
//
// A PICK WHOSE PRODUCER NAMES NO ENGINE PASSES UNTOUCHED - not admitted, not refused, not
// counted. Every producer that ran before admission existed names none, so for them this is the
// identity: the safety property job.admission.test.ts holds.

/** A refused pick and why; the head stays at the front of its line and is asked again next look. */
export type Waiting = { readonly pick: Pick; readonly verdict: Extract<Admission, { ok: false }> };

/** A job admitted in place of its lane's held head: `over` is the head's id. */
export type SkippedAhead = { readonly pick: Pick; readonly over: string };

export type Admitted = { readonly admitted: readonly Pick[]; readonly waiting: readonly Waiting[]; readonly tight: boolean; readonly skipped: readonly SkippedAhead[] };

// SKIP-AHEAD (spark scout-vision S6; ./resources/starve.ts says when and why). `behind` names, for
// a lane whose head has been held long enough, the queued jobs behind that head in line order. The
// head is always asked first; only when admission refuses it is the line behind it walked, and the
// first job `admit` passes takes the head's place for this look - one per lane, as a look picks one
// per lane. A job behind that admission refuses is not a head: it waits silently, says nothing to
// the ledger, and is not a `waiting` entry. Every candidate that names an engine is asked through the
// same `admit` against the same set and the same hysteresis, so a skip can never start a job
// admission would refuse; one that names none passes untouched, as it would at the head.

export function admitPicks(
  picks: readonly Pick[],
  engineOf: (pick: Pick) => string | undefined,
  costs: ReadonlyMap<string, ResourceCost>,
  running: readonly Costed[],
  load: MachineLoad,
  machine: MachineProfile,
  tight: boolean,
  base: Baseline = {},
  behind: ReadonlyMap<ResourceLane, readonly Pick[]> = new Map(),
): Admitted {
  const admitted: Pick[] = [];
  const waiting: Waiting[] = [];
  const skipped: SkippedAhead[] = [];
  const set: Costed[] = [...running];
  let state = tight;
  const costed = (engine: string): Costed => {
    const cost = costs.get(engine);
    return cost === undefined ? { engine } : { engine, cost };
  };
  for (const pick of picks) {
    const engine = engineOf(pick);
    if (engine === undefined) {
      admitted.push(pick);
      continue;
    }
    const job = costed(engine);
    const v = admit(job, set, load, machine, state, base);
    state = v.tight;
    if (v.ok) {
      admitted.push(pick);
      set.push(job);
      continue;
    }
    waiting.push({ pick, verdict: v });
    for (const next of behind.get(pick.lane) ?? []) {
      if (next.lane !== pick.lane || next.jobId === pick.jobId) continue;
      const e = engineOf(next);
      const other = e === undefined ? undefined : costed(e);
      if (other !== undefined) {
        const w = admit(other, set, load, machine, state, base);
        state = w.tight;
        if (!w.ok) continue;
        set.push(other);
      }
      admitted.push(next);
      skipped.push({ pick: next, over: pick.jobId });
      break;
    }
  }
  return { admitted, waiting, tight: state, skipped };
}
