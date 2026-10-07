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

import {
  CANON_STAGES,
  UNGROUPED_LANE,
  type CanonStage,
  type GroupAxis,
  type PipelineEntry,
  type PipelineSource,
} from "@/lib/board/pipeline";

/* ── the grid's measurements (world units = CSS px at zoom 1) ──────────── */

export const CARD_W = 272;
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
export const LANE_PAD = 12;
/** A lane is never shorter than this many rows. */
export const LANE_MIN_ROWS = 1;

/** The overlay furniture, in SCREEN px: the stage heads' strip along the top and
 *  the lane heads' strip down the left. `inset` is the breathing room between
 *  that furniture and the first cell when the board is framed. */
/** `top` IS MEASURED FROM WHAT StageHeads DRAWS, not chosen. The strip holds the
 *  stage row (h-8 = 32) and, where a stage is banded, the band row beneath it
 *  (top-8 h-6 = 32..56), plus the flow hairline. 58 clears both. Cutting it to
 *  48 for the space clipped every band label to a sliver, which no gate saw and
 *  a screenshot did. */
export const FRAME = { top: 58, left: 176, inset: 16 } as const;

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

/* ── building ──────────────────────────────────────────────────────────── */

type LaneSource = Pick<PipelineSource, "bands" | "lanes">;

/** Entries in, a layout out. Called once per change of entries or axis, never per
 *  pan, zoom or pointer move. */
export function buildLayout(entries: readonly PipelineEntry[], source: LaneSource, axis: GroupAxis): Layout {
  const items = entries.map((e) => e.item);

  const laneKeys: { key: string; label: string }[] = [];
  const laneIdx = new Map<string, number>();
  for (const d of source.lanes(items, axis)) {
    if (laneIdx.has(d.key)) continue;
    laneIdx.set(d.key, laneKeys.length);
    laneKeys.push({ key: d.key, label: d.label });
  }
  const fallback = () => {
    let i = laneIdx.get(UNGROUPED_LANE);
    if (i === undefined) {
      i = laneKeys.length;
      laneIdx.set(UNGROUPED_LANE, i);
      laneKeys.push({ key: UNGROUPED_LANE, label: "ungrouped" });
    }
    return i;
  };

  // A stage with no bands draws one bare column; a source that does not use a
  // stage still draws it, empty, so the furniture does not shift between sources.
  const columns: Column[] = [];
  const stages: StageSpan[] = [];
  const colOf = new Map<string, number>();
  const firstOf = {} as Record<CanonStage, number>;
  let x = 0;
  for (const stage of CANON_STAGES) {
    const bands = source.bands[stage] ?? [];
    const from = columns.length;
    const x0 = x;
    firstOf[stage] = from;
    if (bands.length === 0) {
      colOf.set(`${stage}|`, columns.length);
      columns.push({ index: columns.length, stage, band: null, label: "", x, w: BAND_W });
      x += BAND_W;
    } else {
      for (const b of bands) {
        colOf.set(`${stage}|${b.id}`, columns.length);
        columns.push({ index: columns.length, stage, band: b.id, label: b.label, x, w: BAND_W });
        x += BAND_W;
      }
    }
    stages.push({ stage, x: x0, w: x - x0, from, to: columns.length, banded: bands.length > 0 });
    x += STAGE_GAP;
  }
  const width = x - STAGE_GAP;

  const placed: { id: string; lane: number; col: number }[] = [];
  const stageCounts = { proposed: 0, working: 0, gate: 0, done: 0 } as Record<CanonStage, number>;
  for (const e of entries) {
    const p = e.placement;
    const col = colOf.get(`${p.stage}|${p.band ?? ""}`) ?? firstOf[p.stage];
    const lane = laneIdx.get(axis.of(e.item)) ?? fallback();
    placed.push({ id: e.item.id, lane, col });
    stageCounts[p.stage]++;
  }
  if (laneKeys.length === 0) fallback();

  const nC = columns.length;
  const ids: string[][] = Array.from({ length: laneKeys.length * nC }, () => []);
  const slotOf = new Map<string, Slot>();
  const entryOf = new Map<string, PipelineEntry>();
  for (const e of entries) entryOf.set(e.item.id, e);
  for (const p of placed) {
    const cell = ids[p.lane * nC + p.col];
    slotOf.set(p.id, { lane: p.lane, col: p.col, row: cell.length });
    cell.push(p.id);
  }

  const lanes: Lane[] = [];
  let y = 0;
  for (let i = 0; i < laneKeys.length; i++) {
    let rows = 0;
    for (let c = 0; c < nC; c++) rows = Math.max(rows, ids[i * nC + c].length);
    // NO RESERVED DROP ROW. Every lane used to carry `rows + 1`, so a drag could
    // never make a lane taller and the lanes below it never jumped while the
    // pointer was down. The cost was a permanent empty row in EVERY lane — a
    // one-card lane stood 192px tall to hold 80px of card — and round 1's
    // verdict was that the y axis was eating the board. It is not load-bearing
    // for the drop: `resolveCell` resolves a CELL, never a row, and it already
    // forgives half a LANE_GAP past the lane's bottom edge, so the append target
    // is reachable without a row of slack behind it. What is lost is narrow and
    // it is after the fact: a lane that gains its first card in a column grows
    // by one PITCH, and the lanes below it shift once — on commit, with the
    // pointer already up, not under it.
    const h = LANE_PAD * 2 + Math.max(LANE_MIN_ROWS, rows) * PITCH - GAP;
    lanes.push({ index: i, key: laneKeys[i].key, label: laneKeys[i].label, y, h, rows });
    y += h + LANE_GAP;
  }
  const height = Math.max(0, y - LANE_GAP);

  return { columns, lanes, stages, width, height, ids, slotOf, entryOf, total: entries.length, stageCounts };
}

