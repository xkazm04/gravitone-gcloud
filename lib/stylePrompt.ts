// STYLE BLOCK → PROMPT. The one compiler.
//
// Three findings from the research batch are encoded here, and each is the kind
// that only shows up after forty frames rather than after one:
//
//  1. THE STYLE BLOCK IS RESTATED IN FULL, EVERY TIME — even when approved
//     reference images are attached. Attaching the reference alone was measured
//     letting the look drift *inside a single clip*. So there is no "short
//     form" of this function, and callers cannot opt out of the style half.
//
//  2. COLOUR IS ASSIGNED, NOT LISTED. "navy, cream and cyan" is a palette a
//     model re-casts every frame; "navy as ground, cream for objects, cyan only
//     for the accent" is one it can hold. Hence ColorRole.
//
//  3. THE MODEL DRAWS NO TEXT. Captions, numbers and callouts are our vector
//     layer, bound to the notebook's facts — so a plate that contains letters
//     is not a nicer plate, it is an unusable one. This is a constraint of the
//     architecture, not a preference, which is why it is welded into the
//     compiler rather than left to each caller to remember.

import type { ColorRole, StyleBlock } from "./themes";

const ROLE_PHRASE: Record<ColorRole, string> = {
  ground: "as the dominant background",
  objects: "for the objects",
  accent: "used only on the single element that carries the point, and nowhere else",
};

/** The style half — identical across every frame in a project. */
export function compileStyleBlock(b: StyleBlock): string {
  const palette = b.palette
    .map((c) => `${c.name} (${c.hex}) ${ROLE_PHRASE[c.role]}`)
    .join(", ");
  return [
    `${b.technique}.`,
    `${b.subject}.`,
    `Strict three-colour palette: ${palette}.`,
    `${b.finish}.`,
  ].join(" ");
}

/** The constraint that makes a plate a plate. Always appended. */
export const NO_TEXT_CLAUSE =
  "No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.";

/** For vendors that take a negative prompt. Leonardo does; Google does not, and
 *  its adapter folds this into an exclusion clause instead. */
export const NEGATIVE_PROMPT =
  "text, letters, numbers, words, typography, labels, captions, watermark, signature, logo, " +
  "photorealistic, photograph, 3D render, gradient, glow, bevel, drop shadow, noise texture, " +
  "clutter, busy background, tiny details, ornate";

/**
 * The full prompt for one frame: style, then subject, then the constraint.
 *
 * Order is load-bearing. CLIP-conditioned models see roughly the first 77
 * tokens and silently drop the rest, so the half that must survive truncation
 * goes first. Everything after the style block is a bonus on those models and
 * a requirement on the good ones.
 */
export function compilePrompt(block: StyleBlock, subject: string): string {
  return [compileStyleBlock(block), "", subject.trim(), "", NO_TEXT_CLAUSE].join("\n");
}

/** Leonardo's v1 prompt ceiling. Exposed so the UI can warn before the call
 *  rather than surfacing a vendor 400. */
export const PROMPT_CHAR_LIMIT = 1500;
