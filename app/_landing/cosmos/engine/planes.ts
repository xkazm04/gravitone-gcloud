// PLANES: the shared vocabulary of the scene's plane specs. A spec is a plane's
// depth, its camera-push numbers (PlaneOpts) and its items (Item: a box, the paint
// ops and the live transform). This file owns the spec types, the helpers every
// builder uses to make items, the band fold that lite and still use, and the
// DOM helpers that place a plane or a painted item on the stack. It is separate
// so the scene's spec (sceneSpec.ts), the overview's builder (scene.ts) and a
// world's builder (worlds.ts) can share one definition without importing each other.

import { WORLD_PAPER_COSMOS } from "@/components/ui/tokens";

import { el } from "./dom";
import { I, mul, tr, type Mat, type Op } from "./rasterJobs";
import type { PlaneBox } from "./scenePaint";
import type { Cx, Plane } from "./state";

/* ---------- specs ---------- */
export interface PlaneOpts {
  sk?: number;
  so?: number;
  pd?: number;
  sf?: number;
  sfo?: number;
}
export interface Item {
  /** viewport CSS px */
  x: number;
  y: number;
  w: number;
  h: number;
  ops: Op[];
  /** the transform the full design applies to this item live, about its centre (baked at rest elsewhere) */
  bake?: Mat;
  /** full only: the canvas's classes and inline style (idle motions and their variables) */
  cls?: string;
  css?: Record<string, string>;
  aria?: string;
  /** full only: drawn by the stylesheet as a div, not painted */
  lamp?: boolean;
}
export interface PlaneSpec {
  name: string;
  d: number;
  o: PlaneOpts;
  items: Item[];
  /** the DOM layer of buttons this plane carries */
  host?: "medals" | "reams";
}

export function box(cx: Cx): PlaneBox {
  const { W, H, portrait } = cx.g;
  const M = Math.round(W * 0.045);
  return { W, H, M, pw: W + 2 * M, ph: H + 2 * M, portrait };
}
export const full = (b: PlaneBox, ops: Op[]): Item => ({ x: -b.M, y: -b.M, w: b.pw, h: b.ph, ops });

/** a stylesheet token's colour, for paint that stands in for a CSS rule (the
 *  lamp, the world's haze, the grain overlay's vignette): read from the one
 *  table the stylesheet's own --pc-* vars come from, never from the DOM, which
 *  would cost a style recalc in the middle of a build */
export const token = (_cx: Cx, name: string): string => WORLD_PAPER_COSMOS[name];
export const lampCols = (cx: Cx): [string, string, string] => [token(cx, "--pc-lamp"), token(cx, "--pc-lamp-2"), token(cx, "--pc-lamp-3")];


/** which band each full plane folds into, per tier, and the band's own depth and push */
const BANDS: Record<"lite" | "still", { name: string; d: number; o: PlaneOpts; planes: string[] }[]> = {
  lite: [
    { name: "back", d: 0.08, o: { sk: 1.05, so: 1, pd: 0.2 }, planes: ["sky", "stars", "clouds", "far"] },
    {
      name: "mid",
      d: 0.32,
      o: { sk: 1.45, so: 1, pd: 0.1 },
      planes: ["disc0", "disc1", "disc2", "disc3", "disc4", "disc5", "disc6", "core", "midA", "medals"],
    },
    { name: "front", d: 0.9, o: { sk: 2.3, so: 0, pd: 0 }, planes: ["front", "floor", "reams"] },
  ],
  still: [{ name: "all", d: 0, o: { sk: 1, so: 1, pd: 0 }, planes: [] }],
};

/** how far down a full-plane op starts painting (plane px), or 0 when it may paint anywhere */
function opTop(op: Op): number {
  if (op.p === "ridge") return (op.base - 2.6 * op.amp) * op.b.H + op.b.M - op.glow - op.e * 1.5 - 8;
  if (op.p === "floor") return (op.b.portrait ? 0.985 : 0.972) * op.b.H + op.b.M - 24;
  return 0;
}

