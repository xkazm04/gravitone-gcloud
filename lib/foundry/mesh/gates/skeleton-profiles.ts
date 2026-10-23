// PORTED WITH PROVENANCE (spark game-3d-assets WP2): pof (~\kiro\pof)
// src/lib/visual-gen/skeleton-profiles.ts @ 09e7a90d, copied 2026-10-22. Verbatim.
// Verdict words, finding codes, reasons and thresholds are PoF's, verbatim: a GateResult's
// `version` names this file and commit (./version.ts), so a consumer can tell which rules judged it.
// Do not edit the rules here; port a newer PoF commit and bump GATES_VERSION.

/**
 * Bone-group vocabulary — what a skeleton's joint NAMES tell you about its anatomy.
 *
 * ── The defect this closes ────────────────────────────────────────────────────
 * `rig-gate.ts` answers "can this skeleton deform this mesh?" and answers it well:
 * weights, orphans, normalization. It does not read joint names at all — its glTF
 * interface has no `nodes` field — so it cannot see WHICH bones exist. A rig with a
 * flawless weight distribution and no finger bones scores 100/pass, and the character
 * then cannot close a hand around a prop. That is not a hypothetical: it is the failure
 * that stops a generated NPC from holding a broom, and both of Tripo's humanoid rig
 * models were observed to produce it.
 *
 * ── Why names, and why this is cheap ─────────────────────────────────────────
 * Joint names live in the glTF JSON chunk `rig-gate` already decodes — `nodes[i].name`
 * for each index in `skins[0].joints`. Reading them costs nothing. What it buys is the
 * whole class of ANATOMICAL questions that the gate's docstring defers to "a posed render
 * and a critique pass": a render is needed to judge whether a joint sits in a plausible
 * PLACE, but not to establish whether it EXISTS.
 *
 * ── The measurement that shaped this module ──────────────────────────────────
 * MEASURED 2026-09-07 off `src/__tests__/fixtures/rig/skintokens_cube_rigged.glb`, real
 * skin-tokens.cpp output: the joint names are `bone_0 … bone_5`. **PoF's only local rig
 * engine names nothing.** So the first thing this module must report is not a missing
 * group but an ANONYMOUS skeleton — a rig whose bones carry positional names cannot be
 * bone-group checked, cannot be mapped to an IK Retargeter chain, and cannot be conformed
 * onto a third-party clip library. "Unverifiable" is therefore a first-class answer here,
 * distinct from both pass and fail, because a group check on `bone_3` would otherwise
 * report a confident, meaningless absence.
 *
 * Tripo, by contrast, names semantically and lets the caller pick the convention: its
 * auto-rig `spec` parameter (`tripo` | `mixamo`) IS a bone-naming spec. That is why
 * {@link classifyNaming} distinguishes the two — a downstream conform step needs to know
 * which vocabulary it received.
 *
 * Pure and dependency-free: tokenization plus set lookups, so it is callable from the
 * gate, from an acceptance checker, and from a script without any of them paying for it.
 */

/** How a skeleton names its joints. Decides whether any group question is answerable. */
export type BoneNaming =
  /** Mixamo's `mixamorig:` prefixed vocabulary — what Tripo returns for `spec: 'mixamo'`. */
  | 'mixamo'
  /** Unprefixed but meaningful names (UE5 `hand_l`, `LeftFoot`, Tripo native). */
  | 'semantic'
  /** Positional placeholders (`bone_0`, `joint_3`, unnamed) — anatomy is unreadable. */
  | 'anonymous'
  /** No joints at all. */
  | 'empty';

/**
 * Anatomical morphologies. Deliberately the same seven Tripo's auto-rig `rig_type`
 * accepts, so a requested rig type and a gate expectation are the same vocabulary and
 * cannot drift apart.
 */
export type Morphology =
  | 'biped'
  | 'quadruped'
  | 'hexapod'
  | 'octopod'
  | 'avian'
  | 'serpentine'
  | 'aquatic';

/** A named region of a skeleton. Coarse on purpose — presence, not placement. */
export type BoneGroup =
  | 'root'
  | 'spine'
  | 'head'
  | 'arms'
  | 'hands'
  | 'fingers'
  | 'legs'
  | 'feet'
  | 'tail'
  | 'wings';

/**
 * Tokens that name each group, matched against a joint name's TOKENS rather than as
 * substrings of the whole name. Substring matching is what makes a naive version of this
 * wrong: `Hips` contains "hip" and would read as a leg, `Chest` contains "he" and a
 * sloppy head pattern catches it. Tokenizing first ("LeftUpLeg" → left·up·leg) makes each
 * match an exact word, which is both stricter and easier to extend.
 */
