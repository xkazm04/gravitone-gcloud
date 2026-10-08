// FIXTURE UNIVERSE · FOUNDRY — every surface /foundry reads, in the exact
// on-disk formats the stores write:
//
//   fixtures-out/runs/<id>/        forge runs (lib/foundry/store.ts): run.json,
//                                  verdicts.json, scenes/<scene>/source.png and
//                                  scenes/<scene>/candidates/<style>--<mech>--s<seed>.{png,json}
//   fixtures-out/extract/<id>/     extract runs (lib/foundry/extract/store.ts):
//                                  run.json, verdicts.json, sources/, styles/<style>/
//   fixtures-out/training/<id>/    Dojo cycles (lib/foundry/training/store.ts):
//                                  cycle.json, verdicts.json, pairs/
//   fixtures-out/catalogue/        styles.json (+ `_rev`), ledger.json,
//                                  training-ledger.json, catalogue-journal.jsonl,
//                                  training/thumbs/ — what catalogueDir() resolves
//                                  to in fixture mode (lib/fixtures/roots.ts)
//
// WHAT IS GUESSED AND WHAT IS CONSISTENT. Every picture is a `plate` — a
// gradient with discs, never a render — and every score, critique and judge
// reason is invented. What is NOT invented is the bookkeeping: the committed
// forge run's ledger rows and the style evidence are the same decisions, the
// extracted styles' exemplars are files that exist in the committed extract
// run, a replica's `settled` reason is the one engine.ts::settleReason would
// compute from its rounds, and the catalogue journal's revisions run 1..`_rev`.
// A reader that loads this universe and finds a dangling reference has found a
// bug in the app, not in the fixture.
//
// ONE DELIBERATE GAP: candidates that never produced a file (`pending`, a
// `failed` one) carry the path the forge WOULD have written and have nothing at
// it, exactly as a real interrupted run does. Everything the readers actually
// dereference — READY candidates, sources, replicas, transfers, pairs — exists.

import { existsSync, rmSync } from "node:fs";

import type { Aspect } from "../../lib/imaging/types";
import type {
  Candidate,
  Evidence,
  Exemplar,
  Grade,
  LedgerRow,
  Mechanism,
  RunManifest,
  RunStatus,
  Scene,
  StyleDef,
  StyleReadback,
  Verdicts,
} from "../../lib/foundry/types";
import type {
  Critique,
  ExtractedStyle,
  ExtractManifest,
  ExtractSource,
  ExtractVerdicts,
  ObservableField,
  Observables,
  Readback,
  Replica,
  ReplicaRound,
  Scored,
  SettleReason,
  Transfer,
} from "../../lib/foundry/extract/types";
import type { CycleManifest, Improvement, PairResult, TrainingLedgerRow, TrainingVerdicts } from "../../lib/foundry/training/types";
import { DAY, HOUR, MIN, NOW, outFile, plate, rng, writeBytes, writeJson, type Rng } from "./kit";

/* ── time ────────────────────────────────────────────────────────────────── */

/** Epoch ms of `ms` before NOW, as ISO. */
const at = (ms: number): string => new Date(NOW - ms).toISOString();
const dayOf = (ms: number): string => at(ms).slice(0, 10);

/* ── the closed vocabulary (lib/foundry/extract/vocabulary.ts, copied) ───── */

const FIELDS: readonly ObservableField[] = [
  "render_mode", "medium", "detail_density", "surface_realism", "atmospherics", "particle_fx",
  "palette_strategy", "black_handling", "edge_treatment", "finish", "focus",
];
const ENUMS: Record<ObservableField, readonly string[]> = {
  render_mode: ["photographic", "photoreal-cg", "stylised-realistic", "painterly", "cel-shaded", "graphic-abstract"],
  medium: ["photograph", "3d-render", "2d-digital-painting", "traditional-paint", "line-drawing", "mixed-media"],
  detail_density: ["sparse", "moderate", "dense", "hyper-dense"],
  surface_realism: ["flat", "simplified", "plausible", "physically-convincing"],
  atmospherics: ["none", "light-haze", "heavy-haze", "particulate", "volumetric-shafts"],
  particle_fx: ["none", "subtle-dust", "heavy-debris", "energy-glow"],
  palette_strategy: ["monochrome", "duotone", "complementary-split", "desaturated-naturalistic", "saturated-vivid", "warm-cool-split"],
  black_handling: ["crushed", "deep-neutral", "lifted-milky"],
  edge_treatment: ["crisp", "soft", "bloom-heavy", "diffused"],
  finish: ["clean-smooth", "weathered-gritty", "painterly-textured"],
  focus: ["deep-focus", "shallow-bokeh", "motion-blurred"],
};
const WEIGHTS: Record<ObservableField, number> = {
  render_mode: 2, medium: 2, detail_density: 1, surface_realism: 1, atmospherics: 1, particle_fx: 1,
  palette_strategy: 1, black_handling: 1, edge_treatment: 1, finish: 1, focus: 1,
};
/** Fields a replica may drift on without having changed the medium. */
const MINOR = FIELDS.filter((f) => WEIGHTS[f] === 1);

function styleScore(target: Observables, said: Partial<Readback>): Scored {
  const per: Partial<Record<ObservableField, number>> = {};
  let got = 0;
  let total = 0;
  for (const f of FIELDS) {
    const want = target[f];
    const v = said[f];
    if (!want || typeof v !== "string" || !ENUMS[f].includes(v)) continue;
    const hit = v === want ? 1 : 0;
    per[f] = hit;
    got += hit * WEIGHTS[f];
    total += WEIGHTS[f];
  }
  return { score: total ? Math.round((got / total) * 1000) / 1000 : null, per_field: per };
}

function nearDuplicates(styles: { id: string; observables: Observables }[]): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i < styles.length; i++)
    for (let j = i + 1; j < styles.length; j++) {
      let minor = 0;
      let major = 0;
      for (const f of FIELDS) {
        if (styles[i].observables[f] === styles[j].observables[f]) continue;
        if (WEIGHTS[f] > 1) major++;
        else minor++;
      }
      if (major === 0 && minor <= 1) out.push([styles[i].id, styles[j].id]);
    }
  return out;
}

const NO_TEXT = "No text, no letters, no numbers, no logos, no captions, no signature and no watermark anywhere in the image.";
const TRANSFER_SCENES = [
  "A lighthouse keeper climbing a spiral iron stair at dusk, storm light through a tall window, full shot, low angle.",
  "A courier on a bicycle crossing a market street after rain at night, awnings and puddles, medium shot, eye level.",
  "Two travellers at a campfire in a pine forest at dawn, mist between the trunks, wide shot, slight high angle.",
  "A diver surfacing beside a moored wooden boat in a flooded cathedral, shafts of light from above, medium wide shot.",
];

const ASPECT_PX: Record<Aspect, [number, number]> = { "16:9": [480, 270], "9:16": [270, 480], "1:1": [320, 320], "4:5": [320, 400] };

const GRADER = "gemini-3.7-flash";
const GRADER_DIGEST = "c41e07ab";
const OLD_GRADER = "gemini-3.6-flash";
const OLD_GRADER_DIGEST = "9be21f04";

/* ── the catalogue: ten styles ───────────────────────────────────────────── */

type Obs7 = Pick<Observables, "render_mode" | "detail_density" | "surface_realism" | "atmospherics" | "palette_strategy" | "black_handling" | "edge_treatment">;

interface StyleSpec {
  id: string;
  name: string;
  family: string;
  status: StyleDef["status"];
  origin: StyleDef["origin"];
  observables: Record<string, string>;
  recipe: string;
  negative: string;
  palette: string[];
  colours: string[];
  /** The one-sentence LOOK used in readbacks. */
  look: string;
}

const NEG = "text, watermark, logo, caption";

const SEVEN = (o: Obs7): Record<string, string> => ({ ...o });

