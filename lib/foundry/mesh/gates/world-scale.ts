// PORTED WITH PROVENANCE (spark game-3d-assets WP2): pof (~\kiro\pof)
// src/lib/visual-gen/world-scale.ts @ f87067fe, copied 2026-10-22. Verbatim.
// Verdict words, finding codes, reasons and thresholds are PoF's, verbatim: a GateResult's
// `version` names this file and commit (./version.ts), so a consumer can tell which rules judged it.
// Do not edit the rules here; port a newer PoF commit and bump GATES_VERSION.

/**
 * World-scale grading — holds a generated mesh to a real-world SIZE, the way
 * `face-budget.ts` holds it to a triangle budget.
 *
 * Every image/text→3D generator PoF runs normalises its output to a unit box: the
 * longest bounding-box extent comes back as ~1.0 (glTF metres) regardless of what the
 * asset is. Measured 2026-08-17 over every `.glb` under `generated/`: the Tripo-cloud
 * hero `jinx.glb` is 1.000 m tall, `props__crate.glb` 1.000 m, `saber_hilt.glb`
 * 1.017 m LONG, every TripoSR best-of ~1.0. Nothing downstream corrected it — the
 * import template defaults `scale: 1.0`, the Tier-1 gate only rejected a DEGENERATE box,
 * and mesh-finish never rescales — so a hero shipped at 100 cm next to a 180 cm
 * Mannequin and a sword hilt at a metre. The pro workflow's fix is manual (export the
 * UE reference skeleton into Blender "for size reference"); this module is the
 * automated version: measure, compare, and hand back the `ImportUniformScale` that
 * would make the delivery the size it was supposed to be.
 *
 * Honesty rules (the project's dominant one):
 *  - no target ⇒ `unmeasured`, never `matches` — silence must not read as compliance;
 *  - a class gets a nominal size only where one is HONEST (a character = the UE5
 *    Mannequin); a prop can be a coin or a wagon, so no class-wide number is invented;
 *  - the correction factor is reported even on a match, so callers can always apply it.
 */

/** The longest extent (m) every generator PoF drives normalises its output to. */
export const GENERATOR_NORMALIZED_EXTENT_M = 1.0;

/** Band around {@link GENERATOR_NORMALIZED_EXTENT_M} that reads as "generator-normalised". */
const NORMALIZED_BAND: readonly [number, number] = [0.9, 1.1];

/** Relative tolerance on the longest extent before a delivery is called `off`. */
export const SCALE_TOLERANCE = 0.1;

/**
 * Nominal longest extents (m) per asset class, ONLY where the class has one honest
 * answer. Character = UE5 Mannequin (Manny/Quinn) height, the skeleton every generated
 * character is retargeted to. Deliberately absent for weapon/prop/environment/modular-part.
 */
export const NOMINAL_EXTENT_M: Readonly<Record<string, number>> = Object.freeze({
  character: 1.8,
});

/** The size a mesh was supposed to be — its longest bounding-box extent, in metres. */
export interface SizeRequest {
  targetExtentM: number;
}

export type ScaleVerdict = 'matches' | 'off' | 'unmeasured';

export interface ScaleGrade {
  verdict: ScaleVerdict;
  /** Longest measured bbox extent (m), when the mesh was measured. */
  measuredExtentM?: number;
  /** Requested longest extent (m), when one was requested. */
  targetExtentM?: number;
  /** measured / target. Absent when either side is missing. */
  ratio?: number;
  /**
   * `target / measured` — the uniform scale that makes the delivery its intended size
   * (UE `ImportUniformScale` on top of the importer's own m→cm unit conversion, or a
   * Blender rescale). Present whenever both sides are known, even on `matches`.
   */
  importUniformScale?: number;
  /** True when the longest extent sits in the generator-normalised ~1 m band. */
  normalized?: boolean;
  /** Why the verdict is what it is — always set for `off` and `unmeasured`. */
  reason?: string;
}

const usable = (n: number | undefined): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0;

/** Longest axis of a bbox triple. 0 for an empty/degenerate box. */
export function longestExtent(bbox: readonly number[] | undefined): number {
  if (!bbox || bbox.length === 0) return 0;
  const m = Math.max(...bbox.map((v) => (Number.isFinite(v) ? v : 0)));
  return m > 0 ? m : 0;
}

/** Whether a bbox looks like raw generator output (longest extent ≈ 1 m). */
export function isGeneratorNormalized(bbox: readonly number[] | undefined): boolean {
  const l = longestExtent(bbox);
  return l >= NORMALIZED_BAND[0] && l <= NORMALIZED_BAND[1];
}

/** The honest nominal extent for a class, or undefined when the class has none. */
export function nominalExtentFor(assetClass: string | undefined): number | undefined {
  if (!assetClass) return undefined;
  return NOMINAL_EXTENT_M[assetClass];
}

