import { isAppError, ok, type Result } from "@gt/domain/errors";
import type { Holder } from "@gt/domain/job";
import type { Baseline, Costed, MachineLoad, MachineProfile } from "@gt/domain/resource";
import type { Effects } from "../effects.ts";
import type { Producer } from "../job-core.ts";
import { admitPicks, producerKey, type Pick, type ProducerKey, type Waiting } from "../job-queue-core.ts";
import { jobEvent, loadJob } from "../job.ts";
import { actorOf } from "../lease.ts";
import { costsOf, readProfiles } from "./profiles.ts";

// THE WORKER'S ADMISSION GATE - the I/O around job-queue-core's pure `admitPicks`: one machine
// reading per look, the profiles as the store has them, the memory gate's hysteresis carried from
// look to look, and a refusal said ONCE per reason. A head refused on memory is asked again at
// every look until it fits, and a `job.waiting` event per look would bury the ledger under one
// sentence repeated every second (the worker host's busy lines learned the same: said once per
// change, workers/worker.ts `said`). The event marks a change of reason; the reading itself is
// the probe's and is not stored.

export type AdmissionSource = {
  /** Read the machine now. A reading it could not make is absent, never zero; a throw reads as nothing read. */
  probe(): Promise<MachineLoad>;
  readonly machine: MachineProfile;
};

export type Gate = {
  /** The picks that may start, of `picks`, beside the drives in flight. */
  filter(picks: readonly Pick[], inFlight: readonly Pick[]): Promise<Result<readonly Pick[]>>;
};

export function admissionGate(fx: Effects, producers: ReadonlyMap<ProducerKey, Producer>, admission: AdmissionSource, holder: Holder, onWait?: (pick: Pick, verdict: Waiting["verdict"]) => void): Gate {
  const engineOf = (p: Pick): string | undefined => producers.get(producerKey(p.producer, p.lane))?.engine;
  const actor = actorOf(holder);
  let tight = false;
  // The reading taken at the last look that found no engine job in flight: what the running set's
  // profiled peaks sit on (@gt/domain/resource Baseline). Unknown until such a look.
  let base: Baseline = {};
  const said = new Map<string, string>();

  const read = async (): Promise<MachineLoad> => {
    try {
      return await admission.probe();
    } catch {
      return {};
    }
  };

  return {
    async filter(picks, inFlight) {
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
      const r = admitPicks(picks, engineOf, costs.value, running, load, admission.machine, tight, base);
      tight = r.tight;
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
      return ok(r.admitted);
    },
  };
}
