// PORTED WITH PROVENANCE (spark game-3d-assets WP2): pof (C:\Users\kazda\kiro\pof)
// src/lib/visual-gen/bone-conform.ts @ 09e7a90d, copied 2026-10-22. Verbatim.
// Verdict words, finding codes, reasons and thresholds are PoF's, verbatim: a GateResult's
// `version` names this file and commit (./version.ts), so a consumer can tell which rules judged it.
// Do not edit the rules here; port a newer PoF commit and bump GATES_VERSION.

/**
 * Bone-hierarchy conform — matching a GENERATED rig's bone names to the names an existing
 * animation library expects.
 *
 * ── The problem, concretely ───────────────────────────────────────────────────
 * A rigged mesh and a clip are bound by bone NAME. Every retarget path PoF touches works
 * that way: UE's IK Retargeter maps chains by name, Blender's armature action assignment
 * matches by name, and a third-party clip library ships names from whatever skeleton it was
 * authored against. So a perfectly good auto-rig plus a perfectly good clip produce nothing
 * when the two vocabularies disagree — which is the normal case, not the exception, because
 * the rigger and the clip author never coordinated.
 *
 * What this module does NOT do is apply the renames: that is an armature edit, and it
 * belongs in the Blender pass specified in `docs/research/bone-hierarchy-conform-spec.md`.
 * What it does is decide, deterministically and for free, WHAT the renames should be and
 * whether the conform is viable at all — the part that otherwise gets done by hand, or by
 * an LLM guessing at a bone list.
 *
 * ── Why normalization gets most of the way ───────────────────────────────────
 * The three vocabularies PoF actually handles differ mostly in DECORATION, not in meaning:
 *
 *   mixamorig:LeftUpLeg   ·   thigh_l   ·   LeftThigh
 *   mixamorig:LeftHand    ·   hand_l    ·   LeftHand
 *
 * Strip the vendor prefix, fold case, drop separators and index digits, and normalize the
 * side marker to a canonical position, and a large share of pairs collapse onto the same
 * key. That is a deterministic, explainable match — no model, no guessing — and it leaves a
 * short residue of genuinely ambiguous bones for a human or an LLM to decide, which is a far
 * better shape than handing the whole skeleton to a model and hoping.
 *
 * ── The hard limit, stated up front ──────────────────────────────────────────
 * An anonymously-named rig (`bone_0…bone_N`, which is what skin-tokens.cpp produces — see
 * `skeleton-profiles.ts`) cannot be conformed by name at all: there is no meaning to match.
 * {@link planConform} reports that as a blocker rather than a 0% match, because the fix is
 * categorically different — such a rig needs joints identified from their POSITIONS in the
 * mesh, which is a geometric problem and out of scope here.
 *
 * Production caller: `rig-binding.ts` — `bindRigToPreset` plans a semantic rig onto a
 * target preset's vocabulary to decide whether every required IK chain endpoint binds, and
 * the rig gate (`scoreRig` with `expect.target`) fails a rig that leaves one unbound. That
 * caller only READS the plan. The Blender application half is still specified, not built:
 * do not read this module's presence as "PoF conforms rigs".
 */
import { classifyNaming, type BoneNaming } from './skeleton-profiles';

/** Side of the body a bone belongs to, normalized away from spelling. */
export type BoneSide = 'left' | 'right' | 'center';

/** A bone name reduced to its meaning. */
export interface CanonicalBone {
  original: string;
  /** Side-independent semantic key: `thigh`, `hand`, `spine`. */
  stem: string;
  side: BoneSide;
  /** Chain index where the name carried one (`Spine1` → 1, `spine_02` → 2). */
  index: number | undefined;
  /** The full match key: side + stem + index. */
  key: string;
}

/**
 * Side markers, matched against TOKENS rather than against the raw name.
 *
 * A regex over the whole name is where this went wrong first: `/^left(?![a-z])/i` looks
 * like it matches "Left" only when a word boundary follows, but under the `i` flag
 * `[a-z]` matches uppercase too, so `LeftUpLeg` was rejected and read as centre. Matching
 * tokens sidesteps the whole class of problem — `LeftUpLeg` tokenizes to left·up·leg and
 * `thigh_l` to thigh·l, and both are unambiguous.
 */
