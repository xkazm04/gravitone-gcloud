// PORTED WITH PROVENANCE (spark game-3d-assets WP2): pof (C:\Users\kazda\kiro\pof)
// src/lib/visual-gen/rig-binding.ts @ 09e7a90d, copied 2026-10-22. Verbatim.
// Verdict words, finding codes, reasons and thresholds are PoF's, verbatim: a GateResult's
// `version` names this file and commit (./version.ts), so a consumer can tell which rules judged it.
// Do not edit the rules here; port a newer PoF commit and bump GATES_VERSION.

/**
 * Rig binding — can THIS rig be animated on THAT target skeleton?
 *
 * Three modules each answered a third of that question and none composed the others:
 * `rig-gate.ts` reads a produced rig's joint names but knew no target; `rig-presets.ts`
 * knows the targets but only checked its own hand-authored table; `bone-conform.ts` maps
 * any semantic vocabulary onto any other but had no production caller. Measured before
 * this module: a 14-bone biped named Hips/Spine/Neck/Head/Left|Right Arm/ForeArm/Hand/
 * Leg/Foot scored 100/pass at the gate while 4 of the UE5 Mannequin's 10 required chain
 * endpoints had no bone in it — both arm chains and both leg chains would not retarget.
 *
 * {@link bindRigToPreset} is the one verdict. It resolves the source convention from the
 * rig's ACTUAL names, never from what the table claims about itself:
 *
 *  - Mixamo names onto a remap target with a table → `table`. The table stays the single
 *    owner of that mapping; a row counts only when its source bone is really in the rig.
 *  - Any other semantic names → `derived`, via {@link planConform} onto the target's
 *    vocabulary, keeping the planner's exact / canonical / chain-order audit labels.
 *  - Anonymous, empty or uncaptured names → `unverifiable` (never `bound`).
 *  - A conform target → `not-applicable`: the template ships its own skeleton.
 *
 * An unbound required chain endpoint is a limb that will not animate, so the gate treats
 * `partial` as a hard failure (see `scoreRig` in `rig-gate.ts`). Pure.
 */
import { planConform, type BoneRename } from './bone-conform';
import { requiredChainBones, type RigPreset } from './rig-presets';
import { classifyNaming } from './skeleton-profiles';

export { requiredChainBones } from './rig-presets';

export type RigBindingStatus = 'bound' | 'partial' | 'unverifiable' | 'not-applicable';

/** Where the mapping came from: the preset's own table, or derived by the planner. */
export type RigBindingSource = 'table' | 'derived';

export interface RigBindingRow {
  /** The rig's bone. */
  from: string;
  /** The target skeleton's bone it binds to. */
  to: string;
  /** `table` for a preset-table row; otherwise the planner's audit label. */
  via: 'table' | BoneRename['via'];
}

export interface RigBinding {
  presetId: string;
  status: RigBindingStatus;
  /** `null` when no mapping was attempted (unverifiable / not-applicable). */
  source: RigBindingSource | null;
  mapping: RigBindingRow[];
  /** The target's required chain endpoints — {@link requiredChainBones}. */
  required: string[];
  /** Required endpoints some rig bone binds to. */
  boundRequired: string[];
  /** Required endpoints no rig bone binds to — each breaks the chain it belongs to. */
  unboundRequired: string[];
  /** IK chains with at least one unbound endpoint: limbs that will not retarget. */
  unboundChains: string[];
  /** Rig bones that bind to nothing on the target (usually harmless extras). */
  unmatchedSource: string[];
  /** Safe to print verbatim. */
  reason: string;
}

/** Every bone the target names: root ∪ chain endpoints ∪ the table's targets. */
export function targetVocabulary(preset: RigPreset): string[] {
  return [
    ...new Set([
      preset.rootBone,
      ...requiredChainBones(preset),
      ...preset.mixamoMapping.map((m) => m.targetBone),
    ]),
  ];
}

/**
 * Bind a produced rig's joint names to a target preset. `names === undefined` means the
 * names were never read, which is distinct from `[]` and equally cannot bind.
 */
export function bindRigToPreset(names: readonly string[] | undefined, preset: RigPreset): RigBinding {
  const required = requiredChainBones(preset);
  const blank = { presetId: preset.id, source: null, mapping: [], required, boundRequired: [] };

  if (preset.kind === 'conform') {
    return {
      ...blank,
      status: 'not-applicable',
      unboundRequired: [],
      unboundChains: [],
      unmatchedSource: names ? [...names] : [],
      reason:
        `${preset.id} is a conform target — the rigged template supplies the skeleton, so a ` +
        "produced rig's names are not bound to it; reach it through the conform path instead",
    };
  }

  const unverifiable = (reason: string): RigBinding => ({
    ...blank,
    status: 'unverifiable',
    unboundRequired: [...required],
    unboundChains: preset.ikChains.map((c) => c.name),
    unmatchedSource: names ? [...names] : [],
    reason,
  });

  if (!names) {
    return unverifiable(
      `joint names were not captured for this rig, so its binding to ${preset.id} could not be checked`,
    );
  }
  const naming = classifyNaming(names);
  if (naming === 'empty') return unverifiable(`the rig declares no joints, so nothing can bind to ${preset.id}`);
  if (naming === 'anonymous') {
    return unverifiable(
      `joints carry positional names only (e.g. "${names[0]}"), so no bone can be bound to ` +
        `${preset.id} by name — the joints must be identified from their positions first`,
    );
  }

  let source: RigBindingSource;
  let mapping: RigBindingRow[];
  let unmatchedSource: string[];
  if (naming === 'mixamo' && preset.mixamoMapping.length > 0) {
    source = 'table';
    const present = new Set(names);
    mapping = preset.mixamoMapping
      .filter((m) => present.has(m.sourceBone))
      .map((m) => ({ from: m.sourceBone, to: m.targetBone, via: 'table' as const }));
    const used = new Set(mapping.map((m) => m.from));
    unmatchedSource = names.filter((n) => !used.has(n));
  } else {
    source = 'derived';
    const plan = planConform(names, targetVocabulary(preset));
    if (plan.blockers.length > 0) return unverifiable(plan.blockers.join(' '));
    mapping = plan.renames.map((r) => ({ from: r.from, to: r.to, via: r.via }));
    unmatchedSource = plan.unmatchedRig;
  }

  const bound = new Set(mapping.map((m) => m.to));
  const boundRequired = required.filter((b) => bound.has(b));
  const unboundRequired = required.filter((b) => !bound.has(b));
  const unboundChains = preset.ikChains
    .filter((c) => !bound.has(c.startBone) || !bound.has(c.endBone))
    .map((c) => c.name);
  const tally = `${boundRequired.length}/${required.length} required chain endpoints to ${preset.id} (${source})`;

  return {
    presetId: preset.id,
    status: unboundRequired.length === 0 ? 'bound' : 'partial',
    source,
    mapping,
    required,
    boundRequired,
    unboundRequired,
    unboundChains,
    unmatchedSource,
    reason:
      unboundRequired.length === 0
        ? `binds ${tally}`
        : `binds only ${tally}: ${unboundRequired.join(', ')} unbound — chains ${unboundChains.join(', ')} will not retarget`,
  };
}
