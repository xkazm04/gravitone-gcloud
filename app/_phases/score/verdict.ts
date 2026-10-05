// SCORE'S VERDICT — pure, over the spotting record. The standard Score has no
// reporter today, so it can never be signed off; this is the word it would say.
// A music video has no spotting session: the step does not apply, rather than
// asserting `done` on mount as MusicVideoScore does. See
// ../_shared/stepContract.ts.

import type { ScoreStepData } from "../_shared/stepStore";
import type { ResolvedInput, StepModule, StepVerdict } from "../_shared/stepContract";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function verdict({ records }: ResolvedInput): StepVerdict {
  const rec = records["score"] as ScoreStepData | undefined;
  if (!rec) return { state: null, reasons: [], basis: "score:none" };
  const spots = rec.spots ?? [];
  const untaken = spots.filter((s) => !s.activeTakeId);
  const reasons: StepVerdict["reasons"] = [];
  // A spot without a take is the gap the Cut's music lane draws as missing.
  if (untaken.length > 0)
    reasons.push({ code: "take-missing", text: `${plural(untaken.length, "cue", "cues")} without a take`, ref: untaken[0].id });
  reasons.push({ code: "cues-spotted", text: `${plural(spots.length, "cue", "cues")} spotted` });
  return {
    state: "working",
    reasons,
    basis: `score:${spots.map((s) => `${s.id}@${s.activeTakeId ?? "-"}`).join(",")}`,
  };
}

export const SCORE_STEP: StepModule = {
  key: "score",
  reads: ["frames"],
  records: ["score"],
  appliesTo: (discipline) => discipline !== "music-video",
  verdict,
};
