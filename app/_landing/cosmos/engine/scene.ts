// SCENE: the overview (L0) as stacked depth planes, the medallions and reams
// on them, and a type's own world.
//
// The picture is described once, as PLANE SPECS: each plane's depth, its
// camera-push numbers, and the items on it (a position, a size, the paint ops,
// and the CSS transform the full design applies live, like a sheet's squash).
// The quality tier decides how a spec becomes pixels:
//   full  - one canvas per item on its own plane, every idle motion running
//           (the contest design, unchanged);
//   lite  - the same items folded into three depth BANDS (back: sky, stars,
//           clouds, far ridge; mid: the seven sheets, the lamp, the core, the
//           mid ridge, with the medallions on top; front: the front ridge and the
//           floor, with the reams on top), one canvas each, the live transforms
//           baked in at rest;
//   still - every item on one canvas, the medallions and reams over it.
// The medallions and reams stay DOM in every tier: they are the buttons.
// Pixels come from the raster service (./raster), which paints in a worker
// when it can; this module only builds DOM and places what comes back.
//
// A build goes into a fresh STACK (one div per build). At boot the stack is
// live and fills in plane by plane, back to front; a rebuild (a resize, a tier
// change) fills a hidden stack and swaps it in whole when every plane is ready,
// so nothing on screen is ever half-painted.

import { WORLD_PAPER_COSMOS } from "@/components/ui/tokens";

import { frameReq } from "./camera";
import { el, ICON } from "./dom";
import { medalBox } from "./medal";
import { reamTone } from "./diorama";
import { layout0 } from "./layout";
import { palette } from "./palette";
import { release, surfaceCanvas, urlGet, urlPut, yieldMain, type Surface } from "./raster";
import { I, mul, sc, tr, type Job, type Mat, type Op } from "./rasterJobs";
import { RNG, clamp, hash32 } from "./rng";
import { RIDGE, type PlaneBox } from "./scenePaint";
import { $, type Cx, type Plane } from "./state";

