// The Frames step's persisted record. It lives beside its writer's hook
// (app/_phases/frames/useFrames.ts re-exports it) so score and the board can
// name it without importing app/.

import type { DirectionSpend, Frame } from "./frames";
import type { PictureUnit } from "./picture/unit";

/** Exported since 2026-09-08 because this record has a second READER: the Score
 *  step spots against the creator's own frames (score/picture.ts) and reads this
 *  key to get them. The type travels with its writer rather than being retyped
 *  at the reader, which is the only thing that keeps the two in step — a second
 *  hand-written copy of a persisted shape drifts the moment a field is added.
 *  Nothing but this hook WRITES it; a downstream step that seeded an upstream
 *  step's record would be inventing the artifact it exists to read.
 *
 *  v2 (frames-phase-A): the cut is `units` — picture units with an identity
 *  and a place on the film (./picture/unit.ts) — a beat unit per explainer
 *  beat, a shot unit per trailer shot. `frames` is the read-only SHADOW of the
 *  beat units, rebuilt from them on every read and written beside them on every
 *  save, for the readers that have not moved to units yet (Motion, the board).
 *  Score and the Cut read units, through ./picture/read.ts. Read and written
 *  through `FRAMES_RECORD` (./records), whose migration walks a v1 record up
 *  at the read seam. */
export interface FramesStepData {
  units: PictureUnit[];
  /** Shadow of `units`' beat units. Read it; never write it on its own. */
  frames: Frame[];
  /** Which script render the frames were derived from. A different render is a
   *  different cut, so the frames are stale rather than merely out of date. */
  renderId: string;
  /** What the art-direction passes cost. Persisted with the step because the
   *  money was spent on the step, not on the session — a reload that forgets it
   *  turns the header's spend line back into an undercount. */
  direction?: DirectionSpend;
  /** The last scene-direction TURN this step took onto the cut (applied, or
   *  found to have nothing to apply). The pass is a server-owned turn since
   *  AIO-A stage 3, and a mount lands a settled one it has not taken — so this
   *  is what makes "exactly once" survive a reload. */
  turn?: string;
  savedAt?: number;
}
