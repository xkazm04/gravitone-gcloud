import { z } from "zod";

import { MASTER_RECIPES, type MasterMeasure, type MasterRecipe } from "./release.ts";

// THE MASTER VERB'S ANSWER (spark audio-distribution, S1): what pipeline/audio/master.py says it did to
// one file under one universal recipe. The recipe is the whole request - the owner's "one click" ruling
// (./release.ts MASTER_RECIPES) - so nothing here carries a setting; the numbers that matter are the
// file's before and after, measured by the sidecar's own meter (BS.1770-4 integrated, 4x true peak,
// EBU Tech 3342 LRA), `after` on the file as written.

const measureSchema = z.strictObject({ lufs: z.number(), truePeakDb: z.number(), lra: z.number().min(0) });

/** The sidecar's `master --json` answer (last stdout line). Extra keys are refused: a drifted verb is a red door. */
export const masterAnswerSchema = z.strictObject({
  ok: z.literal(true),
  recipe: z.enum(MASTER_RECIPES),
  input: z.string().min(1),
  output: z.string().min(1),
  before: measureSchema,
  after: measureSchema,
  ms: z.number().int().nonnegative(),
  /** The limiter's deepest gain reduction in dB; 0 when no frame reached the ceiling. */
  limitDb: z.number().nonnegative(),
  /** Gain-and-limit passes it took to land loudness and ceiling together. */
  passes: z.number().int().positive(),
});

export interface MasterResult {
  readonly recipe: MasterRecipe;
  readonly input: string;
  readonly output: string;
  readonly before: MasterMeasure;
  readonly after: MasterMeasure;
  readonly ms: number;
  readonly limitDb: number;
  readonly passes: number;
}