const LEFT_TOKENS = new Set(['left', 'l']);
const RIGHT_TOKENS = new Set(['right', 'r']);

/** Vendor prefixes that carry no anatomical meaning. */
const VENDOR_PREFIX = /^(?:mixamorig|tripo|armature|root)[:_.-]+/i;

/**
 * Synonyms that mean the same joint in different vocabularies. Left side is the canonical
 * stem. Only pairs actually observed across Mixamo / UE5 / Tripo naming are listed —
 * inventing synonyms is how a conform silently maps a shin onto a forearm.
 */
const STEM_SYNONYMS: Record<string, string> = {
  shoulder: 'clavicle',
  upleg: 'thigh',
  upperleg: 'thigh',
  femur: 'thigh',
  leg: 'calf',
  lowerleg: 'calf',
  shin: 'calf',
  tibia: 'calf',
  arm: 'upperarm',
  forearm: 'lowerarm',
  hips: 'pelvis',
  hip: 'pelvis',
  foot: 'foot',
  ankle: 'foot',
};

/** Split a name into lowercase tokens, dropping the vendor prefix. */
function tokens(name: string): string[] {
  return name
    .replace(VENDOR_PREFIX, '')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z\d]+/)
    .map((t) => t.toLowerCase())
    .filter(Boolean);
}

/** Reduce one bone name to its canonical form. */
export function canonicalize(name: string): CanonicalBone {
  const parts = tokens(name);
  let side: BoneSide = 'center';
  let index: number | undefined;
  const words: string[] = [];

  for (const part of parts) {
    if (LEFT_TOKENS.has(part)) {
      side = 'left';
      continue;
    }
    if (RIGHT_TOKENS.has(part)) {
      side = 'right';
      continue;
    }
    if (/^\d+$/.test(part)) {
      // A trailing number is a chain index; a leading one is meaningless decoration.
      if (words.length > 0) index = Number(part);
      continue;
    }
    // Forms like `Spine1` where the digit is fused to the word.
    const fused = /^([a-z]+)(\d+)$/.exec(part);
    if (fused) {
      words.push(fused[1]);
      index = Number(fused[2]);
      continue;
    }
    words.push(part);
  }

  const joined = words.join('');
  const stem = STEM_SYNONYMS[joined] ?? joined;
  return {
    original: name,
    stem,
    side,
    index,
    key: `${side}:${stem}${index === undefined ? '' : `:${index}`}`,
  };
}

/** One rename the Blender pass should apply to the rig's armature. */
export interface BoneRename {
  from: string;
  to: string;
  /** How the pair was matched — an audit trail, so a wrong map is explainable. */
  via: 'exact' | 'canonical' | 'chain-order';
}

export interface ConformPlan {
  naming: BoneNaming;
  /** Renames to apply to the rig so its bones carry the clip's names. */
  renames: BoneRename[];
  /** Rig bones no clip bone claims — they will simply not be driven. */
  unmatchedRig: string[];
  /** Clip bones with no rig bone to drive — the clip's motion for these is lost. */
  unmatchedClip: string[];
  /** Fraction of the CLIP's bones that found a rig bone. 0-1. */
  coverage: number;
  /** Non-empty means the conform cannot proceed as a name operation. */
  blockers: string[];
}

/**
 * Plan the conform of `rigNames` onto the vocabulary of `clipNames`.
 *
 * Exact string matches are claimed first; everything else is paired within its
 * (side, stem) group in CHAIN ORDER, and each pair is labelled by how confident it is:
 *
 *  - **exact** — identical strings. Nothing to rename; recorded for completeness.
 *  - **canonical** — paired by order AND the two chain indices agree.
 *  - **chain-order** — paired by order with differing or absent indices.
 *
 * Order rather than index is load-bearing, because the conventions disagree on where a
 * chain STARTS: Mixamo's spine is `Spine, Spine1, Spine2` and UE5's is `spine_01,
 * spine_02, spine_03`, so the same three bones carry 0,1,2 and 1,2,3. Matching on equal
 * indices looks confident and shifts the entire spine by one. Ordering is exactly what a
 * bone chain encodes, and this pass reproduces the hand-authored mapping in
 * `rig-presets.ts` without being shown it. It remains a heuristic: handed a 3-bone spine
 * and a 5-bone one it will pair three and leave two, which `unmatchedClip` reports.
 */