const SPECS: StyleSpec[] = [
  {
    id: "paper-cut-collage",
    name: "Paper-Cut Collage",
    family: "illustration",
    status: "candidate",
    origin: { kind: "authored" },
    observables: SEVEN({ render_mode: "graphic-abstract", detail_density: "moderate", surface_realism: "flat", atmospherics: "none", palette_strategy: "complementary-split", black_handling: "deep-neutral", edge_treatment: "crisp" }),
    recipe: "A layered paper-cut collage: every form is a flat sheet of hand-cut coloured paper with slightly irregular scissor edges, stacked in three or four depth layers with soft contact shadows between them. Ochre, brick red and slate blue against a bone ground, one saturated accent. Visible paper grain and torn fibre at the edges, no gradients inside a shape, no outlines.",
    negative: `photograph, gradients, 3d render, outlines, ${NEG}`,
    palette: ["#e9d8b4", "#c8553d", "#3d5a80", "#f2c14e", "#2f2f2f"],
    colours: ["ochre", "brick red", "slate blue", "bone white"],
    look: "Flat cut-paper shapes in stacked layers with soft contact shadows and visible grain.",
  },
  {
    id: "neon-noir",
    name: "Neon Noir",
    family: "cinematic",
    status: "candidate",
    origin: { kind: "readback", source: "night-city-reel", models: ["qwen3.8:27b", "gemini-3.7-flash"] },
    observables: SEVEN({ render_mode: "photoreal-cg", detail_density: "dense", surface_realism: "physically-convincing", atmospherics: "light-haze", palette_strategy: "complementary-split", black_handling: "crushed", edge_treatment: "bloom-heavy" }),
    recipe: "A photoreal night street under rain: wet asphalt mirroring signage, crushed blacks, hard magenta key from one side and cyan fill from the other, light haze catching the glow. Highlights bloom softly around every emissive source. Figures read as silhouettes with a thin rim, deep shadow carrying most of the frame.",
    negative: `daylight, flat lighting, cartoon, ${NEG}`,
    palette: ["#0b0b1a", "#ff2e88", "#12e0ff", "#1a1a3a", "#7a1fa2"],
    colours: ["magenta", "cyan", "ink black", "violet"],
    look: "Rain-slick night street, hard magenta against cyan, crushed blacks and bloom.",
  },
  {
    id: "gouache-storyboard",
    name: "Gouache Storyboard",
    family: "painterly",
    status: "candidate",
    origin: { kind: "authored" },
    observables: SEVEN({ render_mode: "painterly", detail_density: "sparse", surface_realism: "simplified", atmospherics: "light-haze", palette_strategy: "desaturated-naturalistic", black_handling: "lifted-milky", edge_treatment: "soft" }),
    recipe: "An opaque gouache storyboard panel on warm cream paper: broad flat brush shapes, matte colour with a dry-brush edge, a limited earthy palette of umber, sage and faded terracotta. Value does the staging; detail stays sparse and implied. Blacks lifted to a chalky brown, edges soft where the brush ran out of paint.",
    negative: `glossy, photographic, sharp vector edges, ${NEG}`,
    palette: ["#d9c9a3", "#8a6f4d", "#5e7a6b", "#b86f52", "#e8dcc0"],
    colours: ["umber", "sage", "terracotta", "cream"],
    look: "Matte gouache on cream paper, sparse dry-brush shapes, chalky lifted blacks.",
  },
  {
    id: "cel-shaded-noir",
    name: "Cel-Shaded Noir",
    family: "animation",
    status: "candidate",
    origin: { kind: "authored" },
    observables: SEVEN({ render_mode: "cel-shaded", detail_density: "moderate", surface_realism: "simplified", atmospherics: "none", palette_strategy: "duotone", black_handling: "crushed", edge_treatment: "crisp" }),
    recipe: "Hard-edged cel animation at night: two-tone shading with a single sharp shadow terminator, solid ink-black shadow shapes, a duotone of deep navy and sodium amber with one red accent. Clean uniform linework, no gradients, no texture. Backgrounds painted flat in the same two tones.",
    negative: `gradient shading, photoreal, film grain, ${NEG}`,
    palette: ["#101820", "#f2aa4c", "#e8e8e8", "#c1272d"],
    colours: ["navy", "amber", "ink black", "signal red"],
    look: "Two-tone cel shading in navy and amber, crisp linework, solid black shadows.",
  },
  {
    id: "ink-graphic-novel",
    name: "Ink Graphic Novel",
    family: "graphic",
    status: "candidate",
    origin: { kind: "authored" },
    observables: SEVEN({ render_mode: "graphic-abstract", detail_density: "dense", surface_realism: "flat", atmospherics: "none", palette_strategy: "monochrome", black_handling: "crushed", edge_treatment: "crisp" }),
    recipe: "A brush-and-ink graphic novel page: heavy spotted blacks, cross-hatching for midtones, confident variable line weight, white paper left bare for light. One spot of dried-blood red allowed per frame. Dense environmental linework, flat figure-ground separation, no greys, no soft shading.",
    negative: `photograph, soft gradients, colour wash, ${NEG}`,
    palette: ["#f5f1e6", "#111111", "#8c1c13", "#444444"],
    colours: ["ink black", "paper white", "dried-blood red"],
    look: "Spotted blacks and cross-hatching on bare paper, one red accent.",
  },
  {
    id: "teal-orange-blockbuster",
    name: "Teal-Orange Blockbuster",
    family: "cinematic",
    status: "candidate",
    origin: { kind: "readback", source: "tentpole-trailers", models: ["qwen3.8:27b", "gemini-3.7-flash"] },
    observables: SEVEN({ render_mode: "photoreal-cg", detail_density: "dense", surface_realism: "physically-convincing", atmospherics: "particulate", palette_strategy: "warm-cool-split", black_handling: "deep-neutral", edge_treatment: "soft" }),
    recipe: "Tentpole-trailer photoreal grade: skin and fire pushed to warm orange, shadows and sky pushed to teal, nothing in between. Particulate haze in the air with backlit dust, deep neutral blacks, soft edges from a large anamorphic lens. Dense set dressing, physically convincing metal and cloth, a slight highlight roll-off.",
    negative: `flat colour, cartoon, monochrome, ${NEG}`,
    palette: ["#0f4c5c", "#e36414", "#fb8b24", "#1b2a34", "#9ac4c4"],
    colours: ["teal", "burnt orange", "steel", "ash"],
    look: "Teal shadows against orange highlights, dusty air, soft anamorphic edges.",
  },
  {
    id: "desaturated-newsreel",
    name: "Desaturated Newsreel",
    family: "photo",
    status: "candidate",
    origin: { kind: "readback", source: "archive-footage", models: ["gemini-3.7-flash"] },
    observables: SEVEN({ render_mode: "photographic", detail_density: "moderate", surface_realism: "physically-convincing", atmospherics: "heavy-haze", palette_strategy: "desaturated-naturalistic", black_handling: "lifted-milky", edge_treatment: "diffused" }),
    recipe: "Archive newsreel photography: low-saturation greys and faded olive, lifted milky blacks, heavy haze flattening depth, diffused edges from soft period lenses. Handheld framing, slightly overexposed skies, visible gate weave and fine grain. Nothing glows; every light source is a plain practical.",
    negative: `saturated colour, bloom, digital sharpness, ${NEG}`,
    palette: ["#8a8d86", "#5b5f58", "#c9c6b8", "#3d3f3a"],
    colours: ["ash grey", "faded olive", "bone"],
    look: "Faded greys, milky blacks, haze and fine grain, diffused edges.",
  },
  {
    id: "sodium-vapour-thriller",
    name: "Sodium-Vapour Thriller",
    family: "cinematic",
    status: "candidate",
    origin: { kind: "readback", source: "tunnel-chase-refs", models: ["gemini-3.7-flash"] },
    observables: SEVEN({ render_mode: "photographic", detail_density: "moderate", surface_realism: "physically-convincing", atmospherics: "light-haze", palette_strategy: "duotone", black_handling: "crushed", edge_treatment: "soft" }),
    recipe: "Night photography under sodium-vapour lamps: a duotone of dirty amber light against cold blue-grey shade, crushed blacks, light haze around every lamp, soft edges. Reflections on wet concrete, lens flare kept to a single streak. Practical sources only, no fill.",
    negative: `daylight, neon colours, cartoon, ${NEG}`,
    palette: ["#1a1308", "#d98e04", "#f2b134", "#3b2a0f", "#5c6b73"],
    colours: ["sodium amber", "blue-grey", "black"],
    look: "Amber lamp light against cold shade, crushed blacks, haze around practicals.",
  },
];

// The two styles the committed extract run put into the catalogue. Their
// observables are eleven-field: the extract vocabulary, not the forge's seven.
const EXTRACT_SPECS: Record<string, StyleSpec & { obs: Observables }> = {};
function extractSpec(s: Omit<StyleSpec, "observables" | "origin" | "status"> & { obs: Observables }): StyleSpec & { obs: Observables } {
  const full = { ...s, observables: { ...s.obs }, origin: { kind: "extracted" as const }, status: "candidate" as const };
  EXTRACT_SPECS[s.id] = full;
  return full;
}

const EMBER = extractSpec({
  id: "ember-lit-realism", name: "Ember-Lit Realism", family: "film",
  obs: { render_mode: "photoreal-cg", medium: "3d-render", detail_density: "dense", surface_realism: "physically-convincing", atmospherics: "particulate", particle_fx: "heavy-debris", palette_strategy: "warm-cool-split", black_handling: "crushed", edge_treatment: "bloom-heavy", finish: "weathered-gritty", focus: "shallow-bokeh" },
  recipe: "A photoreal 3D render of a gritty night action frame: drifting embers and ash in the air, a warm orange key from burning sources against cold blue shadow, crushed blacks, bloom around every flame. Weathered, scratched surfaces, dense debris-strewn set dressing, shallow depth of field melting the background into bokeh.",
  negative: `clean studio render, flat lighting, ${NEG}`,
  palette: ["#140c08", "#c2410c", "#f59e0b", "#3b1d0f", "#7c2d12"], colours: ["ember orange", "soot black", "cold blue", "ash"],
  look: "Ember-swept night render, orange key against blue shadow, gritty surfaces, bloom.",
});
const SMOKE = extractSpec({
  id: "smoke-lit-realism", name: "Smoke-Lit Realism", family: "film",
  obs: { render_mode: "photoreal-cg", medium: "3d-render", detail_density: "dense", surface_realism: "physically-convincing", atmospherics: "heavy-haze", particle_fx: "heavy-debris", palette_strategy: "warm-cool-split", black_handling: "crushed", edge_treatment: "bloom-heavy", finish: "weathered-gritty", focus: "shallow-bokeh" },
  recipe: "A photoreal 3D render of a gritty night frame choked with smoke: heavy haze layered through the set, floating debris catching a warm orange key, cold blue shadow, crushed blacks, bloom on every bright source. Weathered scratched surfaces, shallow depth of field.",
  negative: `clean studio render, flat lighting, ${NEG}`,
  palette: ["#17120f", "#a8552b", "#e0a458", "#4a3a30", "#6b5b52"], colours: ["smoke grey", "rust orange", "soot black"],
  look: "Smoke-choked night render, warm key through heavy haze, gritty surfaces.",
});
const BOKEH = extractSpec({
  id: "soft-backlit-bokeh", name: "Soft Backlit Bokeh", family: "photo",
  obs: { render_mode: "photographic", medium: "photograph", detail_density: "moderate", surface_realism: "physically-convincing", atmospherics: "light-haze", particle_fx: "subtle-dust", palette_strategy: "desaturated-naturalistic", black_handling: "lifted-milky", edge_treatment: "soft", finish: "clean-smooth", focus: "shallow-bokeh" },
  recipe: "A photograph shot into the light: a warm low sun behind the subject wrapping a soft rim, light haze and drifting dust motes, wide-open aperture turning the background into round bokeh. Desaturated naturalistic colour, lifted milky blacks, soft edges, clean smooth skin and fabric.",
  negative: `hard flash, crushed blacks, 3d render, ${NEG}`,
  palette: ["#f3e3c3", "#e9a66a", "#9fb8a0", "#f7f0dc", "#c58f6b"], colours: ["honey", "cream", "sage", "peach"],
  look: "Contre-jour photograph, soft warm rim, dust motes, round bokeh, milky blacks.",
});
const SHAFTS = extractSpec({
  id: "volumetric-shaft-keyart", name: "Volumetric Shaft Key Art", family: "concept",
  obs: { render_mode: "stylised-realistic", medium: "2d-digital-painting", detail_density: "dense", surface_realism: "plausible", atmospherics: "volumetric-shafts", particle_fx: "subtle-dust", palette_strategy: "complementary-split", black_handling: "deep-neutral", edge_treatment: "diffused", finish: "painterly-textured", focus: "deep-focus" },
  recipe: "A 2D digital painting of stylised-realistic key art: hard volumetric shafts of pale gold cutting through a cold blue interior, dust motes caught in every beam, dense architectural detail resolved by value rather than line. Painterly textured surfaces, diffused edges where light bleeds, deep neutral blacks, everything in focus front to back.",
  negative: `photograph, flat lighting, cel shading, ${NEG}`,
  palette: ["#0f1d2b", "#f4d58d", "#5b8aa6", "#2a4156", "#e8c07d"], colours: ["pale gold", "cold blue", "slate", "ink"],
  look: "Painted gold light shafts through cold blue space, dust in the beams.",
});
const RAINY = extractSpec({
  id: "rainy-neon-street", name: "Rainy Neon Street", family: "unsorted",
  obs: { render_mode: "photoreal-cg", medium: "3d-render", detail_density: "dense", surface_realism: "physically-convincing", atmospherics: "light-haze", particle_fx: "none", palette_strategy: "saturated-vivid", black_handling: "crushed", edge_treatment: "bloom-heavy", finish: "clean-smooth", focus: "shallow-bokeh" },
  recipe: "A photoreal 3D render of a rain-wet city street at night: saturated pink and teal signage mirrored in puddles, light haze softening the far block, crushed blacks, bloom spilling from every sign. Clean smooth surfaces slick with water, dense street clutter, shallow focus turning distant lights into bokeh discs.",
  negative: `daylight, grain, painterly texture, ${NEG}`,
  palette: ["#08090f", "#ff3d81", "#17c3ce", "#1c2233", "#f9a03f"], colours: ["hot pink", "teal", "ink black", "amber"],
  look: "Rain-wet neon street render, saturated signage in puddles, bloom, bokeh.",
});
const BRUSHED = extractSpec({
  id: "brushed-rim-painting", name: "Brushed Rim Painting", family: "illustration",
  obs: { render_mode: "painterly", medium: "2d-digital-painting", detail_density: "moderate", surface_realism: "simplified", atmospherics: "light-haze", particle_fx: "none", palette_strategy: "complementary-split", black_handling: "deep-neutral", edge_treatment: "crisp", finish: "painterly-textured", focus: "deep-focus" },
  recipe: "A 2D digital painting built from visible brush strokes: figures modelled by a single crisp amber rim light against slate blue, simplified planes, moderate detail kept to faces and hands. Light haze in the distance, deep neutral blacks, painterly texture over everything, sharp throughout.",
  negative: `photograph, 3d render, airbrushed smooth, ${NEG}`,
  palette: ["#1c2a3a", "#e8b86b", "#6d8fa8", "#b5523b", "#2c3e50"], colours: ["amber", "slate blue", "brick", "navy"],
  look: "Visible brushwork, crisp amber rim light on slate blue, simplified planes.",
});

