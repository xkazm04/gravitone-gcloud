// THE FRAMES STEP'S v1 RECORDS — the browser-store read seam (lib/steps/recordRegistry).
//
// Lifted from app/_phases/frames/records.ts (Phase 6, L59) rather than deleted. The new world's
// frames records are packages/domain/src/steps/frames.ts (v3, blob refs), and the importer walks
// a v1 list up with `framesV1ToV2` directly (lib/import/steps.ts). What these defs still carry is
// the two refusals the picture-unit and step-records probes hold v1's seam to: a v1 list read as
// v2 units without a write, and a `frames-alts` that is not a map of scenes refused as malformed
// rather than handed to a writer that would save over the paid plates. They go when the v1 step
// store does. The `FRAMES` alias v1's step contract read is dropped: its readers retired.

import { defineRecord, isPlainObject, malformed } from "@/lib/steps/recordRegistry";
import type { AltsStepData } from "@/lib/frames/alternatives/alts";
import { framesV1ToV2, parseFramesRecord } from "@/lib/frames/picture/migrate";
import type { FramesStepData } from "@/lib/frames/stepData";

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
