import "server-only";

import { PRESETS, thumbSrc } from "@gt/catalog/presets";
import type { StyleBlock } from "@gt/catalog/style";
import { STYLE_TRIALS, blockDigest, compileStyleBlock } from "@gt/domain/style.ratchet";

// THE FIXTURE STYLE UNIVERSE - five records, one per place on the ratchet, so the atelier is
// driven through every state from a fresh server: a proven catalogue style with no look yet (the
// adopt -> generate -> judge -> lock journey starts here), a preset style mid-proofing (an
// undecided plate, a rejection with its note, an approval rendered under an earlier block), a
// locked one (block frozen, duplicate the way on), a candidate with words and no sheet, and an
// extracted candidate with exemplars and nothing kept at the Weir.
//
// The catalogue halves are pipeline/foundry/styles.json's own entries (painted-3d, soft-backlit-
// bokeh) verbatim; the looks are @gt/catalog's presets. Pictures are the one tracked picture per
// preset (public/presets/<preset>.jpg), put into the kernel's blob store at seed time. The
// 2026-08-13 Google trial grid (public/trials/google/<preset>/<trial>.jpg) is gitignored, so a
// fresh clone does not have it and nothing here may name it: every trial of a preset lands that
// preset's one picture. The fixture never claims a plate it shows was rendered for the style it
// sits on, which is why proofs off another preset's picture say so in their label.

export type SeedProof = {
  readonly id: string;
  readonly label: string;
  readonly file: string;
  readonly state: "pending" | "approved" | "rejected";
  readonly note?: string;
  readonly trialId?: string;
  /** "current" = rendered under the seed's block; a literal digest = an earlier block. */
  readonly digest?: "current" | string;
  readonly provider?: string;
  readonly model?: string;
  readonly costUsd?: number;
  readonly source?: string;
  readonly at: string;
};

export type SeedExemplar = { readonly role: "source" | "replica" | "transfer"; readonly file: string; readonly run: string; readonly settled?: "round-cap" | "generation-failed" | "target-met" | "no-usable-fix" };

export type SeedEvidence = { readonly run: string; readonly scene: string; readonly mechanism: string; readonly verdict: "keep" | "reject"; readonly at: string; readonly by: "operator" | "agent" };

export type Seed = {
  readonly id: string;
  readonly name: string;
  readonly family: string;
  readonly origin: { readonly kind: "readback" | "authored" | "extracted" | "preset" | "plate" | "foundry"; readonly source?: string; readonly models?: readonly string[]; readonly presetId?: string };
  readonly discipline?: "educational";
  readonly observables: Readonly<Record<string, string>>;
  readonly recipe: string;
  readonly negative: string;
  readonly block?: StyleBlock;
  readonly elements: readonly string[];
  readonly evidence: readonly SeedEvidence[];
  readonly exemplars: readonly SeedExemplar[];
  readonly proofs: readonly SeedProof[];
  readonly lock?: { readonly at: string; readonly by: string };
};

/** The picture a preset's trial lands as: the preset's tracked picture (the trial plates are not committed). */
export const presetPlate = (preset: string): string => `/presets/${preset}.jpg`;
const trialFile = (preset: string, _trial: string): string => presetPlate(preset);
const preset = (id: string) => {
  const p = PRESETS.find((x) => x.id === id);
  if (p === undefined) throw new Error(`fixture: no preset ${id}`);
  return p;
};
const GOOGLE = { provider: "google", model: "gemini-3.1-flash-image", costUsd: 0.045 } as const;

/** The palette the recognize model is recorded as reading off painted-3d's first kept plate. */
export const ADOPT_REPLY: Readonly<Record<string, readonly { readonly name: string; readonly hex: string; readonly role: "ground" | "objects" | "accent" }[]>> = {
  "painted-3d": [
    { name: "crushed violet", hex: "#1b1426", role: "ground" },
    { name: "painted umber", hex: "#8a5a3c", role: "objects" },
    { name: "hextech blue", hex: "#3fc6f0", role: "accent" },
  ],
};

/** The kept forge plates adopt seeds as pending proofs (v1 adopt.ts seedProofs: text-lane keeps). */
export const ADOPT_SEEDS: Readonly<Record<string, readonly { readonly run: string; readonly scene: string; readonly seed: number; readonly model: string; readonly file: string }[]>> = {
  "painted-3d": [
    { run: "2026-08-26-dry-run", scene: "wow-archer", seed: 1, model: "flux2-klein-9b", file: "/presets/paper-relief.jpg" },
    { run: "2026-08-26-sweep-01", scene: "matrix-rooftop", seed: 2, model: "flux2-klein-9b", file: "/presets/data-neon.jpg" },
  ],
};

