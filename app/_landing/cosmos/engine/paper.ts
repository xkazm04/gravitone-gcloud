// The paper: grain, path builders, and the sheet itself (shadow, grain, lit
// edge). Pure paint: every function takes a 2D context and touches no DOM, so
// it can run on an OffscreenCanvas in a worker (Path2D and DOMMatrix exist
// there too).

import { GRAIN_INK, PAPER_INK } from "./inks";
import { RNG, TAU, type Rand } from "./rng";

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type Pt = [number, number];

/* ---------- grain ---------- */
export const GRAIN_N = 192;

/** paints the grain tile (noise plus fibre strokes) */
export function paintGrain(x: Ctx2D, N = GRAIN_N): void {
  const img = x.createImageData(N, N),
    r = RNG(7771);
  for (let i = 0; i < N * N; i++) {
    const dark = r() < 0.5,
      a = r() * r() * 54;
    const v = dark ? 30 : 255;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = dark ? 20 : 250;
    img.data[i * 4 + 2] = dark ? 30 : 240;
    img.data[i * 4 + 3] = a;
  }
  x.putImageData(img, 0, 0);
  x.lineCap = "round";
  for (let i = 0; i < 110; i++) {
    const px = r() * N,
      py = r() * N,
      a = r() * TAU,
      l = 5 + r() * 13;
    x.strokeStyle = r() < 0.5 ? GRAIN_INK.light : GRAIN_INK.dark;
    x.lineWidth = 0.8;
    x.beginPath();
    x.moveTo(px, py);
    x.quadraticCurveTo(px + Math.cos(a + 0.6) * l * 0.5, py + Math.sin(a + 0.6) * l * 0.5, px + Math.cos(a) * l, py + Math.sin(a) * l);
    x.stroke();
  }
}

let grainSrc: CanvasImageSource | null = null;
const patterns = new WeakMap<Ctx2D, CanvasPattern | null>();
/** registers the grain tile every paper() fill repeats */
export function setGrainSource(src: CanvasImageSource): void {
  grainSrc = src;
}
export function gp(ctx: Ctx2D): CanvasPattern | string {
  let p = patterns.get(ctx);
  if (p === undefined) {
    p = grainSrc ? ctx.createPattern(grainSrc, "repeat") : null;
    patterns.set(ctx, p);
  }
  return p ?? "transparent";
}

/* ---------- path builders ---------- */
export function circ(x: number, y: number, r: number): Path2D {
  const p = new Path2D();
  p.arc(x, y, r, 0, TAU);
  return p;
}
export function ell(x: number, y: number, rx: number, ry: number, rot?: number): Path2D {
  const p = new Path2D();
  p.ellipse(x, y, rx, ry, rot || 0, 0, TAU);
  return p;
}
export function poly(pts: Pt[]): Path2D {
  const p = new Path2D();
  for (let i = 0; i < pts.length; i++) {
    if (i) p.lineTo(pts[i][0], pts[i][1]);
    else p.moveTo(pts[i][0], pts[i][1]);
  }
  p.closePath();
  return p;
}
export function rrect(x: number, y: number, w: number, h: number, rad: number): Path2D {
  const p = new Path2D();
  p.roundRect(x, y, w, h, rad);
  return p;
}
export interface Xf {
  tx?: number;
  ty?: number;
  rot?: number;
  s?: number;
  sx?: number;
  sy?: number;
}
export function xf(path: Path2D, o: Xf): Path2D {
  const m = new DOMMatrix();
  if (o.tx || o.ty) m.translateSelf(o.tx || 0, o.ty || 0);
  if (o.rot) m.rotateSelf(o.rot);
  m.scaleSelf(o.sx || o.s || 1, o.sy || o.s || 1);
  const p = new Path2D();
  p.addPath(path, m);
  return p;
}
export function merge(list: Path2D[]): Path2D {
  const p = new Path2D();
  list.forEach((q) => p.addPath(q));
  return p;
}
export function polar(fn: (t: number) => number, n: number, wob: number, r?: Rand | null): Path2D {
  const ph = r ? r() * TAU : 0,
    pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU;
    let rad = fn(t);
    if (wob) rad *= 1 + wob * Math.sin(t * 3 + ph) + wob * 0.5 * Math.sin(t * 7 + ph * 2);
    pts.push([Math.cos(t) * rad, Math.sin(t) * rad]);
  }
  return poly(pts);
}
export function ridge(x0: number, x1: number, base: number, amp: number, r: Rand, bottom: number, step?: number): Path2D {
  step = step || 6;
  const f: [number, number, number][] = [];
  for (let i = 0; i < 3; i++) f.push([((1 + i * 1.7 + r() * 1.2) / (x1 - x0)) * TAU, r() * TAU, (amp / (1 + i * 0.9)) * (0.6 + r() * 0.7)]);
  const pts: Pt[] = [];
  for (let x = x0; x <= x1 + step; x += step) {
    let y = base;
    for (const q of f) y += Math.sin(x * q[0] + q[1]) * q[2];
    pts.push([x, y]);
  }
  pts.push([x1 + step, bottom], [x0, bottom]);
  return poly(pts);
}
export function wave(x0: number, x1: number, base: number, amp: number, period: number, ph: number, bottom: number): Path2D {
  const pts: Pt[] = [];
  for (let x = x0; x <= x1 + 4; x += 4) pts.push([x, base + Math.sin((x / period) * TAU + ph) * amp]);
  pts.push([x1 + 4, bottom], [x0, bottom]);
  return poly(pts);
}
/** torn paper: a jittered polyline */
export function tornEdge(x0: number, x1: number, y: number, amp: number, r: Rand, bottom: number, step?: number): Path2D {
  step = step || 4;
  const pts: Pt[] = [];
  let o = 0;
  for (let x = x0; x <= x1 + step; x += step) {
    o = o * 0.55 + (r() - 0.5) * amp * 1.6;
    pts.push([x, y + o + Math.sin(x * 0.013 + 3) * amp * 0.6]);
  }
  pts.push([x1 + step, bottom], [x0, bottom]);
  return poly(pts);
}

