// THE FRAMES AND MOTION PART VIEWS (Phase 4 wave C, L39; STEPS-DESIGN §2 "frames", "motion"): what
// the two editors draw, the edits they send and the generating acts they launch. Zod-free and
// type-only like ./partView.ts (the client holds it); its own file for the 400-line rule.
//
// Every field is what a v1 function computed for the screen, named beside it, so the server runs
// that function and the editor draws its answer:
//   · units      lib/frames/picture/unit.ts unitsFromRender (explainer beats, trailer shots), the
//                v1 ledger's rows - and a trailer's SHOTS are units with plates now (v1 ShotSheet
//                was read-only: "a trailer cannot render a single plate", INVENTORY §3);
//   · pips       v1 FramesAssembly's breakdown (plate, clip, elements, texts), counted here so the
//                rail draws marks, never wrapping words (the v1 pips wrapped "texts 2");
//   · proposal   app/_phases/frames/direction/plan.ts planFromSpecs (v1 wrote it, probed it, and
//                never wired it: a direction pass was applied wholesale by applySceneSpecs);
//   · issues     lib/frames/sceneSpec.ts reviewSceneSpecs' per-beat rejections, VERBATIM;
//   · review     app/_phases/frames/shotReview.ts reviewShotList, 13 rules + NOT_CHECKED;
//   · motion     app/_phases/motion/direction.ts outcomes (proposed | declined, decline reasons
//                verbatim) and the accepted line on the unit's clip.
// Media are URLs the server minted from blob refs (/api/blob/<sha>) or public paths - never bytes.

import type { Finding } from "./partView.data.ts";

/** Where a layer came from (lib/frames/frames.ts LayerBy): a seed, a direction pass, a human. */
export type LayerBy = "seed" | "pass" | "human";
export type LayerKind = "element" | "text";

/** One layer of a unit's canvas, in percent of the frame (v1 parts.tsx: clamped 0-100). */
export type LayerView = {
  readonly id: string;
  readonly layer: LayerKind;
  /** An element's kind (arrow, bar, ...) or a text's role (caption, figure, label, kicker). */
  readonly role: string;
  /** An element's label or a text's value. */
  readonly label: string;
  readonly x: number;
  readonly y: number;
  /** Elements only: the box. */
  readonly w?: number;
  readonly h?: number;
  readonly accent?: boolean;
  readonly hidden: boolean;
  readonly by: LayerBy;
  readonly factId?: string;
  /** A figure that cites no fact: a number nobody checked (v1's amber ●). */
  readonly unsourced: boolean;
};

export type PlateState = "empty" | "generating" | "ready" | "refused" | "rejected";

export type PlateView = {
  readonly state: PlateState;
  /** The pixels: /api/blob/<sha> for a kernel blob, a public path for a dry stand-in, else null. */
  readonly url: string | null;
  readonly subject: string;
  /** Ready, but its subject moved since it was rendered (lib/frames/frames.ts isStalePlate). */
  readonly stale: boolean;
  readonly model?: string;
  readonly usd?: number;
  /** The gate packet that rejected it (lib/parts/gates.ts): a re-render is owed. */
  readonly rejectedBy?: string;
  /** A stand-in landed by a dry job, not a vendor's pixels. */
  readonly dry: boolean;
};

export type UnitClipView = { readonly status: string; readonly motion: string; readonly url: string | null };

export type StagingView = { readonly role: string; readonly size: string; readonly angle: string; readonly pace: string; readonly direction: string; readonly placement: string };

export type AltView = { readonly id: string; readonly url: string | null; readonly active: boolean; readonly dry: boolean };

/** A direction pass's plan for one unit, before it is accepted. */
export type ProposalRow = {
  /** The edits as words ("subject", "3 elements", "caption"). */
  readonly ops: readonly string[];
  readonly subject?: string;
  /** Human layers the proposal would overwrite (kept unless the accept says overwrite). */
  readonly conflicts: number;
  /** The scene-spec refusal for this beat, verbatim. */
  readonly rejected?: string;
};

export type UnitView = {
  readonly id: string;
  readonly at: string;
  readonly startS: number | null;
  readonly holdS: number | null;
  readonly grain: "beat" | "shot";
  readonly beatKind: string;
  readonly title: string;
  readonly line: string;
  readonly device?: string;
  readonly rationale?: string;
  readonly plate: PlateView;
  readonly clip: UnitClipView;
  /** Paint order, bottom first: elements, then texts (v1 LayerPanel). */
  readonly layers: readonly LayerView[];
  readonly pips: { readonly elements: number; readonly texts: number; readonly unsourced: number };
  readonly staging?: StagingView;
  readonly alts: readonly AltView[];
  readonly proposal?: ProposalRow;
};

