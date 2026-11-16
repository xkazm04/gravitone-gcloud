// THE PRODUCTION CONTRACT (spark concept-casting-stages S0): the wire shapes the later sessions build on. A kept
// concept started as a Production moves through ./production.machine.ts's stages; a casting round offers 5 candidate
// characters and 5 designed voices per role; a finished video proposes lessons for the operator to accept.
//
// ABSENT VALUES: OMIT THE KEY. No record here spells an absent value as null, "" or undefined; an optional field is
// either present with a real value or not there at all (`parseAt` drops undefined at the door).
//
// A screen imports these TYPES (`import type`) and takes the stage table and the closed sets from
// ./production.machine.ts: this file carries zod.

import { z } from "zod";

import { blobRefSchema } from "./blob.ts";
import { VENTURE_ID_RE } from "./genre.ts";
import {
  CAST_CANDIDATE_STATES,
  CHARACTER_AUDIENCES,
  CHARACTER_ID_RE,
  CHARACTER_ORIGINS,
  CREDIT_READS,
  CUT_FORMATS,
  CUT_STATES,
  LESSON_DIMENSIONS,
  LESSON_STATES,
  MUSIC_ROUTES,
  PRODUCTION_ID_RE,
  PRODUCTION_SOURCE_KINDS,
  ROUND_CHARACTERS,
  ROUND_VOICES,
  SOUND_ROUTES,
  TAKE_KINDS,
  TAKE_STATES,
  VOICE_PROOF_OUTCOMES,
  VOICE_ROUTES,
  productionMachine,
} from "./production.machine.ts";

export {
  CAST_CANDIDATE_STATES,
  CHARACTER_AUDIENCES,
  CHARACTER_ID_RE,
  CHARACTER_ORIGINS,
  CREDIT_READS,
  CUT_FORMATS,
  CUT_STATES,
  LESSON_DIMENSIONS,
  LESSON_STATES,
  MUSIC_ROUTES,
  OPERATOR_ONLY_STAGES,
  PRODUCTION_EVENTS,
  PRODUCTION_ID_RE,
  PRODUCTION_SOURCE_KINDS,
  ROUND_CHARACTERS,
  ROUND_VOICES,
  SOUND_ROUTES,
  TAKE_KINDS,
  TAKE_STATES,
  VOICE_PROOF_OUTCOMES,
  VOICE_ROUTES,
  cutFormatOf,
  lessonIdOf,
  productionMachine,
  refusalOfMove,
  voicePickRefusal,
  type CastCandidateState,
  type CharacterAudience,
  type CharacterOrigin,
  type CreditRead,
  type CutFormat,
  type CutState,
  type LessonDimension,
  type LessonState,
  type MusicRoute,
  type ProductionSourceKind,
  type ProductionStage,
  type SoundRoute,
  type TakeKind,
  type TakeState,
  type VoiceProofOutcome,
  type VoiceRoute,
} from "./production.machine.ts";

export const productionIdSchema = z.string().regex(PRODUCTION_ID_RE).brand<"ProductionId">();
export type ProductionId = z.output<typeof productionIdSchema>;
export const characterIdSchema = z.string().regex(CHARACTER_ID_RE).brand<"CharacterId">();
export type CharacterId = z.output<typeof characterIdSchema>;

const text = z.string().min(1);
const at = z.string().min(1);

export const productionStageSchema = z.enum(productionMachine.states);

/**
 * Where a production came from. `ref` by kind: episode `<channel>/<episode>`, codex-board `<date>/<cell>`,
 * outline `<outline id>`.
 */
export const productionSourceSchema = z.object({ kind: z.enum(PRODUCTION_SOURCE_KINDS), ref: text });
export type ProductionSource = z.output<typeof productionSourceSchema>;

export const productionTakeSchema = z.object({
  id: text,
  kind: z.enum(TAKE_KINDS),
  state: z.enum(TAKE_STATES),
  /** The beats it covers: one or a few for a hero shot, all of them for a rough cut. */
  beats: z.array(text).min(1),
  /** Panel ids animated, in order: a hero shot's first (and last) frame, or a rough cut's one panel per beat. */
  frames: z.array(text).min(1),
  /** The words sent to the engine: one motion line for a hero shot, a rough cut's per-beat lines joined by newlines. */
  prompt: text,
  /** The one seed every clip of this take runs on. */
  seed: z.number().int().nonnegative(),
  /** The engine that rendered it (a dry take names the engine it stood in for). */
  engine: text,
  at,
  /** A served address; omitted until the render lands. */
  video: text.optional(),
  poster: text.optional(),
  /** The render's own sentence; only on a failed take. */
  error: text.optional(),
  /** Seconds of video this take holds; omitted until it lands. */
  durationS: z.number().nonnegative().optional(),
  /** Wall seconds its clips held the card, measured around the render; 0 on a dry take; omitted until it lands. */
  gpuSeconds: z.number().nonnegative().optional(),
  /** The kernel job that renders it. */
  jobId: text.optional(),
  /** Present when a dry stand-in answered: no render ran and there is nothing to watch. */
  dry: z.literal(true).optional(),
  /** Set by the operator only (OPERATOR_ONLY_STAGES). */
  provenAt: at.optional(),
  provenBy: text.optional(),
  /** Present when this take renders a cast character speaking through ref2va (the S5 route, off until the proof holds). */
  speaking: z.object({ roleId: text }).optional(),
  /** Present when a re-cast after this take made it stale. */
  stale: z.literal(true).optional(),
});
export type ProductionTake = z.output<typeof productionTakeSchema>;

