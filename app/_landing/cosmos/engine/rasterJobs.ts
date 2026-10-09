// RASTER JOBS: the one description of "paint these pixels" that both raster
// paths run. A job is plain data (numbers, strings, the family record), so it
// can cross into the worker by structured clone; the runner here turns it into
// pixels with the pure paint modules and nothing else. No DOM: the caller hands
// in a factory that makes a canvas (OffscreenCanvas in the worker, a canvas
// element on the main-thread fallback), so the two paths cannot drift apart.
//
// A job is a list of LAYERS, each one canvas w x h CSS pixels at raster scale
// rs; a layer is a list of OPS, each one paint call under an optional affine
// transform in CSS pixels. One op per layer is a `full` depth plane; many ops
// with their planes' offsets folded into the transforms is a `lite` depth band
// or the `still` scene. That is the whole of "flattening": the same paint calls
// in the same order onto fewer canvases.

import type { GalaxyFamily } from "../types";
import { drawDiorama, drawTray, paintReam, type DioramaOpts } from "./diorama";
import { drawMedal, specOf } from "./medal";
import { palette } from "./palette";
import { gp, type Ctx2D } from "./paper";
import { RNG, type Rand } from "./rng";
import {
  paintClouds,
  paintCore,
  paintDiscSheet,
  paintFloor,
  paintRidge,
  paintSky,
  paintStars,
  paintWorldFloor,
  paintWorldMotif,
  paintWorldSky,
  type PlaneBox,
} from "./scenePaint";

/** an affine transform [a b c d e f], as DOMMatrix / setTransform order */
export type Mat = [number, number, number, number, number, number];

export const I: Mat = [1, 0, 0, 1, 0, 0];
export const mul = (p: Mat, q: Mat): Mat => [
  p[0] * q[0] + p[2] * q[1],
  p[1] * q[0] + p[3] * q[1],
  p[0] * q[2] + p[2] * q[3],
  p[1] * q[2] + p[3] * q[3],
  p[0] * q[4] + p[2] * q[5] + p[4],
  p[1] * q[4] + p[3] * q[5] + p[5],
];
export const tr = (x: number, y: number): Mat => [1, 0, 0, 1, x, y];
export const sc = (x: number, y: number): Mat => [x, 0, 0, y, 0, 0];

type OpBody =
  | { p: "sky"; b: PlaneBox; gx: number; gy: number; gr: number }
  | { p: "stars"; b: PlaneBox }
  | { p: "clouds"; cw: number; ch: number; H: number }
  /** seed null = the job's shared stream (a type's world draws all its planes from one) */
  | { p: "ridge"; b: PlaneBox; col: string; base: number; amp: number; seed: number | null; e: number; glow: number; glowCol: string }
  | { p: "disc"; j: number; J: number; Rj: number; arms: number }
  /** the lamp behind the sheets; `cols` are the stylesheet's own lamp tokens, read once on the main thread */
  | { p: "lamp"; sz: number; cols: [string, string, string] }
  /** the world's top haze (the stylesheet's #world::after), for a world flattened to one canvas */
  | { p: "haze"; w: number; h: number; col: string }
  /** the stylesheet's #grainov (grain and vignette over the scene), painted onto a
   *  band's own pixels; m puts the viewport's origin, lw x lh is the layer */
  | { p: "overlay"; W: number; H: number; lw: number; lh: number; col: string }
  | { p: "core"; cs: number; steps: number }
  | { p: "floor"; b: PlaneBox }
  | { p: "wsky"; b: PlaneBox; id: string; gx: number; gy: number }
  | { p: "wmotif"; Rm: number; id: string }
  | { p: "wfloor"; b: PlaneBox; id: string }
  | { p: "medal"; id: string; D: number }
  | { p: "ream"; f: GalaxyFamily; w: number; h: number; compact: boolean }
  | { p: "diorama"; w: number; h: number; id: string; parent: string; o: DioramaOpts | null }
  | { p: "tray"; w: number; h: number; id: string; locked: boolean };

export type Op = OpBody & { m?: Mat; alpha?: number };

export interface Layer {
  w: number;
  h: number;
  ops: Op[];
}
export interface Job {
  rs: number;
  /** hand the layers back as PNG files instead of bitmaps: for small art shown
   *  as <img>, which paints into its parent's layer where a canvas would be a
   *  compositor layer of its own */
  png?: boolean;
  /** hand each layer back as soon as it is painted (a world's sky before its ridges) */
  parts?: boolean;
  /** a stream shared by every op that asks for one; `skip` draws already taken on the main thread */
  rng?: { seed: number; skip: number };
  layers: Layer[];
}