/* ---------- the paper sheet: shadow, grain, lit edge ---------- */
export interface PaperOpts {
  /** elevation: the cast shadow's size */
  e?: number;
  /** shadow colour */
  sc?: string;
  a?: number;
  rim?: string;
  rimw?: number;
  /** grain alpha */
  g?: number;
  /** unlit: skip the lit and shaded edges */
  u?: number | boolean;
  /** edge offset */
  d?: number;
  /** lit-edge and shaded-edge alpha */
  hl?: number;
  sh?: number;
}
export function paper(ctx: Ctx2D, path: Path2D, color: string | CanvasGradient, o?: PaperOpts): void {
  o = o || {};
  const e = o.e || 0;
  ctx.save();
  if (e > 0) {
    ctx.shadowColor = o.sc || PAPER_INK.cast;
    ctx.shadowBlur = e * 1.5;
    ctx.shadowOffsetX = e * 0.55;
    ctx.shadowOffsetY = e * 0.8;
  }
  if (o.a != null) ctx.globalAlpha = o.a;
  if (o.rim) {
    ctx.lineJoin = "round";
    ctx.lineWidth = o.rimw || 2.4;
    ctx.strokeStyle = o.rim;
    ctx.stroke(path);
  }
  ctx.fillStyle = color;
  ctx.fill(path);
  ctx.restore();
  ctx.save();
  ctx.clip(path);
  ctx.globalAlpha = o.g == null ? 1 : o.g;
  ctx.fillStyle = gp(ctx);
  ctx.fill(path);
  ctx.globalAlpha = 1;
  if (o.u) {
    ctx.restore();
    return;
  }
  const d = o.d || Math.max(0.9, e * 0.2);
  const b1 = new Path2D();
  b1.rect(-2e4, -2e4, 4e4, 4e4);
  b1.addPath(path, new DOMMatrix([1, 0, 0, 1, d, d]));
  ctx.fillStyle = PAPER_INK.lit(o.hl == null ? 0.26 : o.hl);
  ctx.fill(b1, "evenodd");
  const b2 = new Path2D();
  b2.rect(-2e4, -2e4, 4e4, 4e4);
  b2.addPath(path, new DOMMatrix([1, 0, 0, 1, -d * 0.8, -d * 0.8]));
  ctx.fillStyle = PAPER_INK.shade(o.sh == null ? 0.12 : o.sh);
  ctx.fill(b2, "evenodd");
  ctx.restore();
}
export function vgrad(ctx: Ctx2D, y0: number, y1: number, c0: string, c1: string): CanvasGradient {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, c0);
  g.addColorStop(1, c1);
  return g;
}
/** a motif's backdrop: a vertical gradient sheet with grain */
export function bg(ctx: Ctx2D, R: number, c0: string, c1: string): void {
  ctx.save();
  ctx.fillStyle = vgrad(ctx, -R, R, c0, c1);
  ctx.fillRect(-R * 2, -R * 2, R * 4, R * 4);
  ctx.fillStyle = gp(ctx);
  ctx.globalAlpha = 0.9;
  ctx.fillRect(-R * 2, -R * 2, R * 4, R * 4);
  ctx.restore();
}
