// THE CAMERA - where the map is looked at from, and how it moves (port of the winner's map.js camera). The camera
// itself is `st.ui.cam` (world centre and zoom); the visible map is the canvas less what the sheet (right) and the
// desk (bottom) cover. A flight eases log-zoom and position over `dur` ms on the frame loop's clock; under reduced
// motion every flight lands at once. Flights live here, one per store, and never in the store's revision.

import { CAL_DAYS, CAL_X0, clamp, COAST_X, DAY_W, LH, LW, SRC_X, sx } from "../scene/geo.ts";
import type { Port, Scope } from "../scene/types.ts";
import type { Cam, CanvasStore } from "../store.ts";
import { LEVELS, levelOf, MAX_ZOOM, type LevelIx } from "../tables.ts";

type Flight = { readonly a: Cam; readonly b: Cam; readonly t0: number; readonly dur: number };
const flights = new WeakMap<CanvasStore, Flight>();

let rm: boolean | null = null;
/** The user asked for less motion (read once, as the prototype's RM). */
const still = (): boolean => {
  if (rm === null) rm = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  return rm;
};

/** A day's x on a port's release lane (world). */
export const calX = (p: Port, day: number): number => p.x + CAL_X0 + day * DAY_W;

export const vw = (st: CanvasStore): number => st.ui.W - st.ui.inset.r;
export const vh = (st: CanvasStore): number => st.ui.H - st.ui.inset.b;

export function fitZ(st: CanvasStore): number {
  const w = st.scene.world;
  return Math.max(0.02, Math.min((vw(st) - 40) / (w.x1 - w.x0), (vh(st) - 64) / (w.y1 - w.y0)));
}
export const minZ = (st: CanvasStore): number => fitZ(st) * 0.85;

export function toS(st: CanvasStore, x: number, y: number): [number, number] {
  const c = st.ui.cam;
  return [(x - c.x) * c.z + vw(st) / 2, (y - c.y) * c.z + vh(st) / 2];
}
export function toW(st: CanvasStore, px: number, py: number): [number, number] {
  const c = st.ui.cam;
  return [(px - vw(st) / 2) / c.z + c.x, (py - vh(st) / 2) / c.z + c.y];
}

export function clampCam(st: CanvasStore): void {
  const c = st.ui.cam;
  const w = st.scene.world;
  c.z = clamp(c.z, minZ(st), MAX_ZOOM);
  c.x = clamp(c.x, w.x0, w.x1);
  c.y = clamp(c.y, w.y0, w.y1);
}

const levelZ = (st: CanvasStore, L: LevelIx): number => {
  const z = LEVELS[L].z;
  return z === null ? fitZ(st) : z;
};

export function stopFlight(st: CanvasStore): void {
  flights.delete(st);
}

export function flyTo(st: CanvasStore, x: number, y: number, z: number, dur = 700): void {
  const tz = clamp(z, minZ(st), MAX_ZOOM);
  if (still()) {
    Object.assign(st.ui.cam, { x, y, z: tz });
    clampCam(st);
    return;
  }
  flights.set(st, { a: { ...st.ui.cam }, b: { x, y, z: tz }, t0: performance.now(), dur });
}

export function flyBox(st: CanvasStore, x0: number, y0: number, x1: number, y1: number, maxZ = 3, minZoom = 0): void {
  const w = vw(st) - 80;
  const h = vh(st) - 120;
  flyTo(st, (x0 + x1) / 2, (y0 + y1) / 2, clamp(Math.min(w / Math.max(40, x1 - x0), h / Math.max(40, y1 - y0)), minZoom || minZ(st), maxZ));
}

export function stepFlight(st: CanvasStore, now: number): void {
  const f = flights.get(st);
  if (f === undefined) return;
  const t = clamp((now - f.t0) / f.dur, 0, 1);
  const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const c = st.ui.cam;
  c.z = Math.exp(Math.log(f.a.z) + (Math.log(f.b.z) - Math.log(f.a.z)) * e);
  c.x = f.a.x + (f.b.x - f.a.x) * e;
  c.y = f.a.y + (f.b.y - f.a.y) * e;
  if (t >= 1) flights.delete(st);
}

export function home(st: CanvasStore): void {
  const w = st.scene.world;
  flyTo(st, (w.x0 + w.x1) / 2, (w.y0 + w.y1) / 2, fitZ(st));
}

export function goLevel(st: CanvasStore, L: LevelIx): void {
  if (L === 0) home(st);
  else flyTo(st, st.ui.cam.x, st.ui.cam.y, levelZ(st, L), 550);
}

export function levelUp(st: CanvasStore): void {
  const L = levelOf(st.ui.cam.z);
  if (L === 0) home(st);
  else goLevel(st, (L - 1) as LevelIx);
}

/**
 * Zoom by `factor`. With a pointer position (canvas px) the zoom is immediate and keeps the world point under it
 * still (the wheel); without one it is the 300 ms flight the zoom keys and the ladder's - / + take.
 */
export function zoomBy(st: CanvasStore, factor: number, atPx?: [number, number]): void {
  const c = st.ui.cam;
  if (atPx === undefined) {
    flyTo(st, c.x, c.y, c.z * factor, 300);
    return;
  }
  stopFlight(st);
  const [wx, wy] = toW(st, atPx[0], atPx[1]);
  c.z = clamp(c.z * factor, minZ(st), MAX_ZOOM);
  const [nx, ny] = toW(st, atPx[0], atPx[1]);
  c.x += wx - nx;
  c.y += wy - ny;
  clampCam(st);
}

/** Pan by world units (the arrow keys pan 120 screen px: `pan(st, 120 / cam.z, 0)`). */
export function pan(st: CanvasStore, dx: number, dy: number): void {
  const c = st.ui.cam;
  c.x += dx;
  c.y += dy;
  clampCam(st);
}

/** Fly to a place, framed by what it is. */
export function locate(st: CanvasStore, s: Scope): void {
  const z = st.ui.cam.z;
  switch (s.type) {
    case "item":
      flyTo(st, s.ref.x + LW / 2, s.ref.y + LH / 2, Math.max(z, 4.8));
      return;
    case "town": {
      const r = s.ref;
      flyBox(st, r.bx - 40, r.by - 50, r.bx + r.bw + 40, r.by + r.bh + 40, 3.2, 2.2);
      return;
    }
    case "river":
      flyBox(st, SRC_X - 60, s.ref.y0 - 60, COAST_X + 300, s.ref.y0 + s.ref.h + 60, 1.4, 0.55);
      return;
    case "basin":
      flyBox(st, -40, s.ref.y0, COAST_X + 400, s.ref.y1, 2);
      return;
    case "prov":
      flyBox(st, -40, s.ref.y0 - 20, COAST_X + 300, s.ref.y1, 2);
      return;
    case "bundle":
      flyBox(st, SRC_X - 60, s.ref.y0 - 30, sx(2.4), s.ref.y1 + 30, 2);
      return;
    case "port":
      flyBox(st, s.ref.x - 260, s.ref.y - 110, calX(s.ref, CAL_DAYS) + 40, s.ref.y + 110, 2.4, 0.9);
      return;
    case "ship":
      flyTo(st, s.ref.x + 14, s.ref.y + 5, Math.max(z, 5));
      return;
    case "all":
      return;
  }
}