/* ---------- specs ---------- */
interface PlaneOpts {
  sk?: number;
  so?: number;
  pd?: number;
  sf?: number;
  sfo?: number;
}
interface Item {
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
interface PlaneSpec {
  name: string;
  d: number;
  o: PlaneOpts;
  items: Item[];
  /** the DOM layer of buttons this plane carries */
  host?: "medals" | "reams";
}

function box(cx: Cx): PlaneBox {
  const { W, H, portrait } = cx.g;
  const M = Math.round(W * 0.045);
  return { W, H, M, pw: W + 2 * M, ph: H + 2 * M, portrait };
}
const full = (b: PlaneBox, ops: Op[]): Item => ({ x: -b.M, y: -b.M, w: b.pw, h: b.ph, ops });

/** a stylesheet token's colour, for paint that stands in for a CSS rule (the
 *  lamp, the world's haze, the grain overlay's vignette): read from the one
 *  table the stylesheet's own --pc-* vars come from, never from the DOM, which
 *  would cost a style recalc in the middle of a build */
const token = (_cx: Cx, name: string): string => WORLD_PAPER_COSMOS[name];
const lampCols = (cx: Cx): [string, string, string] => [token(cx, "--pc-lamp"), token(cx, "--pc-lamp-2"), token(cx, "--pc-lamp-3")];

function sceneSpec(cx: Cx): PlaneSpec[] {
  const { W, H, portrait } = cx.g,
    L = cx.L,
    b = box(cx);
  const out: PlaneSpec[] = [];
  const P = (name: string, d: number, o: PlaneOpts, items: Item[], host?: PlaneSpec["host"]) => out.push({ name, d, o, items, host });
  /* 1. sky: indigo paper, warm at the horizon */
  P("sky", 0.03, { sk: 1.03, so: 1, pd: 0.25 }, [full(b, [{ p: "sky", b, gx: L.cx, gy: L.cy, gr: Math.max(L.rx, H * 0.6) * 1.25 }])]);
  /* 2. punched stars: light bleeding through holes */
  P("stars", 0.07, { sk: 1.05, so: 0, pd: 0.2 }, [full(b, [{ p: "stars", b }])]);
  /* 3. drifting paper cloud banks */
  {
    const cw = b.pw * 1.4,
      ch = H * 0.42;
    P("clouds", 0.1, { sk: 1.1, so: 0, pd: 0.2 }, [
      { x: -b.M - cw * 0.2, y: H * 0.03, w: cw, h: ch, ops: [{ p: "clouds", cw, ch, H }], cls: "drift", css: { "--dr": W * 0.04 + "px" } },
    ]);
  }
  /* 4. ridges, rim-lit from behind */
  const ridge = (name: keyof typeof RIDGE, base: number, amp: number, seed: number, e: number, glow: number): Op => ({
    p: "ridge",
    b,
    col: RIDGE[name].col,
    base,
    amp,
    seed,
    e,
    glow,
    glowCol: RIDGE[name].glow,
  });
  P("far", 0.14, { sk: 1.12, so: 0, pd: 0.1 }, [full(b, [ridge("far", portrait ? 0.6 : 0.715, 0.035, 31, 10, 34)])]);
  /* 5. the paper disc: stacked swirled sheets, each its own speed */
  const J = 7,
    arms = L.arms < 2 ? 2 : L.arms;
  for (let j = 0; j < J; j++) {
    const Rj = L.R * (1.04 - j * 0.118),
      size = Math.ceil(Rj * 2.5);
    P("disc" + j, 0.17 + j * 0.045, { sk: 1.1 + j * 0.11, so: 0, pd: 0.28 - j * 0.03 }, [
      {
        x: L.cx - size / 2,
        y: L.cy - size / 2,
        w: size,
        h: size,
        ops: [{ p: "disc", j, J, Rj, arms, m: tr(size / 2, size / 2) }],
        bake: sc(1, L.sq),
        cls: "sway",
        css: { "--sq": L.sq.toFixed(3), "--amp": 1.6 + j * 0.55 + "deg", "--sp": 46 + j * 13 + "s", "--sd": -j * 9 + "s" },
      },
    ]);
  }
  /* 6. the lamp behind the sheets: the core glow, and the six-petal heart */
  {
    const sz = L.R * 0.9,
      cs = Math.round(L.R * 0.34),
      cw = cs * 2.4,
      cq = L.sq * 0.55 + 0.45;
    P("core", 0.46, { sk: 1.7, so: 0, pd: 0.05 }, [
      {
        x: L.cx - sz / 2,
        y: L.cy - sz / 2,
        w: sz,
        h: sz,
        lamp: true,
        bake: sc(1, L.sq),
        // the full design's lamp pulses between .82 and 1; at rest it sits between
        ops: [{ p: "lamp", sz, cols: lampCols(cx), m: tr(sz / 2, sz / 2), alpha: 0.91 }],
      },
      {
        x: L.cx - cs * 1.2,
        y: L.cy - cs * 1.2,
        w: cw,
        h: cw,
        ops: [{ p: "core", cs, steps: cx.steps.length, m: tr(cs * 1.2, cs * 1.2) }],
        bake: sc(1, cq),
        css: { transform: `scaleY(${cq.toFixed(3)})` },
        aria: (cx.steps.join(", ") || "studio") + ", stylised illustration",
      },
    ]);
  }
  P("midA", 0.56, { sk: 1.9, so: 0, pd: 0.1 }, [full(b, [ridge("midA", portrait ? 0.655 : 0.775, 0.03, 57, 14, 26)])]);
  P("medals", 0.72, { sk: 1.45, so: 1, pd: 0 }, [], "medals");
  P("front", 0.86, { sk: 2.2, so: 0, pd: 0.1 }, [full(b, [ridge("front", portrait ? 0.78 : 0.885, 0.022, 77, 16, 0)])]);
  P("reams", 0.93, { sk: 2.4, so: 0, pd: 0 }, [], "reams");
  /* floor strip, ink dark, below everything */
  P("floor", 1, { sk: 2.6, so: 0, pd: 0 }, [full(b, [{ p: "floor", b }])]);
  return out;
}

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
function fold(specs: PlaneSpec[], tier: "lite" | "still", b: PlaneBox, vignette: string): PlaneSpec[] {
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
function addPlane(host: HTMLElement, list: Plane[], name: string, d: number, o?: PlaneOpts): Plane {
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
const softRS = (cx: Cx) => Math.min(cx.g.RS, 1);

/** places a painted item on its plane (full: with its live classes and styles) */
function placeItem(p: Plane, it: Item, cv: HTMLCanvasElement, live: boolean): void {
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

/** builds the overview in the current tier. "boot" fills the live stack plane by
 *  plane; "swap" fills a hidden stack and swaps it in when complete. Resolves
 *  false when a newer build or destroy() overtook it. */
export async function buildScene(cx: Cx, how: "boot" | "swap"): Promise<boolean> {
  const myTok = ++cx.buildTok;
  const live = () => myTok === cx.buildTok && !cx.life.dead;
  const tier = cx.tier;
  cx.raster.drop("scene");
  const L = layout0(cx.g, cx.types, cx.library),
    b = box(cx),
    rs = softRS(cx);
  const stack = el("div", "stack");
  stack.dataset.w = String(cx.g.W);
  stack.dataset.h = String(cx.g.H);
  const planes: Plane[] = [];
  const prevL = cx.L;
  cx.L = L;
  let specs = sceneSpec(cx);
  if (tier !== "full") specs = fold(specs, tier, b, token(cx, "--pc-vignette"));
  if (how === "boot") {
    cx.els.scene.innerHTML = "";
    cx.els.scene.appendChild(stack);
    cx.planes = planes;
    cx.stack = stack;
  } else {
    stack.classList.add("fresh");
    cx.L = prevL;
  }
  /* the planes and the buttons go in first, empty; pixels land as they come */
  const waits: Promise<void>[] = [];
  const hostEl: Record<"medals" | "reams", HTMLElement | null> = { medals: null, reams: null };
  specs.forEach((s) => {
    const p = addPlane(stack, planes, s.name, s.d, s.o);
    const hosts = ((s as PlaneSpec & { hosts?: PlaneSpec["host"][] }).hosts || [s.host]).filter((h): h is NonNullable<PlaneSpec["host"]> => !!h);
    const jobs: Promise<void>[] = [];
    for (const it of s.items) {
      if (tier === "full" && it.lamp) {
        const g = el("div", "cv pulse lamp", p.pp);
        g.style.cssText = `left:${it.x}px;top:${it.y}px;width:${it.w}px;height:${it.h}px;transform:scaleY(${L.sq})`;
        continue;
      }
      const job: Job = { rs, layers: [{ w: it.w, h: it.h, ops: it.ops }] };
      jobs.push(
        cx.raster.run(job, 0, "scene").then((r) => {
          if (!r) return;
          if (!live()) return r.out.forEach(release);
          const cv = surfaceCanvas(r.out[0], it.w, it.h);
          if (tier === "full" && it.cls === "drift" && r.ret.length) cv.style.setProperty("--sp", r.ret[0] + "s");
          placeItem(p, it, cv, tier === "full");
        }),
      );
    }
    for (const h of hosts) {
      const e = el("div", "", p.pp);
      e.style.cssText = "position:absolute;inset:0";
      if (h === "medals") p.pp.classList.add("medalsPlane");
      hostEl[h] = e;
    }
    const all = Promise.all(jobs).then(() => {
      if (how === "boot" && live()) p.pl.classList.add("in");
    });
    if (!jobs.length && how === "boot") p.pl.classList.add("in");
    waits.push(all);
  });
  if (how === "swap") {
    // the buttons are built against the new layout once the pixels are ready, so
    // the old ones answer until the swap
    await Promise.all(waits);
    if (!live()) return false;
    cx.L = L;
  }
  const medalsEl = hostEl.medals!,
    reamsEl = hostEl.reams!;
  cx.medalsEl = medalsEl;
  cx.reamsEl = reamsEl;
  medalsEl.id = "medals";
  reamsEl.id = "reams";
  // the buttons are DOM work on the main thread: one task each, so none is long
  await yieldMain();
  if (!live()) return false;
  buildMedals(cx, medalsEl);
  await yieldMain();
  if (!live()) return false;
  buildReams(cx, reamsEl);
  if (how === "boot") {
    await Promise.all(waits);
    return live();
  }
  /* swap: the new stack fades in over the old one, then the old one goes */
  await yieldMain();
  if (!live()) return false;
  const old = cx.stack;
  old?.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
  old?.setAttribute("inert", "");
  planes.forEach((p) => p.pl.classList.add("in"));
  cx.medEls.forEach((m) => m.classList.add("in"));
  cx.reamEls.forEach((m) => m.classList.add("in"));
  cx.els.scene.appendChild(stack);
  cx.planes = planes;
  cx.stack = stack;
  cx.root.dataset.tier = tier;
  frameReq(cx);
  cx.life.timeout(() => {
    old?.remove();
    stack.classList.remove("fresh");
  }, 450);
  return true;
}

/** small art as an image: from the session's files when it was painted before,
 *  else painted (as a PNG) and kept */
function artImg(cx: Cx, img: HTMLImageElement, key: string, w: number, h: number, job: Job): void {
  img.alt = "";
  img.draggable = false;
  img.decoding = "async";
  img.style.width = w + "px";
  img.style.height = h + "px";
  const hit = urlGet(key);
  if (hit) {
    img.src = hit;
    return;
  }
  void cx.raster.run(job, 0, "scene").then((r) => {
    if (!r || !r.urls[0]) return;
    urlPut(key, r.urls[0]);
    if (!cx.life.dead) img.src = r.urls[0];
  });
}

/* ---------- medallions ---------- */
function buildMedals(cx: Cx, host: HTMLElement): void {
  host.innerHTML = "";
  cx.medEls.length = 0;
  const rsM = clamp(cx.g.DPR, 1, 2),
    N = cx.types.length,
    stag = Math.min(55, 900 / Math.max(N, 1));
  cx.types.forEach((t, i) => {
    const m = cx.L.med[i],
      D = m.d,
      n = (cx.tplByType.get(t.id) || []).length;
    const b = el("button", "med", host);
    b.type = "button";
    b.dataset.id = t.id;
    b.dataset.i = String(i);
    b.style.cssText = `left:${(m.x - D / 2).toFixed(1)}px;top:${(m.y - D / 2).toFixed(1)}px;width:${D}px;height:${D}px;z-index:${Math.round(m.y)};--md:${((i * stag) / 1000).toFixed(3)}s;--bp:${(6 + (hash32(t.id) % 50) / 10).toFixed(1)}s;--bd:${(-(hash32(t.id + "b") % 80) / 10).toFixed(1)}s`;
    b.setAttribute("aria-label", t.label + (n ? ", " + n + " templates" : "") + ", stylised illustration");
    const bob = el("span", "bob", b),
      lift = el("span", "lift", bob);
    el("span", "glow", lift);
    el("span", "sh2", lift);
    // an <img>, not a canvas: a canvas is a compositor layer of its own, and a
    // medallion that fades or flies with nested layers costs an offscreen pass
    const bx = medalBox(D);
    artImg(cx, el("img", "", lift), `medal|${t.id}|${D}|${rsM}`, bx, bx, { rs: rsM, png: true, layers: [{ w: bx, h: bx, ops: [{ p: "medal", id: t.id, D, m: tr(bx / 2, bx / 2) }] }] });
    el("span", "ring", lift);
    const tg = el("span", "tag", b);
    tg.textContent = t.label;
    tg.setAttribute("aria-hidden", "true");
    cx.medEls.push(b);
  });
  cx.life.raf(() => {
    layoutMedTags(cx);
    if (document.fonts && document.fonts.ready)
      void document.fonts.ready.then(() => {
        if (!cx.life.dead) layoutMedTags(cx);
      });
  });
}

/** name tags under (or beside) each medallion, dropped where they would collide.
 *  Reads every tag's size first, then writes every position: one layout, not one per tag. */
function layoutMedTags(cx: Cx): void {
  const { W, H, portrait } = cx.g,
    L = cx.L;
  const N = cx.medEls.length;
  if (!N || !L.med) return;
  type Box = { x0: number; y0: number; x1: number; y1: number };
  const ov = (a: Box, b: Box) => !(a.x1 < b.x0 || a.x0 > b.x1 || a.y1 < b.y0 || a.y0 > b.y1);
  const rc = (r: Box, c: { x: number; y: number; r: number }) => {
    const nx = Math.max(r.x0, Math.min(c.x, r.x1)),
      ny = Math.max(r.y0, Math.min(c.y, r.y1));
    return Math.hypot(nx - c.x, ny - c.y) < c.r;
  };
  const zoneY = portrait ? L.rowTop || H : Math.min(...L.reams.map((g) => g.bottom - g.hMax - g.th)) - 10;
  const res: Box[] = [
    { x0: 0, y0: 0, x1: Math.max(330, W * 0.25), y1: 118 },
    { x0: W - Math.max(400, W * 0.23), y0: 0, x1: W, y1: 108 },
    { x0: 0, y0: zoneY, x1: W, y1: H },
  ];
  const circs = L.med.map((m) => ({ x: m.x, y: m.y, r: (m.d / 2) * 1.06 }));
  const tags = cx.medEls.map((b) => b.querySelector<HTMLElement>(".tag"));
  /* write: every tag measurable */
  for (const t of tags) if (t) t.style.display = "";
  /* read: every size, in one layout */
  const size = tags.map((t) => (t ? [t.offsetWidth, t.offsetHeight] : [0, 0]));
  /* compute, then write */
  const placed: Box[] = [];
  const order = cx.medEls.map((_, i) => i).sort((a, b) => L.med[b].d - L.med[a].d);
  const out: (null | { left: string; top: string })[] = new Array(N).fill(null);
  order.forEach((i) => {
    const m = L.med[i],
      [w, h] = size[i];
    if (!tags[i]) return;
    const cands: [number, number][] = [
      [m.x, m.y + m.d / 2 + 3],
      [m.x, m.y - m.d / 2 - h - 3],
      [m.x + m.d / 2 + w / 2 + 4, m.y - h / 2],
      [m.x - m.d / 2 - w / 2 - 4, m.y - h / 2],
    ];
    for (const [ccx, ty] of cands) {
      const r = { x0: ccx - w / 2 - 3, y0: ty - 2, x1: ccx + w / 2 + 3, y1: ty + h + 2 };
      if (r.x0 < 6 || r.x1 > W - 6 || r.y0 < 4 || r.y1 > H - 4) continue;
      if (res.some((q) => ov(r, q)) || placed.some((q) => ov(r, q)) || circs.some((c, j) => j !== i && rc(r, c))) continue;
      placed.push(r);
      out[i] = { left: (ccx - w / 2 - (m.x - m.d / 2)).toFixed(1) + "px", top: (ty - (m.y - m.d / 2)).toFixed(1) + "px" };
      break;
    }
  });
  tags.forEach((t, i) => {
    if (!t) return;
    const o = out[i];
    if (!o) t.style.display = "none";
    else {
      t.style.left = o.left;
      t.style.top = o.top;
    }
  });
}

/* ---------- reams: the library as paper strata ---------- */
function buildReams(cx: Cx, host: HTMLElement): void {
  host.innerHTML = "";
  cx.reamEls.length = 0;
  const { portrait } = cx.g;
  const items = cx.library.map((f) => {
    let t = 0,
      known = false;
    for (const c of f.categories)
      if (typeof c.items === "number" && c.items > 0) {
        t += c.items;
        known = true;
      }
    return known ? t : null;
  });
  const maxI = Math.max(1, ...items.map((v) => v || 0));
  const dpr = clamp(cx.g.DPR, 1, 2);
  cx.library.forEach((f, i) => {
    const g = cx.L.reams[i],
      cats = f.categories.length;
    let nh: number;
    if (f.status === "locked") nh = 0.46;
    else if (!cats) nh = 0.3;
    else if (items[i] == null) nh = 0.62;
    else nh = 0.32 + 0.68 * Math.pow((items[i] as number) / maxI, 0.75);
    const h = Math.round(g.hMax * nh),
      w = Math.round(g.w),
      pad = 16;
    const b = el("button", "ream", host);
    b.type = "button";
    b.dataset.id = f.id;
    b.dataset.i = String(i);
    const top = g.bottom - h - g.th;
    b.style.cssText = `left:${(g.x - pad).toFixed(1)}px;top:${(top - pad).toFixed(1)}px;width:${w + pad * 2}px;height:${h + g.th + pad * 2}px;--rd:${(i * 0.04).toFixed(2)}s;z-index:${10 + (i % 3)}`;
    b.setAttribute("aria-label", f.label + (f.status === "locked" ? ", locked" : "") + ", stylised illustration");
    el("span", "rglow", b);
    const cw = w + pad * 2,
      ch = h + pad * 2;
    const body = el("img", "body", b);
    body.style.left = "0";
    body.style.bottom = "0";
    artImg(cx, body, `ream|${hash32(JSON.stringify(f))}|${cw}x${ch}|${dpr}|${portrait}`, cw, ch, {
      rs: dpr,
      png: true,
      layers: [{ w: cw, h: ch, ops: [{ p: "ream", f, w, h, compact: portrait, m: tr(pad, pad) }] }],
    });
    const tone = reamTone(f.id);
    cx.reamTone.set(f.id, tone);
    const tab = el("span", "tab", b);
    tab.style.setProperty("--rt", tone);
    tab.style.setProperty("--th", (portrait ? 0 : g.th) + "px");
    if (f.status === "locked") tab.insertAdjacentHTML("beforeend", ICON.lock);
    const tx = document.createElement("span");
    tx.textContent = f.label;
    tab.appendChild(tx);
    if (portrait) {
      // the portrait label sits on the ream itself; its look is .pc.portrait .ream .tab
      tab.style.left = pad + 8 + "px";
      tab.style.bottom = pad + 6 + "px";
    } else {
      tab.style.left = pad + Math.min(w * 0.04, 8) + "px";
      tab.style.bottom = pad + h - 6 + "px";
      tab.style.position = "absolute";
    }
    cx.reamEls.push(b);
  });
  cx.life.raf(() => layoutTabs(cx));
}

/** staggers neighbouring tabs when any is wider than its ream */
export function layoutTabs(cx: Cx): void {
  if (cx.g.portrait) return;
  let over = false;
  cx.reamEls.forEach((b, i) => {
    const t = $(cx, ".tab", b);
    if (t && t.offsetWidth > cx.L.reams[i].w * 1.08) over = true;
  });
  cx.reamEls.forEach((b, i) => {
    const t = $(cx, ".tab", b),
      g = cx.L.reams[i];
    if (!t) return;
    if (t.dataset.b0 == null) t.dataset.b0 = String(parseFloat(t.style.bottom));
    t.style.bottom = parseFloat(t.dataset.b0) + (over && i % 2 ? g.th + 3 : 0) + "px";
  });
}

/* ---------- the type's own world ---------- */
/** a world's planes for the current viewport and tier, and the job that paints them */
function worldSpec(cx: Cx, id: string): { specs: PlaneSpec[]; job: Job } {
  const P = palette(id),
    seed = hash32("world|" + id),
    r = RNG(seed);
  const { W, H, portrait } = cx.g;
  // lite and still paint the world at 0.75: it is a soft backdrop that a
  // software compositor fades over the overview, and paint time is pixels
  const b = box(cx),
    rs = cx.tier === "full" ? softRS(cx) * 0.9 : Math.min(softRS(cx), 0.75),
    left = r() < 0.5;
  const gx = (left ? 0.8 : 0.2) * W,
    gy = H * (portrait ? 0.3 : 0.43);
  const Rm = Math.min(H * 0.5, W * (portrait ? 0.5 : 0.3)),
    size = Math.ceil(Rm * 2.9);
  const ridgeOp = (col: string, base: number, amp: number, e: number, glow: number): Op => ({
    p: "ridge",
    b,
    col,
    base,
    amp,
    seed: null,
    e,
    glow,
    glowCol: P.t("acc2", 0, 0, 0.8),
  });
  let specs: PlaneSpec[] = [
    { name: "wsky", d: 0.04, o: {}, items: [full(b, [{ p: "wsky", b, id, gx, gy }])] },
    { name: "wmotif", d: 0.17, o: {}, items: [{ x: gx - size / 2, y: gy - size / 2, w: size, h: size, ops: [{ p: "wmotif", Rm, id, m: tr(size / 2, size / 2) }] }] },
    { name: "wfar", d: 0.32, o: {}, items: [full(b, [ridgeOp(P.t("mid", -14, -4), portrait ? 0.66 : 0.7, 0.045, 12, 30)])] },
    { name: "wnear", d: 0.5, o: {}, items: [full(b, [ridgeOp(P.t("dark", -3), portrait ? 0.74 : 0.79, 0.04, 14, 0)])] },
    { name: "wfloor", d: 0.78, o: {}, items: [full(b, [{ p: "wfloor", b, id }])] },
  ];
  // lite and still: one canvas, the stylesheet's top haze and the grain
  // overlay painted into it, and no parallax. The world arrives as a crossfade
  // over the overview, and an opacity over a single layer is the one fade a
  // software compositor does without an offscreen pass (measured: the world's
  // background, its haze and its canvas under one opacity cost a
  // full-viewport pass every frame).
  if (cx.tier !== "full") {
    const it = foldItems(specs, b)[0];
    it.ops.push({ p: "haze", w: W, h: H * 0.24, col: token(cx, "--pc-haze"), m: tr(b.M, b.M) });
    it.ops.push({ p: "overlay", W, H, lw: it.w, lh: it.h, col: token(cx, "--pc-vignette"), m: tr(b.M, b.M) });
    specs = [{ name: "wall", d: 0, o: {}, items: [it] }];
  }
  return { specs, job: { rs, parts: true, rng: { seed, skip: 1 }, layers: specs.map((sp) => ({ w: sp.items[0].w, h: sp.items[0].h, ops: sp.items[0].ops })) } };
}

const worldKey = (cx: Cx, id: string) => `${id}|${cx.g.W}x${cx.g.H}|${cx.tier}`;

/** starts painting a world; its layers collect in `parts` and go to whoever listens */
function paintWorld(cx: Cx, id: string, prio: number, tag: string): NonNullable<Cx["worldPre"]> {
  const wp: NonNullable<Cx["worldPre"]> = { key: worldKey(cx, id), parts: [], on: null, done: false };
  void cx.raster
    .run(worldSpec(cx, id).job, prio, tag, (i, srf) => {
      if (wp.on) wp.on(i, srf);
      else wp.parts[i] = srf;
    })
    .then(() => {
      wp.done = true;
    });
  return wp;
}

/** paints a world before it is asked for: a pointer resting on a medallion or a
 *  ream, or a family's sheet opening, is the click that usually follows. One at
 *  a time; a world nobody opened is let go. */
export function prewarmWorld(cx: Cx, id: string): void {
  if (cx.life.dead || cx.worldPre?.key === worldKey(cx, id)) return;
  dropPrewarm(cx);
  cx.worldPre = paintWorld(cx, id, 3, "prewarm");
}
export function dropPrewarm(cx: Cx): void {
  const wp = cx.worldPre;
  if (!wp) return;
  cx.worldPre = null;
  cx.raster.drop("prewarm");
  wp.parts.forEach((x) => x && release(x));
  wp.parts = [];
  wp.on = (_i, srf) => release(srf);
}

/** a type's (or a family's) world: sky, its emblem as the landmark, two ridges
 *  and the table edge, all from one seeded stream; folded like the overview.
 *  `keep` (a resize or a tier change) leaves the current world up until the new
 *  one is painted; a newly opened world starts empty on its own colour, and its
 *  layers land as they are painted (or at once, when it was prewarmed). */
export function buildWorld(cx: Cx, id: string, keep = false): void {
  const worldEl = cx.els.world;
  const tok = ++cx.worldTok;
  cx.worldReady = false;
  cx.raster.drop("world");
  if (!keep) {
    worldEl.innerHTML = "";
    cx.wplanes = [];
  }
  worldEl.style.setProperty("--wbg", palette(id).t("deep"));
  const { specs } = worldSpec(cx, id);
  const stack = el("div", "stack"),
    planes: Plane[] = [];
  stack.dataset.w = String(cx.g.W);
  stack.dataset.h = String(cx.g.H);
  const items = specs.map((s) => {
    const p = addPlane(stack, planes, s.name, s.d, s.o);
    p.pl.classList.add("in");
    return { p, it: s.items[0] };
  });
  const place = () => {
    worldEl.querySelectorAll(":scope > .stack").forEach((n) => n !== stack && n.remove());
    if (!stack.isConnected) worldEl.appendChild(stack);
    cx.wplanes = planes;
    frameReq(cx);
  };
  if (!keep) place();
  let wp = cx.worldPre;
  if (wp && wp.key === worldKey(cx, id)) cx.worldPre = null;
  else wp = paintWorld(cx, id, -1, "world");
  let landed = 0;
  const land = (i: number, srf: Surface) => {
    if (tok !== cx.worldTok || cx.life.dead) return release(srf);
    const { p, it } = items[i];
    placeItem(p, it, surfaceCanvas(srf, it.w, it.h), false);
    if (++landed < items.length) return;
    if (keep) place();
    stack.classList.add("wready");
    cx.worldReady = true;
    cx.worldReadyAt = performance.now();
  };
  wp.parts.forEach((srf, i) => srf && land(i, srf));
  wp.parts = [];
  wp.on = land;
}

function foldItems(specs: PlaneSpec[], b: PlaneBox): Item[] {
  const ops: Op[] = [];
  for (const s of specs)
    for (const it of s.items) {
      const place = tr(it.x + b.M, it.y + b.M);
      for (const op of it.ops) ops.push({ ...op, m: mul(place, op.m || I) });
    }
  return [full(b, ops)];
}
