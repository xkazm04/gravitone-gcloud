// THE CANVAS'S GEOMETRY — every position on the board is arithmetic, never a DOM read.
//
// Stages run across X, groups down Y, cards stack in a column inside a cell.
// A card is a fixed size (CARD_W x CARD_H) at a fixed pitch, so where card
// number r of a cell sits is `lane.y + LANE_PAD + r * PITCH` — and the answer to
// "which cards intersect this rectangle" is a row range per cell, found by
// division. That one fact carries the whole engine:
//
//   · WINDOWING needs no measurement and no per-card scan: `cullRect` returns the
//     row range of each cell the rectangle crosses (the shelf's `windowRange`,
//     app/_projects/shelf.ts, generalised from one column to a grid of them).
//   · THE KEYBOARD WALK is a lookup in `Layout.ids`, so it works on cards that
//     are not mounted. Arrange's walk queried every `[data-card]` and measured
//     each one; at ~500 cards that is the cost, and it can only see what is in
//     the DOM.
//   · A DROP is resolved from a world point by `resolveCell`, so the cell under
//     the pointer is known whether or not its background is mounted.
//
// Everything here is pure and has no React in it, so the node lane can assert it.

import type { CanonStage, PipelineEntry } from "@/lib/board/pipeline";

/* ── the grid's measurements (world units = CSS px at zoom 1) ──────────── */

/** +10 ON ROUND 1'S SECOND PASS. A one-line card truncates its title at the
 *  width, and 272 was cutting it too short to read — the operator asked for ten
 *  more and ten more is what this is. Every column, band and lane width is
 *  derived from it (BAND_W below), so the board widens with the card. */
export const CARD_W = 282;
/** ROUND 1 CUT THIS FROM 80. A card held two rows — the title and a figure, then
 *  vendor / state / dwell under a rule — and the operator's verdict was that
 *  those four facts belong in the detail because they were costing the TITLE its
 *  readability. A card that carries one line needs the height of one line, and
 *  the four facts lost nothing: every one of them was already in `ItemDetail`
 *  (created time was the exception, and it was added there in the same change). */
export const CARD_H = 48;
export const GAP = 8;
export const PITCH = CARD_H + GAP;
export const COL_PAD = 12;
export const BAND_W = CARD_W + COL_PAD * 2;
export const STAGE_GAP = 24;
export const LANE_GAP = 14;
/** Shaved from 12. It is the gap between a lane's top edge and its first card,
 *  and it stacks with whatever sits above the lane — under the column header row
 *  that was the band labels plus the frame's own inset, which read as a band of
 *  dead space right where the board's content is supposed to start. */
export const LANE_PAD = 8;
/** A lane is never shorter than this many rows. */
export const LANE_MIN_ROWS = 1;

/** The overlay furniture, in SCREEN px: the stage heads' strip along the top and
 *  the lane heads' strip down the left. `inset` is the breathing room between
 *  that furniture and the first cell when the board is framed. */
/**
 * The overlay furniture, in SCREEN px.
 *
 * `top` IS MEASURED FROM WHAT StageHeads DRAWS, not chosen: the strip holds the
 * stage row (h-8 = 32) and, where a stage is banded, the band row beneath it
 * (top-8 h-6 = 32..56), plus the flow hairline. 58 clears both. Cutting it to 48
 * for the space clipped every band label to a sliver, which no gate saw and a
 * screenshot did.
 *
 * `insetX` and `insetY` were ONE number, and that is why the board had a band of
 * dead space under its column headers: 16px of breathing room is right beside
 * the lane heads, where it separates two things that would otherwise touch, and
 * wrong under the stage heads, where it stacks with the band row's own height
 * and the lane's padding to push the first card a long way below the header that
 * names its column. Vertically the furniture IS the separation, so there is
 * nothing left to insert — `insetY` is 0 on purpose, not by omission.
 */
export const FRAME = { top: 58, left: 176, insetX: 16, insetY: 0 } as const;

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 1.6;

/* ── types ─────────────────────────────────────────────────────────────── */

export interface Camera {
  x: number;
  y: number;
  k: number;
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Column {
  index: number;
  stage: CanonStage;
  /** null when the stage declares no bands. */
  band: string | null;
  /** The band's label; "" for a stage with no bands (its head carries the stage). */
  label: string;
  x: number;
  w: number;
}

export interface Lane {
  index: number;
  key: string;
  label: string;
  y: number;
  h: number;
  /** The tallest cell in the lane. */
  rows: number;
}

export interface StageSpan {
  stage: CanonStage;
  x: number;
  w: number;
  /** First column, and one past the last. */
  from: number;
  to: number;
  banded: boolean;
}

export interface Slot {
  lane: number;
  col: number;
  row: number;
}

export interface Layout {
  columns: readonly Column[];
  lanes: readonly Lane[];
  stages: readonly StageSpan[];
  width: number;
  height: number;
  /** Card ids per cell, indexed `lane * columns.length + col`, in row order. */
  ids: readonly (readonly string[])[];
  slotOf: ReadonlyMap<string, Slot>;
  entryOf: ReadonlyMap<string, PipelineEntry>;
  total: number;
  stageCounts: Readonly<Record<CanonStage, number>>;
}

export interface Placed extends Slot {
  id: string;
  x: number;
  y: number;
}

export type Dir = "left" | "right" | "up" | "down";
