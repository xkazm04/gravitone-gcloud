// THE SONG LAB'S VOCABULARY, zod-free so a client island can import it (spark yue2-song-lab). The
// lab runs YuE2-3B (m-a-p, open weights) in WSL on this box: a batch of seeds renders takes, every
// take is scored (lyric WER by ASR, SongEval, Audiobox aesthetics, buzz), a post-chain makes
// variants (master to a reference, stems, debuzz), and the owner judges pairs BLIND. The recipe and
// the gate below are measured, not chosen (kiro/yue2-lab ANALYSIS-gen2, 2026-11-04: cot=off cfg 1.5
// passed the lyric gate on 5/8 seeds; the failure mode is a looping chorus, not diction).
// The doors are ./audio.yue2.schema.ts.
//
// Absent-value convention: an optional field is OMITTED, never null; a score the scorer could not
// compute is an absent key, never 0.

/** The engine id a YuE2 take's facts carry. */
export const YUE2_ENGINE = "yue2" as const;

export const YUE2_COT = ["full", "melody", "off"] as const;
export type Yue2Cot = (typeof YUE2_COT)[number];

/** One render's generation settings. `adapter` names a LoRA file under the WSL lab's adapters/. */
export type Yue2Condition = {
  readonly cot: Yue2Cot;
  /** Semantic-stage guidance; absent = the model's per-mode default (full/melody 1.0, off 1.01). */
  readonly cfg?: number;
  readonly seed: number;
  readonly adapter?: string;
  readonly adapterStrength?: number;
};

/** The measured recipe the launch form defaults to. */
export const YUE2_RECIPE = { cot: "off", cfg: 1.5, seeds: 8, gateWer: 0.1 } as const satisfies {
  readonly cot: Yue2Cot;
  readonly cfg: number;
  readonly seeds: number;
  readonly gateWer: number;
};

/** The rights record every YuE2 take carries from filing (warn-only policy: shown, never blocking). */
export type Yue2Rights = {
  readonly model: string;
  readonly licence: string;
  readonly policy: "warn";
};
export const YUE2_RIGHTS: Yue2Rights = { model: "m-a-p/YuE2-3B", licence: "CC BY-NC 4.0", policy: "warn" };

/** Post-chain stages a variant can carry, in the order they are applied. */
export const YUE2_POST_STAGES = ["stems", "debuzz", "master"] as const;
export type Yue2PostStage = (typeof YUE2_POST_STAGES)[number];

/** Where a take came from, beyond its own render. */
export type Yue2Lineage = {
  /** The raw take a post variant was made from. */
  readonly sourceTakeId?: string;
  readonly postStages: readonly Yue2PostStage[];
  /** The reference take a `master` stage matched to. */
  readonly referenceTakeId?: string;
};

/** What the lab knows about one of its takes, beyond the SoundTake row. */
export type Yue2TakeFacts = {
  readonly engine: typeof YUE2_ENGINE;
  readonly condition: Yue2Condition;
  readonly style: string;
  readonly lyrics: string;
  /** sha1 of the normalised lyrics, first 16 hex: groups takes rendered from one sheet. */
  readonly lyricsDigest: string;
  readonly durationS: number;
  readonly rights: Yue2Rights;
  readonly lineage: Yue2Lineage;
};

/** The scorer's version; a new scorer bumps it and the derived table keeps both rows. */
export const SONG_SCORER_VERSION = 1 as const;

/** One take's scores (the derived `audio_song_scores` row). Every metric is optional (absent = not computed). */
export type SongScores = {
  readonly sha: string;
  readonly scorerVersion: number;
  /** Standard WER incl. inserted repeats (the lyric gate reads this one). */
  readonly wer?: number;
  /** Insertion-free WER (S+D)/N: diction, ignoring a looped chorus. */
  readonly werSd?: number;
  readonly per?: number;
  readonly songEval?: {
    readonly coherence: number;
    readonly musicality: number;
    readonly memorability: number;
    readonly clarity: number;
    readonly naturalness: number;
  };
  readonly aesthetics?: { readonly ce: number; readonly cu: number; readonly pc: number; readonly pq: number };
  /** 4-12 kHz envelope periodicity at the VAE frame rate, dB over neighbours. */
  readonly buzzIdx?: number;
  readonly transcript?: string;
  readonly scoredAt: string;
};

/** The three pair kinds the blind desk serves. */
export const AB_SOURCES = ["post-variant", "best-of-n", "across-conditions"] as const;
export type AbSource = (typeof AB_SOURCES)[number];

/** The three forced-choice questions, in the order they are asked. */
export const AB_QUESTIONS = ["lyrics", "vocal", "release"] as const;
export type AbQuestion = (typeof AB_QUESTIONS)[number];

export const AB_ANSWERS = ["a", "b", "neither"] as const;
export type AbAnswer = (typeof AB_ANSWERS)[number];

/** Which take plays as arm A: `ab` = takeA is A, `ba` = takeB is A. Hidden from the read until the vote. */
export type AbSide = "ab" | "ba";

/** The length of the blind window, seconds from the first vocal onset. */
export const AB_WINDOW_S = 25 as const;

export const AB_QUEUE_EVENT = "audio.ab.queue" as const;
export const AB_VOTE_EVENT = "audio.ab.vote" as const;

/** A queued blind pair (the `audio.ab.queue` event's data). */
export type AbPair = {
  readonly pairId: string;
  readonly source: AbSource;
  readonly takeA: string;
  readonly takeB: string;
  readonly windowS: readonly [number, number];
  readonly side: AbSide;
};

/** A vote (the `audio.ab.vote` event's data). `defect` is required when any answer is `neither`;
 *  its values are lib/sound/types DEFECTS (the registry's generated-audio defect taxonomy). */
export type AbVote = {
  readonly pairId: string;
  readonly answers: Readonly<Record<AbQuestion, AbAnswer>>;
  readonly defect?: string;
  readonly note?: string;
};

/** Event keys: one queue and one vote per pair. */
export const abQueueKey = (pairId: string) => `audio-ab-queue:${pairId}`;
export const abVoteKey = (pairId: string) => `audio-ab-vote:${pairId}`;
