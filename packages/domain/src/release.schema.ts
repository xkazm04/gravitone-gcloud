import { z } from "zod";

import { parseAt, type Parsed } from "./door.ts";
import type { Result } from "./errors.ts";
import { AI_AUDIO, CREDIT_ROLES, GENRES, LICENCES, MASTER_RECIPES, MASTER_STATES, RELEASE_CHANNELS, RELEASE_STATUSES, SLEEVE_SOURCES } from "./release.ts";

// THE RELEASE'S DOOR (spark audio-distribution, S1): what a release record must be, wherever it comes
// from - the S1 fixtures today, the store from S2. Nullable fields are required keys (the absent-value
// convention in ./release.ts): a record that omits one is refused, not defaulted.

export const releaseIdSchema = z.string().regex(/^rel-[0-9a-f]{12}$/);
const text = (max: number) => z.string().max(max);
const nullableText = (max: number) => z.string().min(1).max(max).nullable();

const measure = z.strictObject({ lufs: z.number(), truePeakDb: z.number(), lra: z.number().min(0) });

export const masterRefSchema = z.strictObject({
  state: z.enum(MASTER_STATES),
  recipe: z.enum(MASTER_RECIPES).nullable(),
  takeId: nullableText(200),
  audioHref: nullableText(500),
  before: measure.nullable(),
  after: measure.nullable(),
  error: nullableText(2000),
});

export const rightsRecordSchema = z.strictObject({
  vendor: nullableText(80),
  model: nullableText(120),
  planTier: nullableText(80),
  generatedAt: nullableText(40),
  briefDigest: nullableText(128),
  reference: nullableText(500),
  licence: z.enum(LICENCES),
});

export const aiCreditsSchema = z.strictObject({
  lyrics: z.boolean(),
  music: z.boolean(),
  audio: z.enum(AI_AUDIO),
  persona: z.enum(["human", "ai"]).nullable(),
});

export const releaseTrackSchema = z.strictObject({
  takeId: z.string().min(1).max(200),
  title: text(200),
  version: nullableText(100),
  isrc: nullableText(15),
  explicit: z.boolean(),
  lyrics: nullableText(20000),
  durationS: z.number().positive(),
  audioHref: nullableText(500),
  songwriters: z.array(text(200)).max(20),
  credits: z.array(z.strictObject({ name: z.string().min(1).max(200), role: z.enum(CREDIT_ROLES) })).max(40),
  ai: aiCreditsSchema,
  rights: rightsRecordSchema,
  master: masterRefSchema,
});

export const sleeveSchema = z.strictObject({
  source: z.enum(SLEEVE_SOURCES),
  href: nullableText(500),
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive(),
  rgb: z.boolean(),
});

export const releaseSchema = z.strictObject({
  id: releaseIdSchema,
  title: text(200),
  version: nullableText(100),
  artist: text(200),
  label: nullableText(200),
  releaseDate: nullableText(10),
  language: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/),
  genre: z.strictObject({ primary: z.enum(GENRES).nullable(), secondary: z.enum(GENRES).nullable() }),
  upc: nullableText(13),
  tracks: z.array(releaseTrackSchema).max(40),
  sleeve: sleeveSchema.nullable(),
  channels: z.array(z.enum(RELEASE_CHANNELS)).max(RELEASE_CHANNELS.length),
  splits: z.array(z.strictObject({ name: z.string().min(1).max(200), share: z.number().min(0).max(100) })).max(20),
  status: z.enum(RELEASE_STATUSES),
});

export const parseRelease = (raw: unknown): Result<Parsed<z.output<typeof releaseSchema>>> => parseAt("release", releaseSchema, raw);
