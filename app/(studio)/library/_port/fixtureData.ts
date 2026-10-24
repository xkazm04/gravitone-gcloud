import "server-only";

// THE FIXTURE LIBRARY'S VOCABULARY - the tables the generated corpus (./fixtureCorpus.ts) draws
// from, over media this repo tracks in public/ (the six preset plates, the deck art, the preset
// clips and their posters), so the Library is built, driven and photographed
// against real pixels without a store (the Board fixture's rule, board/_port/fixtureData.ts).
//
// The words are the studio's: the style observables are the vocab's `style_source` fields
// (@gt/domain/library STYLE_OBSERVABLES), the stations, mechanisms and lessons are the foundry's,
// the sound terms are lib/sound's. Nothing here is offered to the operator as a list - the rail
// reads every value back from the corpus (library.js: "vocabulary values are read from the
// data, never typed here").

import { createHash } from "node:crypto";

import type { STYLE_OBSERVABLES } from "@gt/domain/library";

type Obs = { readonly [K in (typeof STYLE_OBSERVABLES)[number]]: string };

export type FixtureStyle = { readonly id: string; readonly name: string; readonly family: string; readonly derivation: "readback" | "authored" | "extracted"; readonly obs: Obs; readonly hero: boolean; readonly recipe: string; readonly negative: string };

const o = (render_mode: string, palette_strategy: string, black_handling: string, atmospherics: string, edge_treatment: string, detail_density: string, surface_realism: string): Obs => ({
  render_mode,
  palette_strategy,
  black_handling,
  atmospherics,
  edge_treatment,
  detail_density,
  surface_realism,
});

/** Styles with a hero plate in public/presets are drawn by it; the rest are swatches of their palette. */
export const STYLES: readonly FixtureStyle[] = [
  { id: "signal-ledger", name: "Signal Ledger", family: "diagrammatic", derivation: "authored", obs: o("flat-vector", "duotone", "rich", "clear", "hard", "medium", "stylized"), hero: true, recipe: "ledger-paper diagrams in two inks, ruled grids, signal lines drawn as plotter strokes", negative: "gradients, lens flare, photographic texture" },
  { id: "newsprint-cutout", name: "Newsprint Cutout", family: "collage", derivation: "readback", obs: o("collage", "desaturated-naturalistic", "lifted", "clear", "torn", "dense", "grounded"), hero: true, recipe: "torn newsprint shapes on kraft, halftone photographs, glue shadows", negative: "clean vector edges, neon" },
  { id: "blueprint", name: "Blueprint", family: "diagrammatic", derivation: "authored", obs: o("line-art", "monochrome", "crushed", "clear", "hard", "dense", "stylized"), hero: true, recipe: "cyanotype blueprint, white technical linework, dimension callouts", negative: "colour fills, painterly marks" },
  { id: "chalk-argument", name: "Chalk Argument", family: "hand-made", derivation: "readback", obs: o("chalk", "monochrome", "lifted", "haze", "soft", "sparse", "grounded"), hero: true, recipe: "chalk on a worn slate board, smudged erasures, arrows that argue", negative: "crisp vector, saturated colour" },
  { id: "paper-relief", name: "Paper Relief", family: "hand-made", derivation: "extracted", obs: o("painted-3d", "warm-cool-split", "rich", "volumetric", "soft", "medium", "grounded"), hero: true, recipe: "layered cut paper lit from the side, soft cast shadows, warm key against cool fill", negative: "flat lighting, glossy plastic" },
  { id: "data-neon", name: "Data Neon", family: "graphic", derivation: "extracted", obs: o("flat-vector", "saturated-vivid", "crushed", "haze", "glow", "dense", "stylized"), hero: true, recipe: "neon data glyphs on black, bloom on the brightest strokes, scanline haze", negative: "daylight, paper texture" },
  { id: "ink-wash-night", name: "Ink Wash Night", family: "painterly", derivation: "extracted", obs: o("ink-wash", "monochrome", "rich", "haze", "soft", "sparse", "stylized"), hero: false, recipe: "sumi ink washes, wet edges bleeding into night skies, one warm lamp", negative: "hard outlines, digital gradients" },
  { id: "glass-harbor", name: "Glass Harbor", family: "cinematic", derivation: "readback", obs: o("photoreal", "complementary-split", "crushed", "volumetric", "soft", "dense", "grounded"), hero: false, recipe: "anamorphic harbour at blue hour, sodium lamps against teal water, fog in the light", negative: "flat colour, cartoon proportions" },
  { id: "cold-open", name: "Cold Open", family: "cinematic", derivation: "authored", obs: o("cel-shaded", "warm-cool-split", "lifted", "clear", "inked", "medium", "stylized"), hero: false, recipe: "cel-shaded figures with inked contours, warm rim light, cool shadow fill", negative: "photographic grain" },
];