/* ── pictures ────────────────────────────────────────────────────────────── */

const NEUTRAL = ["#3a3a3a", "#8a8a8a", "#bdb7a7", "#222222", "#6b6f73"];
const specOf = (id: string): StyleSpec => SPECS.find((s) => s.id === id) ?? EXTRACT_SPECS[id];

function defOf(s: StyleSpec): StyleDef {
  return {
    id: s.id, name: s.name, family: s.family, status: s.status, origin: s.origin,
    observables: { ...s.observables }, recipe: s.recipe, negative: s.negative, evidence: [],
  };
}

/* ═══════════════════════════ FORGE RUNS ════════════════════════════════════ */

const CRAFT_ALTS: Record<string, readonly string[]> = {
  shot_size: ["close-up", "medium shot", "full shot", "wide shot"],
  camera_angle: ["low angle", "eye level", "high angle"],
  composition: ["centred", "rule of thirds", "diagonal", "symmetrical"],
  lighting_key: ["low-key", "high-key", "mid-key"],
  lighting_direction: ["front", "side", "back", "top"],
  depth_of_field: ["shallow", "deep"],
};
const CRAFT_FIELDS = Object.keys(CRAFT_ALTS);

interface SceneSpec { id: string; frame: string; note: string; annotation: Record<string, string> }
const SCENES: Record<string, SceneSpec> = {
  "vault-door-breach": {
    id: "vault-door-breach", frame: "heist-trailer/vault-breach-014.jpg",
    note: "full shot, low angle, crew lead kneeling at a vault door, cutting torch throwing sparks, steam from the seals",
    annotation: { shot_size: "full shot", camera_angle: "low angle", composition: "centred", lighting_key: "low-key", lighting_direction: "front", depth_of_field: "deep", subject: "kneeling crew lead at vault door" },
  },
  "rooftop-handoff": {
    id: "rooftop-handoff", frame: "heist-trailer/rooftop-handoff-031.jpg",
    note: "medium shot, eye level, two figures pass a hard case across a rooftop gap, skyline behind them",
    annotation: { shot_size: "medium shot", camera_angle: "eye level", composition: "rule of thirds", lighting_key: "low-key", lighting_direction: "back", depth_of_field: "shallow", subject: "two figures passing a case across a gap" },
  },
  "getaway-tunnel": {
    id: "getaway-tunnel", frame: "heist-trailer/getaway-tunnel-052.jpg",
    note: "wide shot, high angle, a black sedan accelerating through a service tunnel, sodium lamps smearing",
    annotation: { shot_size: "wide shot", camera_angle: "high angle", composition: "diagonal", lighting_key: "mid-key", lighting_direction: "top", depth_of_field: "deep", subject: "sedan accelerating through a tunnel" },
  },
  "control-room-hack": {
    id: "control-room-hack", frame: "heist-trailer/control-room-007.jpg",
    note: "close-up, eye level, a hacker's face lit by three monitors, a second figure out of focus behind",
    annotation: { shot_size: "close-up", camera_angle: "eye level", composition: "centred", lighting_key: "low-key", lighting_direction: "front", depth_of_field: "shallow", subject: "hacker lit by monitors" },
  },
  "pawnshop-casing": {
    id: "pawnshop-casing", frame: "heist-trailer/pawnshop-casing-021.jpg",
    note: "medium shot, high angle, two figures casing a pawnshop counter through the window, reflections over the glass",
    annotation: { shot_size: "medium shot", camera_angle: "high angle", composition: "symmetrical", lighting_key: "mid-key", lighting_direction: "side", depth_of_field: "deep", subject: "two figures at a shop window" },
  },
  "dock-ambush": {
    id: "dock-ambush", frame: "heist-trailer/dock-ambush-066.jpg",
    note: "wide shot, low angle, a crew crossing a container yard at dusk, a spotlight sweeping in from the left",
    annotation: { shot_size: "wide shot", camera_angle: "low angle", composition: "diagonal", lighting_key: "low-key", lighting_direction: "side", depth_of_field: "deep", subject: "crew crossing a container yard" },
  },
};

const MECHS: Record<string, Mechanism> = {
  text: { id: "text", reference: false, label: "words only" },
  "ref-early": { id: "ref-early", reference: true, window: 0.35, label: "source frame conditions the first 35% of the denoise" },
};

interface RunSpec {
  id: string;
  createdAgo: number;
  finishedAgo?: number;
  scenes: string[];
  styles: string[];
  mechs: string[];
  seeds: number[];
  status: RunStatus;
  grader?: [string, string];
}

const cid = (scene: string, style: string, mech: string, seed: number) => `${scene}/${style}--${mech}--s${seed}`;
const candRel = (scene: string, style: string, mech: string, seed: number, ext: string) => `scenes/${scene}/candidates/${style}--${mech}--s${seed}.${ext}`;
const round2 = (x: number) => Math.round(x * 100) / 100;

function sceneOf(run: RunSpec, id: string, annotated: boolean): Scene {
  const s = SCENES[id];
  return { id, frame: s.frame, note: s.note, source: `scenes/${id}/source.png`, annotation: annotated ? s.annotation : null, annotation_from: annotated ? "qwen3.8:27b" : null };
}

interface GradeOpts { craftNull?: boolean; craftScoreNull?: boolean; styleNull?: boolean; text?: boolean }

function mkGrade(r: Rng, run: RunSpec, scene: SceneSpec, c: Candidate, o: GradeOpts, atMs: number): Grade {
  const spec = specOf(c.style);
  const pCraft = c.mechanism === "ref-early" ? 0.78 : 0.5;
  const per: Record<string, number> = {};
  const annotation: Record<string, unknown> = {};
  for (const f of CRAFT_FIELDS) {
    const hit = r.chance(pCraft);
    const half = !hit && r.chance(0.25);
    per[f] = hit ? 1 : half ? 0.5 : 0;
    annotation[f] = hit || half ? scene.annotation[f] : r.pick(CRAFT_ALTS[f].filter((v) => v !== scene.annotation[f]));
  }
  const craftScore = round2(Object.values(per).reduce((a, b) => a + b, 0) / CRAFT_FIELDS.length);

  const sPer: Record<string, number> = {};
  const readback: StyleReadback = {
    has_text: !!o.text,
    render_mode: spec.observables.render_mode,
    palette_strategy: spec.observables.palette_strategy,
    edge_treatment: spec.observables.edge_treatment,
    black_handling: spec.observables.black_handling,
    dominant_colours: [...spec.colours].slice(0, 3),
    depiction: `${scene.note.split(",").slice(0, 2).join(",")}, rendered as ${spec.name.toLowerCase()}`,
  };
  const pStyle = spec.family === "painterly" || spec.family === "illustration" ? 0.62 : 0.76;
  for (const f of ["render_mode", "palette_strategy", "edge_treatment", "black_handling"] as const) {
    const hit = r.chance(pStyle);
    sPer[f] = hit ? 1 : 0;
    if (!hit) readback[f] = r.pick(ENUMS[f].filter((v) => v !== spec.observables[f]));
  }
  const styleScoreV = round2(Object.values(sPer).reduce((a, b) => a + b, 0) / 4);

  const unmeasured: string[] = [];
  if (o.craftNull) unmeasured.push("craft: the grader returned malformed JSON twice for this plate");
  if (o.styleNull) unmeasured.push("style: readback timed out after 90 s");
  return {
    grader: (run.grader ?? [GRADER, GRADER_DIGEST])[0],
    grader_digest: (run.grader ?? [GRADER, GRADER_DIGEST])[1],
    at: new Date(atMs).toISOString(),
    craft: o.craftNull ? null : { score: o.craftScoreNull ? null : craftScore, per_field: o.craftScoreNull ? {} : per, annotation },
    style: o.styleNull ? null : { score: styleScoreV, per_field: sPer, readback },
    veto: o.craftNull && o.styleNull ? null : { has_text: !!o.text },
    unmeasured,
  };
}

