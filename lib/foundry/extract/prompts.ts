// THE WORDS — every instruction the Extract module sends, in one file, so a
// prompt change is a diff here and not a hunt through the engine.
//
// Style first, then the shot (the forge's style-first-token-ordering), and
// the same NO_TEXT clause the forge uses: text in a generated frame is the
// veto in every grader this repo runs.

import type { ExtractedStyle, Readback } from "./types";
import { OBSERVABLE_FIELDS } from "./types";

export const NO_TEXT =
  "No text, no letters, no numbers, no logos, no captions, no signature and no watermark anywhere in the image.";

/** The neutral scene roster a style is transferred onto. None of these is a
 *  subject any gallery is likely to contain, which is the point: a recipe
 *  that survives here carried the LOOK, not the content. Staging is spelled
 *  out so the craft fields have something to hold. */
export const TRANSFER_SCENES: readonly string[] = [
  "A lighthouse keeper climbing a spiral iron stair at dusk, storm light through a tall window, full shot, low angle.",
  "A courier on a bicycle crossing a market street after rain at night, awnings and puddles, medium shot, eye level.",
  "Two travellers at a campfire in a pine forest at dawn, mist between the trunks, wide shot, slight high angle.",
  "A diver surfacing beside a moored wooden boat in a flooded cathedral, shafts of light from above, medium wide shot.",
];

/** Read one SOURCE image back as observables + look + depiction. */
export function readbackInstruction(): string {
  return [
    "You are reading an image for an art-style library.",
    "Describe ONLY what is observable. Choose each field from its allowed values.",
    "`look` is the rendering — materials, light, colour organisation, edges, finish — with NOTHING about what is depicted.",
    "`depiction` is what is depicted and how it is staged, written so another image could be asked for with the same staging: shot size, angle, figures, setting, action.",
    "`depiction` must never ask for writing: no letters, runes, glyphs, lettered signs, logos or captions — describe a neon sign as 'a lit sign' and a runic halo as 'a glowing ring', so a re-ask does not draw text. (Measured 2026-08-27: two replicas were vetoed for text the depiction itself had requested.)",
    "Never name a character, a franchise, a game, a film, an artist or a title anywhere in your answer; describe them generically instead.",
  ].join("\n");
}

/** Read a GENERATED image back and judge it against a target style. */
export function critiqueInstruction(style: ExtractedStyle, recipe: string): string {
  const target = OBSERVABLE_FIELDS.map((f) => `  ${f}: ${style.observables[f]}`).join("\n");
  return [
    "You are grading a generated image against a TARGET art style.",
    "First read the image back honestly — choose each field from its allowed values, from what you see, not from the target.",
    "Then compare to the target and write `critique`: where the image deviates from the target look, in at most 60 words. Empty string if it matches.",
    "Then write `recipe_fix`: the WHOLE recipe rewritten so the next attempt lands closer to the target. Keep what already works. Style words only — no subject matter, no names.",
    "",
    "TARGET OBSERVABLES:",
    target,
    "",
    "TARGET RECIPE (the words the generator was given):",
    recipe,
    "",
    "Never name a character, a franchise, a game, a film, an artist or a title anywhere in your answer.",
  ].join("\n");
}

/** Ask the reasoning engine to name and describe the groups. The partition is
 *  a HINT it may overrule; coverage is validated afterwards. */
export function synthesisPrompt(
  sources: { id: string; readback: Readback }[],
  partition: string[][],
): string {
  const rows = sources.map((s) => {
    const obs = OBSERVABLE_FIELDS.map((f) => `${f}=${s.readback[f]}`).join(", ");
    return `- ${s.id}: ${obs}; colours: ${s.readback.dominant_colours.join(", ")}; look: ${s.readback.look}`;
  });
  return [
    "You are curating an art-style library for a generative image pipeline.",
    `Below are ${sources.length} images read back as observables. Group them into STYLES — a style is a look that would be described with the same words whatever the subject — and for each style write the entry a generator can be handed.`,
    "",
    "RULES",
    "- Every source id appears in EXACTLY ONE style. Do not drop any. A source that matches nothing is its own style.",
    "- Group by the LOOK (rendering, surfaces, light, palette, edges), never by subject, character, franchise or artist.",
    "- Prefer fewer, coherent styles over many near-duplicates, but never merge two different render modes, and never merge two different MEDIA — a 2D digital painting and a 3D render are different styles however alike their light and palette.",
    "- The recipe's FIRST clause names the medium in the generator's own words ('a 2D digital painting with airbrushed shading', 'a photoreal 3D render', 'a graphite pencil drawing on paper'). A recipe that leaves the medium implicit gets a 3D render back whatever the source was (measured 2026-08-27).",
    "- `recipe`: 60–110 words the generator obeys — render mode, surfaces, light, palette, blacks, edges, finish. Style first. No subject matter, no names, no franchises, no titles.",
    "- `negative`: a comma-separated list of what the look must not contain; always include `text, watermark`.",
    "- `id`: kebab-case, 2–4 words, describing the look (e.g. `painted-neon-noir`, `soft-cel-anime`). `name`: the same in Title Case.",
    "- Observables per style: choose the value that best describes the whole group, from the allowed values only.",
    "",
    "A DETERMINISTIC PARTITION (same render mode, most observables agree) — a starting point you may merge or split, with reasons visible in the grouping itself:",
    ...partition.map((g, i) => `  group ${i + 1}: ${g.join(", ")}`),
    "",
    "SOURCES",
    ...rows,
  ].join("\n");
}

/** The generation prompt for a replica: the recipe, then the shot. */
export function replicaPrompt(recipe: string, depiction: string): string {
  return `${recipe.trim()} ${depiction.trim()} ${NO_TEXT}`;
}

/** The generation prompt for a transfer: the recipe, then a scene the
 *  sources never showed. */
export function transferPrompt(recipe: string, scene: string): string {
  return `${recipe.trim()} ${scene.trim()} ${NO_TEXT}`;
}