const GROUP_TOKENS: Record<BoneGroup, readonly string[]> = {
  root: ['root', 'armature', 'rootbone'],
  spine: ['spine', 'hips', 'hip', 'pelvis', 'torso', 'chest', 'abdomen', 'waist', 'ribcage', 'sternum'],
  head: ['head', 'neck', 'skull', 'jaw', 'eye', 'eyes', 'snout', 'muzzle'],
  arms: ['arm', 'arms', 'upperarm', 'lowerarm', 'forearm', 'shoulder', 'clavicle', 'elbow'],
  hands: ['hand', 'wrist', 'palm'],
  fingers: ['thumb', 'index', 'pinky', 'finger', 'fingers'],
  legs: ['leg', 'legs', 'upperleg', 'lowerleg', 'thigh', 'calf', 'shin', 'femur', 'knee', 'tibia'],
  feet: ['foot', 'feet', 'ankle', 'toe', 'toes', 'paw', 'hoof', 'heel'],
  tail: ['tail'],
  wings: ['wing', 'wings', 'feather'],
};

/**
 * Finger tokens that are only finger tokens IN CONTEXT. "middle" and "ring" name fingers
 * in `LeftHandRing1` but could plausibly appear elsewhere in a hand-authored skeleton, so
 * they count only when the same joint name also mentions a hand.
 */
const CONTEXTUAL_FINGER_TOKENS = ['middle', 'ring'] as const;

/** Positional-placeholder shapes. */
const ANONYMOUS_NAME = /^(?:bone|joint|node|b|j)[_.-]?\d+$/i;

/** What each morphology must have to be a usable rig of that kind. */
export const MORPHOLOGY_GROUPS: Record<
  Morphology,
  { required: readonly BoneGroup[]; optional: readonly BoneGroup[] }
> = {
  // Fingers are OPTIONAL here and required only when a caller asks — a background NPC
  // that walks past never needs them, and failing every crowd rig would make the gate
  // noise. The caller that needs a grip states so: `require: ['fingers']`.
  biped: { required: ['spine', 'head', 'arms', 'hands', 'legs', 'feet'], optional: ['root', 'fingers', 'tail'] },
  // A tail is genuinely common on quadrupeds but not universal (a bear, a boar), so it
  // stays optional rather than manufacturing a failure on a real animal.
  quadruped: { required: ['spine', 'head', 'legs', 'feet'], optional: ['root', 'tail'] },
  hexapod: { required: ['spine', 'head', 'legs'], optional: ['root', 'feet', 'tail'] },
  octopod: { required: ['spine', 'head', 'legs'], optional: ['root', 'feet'] },
  avian: { required: ['spine', 'head', 'wings', 'legs'], optional: ['root', 'feet', 'tail'] },
  serpentine: { required: ['spine', 'head'], optional: ['root', 'tail'] },
  aquatic: { required: ['spine', 'head', 'tail'], optional: ['root', 'wings'] },
};

/** What a caller asks the gate to guarantee about a skeleton's anatomy. */
export interface RigExpectation {
  morphology: Morphology;
  /**
   * Groups this particular asset needs beyond the morphology's baseline. `['fingers']` is
   * the case worth naming: a character that must hold a weapon, a tool or a broom.
   */
  require?: readonly BoneGroup[];
  /**
   * Whether this asset must be able to deform its FACE — i.e. declare morph targets
   * (blend shapes). Bones move the body; nothing in a skeleton can blink or speak, so a
   * character asked to deliver dialogue and graded only on joints is graded on the wrong
   * channel entirely. Set it for a speaking/expressive character; leave it unset for a
   * prop, a mount or a silent creature, whose faces legitimately never move.
   */
  facialDeformation?: boolean;
  /**
   * Id of the target skeleton preset (`rig-presets.ts`) this rig will be retargeted onto.
   * When set, the gate binds the rig's actual joint names to that target's IK chains
   * (`bindRigToPreset`, `rig-binding.ts`) and fails a rig that leaves a chain endpoint
   * unbound — a limb that will not animate. An unknown id fails too. Unset keeps the
   * verdict exactly as it was.
   */
  target?: string;
}

/** The verdict on a skeleton's anatomy. `verifiable: false` is neither pass nor fail. */
export interface BoneGroupVerdict {
  naming: BoneNaming;
  /** Groups the names evidence. Empty on an anonymous skeleton — unknown, not absent. */
  present: BoneGroup[];
  /** Required groups with no matching joint. Always empty when `verifiable` is false. */
  missing: BoneGroup[];
  /** Whether the names carry enough meaning for `missing` to mean anything. */
  verifiable: boolean;
  /** Human-readable reasons, each naming the CONSEQUENCE and not only the symptom. */
  reasons: string[];
}

/**
 * Split a joint name into lowercase word tokens.
 * `mixamorig:LeftHandThumb1` → `['left','hand','thumb']`, `upperarm_l` → `['upperarm','l']`.
 */
