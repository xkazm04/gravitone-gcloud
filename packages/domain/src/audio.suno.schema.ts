import { z } from "zod";

import { parseAt } from "./door.ts";
import type { Result } from "./errors.ts";
import { studioSessionSchema } from "./audio.studio.events.ts";
import { LISTEN_PROMINENCE, TASTE_LEANS, type StudioListen, type StudioTasteLine, type TasteLean } from "./audio.suno.ts";

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
