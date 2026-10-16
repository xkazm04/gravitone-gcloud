// THE PRODUCE CONTRACT: what the Floor composers, the Plan, Compose and the Runs acts read and
// send (plan §6 Phase 4). ZOD-FREE on purpose - the client imports it, and every import here is
// `import type`, which the bundler erases (tests/next-gates/client-closure.test.ts holds the line).
// Schemas for the doors that accept these shapes live in ./produce.schema.ts.
//
// The prototype priced and scheduled in the browser and applied every act immediately
// (docs/next/prototype/app/studio.js `preview`, `launch`). Two things change here, both from
// COMMON decision 3: a launch is a RECEIPT first and a confirm second, and every figure a screen
// shows carries where it came from, so an illustrative placeholder can never be read as a
// measured cost (registry: measurement-honesty).

import type { GateVerdict as CatalogGateVerdict, WorkKind } from "@gt/catalog/recipes";

import type { JobState } from "./job.machine.ts";
import type { MediaLane, ResourceLane } from "./lane.ts";
import type { PartState } from "./part.machine.ts";
import type { ProjectState } from "./project.machine.ts";

/* ── where a figure came from ─────────────────────────────────────────────── */

/**
 * `real`         a measured price or pace, with the date it was measured (a vendor's price
 *                table row, a timed run);
 * `model`        an estimate the pipeline's own model derives (prototype model.js: forge 1.6 min a
 *                plate, the article band $47-92, Suno 4 min a prompt, the MV encode);
 * `illustrative` the prototype's placeholder, kept so the screen has a shape, and marked as one.
 * A total is as weak as its weakest line: one illustrative figure makes the sum illustrative.
 */
export type FigureSource = "real" | "model" | "illustrative";
export const FIGURE_SOURCES = ["real", "model", "illustrative"] as const satisfies readonly FigureSource[];

/** One figure's provenance: its source and, for `real`, the date and what was measured. An
 *  UNPRICED usd basis is `real` with the reason as its note: the absence is the fact on record. */
export type Basis = { readonly src: FigureSource; readonly note: string; readonly measuredAt?: string };

/* ── a model option for a part ────────────────────────────────────────────── */

/** One way to make a part: a provider's model on a resource lane, priced per unit. */
export type ModelOption = {
  /** Stable key, `<partKind>/<provider>/<model>`; what `setPart` and `reroute` send back. */
  readonly key: string;
  readonly lane: ResourceLane;
  readonly provider: string;
  readonly model: string;
  /** The picker's words for the model ("Flux 2 dev fp8 · ComfyUI"). */
  readonly label: string;
  readonly secondsPerUnit: number;
  /** null = unpriced, and then `unpricedReason` says why (credits, a seat, a subscription). */
  readonly usdPerUnit: number | null;
  /** A per-unit band where only a band is known (the article run's $47-92). */
  readonly usdRangePerUnit?: readonly [number, number];
  readonly unpricedReason?: string;
  /** The weaker of the two bases below - what the source tag shows. */
  readonly src: FigureSource;
  readonly basis: { readonly seconds: Basis; readonly usd: Basis };
};

/* ── the receipt ──────────────────────────────────────────────────────────── */

export type ReceiptMode = "dry" | "live";

export type ReceiptLine = {
  /** A part id for a project, a step name for a run. */
  readonly key: string;
  readonly label: string;
  readonly lane: ResourceLane;
  readonly provider: string;
  readonly model: string;
  readonly units: number;
  readonly seconds: number;
  readonly usd: number | null;
  readonly usdRange?: readonly [number, number];
  readonly unpricedReason?: string;
  readonly src: FigureSource;
  /** 1-based place on its lane when launched now; running slots count as ahead. */
  readonly queuePos: number;
  readonly start: string;
  readonly end: string;
};

export type ReceiptTotals = {
  readonly seconds: number;
  /** The priced lines summed; a lower bound whenever `unpriced` > 0. */
  readonly usd: number;
  readonly usdRange?: readonly [number, number];
  /** How many lines carry no price (each says why on its line). */
  readonly unpriced: number;
  readonly src: FigureSource;
};

/** What a launch is for: a Floor run on a media lane, or a whole project plan at one revision. */
export type ReceiptSubject =
  | { readonly kind: "run"; readonly lane: MediaLane }
  | { readonly kind: "project"; readonly id: string; readonly rev: number };

export type Receipt = {
  /** Digest of the inputs, the quotes and the queue state read. A confirm carries it back. */
  readonly token: string;
  readonly subject: ReceiptSubject;
  readonly mode: ReceiptMode;
  readonly lines: readonly ReceiptLine[];
  readonly totals: ReceiptTotals;
  /** The first line's place on its lane - the composer's "queue #n". */
  readonly queuePos: number;
  readonly etaAt: string;
  readonly ceilingUsd?: number;
  /** The priced total breaches the ceiling; the confirm is refused while true. */
  readonly overCeiling: boolean;
  readonly readAt: string;
};

/** A stale confirm: nothing launched, and the receipt as it reads now. */
export type StaleReceipt = { readonly kind: "stale"; readonly fresh: Receipt };

/* ── the plan ─────────────────────────────────────────────────────────────── */

/** Gate parts are not jobs: each is a Board packet (COMMON decision 10). */
export type GateVerdict = CatalogGateVerdict;

export type PlanSchedule = { readonly start: string; readonly end: string; readonly queuePos: number | null };

export type PlanEstimate = {
  readonly seconds: number;
  readonly usd: number | null;
  readonly usdRange?: readonly [number, number];
  readonly unpricedReason?: string;
  readonly src: FigureSource;
};

