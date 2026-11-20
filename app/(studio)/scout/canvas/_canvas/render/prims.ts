// THE DRAWING PRIMITIVES - one per mark the map repeats (port of the winner's map.js primitives): a rounded rect, a
// collision-placed label with an ink halo, word wrap, a glyph from the same path data the DOM uses, the weir pill
// (amber = waits on the operator, cyan = its jobs are running), the kept / waiting / dead stack bar, a lot's picture.
// Every colour and font comes from the palette (../tokens.ts). A Frame is what one draw pass shares.

import { GLYPHS } from "../glyphs.ts";
import { itemsUnder } from "../scene/scopes.ts";
import { clamp, sum } from "../scene/geo.ts";
import type { Item, Port, Scene, Scope, Town } from "../scene/types.ts";
import type { CanvasStore } from "../store.ts";
import type { Palette } from "../tokens.ts";
import { BLOCK, LEVELS, STAGE_NAME, STAGES, STATE, type BlockKind, type GlyphName, type ItemState, type LevelIx, type Lens } from "../tables.ts";
import type { Box, Hot, MapHit } from "./state.ts";

export const TAU = Math.PI * 2;
export const Z = { basin: LEVELS[1].from, town: LEVELS[2].from, street: LEVELS[3].from } as const;

export type Frame = {
  readonly st: CanvasStore;
  readonly s: Scene;
  readonly ctx: CanvasRenderingContext2D;
  readonly pal: Palette;
  readonly now: number;
  readonly z: number;
  readonly L: LevelIx;
  readonly W: number;
  readonly H: number;
  readonly vis: (x0: number, y0: number, x1: number, y1: number) => boolean;
  readonly view: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number };
  readonly revealX: number;
  readonly kBlock: number;
  readonly kCard: number;
  readonly kCircle: number;
  readonly kCont: number;
  readonly hover: MapHit | null;
  readonly boxes: Box[];
  readonly hot: Hot[];
};

export const font = (pal: Palette, size: number, fam: "sans" | "mono" | "serif", w = ""): string => (w !== "" ? `${w} ` : "") + `${size}px ${pal.font[fam]}`;

export const stateC = (pal: Palette, s: ItemState): string => pal.c[STATE[s].tone];
export const stageName = (si: number): string => {
  const st = STAGES[si];
  return st === undefined ? "" : STAGE_NAME[st];
};

/** `h` points at `x` (its ref is x). */
export const isRef = (h: MapHit | null, x: unknown): boolean => h !== null && "ref" in h && h.ref === x;

type LensItem = { readonly state: ItemState; readonly at: string; readonly block?: BlockKind | null };
export function lensOk(lens: Lens, latest: string, it: LensItem): boolean {
  if (lens === null) return true;
  if (lens === "night") return it.at === latest;
  if (lens === "waits") return it.block !== undefined && it.block !== null;
  if (lens === "dead") return it.state === "failed" || it.state === "rejected" || it.state === "thrown";
  if (lens === "open") return it.state === "open" || it.state === "made";
  return it.state === lens;
}
export const lensOkF = (f: Frame, it: LensItem): boolean => lensOk(f.st.ui.lens, f.s.latest, it);

export function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function place(f: Frame, x: number, y: number, w: number, h: number): boolean {
  for (const b of f.boxes) if (x < b[0] + b[2] && x + w > b[0] && y < b[1] + b[3] && y + h > b[1]) return false;
  f.boxes.push([x, y, w, h]);
  return true;
}

export type TextOpt = { readonly h?: number; readonly align?: "center" | "right"; readonly force?: boolean; readonly pad?: number };
/** Label: screen-space text with an ink halo, placed only where nothing else sits. Answers its width, 0 when not placed. */
export function text(f: Frame, s: string, x: number, y: number, fnt: string, color: string, opt: TextOpt = {}): number {
  const { ctx } = f;
  ctx.font = fnt;
  const w = ctx.measureText(s).width;
  const h = opt.h ?? 14;
  const ax = opt.align === "center" ? x - w / 2 : opt.align === "right" ? x - w : x;
  if (opt.force !== true && !place(f, ax - 3, y - h + 2, w + 6 + (opt.pad ?? 0), h + 4)) return 0;
  ctx.lineJoin = "round";
  ctx.lineWidth = 4;
  ctx.strokeStyle = f.pal.c.ink;
  ctx.strokeText(s, ax, y);
  ctx.fillStyle = color;
  ctx.fillText(s, ax, y);
  return w;
}