/** The preset whose picture a dry render lands as, per style (a stand-in, said in its label). */
export const DRY_GRID: Readonly<Record<string, string>> = { "painted-3d": "data-neon", "newsprint-cutout": "newsprint-cutout", "chalk-argument": "chalk-argument", blueprint: "blueprint", "soft-backlit-bokeh": "data-neon" };

const PAINTED_KEEPS: readonly SeedEvidence[] = [
  { run: "2026-08-26-dry-run", scene: "wow-archer", mechanism: "text", verdict: "keep", at: "2026-08-26T18:21:52.962Z", by: "operator" },
  { run: "2026-08-26-dry-run", scene: "wow-archer", mechanism: "ref-early", verdict: "keep", at: "2026-08-26T18:21:52.962Z", by: "operator" },
  { run: "2026-08-26-sweep-01", scene: "lotr-cavalry", mechanism: "ref-early", verdict: "keep", at: "2026-08-27T07:13:28.768Z", by: "operator" },
  { run: "2026-08-26-sweep-01", scene: "sw-doorway", mechanism: "text", verdict: "reject", at: "2026-08-27T07:13:28.768Z", by: "operator" },
  { run: "2026-08-26-sweep-01", scene: "matrix-rooftop", mechanism: "text", verdict: "keep", at: "2026-08-27T07:13:28.768Z", by: "operator" },
  { run: "2026-08-26-sweep-01", scene: "wow-helm", mechanism: "text", verdict: "reject", at: "2026-08-27T07:13:28.768Z", by: "operator" },
  { run: "2026-08-26-sweep-01", scene: "arcane-standoff", mechanism: "text", verdict: "keep", at: "2026-08-27T07:13:28.768Z", by: "agent" },
];

const newsprint = preset("newsprint-cutout");
const blueprint = preset("blueprint");
const chalk = preset("chalk-argument");
/** The block newsprint's stale approval was rendered under: the finish before it was tightened. */
const NEWSPRINT_EARLIER = blockDigest({ ...newsprint.block, finish: `${newsprint.block.finish}, soft drop shadows` });

const sheetEvidence = (id: string, problems: readonly string[], at: string): SeedEvidence[] =>
  problems.map((scene) => ({ run: `sheet:${id}`, scene, mechanism: "proof", verdict: "keep", at, by: "operator" }));

