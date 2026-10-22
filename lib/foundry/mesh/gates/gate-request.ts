// PORTED WITH PROVENANCE (spark game-3d-assets WP2): pof (C:\Users\kazda\kiro\pof)
// src/lib/visual-gen/gate-request.ts @ 4f5a8f58, copied 2026-10-22. The rule is verbatim; two
// TYPES it imported are restated here because their PoF homes spawn trimesh (mesh-critique.ts) or
// carry the stage remedies this port does not need (critique-stage.ts @ 6cf2eb64): `MeshStage`
// verbatim, and `CritiqueDeps` reduced to the four fields the gate reads (PoF's also carries the
// spawn seam: run, fileExists, env, triposrRoot).
// Do not edit the rules here; port a newer PoF commit and bump GATES_VERSION (./version.ts).

import type { BudgetRequest } from './face-budget';
import type { CritiqueThresholds } from './mesh-score';
import type { OrientationRequest, SizeRequest } from './world-scale';

/** Which stage of the pipeline produced the mesh being graded (critique-stage.ts, verbatim). */
export type MeshStage =
  /** Straight from a generator — pre-retopo, pre-unwrap, pre-bake. */
  | 'raw'
  /** After a `mesh-finish` pass (join → decimate → unwrap → bake). */
  | 'finished'
  /** The caller did not say. Never guessed — an unstated stage is reported as unstated. */
  | 'unknown';

/** mesh-critique.ts `CritiqueDeps`, the fields the gate reads. */
export interface CritiqueDeps {
  thresholds?: Partial<CritiqueThresholds>;
  budget?: BudgetRequest;
  size?: SizeRequest;
  stage?: MeshStage;
  orientation?: OrientationRequest;
}

import { critiqueThresholdsFor, resolveAssetClass } from './polycount';
import { expectsUprightFor, nominalExtentFor } from './world-scale';

export interface GateRequestInput {
  /** What the caller sent — resolved (and stated) here, never trusted raw. */
  assetClass: string | undefined;
  /** What the producer's output IS: generator output is `raw`, a finish run is `finished`. */
  stage: MeshStage;
  /** Intended longest extent (m); falls back to the class nominal only where one is honest. */
  targetExtentM?: number;
  /** The face budget actually SENT to the generator/finisher. Absent → no budget grade. */
  sentBudget?: BudgetRequest;
}

export interface GateRequest {
  deps: CritiqueDeps;
  /** One line naming what the mesh was graded against (class budget, or class-blind and why). */
  gradedAs: string;
}

export function gateRequestFor(input: GateRequestInput): GateRequest {
  const resolved = resolveAssetClass(input.assetClass);
  const cls = resolved.assetClass;
  const extent = input.targetExtentM ?? nominalExtentFor(cls);
  const upright = expectsUprightFor(cls);
  const deps: CritiqueDeps = {
    thresholds: cls ? critiqueThresholdsFor(cls) : {},
    stage: input.stage,
    ...(extent !== undefined ? { size: { targetExtentM: extent } } : {}),
    ...(input.sentBudget ? { budget: input.sentBudget } : {}),
    ...(upright ? { orientation: { expectUpright: true } } : {}),
  };
  return { deps, gradedAs: resolved.gradedAs };
}