/* ── positions ─────────────────────────────────────────────────────────── */

export const cardX = (l: Layout, col: number): number => l.columns[col].x + COL_PAD;
export const cardY = (l: Layout, lane: number, row: number): number => l.lanes[lane].y + LANE_PAD + row * PITCH;

export function cardPos(l: Layout, id: string): { x: number; y: number } | null {
  const s = l.slotOf.get(id);
  return s ? { x: cardX(l, s.col), y: cardY(l, s.lane, s.row) } : null;
}

/** Where the next card dropped into this cell would land. */
export function tailPos(l: Layout, lane: number, col: number): { x: number; y: number } {
  const n = l.ids[lane * l.columns.length + col].length;
  return { x: cardX(l, col), y: cardY(l, lane, n) };
}

/* ── culling ───────────────────────────────────────────────────────────── */

/** The cards whose cells the rectangle crosses, as a row range per cell.
 *  O(cells crossed + cards returned): nothing here grows with the board's size. */
export function cullRect(l: Layout, r: Rect): Placed[] {
  const out: Placed[] = [];
  const nC = l.columns.length;
  for (const lane of l.lanes) {
    if (lane.y + lane.h < r.y0) continue;
    if (lane.y > r.y1) break;
    const r0 = Math.max(0, Math.floor((r.y0 - lane.y - LANE_PAD) / PITCH));
    const r1 = Math.floor((r.y1 - lane.y - LANE_PAD) / PITCH);
    for (const col of l.columns) {
      if (col.x + col.w < r.x0 || col.x > r.x1) continue;
      const ids = l.ids[lane.index * nC + col.index];
      const last = Math.min(ids.length - 1, r1);
      for (let row = r0; row <= last; row++) {
        out.push({ id: ids[row], lane: lane.index, col: col.index, row, x: col.x + COL_PAD, y: lane.y + LANE_PAD + row * PITCH });
      }
    }
  }
  return out;
}

/** How many cards `cullRect` would return, without building them. */
export function countRect(l: Layout, r: Rect): number {
  let n = 0;
  const nC = l.columns.length;
  for (const lane of l.lanes) {
    if (lane.y + lane.h < r.y0) continue;
    if (lane.y > r.y1) break;
    const r0 = Math.max(0, Math.floor((r.y0 - lane.y - LANE_PAD) / PITCH));
    const r1 = Math.floor((r.y1 - lane.y - LANE_PAD) / PITCH);
    for (const col of l.columns) {
      if (col.x + col.w < r.x0 || col.x > r.x1) continue;
      const len = l.ids[lane.index * nC + col.index].length;
      n += Math.max(0, Math.min(len - 1, r1) - r0 + 1);
    }
  }
  return n;
}

