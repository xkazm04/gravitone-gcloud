// THE MOTION STEP'S RECORDS — declared by their owner (see
// ../_shared/records/registry.ts for why a record has a def).
//
// One record so far: the direction outcomes, per frame. The motion LINE is not
// here — it lives on the frame (`FrameClip.motion` in the frames record), so a
// still and the movement given to it stay one record. What lives here is what
// the turn said about each plate, proposed or declined, with its basis: the
// thing a creator accepts from, and the thing a later verdict reads.

import { defineRecord, isPlainObject, malformed } from "../_shared/records/registry";

import type { MotionOutcome } from "./direction";

export interface MotionOutcomeOnFile {
  outcome: MotionOutcome;
  /** `plateSig` of the plate the outcome was made from. A different plate now
   *  means the outcome describes a picture that is no longer there. */
  plate: string;
}

export interface MotionDirectionData {
  byFrame: Record<string, MotionOutcomeOnFile>;
}

export const MOTION_DIRECTION = defineRecord<MotionDirectionData>({
  key: "motion-direction",
  owner: "motion",
  version: 1,
  parse: (raw) => {
    const byFrame = raw.byFrame ?? {};
    if (!isPlainObject(byFrame)) return malformed("motion-direction.byFrame is not a map of frames");
    for (const [frameId, row] of Object.entries(byFrame)) {
      const kind = isPlainObject(row) && isPlainObject(row.outcome) ? row.outcome.kind : undefined;
      if (kind !== "proposed" && kind !== "declined")
        return malformed(`motion-direction.byFrame.${frameId} is neither proposed nor declined`);
    }
    return { ...raw, byFrame } as MotionDirectionData;
  },
});
