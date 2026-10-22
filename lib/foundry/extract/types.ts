// THE EXTRACT WIRE TYPES — shared by the disk layer (lib/foundry/extract/store.ts,
// server only), the engine (engine.ts, server only) and the Board's extract
// packet (lib/decision/v1/sources/extract.ts). Nothing here imports Node.
//
// An EXTRACT RUN is the third foundry module, beside the forge's runs and the
// cull. Where the forge takes a style the catalogue already names and asks
// whether it survives on a scene, extraction takes a GALLERY of images nobody
// has named yet and asks the inverse: what styles are in here, can we write
// each one down as a recipe a generator obeys, and does that recipe hold on
// a scene the gallery never showed? The answer is a row per style that a
// human keeps or throws — and a kept row becomes a `candidate` entry in
// pipeline/foundry/styles.json, which is the same place the forge reads from.
//
// The manifest mirrors what engine.ts writes to foundry-out/extract/<id>/run.json.
// TypeScript owns this one end to end (there is no Python side), so the shape
// is the single truth — but the FILE is still the contract: the page polls it
// while the engine rewrites it.

import type { Aspect } from "@/lib/imaging/types";

/* ── The style vocabulary ─────────────────────────────────────────────────── */

/** The observables a style is described by. The first seven are the words
 *  the forge's catalogue and pipeline/vlm-probe/style.py use, so an extracted
 *  style and a read-back one are comparable field by field.
 *
 *  `medium` is this module's own eighth, added 2026-08-27 after the first
 *  live run: a smooth 2D painting (Arcane-style fan art) and a stylised 3D
 *  render are BOTH `stylised-realistic / plausible / soft` in the seven, so a
 *  replica that had slipped from painting to render scored 0.875 while the
 *  eye said the medium was wrong. The forge's grader iterates only its own
 *  four fields, so extra fields on a catalogue entry cost it nothing.
 *
 *  `finish`, `particle_fx` and `focus` are the FIDELITY axes, added the same
 *  day after the first run's cull: its grouping merged clean studio renders
 *  with gritty ember-swept key art, and true shallow-focus photography with
 *  deep-focus renders, because nothing in the vocabulary could see grit,
 *  airborne debris or lens behaviour. A Gemini vision critique over the
 *  wrongly-merged images named these three (its fourth, shading pipeline, is
 *  already expressible as medium × render_mode). */
export const OBSERVABLE_FIELDS = [
  "render_mode",
  "medium",
  "detail_density",
  "surface_realism",
  "atmospherics",
  "particle_fx",
  "palette_strategy",
  "black_handling",
  "edge_treatment",
  "finish",
  "focus",
] as const;
export type ObservableField = (typeof OBSERVABLE_FIELDS)[number];
export type Observables = Record<ObservableField, string>;

/** What the vision model reads back off ONE image.
 *
 *  The last three fields are present only in SINGLETON mode (see
 *  ExtractOptions.grouping): there the vision model writes the whole style
 *  entry while looking at the image, instead of a text model synthesising
 *  one from enums afterwards. */
export interface Readback extends Observables {
  has_text: boolean;
  /** The cinematography vocabulary version this readback was read against
   *  (pipeline/vocab/cinematography.json). Absent on readbacks stored before
   *  the stamp existed. */
  vocabVersion?: number;
  /** Up to five colour words, most dominant first. */
  dominant_colours: string[];
  /** The look in one sentence a generator could obey — no subject matter. */
  look: string;
  /** The SUBJECT and staging in one or two sentences, so the frame can be
   *  re-asked for in another style. Generic on purpose: no names, no
   *  franchises — a generator refuses those and a recipe must not depend on
   *  them. */
  depiction: string;
  /** Singleton mode: a 2–4 word Title Case name for this image's look. */
  style_name?: string;
  /** Singleton mode: the 60–110 word generator recipe, medium named first. */
  recipe?: string;
  /** Singleton mode: what the look must not contain. */
  negative?: string;
}

/** A readback of a GENERATED image, judged against a target style. */
export interface Critique extends Readback {
  /** What deviates from the target look, ≤ 60 words. Empty when nothing does. */
  critique: string;
  /** A revised recipe the next round should use. Same length class as the
   *  original; the whole recipe, not a diff. */
  recipe_fix: string;
}

/* ── Sources ──────────────────────────────────────────────────────────────── */

export interface ExtractSource {
  /** `s01`, `s02`, … — stable within a run. */
  id: string;
  /** The uploaded file's own name, for the human. */
  name: string;
  /** Run-relative path of the stored image. */
  file: string;
  mime: "image/png" | "image/jpeg" | "image/webp";
  width: number;
  height: number;
  /** The closest project aspect, chosen from the pixel ratio: what a replica
   *  of this frame is asked for in. */
  aspect: Aspect;
  readback: Readback | null;
  error: string | null;
}

