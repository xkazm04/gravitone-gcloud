// A STILL SHAPED FOR THE STUDIO (spark scout-vision S6, studio-first stills) - what a request must
// look like before it reaches providers/leonardoStudio.ts, so the studio never refuses it late.
//
// The operator, 2026-10-26: the Leonardo studio "still has plenty of credits ... we should stick with
// it". The API pool was empty and four style extracts died on "Insufficient tokens" the night before;
// the scout's replicas, concepts and extract stills moved to the studio. The studio is narrower than
// the API, and each narrowing is met here, once, rather than at every caller:
//   · ASPECT. Its aspect radios are 16:9, 1:1 and 9:16 (selectors.ts `form.aspect`, 2026-10-12 recon).
//     Extract's replica asks for the nearest aspect of its sources, which can be 4:5; the portrait
//     radio is the nearest the page has.
//   · QUALITY. Low (8 credits, the button's label at Small/Low) for every scout still; Medium is 20.
//   · PROMPT. The provider refuses past 1500 characters, the negative included ("Avoid: ..." is
//     appended in prose). A refusal there comes after the job was launched and its receipt read, so
//     the prompt is cut here: at the last sentence that fits, else hard at the limit.
//   · NO SEED. The studio has no seed field; the request's seed is carried and ignored.

import type { Aspect, GenerateRequest } from "../types";

/** The studio box's ceiling, the API adapter's too: the prompt and its "Avoid:" sentence together. */
export const STUDIO_MAX_PROMPT_CHARS = 1500;

/** The aspect the studio has a radio for: 4:5 draws as 9:16, the others as asked. */
export const studioAspect = (aspect: Aspect): Aspect => (aspect === "4:5" ? "9:16" : aspect);

/** The prose the provider appends for a negative prompt (providers/leonardoStudio.ts `generate`). */
const AVOID = "\n\nAvoid: ";
const avoidOf = (negative: string | undefined): string => (negative?.trim() ? `${AVOID}${negative.trim()}` : "");

/**
 * `text` cut to at most `max` characters: whole sentences while the last one that fits ends past half
 * of `max` (a cut that would throw most of the prompt away is not a sentence boundary worth keeping),
 * else a hard cut at `max`.
 */
export function trimAtSentence(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  if (max <= 0) return "";
  const head = t.slice(0, max);
  let end = -1;
  for (const m of head.matchAll(/[.!?]["')\]]?(?=\s|$)/g)) end = m.index + m[0].length;
  return end >= max / 2 ? head.slice(0, end) : head.trimEnd();
}

/**
 * The prompt and negative that fit the studio box together. The negative is the smaller part and is
 * kept whole when it can be (at most a third of the box); the prompt takes what is left.
 */
export function fitStudioPrompt(prompt: string, negativePrompt?: string): { readonly prompt: string; readonly negativePrompt?: string } {
  const avoidRoom = Math.floor(STUDIO_MAX_PROMPT_CHARS / 3);
  let negative = negativePrompt?.trim() ? negativePrompt.trim() : undefined;
  if (negative !== undefined && avoidOf(negative).length > avoidRoom) negative = trimAtSentence(negative, avoidRoom - AVOID.length);
  const room = STUDIO_MAX_PROMPT_CHARS - avoidOf(negative).length;
  return { prompt: trimAtSentence(prompt, room), ...(negative === undefined ? {} : { negativePrompt: negative }) };
}

/**
 * A request as the studio will take it - LOW, a radio's aspect, a prompt that fits - when it names the
 * studio; any other request comes back as it was.
 */
export function studioShaped(req: GenerateRequest): GenerateRequest {
  if (req.prefer !== "leonardo-studio") return req;
  const fit = fitStudioPrompt(req.prompt, req.negativePrompt);
  const { negativePrompt: _n, ...rest } = req;
  return { ...rest, ...fit, aspect: studioAspect(req.aspect), quality: "low" };
}
