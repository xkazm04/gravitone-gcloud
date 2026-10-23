// PORTED WITH PROVENANCE (spark game-3d-assets WP2): pof (~\kiro\pof)
// src/lib/visual-gen/mesh-score.ts @ a85aaede, copied 2026-10-22. Verbatim.
// Verdict words, finding codes, reasons and thresholds are PoF's, verbatim: a GateResult's
// `version` names this file and commit (./version.ts), so a consumer can tell which rules judged it.
// Do not edit the rules here; port a newer PoF commit and bump GATES_VERSION.

/**
 * The Tier-1 mesh gate's pure scorer — moved out of `mesh-critique.ts` so a client
 * component (the /3d inspector) can grade with the gate itself instead of a second copy.
 * `mesh-critique.ts` keeps the trimesh spawn (node:fs / node:path / child_process) and
 * re-exports every symbol here, so no importer changes. This file must stay node-free.
 */
import { gradeFaceBudget, type BudgetGrade, type BudgetRequest } from './face-budget';
import {
  gradeWorldScale, gradeOrientation,
  type ScaleGrade, type SizeRequest, type OrientationGrade, type OrientationRequest,
} from './world-scale';
import { classifyComponents } from './component-split';

export interface MeshMetrics {
  verts: number;
  faces: number;
  watertight: boolean;
  windingConsistent: boolean;
  components: number;
  euler: number;
  bbox: [number, number, number];
  volume: number | null;
  area: number;
  degenerateFaces: number;
  /**
   * Faces per connected component, largest first. Absent when the critique script
   * predates the histogram — never defaulted to `[]`, which would read as "measured,
   * and there are none".
   */
  componentFaces?: number[];
  /** Components the capped histogram left out (each no larger than the smallest kept). */
  componentFacesOmitted?: number;
}

export interface CritiqueThresholds {
  minVerts: number;
  maxComponentsFail: number;
  maxFacesWarn: number;
  minExtent: number;
  /** Specks tolerated before the mesh is called shattered (histogram path only). */
  maxFloatersFail: number;
}

/**
 * Exported so the download door can DERIVE its admission ceiling from the number the
 * grader actually judges by, instead of carrying a second copy of it. `face-budget.ts`
 * exists because one polygon number lived in three layers that each meant something
 * different by it; a fourth copy at the door would be the same defect again.
 */
export const DEFAULT_THRESHOLDS: CritiqueThresholds = {
  minVerts: 100, maxComponentsFail: 8, maxFacesWarn: 200_000, minExtent: 1e-4, maxFloatersFail: 4,
};

/**
 * What a single scorecard line is ABOUT, as a stable code rather than prose.
 *
 * Every consumer that needed to reason about *which kind* of defect a mesh has was
 * previously reduced to sniffing the reason strings — `failureShape` in `best-of-n.ts`
 * had to blank out digits and compare only the first line, and it still took two
 * live-only corrections to stop mis-matching. A code says the same thing exactly.
 *
 * The split matters because the defect classes have genuinely different remedies:
 * `face-count` / `budget-over` / `parts-over-budget` are resolved by the retopo stage,
 * `floaters` is not (measured — see `critique-stage.ts`), and `empty-mesh` is the only
 * class where paying for another provider roll is a rational act.
 */
export type FindingCode =
  | 'empty-mesh'
  | 'degenerate-bbox'
  | 'floaters'
  | 'parts-over-budget'
  | 'components-over-budget'
  | 'not-watertight'
  | 'winding'
  | 'degenerate-faces'
  | 'face-count'
  | 'budget-over'
  | 'scale-off'
  | 'orientation-lying';

export interface Finding {
  code: FindingCode;
  severity: 'fail' | 'warn';
  /** The human line — byte-identical to the matching entry in `reasons`. */
  reason: string;
}

