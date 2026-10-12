// MEDAL LAYER: the medallions, the DOM buttons that sit on the medals plane.
// buildMedals builds one button per type, each with its medallion art (artImg) and
// its name tag; layoutMedTags places the tags so they do not collide. The
// medallions are DOM in every tier because they are the buttons (scene.ts header).

import { el } from "./dom";
import { medalBox } from "./medal";
import { tr } from "./rasterJobs";
import { clamp, hash32 } from "./rng";
import type { Cx } from "./state";
import { artImg } from "./scene";

/* ---------- medallions ---------- */
export function buildMedals(cx: Cx, host: HTMLElement): void {
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