export type FactOption = { readonly id: string; readonly title: string; readonly confidence?: "high" | "medium" | "low" };

export type FramesTally = { readonly total: number; readonly composed: number; readonly stale: number; readonly rejected: number; readonly unsourced: number; readonly clips: number };

/** The shot list's review (reviewShotList): its checks as findings, and what it did not check. */
export type ShotReviewView = {
  readonly checks: number;
  readonly violations: number;
  readonly unmeasured: number;
  readonly notEngaged: number;
  readonly findings: readonly Finding[];
  readonly notChecked: readonly string[];
};

export type FramesBoard = {
  readonly face: "assembly" | "shots";
  /** The chain the units came from; null when the script has adopted none. */
  readonly source: { readonly id: string; readonly title: string } | null;
  /** The units were derived from another chain than the one adopted now. */
  readonly sourceMoved: boolean;
  readonly units: readonly UnitView[];
  readonly tally: FramesTally;
  /** The style the plates are prompted in; `fallback` when the project chose none. */
  readonly style: { readonly name: string; readonly fallback: boolean };
  readonly facts: readonly FactOption[];
  readonly proposal: { readonly rows: number; readonly conflicts: number; readonly rejected: number; readonly missing: readonly string[] } | null;
  /** A pass was accepted and can be reverted. */
  readonly checkpoint: boolean;
  /** What direction passes have cost (v1 DirectionSpend: unpriced passes counted, never $0). */
  readonly direction: { readonly runs: number; readonly usd: number; readonly unpriced: number };
  readonly review?: ShotReviewView;
};

export type ImageTakeView = { readonly id: string; readonly url: string | null; readonly adopted: boolean; readonly dry: boolean };
export type AdShotTakes = { readonly id: string; readonly durationS: number; readonly brief: string; readonly super: string | null; readonly takes: readonly ImageTakeView[]; readonly adopted: string | null };

/** Ads frames (v1 AdsFrames): a take grid per shot of the PICKED scenario. */
export type AdsTakes = {
  readonly face: "takes";
  readonly scenario: { readonly id: string; readonly title: string } | null;
  /** The takes were made for another scenario than the one picked now. */
  readonly scenarioMoved: boolean;
  readonly aspect: "16:9" | "9:16";
  readonly shots: readonly AdShotTakes[];
};

export type FramesData = FramesBoard | AdsTakes;

/* ── motion ───────────────────────────────────────────────────────────────── */

export type MotionMoveView = { readonly element: string; readonly verb: string; readonly x?: number; readonly y?: number };

export type MotionUnitView = {
  readonly id: string;
  readonly at: string;
  readonly title: string;
  readonly beatKind: string;
  readonly plate: PlateView;
  /** The accepted line on the unit's clip (what a render reads). */
  readonly motion: string;
  readonly state: "moving" | "proposed" | "declined" | "none";
  readonly proposal?: { readonly text: string; readonly moves: readonly MotionMoveView[]; readonly holdsStill: readonly string[]; readonly provider: string; readonly model: string; readonly dry: boolean };
  /** The decline reason, verbatim (direction.ts: "no separable element: ..."). */
  readonly declined?: string;
  /** The outcome was made from other pixels than the plate holds now. */
  readonly outcomeStale: boolean;
  readonly clip: UnitClipView;
};

export type MotionBoard = {
  readonly face: "plates";
  readonly units: readonly MotionUnitView[];
  readonly tally: { readonly moving: number; readonly declined: number; readonly open: number; readonly total: number; readonly clips: number };
};

export type ClipTake = { readonly id: string; readonly status: string; readonly url: string | null; readonly adopted: boolean; readonly dry: boolean };
export type AdShotClips = { readonly id: string; readonly durationS: number; readonly motion: string; readonly still: string | null; readonly clips: readonly ClipTake[]; readonly adopted: string | null };
export type AdsClips = { readonly face: "clips"; readonly scenario: { readonly id: string; readonly title: string } | null; readonly scenarioMoved: boolean; readonly shots: readonly AdShotClips[] };

export type MotionData = MotionBoard | AdsClips;

