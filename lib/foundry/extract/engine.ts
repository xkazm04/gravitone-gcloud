// THE ENGINE — one bounded unit of work per call, and a manifest that is the
// only state.
//
// WHY A STEP MACHINE AND NOT A LOOP. This module runs in two postures: on an
// operator's laptop, where the CLI (pipeline/foundry/extract.mts) can loop
// for an hour; and on Cloud Run, where a request handler has a duration
// ceiling and no background thread survives the response. The forge solves
// the same problem by being a Python process the page merely watches. There
// is no Python on Cloud Run, so the equivalent here is: the manifest on disk
// says what has been done, `next()` says what the next unit is, `perform()`
// does exactly one — one readback, one synthesis turn, one generate+critique
// round, one transfer — and writes the manifest back. Since Phase 4 (L29) the
// caller is a kernel JOB (lib/producers/extract.ts): its plan names the unit
// `next()` names, its drive calls step() once per unit under a fenced slot
// lease, and the CLI, the /step route's kick and the worker are three ways to
// drive the same job. Same code, same order, same files, and a run killed
// halfway resumes at its next unit.
//
// WHAT CROSSES OVER IS WORDS. A replica is generated from the recipe plus the
// source's `depiction` — never with the source as a reference image. A
// reference would let the generator copy the look off the pixels and the run
// would prove nothing about the RECIPE, which is the thing being extracted.
// (The forge's ref-early lane is the deliberate exception, and it is a
// different question.)
//
// THE CRITIQUE LOOP is readback → score → recipe_fix → regenerate, capped by
// `options.rounds` and cut short by `options.target`. The recipe in force is
// whichever round scored best; a fix that did not improve the score is kept in
// `recipe_history` and not adopted, so a wandering critic cannot walk a good
// recipe away from the look.
//
// SERVER ONLY, but through an IO interface so a test can drive it with fakes
// — the state machine's order is the thing worth pinning, and it is the same
// whether the images are real.

import type { Aspect, CostBasis, ImageRef } from "@/lib/imaging/types";
import { NO_TEXT } from "./prompts";
import type { ExtractManifest, ExtractOptions } from "./types";
import type { CallKind } from "@gt/producers/extract/units";

/* ── The IO the engine needs, and nothing more ────────────────────────────── */

export interface Served<T> {
  value: T;
  /** Which model served, for the manifest's `engines` block. */
  model: string;
  /** What the call cost, from the serving provenance. Undefined is UNPRICED,
   *  never free: the engine books the call's pre-call estimate instead. */
  costUsd?: number;
  /** How to read `costUsd` (lib/imaging/types.ts CostBasis). */
  basis?: CostBasis;
}

/** The three vendor calls a unit can make, priced separately, and the pre-call
 *  estimates used when the IO declares none: what the ceiling compares against
 *  before a unit starts, and what an unpriced call is booked at. One table with
 *  the job's plan (packages/producers/src/extract/units.ts). */
export type { CallKind } from "@gt/producers/extract/units";
export { DEFAULT_CALL_ESTIMATE_USD } from "@gt/producers/extract/units";

/** Largest per-run ceiling accepted; anything above is clamped to it. */
export const MAX_CEILING_USD = 10_000;

export interface EngineIO {
  /** Read a run-relative image. */
  readImage(rel: string): Promise<ImageRef>;
  /** Write a run-relative image; returns nothing, the path is the caller's. */
  writeImage(rel: string, img: ImageRef): Promise<void>;
  /** Vision: an image and an instruction → JSON satisfying `schema`. */
  recognize(img: ImageRef, instruction: string, schema: Record<string, unknown>): Promise<Served<unknown>>;
  /** Generation: words → one image. Never given references here. */
  generate(prompt: string, negative: string, aspect: Aspect, seed: number): Promise<Served<ImageRef>>;
  /** Reasoning: a prompt → JSON satisfying `schema`. */
  reason(prompt: string, schema: Record<string, unknown>): Promise<Served<unknown>>;
  /** The pre-call estimate for one call of this kind, in USD. Optional; the
   *  engine falls back to DEFAULT_CALL_ESTIMATE_USD. */
  estimateUsd?(kind: CallKind): number | undefined;
  /** Persist the manifest. Called after every unit. */
  save(m: ExtractManifest): Promise<void>;
  now(): string;
}

export const DEFAULT_OPTIONS: ExtractOptions = {
  rounds: 2,
  replicas: 2,
  transfers: 1,
  target: 0.85,
  seed: 20260827,
  grouping: "engine",
};

export { LEASE_TTL_MS, activeLease, foreignLease } from "./lease";
export { BREAKER_LIMIT, pruneFailures } from "./breaker";
export { clampCeiling } from "./spend";
export { unitLabel, settleReason, next, totalUnits, doneUnits } from "./units";
export type { Unit } from "./units";
export { step } from "./perform";
export { hasFailures, runToEnd } from "./drive";
export { newManifest } from "./helpers";

export { NO_TEXT };
