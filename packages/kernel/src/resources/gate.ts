import { isAppError, ok, type Result } from "@gt/domain/errors";
import type { Holder } from "@gt/domain/job";
import type { ResourceLane } from "@gt/domain/lane";
import type { Baseline, Costed, MachineLoad, MachineProfile } from "@gt/domain/resource";
import type { Effects } from "../effects.ts";
import { append } from "../events.ts";
import type { Producer } from "../job-core.ts";
import { admitPicks, producerKey, type LaneLook, type Pick, type ProducerKey, type Waiting } from "../job-queue-core.ts";
import { queueOf } from "../job-queue.ts";
import { jobEvent, loadJob } from "../job.ts";
import { actorOf } from "../lease.ts";
import type { Reader } from "../store.ts";
import { costsOf, readProfiles } from "./profiles.ts";
import { markFreed, nextHolds, skipDue, SKIP_AHEAD_MS, UNLOAD_AFTER_MS, UNLOAD_LANE, unloadDue, type Holds } from "./starve.ts";

// THE WORKER'S ADMISSION GATE - the I/O around job-queue-core's pure `admitPicks`: one machine
// reading per look, the profiles as the store has them, the memory gate's hysteresis carried from
// look to look, and a refusal said ONCE per reason. A head refused on memory is asked again at
// every look until it fits, and a `job.waiting` event per look would bury the ledger under one
// sentence repeated every second (the worker host's busy lines learned the same: said once per
// change, workers/worker.ts `said`). The event marks a change of reason; the reading itself is
// the probe's and is not stored.
//
// A HELD HEAD IS TIMED (spark scout-vision S6; ./starve.ts): past `skipAheadMs` the jobs behind it
// on its lane are offered to admission in its place (`job.skipped-ahead` on the one that runs), and
// a gpu.local head held on commit charge past `unloadAfterMs`, with nothing running on gpu.local,
// asks ComfyUI to free its models once per episode (`resource.freed` on the lane).

export type AdmissionSource = {
  /** Read the machine now. A reading it could not make is absent, never zero; a throw reads as nothing read. */
  probe(): Promise<MachineLoad>;
  readonly machine: MachineProfile;
  /** How long a head is held before a job behind it may pass. Absent: SKIP_AHEAD_MS. */
  readonly skipAheadMs?: number;
  /** How long a gpu.local head is held on commit charge before ComfyUI is asked to unload. Absent: UNLOAD_AFTER_MS. */
  readonly unloadAfterMs?: number;
  /**
   * Ask the engine on UNLOAD_LANE to let its resident models go (ComfyUI `POST /free`). Absent,
   * nothing is ever unloaded. A throw is a refused unload: nothing is appended, and it is not
   * asked again in the same episode.
   */
  free?(): Promise<void>;
};

export type Gate = {
  /** The picks that may start, of `picks`, beside the drives in flight; `looks` is the look they were picked from. */
  filter(picks: readonly Pick[], inFlight: readonly Pick[], looks: readonly LaneLook[]): Promise<Result<readonly Pick[]>>;
};

