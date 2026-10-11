// PERFORM FINISH — settle the run as done (or failed when nothing was readable),
// and record the near-duplicate warning. Saves and reports on its own: the
// caller does not run the common tail for this unit.

import type { EngineIO } from "./engine";
import { log } from "./journal";
import { nearDuplicates } from "./vocabulary";
import type { ExtractManifest, StepResult } from "./types";
import { totalUnits } from "./units";

export async function performFinish(m: ExtractManifest, io: EngineIO): Promise<StepResult> {
  const readable = m.sources.filter((s) => s.readback).length;
  if (!readable) {
    m.status = "failed";
    m.error = "No source could be read back.";
  } else {
    m.status = "done";
    // The convergence warning: styles whose declared observables sit
    // within one minor field of each other will come back from the
    // generator as twins. The synthesis rules try to prevent this; when
    // they fail, say so where the cull will read it.
    //
    // A run can FINISH MORE THAN ONCE — a retry prunes failed units and
    // walks back here — and this used to append the pair on every pass,
    // so a run retried twice carried `similar_to: [b, b, b]` and three
    // copies of the warning in its log. The pair is recorded once.
    for (const [a, b] of nearDuplicates(m.styles)) {
      const sa = m.styles.find((s) => s.id === a)!;
      const sb = m.styles.find((s) => s.id === b)!;
      const fresh = !(sa.similar_to ?? []).includes(b);
      sa.similar_to = [...new Set([...(sa.similar_to ?? []), b])];
      sb.similar_to = [...new Set([...(sb.similar_to ?? []), a])];
      if (fresh) log(m, io, `warning: ${a} and ${b} differ by at most one minor observable — the generator likely renders them identically; consider keeping one`);
    }
  }
  m.finished = io.now();
  m.progress = { stage: m.status, done: totalUnits(m), total: totalUnits(m) };
  log(m, io, m.status === "done" ? `done: ${m.styles.length} style(s) from ${readable} source(s)` : m.error!);
  await io.save(m);
  return { unit: "finish", status: m.status, progress: m.progress };
}