export interface Scorecard {
  verdict: 'pass' | 'warn' | 'fail';
  score: number;
  reasons: string[];
  /**
   * The same lines as `reasons`, each tagged with its defect class and severity, in the
   * same order. `reasons` is kept as the display/compat surface; nothing should branch on
   * its prose.
   *
   * Optional because this scorecard shape is also borrowed by `input-gate.ts`, a VLM
   * IMAGE gate whose free-text defects have no mesh defect class — inventing codes there
   * would be exactly the kind of fabricated precision this field exists to remove.
   * `scoreMesh` always sets it (its return type makes that a guarantee), so a geometry
   * verdict never arrives without one.
   */
  findings?: Finding[];
  /**
   * How the delivered mesh compared to the face budget that was REQUESTED for it.
   * Distinct from `maxFacesWarn`, which is the class CEILING: a 55k-triangle character
   * sits under the 60k ceiling while still being 1.4x the 40k that was asked for, and
   * only this grade can say so. Absent when no budget was supplied — silence about a
   * budget must never read as compliance with one.
   */
  budget?: BudgetGrade;
  /**
   * How the delivered mesh compared to the real-world SIZE that was requested for it.
   * Every generator normalises to a ~1 m box, so without this a 1 m hero passed clean
   * next to a 1.8 m Mannequin. Absent when no size was supplied — same silence rule.
   */
  scale?: ScaleGrade;
  /**
   * Which way up the mesh sits. Every TripoSR asset measured on 2026-08-31 was authored
   * LYING DOWN, which nothing caught — and which quietly corrupts `scale` above, since
   * that compares the LONGEST extent to the intended height. Always present; `unmeasured`
   * until a caller states that the subject should stand.
   */
  orientation?: OrientationGrade;
}

/** A scorecard plus the metrics behind it — the shape surfaced to the UI / job result. */
export type CritiqueCard = Scorecard & { metrics?: MeshMetrics };

/**
 * Score a mesh's structural health into a deterministic pass/warn/fail card. Pure.
 *
 * `budget` is the face budget the caller ASKED the generator for. Supplying it adds a
 * warn when the delivery overshot it — the check that catches a provider quietly
 * ignoring a low-poly request, and the quad/triangle unit trap that doubles a budget.
 * `size` is the longest extent (m) the mesh was supposed to have; supplying it catches
 * the generator-normalised 1 m box shipping at the wrong world scale.
 */
export function scoreMesh(
  m: MeshMetrics,
  thresholds: Partial<CritiqueThresholds> = {},
  budget?: BudgetRequest,
  size?: SizeRequest,
  orientation?: OrientationRequest,
): Scorecard & { findings: Finding[] } {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const found: Finding[] = [];
  const fail = (code: FindingCode, reason: string) => { found.push({ code, severity: 'fail', reason }); };
  const warn = (code: FindingCode, reason: string) => { found.push({ code, severity: 'warn', reason }); };

  if (m.verts < t.minVerts || m.faces < 1) fail('empty-mesh', `empty/degenerate mesh (${m.verts} verts, ${m.faces} faces)`);
  if (m.bbox.some((e) => e < t.minExtent)) fail('degenerate-bbox', `degenerate bounding box (flat: ${m.bbox.map((e) => e.toFixed(2)).join('×')})`);
  // Component health. With a per-component face histogram we can tell a body part from
  // a speck, so an assembled character (head + lashes + brows + eye layers + mouth
  // interior + teeth + tongue + body + hands + hair + cape + accessories) is judged on
  // its SPECK count rather than rejected for having parts. Without the histogram the
  // original blunt count rule stands unchanged — no silent loosening on old data.
  const split = classifyComponents(m.componentFaces, m.componentFacesOmitted);
  if (split.measured) {
    if (split.floaters > t.maxFloatersFail) {
      fail('floaters', `${split.floaters} floater fragments (${split.floaterFaces} faces of specks)`);
    }
    if (split.parts > t.maxComponentsFail) {
      fail('parts-over-budget', `${split.parts} substantial disconnected parts (above the ${t.maxComponentsFail} budget for this class)`);
    }
    if (split.floaters > 0 && split.floaters <= t.maxFloatersFail) {
      warn('floaters', `${split.floaters} floater fragments (${split.floaterFaces} faces of specks)`);
    }
  } else if (m.components > t.maxComponentsFail) {
    fail('components-over-budget', `${m.components} disconnected components (fragmented / floaters)`);
  }

  if (!m.watertight) warn('not-watertight', 'not watertight (open boundary / holes)');
  if (!split.measured && m.components > 1 && m.components <= t.maxComponentsFail) {
    warn('components-over-budget', `${m.components} disconnected components (possible floaters)`);
  }
  if (!m.windingConsistent) warn('winding', 'inconsistent face winding (normals may flip)');
  if (m.degenerateFaces > 0) warn('degenerate-faces', `${m.degenerateFaces} degenerate faces`);
  if (m.faces > t.maxFacesWarn) warn('face-count', `high face count (${m.faces}) — needs decimation for game use`);

  // Budget honoured? trimesh triangulates on load, so `m.faces` is a triangle count.
  const budgetGrade = budget ? gradeFaceBudget(m.faces, budget) : undefined;
  if (budgetGrade?.verdict === 'over' && budgetGrade.reason) warn('budget-over', budgetGrade.reason);

  // Right size? bbox is trimesh extents in glTF metres. Always graded so the card can
  // say "generator-normalised, size unknown" even when no target was requested.
  const scaleGrade = gradeWorldScale(m.bbox, size);
  if (scaleGrade.verdict === 'off' && scaleGrade.reason) warn('scale-off', scaleGrade.reason);

  // Right way up? Same shape as scale: always graded so the card can report the axes even
  // when nothing claimed the subject should stand, and a warn (not a fail) because it is
  // fixable at import with a rotation, exactly as a scale miss is with ImportUniformScale.
  const orientationGrade = gradeOrientation(m.bbox, orientation);
  if (orientationGrade.verdict === 'lying' && orientationGrade.reason) {
    warn('orientation-lying', orientationGrade.reason);
  }

  // `reasons` stays fails-then-warns — the exact order every existing consumer reads,
  // and the order `failureShape` depends on to pick the verdict-driving defect.
  const fails = found.filter((f) => f.severity === 'fail');
  const warns = found.filter((f) => f.severity === 'warn');
  const findings = [...fails, ...warns];
  const verdict = fails.length ? 'fail' : warns.length ? 'warn' : 'pass';
  const score = Math.max(0, Math.min(100, 100 - fails.length * 50 - warns.length * 15));
  return {
    verdict,
    score,
    reasons: findings.map((f) => f.reason),
    findings,
    budget: budgetGrade,
    scale: scaleGrade,
    orientation: orientationGrade,
  };
}

