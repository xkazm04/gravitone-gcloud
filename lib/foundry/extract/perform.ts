// THE PERFORM DRIVER — step(): take the next unit, check the run ceiling, hand
// the unit to its per-kind file, then save and report.
//
// Its own file so the one entry point is separate from each unit's work. The
// per-kind files (performRead, performGroup, performReplica, performTransfer,
// performFinish) each perform exactly one kind; the tail below runs after every
// kind except finish, which saves and reports itself.

import type { EngineIO } from "./engine";
import { performFinish } from "./performFinish";
import { performGroup } from "./performGroup";
import { performRead } from "./performRead";
import { performReplica } from "./performReplica";
import { performTransfer } from "./performTransfer";
import { stopFor, unitEstimate, usd6 } from "./spend";
import type { ExtractManifest, StepResult } from "./types";
import { doneUnits, next, totalUnits, unitLabel } from "./units";

/** Perform ONE unit and save. Returns what was done; `unit: null` means the
 *  run was already finished. Never throws for a vendor failure — that is
 *  recorded on the element and the run moves on, because a gallery of forty
 *  with one refused frame is a run of thirty-nine, not a failed run. */
export async function step(m: ExtractManifest, io: EngineIO): Promise<StepResult> {
  const unit = next(m);
  if (!unit) return { unit: null, status: m.status, progress: m.progress };

  // THE RUN CEILING. Checked before the unit starts, against its estimate: a
  // unit that would cross the line is not taken, so nothing is spent past it.
  const ceiling = m.options.ceilingUsd;
  if (ceiling !== undefined) {
    const est = unitEstimate(m, unit, io);
    const spent = m.spend?.usd ?? 0;
    if (est > 0 && usd6(spent + est) > ceiling) {
      stopFor(m, io, "run-ceiling", `Run ceiling reached: $${spent.toFixed(4)} of $${ceiling.toFixed(2)} spent, and ${unitLabel(unit)} is estimated at $${est.toFixed(4)}. Raise the ceiling and retry to continue.`);
      m.progress = { stage: m.status, done: doneUnits(m), total: totalUnits(m) };
      await io.save(m);
      return { unit: null, status: m.status, progress: m.progress };
    }
  }

  switch (unit.kind) {
    case "read":
      await performRead(m, io, unit);
      break;
    case "group":
      await performGroup(m, io);
      break;
    case "replica":
      await performReplica(m, io, unit);
      break;
    case "transfer":
      await performTransfer(m, io, unit);
      break;
    case "finish":
      return performFinish(m, io);
  }

  m.progress = { stage: m.status, done: doneUnits(m), total: totalUnits(m) };
  await io.save(m);
  return { unit: unitLabel(unit), status: m.status, progress: m.progress };
}