/** [from, to) of the lanes the rectangle crosses. */
export function laneRange(l: Layout, r: Rect): [number, number] {
  let from = -1;
  let to = 0;
  for (const lane of l.lanes) {
    if (lane.y + lane.h < r.y0) continue;
    if (lane.y > r.y1) break;
    if (from < 0) from = lane.index;
    to = lane.index + 1;
  }
  return from < 0 ? [0, 0] : [from, to];
}

/** The cell under a world point, with half a gap of forgiveness so the seams
 *  between cells belong to a neighbour. Null is off the board: a drop there is
 *  a drop outside any target. */
export function resolveCell(l: Layout, wx: number, wy: number): { lane: number; col: number } | null {
  const nC = l.columns.length;
  if (nC === 0 || l.lanes.length === 0) return null;
  let col = -1;
  for (const c of l.columns) {
    const pad = c.index === 0 || l.columns[c.index - 1].stage === c.stage ? 0 : STAGE_GAP / 2;
    if (wx >= c.x - pad && wx < c.x + c.w + (c.index === nC - 1 || l.columns[c.index + 1].stage === c.stage ? 0 : STAGE_GAP / 2)) {
      col = c.index;
      break;
    }
  }
  if (col < 0) return null;
  // Binary search: lanes are sorted by y, and there can be hundreds.
  let lo = 0;
  let hi = l.lanes.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (l.lanes[mid].y - LANE_GAP / 2 <= wy) lo = mid;
    else hi = mid - 1;
  }
  const lane = l.lanes[lo];
  if (wy < lane.y - LANE_GAP / 2 || wy >= lane.y + lane.h + LANE_GAP / 2) return null;
  return { lane: lo, col };
}

/* ── walking ───────────────────────────────────────────────────────────── */

/** Arrow-key walk: the next card in a direction, from the layout alone.
 *  Left/right keep the row (clamped) in the nearest occupied column of the same
 *  lane, then fall back to the nearest other lane; up/down walk the cell, then
 *  cross into the next lane's occupied cell in the same column. */
export function walk(l: Layout, id: string, dir: Dir): string | null {
  const s = l.slotOf.get(id);
  if (!s) return null;
  const nC = l.columns.length;
  const nL = l.lanes.length;
  const cell = (lane: number, col: number) => l.ids[lane * nC + col];

  if (dir === "up" || dir === "down") {
    const step = dir === "down" ? 1 : -1;
    const cur = cell(s.lane, s.col);
    const row = s.row + step;
    if (row >= 0 && row < cur.length) return cur[row];
    for (let lane = s.lane + step; lane >= 0 && lane < nL; lane += step) {
      const c = cell(lane, s.col);
      if (c.length) return step > 0 ? c[0] : c[c.length - 1];
    }
    return null;
  }

  const step = dir === "right" ? 1 : -1;
  const across = (lane: number): string | null => {
    for (let col = s.col + step; col >= 0 && col < nC; col += step) {
      const c = cell(lane, col);
      if (c.length) return c[Math.min(s.row, c.length - 1)];
    }
    return null;
  };
  const here = across(s.lane);
  if (here) return here;
  for (let d = 1; d < nL; d++) {
    for (const lane of [s.lane - d, s.lane + d]) {
      if (lane < 0 || lane >= nL) continue;
      const hit = across(lane);
      if (hit) return hit;
    }
  }
  return null;
}

/** Shift+arrow: the adjacent CELL, whether or not anything is in it. Null at the
 *  edge of the board. */
export function stepCell(l: Layout, id: string, dir: Dir): { lane: number; col: number } | null {
  const s = l.slotOf.get(id);
  if (!s) return null;
  const lane = dir === "up" ? s.lane - 1 : dir === "down" ? s.lane + 1 : s.lane;
  const col = dir === "left" ? s.col - 1 : dir === "right" ? s.col + 1 : s.col;
  if (lane < 0 || lane >= l.lanes.length || col < 0 || col >= l.columns.length) return null;
  return { lane, col };
}

/** The card nearest the middle of a rectangle — where the keyboard cursor
 *  starts when focus arrives with no active card. */
