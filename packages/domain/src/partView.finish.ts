// THE SCORE AND CUT PARTS' VIEW DATA, OPS AND ACTS (Phase 4 wave C, L40; STEPS-DESIGN §2). Zod-free
// and type-only like ./partView.ts, which joins these into PartData / PartOps / PART_ACTS. Every
// field is what a v1 function computed for the screen (named beside it); the server runs that
// function and the editor draws its answer.
//
// What v1 drew instead, and why each shape is what it is:
//   · Score drew "120.00000000000004s" and shrank thirty scenes to slivers: times cross as
//     seconds and the editor rounds them (part.ts `clock`/`secs`); a scene is a cell with a floor
//     width, the lane zooms instead of squeezing.
//   · Score spans were edited only through scene ordinals; a span here IS a first/last scene
//     pair, so a drag that snaps to scene marks and the ordinal fields are one op.
//   · Cut kept its offsets in a 50-deep session undo; a nudge is an op on the part's log.

import type { EngineView } from "./partView.data.ts";

/* ── one clock (lib/cut/deriveTimeline.ts, shared by score and cut) ──────── */

/** A scene on the project clock (`pictureFromUnits` + `sceneClock`). Ids are picture-unit ids. */
export type SceneView = { readonly id: string; readonly index: number; readonly label: string; readonly mood: string; readonly startS: number; readonly durS: number };

/** A take as the cue (or a voice line) holds it. `held` = its bytes are in hand (a blob in the
 *  kernel store, or a dry stand-in on the fixture side) - a pointer to nothing is drawn as gone. */
export type TakeView = {
  readonly id: string;
  readonly label: string;
  readonly at: string | null;
  /** keep / reject (v1 PATCH on the sound store); null = undecided. */
  readonly mark: "kept" | "rejected" | null;
  readonly active: boolean;
  readonly held: boolean;
  /** The take's audio, by content address (`/api/blob/<sha256>`). */
  readonly blob?: string;
  readonly seconds: number | null;
  readonly engine?: EngineView;
  /** Sections of the take's stored plan (takes.ts `sectionsOf`), seconds on the take's clock. */
  readonly sections: readonly { readonly index: number; readonly name: string; readonly startS: number; readonly endS: number }[];
  /** A section note waiting for "revise" (the section-edit request's direction). */
  readonly revision?: { readonly section: number; readonly note: string };
};

/* ── score ────────────────────────────────────────────────────────────────── */

export type CueView = {
  readonly id: string;
  readonly title: string;
  readonly sceneIds: readonly string[];
  readonly startS: number;
  readonly durS: number;
  /** What the cue is FOR - the cue section's label when proposed (lib/score/spots.ts). */
  readonly note: string;
  /** Absent upstream by doctrine: a proposal never invents a tempo. */
  readonly bpm: number | null;
  readonly proposed: boolean;
  readonly takes: readonly TakeView[];
  readonly activeTakeId: string | null;
};

export type SpottingData = {
  readonly face: "spotting";
  readonly totalS: number;
  readonly targetS: number | null;
  readonly scenes: readonly SceneView[];
  readonly cues: readonly CueView[];
  /** No spotting was ever saved: the cues are `proposeSpots` over the trailer cut's movements,
   *  and the first edit keeps them. `unplaced` are movements with no place, with the reason. */
  readonly proposal: { readonly pending: boolean; readonly unplaced: readonly { readonly label: string; readonly why: string }[] };
  /** Runs of scenes no cue covers (gaps.ts `gapRuns`), in film order. */
  readonly gaps: readonly (readonly string[])[];
  /** Seconds covered by at least one cue - a union, overlaps not counted twice. */
  readonly coveredS: number;
  readonly turn: { readonly atS: number; readonly label: string } | null;
  /** Finalized lab takes a cue can adopt (a pointer, no render). */
  readonly lab: readonly { readonly id: string; readonly label: string }[];
};

/** The ad's bed (score/ads/bed.ts): one cue, the runtime by construction. */
export type BedData = {
  readonly face: "bed";
  readonly scenario: { readonly id: string; readonly title: string; readonly musicMood: string } | null;
  /** The takes were scored against a scenario other than the one picked now. */
  readonly stale: boolean;
  readonly shots: readonly { readonly id: string; readonly durationS: number; readonly label: string }[];
  readonly endCardS: number;
  readonly runtimeS: number;
  readonly bpm: number | null;
  readonly takes: readonly TakeView[];
  readonly activeTakeId: string | null;
};

export type ScoreData = SpottingData | BedData;

/** The bed's row id where a cue id is asked for. */
export const BED_CUE = "bed";

export type ScoreOp =
  /** Trim (one edge) or move (both): the span is its first and last scene. */
  | { readonly op: "cue-span"; readonly cueId: string; readonly first: string; readonly last: string }
  | { readonly op: "cue-field"; readonly cueId: string; readonly field: "title" | "note"; readonly value: string }
  | { readonly op: "cue-bpm"; readonly cueId: string; readonly bpm: number | null }
  /** Lands on the first gap run when no span is given (v1 "add a cue"). */
  | { readonly op: "cue-add"; readonly first?: string; readonly last?: string }
  | { readonly op: "cue-delete"; readonly cueId: string }
  /** Activate one of the cue's takes, or adopt a lab take onto it. */
  | { readonly op: "take-use"; readonly cueId: string; readonly takeId: string }
  | { readonly op: "take-mark"; readonly cueId: string; readonly takeId: string; readonly mark: "kept" | "rejected" | null }
  | { readonly op: "take-note"; readonly cueId: string; readonly takeId: string; readonly section: number; readonly note: string };

