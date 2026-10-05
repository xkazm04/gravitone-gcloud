// THE SCORE STEP'S RECORD — the spotting session, declared by its owner as its
// READERS see it (the Cut, and the step verdict in ./verdict.ts). The writer
// (useSpots) still saves through `saveStep`; moving it onto this def is a later
// stage of phase-shared-A.

import { defineRecord, malformed } from "../_shared/records/registry";
import type { ScoreStepData } from "../_shared/stepStore";

/** An empty `spots` is a decision (every spot deleted) and is kept distinct
 *  from no record at all. */
export const SCORE = defineRecord<ScoreStepData>({
  key: "score",
  owner: "score",
  version: 1,
  parse: (raw) => {
    const spots = raw.spots ?? [];
    if (!Array.isArray(spots)) return malformed("score.spots is not a list");
    return { ...raw, spots } as ScoreStepData;
  },
});
