// THE VOCABULARY, THE SCHEMAS AND THE ARITHMETIC — pure, no I/O, importable
// from the client and from a test.
//
// Everything a style is described by is an OBSERVABLE, never a judgement:
// the same lesson pipeline/vlm-probe/style.py learned when `lighting_key`
// became a brightness detector. The enums below are that file's, verbatim,
// so an extracted style, a forge-read style and a grader's readback all speak
// one language and a score is a comparison of enums rather than an opinion.
//
// Two decisions live here because they are the ones a test has to pin:
//
//   GROUPING is deterministic first and reasoned second. `partition` puts two
//   images in one style when they agree on render_mode AND on most of the
//   rest; the reasoning engine is then asked to name and describe the groups
//   and MAY merge or split them, but its answer is only accepted when every
//   source lands in exactly one style (`validateSynthesis`). When it does not,
//   the partition stands and `grouped_by` says so. An engine that quietly
//   dropped three sources would be the worst outcome, and this is what makes
//   it impossible.
//
//   SCORING is the forge's `style_score` with one change: render_mode and
//   medium count double. A candidate that reads as painterly when the style
//   is cel-shaded — or as a 3D render when the style is a 2D painting — has
//   missed the style however well the palette matched, and a flat mean let
//   that pass at 6/7.

import type {
  Critique,
  ExtractedStyle,
  ObservableField,
  Observables,
  Readback,
  Scored,
} from "./types";
import { OBSERVABLE_FIELDS } from "./types";

/* ── Enums ────────────────────────────────────────────────────────────────── */

export const ENUMS: Record<ObservableField, readonly string[]> = {
  render_mode: ["photographic", "photoreal-cg", "stylised-realistic", "painterly", "cel-shaded", "graphic-abstract"],
  medium: ["photograph", "3d-render", "2d-digital-painting", "traditional-paint", "line-drawing", "mixed-media"],
  detail_density: ["sparse", "moderate", "dense", "hyper-dense"],
  surface_realism: ["flat", "simplified", "plausible", "physically-convincing"],
  atmospherics: ["none", "light-haze", "heavy-haze", "particulate", "volumetric-shafts"],
  palette_strategy: ["monochrome", "duotone", "complementary-split", "desaturated-naturalistic", "saturated-vivid", "warm-cool-split"],
  black_handling: ["crushed", "deep-neutral", "lifted-milky"],
  edge_treatment: ["crisp", "soft", "bloom-heavy", "diffused"],
};

const DESCRIPTIONS: Record<ObservableField, string> = {
  render_mode: "How the image is made, judged from surfaces and edges rather than subject matter.",
  medium:
    "What the image physically IS: a photograph; a 3D render (modelled forms, consistent specular, CG hair/cloth); a 2D digital painting (brushed or airbrushed shading on flat forms, painted hair as shapes); traditional paint on a real surface; a line drawing (pencil, ink); or mixed media.",
  detail_density: "How much incidental detail fills the frame — set dressing, wear, background business.",
  surface_realism: "How convincingly materials behave: skin, metal, cloth, stone.",
  atmospherics: "Particulate and haze in the air.",
  palette_strategy: "How colour is organised across the frame.",
  black_handling: "What happens in the darkest areas.",
  edge_treatment: "How edges and highlights resolve.",
};

/** Weight per field in a score. render_mode is the style; the rest is how it
 *  is dressed. */
export const WEIGHTS: Record<ObservableField, number> = {
  render_mode: 2,
  medium: 2,
  detail_density: 1,
  surface_realism: 1,
  atmospherics: 1,
  palette_strategy: 1,
  black_handling: 1,
  edge_treatment: 1,
};

/* ── Schemas (JSON Schema, vendor-native-safe: no oneOf/$ref/const) ───────── */

const enumProp = (f: ObservableField) => ({ type: "string", enum: [...ENUMS[f]], description: DESCRIPTIONS[f] });

const observableProps = () => Object.fromEntries(OBSERVABLE_FIELDS.map((f) => [f, enumProp(f)]));

