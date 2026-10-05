// FRAMES' VERDICT — pure, over the frames record (and, for a music video, the
// source record Frames grows). Lifted from useFrames' `reported` memo and
// MusicVideoFrames' reporter; the ORDER is theirs — worst news first. See
// ../_shared/stepContract.ts.
//
// What the mounted reporter knows that a record cannot:
//   · `rejections` — the last direction pass's row reasons — are session
//     state in useFrames, so today `blocked` survives a reload while its reason
//     does not. Here `blocked` is only what the record can prove: a refused
//     plate, named by frame.
//   · a stored cut whose `renderId` is not the chain Script now points at is
//     re-derived on mount. The verdict reads the stored cut and puts its
//     `renderId` in the basis, which is what stage 3's staleness compares.

import type { MusicVideoSourceStepData } from "../_shared/stepStore";
import type { ResolvedInput, StepModule, StepVerdict } from "../_shared/stepContract";

import { authoredClipCount, composedCount, type Frame } from "./frames";
import type { FramesStepData } from "./useFrames";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Figures asserting a number nobody sourced — the count useFrames draws. */
const unsourcedFigures = (frames: Frame[]) =>
  frames.reduce((n, f) => n + (f.texts ?? []).filter((t) => t.role === "figure" && !t.factId).length, 0);

function cutVerdict(rec: FramesStepData | undefined): StepVerdict {
  const frames = rec?.frames ?? [];
  const composed = composedCount(frames);
  const refused = frames.filter((f) => f.plate?.state === "refused");
  const basis = `frames:${rec?.renderId ?? "-"}:n=${frames.length}:ready=${composed}:refused=${refused.length}`;

  if (refused.length > 0)
    return {
      state: "blocked",
      reasons: [{ code: "plate-refused", text: `${plural(refused.length, "plate", "plates")} refused`, ref: refused[0].id }],
      basis,
    };

  const clips = authoredClipCount(frames);
  const direction = rec?.direction;
  if (composed === 0 && clips === 0 && !direction) return { state: null, reasons: [], basis };

  const unsourced = unsourcedFigures(frames);
  if (frames.length > 0 && composed === frames.length && unsourced > 0)
    return {
      state: "review",
      reasons: [{ code: "figure-unsourced", text: `${plural(unsourced, "figure", "figures")} unsourced` }],
      basis,
    };

  const reasons: StepVerdict["reasons"] = [];
  if (composed > 0) reasons.push({ code: "plates-composed", text: `${composed} of ${frames.length} plates composed` });
  if (clips > 0) reasons.push({ code: "clips-authored", text: `${plural(clips, "clip", "clips")} authored` });
  if (direction) reasons.push({ code: "direction-run", text: `${plural(direction.runs, "direction pass", "direction passes")} run` });
  return { state: "working", reasons, basis };
}

function musicVideoVerdict(source: MusicVideoSourceStepData | undefined): StepVerdict {
  if (!source?.posterAssetId) return { state: null, reasons: [], basis: "frames:mv:none" };
  return {
    state: "review",
    reasons: [{ code: "poster-ready", text: "poster generated" }],
    basis: `frames:mv:${source.posterAssetId}`,
  };
}

function verdict({ discipline, records }: ResolvedInput): StepVerdict {
  if (discipline === "music-video")
    return musicVideoVerdict(records["music-video-source"] as MusicVideoSourceStepData | undefined);
  return cutVerdict(records["frames"] as FramesStepData | undefined);
}

export const FRAMES_STEP: StepModule = {
  key: "frames",
  reads: ["research", "script"],
  records: ["frames", "music-video-source"],
  appliesTo: () => true,
  verdict,
};
