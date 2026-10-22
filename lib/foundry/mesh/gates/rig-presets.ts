// PORTED WITH PROVENANCE (spark game-3d-assets WP2): pof (C:\Users\kazda\kiro\pof)
// src/lib/visual-gen/rig-presets.ts @ 09e7a90d, copied 2026-10-22. Verbatim.
// Verdict words, finding codes, reasons and thresholds are PoF's, verbatim: a GateResult's
// `version` names this file and commit (./version.ts), so a consumer can tell which rules judged it.
// Do not edit the rules here; port a newer PoF commit and bump GATES_VERSION.

/**
 * Skeleton rig presets for UE5 character rigging.
 * Defines bone hierarchies and mappings for common target skeletons.
 */

export interface BoneMapping {
  sourceBone: string;
  targetBone: string;
}

/**
 * How the asset reaches this skeleton — and therefore what the preset owes.
 *
 * - `remap`: the generated mesh is bound and a source skeleton's bone names are mapped
 *   onto the target's. The mapping table must be TOTAL over the target's declared IK
 *   chains; an unmapped chain endpoint is a limb that will not animate.
 * - `conform`: an already-rigged template is deformed to the generated mesh's
 *   proportions and the TEMPLATE ships — its topology, UVs, skeleton and skin weights.
 *   There is no source skeleton, so there is no mapping table to be total over, and an
 *   empty `mixamoMapping` is the correct final state rather than unfinished work.
 *
 * The field exists because the two are indistinguishable from the data otherwise: both
 * present as a preset row, and `mixamoMapping: []` means "not authored yet" on one and
 * "not applicable, by construction" on the other.
 */
export type RigTargetKind = 'remap' | 'conform';

export interface RigPreset {
  id: string;
  name: string;
  description: string;
  /** Which operation reaches this skeleton. Decides which verification the row owes. */
  kind: RigTargetKind;
  boneCount: number;
  hasFingers: boolean;
  hasFaceRig: boolean;
  rootBone: string;
  ikChains: Array<{
    name: string;
    startBone: string;
    endBone: string;
  }>;
  /** Bone name mapping from Mixamo to this rig's naming convention */
  mixamoMapping: BoneMapping[];
}

