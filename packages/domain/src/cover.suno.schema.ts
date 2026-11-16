import { z } from "zod";

import { sunoReadSchema } from "./audio.suno.schema.ts";
import {
  COVER_SUNO_SEND_STATES,
  COVER_SUNO_TAKE_STATES,
  SUNO_COVER_DURATION_MAX_S,
  SUNO_COVER_DURATION_MIN_S,
  SUNO_COVER_LYRICS_MAX,
  SUNO_COVER_MODELS,
  SUNO_COVER_NEGATIVE_MAX,
  SUNO_COVER_STYLE_MAX,
  SUNO_COVER_TAKES,
} from "./cover.suno.ts";

// THE DOOR FOR A COVER'S SUNO ROUND TRIP (spark suno-covers): the plan an owner sends, and the `suno` part of
// a cover.json (./cover.schema.ts nests it).

const clipId = z.string().regex(/^[A-Za-z0-9_-]{1,120}$/);
const take = z.union([z.literal(1), z.literal(2)]);
const fraction = z.number().min(0).max(1);

export const sunoCoverControlsSchema = z.strictObject({
  audioInfluence: fraction.optional(),
  styleInfluence: fraction.optional(),
  weirdness: fraction.optional(),
  variety: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
});

const planFields = {
  style: z.string().trim().min(1).max(SUNO_COVER_STYLE_MAX),
  lyrics: z.string().max(SUNO_COVER_LYRICS_MAX),
  model: z.enum(SUNO_COVER_MODELS),
  negativeStyle: z.string().trim().min(1).max(SUNO_COVER_NEGATIVE_MAX).optional(),
  durationS: z.number().int().min(SUNO_COVER_DURATION_MIN_S).max(SUNO_COVER_DURATION_MAX_S).optional(),
  controls: sunoCoverControlsSchema.optional(),
};

/** What the desk sends: the cover and the owner's words for Suno. */
export const coverSunoPlanSchema = z.strictObject({ id: z.string().regex(/^cov-[0-9a-f]{12}$/), ...planFields });

export const coverSunoTakeSchema = z.strictObject({
  take,
  state: z.enum(COVER_SUNO_TAKE_STATES),
  clipId: clipId.optional(),
  title: z.string().min(1).max(256).optional(),
  durationS: z.number().positive().optional(),
  songUrl: z.url({ protocol: /^https$/ }).max(500).optional(),
  read: sunoReadSchema.optional(),
  readRefused: z.string().max(2000).optional(),
  error: z.string().max(2000).optional(),
});

export const coverSunoSendSchema = z.strictObject({
  n: z.number().int().min(1),
  at: z.string().min(1),
  jobId: z.string().min(1).max(200),
  state: z.enum(COVER_SUNO_SEND_STATES),
  plan: z.strictObject(planFields),
  takes: z.array(coverSunoTakeSchema).max(SUNO_COVER_TAKES),
  creditsSpent: z.number().int().min(0).optional(),
  error: z.string().max(2000).optional(),
});

export const coverSunoSchema = z.strictObject({
  uploadClipId: clipId.optional(),
  sends: z.array(coverSunoSendSchema).max(100),
  filed: z.strictObject({ send: z.number().int().min(1), take, clipId }).optional(),
});

/** Keeping a take: which send, which take, and the owner's second press. */
export const coverSunoFileSchema = z.strictObject({ id: z.string().regex(/^cov-[0-9a-f]{12}$/), send: z.number().int().min(1), take, confirm: z.boolean().optional() });
