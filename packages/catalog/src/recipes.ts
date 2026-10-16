import { TEMPLATES, type TemplateId } from "./projects.ts";

// THE RECIPES - what a Project is made of, as data (plan §2.2, COMMON decision 2).
//
// Absorbed from the prototype's RECIPES (docs/next/prototype/app/studio.js :78-86): Film, Album
// video and Explainer, each a list of parts with the parts they wait for. Three things change:
//   - A FILM IS ONE RECIPE PER v1 TEMPLATE (`film/<template>`), so the units a film plans default
//     from the template's own target length (`defaultS`), not from one literal for every film.
//     The prototype's 24 plates / 8 shots / 2 prompts are exactly what the rule below gives a
//     120 s template, so the trailer it drew is unchanged.
//   - THE SINGLE-PRODUCER RECIPES (article, track, style, strips) are recipes too, so a Floor
//     run and a Project share one shape and one receipt; the prototype launched those as
//     free-standing jobs with no plan behind them (studio.js `foundryJobs`).
//   - EVERY DEFAULT SAYS WHERE IT CAME FROM: `template` (derived from the v1 template's
//     `defaultS`), `prototype` (the prototype's literal, a placeholder nobody measured).
//
// Pure data and two pure lookups; nothing here knows a price, a lane's queue or a model. The
// model options per part kind are ./partOptions.ts.

/** The inputs a recipe's units are drawn from, by the prototype's names (`u.plates`...). */
export const UNIT_INPUTS = ["plates", "shots", "prompts", "stills", "cards", "voice", "sources", "cycles", "clips"] as const;
export type UnitInput = (typeof UNIT_INPUTS)[number];

/** The operator's verdict kind a gate opens on the Board (COMMON decision 10). */
export type GateVerdict = "matrix-cull" | "pick" | "packet-review";

/** Parts that run as a Job. */
export const WORK_KINDS = [
  "research",
  "script",
  "frames",
  "motion",
  "voice",
  "score",
  "sfx",
  "cut",
  "still",
  "words",
  "render",
  "article",
  "strips",
  "track",
  "extract",
  "forge",
  "dojo",
] as const;
export type WorkKind = (typeof WORK_KINDS)[number];
/** Parts that are an operator's act: a gate (a Board packet) or the calendar slot. */
export const OPERATOR_KINDS = ["gate", "slot"] as const;
export type OperatorKind = (typeof OPERATOR_KINDS)[number];

export type Units = { readonly fixed: number } | { readonly input: UnitInput; readonly range: readonly [number, number] };

export type RecipePart =
  | { readonly key: string; readonly kind: WorkKind; readonly units: Units; readonly after: readonly string[] }
  | { readonly key: string; readonly kind: "gate"; readonly judges: string; readonly verdict: GateVerdict; readonly after: readonly string[] }
  | { readonly key: string; readonly kind: "slot"; readonly after: readonly string[] };

export type UnitDefault = { readonly value: number; readonly src: "template" | "prototype"; readonly note: string };

export type RecipeFamily = "film" | "album" | "explainer" | "article" | "track" | "style" | "strips";

export type Recipe = {
  readonly id: string;
  readonly family: RecipeFamily;
  readonly label: string;
  /** The prototype's sub-line ("script · frames · motion · score · cut"). */
  readonly sub: string;
  readonly icon: string;
  readonly template?: TemplateId;
  readonly parts: readonly RecipePart[];
  readonly defaults: Readonly<Partial<Record<UnitInput, UnitDefault>>>;
};

/** The prototype's units input bounds (projects.js PlanRow: 1-200). */
const RANGE: readonly [number, number] = [1, 200];
const work = (key: WorkKind, units: Units, after: readonly string[] = []): RecipePart => ({ key, kind: key, units, after });
const per = (input: UnitInput): Units => ({ input, range: RANGE });
const one: Units = { fixed: 1 };
const gate = (judges: string, verdict: GateVerdict): RecipePart => ({ key: `gate:${judges}`, kind: "gate", judges, verdict, after: [judges] });
const slot = (after: string): RecipePart => ({ key: "slot", kind: "slot", after: [after] });
const proto = (value: number, what: string): UnitDefault => ({ value, src: "prototype", note: `prototype studio.js: ${what}` });

/* ── films: one per v1 template that is not a music video ─────────────────── */

/**
 * Units from the template's target length, at the prototype's own pace: its trailer drew 24
 * plates for 120 s (one plate per 5 s), a shot per three plates (8 for 24) and a score prompt per
 * minute (2 for 120 s). These are the prototype's ratios carried to every length, not a
 * measurement of how many plates a cut needs; they say so.
 */
export function filmDefaults(defaultS: number): Readonly<Record<"plates" | "shots" | "prompts", UnitDefault>> {
  const plates = Math.min(RANGE[1], Math.max(1, Math.round(defaultS / 5)));
  const why = `from the template's ${defaultS} s target`;
  return {
    plates: { value: plates, src: "template", note: `${why} at one plate per 5 s (the prototype's 24 for 120 s)` },
    shots: { value: Math.max(1, Math.ceil(plates / 3)), src: "template", note: `${why} at one shot per 3 plates (the prototype's 8 for 24)` },
    prompts: { value: Math.max(1, Math.round(defaultS / 60)), src: "template", note: `${why} at one score prompt per minute (the prototype's 2 for 120 s)` },
  };
}

const FILM_PARTS: readonly RecipePart[] = [
  work("research", one),
  work("script", one, ["research"]),
  work("frames", per("plates"), ["script"]),
  gate("frames", "matrix-cull"),
  work("motion", per("shots"), ["gate:frames"]),
  work("score", per("prompts"), ["script"]),
  gate("score", "pick"),
  work("cut", one, ["motion", "gate:score"]),
  gate("cut", "packet-review"),
  slot("gate:cut"),
];