export const RIG_PRESETS: RigPreset[] = [
  {
    id: 'ue5-mannequin',
    name: 'UE5 Mannequin',
    description: 'Standard UE5 skeleton. Compatible with Marketplace animations and Mannequin animation set.',
    kind: 'remap',
    boneCount: 67,
    hasFingers: true,
    hasFaceRig: false,
    rootBone: 'root',
    ikChains: [
      { name: 'Spine', startBone: 'pelvis', endBone: 'head' },
      { name: 'LeftArm', startBone: 'clavicle_l', endBone: 'hand_l' },
      { name: 'RightArm', startBone: 'clavicle_r', endBone: 'hand_r' },
      { name: 'LeftLeg', startBone: 'thigh_l', endBone: 'foot_l' },
      { name: 'RightLeg', startBone: 'thigh_r', endBone: 'foot_r' },
    ],
    mixamoMapping: [
      { sourceBone: 'mixamorig:Hips', targetBone: 'pelvis' },
      { sourceBone: 'mixamorig:Spine', targetBone: 'spine_01' },
      { sourceBone: 'mixamorig:Spine1', targetBone: 'spine_02' },
      { sourceBone: 'mixamorig:Spine2', targetBone: 'spine_03' },
      { sourceBone: 'mixamorig:Neck', targetBone: 'neck_01' },
      { sourceBone: 'mixamorig:Head', targetBone: 'head' },
      { sourceBone: 'mixamorig:LeftShoulder', targetBone: 'clavicle_l' },
      { sourceBone: 'mixamorig:LeftArm', targetBone: 'upperarm_l' },
      { sourceBone: 'mixamorig:LeftForeArm', targetBone: 'lowerarm_l' },
      { sourceBone: 'mixamorig:LeftHand', targetBone: 'hand_l' },
      { sourceBone: 'mixamorig:RightShoulder', targetBone: 'clavicle_r' },
      { sourceBone: 'mixamorig:RightArm', targetBone: 'upperarm_r' },
      { sourceBone: 'mixamorig:RightForeArm', targetBone: 'lowerarm_r' },
      { sourceBone: 'mixamorig:RightHand', targetBone: 'hand_r' },
      { sourceBone: 'mixamorig:LeftUpLeg', targetBone: 'thigh_l' },
      { sourceBone: 'mixamorig:LeftLeg', targetBone: 'calf_l' },
      { sourceBone: 'mixamorig:LeftFoot', targetBone: 'foot_l' },
      { sourceBone: 'mixamorig:RightUpLeg', targetBone: 'thigh_r' },
      { sourceBone: 'mixamorig:RightLeg', targetBone: 'calf_r' },
      { sourceBone: 'mixamorig:RightFoot', targetBone: 'foot_r' },
    ],
  },
  {
    id: 'metahuman',
    name: 'MetaHuman',
    description: 'Full MetaHuman rig with face bones. For high-fidelity characters with facial animation.',
    kind: 'conform',
    boneCount: 584,
    hasFingers: true,
    hasFaceRig: true,
    rootBone: 'root',
    ikChains: [
      { name: 'Spine', startBone: 'pelvis', endBone: 'head' },
      { name: 'LeftArm', startBone: 'clavicle_l', endBone: 'hand_l' },
      { name: 'RightArm', startBone: 'clavicle_r', endBone: 'hand_r' },
      { name: 'LeftLeg', startBone: 'thigh_l', endBone: 'foot_l' },
      { name: 'RightLeg', startBone: 'thigh_r', endBone: 'foot_r' },
    ],
    mixamoMapping: [],  // MetaHuman requires custom retargeting workflow
  },
  {
    id: 'minimal-humanoid',
    name: 'Minimal Humanoid',
    description: 'Simplified 25-bone skeleton for indie games. Lower overhead, easier to animate.',
    kind: 'remap',
    boneCount: 25,
    hasFingers: false,
    hasFaceRig: false,
    rootBone: 'Root',
    ikChains: [
      { name: 'Spine', startBone: 'Pelvis', endBone: 'Head' },
      { name: 'LeftArm', startBone: 'LeftShoulder', endBone: 'LeftHand' },
      { name: 'RightArm', startBone: 'RightShoulder', endBone: 'RightHand' },
      { name: 'LeftLeg', startBone: 'LeftThigh', endBone: 'LeftFoot' },
      { name: 'RightLeg', startBone: 'RightThigh', endBone: 'RightFoot' },
    ],
    mixamoMapping: [
      { sourceBone: 'mixamorig:Hips', targetBone: 'Pelvis' },
      { sourceBone: 'mixamorig:Spine2', targetBone: 'Spine' },
      { sourceBone: 'mixamorig:Neck', targetBone: 'Neck' },
      { sourceBone: 'mixamorig:Head', targetBone: 'Head' },
      { sourceBone: 'mixamorig:LeftShoulder', targetBone: 'LeftShoulder' },
      { sourceBone: 'mixamorig:LeftArm', targetBone: 'LeftUpperArm' },
      { sourceBone: 'mixamorig:LeftForeArm', targetBone: 'LeftLowerArm' },
      { sourceBone: 'mixamorig:LeftHand', targetBone: 'LeftHand' },
      { sourceBone: 'mixamorig:RightShoulder', targetBone: 'RightShoulder' },
      { sourceBone: 'mixamorig:RightArm', targetBone: 'RightUpperArm' },
      { sourceBone: 'mixamorig:RightForeArm', targetBone: 'RightLowerArm' },
      { sourceBone: 'mixamorig:RightHand', targetBone: 'RightHand' },
      { sourceBone: 'mixamorig:LeftUpLeg', targetBone: 'LeftThigh' },
      { sourceBone: 'mixamorig:LeftLeg', targetBone: 'LeftShin' },
      { sourceBone: 'mixamorig:LeftFoot', targetBone: 'LeftFoot' },
      { sourceBone: 'mixamorig:RightUpLeg', targetBone: 'RightThigh' },
      { sourceBone: 'mixamorig:RightLeg', targetBone: 'RightShin' },
      { sourceBone: 'mixamorig:RightFoot', targetBone: 'RightFoot' },
    ],
  },
];

