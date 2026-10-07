// The canvas's public types — what a skin supplies and what the shell reads back.

import type { ReactNode } from "react";

import type { CanonStage, MoveCost, MoveNeed, PipelineEntry, PipelineLoadNotes } from "@/lib/board/pipeline";

import type { Camera, Layout } from "./geometry";

/** What a source's skin supplies. The ENGINE draws the shell of a card (its
 *  border, its tone by stage, its selection, its actions button); a skin draws
 *  what is INSIDE it, and may not draw outside CARD_W x CARD_H. */
export interface PipelineSkin {
  /** The card's face. Called exactly once per render of one card — which makes
   *  it the honest counter for "what re-rendered". Reserve the right 40px for
   *  the actions button. Must be a stable reference (module-level). */
  face?(entry: PipelineEntry): ReactNode;
  /** The stage's word, where a source says it differently ("gate" -> "review"). */
  stageLabel?: Partial<Record<CanonStage, string>>;
  /** Drawn INSIDE the world transform, behind every card: a direction's own
   *  geometry — the lines a transit map runs between stations, a lane wash, a
   *  field's light. It is handed the LAYOUT, which carries every column's `x`
   *  and `w`, every lane's `y` and `h`, the stage spans and `slotOf` for a
   *  single card, so it can place itself in world coordinates.
   *
   *  It is NOT handed the camera, for the same structural reason a card is not:
   *  the container owns the pan transform and this layer rides it. A backdrop
   *  that read the camera would re-render on every pan step and take the board
   *  down with it.
   *
   *  Must be a stable reference (module-level), like `face`. Keep it cheap: it
   *  re-renders whenever the layout changes, which a re-group or a move does. */
  world?(layout: Layout): ReactNode;
}

/** What dropping here would do, asked of the authority ONCE at drag start. */
export type Verdict =
  | { kind: "home" }
  | { kind: "ok"; laneOnly: boolean }
  | { kind: "needs"; need: MoveNeed; prompt: string; cost?: MoveCost }
  | { kind: "refused"; reason: string };

export type ChoreoReason = "cap" | "reduced-motion" | null;

/** Whether the board is choreographing, as state — never a sentence. Above
 *  `cap` cards in the viewport the entrance stagger and the layout glide switch
 *  off; the shell draws that as a `<Tally>`, and `reason` says which rule did it. */
export interface ChoreoState {
  on: boolean;
  reason: ChoreoReason;
  visible: number;
  cap: number;
}

export interface CanvasStatus {
  /** `loadPipeline()` has not answered yet. */
  loading: boolean;
  /** The last load's failure, kept alongside the previous entries. */
  error: string | null;
  total: number;
  counts: Readonly<Record<CanonStage, number>>;
  selected: number;
  /** Cards mounted right now — a count set by the viewport, not by `total`. */
  mounted: number;
  choreo: ChoreoState;
  /** The source's own account of the last load: a column whose upstream is
   *  down (`degraded`), rows deliberately not shown (`hidden`), records that
   *  would not read (`damaged`). The load SUCCEEDED in each case, so none of
   *  this is `error` — and a shell that draws none of it draws an empty column
   *  that reads as "no work" when the truth is "nobody could ask". Null when
   *  the source keeps no account. */
  notes: PipelineLoadNotes | null;
}

/** One entry of the wave log: how many cards a mounting slice added, and how
 *  long the frame after it took. */
export interface WaveSample {
  slice: number;
  shown: number;
  of: number;
  ms: number;
}

export interface PipelineHandle {
  reload(): Promise<void>;
  /** Everything in view at once. */
  fit(): void;
  zoomBy(factor: number): void;
  reveal(id: string): void;
  camera(): Camera;
}
