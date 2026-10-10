// READING THE BOARD — where a card is, which of them are on screen, and which
// one an arrow key should walk to.
//
// Every function here is PURE and takes the Layout: nothing allocates, nothing
// remembers. That is what lets the culling run on every camera change and the
// walk run on every arrow without either of them being a performance question.

import {
  CARD_H,
  CARD_W,
  COL_PAD,
  LANE_GAP,
  LANE_PAD,
  PITCH,
  STAGE_GAP,
  type Dir,
  type Layout,
  type Placed,
  type Rect,
} from "./grid";

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