const wrapCache = new Map<string, string[]>();
export function wrap(ctx: CanvasRenderingContext2D, s: string, maxW: number, maxL: number, fnt: string): string[] {
  const key = `${s}|${Math.round(maxW / 6)}|${maxL}`;
  const hit = wrapCache.get(key);
  if (hit !== undefined) return hit;
  ctx.font = fnt;
  const words = s.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur !== "" ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width <= maxW) cur = t;
    else {
      if (cur !== "") lines.push(cur);
      cur = w;
      if (lines.length === maxL) break;
    }
  }
  if (lines.length < maxL && cur !== "") lines.push(cur);
  const lastLine = lines[maxL - 1];
  if (lines.length === maxL && lastLine !== undefined && lines.join(" ").length < s.length) {
    let l = lastLine;
    while (l.length > 1 && ctx.measureText(`${l}…`).width > maxW) l = l.slice(0, -1);
    lines[maxL - 1] = `${l}…`;
  }
  wrapCache.set(key, lines);
  if (wrapCache.size > 6000) wrapCache.clear();
  return lines;
}

/* Glyph: the same 16 x 16 path data the DOM uses. */
let glyphPaths: Map<GlyphName, { s: Path2D | null; f: Path2D | null }> | null = null;
export function glyph(ctx: CanvasRenderingContext2D, k: GlyphName, cx: number, cy: number, size: number, col: string): void {
  if (glyphPaths === null) {
    glyphPaths = new Map();
    for (const [name, g] of Object.entries(GLYPHS) as [GlyphName, (typeof GLYPHS)[GlyphName]][]) glyphPaths.set(name, { s: g.s !== undefined ? new Path2D(g.s) : null, f: g.f !== undefined ? new Path2D(g.f) : null });
  }
  const g = glyphPaths.get(k);
  if (g === undefined) return;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / 16, size / 16);
  ctx.strokeStyle = col;
  ctx.fillStyle = col;
  ctx.lineWidth = 1.8;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (g.s !== null) ctx.stroke(g.s);
  if (g.f !== null) ctx.fill(g.f);
  ctx.restore();
}

const sameScope = (a: Scope, b: Scope): boolean => a.type === b.type && ("ref" in a && "ref" in b ? a.ref === b.ref : true);
const sameHit = (h: MapHit | null, k: BlockKind, sc: Scope): boolean => h !== null && h.type === "block" && h.kind === k && sameScope(h.scope, sc);