/** What a role was cast with. Written only by the operator's pick (`cast.picked`). */
export const roleCastSchema = z.object({
  characterId: characterIdSchema,
  voiceId: text,
  roundId: text,
  pickedAt: at,
  pickedBy: text,
  /** Present when a dry round made this pick: a stand-in voice, so it cannot carry the production past casting. */
  dry: z.literal(true).optional(),
});
export type RoleCast = z.output<typeof roleCastSchema>;

export const productionRoleSchema = z.object({
  id: text,
  name: text,
  /** What the role needs, in the words the matcher and the voice design read. */
  brief: text,
  /** Written per role, since a new concept has no lines yet. */
  auditionScript: text.optional(),
  /** Omitted until a pick locks. */
  cast: roleCastSchema.optional(),
});
export type ProductionRole = z.output<typeof productionRoleSchema>;

export const characterCardSchema = z.object({ name: text, look: text, personality: text, age: z.number().int().positive().optional() });
export type CharacterCard = z.output<typeof characterCardSchema>;

/** Where a reused character was used before: a line of the character's used-by list. */
export const characterUseSchema = z.object({ productionId: productionIdSchema.optional(), label: text, at });
export type CharacterUse = z.output<typeof characterUseSchema>;

/**
 * One of a round's 5 character options: a match from the library (`reused`, carrying where it was used before) or
 * designed for this case (`new`, no record until saved). `images` is empty only while a new design is rendering.
 */
export const characterCandidateSchema = z.discriminatedUnion("origin", [
  z.object({ id: text, origin: z.literal("reused"), characterId: characterIdSchema, card: characterCardSchema, images: z.array(text), usedBefore: z.array(characterUseSchema).min(1), match: text.optional() }),
  z.object({ id: text, origin: z.literal("new"), card: characterCardSchema, images: z.array(text), state: z.enum(CAST_CANDIDATE_STATES).optional(), error: text.optional() }),
]);
export type CharacterCandidate = z.output<typeof characterCandidateSchema>;

/** One of a round's 5 designed voices. No vendor voice exists until the pick (`createdVoiceId`). */
export const voiceCandidateSchema = z.object({
  id: text,
  label: text,
  /** The design prompt, with its direction tags. */
  design: text,
  /** Omitted until the design call answers. Mastered to one level before comparison. */
  preview: z.object({ url: text, lufs: z.number() }).optional(),
  /** Omitted until the operator has played the preview: the pick stays locked. */
  heardAt: at.optional(),
  /** The vendor voice, created only on the pick. */
  createdVoiceId: text.optional(),
});
export type VoiceCandidate = z.output<typeof voiceCandidateSchema>;

/** How far a round's job got; omitted while nothing is known of it. */
export const castJobSchema = z.object({ id: text, state: text, done: z.number().int().nonnegative(), total: z.number().int().nonnegative(), step: text.optional(), error: text.optional() });
export type CastJob = z.output<typeof castJobSchema>;

/** One casting round for one role. A pick is the operator's alone; `creditsUsed` comes from the API, never a guess. */
export const castRoundSchema = z.object({
  id: text,
  productionId: productionIdSchema,
  roleId: text,
  at,
  characters: z.array(characterCandidateSchema).length(ROUND_CHARACTERS),
  voices: z.array(voiceCandidateSchema).length(ROUND_VOICES),
  /** Candidate ids; each key omitted until picked. */
  picks: z.object({ character: text.optional(), voice: text.optional() }),
  creditsUsed: z.number().int().nonnegative(),
  creditsRead: z.enum(CREDIT_READS),
  /** Present when the operator asked to keep the picked character in the library. */
  saveToLibrary: z.literal(true).optional(),
  /** Present when a dry round: previews are silent stand-ins and no vendor was called. */
  dry: z.literal(true).optional(),
  /** Calls whose consumption could not be read, so `creditsUsed` is short by them. */
  unreadCalls: z.number().int().positive().optional(),
  /** The new designs' job, omitted when every candidate was reused. */
  drawJob: castJobSchema.optional(),
  voiceJob: castJobSchema.optional(),
  /** The picked voice's creation job, while a pick is waiting on the vendor. */
  createJob: castJobSchema.optional(),
});
export type CastRound = z.output<typeof castRoundSchema>;