/* ── Styles, replicas, transfers ──────────────────────────────────────────── */

export interface Scored {
  /** Fraction of the style's observables the image reads back as. Null when
   *  the readback failed. */
  score: number | null;
  per_field: Partial<Record<ObservableField, number>>;
}

/** Why a replica's critique loop stopped.
 *
 *  Two of these are OUTCOMES and two are ABANDONMENTS, and the difference is
 *  not visible in the round list: `target-met` and `round-cap` mean the loop
 *  did the work it was given, while `no-usable-fix` and `generation-failed`
 *  mean it gave up because it could not say what to change or could not draw
 *  anything. The engine has always treated all four the same — one boolean —
 *  which is correct for "will more work happen here" and wrong for everything
 *  that reads a replica as evidence the recipe works. */
export type SettleReason = "round-cap" | "generation-failed" | "target-met" | "no-usable-fix";

/** The two reasons that mean the loop ABANDONED this replica. */
export const ABANDONED_SETTLES: readonly SettleReason[] = ["generation-failed", "no-usable-fix"];

/** One self-critique round: generate, read back, score, propose a fix. */
export interface ReplicaRound extends Scored {
  n: number;
  /** Run-relative path of the JPEG; null when generation failed. */
  file: string | null;
  /** The recipe this round was generated with. */
  recipe: string;
  prompt: string;
  critique: Critique | null;
  generator: string | null;
  vision: string | null;
  error: string | null;
}

export interface Replica {
  /** The source this replica re-asks for. */
  source: string;
  rounds: ReplicaRound[];
}

export interface Transfer extends Scored {
  /** Index into the neutral scene roster (prompts.ts). */
  scene: number;
  /** The scene sentence, kept so the row reads without the roster. */
  brief: string;
  file: string | null;
  prompt: string;
  readback: Readback | null;
  generator: string | null;
  vision: string | null;
  error: string | null;
}

export interface ExtractedStyle {
  /** Slug, unique within the run and — after a commit — in the catalogue. */
  id: string;
  name: string;
  family: string;
  /** Source ids. Every source lands in exactly one style. */
  members: string[];
  observables: Observables;
  /** The recipe IN FORCE: the original until a round improved on it. */
  recipe: string;
  negative: string;
  /** Every recipe that was tried, first to last. */
  recipe_history: string[];
  /** How the grouping was decided: the reasoning engine, or the deterministic
   *  partition when the engine's answer did not cover every source. */
  grouped_by: "engine" | "partition" | "singleton";
  /** Styles whose declared observables sit within one minor field of this
   *  one — a generator will likely render them identically. Set at finish;
   *  the cull decides which survives. */
  similar_to?: string[];
  replicas: Replica[];
  transfers: Transfer[];
}

/* ── The run ──────────────────────────────────────────────────────────────── */

export type ExtractStatus =
  | "created"
  | "reading"
  | "grouping"
  | "replicating"
  | "transferring"
  | "done"
  | "failed"
  | "committed";

export interface ExtractOptions {
  /** Self-critique rounds per replica, including the first. 1 = no critique loop. */
  rounds: number;
  /** How many of a style's sources are replicated. */
  replicas: number;
  /** How many neutral scenes each style is transferred onto. */
  transfers: number;
  /** A round at or above this score ends the loop early. */
  target: number;
  /** Generation seed, offset per image so a run is reproducible. */
  seed: number;
  /** How styles are formed. `engine` (default): readbacks are grouped by the
   *  reasoning turn, partition as fallback. `none`: EVERY IMAGE IS ITS OWN
   *  STYLE — no grouping at all — and the vision model writes each style's
   *  recipe while looking at the image. The mode for measuring per-source
   *  replication fidelity, and for galleries where grouping keeps failing;
   *  the cull (and nearDuplicates) then says which singletons were one style
   *  all along. */
  grouping: "engine" | "none";
  /** The most this run may spend, in USD. ABSENT MEANS UNLIMITED — not zero,
   *  and not a default: a run with no ceiling is metered and never stopped for
   *  money by its own scope (the period meter in lib/imaging/budget.ts still
   *  applies). Before each unit the scheduler adds that unit's pre-call
   *  estimate to `spend.usd`; a unit that would cross the line is not started. */
  ceilingUsd?: number;
}

/** The stage a call's spend is attributed to — one per unit kind that calls a vendor. */
export type SpendStage = "read" | "group" | "replica" | "transfer";

/** What the run has spent, booked after every served call. Optional on the
 *  manifest: a run written before metering existed reads as unmetered. */
export interface ExtractSpend {
  usd: number;
  by_stage: Partial<Record<SpendStage, number>>;
  /** Served calls that reported no cost; each is booked at its pre-call
   *  estimate, so an unpriced vendor cannot run past the ceiling for free. */
  unpriced: number;
  /** `reported` while every figure is the vendor's own; `estimate` once any
   *  booked figure is our arithmetic (an unpriced call, or an estimated cost). */
  basis: "reported" | "estimate";
}

