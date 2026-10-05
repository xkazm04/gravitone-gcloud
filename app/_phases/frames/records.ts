// THE FRAMES STEP'S RECORDS — declared by their owner. The alternatives record,
// and the frames record as its READERS see it (the step verdict, ./verdict.ts).
// Its writer, useFrames, still saves through `saveStep`; moving it onto this
// def — and the `withClips` hand migration that belongs here — is a later stage
// of phase-shared-A.

import { defineRecord, isPlainObject, malformed } from "../_shared/records/registry";
import type { AltsStepData } from "./alternatives/alts";
import type { FramesStepData } from "./useFrames";

/** The cut this project's Frames step holds. v1, as `saveStep` stamps it. A
 *  `frames` that is not a list refuses the record: a reader that took it as
 *  "no frames" would report an untouched step over a cut it could not read. */
export const FRAMES = defineRecord<FramesStepData>({
  key: "frames",
  owner: "frames",
  version: 1,
  parse: (raw) => {
    const frames = raw.frames ?? [];
    if (!Array.isArray(frames)) return malformed("frames.frames is not a list");
    if (raw.renderId !== undefined && typeof raw.renderId !== "string") return malformed("frames.renderId is not text");
    if (raw.direction !== undefined && !isPlainObject(raw.direction)) return malformed("frames.direction is not a record");
    return { ...raw, frames, renderId: (raw.renderId as string | undefined) ?? "" } as FramesStepData;
  },
});

/** Every alternative kept per scene — paid plates, ≈1.5MB a scene. Its
 *  writer saves the whole record from memory, so a record it cannot read must
 *  never reach that writer: a scene that is not `{ activeId, alts: [] }`
 *  refuses the record instead of being dropped by the next save. */
export const FRAMES_ALTS = defineRecord<AltsStepData>({
  key: "frames-alts",
  owner: "frames",
  version: 1,
  parse: (raw) => {
    const byFrame = raw.byFrame ?? {};
    if (!isPlainObject(byFrame)) return malformed("frames-alts.byFrame is not a map of scenes");
    for (const [frameId, scene] of Object.entries(byFrame))
      if (!isPlainObject(scene) || !Array.isArray(scene.alts))
        return malformed(`frames-alts.byFrame.${frameId} has no alternatives list`);
    return { ...raw, byFrame } as AltsStepData;
  },
});