function writeRunFiles(run: RunSpec, m: RunManifest, withSources = true): void {
  const root = (rel: string) => outFile("runs", run.id, rel);
  if (withSources) for (const s of m.scenes) writeBytes(root(s.source), plate(`src:${run.id}:${s.id}`, NEUTRAL));
  for (const c of m.candidates) {
    if (c.deleted || c.status === "pending" || c.status === "failed") continue;
    writeBytes(root(c.file), plate(`${run.id}:${c.id}`, specOf(c.style).palette));
    writeJson(root(c.sidecar), { id: c.id, scene: c.scene, style: c.style, mechanism: c.mechanism, seed: c.seed, prompt: c.prompt, timings: c.timings });
  }
  writeJson(root("run.json"), m);
}

/** The candidates of a plan, all `pending` until a run says otherwise. */
function planCandidates(run: RunSpec): Candidate[] {
  const out: Candidate[] = [];
  for (const scene of run.scenes)
    for (const style of run.styles)
      for (const mech of run.mechs)
        for (const seed of run.seeds) {
          const spec = specOf(style);
          out.push({
            id: cid(scene, style, mech, seed), scene, style, mechanism: mech, seed,
            file: candRel(scene, style, mech, seed, "png"), sidecar: candRel(scene, style, mech, seed, "json"),
            status: "pending", grade: null, error: null,
            prompt: `${spec.recipe} ${SCENES[scene].note}. ${NO_TEXT}`,
          });
        }
  return out;
}

function manifestOf(run: RunSpec, o: { candidates: Candidate[]; annotated?: boolean; progress: RunManifest["progress"]; log: RunManifest["log"]; error?: string; styleDefs?: Record<string, StyleDef> }): RunManifest {
  const styles: Record<string, StyleDef> = {};
  for (const id of run.styles) styles[id] = o.styleDefs?.[id] ?? defOf(specOf(id));
  return {
    id: run.id,
    created: at(run.createdAgo),
    ...(run.finishedAgo !== undefined ? { finished: at(run.finishedAgo) } : {}),
    plan: {
      id: run.id.replace(/^\d{4}-\d{2}-\d{2}-/, ""),
      scenes: run.scenes.map((id) => ({ id, frame: SCENES[id].frame, note: SCENES[id].note })),
      styles: run.styles, mechanisms: run.mechs.map((m) => MECHS[m]), seeds: run.seeds, steps: 20,
    },
    styles, status: run.status, progress: o.progress,
    scenes: run.scenes.map((id) => sceneOf(run, id, o.annotated !== false)),
    candidates: o.candidates, log: o.log,
    ...(o.error ? { error: o.error } : {}),
  };
}

/** Walk the plan, grading every candidate in order. `special` picks the odd ones. */
function gradeAll(run: RunSpec, cands: Candidate[], special: (i: number, c: Candidate) => GradeOpts | null, status: "graded" | "generated" = "graded"): void {
  const r = rng(`grade:${run.id}`);
  const t0 = NOW - run.createdAgo;
  cands.forEach((c, i) => {
    const o = special(i, c) ?? {};
    const gradeAt = t0 + (i + 1) * 70_000 + 40_000;
    c.timings = { generate: round2(r.float(31, 58)), ...(status === "graded" ? { grade: round2(r.float(4, 9)) } : {}) };
    if (status === "generated") {
      c.status = "generated";
      return;
    }
    c.grade = mkGrade(r, run, SCENES[c.scene], c, o, gradeAt);
    c.status = o.craftNull || o.styleNull ? "unmeasured" : "graded";
  });
}

const stdLog = (run: RunSpec, n: number, extra: string[] = []): RunManifest["log"] => {
  const t0 = NOW - run.createdAgo;
  return [
    { at: new Date(t0).toISOString(), msg: `run ${run.id} created: ${run.scenes.length} scene(s) × ${run.styles.length} style(s) × ${run.mechs.length} mechanism(s) × ${run.seeds.length} seed(s) = ${n} candidates` },
    { at: new Date(t0 + 2 * MIN).toISOString(), msg: `annotated ${run.scenes.length} source frame(s) with qwen3.8:27b` },
    ...extra.map((msg, i) => ({ at: new Date(t0 + (4 + i * 3) * MIN).toISOString(), msg })),
  ];
};

/* ── the committed run first: it defines the ledger and the evidence ─────── */

interface Committed { run: RunSpec; manifest: RunManifest; rows: LedgerRow[]; evidence: Record<string, Evidence[]>; commitAt: string; styles: string[] }

function committedForgeRun(): Committed {
  const run: RunSpec = {
    id: `${dayOf(9 * DAY)}-vault-sweep`, createdAgo: 9 * DAY, finishedAgo: 9 * DAY - 52 * MIN, status: "committed",
    scenes: ["vault-door-breach", "rooftop-handoff", "getaway-tunnel"], styles: ["paper-cut-collage", "neon-noir", "gouache-storyboard"],
    mechs: ["text", "ref-early"], seeds: [31007], grader: [OLD_GRADER, OLD_GRADER_DIGEST],
  };
  const cands = planCandidates(run);
  gradeAll(run, cands, (i) => (i === 7 ? { styleNull: true } : null));
  const r = rng(`verdicts:${run.id}`);
  // Which scenes each style is KEPT on — two or more promotes it.
  const keepOn: Record<string, string[]> = {
    "paper-cut-collage": ["vault-door-breach", "rooftop-handoff", "getaway-tunnel"],
    "neon-noir": ["vault-door-breach", "getaway-tunnel"],
    "gouache-storyboard": ["rooftop-handoff", "getaway-tunnel"],
  };
  const commitAt = at(9 * DAY - 3 * HOUR);
  const verdicts: Verdicts = {};
  const undecidedId = cid("rooftop-handoff", "neon-noir", "text", 31007);
  let deleted = 0;
  let kept = 0;
  for (const c of cands) {
    if (c.id === undecidedId) continue;
    const keep = keepOn[c.style].includes(c.scene) && (c.mechanism === "ref-early" || r.chance(0.25));
    verdicts[c.id] = { verdict: keep ? "keep" : "reject", at: at(9 * DAY - 2 * HOUR), ...(!keep && r.chance(0.3) ? { note: "reasons: style\nlooks like the wrong medium" } : {}) };
    if (keep) kept++;
    else {
      c.deleted = true;
      deleted++;
    }
  }
  const rows: LedgerRow[] = [];
  const evidence: Record<string, Evidence[]> = {};
  for (const c of cands) {
    const v = verdicts[c.id];
    if (!v) continue;
    rows.push({ run: run.id, scene: c.scene, style: c.style, mechanism: c.mechanism, seed: c.seed, verdict: v.verdict, craft: c.grade?.craft?.score ?? null, style_score: c.grade?.style?.score ?? null, has_text: c.grade?.veto?.has_text ?? null, at: commitAt });
    (evidence[c.style] ??= []).push({ run: run.id, scene: c.scene, mechanism: c.mechanism, verdict: v.verdict, at: commitAt });
  }
  const m = manifestOf(run, {
    candidates: cands, progress: { stage: "done", done: cands.length, total: cands.length },
    log: [...stdLog(run, cands.length, [`generated and graded ${cands.length} candidates`, "run complete"]), { at: commitAt, msg: `committed: ${deleted} deleted, ${kept} kept, 1 undecided` }],
  });
  m.committed = { at: commitAt, deleted, kept, undecided: 1 };
  writeRunFiles(run, m);
  writeJson(outFile("runs", run.id, "verdicts.json"), verdicts);
  writeBytes(outFile("runs", run.id, "findings.md"), `# Foundry findings — ${run.id}\n\nCommitted ${commitAt}. ${cands.length} candidates, ${rows.length} decided by hand.\n\n_Draft. Fixture data: no model graded these plates._\n`);
  return { run, manifest: m, rows, evidence, commitAt, styles: [...new Set(rows.map((x) => x.style))] };
}

/* ── the live runs ───────────────────────────────────────────────────────── */

function doneFullyGraded(): RunManifest {
  const run: RunSpec = {
    id: `${dayOf(3 * DAY)}-heist-sweep-01`, createdAgo: 3 * DAY, finishedAgo: 3 * DAY - 61 * MIN, status: "done",
    scenes: ["vault-door-breach", "rooftop-handoff", "getaway-tunnel"], styles: ["teal-orange-blockbuster", "sodium-vapour-thriller"],
    mechs: ["text", "ref-early"], seeds: [52011, 52012],
  };
  const cands = planCandidates(run);
  gradeAll(run, cands, (i) => {
    if (i === 5) return { text: true }; // the veto case
    if (i === 9) return { craftNull: true }; // craft unmeasured
    if (i === 16) return { craftScoreNull: true }; // craft block present, score null
    if (i === 21) return { styleNull: true, craftNull: true }; // nothing measured
    return null;
  });
  const m = manifestOf(run, {
    candidates: cands, progress: { stage: "done", done: cands.length, total: cands.length },
    log: stdLog(run, cands.length, [`generated ${cands.length} candidates on ComfyUI (20 steps)`, `graded ${cands.length} candidates with ${GRADER}: 4 unmeasured`, "run complete"]),
  });
  writeRunFiles(run, m);
  return m;
}

function doneWithVerdicts(): RunManifest {
  const run: RunSpec = {
    id: `${dayOf(2 * DAY)}-heist-sweep-02`, createdAgo: 2 * DAY, finishedAgo: 2 * DAY - 44 * MIN, status: "done",
    scenes: ["control-room-hack", "pawnshop-casing", "dock-ambush"], styles: ["cel-shaded-noir", "ink-graphic-novel", "desaturated-newsreel"],
    mechs: ["ref-early"], seeds: [61001, 61002],
  };
  const cands = planCandidates(run);
  gradeAll(run, cands, (i) => (i === 11 ? { text: true } : i === 14 ? { styleNull: true } : null));
  const r = rng(`verdicts:${run.id}`);
  const verdicts: Verdicts = {};
  const reasonsPool = ["style", "subject", "style, subject"];
  cands.forEach((c, i) => {
    if (i % 5 === 4 || i === 15) return; // leave several undecided
    const g = c.grade;
    const score = ((g?.craft?.score ?? 0.4) + (g?.style?.score ?? 0.4)) / 2 + r.float(-0.2, 0.2);
    const keep = score > 0.62 && !g?.veto?.has_text;
    verdicts[c.id] = {
      verdict: keep ? "keep" : "reject",
      at: at(2 * DAY - (60 + i) * MIN),
      ...(!keep && r.chance(0.5) ? { note: `reasons: ${r.pick(reasonsPool)}${r.chance(0.5) ? "\nfigure melts into the background" : ""}` } : {}),
      ...(keep && r.chance(0.2) ? { note: "best of the sweep for the trailer cold open" } : {}),
    };
  });
  const m = manifestOf(run, {
    candidates: cands, progress: { stage: "done", done: cands.length, total: cands.length },
    log: stdLog(run, cands.length, [`generated ${cands.length} candidates on ComfyUI (20 steps)`, `graded ${cands.length} candidates with ${GRADER}`, "run complete"]),
  });
  writeRunFiles(run, m);
  writeJson(outFile("runs", run.id, "verdicts.json"), verdicts);
  return m;
}

