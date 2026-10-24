// THE DRIVER LOOP — the run-to-end loop a probe drives, and the read that says whether a
// retry has anything to take.
//
// Its own file because neither is a unit: runToEnd is a loop over step(), and
// hasFailures reads the manifest only. Since Phase 4 (L29) every driver - the
// CLI, the /step route, the worker - is the run's kernel job, which calls step()
// once per unit (lib/producers/extract.ts); runToEnd is the probes' loop, and
// the CLI reads hasFailures to say whether --retry has anything to take.

import type { EngineIO } from "./engine";
import { step } from "./perform";
import type { ExtractManifest, StepResult } from "./types";

/** Does this run hold anything a retry would take again? */
export function hasFailures(m: ExtractManifest): boolean {
  if (m.sources.some((s) => s.error && !s.readback)) return true;
  for (const st of m.styles) {
    if (st.replicas.some((r) => r.rounds.some((x) => !x.file))) return true;
    if (st.transfers.some((t) => !t.file)) return true;
  }
  return false;
}

/** Run to completion, with no job: what a probe drives. */
export async function runToEnd(m: ExtractManifest, io: EngineIO, onUnit?: (r: StepResult) => void): Promise<ExtractManifest> {
  for (;;) {
    const r = await step(m, io);
    if (r.unit === null) return m;
    onUnit?.(r);
    if (r.unit === "finish") return m;
  }
}
