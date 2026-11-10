import { z } from "zod";

import { parseAt, parseJsonAt } from "./door.ts";
import type { Result } from "./errors.ts";
import { studioSessionSchema } from "./audio.studio.events.ts";
import { LISTEN_PROMINENCE, SUNO_READ_STATUS, TASTE_LEANS, type StudioListen, type StudioTasteLine, type SunoRead, type TasteLean } from "./audio.suno.ts";

// THE SUNO ADVISOR'S TWO DOORS (spark suno-advisor): the listener model's read of a take, and the
// `audio.taste` ledger event that keeps a confirmed taste line across sessions. The zod-free names
// are ./audio.suno.ts; the studio turn's two Suno node kinds are in ./audio.studio.ts.

const words = (max: number) => z.string().trim().min(1).max(max);

/** A listener's read, held to the shape the page renders. A bad row refuses the read: a half-read
 *  presented as a whole one is worse than "the listener answered something unreadable". */
export const studioListenSchema = z.strictObject({
  model: words(80),
  at: z.string().min(10).max(40),
  standIn: z.literal(true).optional(),
  genre: z.array(words(40)).max(8),
  mood: z.array(words(40)).max(8),
  bpm: z.number().min(20).max(400).optional(),
  key: words(40).optional(),
  vocals: z.strictObject({ heard: z.boolean(), character: words(160).optional() }),
  instruments: z.array(z.strictObject({ name: words(60), role: words(120), prominence: z.enum(LISTEN_PROMINENCE) })).max(16),
  sections: z.array(z.strictObject({ name: words(40), startS: z.number().min(0), endS: z.number().positive(), says: words(200) })).max(24),
});

export function parseStudioListen(input: unknown): Result<StudioListen> {
  return parseAt("listen", studioListenSchema, input) as Result<StudioListen>;
}

/** The most of Suno's listen answer a read keeps (its prose is short; past this it is clipped, never refused). */
export const SUNO_ANSWER_MAX = 2000;

/** Suno's free reads, held to the caps the take surface draws. A refusal names the part that broke. */
export const sunoReadSchema = z.strictObject({
  at: z.string().min(10).max(40),
  status: z.enum(SUNO_READ_STATUS),
  bpm: z.number().min(20).max(400).optional(),
  key: words(40).optional(),
  timeSignature: z.number().int().min(1).max(16).optional(),
  sections: z.array(z.strictObject({ label: words(40), startS: z.number().min(0), endS: z.number().min(0) })).max(64),
  terms: z.array(words(60)).max(32),
  labels: z.array(z.strictObject({ label: words(80), p: z.number().min(0).max(1) })).max(32),
  answer: z.string().trim().min(1).max(SUNO_ANSWER_MAX).optional(),
  genre: z.array(words(40)).max(8).optional(),
  mood: z.array(words(40)).max(8).optional(),
  vocals: z.strictObject({ heard: z.boolean(), character: words(160).optional() }).optional(),
  words: z.number().int().min(0).optional(),
  listenId: z.string().min(1).max(120).optional(),
});

export function parseSunoRead(input: unknown): Result<SunoRead> {
  return parseAt("suno read", sunoReadSchema, input) as Result<SunoRead>;
}

/** What Suno's listen answer's trailing json block says, each field only when it reads as one. */
export type SunoAnswerFields = {
  readonly genre?: readonly string[];
  readonly mood?: readonly string[];
  readonly bpm?: number;
  readonly key?: string;
  readonly vocals?: { readonly heard: boolean; readonly character?: string };
};

const FENCE = /```(?:json)?\s*([\s\S]*?)```/gi;

/** The json object the answer ends with: its last fenced block, else its last top-level `{...}`. */
function trailingJson(answer: string): unknown {
  const fenced = [...answer.matchAll(FENCE)].map((m) => m[1] ?? "");
  const last = fenced.at(-1) ?? answer.slice(answer.lastIndexOf("{"), answer.lastIndexOf("}") + 1);
  const r = parseJsonAt("suno answer", z.unknown(), last.trim());
  return r.ok ? r.value : undefined;
}