/** What is read off a source image. `has_text` first: it is the veto. */
export const READBACK_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    has_text: { type: "boolean", description: "Any letters, numbers, logos, captions, signatures or watermarks visible." },
    ...observableProps(),
    dominant_colours: {
      type: "array",
      items: { type: "string" },
      description: "Up to five colour words, most dominant first. Plain words: 'teal', 'rust', 'bone white'.",
    },
    look: {
      type: "string",
      description:
        "The LOOK in one sentence a generator could obey — materials, light, colour, edges, finish. Nothing about what is depicted.",
    },
    depiction: {
      type: "string",
      description:
        "What is depicted and how it is staged, in one or two sentences, generic enough to be re-asked for: shot size, angle, the figures and setting. NEVER a character name, a franchise or a title, and never writing of any kind (letters, runes, glyphs, lettered signs, logos).",
    },
  },
  required: ["has_text", ...OBSERVABLE_FIELDS, "dominant_colours", "look", "depiction"],
};

/** The readback of a GENERATED image, plus the critique loop's two fields. */
export const CRITIQUE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    ...(READBACK_SCHEMA.properties as Record<string, unknown>),
    critique: {
      type: "string",
      description: "Where this image deviates from the TARGET look, at most 60 words. Empty string when it does not.",
    },
    recipe_fix: {
      type: "string",
      description:
        "The whole recipe, rewritten so the next attempt lands closer to the target. Same length class as the target recipe. Style words only, no subject matter.",
    },
  },
  required: [...(READBACK_SCHEMA.required as string[]), "critique", "recipe_fix"],
};

/** What the reasoning engine returns when asked to name and describe the
 *  groups. Members are SOURCE IDS, and coverage is checked after. */
export const SYNTHESIS_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    styles: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "kebab-case slug, 2–4 words, describing the LOOK not the subject" },
          name: { type: "string", description: "Title Case, 2–4 words" },
          family: {
            type: "string",
            description: "One word: animation, film, game, illustration, concept, graphic, photo",
          },
          members: { type: "array", items: { type: "string" }, description: "Source ids that share this look" },
          ...observableProps(),
          recipe: {
            type: "string",
            description:
              "60–110 words a generator obeys: render mode, surfaces, light, palette, blacks, edges, finish. Style first. No subject matter, no names, no franchises.",
          },
          negative: { type: "string", description: "A comma-separated list of what this look must NOT contain. Always include: text, watermark." },
        },
        required: ["id", "name", "family", "members", ...OBSERVABLE_FIELDS, "recipe", "negative"],
      },
    },
  },
  required: ["styles"],
};

/* ── Arithmetic ───────────────────────────────────────────────────────────── */

/** Weighted fraction of the style's observables the readback agrees with.
 *  Null when the readback is missing.
 *
 *  ── OFF-VOCABULARY IS UNMEASURED, NOT WRONG ─────────────────────────────────
 *
 *  A field the readback answered outside `ENUMS` (or did not answer at all) is
 *  dropped from BOTH sides of the fraction rather than scored as a miss. The
 *  vision model was asked for one of a closed set and gave something else; what
 *  the image actually does is then unknown, and "unknown" is not "wrong".
 *
 *  This module already holds that principle in the other direction — a null
 *  readback returns a null score, not a zero — and `validateSynthesis` REFUSES a
 *  synthesis carrying an off-vocabulary value rather than letting it through at
 *  zero credit. Only this function treated the two as the same thing, and it is
 *  the one whose number decides things: `replicaSettled` compares it against
 *  `options.target`, and `bestRound` picks the recipe in force from it. So a
 *  vendor's vocabulary drift used to spend a real generation round chasing a
 *  field that was never measured, and could change which recipe a style ships
 *  with. (`enforcesSchema` is false on the local engine — see
 *  lib/text/providers/claudeCli.ts — so the enum in the schema is a request, not
 *  a guarantee, and this is a live path rather than a hypothetical one.)
 *
 *  A field dropped this way is ABSENT from `per_field`, which is already
 *  `Partial` and which every consumer already renders as "—" or omits. If every
 *  field drops out the score is null, which is the correct terminal answer and
 *  the one the caller already knows how to read.
 *
 *  `similarity()` below is deliberately NOT changed: it compares two readbacks
 *  with each other rather than against the closed vocabulary, so two sources
 *  that drifted the same way genuinely are alike, and grouping them is right. */
