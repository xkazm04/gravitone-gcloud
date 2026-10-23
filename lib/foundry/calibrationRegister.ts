// THE FORGE'S GRADES, REGISTERED IN THE KERNEL'S CALIBRATION SERIES.
//
// v1 copied each commit's grades into ledger.json beside the operator's verdict
// and measured the grader over that file (calibration.ts). The kernel keeps the
// score once, keyed by the decision key it grades, and reads the label live from
// the decisions log (packages/kernel/src/calibration/series.ts). This is the
// write side: commitRun calls it inside the transaction that records the run's
// style evidence, so a score is registered if and only if the commit's catalogue
// half is.
//
// Only the fields v1 calibrated (GradeField), only a measured one (a null score
// is unmeasured), only a graded candidate, and nothing at all for a skip_grade
// run. The series is v1's seriesKey - model @ schema/prompt digest - so a
// changed grader opens a new series instead of conflicting with the old one.
// The stratum is the candidate's mechanism, v1's own split (core.ts gradeStatus).

import { registerScore, type ScoreInput } from "@gt/kernel/calibration/series";
import type { Tx } from "@gt/kernel/store";

import { packetIdOf } from "../ledger/v1/packet.ts";
import { graderStamp, seriesKey, type GradeField } from "./calibration.ts";
import type { Candidate, RunManifest } from "./types.ts";

/** The decision key the Board's forge source decides a plate on (lib/decision/v1/sources/forge.ts). */
export const forgeDecisionKey = (runId: string, candidateId: string): string => `${packetIdOf("forge", runId)}::${candidateId}`;

const fieldValues = (c: Candidate): readonly { readonly field: GradeField; readonly value: number }[] => {
  const g = c.grade;
  if (g === null) return [];
  const out: { field: GradeField; value: number }[] = [];
  if (typeof g.craft?.score === "number") out.push({ field: "craft", value: g.craft.score });
  if (typeof g.style?.score === "number") out.push({ field: "style_score", value: g.style.score });
  if (typeof g.veto?.has_text === "boolean") out.push({ field: "has_text", value: g.veto.has_text ? 1 : 0 });
  return out;
};

/** Every score a run's grades carry, as the series takes them. */
export function scoresOfRun(run: Pick<RunManifest, "id" | "candidates" | "forge">): ScoreInput[] {
  if (run.forge?.skip_grade === true) return [];
  const out: ScoreInput[] = [];
  for (const c of run.candidates) {
    if (c.status !== "graded" || c.deleted === true) continue;
    const series = seriesKey(graderStamp(c.grade));
    const key = forgeDecisionKey(run.id, c.id);
    for (const f of fieldValues(c)) out.push({ series, field: f.field, key, value: f.value, stratum: c.mechanism });
  }
  return out;
}

/** Register a run's scores. A repeat of the same value is a no-op; a different value
 *  under the same series throws registerScore's `conflict` AppError, never a silent drop. */
export function registerRunGrades(t: Tx, run: Pick<RunManifest, "id" | "candidates" | "forge">, who: string): { readonly registered: number; readonly unchanged: number } {
  let registered = 0;
  let unchanged = 0;
  for (const s of scoresOfRun(run)) {
    if (registerScore(t, s, who)) registered++;
    else unchanged++;
  }
  return { registered, unchanged };
}