function tokenize(name: string): string[] {
  return name
    .replace(/^mixamorig[:_]?/i, '')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z]+/)
    .map((t) => t.toLowerCase())
    .filter(Boolean);
}

/** True when a joint name is a positional placeholder rather than an anatomical name. */
function isAnonymousName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed === '' || ANONYMOUS_NAME.test(trimmed);
}

/**
 * Classify the naming convention of a joint list.
 *
 * A skeleton is anonymous when MOST of its joints are placeholders — a single stray
 * semantic name among `bone_0…bone_4` does not make the skeleton mappable, and treating
 * it as semantic would let a group check report confident nonsense.
 */
export function classifyNaming(names: readonly string[]): BoneNaming {
  if (names.length === 0) return 'empty';
  if (names.some((n) => /^mixamorig[:_]/i.test(n.trim()))) return 'mixamo';
  const anonymous = names.filter(isAnonymousName).length;
  if (anonymous * 2 >= names.length) return 'anonymous';
  return 'semantic';
}

/** The bone groups a joint list evidences. */
export function groupsPresent(names: readonly string[]): Set<BoneGroup> {
  const found = new Set<BoneGroup>();
  for (const name of names) {
    const tokens = new Set(tokenize(name));
    if (tokens.size === 0) continue;
    for (const [group, keywords] of Object.entries(GROUP_TOKENS) as [BoneGroup, readonly string[]][]) {
      if (keywords.some((k) => tokens.has(k))) found.add(group);
    }
    if (tokens.has('hand') && CONTEXTUAL_FINGER_TOKENS.some((t) => tokens.has(t))) {
      found.add('fingers');
    }
  }
  return found;
}

/**
 * Required groups a joint list does not evidence.
 *
 * Returns `[]` for an anonymous skeleton BY DESIGN — nothing is missing, everything is
 * unknown. Use {@link checkBoneGroups} when you need that distinction, which is almost
 * always.
 */
export function missingGroups(
  names: readonly string[],
  morphology: Morphology,
  alsoRequire: readonly BoneGroup[] = [],
): BoneGroup[] {
  if (classifyNaming(names) === 'anonymous' || names.length === 0) return [];
  const present = groupsPresent(names);
  const required = new Set<BoneGroup>([...MORPHOLOGY_GROUPS[morphology].required, ...alsoRequire]);
  return [...required].filter((g) => !present.has(g));
}

/** Why a given group's absence matters, stated as the thing that will not work. */
const CONSEQUENCE: Record<BoneGroup, string> = {
  root: 'no root bone — root motion and in-place playback cannot be separated',
  spine: 'no spine bones — the torso cannot bend or twist',
  head: 'no head/neck bones — the character cannot look, aim or react',
  arms: 'no arm bones — the upper body cannot be posed or animated',
  hands: 'no hand bones — nothing can be attached to or carried in a hand',
  fingers:
    'no finger bones — the hand cannot close, so the character cannot grip or hold a prop (a weapon, a tool, a broom); a socketed prop will float against an open palm',
  legs: 'no leg bones — the character cannot walk, run or crouch',
  feet: 'no foot bones — footfalls cannot be planted, so expect sliding and no IK ground contact',
  tail: 'no tail bones — tail motion and balance secondary animation have nothing to drive',
  wings: 'no wing bones — flight and flap animation have nothing to drive',
};

/**
 * Grade a skeleton's anatomy against an expectation.
 *
 * Three outcomes, and keeping them apart is the whole point:
 *  - **verifiable + no missing** — the anatomy asked for is evidenced.
 *  - **verifiable + missing**    — a real, named defect.
 *  - **not verifiable**          — the skeleton is anonymous or empty; the question cannot
 *    be answered, and reporting a pass would be a fabricated one.
 */
export function checkBoneGroups(
  names: readonly string[],
  expect: RigExpectation,
): BoneGroupVerdict {
  const naming = classifyNaming(names);

  if (naming === 'empty') {
    return {
      naming,
      present: [],
      missing: [],
      verifiable: false,
      reasons: ['the skin declares no joints, so no anatomy can be read'],
    };
  }

  if (naming === 'anonymous') {
    return {
      naming,
      present: [],
      missing: [],
      verifiable: false,
      reasons: [
        `joints carry positional names only (e.g. "${names[0]}"), so a ${expect.morphology} ` +
          'anatomy cannot be verified: which bone is a hand or a leg is unknowable from the ' +
          'skeleton alone. It also cannot be retargeted — an IK Retargeter chain and any ' +
          'third-party clip library are both matched by bone NAME — so this rig needs a ' +
          'naming/conform pass before it can be animated from an existing clip.',
      ],
    };
  }

  const present = [...groupsPresent(names)];
  const missing = missingGroups(names, expect.morphology, expect.require);
  return {
    naming,
    present,
    missing,
    verifiable: true,
    reasons: missing.map((g) => CONSEQUENCE[g]),
  };
}
