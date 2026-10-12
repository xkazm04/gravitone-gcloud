// THE DRIVER LOOP — the CLI's run-to-end loop, and the probe that says whether a
// retry has anything to take.
//
// Its own file because neither is a unit: runToEnd is a loop over step(), and
// hasFailures reads the manifest only. The CLI and the tests use runToEnd; the
// browser calls step() once per request and never needs this file.

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

/** Run to completion. The CLI's loop; also what a test drives. */
export async function runToEnd(m: ExtractManifest, io: EngineIO, onUnit?: (r: StepResult) => void): Promise<ExtractManifest> {
  for (;;) {
    const r = await step(m, io);
    if (r.unit === null) return m;
    onUnit?.(r);
    if (r.unit === "finish") return m;
  }
}