export function getRigPreset(id: string): RigPreset | undefined {
  return RIG_PRESETS.find((p) => p.id === id);
}

/**
 * The chain endpoints a target skeleton REQUIRES — every IK chain's start and end bone,
 * deduped in declaration order. The one required-bone rule: {@link checkPresetBinding}
 * reads it to check the preset's own table, and `bindRigToPreset` (`rig-binding.ts`)
 * reads it to check a produced rig's actual names, so the two cannot disagree on what a
 * target needs.
 */
export function requiredChainBones(preset: RigPreset): string[] {
  return [...new Set(preset.ikChains.flatMap((c) => [c.startBone, c.endBone]))];
}

export interface PresetBindingCheck {
  presetId: string;
  kind: RigTargetKind;
  /** Chain endpoints the target requires. Same for both kinds — the chains are declared. */
  requiredChainBones: string[];
  /**
   * Required chain bones with no mapping row. Meaningful ONLY on a `remap` preset.
   * On a `conform` preset it is null, because there is no source skeleton to map from
   * and an empty table is the correct state, not an incomplete one.
   */
  unmappedChainBones: string[] | null;
  ok: boolean;
  /** Safe to print verbatim. Never says "complete" about a check that did not run. */
  reason: string;
}

/**
 * State what a preset row owes and whether it has it. Pure.
 *
 * The whole point is the branch. Running a mapping-totality check against a `conform`
 * target reports ten unmapped bones for a path that has no mapping step, and the obvious
 * "fix" is to invent a mapping table for a source skeleton that does not exist. Running
 * no check at all — which is what happened here until 2026-09-20 — lets a `remap` row
 * ship with an empty table that nothing reads.
 */
export function checkPresetBinding(preset: RigPreset): PresetBindingCheck {
  const required = requiredChainBones(preset);

  if (preset.kind === 'conform') {
    // Not a pass by default: a pass on a check that does not apply, stated as such.
    return {
      presetId: preset.id,
      kind: 'conform',
      requiredChainBones: required,
      unmappedChainBones: null,
      ok: preset.mixamoMapping.length === 0,
      reason:
        preset.mixamoMapping.length === 0
          ? `conform target — the rigged template supplies the skeleton and skin weights, so there is no source skeleton to map from and no mapping totality to verify; what this row owes instead is the joint-inheritance mode that produced the rig (inherited from the template, not estimated from the source mesh), which is what keeps it compatible with the template's animation library`
          : `conform target carrying ${preset.mixamoMapping.length} mapping row(s) — a conform path has no source skeleton, so these rows map from nothing; either the row is really a remap target or the table is left over`,
    };
  }

  const mapped = new Set(preset.mixamoMapping.map((m) => m.targetBone));
  const unmapped = required.filter((b) => !mapped.has(b));
  return {
    presetId: preset.id,
    kind: 'remap',
    requiredChainBones: required,
    unmappedChainBones: unmapped,
    ok: unmapped.length === 0,
    reason: unmapped.length
      ? `remap target is missing ${unmapped.length} of ${required.length} required chain endpoint(s): ${unmapped.join(', ')} — each is a chain that will not animate`
      : `remap target: all ${required.length} required chain endpoint(s) are mapped`,
  };
}