/** A palette strategy's two leading colours: the designed face's wash (library.js `PAL`). */
export const PALETTES: Readonly<Record<string, readonly [string, string]>> = {
  "warm-cool-split": ["#6a4220", "#1d3d63"],
  duotone: ["#57285f", "#164a57"],
  "saturated-vivid": ["#7a1f55", "#1f6476"],
  monochrome: ["#454a55", "#23272f"],
  "desaturated-naturalistic": ["#45493d", "#2c3540"],
  "complementary-split": ["#6a2d1f", "#1f5a43"],
};

/** The styles a generated plate or still is drawn in: five of the presets, each plate its preset's picture. */
export const TRIAL_STYLES = ["blueprint", "chalk-argument", "data-neon", "newsprint-cutout", "paper-relief"] as const;
export const SCENES = ["the-exit", "flywheel", "peak-and-fall", "booking-not-meal", "wish-list"] as const;
export const DECK = [
  "discipline-educational",
  "discipline-free",
  "discipline-trailer",
  "engine-adjudication",
  "engine-derived-short",
  "engine-reversal-chain",
  "template-cinematic",
  "template-free-form",
  "template-mid-educational-video",
  "template-short-educational-video",
  "template-short-form-clip",
  "template-teaser",
  "template-trailer",
] as const;
/** The preset clips: a webm and its poster frame each (public/clips/presets). */
export const CLIPS = ["blueprint", "chalk-argument", "data-neon", "newsprint-cutout", "paper-relief", "signal-ledger"] as const;

export const MECHANISMS = ["ip-adapter", "img2img", "controlnet-depth", "prompt-only"] as const;
export const LESSONS = ["counted-beats", "what-stays-dark", "build-key-flip", "reference-sheet"] as const;
export const SUBJECTS = ["physics", "chemistry", "history", "economics", "biology"] as const;
export const SOUND = {
  genre: ["synthwave", "ambient", "orchestral", "lo-fi", "industrial", "trip-hop"],
  mood: ["tense", "warm", "melancholic", "bright", "ominous", "playful", "driving"],
  instrument: ["synth", "strings", "piano", "drums", "choir", "guitar", "brass"],
  keys: ["A minor", "C major", "D minor", "F# minor", "E major", "G minor"],
  sfxGroups: ["risers", "impacts", "whooshes", "foley"],
  musicGroups: ["score", "bed"],
  stages: ["pending", "edit", "remaster", "finalized"],
  reasons: ["smeared-transients", "vocal-garble", "clipped-peaks", "muddy-low-end"],
} as const;
export const BUNDLES = ["software-engineering", "media-generation", "localization"] as const;
export const TOPICS: Readonly<Record<(typeof BUNDLES)[number], readonly string[]>> = {
  "software-engineering": ["search", "table", "async-ui-states", "file-browsing", "media-playback", "faceting", "background-jobs", "retry-backoff", "design-tokens", "accessibility"],
  "media-generation": ["visual-style-locking", "frame-direction", "video-assembly", "generated-music-acceptance", "trailer-structure", "cinematic-language"],
  localization: ["czech", "japanese", "translation-pipeline-topology", "copy-quality-gates"],
};

