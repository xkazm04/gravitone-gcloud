// THE LISTENER'S PURE HALF (spark suno-advisor WP2): the prompt file and its one slot, the schema
// the router is handed, the quote, and the door a model's answer passes into a StudioListen. Kept
// apart from ./listen.ts (which reads the take, the store and the vendor) so the prompt's offline
// regression (pipeline/suno-listen-regression.mts) and a test import exactly what is sent and
// judged without loading the server side.
//
// THE QUOTE IS ARITHMETIC OVER THE KERNEL TABLE, NEVER A FIGURE HERE: audio seconds x 32 tokens
// (ai.google.dev/gemini-api/docs/audio, read 2026-10-29) at the table's `audio-input-token` rate, plus
// a stated prompt allowance at the `input-token` rate and a stated output allowance (the answer AND
// the model's thinking, which Google bills as output) at the `output-token` rate. Every unit must be
// priced or the whole listen is unpriced (pricing/quote.ts) - and an unpriced listen is refused.
import { readFile } from "node:fs/promises";
import path from "node:path";

import { LISTEN_PROMINENCE, type StudioListen } from "@gt/domain/audio.suno";
import { parseStudioListen, studioListenSchema } from "@gt/domain/audio.suno.schema";
import { err, ok, type Result } from "@gt/domain/errors";
import { quote, type Quote, type Usage } from "@gt/kernel/pricing/quote";
import { PRICE_TABLE, type PriceRow } from "@gt/kernel/pricing/table";

import { SUNO_LISTEN_MODEL } from "@/lib/text/providers/google";
import type { TurnClass } from "@/lib/text/types";

export const SUNO_LISTEN_TURN = "suno-listen" satisfies TurnClass;
export const LISTEN_PROVIDER = "google";
export const LISTEN_MODEL = SUNO_LISTEN_MODEL;
export const PROMPT_FILE = path.join("pipeline", "SUNO-LISTEN-PROMPT.md");
/** The door's name: every refusal of an answer starts "listen: <path>". */
export const LISTEN_DOOR = "listen";
/** What a dry run's read names as its model: it heard nothing. */
export const STAND_IN_MODEL = "stand-in";

/** Gemini's audio tokenisation: 32 tokens per second (1 minute = 1,920 tokens). */
export const AUDIO_TOKENS_PER_SECOND = 32;
/** The prompt's own tokens, an allowance: the file is ~4.5 KB (~1,200 tokens); held high on purpose. */
export const PROMPT_TOKEN_ALLOWANCE = 2_000;
/** The answer plus the model's thinking, both billed as output. The read is ~600 tokens; thinking on
 *  this roster ran 12.8x the answer on 3.6 flash (providers/google.ts) and 3.8 "works harder", so the
 *  allowance is a ceiling for the quote, not a measurement. The settled receipt carries the real count. */
export const OUTPUT_TOKEN_ALLOWANCE = 8_000;

/** The usage a listen of this length is quoted at. */
export function listenUsage(durationS: number): Usage {
  return {
    "audio-input-token": Math.ceil(Math.max(0, durationS) * AUDIO_TOKENS_PER_SECOND),
    "input-token": PROMPT_TOKEN_ALLOWANCE,
    "output-token": OUTPUT_TOKEN_ALLOWANCE,
  };
}

/** The kernel's quote for one listen, priced for `on` (an ISO day). Unpriced carries its reason. */
export function listenQuote(durationS: number, on: string, table: readonly PriceRow[] = PRICE_TABLE): Quote {
  if (!Number.isFinite(durationS) || durationS <= 0) return { usd: null, basis: "unpriced", note: `a take of ${durationS} s has no length to price` };
  return quote({ provider: LISTEN_PROVIDER, model: LISTEN_MODEL, usage: listenUsage(durationS), on }, table);
}

/** The bill once the vendor reported its counts: audio tokens are the take's (the vendor's prompt count
 *  includes them), the rest of the prompt at the text rate, output as reported. */
export function settledQuote(durationS: number, inputTokens: number | undefined, outputTokens: number | undefined, on: string, fallback: Quote): Quote {
  if (inputTokens === undefined || outputTokens === undefined) return fallback;
  const audio = Math.min(inputTokens, Math.ceil(durationS * AUDIO_TOKENS_PER_SECOND));
  return quote({ provider: LISTEN_PROVIDER, model: LISTEN_MODEL, usage: { "audio-input-token": audio, "input-token": inputTokens - audio, "output-token": outputTokens }, on });
}

