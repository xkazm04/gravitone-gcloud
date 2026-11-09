// THE PRODUCTION MACHINE, zod-free (spark concept-casting-stages S0): the stage table, the ids' shapes, the closed
// sets and the event names, apart from the record schema in ./production.ts (which re-exports all of it). A screen
// draws stages from this file; importing the schema file for them would carry zod into the browser bundle
// (tests/next-gates/client-closure.test.ts holds that line).
//
// A PRODUCTION is one kept concept walked to a finished video. It never starts itself (the operator presses Start)
// and a stage is read from this record, never inferred from a night's state.

import type { ActorKind } from "./event.ts";
import { defineMachine } from "./transitions.ts";

/**
 * `prdn:<slug>`. The design note said `prod:`; that token is already the kernel router's imaging posture
 * (packages/kernel/src/router/tables.ts `prod:` row, posture.ts `image: "prod"`), so every grep for one would find
 * the other. `prdn` appears nowhere else in the tree.
 */
export const PRODUCTION_ID_RE = /^prdn:[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** `chr:<ulid>`: a character's stable id. Name is no longer identity. */
export const CHARACTER_ID_RE = /^chr:[0-9A-HJKMNP-TV-Z]{26}$/;

/**
 * The legal moves, as data. Hero shots come first and a rough cut of all beats only if they work, so a take can be
 * proven from either stage (`rough -> hero` is another round of hero shots). Casting comes only after proven. A
 * later stage may go back to casting: a re-cast marks the takes after it stale. `done` and `dropped` are terminal.
 */
export const productionMachine = defineMachine({
  accepted: ["hero", "dropped"],
  hero: ["rough", "proven", "dropped"],
  rough: ["hero", "proven", "dropped"],
  proven: ["casting", "dropped"],
  casting: ["audio", "dropped"],
  audio: ["cutting", "casting", "dropped"],
  cutting: ["done", "audio", "casting", "dropped"],
  done: [],
  dropped: [],
});
export type ProductionStage = (typeof productionMachine.states)[number];

/** Stages only the operator may enter. Agents never mark a take proven; a cast pick is the operator's on the round. */
export const OPERATOR_ONLY_STAGES: readonly ProductionStage[] = ["proven"];

/** Why this move may not happen, in a sentence naming both stages and who tried; undefined when it may. */
export function refusalOfMove(from: ProductionStage, to: ProductionStage, actor: ActorKind): string | undefined {
  if (!productionMachine.can(from, to)) return `production: ${from} -> ${to} is not a legal move`;
  if (OPERATOR_ONLY_STAGES.includes(to) && actor !== "operator") return `production: only the operator may move a production to ${to} (${actor} tried, from ${from})`;
  return undefined;
}

export const PRODUCTION_SOURCE_KINDS = ["episode", "codex-board", "outline"] as const;
export type ProductionSourceKind = (typeof PRODUCTION_SOURCE_KINDS)[number];

export const TAKE_KINDS = ["hero", "rough"] as const;
export type TakeKind = (typeof TAKE_KINDS)[number];
export const TAKE_STATES = ["rendering", "ready", "failed"] as const;
export type TakeState = (typeof TAKE_STATES)[number];

/** How the picked voice reaches the picture: `ref-audio` once the S5 proof holds, `dub` its fallback. */
export const VOICE_ROUTES = ["ref-audio", "dub", "none"] as const;
export type VoiceRoute = (typeof VOICE_ROUTES)[number];
export const MUSIC_ROUTES = ["score", "track", "none"] as const;
export type MusicRoute = (typeof MUSIC_ROUTES)[number];

/** The door over the two final-cut pipelines is chosen by format. */
export const CUT_FORMATS = ["trailer", "music-clip"] as const;
export type CutFormat = (typeof CUT_FORMATS)[number];
export const CUT_STATES = ["assembling", "on-board", "approved", "returned", "failed"] as const;
export type CutState = (typeof CUT_STATES)[number];

/** Every pool a character may enter the library from. Parody-cast is not one: its references are fan-site images. */
export const CHARACTER_ORIGINS = ["scout-character", "muse-army", "codex-kept", "casting-new"] as const;
export type CharacterOrigin = (typeof CHARACTER_ORIGINS)[number];

/** Who a character is for, as a Scout card says it. Absent reads adult. */
export const CHARACTER_AUDIENCES = ["kids", "family", "adult"] as const;
export type CharacterAudience = (typeof CHARACTER_AUDIENCES)[number];

export const LESSON_DIMENSIONS = ["beats", "art-style", "technique"] as const;
export type LessonDimension = (typeof LESSON_DIMENSIONS)[number];
export const LESSON_STATES = ["proposed", "accepted"] as const;
export type LessonState = (typeof LESSON_STATES)[number];

/** One round offers exactly this many per role, one pick each. A two-role film is two rounds. */
export const ROUND_CHARACTERS = 5;
export const ROUND_VOICES = 5;

/** Where a round's consumed credits were read: the API's `character-cost` header, else the subscription's delta. */
export const CREDIT_READS = ["character-cost-header", "subscription-delta"] as const;
export type CreditRead = (typeof CREDIT_READS)[number];

/** The ledger's event types. `lesson.confirmed` is lib/sound/lessons.ts's, so lessons are production events. */
export const PRODUCTION_EVENTS = {
  started: "production.started",
  staged: "production.staged",
  take: "production.take",
  proven: "production.proven",
  castRound: "cast.round",
  castPicked: "cast.picked",
  characterAdded: "character.added",
  characterUpdated: "character.updated",
  characterSaved: "character.saved",
  characterUsed: "character.used",
  lessonProposed: "production.lesson-proposed",
  lessonAccepted: "production.lesson-accepted",
} as const;

/** A voice preview must be heard before its pick unlocks. */
export const voicePickRefusal = (voice: { readonly heardAt?: string }): string | undefined =>
  voice.heardAt === undefined ? "cast: play this voice's preview before picking it" : undefined;
