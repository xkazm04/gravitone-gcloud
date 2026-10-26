import { AppError, errorMessage, isAppError, ok, type Result } from "@gt/domain/errors";
import type { Holder } from "@gt/domain/job";
import { LANE_CAPACITY, RESOURCE_LANES, type ResourceLane } from "@gt/domain/lane";
import type { Effects } from "./effects.ts";
import type { Producer } from "./job-core.ts";
import { coolingOf, pickWork, producerKey, type LaneLook, type Pick, type ProducerKey, type Waiting } from "./job-queue-core.ts";
import { laneHold, nextClaimable } from "./job-queue.ts";
import { recover, runJob, type RunOptions, type RunReport } from "./job-run.ts";
import type { Alive } from "./lease-core.ts";
import { processHolder } from "./lease.ts";
import { admissionGate, type AdmissionSource } from "./resources/gate.ts";
import type { SpendClass } from "./spend/core.ts";

// THE WORKER LOOP - the driver over job-queue-core's decision: look at every
// lane, start a drive for each pick, repeat; stop when told.
//
// v1 had one loop per producer, each with its own idea of a queue (lib/sound/
// mv/queue.ts's worker, the Suno queue, extract's `--loop`), each recovering
// its own crashes at start. Kept: RECOVERY FIRST (background-jobs:
// startup-sweeps - "the first act after a gap reconciles what was running"),
// so a job a dead process left `running` is named interrupted before anything
// is claimed beside it; and ONE DRIVE PER JOB at a time. Upgraded: one loop
// for every lane, with the lane's capacity, its hold and its order read from
// the store on every look, so the operator's `[`/`]`, a re-route and an
// acknowledgement take effect on the next look with nothing to restart.
//
// STOPPING PARKS, IT DOES NOT ABANDON (admission-queue: drain-and-shutdown).
// When the signal fires no new job is picked, and every drive in flight
// reaches its next step boundary and yields - its job goes back to the queue,
// its step finished and booked - before the loop returns. The step itself is
// never cut: the drive's deadline admits, it does not bound (job-run.ts).
//
// A drive's outcome is reported, never thrown at the loop: one producer's
// failure is its job's verdict (tick-isolation), and the loop keeps looking.

export type WorkOptions = {
  readonly signal: AbortSignal;
  readonly holder?: Holder;
  readonly alive?: Alive;
  /** Lapsed for a dead drive's open holds at recovery. */
  readonly spendClasses?: readonly SpendClass[];
  /** Passed to every drive (dry-only, TTL, heartbeat, backoff). The deadline is the loop's. */
  readonly run?: Omit<RunOptions, "holder" | "alive" | "deadlineMs" | "now">;
  /** How long an idle look waits before looking again; a finished drive wakes it sooner. */
  readonly idleMs?: number;
  readonly now?: () => number;
  /** Called with every drive's outcome, as it lands. */
  readonly onReport?: (pick: Pick, report: Result<RunReport>) => void;
  /**
   * Admit by the machine's measured load (spark game-3d-assets): every pick whose producer names an
   * engine is asked `admit` (@gt/domain/resource) before its drive starts. Absent, nothing is asked
   * and the loop is the one it was before admission existed.
   */
  readonly admission?: AdmissionSource;
  /** Called with every pick admission refused, at every look that refused it. */
  readonly onWait?: (pick: Pick, verdict: Waiting["verdict"]) => void;
};

export type WorkSummary = {
  readonly looks: number;
  readonly started: number;
  readonly recovered: number;
  readonly reports: readonly { readonly pick: Pick; readonly report: Result<RunReport> }[];
  /** Heads that waited because no producer here makes them, by job id, as last seen. */
  readonly orphans: readonly Pick[];
};

function look(fx: Effects): Result<LaneLook[]> {
  return fx.tx("worker.look", (t) =>
    RESOURCE_LANES.map((lane: ResourceLane): LaneLook => {
      const v = t.get("SELECT count(*) AS c FROM jobs WHERE lane = ? AND state = 'running'", lane)?.["c"];
      const head = nextClaimable(t, lane);
      const base = { lane, capacity: LANE_CAPACITY[lane], running: typeof v === "number" ? v : 0, held: laneHold(t, lane) !== undefined };
      return head === undefined ? base : { ...base, head: { id: head.id, producer: head.producer } };
    }),
  );
}