export const SCORE_ACTS = ["render-cue", "revise-take", "render-bed"] as const;

/* ── cut ──────────────────────────────────────────────────────────────────── */

export type Track = "video" | "vo" | "music";

export type ClipView = {
  readonly id: string;
  readonly track: Track;
  readonly label: string;
  /** The mark, and where it is drawn (mark + dialled drift). */
  readonly startS: number;
  readonly drawnS: number;
  readonly durS: number;
  readonly status: "ok" | "missing" | "drift";
  /** Why a block is missing, in the work's words ("no plate", "written, not recorded"). */
  readonly why?: string;
  readonly note?: string;
  /** The part key that clears it (a link), when this project plans that part. */
  readonly owner: string | null;
  readonly offsetMs: number;
  /** Picture: the plate; music/voice: the take - by content address. */
  readonly blob?: string;
};

export type FinishRow = {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly target: string;
  readonly verdict: "pass" | "fail" | "unmeasured";
  readonly owner: string | null;
  /** The deny sentence, verbatim (finishLine.ts). */
  readonly deny?: string;
};

export type ExportView = { readonly id: string; readonly at: string; readonly mode: "dry" | "live"; readonly label: string; readonly blob?: string; readonly bytes?: number };

/** One picture under the monitor: the plate if there is one, else the unit's words. */
export type MonitorFrame = { readonly title: string; readonly line: string; readonly kind: string; readonly blob?: string; readonly placed: boolean };

export type TimelineData = {
  readonly face: "timeline";
  readonly origin: "project" | "empty";
  readonly totalS: number;
  readonly targetS: number | null;
  readonly fps: number;
  /** Does this recipe plan a score (an explainer's cut has no music lane)? */
  readonly music: boolean;
  readonly scenes: readonly SceneView[];
  readonly clips: readonly ClipView[];
  /** Edit points (cut/edits.ts `editPoints`, merged within a frame) and music gaps. */
  readonly edits: readonly number[];
  readonly gaps: readonly { readonly startS: number; readonly endS: number }[];
  readonly turn: { readonly atS: number; readonly label: string } | null;
  readonly finish: readonly FinishRow[];
  readonly unplaced: readonly { readonly label: string; readonly why: string; readonly owner: string | null }[];
  readonly monitor: Readonly<Record<string, MonitorFrame>>;
  readonly exports: readonly ExportView[];
  /** The EDL's digest (cutDocument.ts `cutDocumentHash`): an export is of THIS cut or an older one. */
  readonly docHash: string;
};

export type AdAspect = "9:16" | "1:1" | "4:5" | "16:9";

export type AdFinishData = {
  readonly face: "finish";
  readonly scenario: { readonly id: string; readonly title: string } | null;
  readonly shots: readonly { readonly id: string; readonly durationS: number; readonly image: string; readonly clip: boolean; readonly super: string }[];
  readonly endCard: { readonly cta: string; readonly line: string; readonly holdS: number };
  readonly aspects: readonly { readonly aspect: AdAspect; readonly on: boolean; readonly px: string; readonly export: ExportView | null }[];
  /** finish.ts `adFinishChecks` - loudness included, `unmeasured` never a pass. */
  readonly checks: readonly { readonly id: string; readonly label: string; readonly value: string; readonly target: string; readonly verdict: "pass" | "fail" | "unmeasured"; readonly blocking: boolean; readonly deny?: string }[];
  readonly runtimeS: number;
  readonly targetS: number | null;
};

export type CutData = TimelineData | AdFinishData;

export type CutOp =
  | { readonly op: "nudge"; readonly clipId: string; readonly ms: number }
  | { readonly op: "snap"; readonly clipId: string }
  | { readonly op: "super"; readonly shotId: string; readonly text: string }
  | { readonly op: "end-card"; readonly field: "cta" | "line"; readonly value: string }
  | { readonly op: "end-hold"; readonly holdS: number }
  | { readonly op: "aspect"; readonly aspect: AdAspect; readonly on: boolean };

export const CUT_ACTS = ["export-animatic", "render-aspect"] as const;

/** The undo trail's words for a score or cut op. */
export function finishOpLabel(op: ScoreOp | CutOp): string {
  switch (op.op) {
    case "cue-span":
      return `span ${op.cueId}`;
    case "cue-field":
      return `${op.field} ${op.cueId}`;
    case "cue-bpm":
      return op.bpm === null ? `clear tempo ${op.cueId}` : `${op.bpm} bpm ${op.cueId}`;
    case "cue-add":
      return "add cue";
    case "cue-delete":
      return `delete ${op.cueId}`;
    case "take-use":
      return `use ${op.takeId}`;
    case "take-mark":
      return op.mark === null ? `undecide ${op.takeId}` : `${op.mark === "kept" ? "keep" : "reject"} ${op.takeId}`;
    case "take-note":
      return `note ${op.takeId} §${op.section + 1}`;
    case "nudge":
      return `${op.ms > 0 ? "+" : ""}${op.ms}ms ${op.clipId}`;
    case "snap":
      return `snap ${op.clipId}`;
    case "super":
      return `super ${op.shotId}`;
    case "end-card":
      return `end card ${op.field}`;
    case "end-hold":
      return `hold ${op.holdS}s`;
    case "aspect":
      return `${op.on ? "" : "drop "}${op.aspect}`;
  }
}
