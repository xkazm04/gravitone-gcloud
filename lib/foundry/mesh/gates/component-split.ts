// PORTED WITH PROVENANCE (spark game-3d-assets WP2): pof (C:\Users\kazda\kiro\pof)
// src/lib/visual-gen/component-split.ts @ 660064fb, copied 2026-10-22. Verbatim.
// Verdict words, finding codes, reasons and thresholds are PoF's, verbatim: a GateResult's
// `version` names this file and commit (./version.ts), so a consumer can tell which rules judged it.
// Do not edit the rules here; port a newer PoF commit and bump GATES_VERSION.

/**
 * Parts vs specks — the node-free half of the Tier-1 mesh gate's component reasoning.
 *
 * Lives apart from `mesh-critique.ts` (which spawns the trimesh script and so imports
 * `node:fs` / `node:path`) because the UE import plan (`ue-import-plan.ts`) counts shells
 * with it, and that plan is rendered by a client component (Import Automation). Moving the
 * rule here keeps ONE authority for "what is a part" without pulling node:* into the browser
 * bundle. `mesh-critique.ts` re-exports everything below, so its importers are unchanged.
 */

/** Below this share of the total faces a component is a speck, not a body part. */
export const FLOATER_FACE_SHARE = 0.005;
/** …and never call something a part on face share alone when it is this tiny. */
export const FLOATER_MIN_FACES = 8;

export interface ComponentSplit {
  /** False when the script emitted no histogram — callers must not infer from counts. */
  measured: boolean;
  parts: number;
  floaters: number;
  floaterFaces: number;
}

/**
 * Split connected components into real parts and specks.
 *
 * An assembled character is legitimately multi-shell (head, lashes, brows, eye layers,
 * mouth interior, teeth, tongue, body, hands, hair, cape, accessories) — a raw component
 * COUNT cannot tell that apart from a shattered mesh. Face share can.
 */
export function classifyComponents(componentFaces: number[] | undefined, omitted = 0): ComponentSplit {
  if (!componentFaces?.length) return { measured: false, parts: 0, floaters: 0, floaterFaces: 0 };
  const total = componentFaces.reduce((a, b) => a + b, 0);
  const floor = Math.max(FLOATER_MIN_FACES, total * FLOATER_FACE_SHARE);
  const floaterList = componentFaces.filter((f) => f < floor);

  // The histogram is capped and sorted largest-first, so anything omitted is no bigger
  // than the smallest entry we kept. When that entry is already a speck, every omitted
  // one is too. When it is substantial we cannot tell — so count them as parts, which
  // pushes toward the harsher verdict. Neither branch can manufacture a pass.
  const smallestKept = componentFaces[componentFaces.length - 1];
  const omittedAreSpecks = smallestKept < floor;

  return {
    measured: true,
    parts: componentFaces.length - floaterList.length + (omittedAreSpecks ? 0 : omitted),
    floaters: floaterList.length + (omittedAreSpecks ? omitted : 0),
    floaterFaces: floaterList.reduce((a, b) => a + b, 0),
  };
}