export function admissionGate(
  fx: Effects,
  producers: ReadonlyMap<ProducerKey, Producer>,
  admission: AdmissionSource,
  holder: Holder,
  onWait?: (pick: Pick, verdict: Waiting["verdict"]) => void,
  now: () => number = Date.now,
): Gate {
  const engineOf = (p: Pick): string | undefined => producers.get(producerKey(p.producer, p.lane))?.engine;
  const actor = actorOf(holder);
  let tight = false;
  // The reading taken at the last look that found no engine job in flight: what the running set's
  // profiled peaks sit on (@gt/domain/resource Baseline). Unknown until such a look.
  let base: Baseline = {};
  const said = new Map<string, string>();
  let holds: Holds = new Map();
  const skipAheadMs = admission.skipAheadMs ?? SKIP_AHEAD_MS;
  const unloadAfterMs = admission.unloadAfterMs ?? UNLOAD_AFTER_MS;
  // The last sentence each held head was refused with, quoted by `resource.freed`.
  const why = new Map<string, string>();

  const read = async (): Promise<MachineLoad> => {
    try {
      return await admission.probe();
    } catch {
      return {};
    }
  };

  return {
    async filter(picks, inFlight, looks) {
      const at = now();
      const heads = new Set(looks.flatMap((l) => (l.head === undefined ? [] : [l.head.id])));
      holds = nextHolds(holds, heads, [], [], at);
      // No pick names an engine: nothing to ask, and no probe taken (a CPU sample costs a quarter second).
      if (!picks.some((p) => engineOf(p) !== undefined)) return ok(picks);
      const costs = fx.tx("worker.profiles", (t) => costsOf(readProfiles(t)));
      if (!costs.ok) return costs;
      const load = await read();
      const running: Costed[] = inFlight.flatMap((p): Costed[] => {
        const engine = engineOf(p);
        if (engine === undefined) return [];
        const cost = costs.value.get(engine);
        return [cost === undefined ? { engine } : { engine, cost }];
      });
      if (running.length === 0) base = { ...(load.commitUsedGb === undefined ? {} : { commitGb: load.commitUsedGb }), ...(load.vramUsedGb === undefined ? {} : { vramGb: load.vramUsedGb }) };
      const behind = fx.tx("worker.behind", (t) => behindHeads(t, picks, inFlight, at));
      if (!behind.ok) return behind;
      const r = admitPicks(picks, engineOf, costs.value, running, load, admission.machine, tight, base, behind.value);
      tight = r.tight;
      holds = nextHolds(holds, heads, r.admitted.map((p) => p.jobId), r.waiting.map((w) => ({ jobId: w.pick.jobId, lane: w.pick.lane, resource: w.verdict.resource })), at);
      for (const w of r.waiting) why.set(w.pick.jobId, w.verdict.why);
      for (const id of why.keys()) if (!holds.has(id)) why.delete(id);
      for (const s of r.skipped) {
        const logged = fx.tx("job.skipped-ahead", (t) => jobEvent(t, actor, loadJob(t, s.pick.jobId).job, "job.skipped-ahead", { jobId: s.pick.jobId, over: s.over }));
        if (!logged.ok) return logged;
      }
      for (const p of r.admitted) said.delete(p.jobId);
      for (const w of r.waiting) {
        onWait?.(w.pick, w.verdict);
        if (said.get(w.pick.jobId) === w.verdict.resource) continue;
        said.set(w.pick.jobId, w.verdict.resource);
        const logged = fx.tx("job.waiting", (t) =>
          jobEvent(t, actor, loadJob(t, w.pick.jobId).job, "job.waiting", { resource: w.verdict.resource, why: w.verdict.why, engine: engineOf(w.pick) ?? "" }),
        );
        // A head cancelled between the look and this line has nothing left to wait; anything else is the store's fault.
        if (!logged.ok && !(isAppError(logged.error) && logged.error.code === "not-found")) return logged;
      }
      const freed = await unload(looks, inFlight, r.admitted, at);
      if (!freed.ok) return freed;
      return ok(r.admitted);
    },
  };

  /** For each engine pick whose head has been held past `skipAheadMs`: the queued jobs behind it that this worker makes. */
  function behindHeads(t: Reader, picks: readonly Pick[], inFlight: readonly Pick[], at: number): Map<ResourceLane, Pick[]> {
    const out = new Map<ResourceLane, Pick[]>();
    const flying = new Set(inFlight.map((p) => p.jobId));
    for (const p of picks) {
      if (engineOf(p) === undefined || !skipDue(holds, p.jobId, at, skipAheadMs)) continue;
      const line = queueOf(t, p.lane);
      if (line[0]?.id !== p.jobId) continue;
      const makes = line.slice(1).filter((j) => !flying.has(j.id) && producers.has(producerKey(j.producer, p.lane)));
      out.set(p.lane, makes.map((j) => ({ lane: p.lane, jobId: j.id, producer: j.producer })));
    }
    return out;
  }

  /** Ask for an unload when one is due (./starve.ts unloadDue), once per episode. */
  async function unload(looks: readonly LaneLook[], inFlight: readonly Pick[], admitted: readonly Pick[], at: number): Promise<Result<void>> {
    const free = admission.free;
    if (free === undefined) return ok(undefined);
    // Anything on the lane counts: any worker's running job, this worker's drives not yet claimed, and a pick admitted this look.
    const onLane = (ps: readonly Pick[]): number => ps.filter((p) => p.lane === UNLOAD_LANE).length;
    const recorded = looks.find((l) => l.lane === UNLOAD_LANE)?.running ?? 0;
    const jobId = unloadDue(holds, Math.max(recorded, onLane(inFlight)) + onLane(admitted), at, unloadAfterMs);
    if (jobId === undefined) return ok(undefined);
    holds = markFreed(holds, jobId);
    try {
      await free();
    } catch {
      return ok(undefined);
    }
    return fx.tx("resource.freed", (t) => {
      append(t, { actor, type: "resource.freed", subject: { kind: "lane", id: UNLOAD_LANE }, lane: UNLOAD_LANE, data: { lane: UNLOAD_LANE, reason: "memory", jobId, why: why.get(jobId) ?? "" } });
    });
  }
}
