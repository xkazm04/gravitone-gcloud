// CUT'S VERDICT — pure, over the cut's own offsets and the records the cut is
// derived from (deriveTimeline.ts). The Cut has no reporter today, so it can
// never be signed off; this is the word it would say. Deriving a timeline is
// not work on its own — the cut has something in it once a still is on the
// clock or a clip has been nudged. See ../_shared/stepContract.ts.

import type { CutStepData, MusicVideoSourceStepData } from "../_shared/stepStore";
import type { ResolvedInput, StepModule, StepVerdict } from "../_shared/stepContract";
import { composedCount } from "../frames/frames";
import type { FramesStepData } from "../frames/useFrames";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function verdict({ discipline, records }: ResolvedInput): StepVerdict {
  if (discipline === "music-video") {
    const source = records["music-video-source"] as MusicVideoSourceStepData | undefined;
    if (!source?.posterAssetId) return { state: null, reasons: [], basis: "cut:mv:none" };
    return {
      state: "working",
      reasons: [{ code: "poster-ready", text: "poster ready to export" }],
      basis: `cut:mv:${source.posterAssetId}`,
    };
  }
  const frames = (records["frames"] as FramesStepData | undefined)?.frames ?? [];
  const offsets = (records["cut"] as CutStepData | undefined)?.offsets ?? {};
  const placed = composedCount(frames);
  const nudged = Object.keys(offsets).length;
  const basis = `cut:stills=${placed}:nudged=${nudged}`;
  if (placed === 0 && nudged === 0) return { state: null, reasons: [], basis };
  const reasons: StepVerdict["reasons"] = [];
  if (placed > 0) reasons.push({ code: "picture-placed", text: `${plural(placed, "still", "stills")} on the clock` });
  if (nudged > 0) reasons.push({ code: "clips-nudged", text: `${plural(nudged, "clip", "clips")} nudged` });
  return { state: "working", reasons, basis };
}

export const CUT_STEP: StepModule = {
  key: "cut",
  reads: ["research", "frames", "score"],
  records: ["cut", "frames", "music-video-source"],
  appliesTo: () => true,
  verdict,
};