export const PROJECTS: readonly { readonly id: string; readonly title: string; readonly style: string }[] = [
  { id: "prj-glass-harbor", title: "Glass Harbor · trailer", style: "glass-harbor" },
  { id: "prj-flywheel", title: "The Flywheel · explainer", style: "signal-ledger" },
  { id: "prj-night-drive", title: "Night Drive · album video", style: "data-neon" },
  { id: "prj-peak-and-fall", title: "Peak and Fall · film", style: "paper-relief" },
  { id: "prj-signal-room", title: "Signal Room · ad", style: "blueprint" },
];
export const RUNS = { forge: ["2026-08-26-sweep-01", "2026-09-14-sweep-02", "2026-10-02-sweep-03"], extract: ["2026-09-03-extract-arcane", "2026-10-09-extract-harbor"], dojo: ["2026-09-01-dojo-cycle-7", "2026-09-05-dojo-cycle-9"], strips: ["2026-10-13-strips-edu"], articles: ["art-2026-10-11-search", "art-2026-10-14-faceting"] } as const;
export const HUNTS: readonly { readonly id: string; readonly label: string }[] = [
  { id: "hunt-rain-city", label: "Rain city at 3 am" },
  { id: "hunt-glass-pulse", label: "Glass pulse under the harbor" },
  { id: "hunt-chalk-march", label: "Chalk march for the explainer" },
];

/** A seeded generator (library-data.js `rnd`, seed 0x5eed2026): the same corpus on every boot. */
export function rng(seed = 0x5eed2026): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A file under public/ named as a blob would be: the sha of its path, its mime, and the address. */
export type FixtureMedia = { readonly sha: string; readonly mime: string; readonly url: string; readonly w: number; readonly h: number };

const mimeOf = (url: string): string => (url.endsWith(".webm") ? "video/webm" : url.endsWith(".webp") ? "image/webp" : url.endsWith(".wav") ? "audio/wav" : "image/jpeg");

// On globalThis, beside the universe it serves (./fixture.ts): the universe outlives a hot reload
// and a second server bundle, and a blob map that did not would answer null for every sha it named.
declare global {
  var __gtLibraryFixtureMedia: Map<string, FixtureMedia> | undefined;
}
const media: Map<string, FixtureMedia> = (globalThis.__gtLibraryFixtureMedia ??= new Map());

/** The fixture's blob for a public file (registered once; the resolver reads it back by sha). */
export function fileBlob(url: string, w = 1280, h = 800): FixtureMedia {
  const sha = createHash("sha256").update(url).digest("hex");
  const have = media.get(sha);
  if (have !== undefined) return have;
  const m = { sha, mime: mimeOf(url), url, w, h };
  media.set(sha, m);
  return m;
}

/** The fixture's blob for media made in code (a model's glb): a data: URL, named by its sha. */
export function dataBlob(url: string, mime: string): FixtureMedia {
  const sha = createHash("sha256").update(url).digest("hex");
  const m = media.get(sha) ?? { sha, mime, url, w: 0, h: 0 };
  media.set(sha, m);
  return m;
}

/** Where the fixture serves a blob it named (./present.ts asks; the real side answers /api/blob). */
export function fixtureUrl(sha: string): string | null {
  return media.get(sha)?.url ?? null;
}

/** A take's waveform: 48 buckets, deterministic per seed (board fixture `peaks`). */
export const peaksOf = (seed: number): number[] => Array.from({ length: 48 }, (_, i) => Math.round((0.25 + 0.7 * Math.abs(Math.sin(seed * 1.7 + i * 0.41) * Math.cos(i * 0.13 + seed))) * 1000) / 1000);
