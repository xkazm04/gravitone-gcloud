// THE EXTRACT WIRE TYPES — shared by the disk layer (lib/foundry/extract/store.ts,
// server only), the engine (engine.ts, server only) and the /foundry Extract tab
// (client). Nothing here imports Node.
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
 *  four fields, so an eighth on a catalogue entry costs it nothing. */
export const OBSERVABLE_FIELDS = [
  "render_mode",
  "medium",
  "detail_density",
  "surface_realism",
  "atmospherics",
  "palette_strategy",
  "black_handling",
  "edge_treatment",
] as const;
export type ObservableField = (typeof OBSERVABLE_FIELDS)[number];
export type Observables = Record<ObservableField, string>;

/** What the vision model reads back off ONE image. */
export interface Readback extends Observables {
  has_text: boolean;
  /** Up to five colour words, most dominant first. */
  dominant_colours: string[];
  /** The look in one sentence a generator could obey — no subject matter. */
  look: string;
  /** The SUBJECT and staging in one or two sentences, so the frame can be
   *  re-asked for in another style. Generic on purpose: no names, no
   *  franchises — a generator refuses those and a recipe must not depend on
   *  them. */
  depiction: string;
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
  grouped_by: "engine" | "partition";
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
  /** WHO IS DRIVING. The app (`app`) and the CLI (`cli`) are separate
   *  processes writing the same manifest, and a manifest has no merge: two
   *  drivers on one run would each append their own round and the last
   *  writer would win. So every save stamps the driver, and a driver refuses
   *  to step over another's fresh stamp (engine.ts::activeLease). Cleared on
   *  finish. */
  lease?: { owner: string; at: string };
  /** Consecutive vendor failures. The engine's circuit breaker: at
   *  `BREAKER_LIMIT` the run stops as `failed` instead of walking every
   *  remaining unit into the same wall (measured 2026-08-27: a 400 on every
   *  generate burned fifty units in six seconds and finished "done"). */
  fail_streak?: number;
  log: { at: string; msg: string }[];
  error?: string;
  committed?: { at: string; kept: string[]; rejected: string[] };
}

export type ExtractVerdict = "keep" | "reject";
export interface ExtractVerdictRecord {
  verdict: ExtractVerdict;
  at: string;
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
}

export interface ExtractDetail {
  run: ExtractManifest;
  verdicts: ExtractVerdicts;
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

/** Upload shape: what the browser or the CLI hands the store to create a run. */
export interface ExtractUpload {
  name: string;
  mime: ExtractSource["mime"];
  /** Base64 without the data: prefix. */
  base64: string;
}
