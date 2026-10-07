// SCENE: the overview (L0) as stacked depth planes, the medallions and reams
// on them, and a type's own world. This module builds DOM and hands each
// plane's raster to a pure paint function in ./scenePaint, ./medal or
// ./diorama.

import { frameReq } from "./camera";
import { el, ICON, makeCanvas } from "./dom";
import { paintMedal, medalBox, specOf } from "./medal";
import { paintReam, reamTone } from "./diorama";
import { layout0 } from "./layout";
import { palette } from "./palette";
import { RNG, clamp, hash32 } from "./rng";
import {
  RIDGE,
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
import { $, type Cx, type Plane } from "./state";

/* ---------- planes ---------- */
interface PlaneOpts {
  sk?: number;
  so?: number;
  pd?: number;
  sf?: number;
  sfo?: number;
}
function addPlane(host: HTMLElement, list: Plane[], name: string, d: number, o?: PlaneOpts): Plane {
  o = o || {};
  const pl = el("div", "pl", host),
    pp = el("div", "pp", pl);
  const p: Plane = { name, d, pl, pp };
  list.push(p);
  pp.style.setProperty("--sk", String(o.sk == null ? 1 + d * 1.3 : o.sk));
  pp.style.setProperty("--so", String(o.so == null ? 0 : o.so));
  pp.style.setProperty("--pd", (o.pd || 0) + "s");
  if (o.sf) pp.style.setProperty("--sf", String(o.sf));
  if (o.sfo != null) pp.style.setProperty("--sfo", String(o.sfo));
  return p;
}
function planeCanvas(p: Plane, w: number, h: number, ox: number, oy: number, rs: number) {
  const { cv, c } = makeCanvas(w, h, rs);
  cv.style.width = w + "px";
  cv.style.height = h + "px";
  cv.style.left = ox + "px";
  cv.style.top = oy + "px";
  cv.className = "cv";
  p.pp.appendChild(cv);
  return { cv, c };
}
const tickp = (cx: Cx) => cx.life.sleep(0);

function box(cx: Cx): PlaneBox {
  const { W, H, portrait } = cx.g;
  const M = Math.round(W * 0.045);
  return { W, H, M, pw: W + 2 * M, ph: H + 2 * M, portrait };
}

/** builds the overview back to front, yielding between planes; resolves false
 *  when a newer build (a resize) or destroy() overtook it */
export async function buildScene(cx: Cx): Promise<boolean> {
  const myTok = ++cx.buildTok;
  const live = () => myTok === cx.buildTok && !cx.life.dead;
  const sceneEl = cx.els.scene;
  sceneEl.innerHTML = "";
  cx.planes.length = 0;
  const { W, H, portrait } = cx.g;
  const L = (cx.L = layout0(cx.g, cx.types, cx.library));
  const b = box(cx),
    { M, pw, ph } = b;
  const rs = cx.g.RS;
  /* 1. sky: indigo paper, warm at the horizon */
  let p = addPlane(sceneEl, cx.planes, "sky", 0.03, { sk: 1.03, so: 1, pd: 0.25 });
  paintSky(planeCanvas(p, pw, ph, -M, -M, rs).c, b, L.cx, L.cy, Math.max(L.rx, H * 0.6) * 1.25);
  p.pl.classList.add("in");
  await tickp(cx);
  if (!live()) return false;
  /* 2. punched stars: light bleeding through holes */
  p = addPlane(sceneEl, cx.planes, "stars", 0.07, { sk: 1.05, so: 0, pd: 0.2 });
  paintStars(planeCanvas(p, pw, ph, -M, -M, rs).c, b);
  p.pl.classList.add("in");
  await tickp(cx);
  if (!live()) return false;
  /* 3. drifting paper cloud banks */
  p = addPlane(sceneEl, cx.planes, "clouds", 0.1, { sk: 1.1, so: 0, pd: 0.2 });
  {
    const cw = pw * 1.4,
      ch = H * 0.42,
      { cv, c } = planeCanvas(p, cw, ch, -M - cw * 0.2, H * 0.03, rs);
    const sp = paintClouds(c, cw, ch, H);
    cv.classList.add("drift");
    cv.style.setProperty("--sp", sp + "s");
    cv.style.setProperty("--dr", W * 0.04 + "px");
  }
  p.pl.classList.add("in");
  await tickp(cx);
  if (!live()) return false;
  /* 4. far ridge, rim-lit from behind */
  const ridgeLayer = (name: keyof typeof RIDGE, d: number, base: number, amp: number, seed: number, e: number, glow: number, sk: number) => {
    const q = addPlane(sceneEl, cx.planes, name, d, { sk, so: 0, pd: 0.1 });
    paintRidge(planeCanvas(q, pw, ph, -M, -M, rs).c, b, RIDGE[name].col, base, amp, seed, e, glow, RIDGE[name].glow);
    q.pl.classList.add("in");
  };
  ridgeLayer("far", 0.14, portrait ? 0.6 : 0.715, 0.035, 31, 10, 34, 1.12);
  await tickp(cx);
  if (!live()) return false;
  /* 5. the paper disc: stacked swirled sheets, each its own speed */
  const J = 7,
    arms = L.arms < 2 ? 2 : L.arms;
  for (let j = 0; j < J; j++) {
    const Rj = L.R * (1.04 - j * 0.118),
      size = Math.ceil(Rj * 2.5);
    const q = addPlane(sceneEl, cx.planes, "disc" + j, 0.17 + j * 0.045, { sk: 1.1 + j * 0.11, so: 0, pd: 0.28 - j * 0.03 });
    const { cv, c } = makeCanvas(size, size, rs);
    cv.className = "cv sway";
    cv.style.width = cv.style.height = size + "px";
    cv.style.left = L.cx - size / 2 + "px";
    cv.style.top = L.cy - size / 2 + "px";
    cv.style.setProperty("--sq", L.sq.toFixed(3));
    cv.style.setProperty("--amp", 1.6 + j * 0.55 + "deg");
    cv.style.setProperty("--sp", 46 + j * 13 + "s");
    cv.style.setProperty("--sd", -j * 9 + "s");
    q.pp.appendChild(cv);
    c.translate(size / 2, size / 2);
    paintDiscSheet(c, j, J, Rj, arms);
    q.pl.classList.add("in");
    await tickp(cx);
    if (!live()) return false;
  }
  /* 6. the lamp behind the sheets: the core glow, and the six-petal heart */
  p = addPlane(sceneEl, cx.planes, "core", 0.46, { sk: 1.7, so: 0, pd: 0.05 });
  {
    const g = el("div", "cv pulse lamp", p.pp),
      sz = L.R * 0.9;
    g.style.cssText = `left:${L.cx - sz / 2}px;top:${L.cy - sz / 2}px;width:${sz}px;height:${sz}px;`;
    g.style.transform = `scaleY(${L.sq})`;
    const cs = Math.round(L.R * 0.34);
    const { cv: core, c } = makeCanvas(cs * 2.4, cs * 2.4, rs);
    core.className = "cv";
    core.style.cssText = `width:${cs * 2.4}px;height:${cs * 2.4}px;left:${L.cx - cs * 1.2}px;top:${L.cy - cs * 1.2}px;transform:scaleY(${(L.sq * 0.55 + 0.45).toFixed(3)})`;
    core.setAttribute("role", "img");
    core.setAttribute("aria-label", (cx.steps.join(", ") || "studio") + ", stylised illustration");
    c.translate(cs * 1.2, cs * 1.2);
    paintCore(c, cs, cx.steps.length);
    p.pp.appendChild(core);
  }
  p.pl.classList.add("in");
  await tickp(cx);
  if (!live()) return false;
  ridgeLayer("midA", 0.56, portrait ? 0.655 : 0.775, 0.03, 57, 14, 26, 1.9);
  await tickp(cx);
  if (!live()) return false;
  /* the medallions plane */
  const pm = addPlane(sceneEl, cx.planes, "medals", 0.72, { sk: 1.45, so: 1, pd: 0 });
  pm.pp.id = "medalsPlane";
  const medalsEl = el("div", "", pm.pp);
  medalsEl.id = "medals";
  medalsEl.style.cssText = "position:absolute;inset:0";
  pm.pl.classList.add("in");
  /* in front: the ridge, then the reams */
  ridgeLayer("front", 0.86, portrait ? 0.78 : 0.885, 0.022, 77, 16, 0, 2.2);
  const pr = addPlane(sceneEl, cx.planes, "reams", 0.93, { sk: 2.4, so: 0, pd: 0 });
  const reamsEl = el("div", "", pr.pp);
  reamsEl.id = "reams";
  reamsEl.style.cssText = "position:absolute;inset:0";
  pr.pl.classList.add("in");
  cx.medalsEl = medalsEl;
  cx.reamsEl = reamsEl;
  buildMedals(cx, medalsEl);
  buildReams(cx, reamsEl);
  await tickp(cx);
  if (!live()) return false;
  /* floor strip, ink dark, below everything */
  const pf = addPlane(sceneEl, cx.planes, "floor", 1, { sk: 2.6, so: 0, pd: 0 });
  paintFloor(planeCanvas(pf, pw, ph, -M, -M, rs).c, b);
  pf.pl.classList.add("in");
  return true;
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
      spec = specOf(t.id),
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
    const bx = medalBox(D),
      { cv, c } = makeCanvas(bx, bx, rsM);
    // makeCanvas pre-scales; paintMedal scales itself, so start from identity
    c.setTransform(1, 0, 0, 1, 0, 0);
    paintMedal(c, spec, D, rsM);
    cv.style.width = cv.style.height = bx + "px";
    lift.appendChild(cv);
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

/** name tags under (or beside) each medallion, dropped where they would collide */
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
  const placed: Box[] = [];
  const order = cx.medEls.map((_, i) => i).sort((a, b) => L.med[b].d - L.med[a].d);
  order.forEach((i) => {
    const b = cx.medEls[i],
      tag = b.querySelector<HTMLElement>(".tag"),
      m = L.med[i];
    if (!tag) return;
    tag.style.display = "";
    const w = tag.offsetWidth,
      h = tag.offsetHeight;
    const cands: [number, number][] = [
      [m.x, m.y + m.d / 2 + 3],
      [m.x, m.y - m.d / 2 - h - 3],
      [m.x + m.d / 2 + w / 2 + 4, m.y - h / 2],
      [m.x - m.d / 2 - w / 2 - 4, m.y - h / 2],
    ];
    let ok: { cx: number; ty: number; r: Box } | null = null;
    for (const [ccx, ty] of cands) {
      const r = { x0: ccx - w / 2 - 3, y0: ty - 2, x1: ccx + w / 2 + 3, y1: ty + h + 2 };
      if (r.x0 < 6 || r.x1 > W - 6 || r.y0 < 4 || r.y1 > H - 4) continue;
      if (res.some((q) => ov(r, q)) || placed.some((q) => ov(r, q)) || circs.some((c, j) => j !== i && rc(r, c))) continue;
      ok = { cx: ccx, ty, r };
      break;
    }
    if (!ok) {
      tag.style.display = "none";
      return;
    }
    placed.push(ok.r);
    tag.style.left = (ok.cx - w / 2 - (m.x - m.d / 2)).toFixed(1) + "px";
    tag.style.top = (ok.ty - (m.y - m.d / 2)).toFixed(1) + "px";
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
    const { cv, c } = makeCanvas(w + pad * 2, h + pad * 2, dpr);
    cv.style.width = w + pad * 2 + "px";
    cv.style.height = h + pad * 2 + "px";
    c.translate(pad, pad);
    paintReam(c, f, w, h, portrait);
    const tone = reamTone(f.id);
    cx.reamTone.set(f.id, tone);
    cv.className = "body";
    cv.style.left = "0";
    cv.style.bottom = "0";
    b.appendChild(cv);
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
function addWorldPlane(cx: Cx, name: string, d: number): Plane {
  const p = addPlane(cx.els.world, cx.wplanes, name, d);
  p.pl.classList.add("in");
  return p;
}
export function buildWorld(cx: Cx, id: string): void {
  const P = palette(id),
    spec = specOf(id),
    r = RNG(hash32("world|" + id));
  const worldEl = cx.els.world;
  worldEl.innerHTML = "";
  cx.wplanes.length = 0;
  worldEl.style.setProperty("--wbg", P.t("deep"));
  const { W, H, portrait } = cx.g;
  const b = box(cx),
    { M, pw, ph } = b,
    rs = cx.g.RS * 0.9,
    left = r() < 0.5;
  const gx = (left ? 0.8 : 0.2) * W,
    gy = H * (portrait ? 0.3 : 0.43);
  let p = addWorldPlane(cx, "wsky", 0.04);
  paintWorldSky(planeCanvas(p, pw, ph, -M, -M, rs).c, b, P, gx, gy, r);
  /* the type's emblem, large, as the place's landmark */
  p = addWorldPlane(cx, "wmotif", 0.17);
  const Rm = Math.min(H * 0.5, W * (portrait ? 0.5 : 0.3)),
    size = Math.ceil(Rm * 2.9);
  const { cv, c } = makeCanvas(size, size, rs);
  cv.className = "cv";
  cv.style.cssText = `width:${size}px;height:${size}px;left:${gx - size / 2}px;top:${gy - size / 2}px`;
  p.pp.appendChild(cv);
  c.translate(size / 2, size / 2);
  paintWorldMotif(c, Rm, P, spec, r);
  /* ridges and the table edge */
  const ridgeW = (name: string, d: number, col: string, base: number, amp: number, e: number, glow: number) => {
    const q = addWorldPlane(cx, name, d);
    paintRidge(planeCanvas(q, pw, ph, -M, -M, rs).c, b, col, base, amp, r, e, glow, P.t("acc2", 0, 0, 0.8));
  };
  ridgeW("wfar", 0.32, P.t("mid", -14, -4), portrait ? 0.66 : 0.7, 0.045, 12, 30);
  ridgeW("wnear", 0.5, P.t("dark", -3), portrait ? 0.74 : 0.79, 0.04, 14, 0);
  const q = addWorldPlane(cx, "wfloor", 0.78);
  paintWorldFloor(planeCanvas(q, pw, ph, -M, -M, rs).c, b, P, r);
  frameReq(cx);
}