export type PillOpt = { readonly align?: "right" | "center"; readonly word?: boolean; readonly alpha?: number; readonly busy?: boolean; readonly test?: boolean };
/** Pill: a weir. Screen space; registers its own hit box. Answers its width (0 when `test` found no room). */
export function pill(f: Frame, x: number, y: number, kind: BlockKind, n: number, scope: Scope, o: PillOpt = {}): number {
  const { ctx, pal } = f;
  const label = String(n) + (o.word === true ? ` ${BLOCK[kind].name.toLowerCase()}` : "");
  ctx.font = font(pal, 12, "mono", "600");
  const w = Math.ceil(ctx.measureText(label).width) + 31;
  const h = 20;
  const ax = o.align === "right" ? x - w : o.align === "center" ? x - w / 2 : x;
  const ay = y - h / 2;
  if (o.test === true && !place(f, ax - 2, ay - 2, w + 4, h + 4)) return 0;
  if (o.test !== true) f.boxes.push([ax - 2, ay - 2, w + 4, h + 4]);
  const hov = sameHit(f.hover, kind, scope);
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.fillStyle = pal.c.ink;
  rr(ctx, ax - 1.5, ay - 1.5, w + 3, h + 3, 11.5);
  ctx.fill();
  ctx.fillStyle = o.busy === true ? pal.c.cyan : hov ? pal.c["wall-hi"] : pal.c.amber;
  rr(ctx, ax, ay, w, h, 10);
  ctx.fill();
  glyph(ctx, BLOCK[kind].glyph, ax + 13, y, 12, pal.c.ink);
  ctx.fillStyle = pal.c.ink;
  ctx.textBaseline = "middle";
  ctx.fillText(label, ax + 23, y + 0.5);
  ctx.textBaseline = "alphabetic";
  if (hov) {
    ctx.strokeStyle = pal.c["ink-bright"];
    ctx.lineWidth = 1.5;
    rr(ctx, ax - 2.5, ay - 2.5, w + 5, h + 5, 12.5);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  f.hot.push({ x: ax - 3, y: ay - 3, w: w + 6, h: h + 6, hit: { type: "block", kind, scope } });
  return w;
}

export const busyUnder = (f: Frame, scope: Scope, kind: BlockKind): boolean => (kind === "audio" || kind === "slot") && itemsUnder(f.s, scope).some((it) => it.audio !== null && it.audio.run !== null);

/** Stackbar: kept / waiting / dead as one proportional rail. */
export function stackbar(f: Frame, x: number, y: number, w: number, parts: readonly (readonly [number, string, number?])[]): void {
  const { ctx } = f;
  const tot = sum(parts, (p) => p[0]) || 1;
  let cx = x;
  ctx.fillStyle = f.pal.c["ink-4"];
  ctx.fillRect(x, y, w, 5);
  for (const [n, col, al] of parts) {
    if (n === 0) continue;
    const pw = Math.max(1.5, (w * n) / tot);
    ctx.globalAlpha *= al ?? 1;
    ctx.fillStyle = col;
    ctx.fillRect(cx, y, pw, 5);
    ctx.globalAlpha /= al ?? 1;
    cx += pw;
  }
}

const thumbs = new Map<string, { readonly img: HTMLImageElement; ok: boolean }>();
/** A lot's first picture, once it has loaded. */
export function thumb(it: Item): HTMLImageElement | null {
  const fl = it.media?.files.find((x) => x.type === "image");
  if (fl === undefined) return null;
  let t = thumbs.get(fl.src);
  if (t === undefined) {
    const img = new Image();
    const rec = { img, ok: false };
    img.onload = () => {
      rec.ok = true;
    };
    img.src = fl.src;
    thumbs.set(fl.src, rec);
    t = rec;
  }
  return t.ok ? t.img : null;
}

/** A town's ring radius at zoom z (continent and basin level). */
export const ringR = (t: Town, z: number): number => clamp((3 + Math.sqrt(t.n) * 1.7) * Math.min(1, z / 0.5), 2, Math.max(2.5, Math.min(21, t.river.h * z * 0.42)));

/** The projected audience of a port (illustrative): kept + ½ made episodes × the assumed views. */
export function projOf(st: CanvasStore, p: Port): { readonly n: number; readonly views: number; readonly rev: number } {
  const A = st.ui.assume;
  if (p.song || p.chan === null) {
    const n = 5;
    return { n, views: n * A.views * 2, rev: ((n * A.views * 2) / 1000) * A.rpm * 4 };
  }
  const eps = p.chan.episodes;
  const k = eps.filter((e) => e.state === "kept").length;
  const m = eps.filter((e) => e.state === "made").length;
  const n = k + m * 0.5;
  const views = n * A.views;
  return { n, views, rev: (views / 1000) * A.rpm };
}
export const fanR = (views: number): number => 120 + Math.sqrt(views) * 1.6;

/** A slot's day as the calendar names it, counted from the view's today. */
function dayOf(today: string, d: number): Date {
  const t = new Date(`${today.slice(0, 10)}T00:00:00`);
  const base = Number.isNaN(t.getTime()) ? new Date() : t;
  base.setDate(base.getDate() + d);
  return base;
}
export const dayLabel = (today: string, d: number): string => dayOf(today, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
export const dayName = (today: string, d: number): string => dayOf(today, d).toLocaleDateString("en-US", { weekday: "short" });