const FILMS: readonly Recipe[] = TEMPLATES.filter((t) => t.id !== "music-video").map((t) => ({
  id: `film/${t.id}`,
  family: "film",
  label: `Film · ${t.label}`,
  sub: "script · frames · motion · score · cut",
  icon: "video",
  template: t.id,
  parts: FILM_PARTS,
  defaults: filmDefaults(t.defaultS),
}));

/* ── the two composed recipes beside film ─────────────────────────────────── */

const ALBUM: Recipe = {
  id: "album-video",
  family: "album",
  label: "Album video",
  sub: "track · still · words · render",
  icon: "audio",
  parts: [
    work("still", per("stills")),
    gate("still", "pick"),
    work("words", { fixed: 2 }),
    work("render", one, ["gate:still", "words"]),
    gate("render", "packet-review"),
    slot("gate:render"),
  ],
  defaults: { stills: proto(2, "album `u.stills || 2`") },
};

const EXPLAINER: Recipe = {
  id: "explainer",
  family: "explainer",
  label: "Explainer",
  sub: "article · strips · voice · cut",
  icon: "article",
  parts: [
    work("article", one),
    gate("article", "packet-review"),
    work("strips", per("cards"), ["gate:article"]),
    work("voice", per("voice"), ["gate:article"]),
    gate("strips", "matrix-cull"),
    work("cut", one, ["gate:strips", "voice"]),
    gate("cut", "packet-review"),
    slot("gate:cut"),
  ],
  defaults: { cards: proto(6, "explainer `u.cards || 6`"), voice: proto(3, "explainer `u.voice || 3`") },
};

/* ── single-producer recipes: one part and its gate ───────────────────────── */

const single = (id: string, family: RecipeFamily, label: string, icon: string, kind: WorkKind, units: Units, verdict: GateVerdict, defaults: Recipe["defaults"]): Recipe => ({
  id,
  family,
  label,
  sub: kind,
  icon,
  parts: [work(kind, units), gate(kind, verdict)],
  defaults,
});

const SINGLES: readonly Recipe[] = [
  single("article/post", "article", "Article", "article", "article", one, "packet-review", {}),
  single("track/music", "track", "Track · music", "audio", "track", per("prompts"), "pick", { prompts: proto(2, "score `u.prompts || 2`") }),
  single("track/sfx", "track", "Track · sfx", "audio", "sfx", per("clips"), "pick", { clips: proto(2, "Floor audio estimate `2 clips`") }),
  single("style/extract", "style", "Style · extract", "image", "extract", per("sources"), "pick", {
    sources: { value: 12, src: "prototype", note: "a placeholder gallery size; v1 extract caps a run at 60 sources (lib/foundry/extract MAX_SOURCES)" },
  }),
  single("style/forge-sweep", "style", "Style · forge sweep", "image", "forge", per("plates"), "matrix-cull", { plates: proto(20, "`Forge sweep-01 · 20 plates`") }),
  single("style/dojo-cycle", "style", "Style · Dojo cycle", "image", "dojo", per("cycles"), "pick", { cycles: proto(2, "`Dojo · 2 cycles`") }),
  single("strips/edu", "strips", "Strips · edu", "video", "strips", per("cards"), "matrix-cull", { cards: proto(12, "`Strips · 12 edu cards`") }),
  single("strips/stat", "strips", "Strips · stat", "video", "strips", per("cards"), "matrix-cull", { cards: proto(12, "`Strips · 12 edu cards`, the stat lane assumed alike") }),
];

/** Every recipe, the three the prototype offers first (Compose keys 1-3), then the rest. */
export const RECIPES: readonly Recipe[] = [FILMS.find((r) => r.template === "short-educational-video") ?? FILMS[0]!, ALBUM, EXPLAINER, ...FILMS.filter((r) => r.template !== "short-educational-video"), ...SINGLES];
export const RECIPE_IDS: readonly string[] = RECIPES.map((r) => r.id);

export function recipeById(id: string): Recipe | undefined {
  return RECIPES.find((r) => r.id === id);
}

/** A planned part: its key, kind and units resolved from the inputs (or the recipe's defaults). */
export type PlannedPart =
  | { readonly key: string; readonly kind: WorkKind; readonly units: number; readonly unitsRange?: readonly [number, number]; readonly after: readonly string[] }
  | { readonly key: string; readonly kind: "gate"; readonly judges: string; readonly verdict: GateVerdict; readonly after: readonly string[] }
  | { readonly key: string; readonly kind: "slot"; readonly after: readonly string[] };

/**
 * The parts a recipe plans from `inputs`. An input outside its part's range is clamped into it
 * (the prototype's units field did the same at 1-200); a missing input takes the recipe's
 * default, and an input the recipe names no default for is a table bug caught by the test.
 */
export function planParts(recipe: Recipe, inputs: Readonly<Partial<Record<UnitInput, number>>> = {}): PlannedPart[] {
  return recipe.parts.map((p): PlannedPart => {
    if (p.kind === "gate" || p.kind === "slot") return p;
    if ("fixed" in p.units) return { key: p.key, kind: p.kind, units: p.units.fixed, after: p.after };
    const [lo, hi] = p.units.range;
    const asked = inputs[p.units.input] ?? recipe.defaults[p.units.input]?.value ?? lo;
    const units = Math.min(hi, Math.max(lo, Math.round(asked)));
    return { key: p.key, kind: p.kind, units, unitsRange: p.units.range, after: p.after };
  });
}