export function planConform(
  rigNames: readonly string[],
  clipNames: readonly string[],
): ConformPlan {
  const naming = classifyNaming(rigNames);
  const blockers: string[] = [];

  if (naming === 'empty') {
    blockers.push('the rig declares no bones, so there is nothing to conform');
  } else if (naming === 'anonymous') {
    blockers.push(
      `the rig's bones carry positional names only (e.g. "${rigNames[0]}"), so no bone can be ` +
        'matched to a clip bone by name. This is not a low-coverage conform, it is a different ' +
        'problem: the joints must first be IDENTIFIED from their positions in the mesh ' +
        '(a geometric pass), and only then can they be named and conformed.',
    );
  }
  if (clipNames.length === 0) {
    blockers.push('the clip declares no bones, so there is no target vocabulary to conform to');
  }
  if (blockers.length > 0) {
    return { naming, renames: [], unmatchedRig: [...rigNames], unmatchedClip: [...clipNames], coverage: 0, blockers };
  }

  const rig = rigNames.map(canonicalize);
  const clip = clipNames.map(canonicalize);
  const takenRig = new Set<string>();
  const takenClip = new Set<string>();
  const renames: BoneRename[] = [];

  const claim = (r: CanonicalBone, c: CanonicalBone, via: BoneRename['via']) => {
    takenRig.add(r.original);
    takenClip.add(c.original);
    renames.push({ from: r.original, to: c.original, via });
  };

  // Pass 1 — exact string equality. Always wins; an identical name is not a guess.
  for (const r of rig) {
    if (takenRig.has(r.original)) continue;
    const c = clip.find((c) => !takenClip.has(c.original) && c.original === r.original);
    if (c) claim(r, c, 'exact');
  }

  // Pass 2 — group by (side, stem) and pair what remains in CHAIN ORDER.
  //
  // There is deliberately no global "same index" pass. It was the first thing tried and it
  // is actively wrong across conventions: Mixamo's `Spine1` and UE5's `spine_01` share the
  // index 1, so an index-equality pass pairs them confidently — and thereby shifts the
  // whole spine by one, because Mixamo's chain starts at `Spine` (no index) and UE5's at
  // `spine_01`. Order is the reliable signal; the index only reports how CONFIDENT a pair
  // is, which is what the `via` label carries.
  const groupKey = (b: CanonicalBone) => `${b.side}:${b.stem}`;
  const byGroup = (bones: CanonicalBone[], taken: Set<string>) => {
    const groups = new Map<string, CanonicalBone[]>();
    for (const b of bones) {
      if (taken.has(b.original)) continue;
      const list = groups.get(groupKey(b)) ?? [];
      list.push(b);
      groups.set(groupKey(b), list);
    }
    // Chain order: an absent index is the chain root, ahead of index 1.
    for (const list of groups.values()) list.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    return groups;
  };
  const rigGroups = byGroup(rig, takenRig);
  const clipGroups = byGroup(clip, takenClip);
  for (const [key, rigBones] of rigGroups) {
    const clipBones = clipGroups.get(key) ?? [];
    for (let i = 0; i < Math.min(rigBones.length, clipBones.length); i++) {
      const [r, c] = [rigBones[i], clipBones[i]];
      claim(r, c, r.index === c.index ? 'canonical' : 'chain-order');
    }
  }

  const unmatchedRig = rigNames.filter((n) => !takenRig.has(n));
  const unmatchedClip = clipNames.filter((n) => !takenClip.has(n));
  return {
    naming,
    renames,
    unmatchedRig,
    unmatchedClip,
    // Measured against the CLIP, because an undriven clip bone is lost motion, whereas a
    // spare rig bone (a prop attachment, a hair chain) is usually harmless.
    coverage: clipNames.length === 0 ? 0 : (clipNames.length - unmatchedClip.length) / clipNames.length,
    blockers,
  };
}

/** The renames that actually change a name — pass 1 matches are already correct. */
export function effectiveRenames(plan: ConformPlan): BoneRename[] {
  return plan.renames.filter((r) => r.from !== r.to);
}