/* ── edits ────────────────────────────────────────────────────────────────── */

type At = { readonly unitId: string };
type Layer = At & { readonly layer: LayerKind; readonly layerId: string };

export type FramesOp =
  | (Layer & { readonly op: "move-layer"; readonly x: number; readonly y: number })
  | (Layer & { readonly op: "resize-layer"; readonly w: number; readonly h: number })
  | (Layer & { readonly op: "order-layer"; readonly dir: 1 | -1 })
  | (Layer & { readonly op: "hide-layer"; readonly hidden: boolean })
  | (Layer & { readonly op: "remove-layer" })
  | (At & { readonly op: "set-text"; readonly textId: string; readonly value: string })
  | (At & { readonly op: "add-text"; readonly role: "caption" | "figure" | "label" })
  | (At & { readonly op: "bind-fact"; readonly textId: string; readonly factId: string | null })
  | (At & { readonly op: "set-subject"; readonly subject: string })
  | (At & { readonly op: "set-clip-motion"; readonly motion: string })
  | (At & { readonly op: "adopt-alt"; readonly altId: string })
  /** Fold the direction proposal in: every row, or the ones named; human layers kept unless overwrite. */
  | { readonly op: "accept-direction"; readonly units: readonly string[] | "all"; readonly overwrite: boolean }
  | { readonly op: "discard-direction" }
  /** Back to the checkpoint the last accept took: one unit, or the whole pass. */
  | { readonly op: "revert-direction"; readonly unitId?: string }
  /** Re-derive the units from the chain adopted now, keeping each surviving unit's work. */
  | { readonly op: "rederive" }
  | { readonly op: "adopt-image"; readonly shotId: string; readonly takeId: string };

export type MotionOp =
  /** Accept the unit's proposal, or the operator's own line. */
  (At & { readonly op: "accept-motion"; readonly motion?: string }) | (At & { readonly op: "clear-motion" }) | { readonly op: "adopt-clip"; readonly shotId: string; readonly clipId: string };

/** The acts (receipt first): names bound by L37's producers (lib/producers/*). */
export const FRAMES_ACTS = ["direct-cut", "render-plates", "render-plate", "render-alternative", "image-takes"] as const;
export const MOTION_ACTS = ["direct-motion", "render-clip"] as const;

/** The acts that name one unit (`PartAct.target` = a unit id, or an ads shot id). */
export const UNIT_ACTS: ReadonlySet<string> = new Set(["render-plate", "render-alternative", "image-takes", "direct-motion", "render-clip"]);

/** A unit id without its chain (`<chain>:<at>:<n>` -> `<at>:<n>`): the trail names the beat. */
const unitOf = (id: string): string => (id.includes(":") ? id.slice(id.indexOf(":") + 1) : id);

/** The undo trail's words for a frames or motion op. */
export function framesOpLabel(op: FramesOp | MotionOp): string {
  switch (op.op) {
    case "move-layer":
    case "resize-layer":
    case "remove-layer":
      return `${op.op.replace("-layer", "")} ${op.layerId}`;
    case "order-layer":
      return `${op.dir === 1 ? "forward" : "backward"} ${op.layerId}`;
    case "hide-layer":
      return `${op.hidden ? "hide" : "show"} ${op.layerId}`;
    case "set-text":
      return `text ${op.textId}`;
    case "add-text":
      return `+ ${op.role}`;
    case "bind-fact":
      return op.factId === null ? `unbind ${op.textId}` : `bind ${op.textId} ${op.factId}`;
    case "set-subject":
      return `subject ${unitOf(op.unitId)}`;
    case "set-clip-motion":
      return `clip ${unitOf(op.unitId)}`;
    case "adopt-alt":
      return `adopt ${unitOf(op.altId)}`;
    case "accept-direction":
      return op.units === "all" ? "accept direction" : `accept ${op.units.length} rows`;
    case "discard-direction":
      return "discard direction";
    case "revert-direction":
      return op.unitId === undefined ? "revert pass" : `revert ${unitOf(op.unitId)}`;
    case "rederive":
      return "rederive";
    case "adopt-image":
      return `adopt ${op.takeId}`;
    case "accept-motion":
      return `motion ${unitOf(op.unitId)}`;
    case "clear-motion":
      return `clear ${unitOf(op.unitId)}`;
    case "adopt-clip":
      return `adopt ${op.clipId}`;
  }
}