/**
 * The six rules that need only a triangle count and a bounding box — everything a viewer
 * that loaded the mesh in three.js can measure. The other six (`GATE_ONLY_CODES`) need
 * trimesh's topology pass and are graded only by the Tier-1 gate.
 */
export const GEOMETRY_CODES = [
  'empty-mesh', 'degenerate-bbox', 'face-count', 'budget-over', 'scale-off', 'orientation-lying',
] as const satisfies readonly FindingCode[];

/** What only the Tier-1 gate (trimesh) measures: a viewer must name these, never imply them. */
export const GATE_ONLY_CODES = [
  'not-watertight', 'winding', 'degenerate-faces', 'floaters', 'parts-over-budget', 'components-over-budget',
] as const satisfies readonly FindingCode[];

/** The facts a three.js load yields: triangles, vertices, and the bbox in glTF metres. */
export interface GeometryFacts {
  faces: number;
  verts: number;
  bbox: [number, number, number];
}

/** The request side of `CritiqueDeps` — pass `gateRequestFor(...).deps` straight in. */
export interface GeometryRequest {
  thresholds?: Partial<CritiqueThresholds>;
  budget?: BudgetRequest;
  size?: SizeRequest;
  orientation?: OrientationRequest;
}

/**
 * Grade what a viewer can measure with the gate's OWN scorer. Pure.
 *
 * Not a second rule set: it calls `scoreMesh` unchanged on metrics whose topology is
 * stated clean (watertight, consistent winding, one component, no degenerate faces), so
 * only the geometry rules can fire and each fires with the gate's severity and reason.
 * The topology it cannot see is named by `GATE_ONLY_CODES`, never read as passed.
 */
export function scoreGeometry(facts: GeometryFacts, request: GeometryRequest = {}): Scorecard & { findings: Finding[] } {
  const clean: MeshMetrics = {
    verts: facts.verts, faces: facts.faces, watertight: true, windingConsistent: true,
    components: 1, euler: 2, bbox: facts.bbox, volume: null, area: 0, degenerateFaces: 0,
  };
  return scoreMesh(clean, request.thresholds, request.budget, request.size, request.orientation);
}
