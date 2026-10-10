// THE CAMERA, AS ARITHMETIC — what the viewport covers, what a zoom about a
// point becomes, where a fit or a reveal would put it.
//
// Pure, and deliberately so: the component owns the camera's STATE and writes it
// to the DOM, and every decision about where it should go is decided here where
// it can be read without a browser.

import { cardPos } from "./cells";
import { CARD_H, CARD_W, FRAME, ZOOM_MAX, ZOOM_MIN, type Camera, type Layout, type Rect } from "./grid";

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
  const avail = w - FRAME.left - FRAME.insetX * 2;
  const k = clampK(Math.min(avail / Math.max(1, l.width), 1));
  return { k, x: FRAME.left + FRAME.insetX, y: FRAME.top + FRAME.insetY };
}

/** Everything in view at once. */
export function fitCamera(l: Layout, w: number, h: number): Camera {
  const availW = w - FRAME.left - FRAME.insetX * 2;
  const availH = h - FRAME.top - FRAME.insetY * 2;
  const k = clampK(Math.min(availW / Math.max(1, l.width), availH / Math.max(1, l.height), 1));
  // centred across the open width, so a narrow board is not pressed into a corner
  return { k, x: FRAME.left + FRAME.insetX + Math.max(0, (availW - l.width * k) / 2), y: FRAME.top + FRAME.insetY };
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