/** "#rrggbb" + alpha as rgba(), for colours that arrive as hex tokens */
export function withAlpha(hex: string, a: number): string {
  const h = hex.trim().replace("#", "");
  const full = h.length === 3 ? h.replace(/./g, (x) => x + x) : h;
  const n = parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(n)) return hex;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** runs one op; returns a number when the paint reports one (the clouds' drift period) */
function runOp(c: Ctx2D, op: Op, shared: Rand | null): number | undefined {
  const r = (seed: number | null): Rand | number => (seed == null ? shared || RNG(0) : seed);
  switch (op.p) {
    case "sky":
      paintSky(c, op.b, op.gx, op.gy, op.gr);
      return;
    case "stars":
      paintStars(c, op.b);
      return;
    case "clouds":
      return paintClouds(c, op.cw, op.ch, op.H);
    case "ridge":
      paintRidge(c, op.b, op.col, op.base, op.amp, r(op.seed), op.e, op.glow, op.glowCol);
      return;
    case "disc":
      paintDiscSheet(c, op.j, op.J, op.Rj, op.arms);
      return;
    case "lamp": {
      // the stylesheet's `radial-gradient(closest-side, lamp 85%, lamp-2 40% 38%, lamp-3 0% 70%)`
      const R = op.sz / 2,
        g = c.createRadialGradient(0, 0, 0, 0, 0, R);
      g.addColorStop(0, withAlpha(op.cols[0], 0.85));
      g.addColorStop(0.38, withAlpha(op.cols[1], 0.4));
      g.addColorStop(0.7, withAlpha(op.cols[2], 0));
      g.addColorStop(1, withAlpha(op.cols[2], 0));
      c.fillStyle = g;
      c.beginPath();
      c.arc(0, 0, R, 0, Math.PI * 2);
      c.fill();
      return;
    }
    case "haze": {
      const g = c.createLinearGradient(0, 0, 0, op.h);
      g.addColorStop(0, withAlpha(op.col, 0.6));
      g.addColorStop(1, withAlpha(op.col, 0));
      c.fillStyle = g;
      c.fillRect(0, 0, op.w, op.h);
      return;
    }
    case "overlay": {
      // grain: the same tile the stylesheet repeats; vignette: its
      // `radial-gradient(ellipse at 50% 46%, transparent 55%, vignette 50%)`,
      // whose farthest-corner ellipse is the farthest-side one scaled by sqrt 2
      c.globalCompositeOperation = "source-atop";
      c.fillStyle = gp(c);
      c.fillRect(-op.lw, -op.lh, op.lw * 3, op.lh * 3);
      const rx = op.W * 0.5 * Math.SQRT2,
        ry = op.H * 0.54 * Math.SQRT2;
      c.translate(op.W * 0.5, op.H * 0.46);
      c.scale(rx / ry, 1);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, ry);
      g.addColorStop(0, withAlpha(op.col, 0));
      g.addColorStop(0.55, withAlpha(op.col, 0));
      g.addColorStop(1, withAlpha(op.col, 0.5));
      c.fillStyle = g;
      c.fillRect(-op.lw * 2, -op.lh * 2, op.lw * 4, op.lh * 4);
      return;
    }
    case "core":
      paintCore(c, op.cs, op.steps);
      return;
    case "floor":
      paintFloor(c, op.b);
      return;
    case "wsky":
      paintWorldSky(c, op.b, palette(op.id), op.gx, op.gy, shared || RNG(0));
      return;
    case "wmotif":
      paintWorldMotif(c, op.Rm, palette(op.id), specOf(op.id), shared || RNG(0));
      return;
    case "wfloor":
      paintWorldFloor(c, op.b, palette(op.id), shared || RNG(0));
      return;
    case "medal": {
      const spec = specOf(op.id);
      c.rotate((spec.tilt * Math.PI) / 180);
      drawMedal(c, op.D / 2, spec);
      return;
    }
    case "ream":
      paintReam(c, op.f, op.w, op.h, op.compact);
      return;
    case "diorama":
      drawDiorama(c, op.w, op.h, op.id, op.parent, op.o);
      return;
    case "tray":
      drawTray(c, op.w, op.h, palette(op.id), op.locked);
      return;
  }
}

export interface Made<S> {
  surface: S;
  ctx: Ctx2D;
}

/** paints one layer onto a fresh surface from `make`; `ret` collects what the ops reported */
export function paintLayer<S>(job: Job, li: number, make: (w: number, h: number) => Made<S>, shared: Rand | null, ret: number[]): S {
  const L = job.layers[li];
  const { surface, ctx } = make(Math.max(1, Math.ceil(L.w * job.rs)), Math.max(1, Math.ceil(L.h * job.rs)));
  // the grain is noise: sampled nearest it is the same paper, and a CPU canvas
  // fills a pattern several times faster without filtering it (measured: a
  // type's world 760 -> 455 ms in the worker)
  ctx.imageSmoothingEnabled = false;
  for (const op of L.ops) {
    ctx.save();
    ctx.setTransform(job.rs, 0, 0, job.rs, 0, 0);
    if (op.m) ctx.transform(op.m[0], op.m[1], op.m[2], op.m[3], op.m[4], op.m[5]);
    if (op.alpha != null) ctx.globalAlpha = op.alpha;
    const v = runOp(ctx, op, shared);
    if (typeof v === "number") ret.push(v);
    ctx.restore();
  }
  return surface;
}

/** the job's shared stream, advanced past the draws the main thread already took */
export function sharedRng(job: Job): Rand | null {
  if (!job.rng) return null;
  const r = RNG(job.rng.seed);
  for (let i = 0; i < job.rng.skip; i++) r();
  return r;
}