type PlanPartBase = {
  readonly id: string;
  readonly label: string;
  readonly after: readonly string[];
  readonly state: PartState;
  /** Absent before the part has had a schedule (a gate behind an unscheduled part). */
  readonly schedule?: PlanSchedule;
};

/** A part that runs as a Job on a resource lane. */
export type WorkPlanPart = PlanPartBase & {
  readonly kind: WorkPartKind;
  readonly units: number;
  readonly unitNoun: string;
  /** Inclusive bounds when the operator may change units; absent when units are fixed. */
  readonly unitsRange?: readonly [number, number];
  readonly options: readonly ModelOption[];
  /** The chosen option's key (one of `options`). */
  readonly chosen: string;
  readonly estimate: PlanEstimate;
  /** `job:part:<partId>`, once launched. */
  readonly jobId?: string;
  readonly jobState?: JobState;
  readonly attempt?: number;
  readonly error?: string;
};

/** An operator act: a gate (a Board packet) or the calendar slot. */
export type OperatorPlanPart = PlanPartBase & {
  readonly kind: "gate" | "slot";
  /** The part a gate judges (absent on a slot). */
  readonly judges?: string;
  readonly verdict?: GateVerdict;
  readonly packetId?: string;
};

export type PlanPart = WorkPlanPart | OperatorPlanPart;

/** Part kinds that run as a Job: `WORK_KINDS` in @gt/catalog/recipes (zod-free, so a value import would be safe too). */
export type WorkPartKind = WorkKind;

/** One resource lane's share of a plan (the prototype's ResourceSummary row). */
export type LaneLoad = {
  readonly lane: ResourceLane;
  readonly jobs: number;
  readonly seconds: number;
  readonly usd: number;
  readonly unpriced: number;
  /** Before launch: where the plan's first job on this lane would queue. */
  readonly queuePos: number | null;
};

export type PlanTotals = {
  readonly seconds: number;
  readonly usd: number;
  readonly usdRange?: readonly [number, number];
  readonly unpriced: number;
  /** What the meter booked so far (zero before launch). */
  readonly spentUsd: number;
  readonly src: FigureSource;
  readonly etaAt: string | null;
  readonly gates: number;
};

export type ProjectHead = {
  readonly id: string;
  readonly rev: number;
  readonly title: string;
  readonly recipe: string;
  readonly recipeLabel: string;
  readonly state: ProjectState;
  readonly launched: boolean;
  readonly styleId?: string;
  readonly takeId?: string;
  readonly topic?: string;
  readonly runtimeS?: number;
  readonly createdAt: string;
  readonly launchedAt?: string;
};

export type PlanView = {
  readonly project: ProjectHead;
  readonly parts: readonly PlanPart[];
  readonly totals: PlanTotals;
  readonly lanes: readonly LaneLoad[];
};

/* ── the project list ─────────────────────────────────────────────────────── */

/** The prototype's list groups, in its order. */
export type ProjectGroup = "weir" | "blocked" | "active" | "plans" | "shipped";
export const PROJECT_GROUPS = ["weir", "blocked", "active", "plans", "shipped"] as const satisfies readonly ProjectGroup[];

export type ProjectSummary = {
  readonly id: string;
  readonly rev: number;
  readonly title: string;
  readonly recipe: string;
  readonly state: ProjectState;
  readonly group: ProjectGroup;
  /** One pip per part, in plan order. */
  readonly pips: readonly PartState[];
  readonly etaAt: string | null;
  readonly gates: number;
  readonly failed: number;
  readonly usd: number;
  readonly unpriced: number;
  readonly updatedAt: string;
};

export type ProjectList = {
  readonly projects: readonly ProjectSummary[];
  /** True when more projects exist than the bounded read returned. */
  readonly truncated: boolean;
};

/* ── acts ─────────────────────────────────────────────────────────────────── */

/** A re-route preview: what choosing `option` does to the whole project. */
export type RerouteOption = {
  readonly option: ModelOption;
  readonly current: boolean;
  /** Change in the project's ETA, in seconds (0 for a lone run). */
  readonly dEtaS: number;
  readonly dUsd: number;
  readonly queuePos: number;
};

export type PartPatch = { readonly option?: string; readonly units?: number };

/* ── the composers ────────────────────────────────────────────────────────── */

/** The forge mechanisms the image composer toggles (prototype index.html :1287). */
export type ImageMechanism = "text" | "ref-early";

export type ComposerInput =
  | ({ readonly lane: "image"; readonly text: string; readonly mechanisms: readonly ImageMechanism[] } & (
      | { readonly styleId: string; readonly sweep?: never }
      | { readonly sweep: true; readonly styleId?: never }
    ))
  | { readonly lane: "article"; readonly text: string; readonly topic: string }
  | { readonly lane: "audio"; readonly text: string; readonly kind: "music" | "sfx" }
  | { readonly lane: "video"; readonly text: string; readonly subject: string };

/** What Compose sends: a recipe id from `@gt/catalog/recipes` and what it is made from. */
export type ComposeInput = {
  readonly recipe: string;
  readonly title?: string;
  readonly styleId?: string;
  readonly takeId?: string;
  readonly topic?: string;
  /** Units by the recipe's unit names (plates, shots, prompts, cards, voice, stills). */
  readonly units?: Readonly<Record<string, number>>;
};

export type LaunchedRun = { readonly runId: string; readonly jobId: string };
export type LaunchedProject = { readonly projectId: string; readonly rev: number; readonly jobIds: readonly string[] };