/** The prompt file as it is sent: line ends normalised (a CRLF checkout), comments stripped. */
export const stripComments = (md: string): string => md.replace(/\r\n?/g, "\n").replace(/<!--[\s\S]*?-->/g, "").trim();

export async function promptText(at: string = path.join(process.cwd(), PROMPT_FILE)): Promise<Result<string>> {
  try {
    return ok(stripComments(await readFile(at, "utf8")));
  } catch {
    return err("unavailable", `the prompt file ${path.relative(process.cwd(), at)} is missing - it is part of the code`);
  }
}

/** The whole prompt for one take. Pure, so the regression reads what would be sent. */
export function listenPrompt(template: string, durationS: number): string {
  return template.replaceAll("{{DURATION_S}}", String(Math.round(durationS * 10) / 10));
}

const words = (max: number) => ({ type: "string", maxLength: max });

/** The keys a model answers (the read minus what code sets: model, at, standIn). */
export const ANSWER_KEYS = Object.keys(studioListenSchema.shape).filter((k) => k !== "model" && k !== "at" && k !== "standIn");

/**
 * The schema the router is handed. Hand-written in the subset Gemini's responseSchema takes (type,
 * properties, required, items, enum, minimum, maximum, maxItems, maxLength - no exclusiveMinimum,
 * no additionalProperties), and held to the door's schema by the regression: same keys, same
 * prominence words, same caps. The door (studioListenSchema) is the judge either way.
 */
export const LISTEN_SCHEMA: Record<string, unknown> = {
  type: "object",
  required: ["genre", "mood", "vocals", "instruments", "sections"],
  properties: {
    genre: { type: "array", maxItems: 8, items: words(40) },
    mood: { type: "array", maxItems: 8, items: words(40) },
    bpm: { type: "number", minimum: 20, maximum: 400 },
    key: words(40),
    vocals: { type: "object", required: ["heard"], properties: { heard: { type: "boolean" }, character: words(160) } },
    instruments: {
      type: "array",
      maxItems: 16,
      items: { type: "object", required: ["name", "role", "prominence"], properties: { name: words(60), role: words(120), prominence: { type: "string", enum: [...LISTEN_PROMINENCE] } } },
    },
    sections: {
      type: "array",
      maxItems: 24,
      items: { type: "object", required: ["name", "startS", "endS", "says"], properties: { name: words(40), startS: { type: "number", minimum: 0 }, endS: { type: "number", minimum: 0 }, says: words(200) } },
    },
  },
};

/** Seconds a section may run past the measured length: decoders disagree on an mp3's length by a frame or two. */
export const SECTION_SLACK_S = 2;

/**
 * A model's answer into a StudioListen, or the refusal naming the first bad field. Code sets `model`
 * and `at`; an answer that tries to set them (or `standIn`) is refused, never overwritten - a real read
 * labelled a stand-in, or a stand-in labelled a model, is the one lie this read cannot tell. Beyond the
 * door: each section starts before it ends and inside the take. Nothing is repaired or clamped.
 */
export function readOf(answer: unknown, ctx: { readonly model: string; readonly at: string; readonly durationS: number }): Result<StudioListen> {
  if (typeof answer !== "object" || answer === null || Array.isArray(answer)) return err("invalid", `${LISTEN_DOOR}: (root): the answer is not an object`);
  for (const k of ["model", "at", "standIn"]) if (k in answer) return err("invalid", `${LISTEN_DOOR}: ${k}: the answer may not set ${k}; it is set by code`);
  const r = parseStudioListen({ ...answer, model: ctx.model, at: ctx.at });
  if (!r.ok) return r;
  for (const [i, s] of r.value.sections.entries()) {
    if (s.startS >= s.endS) return err("invalid", `${LISTEN_DOOR}: sections.${i}.endS: ${s.endS} is not after its start ${s.startS}`);
    if (s.endS > ctx.durationS + SECTION_SLACK_S) return err("invalid", `${LISTEN_DOOR}: sections.${i}.endS: ${s.endS} s is past the take's ${ctx.durationS} s`);
  }
  return r;
}

/** The DRY read: says what it is and claims nothing heard. */
export function standInRead(at: string): StudioListen {
  return { model: STAND_IN_MODEL, at, standIn: true, genre: [], mood: [], vocals: { heard: false, character: "stand-in: no model heard this take" }, instruments: [], sections: [] };
}