function incompleteRun(): RunManifest {
  const run: RunSpec = {
    id: `${dayOf(2 * DAY + 3 * HOUR)}-rooftop-sweep`, createdAgo: 2 * DAY + 3 * HOUR, finishedAgo: 2 * DAY + 3 * HOUR - 38 * MIN, status: "incomplete",
    scenes: ["rooftop-handoff", "pawnshop-casing"], styles: ["neon-noir", "gouache-storyboard", "paper-cut-collage"], mechs: ["text", "ref-early"], seeds: [70404],
  };
  const cands = planCandidates(run);
  const made = cands.slice(0, 8);
  gradeAll(run, made, () => null);
  const failed = cands[8];
  failed.status = "failed";
  failed.error = "ComfyUI: CUDA out of memory at step 14/20 — recycle failed, port 8188 did not answer within 90 s";
  const m = manifestOf(run, {
    candidates: cands, progress: { stage: "grading", done: 8, total: cands.length },
    log: stdLog(run, cands.length, [
      "generated 8 candidates", `candidate ${failed.id} failed: ${failed.error}`,
      "stage_generate: ComfyUI could not be recycled — stopping the candidate loop", `graded 8 candidates with ${GRADER}`, "run incomplete: 8 of 12 candidates produced",
    ]),
  });
  writeRunFiles(run, m);
  return m;
}

function failedRun(): RunManifest {
  const run: RunSpec = {
    id: `${dayOf(1 * DAY + 5 * HOUR)}-getaway-sweep`, createdAgo: 1 * DAY + 5 * HOUR, finishedAgo: 1 * DAY + 5 * HOUR - 3 * MIN, status: "failed",
    scenes: ["getaway-tunnel"], styles: ["sodium-vapour-thriller", "cel-shaded-noir"], mechs: ["text", "ref-early"], seeds: [80808],
  };
  const cands = planCandidates(run);
  const error = "annotate: the vision endpoint http://127.0.0.1:11434 refused the connection (ECONNREFUSED) — no scene could be annotated, so no craft target exists to grade against";
  const t0 = NOW - run.createdAgo;
  const m = manifestOf(run, {
    candidates: cands, annotated: false, progress: { stage: "annotating", done: 0, total: 1 }, error,
    log: [
      { at: new Date(t0).toISOString(), msg: `run ${run.id} created: 1 scene(s) × 2 style(s) × 2 mechanism(s) × 1 seed(s) = 4 candidates` },
      { at: new Date(t0 + 90_000).toISOString(), msg: "annotating getaway-tunnel with qwen3.8:27b" },
      { at: new Date(t0 + 3 * MIN).toISOString(), msg: `FAILED: ${error}` },
    ],
  });
  writeRunFiles(run, m);
  return m;
}

function generatingRun(): RunManifest {
  const run: RunSpec = {
    id: `${dayOf(25 * MIN)}-dock-sweep`, createdAgo: 25 * MIN, status: "generating",
    scenes: ["dock-ambush"], styles: ["teal-orange-blockbuster", "neon-noir"], mechs: ["text", "ref-early"], seeds: [90001, 90002, 90003, 90004],
  };
  const cands = planCandidates(run);
  gradeAll(run, cands.slice(0, 7), () => null, "generated");
  const m = manifestOf(run, {
    candidates: cands, progress: { stage: "generating", done: 7, total: cands.length },
    log: stdLog(run, cands.length, ["generating on ComfyUI (20 steps)", "7/16 candidates written"]),
  });
  writeRunFiles(run, m);
  return m;
}

/* ═══════════════════════════ EXTRACT RUNS ═════════════════════════════════ */

interface SrcSpec { aspect: Aspect; depiction: string; name: string; has_text?: boolean; flips?: number }
interface ExtractStyleSpec {
  spec: StyleSpec & { obs: Observables };
  members: string[];
  /** Per replicated source: the miss count of each round, and how the loop ended. */
  replicas: { source: string; misses: number[]; end: "target-met" | "round-cap" | "no-usable-fix" | "generation-failed" }[];
  transfers: { misses: number | null; error?: string }[];
}

const FIX_CLAUSES = [
  "Name the medium in the first clause and state the shading pipeline explicitly.",
  "Assign the palette as ground, figure and a single accent, and forbid a second accent.",
  "Say what the air does: haze, debris or none, and where the light source sits relative to it.",
];

function otherThan(r: Rng, f: ObservableField, v: string): string {
  return r.pick(ENUMS[f].filter((x) => x !== v));
}

function readbackOf(r: Rng, obs: Observables, flips: number, spec: StyleSpec, depiction: string, hasText = false): Readback {
  const out: Observables = { ...obs };
  for (const f of r.shuffle(MINOR).slice(0, flips)) out[f] = otherThan(r, f, obs[f]);
  return { ...out, has_text: hasText, dominant_colours: [...spec.colours].slice(0, 4), look: spec.look, depiction };
}

interface ExtractBuild {
  id: string;
  slug: string;
  createdAgo: number;
  finishedAgo?: number;
  status: ExtractManifest["status"];
  sources: SrcSpec[];
  styles: ExtractStyleSpec[];
  options: ExtractManifest["options"];
}

const ENGINES = { vision: "gemini/gemini-3.7-flash", generator: "openai/gpt-image-2.5", reasoner: "claude-cli/claude-sonnet-5-5" };

function buildExtract(b: ExtractBuild): ExtractManifest {
  const r = rng(`extract:${b.id}`);
  const root = (rel: string) => outFile("extract", b.id, rel);
  const t0 = NOW - b.createdAgo;
  const sidOf = (i: number) => `s${String(i + 1).padStart(2, "0")}`;
  // Which style a source belongs to, for its palette and readback.
  const styleOfSource = new Map<string, ExtractStyleSpec>();
  for (const st of b.styles) for (const m of st.members) styleOfSource.set(m, st);

  const sources: ExtractSource[] = b.sources.map((s, i) => {
    const id = sidOf(i);
    const st = styleOfSource.get(id)!;
    const [w, h] = ASPECT_PX[s.aspect];
    const file = `sources/${id}.png`;
    writeBytes(root(file), plate(`src:${b.id}:${id}`, st.spec.palette, w, h));
    return {
      id, name: s.name, file, mime: "image/png", width: w, height: h, aspect: s.aspect,
      readback: readbackOf(r, st.spec.obs, s.flips ?? r.int(0, 1), st.spec, s.depiction, !!s.has_text), error: null,
    };
  });

  let units = sources.length + 1;
  const styles: ExtractedStyle[] = b.styles.map((st) => {
    const target = st.spec.obs;
    const dir = `styles/${st.spec.id}`;
    const recipes = [st.spec.recipe];
    let bestScore = -1;
    let bestRecipe = st.spec.recipe;

    const replicas: Replica[] = st.replicas.map((rp) => {
      const src = sources.find((x) => x.id === rp.source)!;
      const [w, h] = ASPECT_PX[src.aspect];
      let recipe = st.spec.recipe;
      const rounds: ReplicaRound[] = rp.misses.map((miss, k) => {
        const n = k + 1;
        const isLast = n === rp.misses.length;
        const failedGen = isLast && rp.end === "generation-failed";
        const prompt = `${recipe}\n\nScene: ${src.readback!.depiction}`;
        if (failedGen) {
          return { n, file: null, recipe, prompt, critique: null, generator: ENGINES.generator, vision: null, error: "generator refused the prompt: the request was blocked by the provider's content filter (finish_reason=content_policy)", score: null, per_field: {} };
        }
        const file = `${dir}/replica-${rp.source}-r${n}.png`;
        writeBytes(root(file), plate(`rep:${b.id}:${st.spec.id}:${rp.source}:${n}`, st.spec.palette, w, h));
        const rb = readbackOf(r, target, miss, st.spec, src.readback!.depiction);
        const sc = styleScore(target, rb);
        const matched = isLast && (rp.end === "target-met" || sc.score === 1);
        const noFix = isLast && rp.end === "no-usable-fix";
        const fix = matched ? "" : noFix ? "Keep the recipe as is." : `${recipe} ${FIX_CLAUSES[k % FIX_CLAUSES.length]}`;
        const critique: Critique = {
          ...rb,
          critique: matched ? "" : MINOR.filter((f) => rb[f] !== target[f]).map((f) => `${f.replace(/_/g, " ")} reads ${rb[f]}, target is ${target[f]}`).join("; ") || "Slightly softer than the target.",
          recipe_fix: fix,
        };
        if ((sc.score ?? 0) > bestScore) {
          bestScore = sc.score ?? 0;
          bestRecipe = recipe;
        }
        if (fix.length >= 40 && fix.toLowerCase() !== recipe.toLowerCase()) {
          recipe = fix;
          if (!recipes.includes(fix)) recipes.push(fix);
        }
        return { n, file, recipe: prompt.split("\n")[0], prompt, critique, generator: ENGINES.generator, vision: ENGINES.vision, error: null, score: sc.score, per_field: sc.per_field };
      });
      units += rounds.length;
      return { source: rp.source, rounds };
    });

    const transfers: Transfer[] = st.transfers.map((tr, k) => {
      units += 1;
      const brief = TRANSFER_SCENES[k];
      const prompt = `${st.spec.recipe}\n\nScene: ${brief}`;
      if (tr.misses === null) {
        return { scene: k, brief, file: null, prompt, readback: null, score: null, per_field: {}, generator: ENGINES.generator, vision: null, error: tr.error ?? "generation failed" };
      }
      const file = `${dir}/transfer-${k}.png`;
      writeBytes(root(file), plate(`tr:${b.id}:${st.spec.id}:${k}`, st.spec.palette, 480, 270));
      const rb = readbackOf(r, target, tr.misses, st.spec, brief);
      const sc = styleScore(target, rb);
      return { scene: k, brief, file, prompt, readback: rb, score: sc.score, per_field: sc.per_field, generator: ENGINES.generator, vision: ENGINES.vision, error: null };
    });

    return {
      id: st.spec.id, name: st.spec.name, family: st.spec.family, members: st.members, observables: { ...target },
      recipe: bestRecipe, negative: st.spec.negative, recipe_history: recipes, grouped_by: "engine", replicas, transfers,
    } satisfies ExtractedStyle;
  });
  units += 1;

  for (const [a, c] of nearDuplicates(styles.map((s) => ({ id: s.id, observables: s.observables })))) {
    const sa = styles.find((s) => s.id === a)!;
    const sc = styles.find((s) => s.id === c)!;
    sa.similar_to = [...(sa.similar_to ?? []), c];
    sc.similar_to = [...(sc.similar_to ?? []), a];
  }

  const m: ExtractManifest = {
    id: b.id, slug: b.slug, created: at(b.createdAgo), ...(b.finishedAgo !== undefined ? { finished: at(b.finishedAgo) } : {}),
    status: b.status, progress: { stage: b.status, done: units, total: units }, options: b.options,
    sources, styles, engines: { ...ENGINES },
    log: [
      { at: new Date(t0).toISOString(), msg: `created with ${sources.length} source(s); ${b.options.replicas} replica(s) × ${b.options.rounds} round(s), ${b.options.transfers} transfer(s) per style` },
      { at: new Date(t0 + 4 * MIN).toISOString(), msg: `read ${sources.length}/${sources.length} sources` },
      { at: new Date(t0 + 6 * MIN).toISOString(), msg: `grouped into ${styles.length} style(s) by the reasoning engine` },
      { at: new Date(t0 + 38 * MIN).toISOString(), msg: `replicated and transferred ${styles.length} style(s)` },
      { at: new Date(t0 + 40 * MIN).toISOString(), msg: "finished" },
    ],
  };
  return m;
}