export async function workLoop(fx: Effects, producers: ReadonlyMap<ProducerKey, Producer>, opts: WorkOptions): Promise<Result<WorkSummary>> {
  const holder = opts.holder ?? processHolder();
  const alive = opts.alive;
  const idleMs = opts.idleMs ?? 1000;
  const clock = opts.now ?? Date.now;
  const recoverOpts = { holder, ...(alive === undefined ? {} : { alive }), ...(opts.spendClasses === undefined ? {} : { spendClasses: opts.spendClasses }) };
  const swept = recover(fx, recoverOpts);
  if (!swept.ok) return swept;

  const inFlight = new Map<string, { pick: Pick; done: Promise<void> }>();
  // What refused a drive, until when (job-queue-core: a cooling lane or producer takes nothing).
  const coolLanes = new Map<ResourceLane, number>();
  const coolProducers = new Map<ProducerKey, number>();
  const cool = (pick: Pick, report: Result<RunReport>): void => {
    // A drive REFUSED at its claim (a live head under dry-only) moved nothing, as a busy one did
    // not: the head stays first in line and was refused again at the loop's speed - measured 1655
    // claims in 300 ms at idleMs 60. It cools its lane like busy.
    const outcome = report.ok ? report.value.outcome : report.error.code === "refused" ? "busy" : undefined;
    if (outcome === undefined) return;
    const c = coolingOf(outcome, pick);
    const until = clock() + idleMs;
    if (c.lane !== undefined) coolLanes.set(c.lane, until);
    if (c.producer !== undefined) coolProducers.set(c.producer, until);
  };
  const coolingNow = (): { lanes: Set<ResourceLane>; producers: Set<ProducerKey> } => {
    const now = clock();
    const live = <K,>(m: Map<K, number>): Set<K> => {
      for (const [k, until] of m) if (until <= now) m.delete(k);
      return new Set(m.keys());
    };
    return { lanes: live(coolLanes), producers: live(coolProducers) };
  };
  const reports: { pick: Pick; report: Result<RunReport> }[] = [];
  let orphans: readonly Pick[] = [];
  let looks = 0;
  let started = 0;
  // A drive yields at its next boundary once the loop is told to stop.
  // The release after a part's job reads EVERY carried producer's preflight, not only the one that
  // drove: the part it releases is another producer's.
  const preflightOf: NonNullable<RunOptions["preflightOf"]> = (job, r) => producers.get(producerKey(job.producer, job.lane))?.preflight?.(job, r);
  const runOpts: RunOptions = {
    preflightOf,
    ...opts.run,
    holder,
    ...(alive === undefined ? {} : { alive }),
    deadlineMs: Number.MAX_SAFE_INTEGER,
    now: () => (opts.signal.aborted ? Number.POSITIVE_INFINITY : clock()),
  };

  const gate = opts.admission === undefined ? undefined : admissionGate(fx, producers, opts.admission, holder, opts.onWait);

  let recovered = swept.value.length;
  while (!opts.signal.aborted) {
    let seen = look(fx);
    if (!seen.ok) return seen;
    looks++;
    const mine = new Map<ResourceLane, string[]>();
    for (const { pick } of inFlight.values()) mine.set(pick.lane, [...(mine.get(pick.lane) ?? []), pick.jobId]);
    // THE REAPER RUNS ON EVERY LOOK THAT SEES SOMEONE ELSE'S RUNNING JOB (delivery-guarantees:
    // stuck-reaping), not only at start. A drive another process abandoned after this loop began
    // (a CLI killed mid-step) left its job `running`; a lane of capacity one then counted full on
    // every look, nothing was claimed there, and so the claim's own take-over sweep never ran -
    // the lane waited for this worker's restart. A running job that is not one of this worker's
    // drives is the only thing that can be such a corpse, and `recover` names it only on proof.
    if (seen.value.some((l) => l.running > (mine.get(l.lane)?.length ?? 0))) {
      const reaped = recover(fx, recoverOpts);
      if (!reaped.ok) return reaped;
      if (reaped.value.length > 0) {
        recovered += reaped.value.length;
        seen = look(fx);
        if (!seen.ok) return seen;
      }
    }
    const decided = pickWork(seen.value, (name, lane) => producers.has(producerKey(name, lane)), mine, coolingNow());
    orphans = decided.orphans;
    // Only a drive actually started skips the idle wait: a pick with no binding (a `carries` that
    // disagreed with the map) started nothing, and looping at once on it is a microtask spin.
    let launched = 0;
    let picks = decided.picks;
    if (gate !== undefined) {
      const admitted = await gate.filter(picks, [...inFlight.values()].map((f) => f.pick));
      if (!admitted.ok) return admitted;
      picks = admitted.value;
    }
    for (const pick of picks) {
      const producer = producers.get(producerKey(pick.producer, pick.lane));
      if (producer === undefined) continue;
      started++;
      launched++;
      const done = runJob(fx, producer, pick.jobId, runOpts).then(
        (report) => {
          cool(pick, report);
          reports.push({ pick, report });
          opts.onReport?.(pick, report);
        },
        (e: unknown) => {
          // A drive that threw past runJob's own recording is a process-level fault: carried as the drive's error, never lost.
          const report: Result<RunReport> = { ok: false, error: isAppError(e) ? e : new AppError("internal", errorMessage(e), { cause: e }) };
          reports.push({ pick, report });
          opts.onReport?.(pick, report);
        },
      ).finally(() => inFlight.delete(pick.jobId));
      inFlight.set(pick.jobId, { pick, done });
    }
    if (launched > 0) continue;
    await idle(idleMs, opts.signal, [...inFlight.values()].map((f) => f.done));
  }
  await Promise.all([...inFlight.values()].map((f) => f.done));
  return ok({ looks, started, recovered, reports, orphans });
}

/**
 * Wait until `ms` pass, the signal fires, or any drive finishes - whichever is first. It always
 * resolves on a MACROTASK: a drive that ends without touching a timer (a busy claim, an
 * unhealthy answer) settles in microtasks, and a loop woken by microtasks alone never lets a
 * timer run - not the drives' heartbeats, not the caller's own clock.
 */
function idle(ms: number, signal: AbortSignal, drives: readonly Promise<void>[]): Promise<void> {
  return new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      setImmediate(resolve);
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
    for (const d of drives) void d.then(done, done);
  });
}
