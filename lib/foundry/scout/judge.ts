import { z } from "zod";

import { parseAt } from "@gt/domain/door";
import { err, errorMessage, ok, type Result } from "@gt/domain/errors";

import { recognize as routerRecognize } from "../../imaging/router.ts";
import type { ImageRef, RecognizeRequest } from "../../imaging/types.ts";
import { JUDGE_ADULT, JUDGE_CLOTHING, JUDGE_HANDS, JUDGE_LIKENESS, type MuseJudge } from "./muse.ts";

// THE MUSE WING'S EYE (spark scout-muse WP2) - one vision read of a drawn still, answering exactly
// the fields of ./muse.ts MuseJudge, so judgeFailure() can throw the still before the operator ever
// sees it. The prompt stated an adult age (./museDoor.ts); this is the read of what was DRAWN, which
// is what a look that drifts young or a garment that slipped is caught by.
//
// Through the imaging router's recognize (lib/imaging/router.ts): the local eye first, Google when it
// is down. A refused, unparsable or out-of-shape answer is an err, never a guess - the caller deletes
// the pixels on an err exactly as on a failing read, the safe side of a question the eye did not answer.
//
// `apparentAge` is asked as an integer with 0 for "will not say" rather than as a nullable field: the
// two eyes' structured-output modes do not share one spelling of a union type, and a plain integer is
// held by both. 0 reads back as null, which judgeFailure() fails.

export type JudgeDeps = {
  /** The eye; absent: the imaging router's. A test injects a fake. */
  readonly recognize?: (req: RecognizeRequest) => Promise<{ readonly json?: unknown }>;
};

export const JUDGE_NOTES_MAX = 200;

export const JUDGE_SCHEMA = {
  type: "object",
  properties: {
    adult: { type: "string", enum: [...JUDGE_ADULT] },
    apparentAge: { type: "integer", minimum: 0, maximum: 120 },
    clothing: { type: "string", enum: [...JUDGE_CLOTHING] },
    realPerson: { type: "string", enum: [...JUDGE_LIKENESS] },
    hands: { type: "string", enum: [...JUDGE_HANDS] },
    notes: { type: "string" },
  },
  required: ["adult", "apparentAge", "clothing", "realPerson", "hands", "notes"],
} as const;

export const JUDGE_INSTRUCTION = [
  "You are checking one generated illustration before a human reviews it. Answer in JSON with exactly these fields:",
  '- adult: "yes" if every person shown is clearly an adult, "no" if anyone could be a minor, "unsure" otherwise.',
  "- apparentAge: the age in whole years the youngest-looking person reads as; 0 if you will not say.",
  '- clothing: "covered" (everyday or formal dress), "revealing" (swimwear, low-cut, bare midriff), or "nude" (any nudity, or a garment that does not cover).',
  '- realPerson: "maybe" if any face resembles a specific real, recognisable person (an actor, a singer, a public figure); otherwise "no".',
  '- hands: "ok" if every visible hand is well formed, "bad" if any has wrong fingers or anatomy, "none" if no hand shows.',
  `- notes: one line, at most ${JUDGE_NOTES_MAX} characters, on the rendering style you see (photoreal, painterly, anime, 3D render), its light and its finish.`,
  "Judge only what is drawn. When in doubt about age or nudity, answer the cautious value.",
].join("\n");

const answerSchema = z
  .object({
    adult: z.enum(JUDGE_ADULT),
    apparentAge: z.number().int().min(0).max(120),
    clothing: z.enum(JUDGE_CLOTHING),
    realPerson: z.enum(JUDGE_LIKENESS),
    hands: z.enum(JUDGE_HANDS),
    notes: z.string(),
  })
  .strict();

/** What a DRY night's stand-in still is judged as: the stand-in is OUR picture of a horizon, and no eye is asked. */
export const STAND_JUDGE: MuseJudge = { adult: "yes", apparentAge: 30, clothing: "covered", realPerson: "no", hands: "none", notes: "dry stand-in: no eye was asked" };

/** The eye's answer as a MuseJudge, or why it is not one. */
export function parseJudge(raw: unknown): Result<MuseJudge> {
  const r = parseAt("judge", answerSchema, raw);
  if (!r.ok) return r;
  const a = r.value;
  const notes = a.notes.trim().replace(/\s+/g, " ").slice(0, JUDGE_NOTES_MAX);
  return ok({ adult: a.adult, apparentAge: a.apparentAge === 0 ? null : a.apparentAge, clothing: a.clothing, realPerson: a.realPerson, hands: a.hands, notes });
}

/** One still, read by the eye. An eye that cannot be reached, refuses, or answers out of shape is an err with its sentence. */
export async function judgeStill(image: ImageRef, deps: JudgeDeps = {}): Promise<Result<MuseJudge>> {
  const recognize = deps.recognize ?? routerRecognize;
  let json: unknown;
  try {
    json = (await recognize({ image, instruction: JUDGE_INSTRUCTION, schema: JUDGE_SCHEMA as unknown as Record<string, unknown> })).json;
  } catch (e) {
    return err("unavailable", errorMessage(e));
  }
  if (json === undefined) return err("unavailable", "the eye answered without the judge's JSON");
  return parseJudge(json);
}
