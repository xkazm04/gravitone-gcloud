import { z } from "zod";

import { parseAt, type Parsed } from "./door.ts";
import type { Result } from "./errors.ts";
import { COVER_BRIEF_STATES, COVER_LYRICS_MAX, COVER_NOTE_MAX, COVER_RIGHTS, COVER_STATES, COVER_STYLE_MAX, COVER_TAKE_COUNT, COVER_TAKE_STATES, COVER_TITLE_MAX } from "./cover.ts";

// THE COVER'S DOOR (spark track-mirror-studio): what a cover.json on disk, and an upload's fields, must be.

export const coverIdSchema = z.string().regex(/^cov-[0-9a-f]{12}$/);
const rel = z.string().min(1).max(200);
const seed = z.number().int().min(0).max(2 ** 48 - 1);

export const coverTakeSchema = z.strictObject({
  n: z.number().int().min(1).max(COVER_TAKE_COUNT),
  seed,
  state: z.enum(COVER_TAKE_STATES),
  file: rel.optional(),
  renderS: z.number().min(0).optional(),
  error: z.string().max(2000).optional(),
});

export const coverRecordSchema = z.strictObject({
  id: coverIdSchema,
  createdAt: z.string().min(1),
  title: z.string().min(1).max(COVER_TITLE_MAX),
  rights: z.enum(COVER_RIGHTS),
  holder: z.string().min(1).max(COVER_TITLE_MAX).optional(),
  note: z.string().min(1).max(COVER_NOTE_MAX).optional(),
  state: z.enum(COVER_STATES),
  source: z.strictObject({ file: rel, mime: z.string().min(1).max(100), name: z.string().min(1).max(255), durationS: z.number().positive() }),
  section: z.strictObject({ startS: z.number().min(0), endS: z.number().positive() }),
  sourceStyle: z.string().min(1).max(COVER_STYLE_MAX).optional(),
  style: z.string().max(COVER_STYLE_MAX),
  lyrics: z.string().max(COVER_LYRICS_MAX),
  score: rel.optional(),
  takes: z.array(coverTakeSchema).max(COVER_TAKE_COUNT),
  winnerSeed: seed.optional(),
  exportFile: rel.optional(),
  remix: z.strictObject({ file: rel, mime: z.string().min(1).max(100), name: z.string().min(1).max(255), style: z.string().max(COVER_STYLE_MAX) }).optional(),
  jobId: z.string().min(1).max(200).optional(),
  brief: z
    .strictObject({
      state: z.enum(COVER_BRIEF_STATES),
      jobId: z.string().min(1).max(200),
      at: z.string().min(1),
      error: z.string().max(2000).optional(),
      why: z.string().max(2000).optional(),
      agreed: z.number().int().min(0).max(3).optional(),
    })
    .optional(),
});

export const parseCoverRecord = (raw: unknown): Result<Parsed<z.output<typeof coverRecordSchema>>> => parseAt("cover", coverRecordSchema, raw);

/** An upload's fields beside its file. */
export const coverUploadSchema = z.strictObject({
  title: z.string().min(1).max(COVER_TITLE_MAX),
  rights: z.enum(COVER_RIGHTS),
  holder: z.string().min(1).max(COVER_TITLE_MAX).optional(),
  note: z.string().min(1).max(COVER_NOTE_MAX).optional(),
});
