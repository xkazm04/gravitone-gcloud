import { z } from "zod";

import { defineStepRecord, engineField, textOrNull, versionField } from "./record.ts";

// THE RESEARCH PART'S RECORDS (v1 app/_phases/research/records.ts and
// app/_phases/_shared/records/ads.ts; shapes in lib/steps/stepDataResearch.ts,
// lib/steps/stepDataMusicVideo.ts, lib/ads/types.ts). Each key stays its own record for v1's
// cadence reason - two writers sharing one record erase each other's field on every save - and
// keeps its v1 key, so the IndexedDB importer (wave D) maps one row to one row.
//
// What v1 kept only in a session and the server now keeps on the record (additive, v1 stays v1):
//   research-notebook  `followUps`, `revisions` - v1's follow-up queue and its staged notebook
//                      revisions (followup.ts / revisions.ts) lived in React state, so a reload
//                      lost a paid answer; they are the notebook's own history.
//   research-beats     `slots` - v1 dealt GLASS_HARBOR_SLOTS for every logline (lib/research/
//                      beats.ts:47); a board this project's run dealt is the project's record.

/** `{descoped, liked, deepen}` per card id (v1 ScopeStepData). */
const cardState = z.looseObject({ descoped: z.boolean(), liked: z.boolean(), deepen: z.boolean() });

export const RESEARCH = defineStepRecord({
  key: "research",
  owner: "research",
  version: 1,
  // v1: a record without `topic` is a music video's and reads as the empty topic.
  schema: z.looseObject({ ...versionField, topic: z.string().default(""), researched: z.boolean().default(false) }),
});

export const RESEARCH_NOTEBOOK = defineStepRecord({
  key: "research-notebook",
  owner: "research",
  version: 1,
  schema: z.looseObject({
    ...versionField,
    topic: z.string(),
    /** A validated notebook (lib/notebook/validate.ts checked it at the turn's landing), or null = cleared here. */
    notebook: z.looseObject({}).nullable(),
    engine: engineField.default(null),
    /** The last research turn this record took: a turn lands once, and a Clear is not undone by it. */
    turn: z.string().optional(),
    followUps: z.array(z.looseObject({ id: z.string().min(1), status: z.enum(["queued", "returned", "unanswered"]) })).default([]),
    revisions: z.array(z.looseObject({ id: z.string().min(1), requestId: z.string().min(1) })).default([]),
  }),
});

export const RESEARCH_SCOPE = defineStepRecord({
  key: "research-scope",
  owner: "research",
  version: 1,
  schema: z.looseObject({
    ...versionField,
    scope: z.record(z.string(), cardState).default({}),
    confirmed: z.record(z.string(), cardState).nullable().default(null),
    /** The NotebookSource digest these decisions were made on; another digest orphans them (scopeDigest.ts). */
    digest: z.string().optional(),
  }),
});

export const RESEARCH_MODE = defineStepRecord({
  key: "research-mode",
  owner: "research",
  version: 1,
  schema: z.looseObject({ ...versionField, mode: z.enum(["guided", "expert"]) }),
});

export const RESEARCH_BEATS = defineStepRecord({
  key: "research-beats",
  owner: "research",
  version: 1,
  // v1: its writer never saved without a mode, so a record with none is not one it wrote.
  schema: z.looseObject({
    ...versionField,
    mode: z.enum(["facts", "beats"]),
    picks: z.record(z.string(), z.string().nullable()).default({}),
    /** The frozen spine, slot -> variant: Script composes from THIS, never the live picks. */
    confirmed: z.record(z.string(), z.string()).nullable().default(null),
    slots: z.array(z.looseObject({ id: z.string().min(1), variants: z.array(z.looseObject({ id: z.string().min(1) })) })).nullable().default(null),
  }),
});

export const MUSIC_VIDEO_SOURCE = defineStepRecord({
  key: "music-video-source",
  owner: "research",
  version: 1,
  // v1 refused a field of the wrong type rather than casting: a patch over a misread record
  // would write the misreading back.
  schema: z.looseObject({
    ...versionField,
    sourceAssetId: z.string().optional(),
    style: z.string().optional(),
    envelope: z.looseObject({}).optional(),
    posterAssetId: z.string().optional(),
    seed: z.number().optional(),
    effectParams: z.looseObject({}).optional(),
    posterTurn: z.string().optional(),
  }),
});

/** v1 parseBrief: every field present, text; must-include a list of text. */
export const adBriefSchema = z.object({
  product: z.string().default(""),
  audience: z.string().default(""),
  proposition: z.string().default(""),
  tone: z.string().default(""),
  mustInclude: z.array(z.string()).default([]),
  cta: z.string().default(""),
  platform: z.string().default(""),
});

export const ADS_BRIEF = defineStepRecord({
  key: "ads-brief",
  owner: "research",
  version: 1,
  schema: z.looseObject({ ...versionField, brief: adBriefSchema.default(adBriefSchema.parse({})) }),
});

export const ADS_IDEAS = defineStepRecord({
  key: "ads-ideas",
  owner: "research",
  version: 1,
  schema: z.looseObject({
    ...versionField,
    /** The brief the ideas were generated from: a different brief on screen makes them stale. */
    briefDigest: textOrNull.default(null),
    options: z.array(z.looseObject({ id: z.string().min(1), title: z.string() })).default([]),
    pickedId: textOrNull.default(null),
    engine: engineField.default(null),
  }),
});
