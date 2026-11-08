import type { Channel } from "@gt/domain/channel";

import { Refusal } from "./acts";
import { CAST_PROMPT_MAX } from "./cast";

// A CHANNEL'S LOOK, composed into every panel prompt (perfect 2026-11-08, channel-look-in-frames).
//
// The channel's promise, audience and edge never reached a Flux prompt, so the six channels held their look only as far
// as the seat remembered to repeat itself in each of five panels, every night. A channel now holds ONE look - the
// operator's own words - and the door writes it into the prompts. The seat stops repeating it (SKILL.md).
//
// THE LOOK GOES FIRST. Flux 2's text encoder reads a prompt left to right and cuts it at its token limit, so the end of a
// long panel is what a limit takes: a leading look always arrives, and it is the same opening on all five frames of a
// board, which is what holds them together. It reads as the frame's register, then the panel's own subject, staging and
// camera follow - so an F1/F2 episode's impossible view is still the last, most specific word. With a cast
// (cast.ts castPrompt) the identity blocks lead the compiled prompt as before and the look follows them: the caller
// composes the look into the panels BEFORE casting.
//
// A REEL CHANNEL HAS NO PANELS (D1, D2: real-data strips authored in code), and the reel door never reads a look. The
// storyboard door refuses a reel channel's episode before this module is reached.
//
// THE CEILING. A brief's panel is held to IDEA_PROMPT_MAX (1500) at the door and Flux takes CAST_PROMPT_MAX (2000), so the
// look is capped at LOOK_MAX (400) and the two always fit: 1500 + 400 + the joint is 1902. The composed length is
// still checked here against what Flux takes - a refusal with a sentence, never a silent cut - for the day a ceiling moves.

/** The longest look a channel holds; the longest panel plus this and a joint stays under what Flux takes. */
export const LOOK_MAX = 400;

/** A channel as the store holds it: the domain's channel and, once the operator has set one, its look. */
export type LookedChannel = Channel & { readonly look?: string | undefined };

/** The channel's look, or undefined when none is set (a channel written before looks existed has no such key). */
export const lookOf = (channel: Channel): string | undefined => {
  const l = (channel as LookedChannel).look;
  return typeof l === "string" && l.trim() !== "" ? l.trim() : undefined;
};

const stop = (s: string): string => s.replace(/[\s.,;:!]+$/, "");
const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * The panels with the look written in front of each: `<look>. <panel>`. No look: the same array, so a channel without one
 * draws byte-identical prompts. A panel that already opens with the look's exact words (the seat's habit, case and
 * spacing aside) is left as written, never doubled. Refused, naming the panel, when a composed prompt is past what Flux takes.
 */
export function composeLook(look: string | undefined, panels: readonly string[], at = "storyboard"): readonly string[] {
  if (look === undefined) return panels;
  const head = stop(look);
  const lead = norm(head);
  const out = panels.map((p) => (norm(p).startsWith(lead) ? p : `${head}. ${p}`));
  const long = out.findIndex((p) => p.length > CAST_PROMPT_MAX);
  if (long >= 0) throw new Refusal(`${at}: panel ${long + 1} with its channel's look is ${out[long]?.length} characters; a Flux prompt is at most ${CAST_PROMPT_MAX}`);
  return out;
}
