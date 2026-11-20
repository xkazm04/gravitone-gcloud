// WHAT THE RENDERER KEEPS BETWEEN FRAMES, per store and never in the store's revision: the Path2D of every river's
// water (rebuilt when a verdict gives the river new points), the land's paths, the particles that run on the recent
// rivers, the hover as the canvas knows it (a slot and the night cloud are hits the store's Hit has no word for), the
// rivers' name boxes the hit test reads back, and the listeners that draw after each frame (the minimap).

import type { CanvasSlot } from "../../_port/contract.ts";
import { sx } from "../scene/geo.ts";
import type { Hit, Land, Pt, River, RiverPt } from "../scene/types.ts";
import type { CanvasStore } from "../store.ts";

/** A hit as the canvas draws and tests it: a store Hit, the next night's cloud, or a slot on a release lane. */
export type MapHit = Hit | { readonly type: "night" } | { readonly type: "slot"; readonly ref: CanvasSlot };
/** A screen-space hit box registered while drawing (pills, titles, chips, the cloud, note flags). */
export type Hot = { readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly hit: MapHit };
export type Box = [number, number, number, number];
export type Particle = { readonly r: River; u: number; readonly v: number };

type RenderState = {
  readonly particles: Particle[];
  /** The hover as the canvas set it, and the store Hit it set beside it (another writer wins). */
  hoverX: MapHit | null;
  hoverHit: Hit | null;
  readonly riverLbl: Map<River, Box>;
  readonly frameSubs: Set<(now: number) => void>;
  camInit: boolean;
};

const states = new WeakMap<CanvasStore, RenderState>();

export function rs(st: CanvasStore): RenderState {
  let s = states.get(st);
  if (s === undefined) {
    const particles: Particle[] = [];
    for (const r of st.scene.rivers) {
      if (r.recent > 0 && r.pts.length > 4 && r.reach >= 0) {
        const k = 3 + Math.min(9, r.recent);
        for (let i = 0; i < k; i++) particles.push({ r, u: Math.random(), v: 0.05 + Math.random() * 0.05 });
      }
    }
    s = { particles, hoverX: null, hoverHit: null, riverLbl: new Map(), frameSubs: new Set(), camInit: false };
    states.set(st, s);
  }
  return s;
}

/** The hover the frame draws: the canvas's own, unless something else has since set the store's. */
export function hoverOf(st: CanvasStore): MapHit | null {
  const s = rs(st);
  return s.hoverHit === st.ui.hover ? s.hoverX : st.ui.hover;
}

/** Run `f` after every drawn frame; answers the unsubscribe. */
export function onFrame(st: CanvasStore, f: (now: number) => void): () => void {
  const subs = rs(st).frameSubs;
  subs.add(f);
  return () => {
    subs.delete(f);
  };
}

/* ---------- paths, built once per river build ---------- */

export type RiverPaths = { readonly pts: RiverPt[]; readonly body: Path2D; readonly line: Path2D; readonly dry: Path2D | null; readonly canal: Path2D | null };
const riverCache = new WeakMap<River, RiverPaths>();

export function riverPaths(r: River): RiverPaths {
  const hit = riverCache.get(r);
  if (hit !== undefined && hit.pts === r.pts) return hit;
  const pts = r.pts;
  const body = new Path2D();
  const line = new Path2D();
  const p0 = pts[0];
  if (pts.length > 1 && p0 !== undefined) {
    body.moveTo(p0.x, p0.y - p0.w / 2);
    for (const p of pts) body.lineTo(p.x, p.y - p.w / 2);
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      if (p !== undefined) body.lineTo(p.x, p.y + p.w / 2);
    }
    body.closePath();
    line.moveTo(p0.x, p0.y);
    for (const p of pts) line.lineTo(p.x, p.y);
  }
  let dry: Path2D | null = null;
  if (r.dryPts !== null) {
    dry = new Path2D();
    r.dryPts.forEach(([x, y], i) => (i === 0 ? dry?.moveTo(x, y) : dry?.lineTo(x, y)));
  }
  let canal: Path2D | null = null;
  if (r.canal !== null) {
    const c = r.canal;
    canal = new Path2D();
    canal.moveTo(c.from[0], c.from[1]);
    canal.bezierCurveTo(c.c1[0], c.c1[1], c.c2[0], c.c2[1], c.to[0], c.to[1]);
  }
  const out = { pts, body, line, dry, canal };
  riverCache.set(r, out);
  return out;
}

export type LandPaths = { readonly land: Path2D; readonly contours: Path2D; readonly isolines: Path2D };
const landCache = new WeakMap<Land, LandPaths>();

/* The winner opened each contour at its unshifted x (x0, top + 10) before the first sine point, and each isoline at
   sx(i); scene/geometry.ts keeps only the sine points, so the opening point is restored here from the same constants. */
const CONTOUR_X0 = [-120, -60, 0, 60, 120];
const ISOLINE_I = [0.5, 1.5, 2.5, 3.5, 4.5, 5.4, 6.1];

const polyInto = (p: Path2D, line: readonly Pt[], start: number | undefined): void => {
  const first = line[0];
  if (first === undefined) return;
  if (start !== undefined) p.moveTo(start, first[1]);
  else p.moveTo(first[0], first[1]);
  for (const [x, y] of line) p.lineTo(x, y);
};

export function landPaths(l: Land): LandPaths {
  const hit = landCache.get(l);
  if (hit !== undefined) return hit;
  const land = new Path2D();
  l.outline.forEach(([x, y], i) => (i === 0 ? land.moveTo(x, y) : land.lineTo(x, y)));
  land.closePath();
  const contours = new Path2D();
  l.contours.forEach((line, k) => polyInto(contours, line, CONTOUR_X0[k]));
  const isolines = new Path2D();
  l.isolines.forEach((line, k) => {
    const i = ISOLINE_I[k];
    polyInto(isolines, line, i === undefined ? undefined : sx(i));
  });
  const out = { land, contours, isolines };
  landCache.set(l, out);
  return out;
}