/** folds specs into bands: each item's ops move into the band canvas's coordinates.
 *  A band that paints only low on the plane (the front ridge and the floor) gets a
 *  canvas cropped to where it paints: a software compositor draws every pixel of
 *  a canvas each frame, transparent or not. */
export function fold(specs: PlaneSpec[], tier: "lite" | "still", b: PlaneBox, vignette: string): PlaneSpec[] {
  return BANDS[tier].map((band) => {
    const mine = specs.filter((s) => !band.planes.length || band.planes.includes(s.name));
    const ops: Op[] = [];
    let aria: string | undefined,
      top = Infinity;
    for (const s of mine)
      for (const it of s.items) {
        const place = mul(tr(it.x + b.M, it.y + b.M), it.bake ? mul(tr(it.w / 2, it.h / 2), mul(it.bake, tr(-it.w / 2, -it.h / 2))) : I);
        for (const op of it.ops) {
          ops.push({ ...op, m: mul(place, op.m || I) });
          const t = opTop(op);
          top = Math.min(top, t > 0 ? it.y + b.M + t : 0);
        }
        aria = aria || it.aria;
      }
    top = Number.isFinite(top) ? Math.max(0, Math.floor(top)) : 0;
    const hosts = mine.map((s) => s.host).filter((h): h is NonNullable<PlaneSpec["host"]> => !!h);
    const item: Item = top
      ? { x: -b.M, y: -b.M + top, w: b.pw, h: b.ph - top, ops: ops.map((op) => ({ ...op, m: mul(tr(0, -top), op.m || I) })), aria }
      : { ...full(b, ops), aria };
    // the grain-and-vignette overlay, on this band's own pixels: one less
    // full-viewport layer for a software compositor to blend every frame
    item.ops.push({ p: "overlay", W: b.W, H: b.H, lw: item.w, lh: item.h, col: vignette, m: tr(b.M, b.M - top) });
    return { name: band.name, d: band.d, o: band.o, items: [item], hosts } as PlaneSpec & { hosts: PlaneSpec["host"][] };
  });
}

/* ---------- planes ---------- */
export function addPlane(host: HTMLElement, list: Plane[], name: string, d: number, o?: PlaneOpts): Plane {
  o = o || {};
  const pl = el("div", "pl", host),
    pp = el("div", "pp", pl);
  const p: Plane = { name, d, pl, pp };
  list.push(p);
  pl.dataset.plane = name;
  pp.style.setProperty("--sk", String(o.sk == null ? 1 + d * 1.3 : o.sk));
  pp.style.setProperty("--so", String(o.so == null ? 0 : o.so));
  pp.style.setProperty("--pd", (o.pd || 0) + "s");
  if (o.sf) pp.style.setProperty("--sf", String(o.sf));
  if (o.sfo != null) pp.style.setProperty("--sfo", String(o.sfo));
  return p;
}

/** the raster scale of the soft layers: paper has no hairlines, so never above 1 */
export const softRS = (cx: Cx) => Math.min(cx.g.RS, 1);

/** places a painted item on its plane (full: with its live classes and styles) */
export function placeItem(p: Plane, it: Item, cv: HTMLCanvasElement, live: boolean): void {
  cv.className = "cv" + (live && it.cls ? " " + it.cls : "");
  cv.style.left = it.x + "px";
  cv.style.top = it.y + "px";
  if (live && it.css) for (const [k, v] of Object.entries(it.css)) cv.style.setProperty(k, v);
  if (it.aria) {
    cv.setAttribute("role", "img");
    cv.setAttribute("aria-label", it.aria);
  }
  p.pp.appendChild(cv);
}


export function foldItems(specs: PlaneSpec[], b: PlaneBox): Item[] {
  const ops: Op[] = [];
  for (const s of specs)
    for (const it of s.items) {
      const place = tr(it.x + b.M, it.y + b.M);
      for (const op of it.ops) ops.push({ ...op, m: mul(place, op.m || I) });
    }
  return [full(b, ops)];
}
