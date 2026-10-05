// THE CUT STEP'S RECORD — the sync bench's offsets, declared by its owner as its
// READERS see it (the step verdict, ./verdict.ts). The writer (useCut) still
// saves through `saveStep`; moving it onto this def is a later stage of
// phase-shared-A.

import { defineRecord, isPlainObject, malformed } from "../_shared/records/registry";
import type { CutStepData } from "../_shared/stepStore";

/** Clip id → dialled-in drift, ms. Only nudged clips appear; absent is not 0. */
export const CUT = defineRecord<CutStepData>({
  key: "cut",
  owner: "cut",
  version: 1,
  parse: (raw) => {
    const offsets = raw.offsets ?? {};
    if (!isPlainObject(offsets)) return malformed("cut.offsets is not a map of clips");
    for (const [clip, ms] of Object.entries(offsets))
      if (typeof ms !== "number" || !Number.isFinite(ms)) return malformed(`cut.offsets.${clip} is not a number`);
    return { ...raw, offsets } as CutStepData;
  },
});
