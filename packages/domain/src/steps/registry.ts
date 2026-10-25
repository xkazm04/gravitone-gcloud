import type { z } from "zod";

import type { Result } from "../errors.ts";
import { err } from "../errors.ts";
import { ADS_SHOTS, FRAMES, FRAMES_ALTS } from "./frames.ts";
import { ADS_FINISH, ADS_SCORE, CUT, MOTION_DIRECTION, SCORE } from "./finish.ts";
import { ARTICLE, RENDER, STRIPS, VOICE, WORDS } from "./parts.ts";
import { decodeStep, encodeStep, STEP_OWNERS, type StepOwner, type StepRecordDef } from "./record.ts";
import { ADS_BRIEF, ADS_IDEAS, MUSIC_VIDEO_SOURCE, RESEARCH, RESEARCH_BEATS, RESEARCH_MODE, RESEARCH_NOTEBOOK, RESEARCH_SCOPE } from "./research.ts";
import { ADS_SCENARIOS, SCRIPT_ADOPTED, SCRIPT_TRAILER, SCRIPT_VERSIONS } from "./script.ts";
import { STILL } from "./still.ts";

// EVERY STEP RECORD, DECLARED ONCE - the server's RECORD_DEFS. v1's list (stepContract.ts:133)
// carried ten of the twenty-one keys, so frames-alts, motion-direction and every ads-* record
// had no door and no verdict could read them; this one carries all of them, and the kernel
// refuses a key that is not here.
//
// A record is OWNED by one part kind (the part whose row holds it) and may be GROWN by another:
// v1's Motion wrote `clip.motion` into the frames record and patched `ads-shots`, Frames patched
// `music-video-source` (INVENTORY §0). Those cross-writes are declared here, so an op that
// writes a record its part neither owns nor grows is a refusal, not a silent reach.

export const STEP_RECORDS = {
  still: STILL,
  research: RESEARCH,
  "research-notebook": RESEARCH_NOTEBOOK,
  "research-scope": RESEARCH_SCOPE,
  "research-mode": RESEARCH_MODE,
  "research-beats": RESEARCH_BEATS,
  "music-video-source": MUSIC_VIDEO_SOURCE,
  "ads-brief": ADS_BRIEF,
  "ads-ideas": ADS_IDEAS,
  "script-adopted": SCRIPT_ADOPTED,
  "script-versions": SCRIPT_VERSIONS,
  "script-trailer": SCRIPT_TRAILER,
  "ads-scenarios": ADS_SCENARIOS,
  frames: FRAMES,
  "frames-alts": FRAMES_ALTS,
  "ads-shots": ADS_SHOTS,
  "motion-direction": MOTION_DIRECTION,
  score: SCORE,
  "ads-score": ADS_SCORE,
  cut: CUT,
  "ads-finish": ADS_FINISH,
  words: WORDS,
  render: RENDER,
  article: ARTICLE,
  strips: STRIPS,
  voice: VOICE,
} as const;

export type StepKey = keyof typeof STEP_RECORDS;

// Each def is filed under its own key: a def filed under another's would decode that key's rows
// through the wrong door, and every reader and test would still see a record. tsc holds it.
const filedUnderItsKey: { readonly [K in StepKey]: StepRecordDef<K, z.ZodType> } = STEP_RECORDS;
void filedUnderItsKey;
export type StepData<K extends StepKey> = z.output<(typeof STEP_RECORDS)[K]["schema"]>;
/** A part's records as a reader holds them: decoded, by key; absent = never written. */
export type StepRecords = { readonly [K in StepKey]?: StepData<K> };

export const STEP_KEYS = Object.keys(STEP_RECORDS) as readonly StepKey[];

export function isStepKey(key: string): key is StepKey {
  return Object.hasOwn(STEP_RECORDS, key);
}

/** The part kinds that hold step records (STEP_OWNERS). */
export type StepKind = StepOwner;

/** What each kind may write besides what it owns (v1's cross-writes, INVENTORY §0). */
const GROWS: { readonly [K in StepKind]: readonly StepKey[] } = {
  research: [],
  script: [],
  frames: ["music-video-source"],
  motion: ["frames", "ads-shots"],
  score: [],
  cut: [],
  still: [],
  words: [],
  render: [],
  article: [],
  strips: [],
  voice: [],
};

export function ownedBy(kind: StepKind): StepKey[] {
  return STEP_KEYS.filter((k) => STEP_RECORDS[k].owner === kind);
}

export function writableBy(kind: StepKind): ReadonlySet<StepKey> {
  return new Set([...ownedBy(kind), ...GROWS[kind]]);
}

export function isStepKind(kind: string): kind is StepKind {
  return (STEP_OWNERS as readonly string[]).includes(kind);
}

type AnyDef = StepRecordDef<string, z.ZodType>;
const defOf = (key: StepKey): AnyDef => STEP_RECORDS[key];

/** Stored -> decoded, through the key's door. */
export function decodeRecord(key: string, stored: unknown): Result<unknown> {
  if (!isStepKey(key)) return err("invalid", `no step record ${key}`);
  return decodeStep(defOf(key), stored);
}

/** A record on its way to the store, stamped with its version. */
export function encodeRecord(key: string, data: unknown): Result<unknown> {
  if (!isStepKey(key)) return err("invalid", `no step record ${key}`);
  return encodeStep(defOf(key), data);
}