/** Why a run stopped for MONEY — kept apart from `fail_streak`, because a
 *  budget wall is not a vendor failure. `run-ceiling` is this run's own
 *  `ceilingUsd`; `period-ceiling` is the imaging meter's window refusing a
 *  call. Cleared by a retry. */
export interface ExtractStop {
  by: "run-ceiling" | "period-ceiling";
  spentUsd: number;
  ceilingUsd?: number;
  at: string;
}

export interface ExtractManifest {
  id: string;
  slug: string;
  created: string;
  finished?: string;
  status: ExtractStatus;
  progress: { stage: string; done: number; total: number };
  options: ExtractOptions;
  sources: ExtractSource[];
  styles: ExtractedStyle[];
  /** Which engines served, by capability, once known. */
  engines: { vision?: string; generator?: string; reasoner?: string };
  /** WHO WAS DRIVING, on a run started before Phase 4. The app and the CLI
   *  stamped every save and refused each other's fresh stamp (lease.ts). Since
   *  L29 a run is driven by its kernel JOB (`job` below), whose slot lease is
   *  fenced; nothing writes this any more, and the ledger reads it only for a
   *  run that has no job. */
  lease?: { owner: string; at: string };
  /** The kernel job driving this run (`job:run:<id>`, or a later job of a
   *  re-run). The job record is the truth for RUNNING state; this manifest is
   *  the truth for what was produced (plan §5.4). */
  job?: string;
  /** A DRY run: every vendor call was answered by a stand-in, so its pixels and
   *  readbacks are placeholders. It runs end to end and is never committed. */
  dry?: true;
  /** Consecutive vendor failures. The engine's circuit breaker: at
   *  `BREAKER_LIMIT` the run stops as `failed` instead of walking every
   *  remaining unit into the same wall (measured 2026-08-27: a 400 on every
   *  generate burned fifty units in six seconds and finished "done"). */
  fail_streak?: number;
  spend?: ExtractSpend;
  stopped?: ExtractStop;
  log: { at: string; msg: string }[];
  error?: string;
  /** What the commit did. `kept` and `rejected` are the RUN-LOCAL style ids;
   *  `written` is what the catalogue actually holds, which differs whenever a
   *  kept id collided and was suffixed (`haze` -> `haze-2`). Without it the
   *  manifest — the only copy that survives the HTTP response, and what the
   *  Extract tab renders after a reload — names a style the catalogue has no
   *  entry for. Optional because manifests written before this field existed
   *  do not carry it; absent means "assume `kept`, and it may be wrong". */
  committed?: {
    at: string;
    kept: string[];
    rejected: string[];
    written?: string[];
    /** What the run spent, and that divided by the styles kept — the
     *  cost-per-usable figure. Absent on a run that was never metered. */
    spendUsd?: number;
    costPerKeptUsd?: number;
  };
}

export type ExtractVerdict = "keep" | "reject";
export interface ExtractVerdictRecord {
  verdict: ExtractVerdict;
  at: string;
  /** Why a style was rejected, as short tags; kept verbatim, never folded into the note. */
  reasons?: string[];
  note?: string;
  by?: "human" | "model";
}
/** Keyed by style id. Absent = undecided. */
export type ExtractVerdicts = Record<string, ExtractVerdictRecord>;

export interface ExtractSummary {
  id: string;
  slug: string;
  created: string;
  status: ExtractStatus;
  progress: { stage: string; done: number; total: number };
  sources: number;
  styles: number;
  decided: number;
  kept: number;
  /** Absent on a run that was never metered. */
  spendUsd?: number;
}

export interface ExtractDetail {
  run: ExtractManifest;
  verdicts: ExtractVerdicts;
  /** The verdict map's revision (lib/foundry/verdictLog.ts); a PATCH's baseRev. */
  rev?: number;
}

/** What one `step` call did. `unit` is null when there was nothing left. */
export interface StepResult {
  unit: string | null;
  status: ExtractStatus;
  progress: ExtractManifest["progress"];
}

export interface ExtractCommitResult {
  kept: string[];
  rejected: string[];
  /** Catalogue ids that were written (a kept style whose id collided with an
   *  existing catalogue entry is suffixed). */
  written: string[];
}

export interface ExtractRename {
  from: string;
  to: string;
}

export interface ExtractCommitPlan {
  counts: { kept: number; rejected: number; undecided: number };
  written: ExtractRename[];
  similar: Record<string, string[]>;
  rejected: string[];
  undecided: string[];
  token: string;
}

/** Upload shape: what the browser or the CLI hands the store to create a run. */
export interface ExtractUpload {
  name: string;
  mime: ExtractSource["mime"];
  /** Base64 without the data: prefix. */
  base64: string;
}