const OPTS = { rounds: 3, replicas: 2, transfers: 2, target: 0.88, seed: 4400, grouping: "engine" as const };

function extractDone(): ExtractManifest {
  const S = (name: string, aspect: Aspect, depiction: string, extra: Partial<SrcSpec> = {}): SrcSpec => ({ name, aspect, depiction, ...extra });
  const m = buildExtract({
    id: `${dayOf(1 * DAY)}-heist-moodboard`, slug: "heist-moodboard", createdAgo: 1 * DAY, finishedAgo: 1 * DAY - 41 * MIN, status: "done", options: OPTS,
    sources: [
      S("moodboard-01.png", "16:9", "A crew silhouetted against a burning warehouse, wide shot, low angle."),
      S("moodboard-02.png", "16:9", "A masked figure ducking under a falling steel door, medium shot, eye level."),
      S("moodboard-03.png", "16:9", "A convoy of vans on an overpass, sparks trailing behind, wide shot, high angle."),
      S("moodboard-04.png", "9:16", "A lone figure walking out of a collapsing doorway, full shot, low angle."),
      S("moodboard-05.png", "16:9", "A courier's armoured truck stopped in a tunnel, smoke curling from the hood, wide shot."),
      S("moodboard-06.png", "4:5", "A figure crouched by a blast door, torch sparks, full shot, high angle."),
      S("moodboard-07.png", "16:9", "A woman at a rooftop railing, sun flaring behind her, medium close-up."),
      S("moodboard-08.png", "1:1", "A driver's profile through a windscreen, warm light on one cheek, close-up.", { has_text: true }),
      S("moodboard-09.png", "16:9", "Two figures on a pier at golden hour, backlit, wide shot, eye level."),
    ],
    styles: [
      {
        spec: EMBER, members: ["s01", "s02", "s03", "s04"],
        replicas: [
          { source: "s01", misses: [4, 2, 1], end: "round-cap" },
          { source: "s03", misses: [3, 0], end: "target-met" },
        ],
        transfers: [{ misses: 1 }, { misses: 2 }],
      },
      {
        spec: SMOKE, members: ["s05", "s06"],
        replicas: [
          { source: "s05", misses: [3, 3], end: "no-usable-fix" },
          { source: "s06", misses: [2, 1], end: "generation-failed" },
        ],
        transfers: [{ misses: 2 }, { misses: null, error: "generator timed out after 120 s (no image returned)" }],
      },
      {
        spec: BOKEH, members: ["s07", "s08", "s09"],
        replicas: [
          { source: "s07", misses: [3, 2, 1], end: "round-cap" },
          { source: "s09", misses: [2, 0], end: "target-met" },
        ],
        transfers: [{ misses: 0 }, { misses: 1 }],
      },
    ],
  });
  // `generation-failed` replicas end on a round with no file; the engine wrote
  // its failure onto the round, so the log names it.
  m.log.splice(4, 0, { at: at(1 * DAY - 30 * MIN), msg: "replica s06 round 3 failed: generator refused the prompt (content_policy)" });
  writeJson(outFile("extract", m.id, "run.json"), m);
  const verdicts: ExtractVerdicts = {
    "ember-lit-realism": { verdict: "keep", at: at(1 * DAY - 70 * MIN) },
    "soft-backlit-bokeh": { verdict: "reject", at: at(1 * DAY - 66 * MIN) },
  };
  writeJson(outFile("extract", m.id, "verdicts.json"), verdicts);
  return m;
}

/** The committed one is built BEFORE the catalogue, which reads its files. */
function extractCommitted(): { m: ExtractManifest; commitAt: string; written: string[] } {
  const S = (name: string, aspect: Aspect, depiction: string): SrcSpec => ({ name, aspect, depiction });
  const m = buildExtract({
    id: `${dayOf(14 * DAY)}-trailer-keyart`, slug: "trailer-keyart", createdAgo: 14 * DAY, finishedAgo: 14 * DAY - 36 * MIN, status: "committed", options: OPTS,
    sources: [
      S("keyart-01.png", "16:9", "A vault corridor flooded with light from a ceiling breach, wide shot, low angle."),
      S("keyart-02.png", "16:9", "A figure on a staircase inside a glass atrium, long beams across the floor, full shot."),
      S("keyart-03.png", "4:5", "A safecracker leaning on a cold steel door, one beam across her shoulder, medium shot."),
      S("keyart-04.png", "16:9", "A wet alley with a pink sign above a doorway, a figure under an umbrella, wide shot."),
      S("keyart-05.png", "16:9", "A taxi stopped at a crossing, teal neon over its roof, medium wide shot."),
      S("keyart-06.png", "1:1", "A driver's reflection in a rain-covered window, signs smeared behind, close-up."),
      S("keyart-07.png", "16:9", "A crew leader against an amber sunset, rough brush strokes, medium shot, eye level."),
      S("keyart-08.png", "9:16", "A tall figure at a window with a single rim of amber light, full shot."),
    ],
    styles: [
      {
        spec: SHAFTS, members: ["s01", "s02", "s03"],
        replicas: [
          { source: "s01", misses: [3, 1], end: "target-met" },
          { source: "s02", misses: [2, 2, 1], end: "round-cap" },
        ],
        transfers: [{ misses: 1 }, { misses: 0 }],
      },
      {
        spec: RAINY, members: ["s04", "s05", "s06"],
        replicas: [
          { source: "s04", misses: [2, 0], end: "target-met" },
          { source: "s05", misses: [4, 3], end: "no-usable-fix" },
        ],
        transfers: [{ misses: 1 }, { misses: 2 }],
      },
      {
        spec: BRUSHED, members: ["s07", "s08"],
        replicas: [
          { source: "s07", misses: [3, 2, 2], end: "round-cap" },
          { source: "s08", misses: [2, 1], end: "target-met" },
        ],
        transfers: [{ misses: 3 }, { misses: 1 }],
      },
    ],
  });
  const commitAt = at(13 * DAY + 20 * HOUR);
  const kept = [SHAFTS.id, RAINY.id];
  const rejected = [BRUSHED.id];
  m.committed = { at: commitAt, kept, rejected, written: kept };
  m.log.push({ at: commitAt, msg: `committed: ${kept.join(", ")} → styles.json` });
  writeJson(outFile("extract", m.id, "run.json"), m);
  const verdicts: ExtractVerdicts = {
    [SHAFTS.id]: { verdict: "keep", at: at(13 * DAY + 21 * HOUR) },
    [RAINY.id]: { verdict: "keep", at: at(13 * DAY + 21 * HOUR) },
    [BRUSHED.id]: { verdict: "reject", at: at(13 * DAY + 21 * HOUR) },
  };
  writeJson(outFile("extract", m.id, "verdicts.json"), verdicts);
  return { m, commitAt, written: kept };
}

function extractFailed(): ExtractManifest {
  const id = `${dayOf(2 * DAY + 6 * HOUR)}-stunt-reference`;
  const t0 = NOW - (2 * DAY + 6 * HOUR);
  const spec = EMBER;
  const names = ["stunt-ref-01.png", "stunt-ref-02.png", "stunt-ref-03.png", "stunt-ref-04.png"];
  const error = "circuit breaker: 3 consecutive vendor failures — gemini/gemini-3.7-flash answered 429 Too Many Requests (quota exhausted for this key)";
  const sources: ExtractSource[] = names.map((name, i) => {
    const sid = `s0${i + 1}`;
    const [w, h] = ASPECT_PX["16:9"];
    const file = `sources/${sid}.png`;
    writeBytes(outFile("extract", id, file), plate(`src:${id}:${sid}`, spec.palette, w, h));
    const r = rng(`extract:${id}:${sid}`);
    return {
      id: sid, name, file, mime: "image/png", width: w, height: h, aspect: "16:9",
      readback: i === 0 ? readbackOf(r, spec.obs, 1, spec, "A stunt rider clearing a burning barricade, wide shot, low angle.") : null,
      error: i === 0 ? null : "vision readback failed: 429 Too Many Requests",
    };
  });
  const m: ExtractManifest = {
    id, slug: "stunt-reference", created: new Date(t0).toISOString(), finished: new Date(t0 + 5 * MIN).toISOString(),
    status: "failed", progress: { stage: "reading", done: 1, total: 4 }, options: OPTS, sources, styles: [], engines: { vision: ENGINES.vision },
    fail_streak: 3, error,
    log: [
      { at: new Date(t0).toISOString(), msg: "created with 4 source(s); 2 replica(s) × 3 round(s), 2 transfer(s) per style" },
      { at: new Date(t0 + 2 * MIN).toISOString(), msg: "read s01" },
      { at: new Date(t0 + 4 * MIN).toISOString(), msg: "s02 failed: 429 Too Many Requests" },
      { at: new Date(t0 + 5 * MIN).toISOString(), msg: `FAILED: ${error}` },
    ],
  };
  writeJson(outFile("extract", id, "run.json"), m);
  return m;
}

