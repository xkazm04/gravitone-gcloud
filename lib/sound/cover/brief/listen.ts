import { readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { parseAt } from "@gt/domain/door";
import { err, ok, type Result } from "@gt/domain/errors";

import { GOOGLE_INLINE_REQUEST_MAX_BYTES, inlineAudioBytes } from "../../../text/providers/google.ts";
import { stripComments } from "../../suno/listenPrompt.ts";

// THE BRIEF'S LISTENER, PURE HALF (cover brief WP-A): the neutral prompt and its one slot, the schema the router is
// handed, the door a read passes into the cover's folder, and the stand-in a dry job keeps. The call itself - the
// `suno-listen` turn through the text router, priced with lib/sound/suno/listenPrompt.ts listenQuote - is
// lib/producers/coverBriefActs.ts's, on the job's meter.
//
// THE PROMPT ASKS, IT DOES NOT OFFER. The Tears round (docs/concepts/track-mirror-2026-11-07.md "Round 1 failed on
// genre") measured a listener following its question: a yes/no list of genres steered three reads, an open
// description did not. So the prompt names no genre, and the measured tempo and key are not given to it either.

export const COVER_LISTEN_PROMPT = path.join("pipeline", "cover-listen-PROMPT.md");
/** What a dry job's read names as its model: it heard nothing. */
export const STAND_IN_MODEL = "stand-in";

export async function coverListenPrompt(durationS: number, at: string = path.join(process.cwd(), COVER_LISTEN_PROMPT)): Promise<Result<string>> {
  let text: string;
  try {
    text = await readFile(at, "utf8");
  } catch {
    return err("unavailable", `the prompt file ${COVER_LISTEN_PROMPT} is missing - it is part of the code`);
  }
  return ok(stripComments(text).replaceAll("{{DURATION_S}}", String(Math.round(durationS * 10) / 10)));
}

/** The vendor's name for a source's mime, or undefined for one that is not audio. */
export function vendorMime(mime: string): string | undefined {
  const m = mime.toLowerCase().split(";")[0]?.trim() ?? "";
  if (m === "audio/mpeg" || m === "audio/mp3") return "audio/mp3";
  if (m === "audio/wav" || m === "audio/x-wav" || m === "audio/wave") return "audio/wav";
  if (m.startsWith("audio/")) return m;
  return undefined;
}

/** Why a source this large cannot ride inline beside its prompt; nothing when it can. */
export function inlineRefusal(coverId: string, audioBytes: number, promptBytes: number): string | undefined {
  const body = inlineAudioBytes(audioBytes) + promptBytes;
  if (body <= GOOGLE_INLINE_REQUEST_MAX_BYTES) return undefined;
  return `cover ${coverId}'s source is ${(audioBytes / 1e6).toFixed(1)} MB; inline it would be ${(body / 1e6).toFixed(1)} MB, past the ${GOOGLE_INLINE_REQUEST_MAX_BYTES / 1e6} MB Google takes in one request`;
}

const words = (max: number) => ({ type: "string", maxLength: max });

/** The schema the router is handed, in the subset Gemini's responseSchema takes. The door below is the judge. */
export const COVER_LISTEN_SCHEMA: Record<string, unknown> = {
  type: "object",
  required: ["genres", "mood", "instruments", "drums", "bass", "voice", "production", "energyArc"],
  properties: {
    genres: { type: "array", maxItems: 6, items: words(60) },
    mood: { type: "array", maxItems: 8, items: words(40) },
    instruments: { type: "array", maxItems: 16, items: { type: "object", required: ["name", "role"], properties: { name: words(80), role: words(120) } } },
    drums: words(300),
    bass: words(300),
    voice: { type: "object", required: ["present"], properties: { present: { type: "boolean" }, kind: words(160), words: { type: "string", enum: ["words", "wordless", "none"] } } },
    production: { type: "array", maxItems: 10, items: words(80) },
    energyArc: words(400),
  },
};

const text = (max: number) => z.string().trim().max(max);

/** One read as the cover keeps it: the answer, and what code sets beside it. */
export const coverReadSchema = z
  .object({
    model: z.string().min(1).max(100),
    at: z.string().min(1),
    standIn: z.literal(true).optional(),
    genres: z.array(text(60).min(1)).max(6),
    mood: z.array(text(40).min(1)).max(8),
    instruments: z.array(z.object({ name: text(80).min(1), role: text(120) }).strict()).max(16),
    drums: text(300),
    bass: text(300),
    voice: z.object({ present: z.boolean(), kind: text(160).optional(), words: z.enum(["words", "wordless", "none"]).optional() }).strict(),
    production: z.array(text(80).min(1)).max(10),
    energyArc: text(400),
  })
  .strict();
export type CoverRead = z.output<typeof coverReadSchema>;

/** A model's answer into a kept read, or the refusal naming the first bad field. Code sets model and at; an answer
 *  that tries to set them, or to call itself a stand-in, is refused, never overwritten. */
export function coverReadOf(answer: unknown, ctx: { readonly model: string; readonly at: string }): Result<CoverRead> {
  if (typeof answer !== "object" || answer === null || Array.isArray(answer)) return err("invalid", "listen: (root): the answer is not an object");
  for (const k of ["model", "at", "standIn"]) if (k in answer) return err("invalid", `listen: ${k}: the answer may not set ${k}; it is set by code`);
  return parseAt("listen", coverReadSchema, { ...answer, model: ctx.model, at: ctx.at }) as Result<CoverRead>;
}

/** The DRY read: says what it is and claims nothing heard. */
export function standInCoverRead(at: string): CoverRead {
  return { model: STAND_IN_MODEL, at, standIn: true, genres: [], mood: [], instruments: [], drums: "stand-in: no model heard this song", bass: "", voice: { present: false }, production: [], energyArc: "" };
}