const clip = (v: string, max: number): string => v.trim().replace(/\s+/g, " ").slice(0, max);

/** A list of short words: an array of strings, or one comma-separated string. */
function wordList(v: unknown): readonly string[] | undefined {
  const raw = typeof v === "string" ? v.split(",") : Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  const out = [...new Set(raw.map((x) => clip(x, 40)).filter((x) => x !== ""))].slice(0, 8);
  return out.length > 0 ? out : undefined;
}

/** Read the answer's json block tolerantly: a missing or garbled block is no fields, a bad field is that field absent. */
export function sunoAnswerFields(answer: string): SunoAnswerFields {
  const j = trailingJson(answer);
  if (typeof j !== "object" || j === null || Array.isArray(j)) return {};
  const o = j as Record<string, unknown>;
  const genre = wordList(o["genre"]);
  const mood = wordList(o["mood"]);
  const bpm = typeof o["bpm"] === "number" && o["bpm"] >= 20 && o["bpm"] <= 400 ? o["bpm"] : undefined;
  const key = typeof o["key"] === "string" && o["key"].trim() !== "" ? clip(o["key"], 40) : undefined;
  const v = o["vocals"];
  const vo = typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
  const heard = typeof v === "boolean" ? v : typeof vo?.["heard"] === "boolean" ? vo["heard"] : undefined;
  const character = typeof vo?.["character"] === "string" && vo["character"].trim() !== "" ? clip(vo["character"], 160) : undefined;
  return {
    ...(genre !== undefined ? { genre } : {}),
    ...(mood !== undefined ? { mood } : {}),
    ...(bpm !== undefined ? { bpm } : {}),
    ...(key !== undefined ? { key } : {}),
    ...(heard !== undefined ? { vocals: { heard, ...(character !== undefined ? { character } : {}) } } : {}),
  };
}

/** The taste event: one keep or drop of one line. */
export const TASTE_EVENT = "audio.taste" as const;

export const tasteEventDataSchema = z.strictObject({
  line: words(120),
  lean: z.enum(TASTE_LEANS),
  op: z.enum(["keep", "drop"]),
  /** Where the line was proposed, when it came from a turn (a drop from the taste panel has neither). */
  session: studioSessionSchema.optional(),
  turn: z.string().min(1).max(64).optional(),
});
export type TasteEventData = z.output<typeof tasteEventDataSchema>;

/** The ledger subject every taste event sits on: one profile per studio. */
export const TASTE_SUBJECT = { kind: "studio-taste", id: "owner" } as const;

/** A line's identity for the fold: case and inner spacing do not make two lines. */
export const tasteLineKey = (line: string): string => line.trim().toLowerCase().replace(/\s+/g, " ");

/** The ledger key (a key kind takes no dot): one per press, so a keep after a drop is a new event. */
export const tasteEventKey = (op: "keep" | "drop", line: string, at: string): string =>
  `audio-taste:${op}-${tasteLineKey(line).replace(/[^a-z0-9]+/g, "-").slice(0, 60)}-${at.replace(/[^0-9]/g, "")}`;

export function parseTasteEvent(data: unknown): Result<TasteEventData> {
  return parseAt(TASTE_EVENT, tasteEventDataSchema, data);
}

/** The confirmed profile: events in ledger order, the last keep/drop per line wins; oldest kept first. */
export function foldTaste(events: readonly { readonly at: string; readonly data: TasteEventData }[]): readonly StudioTasteLine[] {
  const kept = new Map<string, { line: string; lean: TasteLean; since: string }>();
  for (const e of events) {
    const k = tasteLineKey(e.data.line);
    if (e.data.op === "drop") kept.delete(k);
    else if (!kept.has(k) || kept.get(k)?.lean !== e.data.lean) kept.set(k, { line: e.data.line.trim(), lean: e.data.lean, since: e.at });
  }
  return [...kept.values()];
}