export function styleScore(target: Observables, readback: Partial<Readback> | null): Scored {
  if (!readback) return { score: null, per_field: {} };
  const per: Partial<Record<ObservableField, number>> = {};
  let got = 0;
  let total = 0;
  for (const f of OBSERVABLE_FIELDS) {
    const want = target[f];
    if (!want) continue;
    const said = readback[f];
    if (typeof said !== "string" || !ENUMS[f].includes(said)) continue;
    const hit = said === want ? 1 : 0;
    per[f] = hit;
    got += hit * WEIGHTS[f];
    total += WEIGHTS[f];
  }
  return { score: total ? Math.round((got / total) * 1000) / 1000 : null, per_field: per };
}

/** How alike two readbacks are, 0..1, same weights as the score. */
export function similarity(a: Observables, b: Observables): number {
  let got = 0;
  let total = 0;
  for (const f of OBSERVABLE_FIELDS) {
    total += WEIGHTS[f];
    if (a[f] === b[f]) got += WEIGHTS[f];
  }
  return got / total;
}

/**
 * Deterministic grouping: two sources share a style when their render_mode
 * AND medium agree and their weighted similarity is at least `threshold` —
 * at 0.75 that is those two plus four of the six dressing fields. Transitive
 * (union–find), so a chain of near-neighbours becomes one group — which is
 * the right reading of "a gallery of one artist across many subjects" and the
 * wrong one of "everything in between", and the engine gets to correct it.
 *
 * Returns groups of source INDICES in first-seen order, singletons included:
 * a source that matches nothing is its own style, not a discard. The human
 * discards.
 */
export function partition(readbacks: (Observables | null)[], threshold = 0.75): number[][] {
  const parent = readbacks.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  for (let i = 0; i < readbacks.length; i++) {
    const a = readbacks[i];
    if (!a) continue;
    for (let j = i + 1; j < readbacks.length; j++) {
      const b = readbacks[j];
      if (!b) continue;
      if (a.render_mode === b.render_mode && a.medium === b.medium && similarity(a, b) >= threshold) union(i, j);
    }
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < readbacks.length; i++) {
    if (!readbacks[i]) continue;
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(i);
  }
  return [...groups.values()];
}

/** The most common value per field across a group — the observables a
 *  partition-made style is declared with. Ties go to the first seen. */
