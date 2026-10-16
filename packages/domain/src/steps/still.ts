import { z } from "zod";

import { blobRefSchema } from "../blob.ts";
import { defineStepRecord, textOrNull, versionField } from "./record.ts";

// THE ALBUM STILL PART'S RECORD (Phase 4 wave C). v1 held a music video's one picture as a
// poster asset id on `music-video-source`; the album recipe makes the still its own part, so its
// takes and the adopted one live here, each take a blob ref (never a data: URL) with what it cost.
// The mv producer's still step reads the adopted take.

export const STILL = defineStepRecord({
  key: "still",
  owner: "still",
  version: 1,
  schema: z.looseObject({
    ...versionField,
    takes: z
      .array(
        z.looseObject({
          id: z.string().min(1),
          blob: blobRefSchema,
          prompt: z.string().default(""),
          model: z.string().optional(),
          costUsd: z.number().nonnegative().optional(),
        }),
      )
      .default([]),
    adopted: textOrNull.default(null),
  }),
});