export const characterRecordSchema = z.object({
  id: characterIdSchema,
  origin: z.enum(CHARACTER_ORIGINS),
  card: characterCardSchema,
  images: z.array(text),
  /** The vendor voice it was cast with; omitted until it has one. */
  voiceId: text.optional(),
  /** The kept reference sheet's address, one of `images`; omitted until there is one. */
  sheet: text.optional(),
  /** Who it is for, from a Scout card. Absent reads adult. A kids or family character is never cast into adult work. */
  audience: z.enum(CHARACTER_AUDIENCES).optional(),
  /** What the source held beyond the card (a muse-army card's hair, wardrobe, role, rating): searched, never identity. */
  slots: z.record(text, text).optional(),
  /** Present when the Library shows it: every import, or the operator's save. Absent, it lives only in its production. */
  savedToLibrary: z.literal(true).optional(),
  createdAt: at,
});
export type CharacterRecord = z.output<typeof characterRecordSchema>;

/**
 * The operator's audio decision (`production.audio`), one record per production at stage `audio`. `musicRef` is the
 * source reference of the music: a blob address or sha256 of a Library track; required for `score` and `track`.
 */
export const productionAudioSchema = z.object({ voice: z.enum(VOICE_ROUTES), music: z.enum(MUSIC_ROUTES), sound: z.enum(SOUND_ROUTES).optional(), musicRef: text.optional(), note: text.optional(), decidedAt: at, decidedBy: text });
export type ProductionAudio = z.output<typeof productionAudioSchema>;

export const productionCutSchema = z.object({
  /** `cut-N`, appended: a returned cut stays. */
  id: text,
  /** The take ids assembled, in cut order. */
  takes: z.array(text),
  format: z.enum(CUT_FORMATS),
  state: z.enum(CUT_STATES),
  /** The launch receipt; omitted before a launch. */
  receipt: text.optional(),
  /** The Board gate it waits on, `pkt:...`; omitted until it lands there. */
  packetId: text.optional(),
  video: text.optional(),
  error: text.optional(),
  /** The kernel job assembling it. */
  jobId: text.optional(),
  /** Present when a dry job answered: no video exists and nothing reaches the Board. */
  dry: z.literal(true).optional(),
  durationS: z.number().nonnegative().optional(),
  /** What the door could not hold whole (a line cut at the picture's end, a track trimmed). */
  note: text.optional(),
  at,
});
export type ProductionCut = z.output<typeof productionCutSchema>;

/** The stored result of the ref-audios proof: the only way `ref-audio` becomes a route anyone can pick. */
export const voiceProofSchema = z.object({ outcome: z.enum(VOICE_PROOF_OUTCOMES), note: text.optional(), evidence: text.optional(), at, by: text });
export type VoiceProof = z.output<typeof voiceProofSchema>;

/** One piece of evidence a lesson rests on: its address in the production and the words it says. */
export const lessonSourceSchema = z.object({ ref: text, words: text });
export type LessonSource = z.output<typeof lessonSourceSchema>;

export const productionLessonSchema = z.object({
  id: text,
  productionId: productionIdSchema,
  dimension: z.enum(LESSON_DIMENSIONS),
  state: z.enum(LESSON_STATES),
  /** The current words: the model's, the operator's edit of them, or (state `nothing`) why the evidence holds none. */
  text,
  /** The model's words, kept only when the operator changed them. */
  proposedText: text.optional(),
  /** Where the seat says it came from: every entry is a piece of the production's own evidence. Empty only for `nothing`. */
  drawnFrom: z.array(lessonSourceSchema),
  /** Present when a dry stand-in wrote it: it can never be accepted. */
  dry: z.literal(true).optional(),
  proposedAt: at,
  acceptedAt: at.optional(),
  acceptedBy: text.optional(),
});
export type ProductionLesson = z.output<typeof productionLessonSchema>;

/** One storyboard frame of the concept, held by its bytes at Start so a later change to the source cannot move it. */
export const productionPanelSchema = z.object({
  /** `panel-1`, in order. */
  id: text,
  /** The beat it draws, in the concept's own words. */
  beat: text,
  /** The still's prompt: the default motion line. */
  prompt: text,
  still: blobRefSchema,
});
export type ProductionPanel = z.output<typeof productionPanelSchema>;

export const PRODUCTION_ASPECTS = ["16:9", "9:16"] as const;
export type ProductionAspect = (typeof PRODUCTION_ASPECTS)[number];

/** The concept as it stood at Start: its words and frames. Fixed from then on (the kernel record's triggers). */
export const productionBoardSchema = z.object({ logline: text, aspect: z.enum(PRODUCTION_ASPECTS), panels: z.array(productionPanelSchema).min(1) });
export type ProductionBoard = z.output<typeof productionBoardSchema>;

export const productionSchema = z.object({
  id: productionIdSchema,
  title: text,
  source: productionSourceSchema,
  stage: productionStageSchema,
  board: productionBoardSchema,
  takes: z.array(productionTakeSchema),
  roles: z.array(productionRoleSchema),
  audio: productionAudioSchema.optional(),
  cut: productionCutSchema.optional(),
  /** `vn-...`; omitted until it starts or joins a venture. */
  ventureId: z.string().regex(VENTURE_ID_RE).optional(),
  startedAt: at,
  startedBy: text,
});
export type Production = z.output<typeof productionSchema>;
