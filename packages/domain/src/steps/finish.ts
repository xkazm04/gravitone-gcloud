import { z } from "zod";

import { defineStepRecord, textOrNull, versionField } from "./record.ts";

// THE MOTION, SCORE AND CUT PARTS' RECORDS (v1 app/_phases/motion/records.ts,
// app/_phases/score/records.ts, app/_phases/score/ads/record.ts, app/_phases/cut/records.ts,
// app/_phases/_shared/records/ads.ts ads-finish). Shapes and rules as v1 declared them; the one
// addition is that v1 left motion-direction and every ads-* key out of its RECORD_DEFS
// (stepContract.ts:133), so no verdict could read them. Here every key has a door.

export const MOTION_DIRECTION = defineStepRecord({
  key: "motion-direction",
  owner: "motion",
  version: 1,
  schema: z.looseObject({
    ...versionField,
    /** Per unit: the last direction outcome, and the signature of the plate it was made from -
     *  a different plate now means the outcome describes a picture that is no longer there. */
    byFrame: z
      .record(
        z.string(),
        z.looseObject({
          outcome: z.looseObject({ kind: z.enum(["proposed", "declined"]) }),
          plate: z.string(),
        }),
      )
      .default({}),
  }),
});

const spotSchema = z.looseObject({
  id: z.string().min(1),
  title: z.string(),
  sceneIds: z.array(z.string()),
  note: z.string().default(""),
  /** Absent until a human chooses one - a proposal never invents a tempo (lib/score/spots.ts). */
  bpm: z.number().positive().optional(),
  proposed: z.boolean().optional(),
  takeIds: z.array(z.string()).optional(),
  activeTakeId: z.string().optional(),
});

export const SCORE = defineStepRecord({
  key: "score",
  owner: "score",
  version: 1,
  // An EMPTY list is a decision (every spot deleted), distinct from no record at all.
  schema: z.looseObject({ ...versionField, spots: z.array(spotSchema).default([]) }),
});

export const ADS_SCORE = defineStepRecord({
  key: "ads-score",
  owner: "score",
  version: 1,
  schema: z.looseObject({
    ...versionField,
    scenarioId: textOrNull.default(null),
    /** Never defaulted: absent until a human chooses one. */
    bpm: z.number().positive().nullable().default(null),
    takeIds: z.array(z.string()).default([]),
    activeTakeId: textOrNull.default(null),
  }),
});

export const CUT = defineStepRecord({
  key: "cut",
  owner: "cut",
  version: 1,
  // Clip id -> dialled-in drift in ms. Only nudged clips appear: ABSENT IS NOT ZERO.
  schema: z.looseObject({ ...versionField, offsets: z.record(z.string(), z.number().refine(Number.isFinite, "an offset is a finite number")).default({}) }),
});

export const ADS_FINISH = defineStepRecord({
  key: "ads-finish",
  owner: "cut",
  version: 1,
  schema: z.looseObject({
    ...versionField,
    supers: z.record(z.string(), z.string()).default({}),
    endCard: z
      .looseObject({ cta: z.string().default(""), line: textOrNull.default(null), logoAssetId: textOrNull.default(null), holdS: z.number().positive().default(2) })
      .default({ cta: "", line: null, logoAssetId: null, holdS: 2 }),
    aspects: z.array(z.string()).default([]),
    exports: z.array(z.looseObject({ aspect: z.string(), exportId: z.string().min(1), createdAt: z.union([z.number(), z.string()]) })).default([]),
  }),
});