const fmt = (m: number) => `${m.toFixed(2)} m`;

/**
 * Grade a measured bbox against the size that was requested for it. Pure.
 *
 * `bbox` is the Tier-1 critique's `BBOX` (trimesh extents, glTF metres). The request is
 * the intended longest extent in metres.
 */
export function gradeWorldScale(
  bbox: readonly number[] | undefined,
  request: SizeRequest | undefined,
): ScaleGrade {
  const measured = longestExtent(bbox);
  const normalized = isGeneratorNormalized(bbox);
  const measuredExtentM = usable(measured) ? measured : undefined;

  if (!request || !usable(request.targetExtentM)) {
    return {
      verdict: 'unmeasured',
      measuredExtentM,
      normalized,
      reason:
        'no target size was requested for this mesh — nothing to hold the delivery to' +
        (normalized ? ` (longest extent ${fmt(measured)} is generator-normalised, so its real-world size is unknown until one is set)` : ''),
    };
  }
  const targetExtentM = request.targetExtentM;
  if (measuredExtentM === undefined) {
    return {
      verdict: 'unmeasured',
      targetExtentM,
      reason: `mesh was not measured — a ${fmt(targetExtentM)} target cannot be confirmed without a bounding box`,
    };
  }

  const ratio = measuredExtentM / targetExtentM;
  const importUniformScale = targetExtentM / measuredExtentM;
  if (Math.abs(ratio - 1) <= SCALE_TOLERANCE) {
    return { verdict: 'matches', measuredExtentM, targetExtentM, ratio, importUniformScale, normalized };
  }

  const reason =
    `delivered ${fmt(measuredExtentM)} longest extent against a ${fmt(targetExtentM)} target (${ratio.toFixed(2)}x)` +
    (normalized
      ? ' — generator-normalised output (every provider returns a ~1 m box regardless of the asset)'
      : '') +
    `; import with ImportUniformScale ${importUniformScale.toFixed(2)} or rescale before shipping`;

  return { verdict: 'off', measuredExtentM, targetExtentM, ratio, importUniformScale, normalized, reason };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Orientation — is the asset standing up, or lying on its side?
 *
 * Found by the render gate on 2026-08-31 (`docs/research/kit-render-gate-spec.md`):
 * every TripoSR asset checked is authored LYING DOWN. `bestof_fg070.glb` measures
 * 0.95 x 0.50 x 0.52 — its longest axis is X, not up — and the renders show a chair on
 * its side. Nothing caught it. The Tier-1 gate only rejects a DEGENERATE bbox, and
 * `gradeWorldScale` above compares the LONGEST extent against a target, so for a chair
 * lying down it holds the sideways length to the intended height and reports a scale
 * that is confidently wrong.
 *
 * This is the cheapest possible check — it needs no new measurement, only the bbox the
 * critique already emits — and it is the difference between shipping an asset at the
 * wrong size and shipping it on its side at the wrong size.
 *
 * THE PRESCRIPTION IS VERIFIED, NOT INFERRED. `chair.glb` measures [1.069, 0.569, 0.599]
 * and this grade prescribes +90° about Z; applying exactly that rotation and re-measuring
 * through `pof_mesh_critique.py` gives [0.569, 1.069, 0.599] — X and Y swapped, the up
 * axis now dominant, verdict `upright`.
 *
 * Note WHY the reason says "before import". That verification was done by transforming
 * the mesh data in Blender and re-exporting, and the round trip shattered the mesh:
 * 41,862 verts became 250,877 and one connected component became 83,576. The rotation
 * was right and the delivery mechanism was not. Apply this as an IMPORT-TIME rotation
 * (the UE importer's rotation, beside `ImportUniformScale`), exactly as a scale miss is
 * corrected at import rather than by rewriting the asset.
 * ────────────────────────────────────────────────────────────────────────────*/

/**
 * Index of the up axis in the bbox triple the Tier-1 critique emits — glTF is Y-up.
 *
 * VERIFIED, not assumed, and the verification matters because guessing wrong inverts
 * every verdict this section produces. A 0.1 x 0.1 x 1.0 box built standing along
 * Blender +Z and exported to glb comes back from `pof_mesh_critique.py` as
 * `[0.1, 1.0, 0.1]` (measured 2026-08-31). Index 1 carries the height.
 */
export const GLTF_UP_AXIS_INDEX = 1;

export type Axis = 'x' | 'y' | 'z';
const AXES: readonly Axis[] = ['x', 'y', 'z'];

/**
 * How much longer than the up extent another axis must be before the asset is called
 * lying down. Without a margin a near-cube flips on measurement noise; 10% matches
 * {@link SCALE_TOLERANCE}, which absorbs the same class of wobble.
 */
export const ORIENTATION_TOLERANCE = 0.1;

/** The bbox extent along the up axis, in metres. Undefined when unmeasured. */
export function upExtent(bbox: readonly number[] | undefined): number | undefined {
  const v = bbox?.[GLTF_UP_AXIS_INDEX];
  return usable(v) ? v : undefined;
}

/** Which axis carries the longest extent. Undefined for an unmeasured box. */
export function dominantAxis(bbox: readonly number[] | undefined): Axis | undefined {
  if (!bbox || bbox.length < 3) return undefined;
  let best = -1;
  let idx = -1;
  for (let i = 0; i < 3; i++) {
    const v = Number.isFinite(bbox[i]) ? bbox[i] : 0;
    if (v > best) { best = v; idx = i; }
  }
  return best > 0 ? AXES[idx] : undefined;
}

/**
 * Whether a class's subject is reliably TALLER than it is wide — the only condition
 * under which "up should be the longest axis" is an honest expectation.
 *
 * Deliberately narrow, exactly like {@link NOMINAL_EXTENT_M}: a character is held to the
 * Mannequin, which stands. A prop can be a coin, a wagon or a rug; a weapon lies along
 * its blade; a head is wider ear-to-ear than it is tall. Those get no claim, and a
 * caller that knows better states the expectation itself.
 */
export function expectsUprightFor(assetClass: string | undefined): boolean | undefined {
  return assetClass === 'character' ? true : undefined;
}

/** What the caller knows about how the subject stands. */
export interface OrientationRequest {
  /** True only when the subject is genuinely taller than it is wide and deep. */
  expectUpright: boolean;
}

export type OrientationVerdict = 'upright' | 'lying' | 'unmeasured';

export interface OrientationGrade {
  verdict: OrientationVerdict;
  /** Extent along the up axis (m) — reported even when unmeasured. */
  upExtentM?: number;
  /** The longest extent on any axis (m). */
  longestExtentM?: number;
  dominantAxis?: Axis;
  /** up / longest. 1.0 means the asset stands on its longest axis. */
  ratio?: number;
  /** The rotation that would stand the asset up, when one is known. */
  suggestedRotation?: { axis: Axis; degrees: number };
  reason?: string;
}

/**
 * Grade which way up a mesh is. Pure.
 *
 * Honesty rule, inherited from `gradeWorldScale`: with no stated expectation the verdict
 * is `unmeasured`, never `upright` — but the measured numbers are returned anyway, so a
 * caller can judge for itself rather than being told nothing.
 */
export function gradeOrientation(
  bbox: readonly number[] | undefined,
  request: OrientationRequest | undefined,
): OrientationGrade {
  const up = upExtent(bbox);
  const longest = longestExtent(bbox);
  const axis = dominantAxis(bbox);
  const longestExtentM = usable(longest) ? longest : undefined;
  const measured = { upExtentM: up, longestExtentM, dominantAxis: axis };

  if (up === undefined || longestExtentM === undefined) {
    return {
      ...measured,
      verdict: 'unmeasured',
      reason: 'the mesh has no usable bounding box — which way up it sits cannot be determined',
    };
  }

  const ratio = up / longestExtentM;
  const base = { ...measured, ratio };

  if (!request?.expectUpright) {
    return {
      ...base,
      verdict: 'unmeasured',
      reason:
        `nothing said this subject should stand upright, so its ${axis} axis carrying the ` +
        `longest extent is not a defect — a rug, a coin and a sword are all legitimately ` +
        `wider or longer than they are tall. State expectUpright to hold it to standing`,
    };
  }

  if (longestExtentM <= up * (1 + ORIENTATION_TOLERANCE)) {
    return { ...base, verdict: 'upright' };
  }

  // Bring the dominant axis onto up (+Y): rotate about Z to swing X up, about X to swing
  // Z up (R_z(+90) maps X→Y; R_x(−90) maps Z→Y).
  const suggestedRotation =
    axis === 'x'
      ? ({ axis: 'z', degrees: 90 } as const)
      : axis === 'z'
        ? ({ axis: 'x', degrees: -90 } as const)
        : undefined;

  return {
    ...base,
    verdict: 'lying',
    suggestedRotation,
    reason:
      `the subject should stand, but its longest extent (${fmt(longestExtentM)}) is on the ` +
      `${axis} axis while the up axis measures only ${fmt(up)} — the asset is lying on its side` +
      (suggestedRotation
        ? `. Rotate ${suggestedRotation.degrees}° about ${suggestedRotation.axis.toUpperCase()} before import`
        : '') +
      `. Until it is stood up, the world-scale grade above is comparing its sideways length to the intended height`,
  };
}