export function nearestTo(l: Layout, r: Rect): string | null {
  const cx = (r.x0 + r.x1) / 2;
  const cy = (r.y0 + r.y1) / 2;
  let best: string | null = null;
  let bestD = Infinity;
  for (const p of cullRect(l, r)) {
    const d = (p.x + CARD_W / 2 - cx) ** 2 + (p.y + CARD_H / 2 - cy) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p.id;
    }
  }
  return best;
}

/* ── the camera ────────────────────────────────────────────────────────── */

export const clampK = (k: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, k));

/** The world rectangle a viewport of `w x h` shows, widened by `margin` screen px. */
export function viewRect(c: Camera, w: number, h: number, margin = 0): Rect {
  const m = margin / c.k;
  return { x0: -c.x / c.k - m, y0: -c.y / c.k - m, x1: (w - c.x) / c.k + m, y1: (h - c.y) / c.k + m };
}

/** Round a rectangle outward to a grid, so a pan step that crosses no grid line
 *  produces an EQUAL rectangle and the caller's state bails out. */
export function quantize(r: Rect, q: number): Rect {
  return { x0: Math.floor(r.x0 / q) * q, y0: Math.floor(r.y0 / q) * q, x1: Math.ceil(r.x1 / q) * q, y1: Math.ceil(r.y1 / q) * q };
}

/** The fraction of `b` that `a` covers. */
export function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / Math.max(1, (b.x1 - b.x0) * (b.y1 - b.y0));
}

export const sameRect = (a: Rect | null, b: Rect | null): boolean =>
  a === b || (!!a && !!b && a.x0 === b.x0 && a.y0 === b.y0 && a.x1 === b.x1 && a.y1 === b.y1);

export function zoomAt(c: Camera, k2: number, px: number, py: number): Camera {
  const k = clampK(k2);
  const wx = (px - c.x) / c.k;
  const wy = (py - c.y) / c.k;
  return { k, x: px - wx * k, y: py - wy * k };
}

/** The opening frame: all four stages across the viewport, anchored top-left. */
export function frameCamera(l: Layout, w: number, h: number): Camera {
  void h;
  const avail = w - FRAME.left - FRAME.inset * 2;
  const k = clampK(Math.min(avail / Math.max(1, l.width), 1));
  return { k, x: FRAME.left + FRAME.inset, y: FRAME.top + FRAME.inset };
}

/** Everything in view at once. */
export function fitCamera(l: Layout, w: number, h: number): Camera {
  const availW = w - FRAME.left - FRAME.inset * 2;
  const availH = h - FRAME.top - FRAME.inset * 2;
  const k = clampK(Math.min(availW / Math.max(1, l.width), availH / Math.max(1, l.height), 1));
  // centred across the open width, so a narrow board is not pressed into a corner
  return { k, x: FRAME.left + FRAME.inset + Math.max(0, (availW - l.width * k) / 2), y: FRAME.top + FRAME.inset };
}

/** The smallest camera move that brings a card fully into the open part of the
 *  viewport (clear of the heads), or null when it already is. */
export function revealCamera(c: Camera, l: Layout, id: string, w: number, h: number, pad = 24): Camera | null {
  const p = cardPos(l, id);
  if (!p) return null;
  const left = p.x * c.k + c.x;
  const top = p.y * c.k + c.y;
  const right = left + CARD_W * c.k;
  const bottom = top + CARD_H * c.k;
  const minX = FRAME.left + pad;
  const minY = FRAME.top + pad;
  const maxX = w - pad;
  const maxY = h - pad;
  let dx = 0;
  let dy = 0;
  if (left < minX) dx = minX - left;
  else if (right > maxX) dx = maxX - right;
  if (top < minY) dy = minY - top;
  else if (bottom > maxY) dy = maxY - bottom;
  return dx === 0 && dy === 0 ? null : { k: c.k, x: c.x + dx, y: c.y + dy };
}

/** Screen position of a world point. */
export const toScreen = (c: Camera, wx: number, wy: number): { x: number; y: number } => ({ x: wx * c.k + c.x, y: wy * c.k + c.y });

/** World position of a screen point (relative to the viewport's own corner). */
export const toWorld = (c: Camera, sx: number, sy: number): { x: number; y: number } => ({ x: (sx - c.x) / c.k, y: (sy - c.y) / c.k });
