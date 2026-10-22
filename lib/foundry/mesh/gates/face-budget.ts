// PORTED WITH PROVENANCE (spark game-3d-assets WP2): pof (~\kiro\pof)
// src/lib/visual-gen/face-budget.ts @ 5b0e018c, copied 2026-10-22. Verbatim.
// Verdict words, finding codes, reasons and thresholds are PoF's, verbatim: a GateResult's
// `version` names this file and commit (./version.ts), so a consumer can tell which rules judged it.
// Do not edit the rules here; port a newer PoF commit and bump GATES_VERSION.

/**
 * Face-budget unit + honoured-budget grading.
 *
 * A polygon budget is meaningless without its unit, and PoF had been carrying one
 * number ("40k faces") across three layers that each mean something different by it:
 *
 *  - `polycount-presets.ts` authors the budget with no unit stated;
 *  - a provider's `face_limit` counts the faces it is asked to emit — and in QUAD mode
 *    a face is a quad, so the same 40k number delivers ~80k triangles;
 *  - `mesh-critique.ts` measures through trimesh, which triangulates on load, so every
 *    measurement is in TRIANGLES.
 *
 * The failure this produces is not hypothetical: a controlled retopology test
 * ("10 Minutes vs 10 Hours", 2026-08-14) commissioned a 15K budget, received 15K QUADS,
 * and only caught it at review — "I should have said 15K triangles". The same source
 * showed a provider ignoring a low-poly request entirely and returning 150K.
 *
 * So this module does two things, both pure:
 *  1. fixes ONE authored unit (triangles) and converts explicitly at the provider edge;
 *  2. grades what was actually DELIVERED against what was REQUESTED — a check nothing
 *     performed, because the class gate only ever compared against its own `warnAbove`
 *     ceiling, never against the budget the caller asked for.
 *
 * Honesty rule (the project's dominant one): a missing measurement or a missing request
 * yields `unmeasured`, never `honored`. Silence must not read as compliance.
 */

/** The unit every authored face budget in PoF is written in. */
export const FACE_BUDGET_UNIT = 'triangles' as const;

/**
 * How far past the requested budget a delivery may land and still count as honoured.
 * Decimators and remeshers land near a target rather than exactly on it; 10% absorbs
 * that without absorbing the failures worth catching (the observed ones are 2x and 10x).
 */
export const BUDGET_OVERRUN_TOLERANCE = 1.1;

/** Ratio band within which an overrun is attributed to the quad/triangle unit trap. */
const QUAD_TRAP_BAND: readonly [number, number] = [1.8, 2.2];

/** Topology a generator was asked to deliver. */
export type TopologyKind = 'triangles' | 'quads';

export interface BudgetRequest {
  /** The budget as authored — always {@link FACE_BUDGET_UNIT}. */
  triangleBudget: number;
  /** Topology the provider was asked for. Quad output halves the face count. */
  topology: TopologyKind;
}

const usable = (n: number | undefined): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0;

/**
 * Triangle budget → the equivalent quad budget. One quad is two triangles, so this
 * FLOORS: rounding up would authorise a mesh past the budget it was derived from.
 * Undefined for an unusable budget — a budget that cannot be honoured is never invented.
 */
export function quadBudgetFromTriangles(triangles: number): number | undefined {
  if (!usable(triangles)) return undefined;
  return Math.floor(triangles / 2);
}

/** Quad count → triangles. Undefined for an unusable count. */
export function trianglesFromQuads(quads: number): number | undefined {
  if (!usable(quads)) return undefined;
  return quads * 2;
}

/**
 * The number to hand a provider's `face_limit` for a request.
 *
 * Providers count FACES, not triangles, so a quad-topology request must be halved or
 * the delivered mesh silently doubles the authored budget.
 */
export function providerFaceLimit(request: BudgetRequest | undefined): number | undefined {
  if (!request || !usable(request.triangleBudget)) return undefined;
  return request.topology === 'quads'
    ? quadBudgetFromTriangles(request.triangleBudget)
    : request.triangleBudget;
}

export type BudgetVerdict = 'honored' | 'over' | 'unmeasured';

export interface BudgetGrade {
  verdict: BudgetVerdict;
  /** The budget in triangles, when one was requested. */
  requestedTriangles?: number;
  /** The measured triangle count, when the mesh was measured. */
  measuredTriangles?: number;
  /** measured / requested. Absent when either side is missing. */
  ratio?: number;
  /** Why the verdict is what it is — always set for `over` and `unmeasured`. */
  reason?: string;
}

/**
 * Grade a measured mesh against the budget that was requested for it.
 *
 * `measuredTriangles` comes from the Tier-1 critique (trimesh triangulates, so its
 * `faces` are triangles). The request is graded in triangles regardless of the topology
 * asked for, because triangles are what the runtime actually pays for.
 */
export function gradeFaceBudget(
  measuredTriangles: number | undefined,
  request: BudgetRequest | undefined,
): BudgetGrade {
  if (!request || !usable(request.triangleBudget)) {
    return { verdict: 'unmeasured', measuredTriangles: usable(measuredTriangles) ? measuredTriangles : undefined, reason: 'no face budget was requested for this mesh — nothing to hold the delivery to' };
  }
  const requestedTriangles = request.triangleBudget;
  if (!usable(measuredTriangles)) {
    return { verdict: 'unmeasured', requestedTriangles, reason: `mesh was not measured — a ${requestedTriangles}-${FACE_BUDGET_UNIT} budget cannot be confirmed without a triangle count` };
  }

  const ratio = measuredTriangles / requestedTriangles;
  if (ratio <= BUDGET_OVERRUN_TOLERANCE) {
    return { verdict: 'honored', requestedTriangles, measuredTriangles, ratio };
  }

  const quadTrap = ratio >= QUAD_TRAP_BAND[0] && ratio <= QUAD_TRAP_BAND[1];
  const reason =
    `delivered ${measuredTriangles} triangles against a ${requestedTriangles}-${FACE_BUDGET_UNIT} budget (${ratio.toFixed(1)}x)` +
    (quadTrap
      ? ' — a ~2x overrun is the quad/triangle unit trap: face_limit counts FACES, so a quad-topology request must be halved (see providerFaceLimit)'
      : ' — the provider did not honour the requested budget; re-request with an explicit face limit or decimate before shipping');

  return { verdict: 'over', requestedTriangles, measuredTriangles, ratio, reason };
}