/* ═══════════════════════════ DOJO CYCLES ══════════════════════════════════ */

const BASE_PAL = ["#2b3a52", "#4a5a72", "#6b7a8f", "#1d2a3c"];
const CHAL_PAL = ["#b36a2e", "#d89a4a", "#8c4a2a", "#e8c070"];

interface PairSpec {
  scene: string;
  judge: PairResult["judge_pick"];
  reason: string;
  gemini?: { pick: PairResult["judge_pick"]; reason: string } | { error: string };
  video?: boolean;
}
interface ImpSpec {
  id: string; technique: string; subject: string; standard: string; claim: string;
  baseline: string; challenger: string; pairs: PairSpec[]; thumb: number;
}

const GEMINI_MODEL = "gemini-3.7-pro";

function buildCycle(o: {
  id: string; agoMs: number; dimension: string; subject: string; status: CycleManifest["status"]; media: "image" | "video";
  imps: ImpSpec[]; files: boolean; deleted?: boolean; costUsd: number; log: string[]; fail_streak?: number; agreement?: CycleManifest["judge_agreement"];
}): CycleManifest {
  const r = rng(`cycle:${o.id}`);
  const root = (rel: string) => outFile("training", o.id, rel);
  const improvements: Improvement[] = o.imps.map((imp) => {
    const pairs: PairResult[] = imp.pairs.map((p, i) => {
      const pid = `${imp.id}-p${i + 1}`;
      const seed = 41000 + r.int(1, 900);
      const mk = (arm: "baseline" | "challenger") => {
        const ext = p.video ? "mp4" : "png";
        const file = `pairs/${pid}-${arm}.${ext}`;
        const poster = p.video ? `pairs/${pid}-${arm}-poster.png` : undefined;
        if (o.files && !o.deleted) {
          const pal = arm === "baseline" ? BASE_PAL : CHAL_PAL;
          const png = plate(`pair:${o.id}:${pid}:${seed}`, pal);
          if (p.video) {
            writeBytes(root(file), Buffer.from("fixture-mp4-placeholder"));
            writeBytes(root(poster!), png);
          } else writeBytes(root(file), png);
        }
        return { file, ...(poster ? { poster } : {}), kind: p.video ? ("video" as const) : ("image" as const), ...(o.deleted ? { deleted: true } : {}) };
      };
      const pair: PairResult = { id: pid, scene: p.scene, seed, baseline: mk("baseline"), challenger: mk("challenger"), judge_pick: p.judge, reason: p.reason };
      if (p.gemini && "pick" in p.gemini) {
        pair.gemini_pick = p.gemini.pick;
        pair.gemini_model = GEMINI_MODEL;
        pair.gemini_reason = p.gemini.reason;
      } else if (p.gemini) {
        pair.gemini_error = p.gemini.error;
        pair.gemini_model = GEMINI_MODEL;
      }
      return pair;
    });
    const keeper = pairs[imp.thumb];
    return {
      id: imp.id, technique: imp.technique, subject: imp.subject, claim: imp.claim, standard: imp.standard, pairs,
      challenger_recipe: imp.challenger, baseline_recipe: imp.baseline,
      thumbnail: keeper.challenger.poster ?? keeper.challenger.file,
    };
  });
  const t0 = NOW - o.agoMs;
  const m: CycleManifest = {
    version: 1, id: o.id, at: new Date(t0).toISOString(), dimension: o.dimension, subject: o.subject, status: o.status, media: o.media,
    improvements, ...(o.agreement ? { judge_agreement: o.agreement } : {}), fail_streak: o.fail_streak ?? 0, costUsd: o.costUsd,
    log: o.log.map((msg, i) => ({ at: new Date(t0 + i * 9 * MIN).toISOString(), msg })),
  };
  return m;
}

const IMP_WET: ImpSpec = {
  id: "imp-1", technique: "wet-surface-specular-cue", subject: "image-prompt-composition", standard: "image-prompt-composition/surface-state-cues",
  claim: "Naming the surface state (wet asphalt, standing puddles) beside the light source makes the generator draw the reflection instead of a flat dark ground.",
  baseline: "…night street, magenta key from the left, cyan fill from the right, light haze…",
  challenger: "…night street, wet asphalt with standing puddles mirroring the magenta key, cyan fill, light haze…",
  thumb: 0,
  pairs: [
    { scene: "alley-getaway", judge: "challenger", reason: "The puddle carries the sign's reflection; the baseline ground reads as flat black.", gemini: { pick: "challenger", reason: "Reflection on the ground plane anchors the figure in the space." } },
    { scene: "rooftop-handoff", judge: "challenger", reason: "Rain sheen on the parapet gives the case a highlight; baseline hides it in shadow.", gemini: { pick: "baseline", reason: "The sheen looks sprayed on; the baseline's dry concrete is more coherent for a rooftop." } },
    { scene: "vault-corridor", judge: "baseline", reason: "Puddles inside a sealed vault corridor contradict the setting; baseline stays plausible.", gemini: { error: "Gemini 503: the model is overloaded (retry ladder exhausted: flash, pro, flash-lite)" } },
  ],
};
const IMP_HEAD: ImpSpec = {
  id: "imp-2", technique: "negative-space-headroom", subject: "frame-direction", standard: "none",
  claim: "Stating the headroom as a fraction of frame height keeps the subject off the top edge in tall and wide framings alike.",
  baseline: "…medium shot, subject centred, eye level…", challenger: "…medium shot, subject centred with one third of the frame height as headroom, eye level…", thumb: 1,
  pairs: [
    { scene: "control-room-hack", judge: "challenger", reason: "Headroom reads as intentional; the baseline crops the monitors' glow at the top.", gemini: { pick: "challenger", reason: "Cleaner composition, the subject has room to breathe." } },
    { scene: "pawnshop-casing", judge: "challenger", reason: "The window sign stays inside the frame in the challenger only." },
    { scene: "dock-ambush", judge: "tie", reason: "Both frames already sit low in a wide shot; the clause changed nothing visible.", gemini: { pick: "baseline", reason: "Baseline has slightly stronger depth cues from the cranes." } },
  ],
};
const IMP_VIDEO_1: ImpSpec = {
  id: "imp-1", technique: "match-cut-motion-vector", subject: "cinematic-language", standard: "cinematic-language/match-cut-continuity",
  claim: "Stating the exit motion vector of the shot (left to right, 20% of frame per second) gives the next shot a direction to match.",
  baseline: "…truck driving through the tunnel, camera follows…", challenger: "…truck driving through the tunnel left to right at a steady pace, camera tracks parallel…", thumb: 0,
  pairs: [
    { scene: "getaway-tunnel", video: true, judge: "challenger", reason: "The truck keeps one screen direction for the whole clip; the baseline reverses at the half.", gemini: { pick: "challenger", reason: "Motion vector stays consistent, cuttable." } },
    { scene: "dock-ambush", video: true, judge: "challenger", reason: "The crew crosses frame in a single direction, ending on a held pose." },
    { scene: "rooftop-handoff", video: true, judge: "tie", reason: "Nearly static scene; both clips drift identically." },
  ],
};
const IMP_VIDEO_2: ImpSpec = {
  id: "imp-2", technique: "end-hold-last-frames", subject: "cinematic-language", standard: "none",
  claim: "Asking for a held final beat lands the motion on a cuttable frame instead of mid-drift.",
  baseline: "…slow push-in through the full duration…", challenger: "…slow push-in, then hold the final 8 frames static…", thumb: 1,
  pairs: [
    { scene: "vault-corridor", video: true, judge: "challenger", reason: "The hold gives the gesture a landing beat; the baseline ends mid-drift.", gemini: { pick: "challenger", reason: "End stability is clearly better." } },
    { scene: "control-room-hack", video: true, judge: "baseline", reason: "The held frames freeze a blink; baseline's last frames are more natural.", gemini: { pick: "tie", reason: "Hard to separate; both end acceptably." } },
  ],
};
const IMP_COMMITTED: ImpSpec[] = [
  {
    id: "imp-1", technique: "assigned-colour-roles", subject: "image-prompt-composition", standard: "image-prompt-composition/assigned-colour-roles",
    claim: "Writing the palette as ground, figure and accent roles holds a duotone look across scenes better than listing colours.",
    baseline: "…navy, cream and cyan palette…", challenger: "…cyan ground, near-black figure, one pale accent, no second accent…", thumb: 0,
    pairs: [
      { scene: "alley-getaway", judge: "challenger", reason: "Ground and figure separate cleanly; the listed palette re-cast the figure in cyan.", gemini: { pick: "challenger", reason: "Role assignment keeps the figure dark." } },
      { scene: "vault-corridor", judge: "challenger", reason: "One accent only; the baseline invents a second.", gemini: { pick: "baseline", reason: "Baseline has richer colour." } },
      { scene: "rooftop-handoff", judge: "baseline", reason: "Challenger's ground swallows the skyline." },
    ],
  },
  {
    id: "imp-2", technique: "lens-length-in-shot-size", subject: "frame-direction", standard: "none",
    claim: "Naming a lens length next to the shot size changes the perspective compression the generator draws.",
    baseline: "…wide shot, low angle…", challenger: "…wide shot on a 24mm lens, low angle…", thumb: 0,
    pairs: [
      { scene: "dock-ambush", judge: "tie", reason: "No visible change in compression.", gemini: { pick: "tie", reason: "Same framing." } },
      { scene: "getaway-tunnel", judge: "baseline", reason: "The 24mm clause bends the tunnel walls unnaturally.", gemini: { pick: "baseline", reason: "Distortion is excessive." } },
      { scene: "control-room-hack", judge: "baseline", reason: "Challenger stretches the face." },
    ],
  },
  {
    id: "imp-3", technique: "single-practical-light", subject: "image-prompt-composition", standard: "image-prompt-composition/motivated-light",
    claim: "Limiting the scene to one named practical light source stops the generator inventing fill from nowhere.",
    baseline: "…low-key lighting, moody…", challenger: "…lit only by the desk lamp, no other source…", thumb: 1,
    pairs: [
      { scene: "control-room-hack", judge: "challenger", reason: "One source, hard falloff; baseline lights the face from two sides.", gemini: { pick: "challenger", reason: "Motivated light, believable shadow." } },
      { scene: "pawnshop-casing", judge: "challenger", reason: "Shadow direction agrees with the lamp." },
      { scene: "vault-corridor", judge: "challenger", reason: "Pools of light in a dark corridor; baseline is evenly lit.", gemini: { pick: "challenger", reason: "Clear improvement." } },
    ],
  },
];

