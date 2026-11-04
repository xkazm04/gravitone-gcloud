import { z } from "zod";

import { parseAt } from "./door.ts";
import type { Result } from "./errors.ts";
import {
  AB_ANSWERS,
  AB_SOURCES,
  YUE2_COT,
  YUE2_ENGINE,
  YUE2_POST_STAGES,
  type AbPair,
  type AbVote,
  type SongScores,
  type Yue2TakeFacts,
} from "./audio.yue2.ts";

// THE SONG LAB'S DOORS (spark yue2-song-lab): a take's facts as filed, a scorer row as the WSL scorer
// returns it, and the two blind-desk events. The zod-free names are ./audio.yue2.ts. A defect's
// membership in the taxonomy is checked by lib/yue2/ab.ts against lib/sound/types DEFECTS (the
// domain cannot import lib); here it is held to a slug shape.

const words = (max: number) => z.string().trim().min(1).max(max);
const id = z.string().min(1).max(80);
const slug = z.string().regex(/^[a-z0-9-]{1,40}$/);
const unit = z.number().finite();

export const yue2ConditionSchema = z.strictObject({
  cot: z.enum(YUE2_COT),
  cfg: z.number().min(0.5).max(4).optional(),
  seed: z.number().int().min(0).max(2 ** 31 - 1),
  adapter: words(120).optional(),
  adapterStrength: z.number().min(0).max(2).optional(),
});

export const yue2TakeFactsSchema = z.strictObject({
  engine: z.literal(YUE2_ENGINE),
  condition: yue2ConditionSchema,
  style: words(1000),
  lyrics: z.string().max(12000),
  lyricsDigest: z.string().regex(/^[0-9a-f]{16}$/),
  durationS: z.number().positive().max(3600),
  rights: z.strictObject({ model: words(80), licence: words(80), policy: z.literal("warn") }),
  lineage: z.strictObject({
    sourceTakeId: id.optional(),
    postStages: z.array(z.enum(YUE2_POST_STAGES)).max(YUE2_POST_STAGES.length),
    referenceTakeId: id.optional(),
  }),
});

export function parseYue2TakeFacts(input: unknown): Result<Yue2TakeFacts> {
  return parseAt("yue2-facts", yue2TakeFactsSchema, input) as Result<Yue2TakeFacts>;
}

export const songScoresSchema = z.strictObject({
  sha: z.string().regex(/^[0-9a-f]{64}$/),
  scorerVersion: z.number().int().min(1),
  wer: unit.min(0).optional(),
  werSd: unit.min(0).optional(),
  per: unit.min(0).optional(),
  songEval: z
    .strictObject({ coherence: unit, musicality: unit, memorability: unit, clarity: unit, naturalness: unit })
    .optional(),
  aesthetics: z.strictObject({ ce: unit, cu: unit, pc: unit, pq: unit }).optional(),
  buzzIdx: unit.optional(),
  transcript: z.string().max(20000).optional(),
  scoredAt: z.string().min(10).max(40),
});

export function parseSongScores(input: unknown): Result<SongScores> {
  return parseAt("song-scores", songScoresSchema, input) as Result<SongScores>;
}

export const abPairSchema = z
  .strictObject({
    pairId: z.string().regex(/^[0-9a-f]{16}$/),
    source: z.enum(AB_SOURCES),
    takeA: id,
    takeB: id,
    windowS: z.tuple([z.number().min(0), z.number().positive()]),
    side: z.enum(["ab", "ba"]),
  })
  .refine((p) => p.takeA !== p.takeB, { message: "a pair needs two different takes" })
  .refine((p) => p.windowS[1] > p.windowS[0], { message: "the window must end after it starts" });

export function parseAbPair(input: unknown): Result<AbPair> {
  return parseAt("ab-pair", abPairSchema, input) as Result<AbPair>;
}

const answer = z.enum(AB_ANSWERS);

export const abVoteSchema = z
  .strictObject({
    pairId: z.string().regex(/^[0-9a-f]{16}$/),
    answers: z.strictObject({ lyrics: answer, vocal: answer, release: answer }),
    defect: slug.optional(),
    note: words(500).optional(),
  })
  .refine((v) => !Object.values(v.answers).includes("neither") || v.defect !== undefined, {
    message: "a 'neither' answer names the defect",
    path: ["defect"],
  });

export function parseAbVote(input: unknown): Result<AbVote> {
  return parseAt("ab-vote", abVoteSchema, input) as Result<AbVote>;
}
