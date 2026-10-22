// PORTED WITH PROVENANCE (spark game-3d-assets WP2): pof (C:\Users\kazda\kiro\pof)
// src/lib/visual-gen/polycount-presets.ts @ 4f5a8f58, copied 2026-10-22. The presets table,
// `polycountFor`, `resolveAssetClass` and `critiqueThresholdsFor` verbatim - what the gate reads.
// Left in PoF: the generation strategy (`generationPlanFor`), the part budget and
// `localCritiqueDeps`, which drive PoF's providers, not a gate.
// ../types.ts BUDGETS restates the three classes this repo makes; a test holds them equal.
// Do not edit the rules here; port a newer PoF commit and bump GATES_VERSION (./version.ts).

import type { CritiqueThresholds } from './mesh-score';

export type AssetClass = 'character' | 'weapon' | 'prop' | 'environment' | 'modular-part';

export interface PolycountPreset {
  assetClass: AssetClass;
  label: string;
  /** Generation target — passed to providers that accept a face budget (Tripo `face_limit`). */
  faceLimit: number;
  /** Critique line — above this the Tier-1 gate warns "needs decimation". */
  warnAbove: number;
  /**
   * Substantial disconnected parts the class may legitimately have. A character is
   * ASSEMBLED (head, lashes, brows, eye layers, mouth interior, teeth, tongue, body,
   * hands, hair, cape, accessories); the class-blind default of 8 failed such a mesh as
   * "fragmented". Specks are policed separately by the floater rule, which no class relaxes.
   */
  maxComponents: number;
  /**
   * How the budget is SPENT — see {@link generationPlanFor}. `budgeted` hands the number
   * above to the generator; `max-then-finish` withholds it and leaves the budget to the
   * retopo/bake stage.
   */
  generation: GenerationStrategy;
  rationale: string;
}

/**
 * Where a class's face budget is enforced.
 *
 * `budgeted` — the generator is handed `face_limit` and delivers inside it.
 * `max-then-finish` — the generator is handed NO budget and delivers its densest mesh;
 * `mesh-finish` retopologizes to the class budget and bakes the lost detail into maps.
 *
 * The split is not a preference, it is the shipped `ai-lowpoly-generation-not-final`
 * rule written as code: direct low-poly generation is a dice-roll acceptable "only for
 * SMALL simple props", and anything bake-quality must be generated high-poly first,
 * because the detail that becomes the normal/AO bake only exists in the dense mesh.
 * Corroborated 2026-09-07 against a live building generation (Tripo Prism 3.1): the
 * generator's own low-poly mode returned holes in the geometry, a missing chimney
 * section and warped texture regions, while the same reference generated unbudgeted at
 * ~1.8M triangles and then retopologized held its detail at 39k.
 */
export type GenerationStrategy = 'budgeted' | 'max-then-finish';

export const POLYCOUNT_PRESETS: PolycountPreset[] = [
  {
    assetClass: 'character',
    label: 'Character (hero/NPC)',
    faceLimit: 40_000,
    warnAbove: 60_000,
    maxComponents: 24,
    generation: 'max-then-finish',
    rationale: 'Matches the character pipeline game-tier budget (40k faces, rig intact); hero characters carry the highest per-asset budget.',
  },
  {
    assetClass: 'weapon',
    label: 'Weapon / held item',
    faceLimit: 15_000,
    warnAbove: 22_500,
    maxComponents: 6,
    generation: 'budgeted',
    rationale: 'First-person-adjacent but small on screen at ARPG camera distance; silhouette + normal map carry the detail.',
  },
  {
    assetClass: 'prop',
    label: 'Prop / interactable',
    faceLimit: 10_000,
    warnAbove: 15_000,
    maxComponents: 6,
    generation: 'budgeted',
    rationale: 'Placed many times per scene; Nanite tolerates more but generated props ship to non-Nanite paths (mobile preview, collision).',
  },
  {
    assetClass: 'environment',
    label: 'Environment piece / building',
    faceLimit: 60_000,
    warnAbove: 90_000,
    maxComponents: 40,
    generation: 'max-then-finish',
    rationale: 'Large silhouette pieces earn a bigger budget; still bounded because generated buildings fragment into many components.',
  },
  {
    assetClass: 'modular-part',
    label: 'Modular part / swap-slot piece',
    faceLimit: 8_000,
    warnAbove: 12_000,
    maxComponents: 3,
    generation: 'budgeted',
    rationale: 'Assembled in multiples onto one character/kit — the per-part budget must leave headroom for the assembled whole.',
  },
];

export const ASSET_CLASS_IDS: AssetClass[] = POLYCOUNT_PRESETS.map((p) => p.assetClass);

/** Resolve a preset by asset class; undefined for unknown classes. */
export function polycountFor(assetClass: string): PolycountPreset | undefined {
  return POLYCOUNT_PRESETS.find((p) => p.assetClass === assetClass);
}

export interface ResolvedAssetClass {
  /** The recognised class, or undefined — a class is NEVER invented for a caller. */
  assetClass?: AssetClass;
  /** One line naming what the mesh will actually be graded against. */
  gradedAs: string;
}

/**
 * Resolve the `assetClass` a caller sent into the class the gate will grade by, plus a
 * sentence stating it. Pure.
 *
 * The stated default is **unclassified**: absent (or unrecognised) input does NOT get
 * silently promoted to some "typical" class, because that would grade a character
 * against a prop's component budget and fail it for being assembled. It degrades to the
 * class-blind defaults — the same behaviour as before — with the difference that the
 * degradation is now REPORTED instead of invisible. An unknown string in particular used
 * to vanish into an empty threshold override with no signal anywhere.
 */
export function resolveAssetClass(assetClass: string | undefined): ResolvedAssetClass {
  if (!assetClass) {
    return {
      gradedAs: `no assetClass supplied — graded class-blind against the default ceilings; send one of ${ASSET_CLASS_IDS.join(', ')} to grade against a class budget`,
    };
  }
  const preset = polycountFor(assetClass);
  if (!preset) {
    return {
      gradedAs: `unrecognised assetClass "${assetClass}" — graded class-blind against the default ceilings; known classes are ${ASSET_CLASS_IDS.join(', ')}`,
    };
  }
  return {
    assetClass: preset.assetClass,
    gradedAs: `graded against the ${preset.label} budget (${preset.faceLimit} tri target, warn above ${preset.warnAbove}, up to ${preset.maxComponents} parts)`,
  };
}

/** Class-aware Tier-1 gate thresholds — empty for unknown classes (defaults apply). */
export function critiqueThresholdsFor(assetClass: string): Partial<CritiqueThresholds> {
  const p = polycountFor(assetClass);
  return p ? { maxFacesWarn: p.warnAbove, maxComponentsFail: p.maxComponents } : {};
}