export const SEEDS: readonly Seed[] = [
  {
    id: "painted-3d",
    name: "Painted 3D",
    family: "animation",
    origin: { kind: "readback", source: "arcane-fights", models: ["qwen3.8:27b", "gemini-3.7-flash"] },
    observables: { render_mode: "painterly", detail_density: "moderate", surface_realism: "plausible", atmospherics: "heavy-haze", palette_strategy: "warm-cool-split", black_handling: "crushed", edge_treatment: "soft" },
    recipe:
      "Stylised 3D characters with hand-painted matte textures and visible brush strokes on every surface. Heavy atmospheric haze softening the background. Blacks crushed to near-total darkness so only lit forms and a few saturated neon accents (electric blue, hot pink) read. One hard directional key with sharp planar highlights on faces. Clean graphic surfaces, no fine noisy texture, painted motion smears where anything moves.",
    negative: "photograph, photoreal skin, film grain, flat cel shading, text, watermark",
    elements: [],
    evidence: PAINTED_KEEPS,
    exemplars: [],
    proofs: [],
  },
  {
    id: "newsprint-cutout",
    name: newsprint.name,
    family: "explainer",
    origin: { kind: "preset", presetId: newsprint.id },
    discipline: "educational",
    observables: {},
    recipe: compileStyleBlock(newsprint.block),
    negative: "photograph, gradients, text, watermark",
    block: newsprint.block,
    elements: newsprint.elements,
    evidence: [...sheetEvidence("newsprint-cutout", ["quantity", "inventory", "flow"], "2026-09-02T10:00:00.000Z"), { run: "sheet:newsprint-cutout", scene: "mechanism", mechanism: "proof", verdict: "reject", at: "2026-09-02T10:05:00.000Z", by: "operator" }],
    exemplars: [],
    proofs: [
      { id: "pr-nc-fall", label: "the fall", file: trialFile("newsprint-cutout", "peak-and-fall"), state: "approved", trialId: "peak-and-fall", digest: "current", ...GOOGLE, at: "2026-09-02T09:40:00.000Z" },
      { id: "pr-nc-wish", label: "the wish list", file: trialFile("newsprint-cutout", "wish-list"), state: "approved", trialId: "wish-list", digest: "current", ...GOOGLE, at: "2026-09-02T09:41:00.000Z" },
      { id: "pr-nc-booking", label: "the booking", file: trialFile("newsprint-cutout", "booking-not-meal"), state: "pending", trialId: "booking-not-meal", digest: "current", ...GOOGLE, at: "2026-09-02T09:42:00.000Z" },
      { id: "pr-nc-flywheel", label: "the flywheel", file: trialFile("newsprint-cutout", "flywheel"), state: "rejected", note: "the arrows lost their cut paper edge", trialId: "flywheel", digest: "current", ...GOOGLE, at: "2026-09-02T09:43:00.000Z" },
      { id: "pr-nc-exit", label: "the exit", file: trialFile("newsprint-cutout", "the-exit"), state: "approved", trialId: "the-exit", digest: NEWSPRINT_EARLIER, provider: "google", model: "gemini-3.1-flash-image", at: "2026-08-30T15:00:00.000Z" },
    ],
  },
  {
    id: "blueprint",
    name: blueprint.name,
    family: "explainer",
    origin: { kind: "preset", presetId: blueprint.id },
    discipline: "educational",
    observables: {},
    recipe: compileStyleBlock(blueprint.block),
    negative: "photograph, gradients, text, watermark",
    block: blueprint.block,
    elements: blueprint.elements,
    evidence: sheetEvidence("blueprint", ["quantity", "inventory", "analogy", "mechanism"], "2026-08-20T11:00:00.000Z"),
    exemplars: [],
    proofs: ["peak-and-fall", "wish-list", "booking-not-meal", "flywheel"].map((t, i) => ({
      id: `pr-bp-${t}`,
      label: STYLE_TRIALS.find((x) => x.id === t)?.label ?? t,
      file: trialFile("blueprint", t),
      state: "approved" as const,
      trialId: t,
      digest: "current",
      ...GOOGLE,
      at: `2026-08-20T10:0${i}:00.000Z`,
    })),
    lock: { at: "2026-08-20T11:30:00.000Z", by: "operator" },
  },
  {
    id: "chalk-argument",
    name: chalk.name,
    family: "explainer",
    origin: { kind: "preset", presetId: chalk.id },
    discipline: "educational",
    observables: {},
    recipe: compileStyleBlock(chalk.block),
    negative: "photograph, text, watermark",
    block: chalk.block,
    elements: chalk.elements,
    evidence: [],
    exemplars: [],
    proofs: [],
  },
  {
    id: "soft-backlit-bokeh",
    name: "Soft Backlit Bokeh",
    family: "photo",
    origin: { kind: "extracted", source: "2026-08-27-artstyle-train", models: ["google/gemini-3.6-flash", "claude-cli/claude-opus-5", "google/gemini-3.1-flash-image"] },
    observables: { render_mode: "photoreal-cg", detail_density: "sparse", surface_realism: "physically-convincing", atmospherics: "particulate", palette_strategy: "desaturated-naturalistic", black_handling: "deep-neutral", edge_treatment: "diffused" },
    recipe:
      "Photoreal CG rendering with soft, diffused edges. Strong backlighting creating gentle rim highlights on surfaces. Shallow focus completely dissolving the background into smooth circular bokeh without hard geometric shapes. Fine airborne particles catching the light beam.",
    negative: "hard contrast, neon accents, crisp graphic edges, dense clutter, saturated palette, heavy grime texture, text, watermark",
    elements: [],
    evidence: [],
    exemplars: [
      { role: "source", file: thumbSrc("data-neon"), run: "2026-08-27-artstyle-train" },
      { role: "replica", file: thumbSrc("signal-ledger"), run: "2026-08-27-artstyle-train", settled: "target-met" },
      { role: "replica", file: thumbSrc("chalk-argument"), run: "2026-08-27-artstyle-train", settled: "no-usable-fix" },
    ],
    proofs: [],
  },
];