function trainingCycles(): { ledger: TrainingLedgerRow[]; commit: { id: string; at: string; ids: string[]; thumbs: string[] } } {
  // 1 · awaiting the gate, image, partly decided.
  const d1 = buildCycle({
    id: `${dayOf(1 * DAY)}-wet-surface-cues`, agoMs: 1 * DAY, dimension: "media-generation", subject: "image-prompt-composition", status: "awaiting-gate", media: "image",
    imps: [IMP_WET, IMP_HEAD], files: true, costUsd: 0.46,
    log: ["planned 2 improvements against the weakest dimension", "researched: wet-surface-specular-cue (surface-state cues)", "generated 6 seed-matched pairs on the local stack", "judged pairwise with the chokepoint model", "gemini judged 5/6 pairs; 1 failed (503) after the retry ladder", "parked for the human gate"],
  });
  writeJson(outFile("training", d1.id, "cycle.json"), d1);
  writeJson(outFile("training", d1.id, "verdicts.json"), { "imp-1": "approve", "imp-2": null } satisfies TrainingVerdicts);

  // 2 · awaiting the gate, video pairs with posters.
  const d2 = buildCycle({
    id: `${dayOf(12 * HOUR)}-match-cut-vectors`, agoMs: 12 * HOUR, dimension: "media-generation", subject: "cinematic-language", status: "awaiting-gate", media: "video",
    imps: [IMP_VIDEO_1, IMP_VIDEO_2], files: true, costUsd: 1.87,
    log: ["planned 2 improvements", "generated 5 seed-matched video pairs (LTX, 5 s)", "extracted poster frames", "judged pairwise; parked for the human gate"],
  });
  writeJson(outFile("training", d2.id, "cycle.json"), d2);
  writeJson(outFile("training", d2.id, "verdicts.json"), {});

  // 3 · committed: media gone, thumbs kept in the (fixture) thumbs dir.
  const commitAgo = 6 * DAY - 2 * HOUR;
  const d3 = buildCycle({
    id: `${dayOf(6 * DAY)}-noir-colour-roles`, agoMs: 6 * DAY, dimension: "media-generation", subject: "image-prompt-composition", status: "committed", media: "image",
    imps: IMP_COMMITTED, files: true, deleted: true, costUsd: 0.71, agreement: { chokepoint_vs_human: 0.67, gemini_vs_human: 0.5 },
    log: ["planned 3 improvements", "generated 9 seed-matched pairs", "judged pairwise; parked for the human gate", `committed: 3 decided, 18 files deleted, 2 thumb(s) kept`],
  });
  const dverd: TrainingVerdicts = { "imp-1": "approve", "imp-2": "reject", "imp-3": "approve" };
  // The thumbnails of the approved ones survive in the tracked thumbs dir.
  const commitAt = at(commitAgo);
  const rows: TrainingLedgerRow[] = [];
  const thumbs: string[] = [];
  for (const imp of d3.improvements) {
    const human = dverd[imp.id] as "approve" | "reject";
    const picks = imp.pairs.filter((p) => p.judge_pick === "challenger").length / imp.pairs.length;
    const judged = imp.pairs.filter((p) => p.gemini_pick !== undefined);
    const agree = judged.length ? judged.filter((p) => p.gemini_pick === p.judge_pick).length / judged.length : undefined;
    let thumb: string | undefined;
    if (human === "approve") {
      const fileName = `${d3.id}--${imp.id}.png`;
      writeBytes(outFile("catalogue", "training", "thumbs", fileName), plate(`thumb:${d3.id}:${imp.id}`, CHAL_PAL));
      thumb = `pipeline/foundry/training/thumbs/${fileName}`;
      thumbs.push(thumb);
    }
    rows.push({
      cycle: d3.id, dimension: d3.dimension, subject: d3.subject, technique: imp.technique, human,
      verdict: human === "approve" ? "better" : "not-better", judge_pick_rate: picks,
      ...(agree !== undefined ? { gemini_agreement: agree } : {}), ...(thumb ? { thumb } : {}),
      reflected: imp.id === "imp-1" ? "f33275c" : false, at: commitAt,
    });
  }
  d3.log.push({ at: commitAt, msg: "committed: 3 decided, 18 files deleted, 2 thumb(s) kept" });
  writeJson(outFile("training", d3.id, "cycle.json"), d3);
  writeJson(outFile("training", d3.id, "verdicts.json"), dverd);
  writeBytes(outFile("training", d3.id, "findings.md"), `# Dojo findings — ${d3.id}\n\nCommitted ${commitAt}. 3 decided by hand.\n\n_Fixture data._\n`);

  // 4 · failed: the judge never came back.
  const d4 = buildCycle({
    id: `${dayOf(4 * DAY)}-lens-and-focus`, agoMs: 4 * DAY, dimension: "media-generation", subject: "frame-direction", status: "failed", media: "image",
    imps: [{ ...IMP_HEAD, id: "imp-1", pairs: IMP_HEAD.pairs.slice(0, 2), thumb: 0 }], files: true, costUsd: 0.12, fail_streak: 3,
    log: ["planned 1 improvement", "generated 2 seed-matched pairs", "judge call failed: chokepoint model returned no parseable pick (attempt 1/3)", "judge call failed: chokepoint model returned no parseable pick (attempt 2/3)", "FAILED: circuit breaker open after 3 consecutive judge failures — pairs kept for a manual gate"],
  });
  writeJson(outFile("training", d4.id, "cycle.json"), d4);
  writeJson(outFile("training", d4.id, "verdicts.json"), {});

  return { ledger: rows, commit: { id: d3.id, at: commitAt, ids: d3.improvements.map((i) => i.id), thumbs } };
}

/* ═══════════════════════════ THE CATALOGUE ════════════════════════════════ */

function catalogue(forge: Committed, ext: { m: ExtractManifest; commitAt: string; written: string[] }, dojo: ReturnType<typeof trainingCycles>): { styles: number; ledger: number; rev: number } {
  // Extracted styles, written exactly as commitExtractRun writes them.
  const extracted: StyleDef[] = ext.written.map((sid) => {
    const s = ext.m.styles.find((x) => x.id === sid)!;
    const exemplars: Exemplar[] = [];
    for (const mid of s.members) {
      const src = ext.m.sources.find((x) => x.id === mid);
      if (src) exemplars.push({ kind: "extract", run: ext.m.id, file: src.file, role: "source" });
    }
    for (const rep of s.replicas) {
      const best = [...rep.rounds].filter((x) => x.file).sort((a, b) => (b.score ?? -1) - (a.score ?? -1))[0];
      const settled = settleOf(ext.m, rep.rounds);
      if (best?.file) exemplars.push({ kind: "extract", run: ext.m.id, file: best.file, role: "replica", ...(settled ? { settled } : {}) });
    }
    for (const t of s.transfers) if (t.file) exemplars.push({ kind: "extract", run: ext.m.id, file: t.file, role: "transfer" });
    return {
      id: s.id, name: s.name, family: s.family, status: "candidate",
      origin: { kind: "extracted", source: ext.m.id, models: [ENGINES.vision, ENGINES.reasoner, ENGINES.generator] },
      observables: { ...s.observables }, recipe: s.recipe, negative: s.negative, evidence: [], exemplars,
    };
  });

  const styles: StyleDef[] = SPECS.map(defOf);
  // The forge commit's evidence, and the promotion rule it applies.
  for (const s of styles) {
    s.evidence = forge.evidence[s.id] ?? [];
    const keptScenes = new Set(s.evidence.filter((e) => e.verdict === "keep").map((e) => `${e.run}/${e.scene}`));
    if (keptScenes.size >= 2) s.status = "proven";
  }
  styles.push(...extracted);

  const rev = 3;
  writeJson(outFile("catalogue", "styles.json"), { _purpose: "Fixture catalogue — generated, not evidence.", styles, _rev: rev });
  writeJson(outFile("catalogue", "ledger.json"), { rows: forge.rows });
  writeJson(outFile("catalogue", "training-ledger.json"), { rows: dojo.ledger });
  const journal = [
    { rev: 1, at: ext.commitAt, op: "extract-commit", run: ext.m.id, ids: ext.written, by: "app" },
    { rev: 2, at: forge.commitAt, op: "forge-commit", run: forge.run.id, ids: forge.styles, by: "app" },
    { rev: 3, at: dojo.commit.at, op: "dojo-commit", run: dojo.commit.id, ids: dojo.commit.ids, by: "app" },
  ];
  writeBytes(outFile("catalogue", "catalogue-journal.jsonl"), journal.map((j) => JSON.stringify(j)).join("\n") + "\n");
  return { styles: styles.length, ledger: forge.rows.length, rev };
}

/** engine.ts::settleReason, over a finished replica. */
function settleOf(m: ExtractManifest, rounds: ReplicaRound[]): SettleReason | null {
  if (!rounds.length) return null;
  if (rounds.length >= m.options.rounds) return "round-cap";
  const last = rounds[rounds.length - 1];
  if (last.error && !last.file) return "generation-failed";
  if (typeof last.score === "number" && last.score >= m.options.target) return "target-met";
  const fix = last.critique?.recipe_fix?.trim();
  if (!fix || fix.length < 40 || fix.toLowerCase() === last.recipe.trim().toLowerCase()) return "no-usable-fix";
  return null;
}

/* ═══════════════════════════ ENTRY ═════════════════════════════════════════ */

export function generate(): string {
  // Idempotent under `--only foundry`: these four roots are this generator's.
  for (const d of ["runs", "extract", "training", "catalogue"]) {
    const p = outFile(d);
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }

  const ext = extractCommitted();
  const forge = committedForgeRun();
  const runs = [forge.manifest, doneFullyGraded(), doneWithVerdicts(), incompleteRun(), failedRun(), generatingRun()];
  const extracts = [ext.m, extractDone(), extractFailed()];
  const dojo = trainingCycles();
  const cat = catalogue(forge, ext, dojo);

  const nCand = runs.reduce((n, r) => n + r.candidates.length, 0);
  return `${runs.length} forge runs (${nCand} candidates) · ${extracts.length} extract runs · 4 Dojo cycles · catalogue ${cat.styles} styles, ${cat.ledger}+${dojo.ledger.length} ledger rows, rev ${cat.rev}`;
}