export function majorityObservables(members: Observables[]): Observables {
  const out = {} as Observables;
  for (const f of OBSERVABLE_FIELDS) {
    const counts = new Map<string, number>();
    for (const m of members) counts.set(m[f], (counts.get(m[f]) ?? 0) + 1);
    let best = "";
    let n = -1;
    for (const [v, c] of counts) if (c > n) [best, n] = [v, c];
    out[f] = best;
  }
  return out;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** A style the deterministic partition writes when the engine's answer is
 *  unusable: majority observables, a recipe stitched from the members' own
 *  `look` sentences, and a name that says what it is. */
export function fallbackStyle(index: number, members: { id: string; readback: Readback }[]): Omit<ExtractedStyle, "replicas" | "transfers"> {
  const obs = majorityObservables(members.map((m) => m.readback));
  const looks = [...new Set(members.map((m) => m.readback.look.trim()).filter(Boolean))].slice(0, 3);
  const colours = [...new Set(members.flatMap((m) => m.readback.dominant_colours))].slice(0, 5);
  const recipe = [
    `${obs.medium.replace(/-/g, " ")}, ${obs.render_mode.replace(/-/g, " ")} rendering, ${obs.surface_realism.replace(/-/g, " ")} surfaces, ${obs.detail_density.replace(/-/g, " ")} detail.`,
    ...looks,
    colours.length ? `Palette of ${colours.join(", ")} — ${obs.palette_strategy.replace(/-/g, " ")}.` : "",
    `Blacks ${obs.black_handling.replace(/-/g, " ")}, edges ${obs.edge_treatment.replace(/-/g, " ")}, ${obs.atmospherics.replace(/-/g, " ")} atmosphere.`,
  ]
    .filter(Boolean)
    .join(" ");
  const id = `${slugify(obs.render_mode)}-${index + 1}`;
  return {
    id,
    name: `${obs.render_mode.replace(/-/g, " ")} ${index + 1}`.replace(/\b\w/g, (c) => c.toUpperCase()),
    family: "unsorted",
    members: members.map((m) => m.id),
    observables: obs,
    recipe,
    negative: "text, watermark, logo, caption, signature",
    recipe_history: [recipe],
    grouped_by: "partition",
  };
}

/** The engine's answer, checked. Returns the styles when every known source
 *  id appears in exactly one of them and every field is well-formed; null
 *  otherwise, with the reason for the log. */
export function validateSynthesis(
  raw: unknown,
  sourceIds: string[],
): { styles: Omit<ExtractedStyle, "replicas" | "transfers">[] } | { error: string } {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { styles?: unknown }).styles))
    return { error: "no styles array" };
  const known = new Set(sourceIds);
  const seen = new Map<string, string>();
  const ids = new Set<string>();
  const out: Omit<ExtractedStyle, "replicas" | "transfers">[] = [];
  for (const s of (raw as { styles: unknown[] }).styles) {
    if (!s || typeof s !== "object") return { error: "a style is not an object" };
    const o = s as Record<string, unknown>;
    let id = slugify(typeof o.id === "string" ? o.id : "");
    if (!id) return { error: "a style has no id" };
    while (ids.has(id)) id = `${id}-2`;
    ids.add(id);
    if (typeof o.name !== "string" || !o.name.trim()) return { error: `${id}: no name` };
    if (typeof o.recipe !== "string" || o.recipe.trim().length < 20) return { error: `${id}: recipe too short` };
    if (!Array.isArray(o.members) || !o.members.length) return { error: `${id}: no members` };
    const members: string[] = [];
    for (const m of o.members) {
      if (typeof m !== "string" || !known.has(m)) return { error: `${id}: unknown member ${String(m)}` };
      if (seen.has(m)) return { error: `${m} is in both ${seen.get(m)} and ${id}` };
      seen.set(m, id);
      members.push(m);
    }
    const obs = {} as Observables;
    for (const f of OBSERVABLE_FIELDS) {
      const v = o[f];
      if (typeof v !== "string" || !ENUMS[f].includes(v)) return { error: `${id}: ${f} is not in the vocabulary (${String(v)})` };
      obs[f] = v;
    }
    const negative = typeof o.negative === "string" && o.negative.trim() ? o.negative.trim() : "text, watermark";
    out.push({
      id,
      name: o.name.trim(),
      family: typeof o.family === "string" && o.family.trim() ? slugify(o.family) : "unsorted",
      members,
      observables: obs,
      recipe: o.recipe.trim(),
      negative: /\btext\b/i.test(negative) ? negative : `${negative}, text, watermark`,
      recipe_history: [o.recipe.trim()],
      grouped_by: "engine",
    });
  }
  const missing = sourceIds.filter((id) => !seen.has(id));
  if (missing.length) return { error: `sources not placed: ${missing.join(", ")}` };
  if (!out.length) return { error: "no styles" };
  return { styles: out };
}

/** Is a critique's `recipe_fix` worth adopting? It has to be a recipe, not a
 *  shrug — and not the same recipe again, which would spend a round to learn
 *  nothing. */
export function usableFix(c: Critique | null, current: string): string | null {
  const fix = c?.recipe_fix?.trim();
  if (!fix || fix.length < 40) return null;
  if (fix.toLowerCase() === current.trim().toLowerCase()) return null;
  return fix;
}
