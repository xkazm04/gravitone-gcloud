// THE FRAMES STEP'S RECORDS — declared by their owner.

import { defineRecord, isPlainObject, malformed } from "../_shared/records/registry";
import type { AltsStepData } from "./alternatives/alts";
import { framesV1ToV2, parseFramesRecord } from "./picture/migrate";
import type { FramesStepData } from "./useFrames";

/** The cut itself: picture units (v2) with a `frames` shadow for the readers
 *  that have not moved to units. v1 is the positional frame list, walked up at
 *  the read seam by `framesV1ToV2` — see ./picture/migrate.ts. A v1 `frames`
 *  that is not a list throws there and the record is refused as malformed: a
 *  reader that took it as "no frames" would report an untouched step over a cut
 *  it could not read. */
export const FRAMES_RECORD = defineRecord<FramesStepData>({
  key: "frames",
  owner: "frames",
  version: 2,
  migrate: { 1: framesV1ToV2 },
  parse: parseFramesRecord,
});

/** The same def under the name the step contract reads it by (./verdict.ts,
 *  _shared/stepContract.ts) - one record, one declaration. */
export const FRAMES = FRAMES_RECORD;

/** Every alternative kept per scene — paid plates, ≈1.5MB a scene. Its
 *  writer saves the whole record from memory, so a record it cannot read must
 *  never reach that writer: a scene that is not `{ activeId, alts: [] }`
 *  refuses the record instead of being dropped by the next save.
 *
 *  Keyed by the frame's id, which is its PICTURE UNIT id (./picture/unit.ts):
 *  derived from the render and the beat, so a different render's scenes can
 *  never be handed this render's kept plates. */
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
