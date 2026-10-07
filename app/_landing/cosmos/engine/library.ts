// LIBRARY: a family opens as a torn paper sheet whose categories form a
// treemap sized by items; an empty family shows its tray. A category opens on
// the stage, over the family's own world.

import { hideBanner, showBanner } from "./banner";
import { drawDiorama, drawTray } from "./diorama";
import { el, ICON } from "./dom";
import { famItems, fmtN, squarify, tornTop } from "./layout";
import { setLv } from "./nav";
import { palette } from "./palette";
import { clamp, hash32 } from "./rng";
import { buildWorld } from "./scene";
import { renderStage } from "./stage";
import { $, type Cx } from "./state";
import type { GalaxyCategory } from "../types";

function catPump(cx: Cx): void {
  const f = cx.catQ.shift();
  if (!f) {
    cx.catRun = false;
    return;
  }
  try {
    f();
  } catch {
    // one tile failing to paint must not stop the rest
  }
  cx.life.timeout(() => catPump(cx), 8);
}

function buildLib(cx: Cx, id: string): void {
  const { g } = cx;
  const { W, H, S, DPR, portrait } = g;
  const f = cx.famById.get(id)!,
    P = palette(id),
    v = cx.els.libView;
  v.innerHTML = "";
  cx.catQ.length = 0;
  const locked = f.status === "locked";
  const sheetTop = Math.round(portrait ? H * 0.16 : Math.max(H * 0.115, S * 0.12));
  v.style.setProperty("--sheetTop", sheetTop + "px");
  v.style.setProperty("--lbg", P.t("paper", -3, 2));
  v.style.setProperty("--ltx", P.t("deep", -2, 4));
  const sh = el("div", "lsheet" + (locked ? " locked" : ""), v),
    pap = el("div", "lpaper", sh);
  pap.style.clipPath = tornTop(W, H - sheetTop, 8, hash32(id));
  const hd = el("div", "lv-hd", sh),
    h1 = el("h1", "lv-title", hd);
  h1.textContent = f.label;
  const total = famItems(f);
  if (locked) hd.insertAdjacentHTML("beforeend", `<span class="chipx" aria-label="locked">${ICON.lock}</span>`);
  else if (total) hd.insertAdjacentHTML("beforeend", `<span class="chipx" aria-label="${fmtN(total)} items">${ICON.stack}${fmtN(total)}</span>`);
  const area = el("div", "lv-area", sh);
  cx.famSorted = [];
  if (!f.categories.length) {
    const tr = el("div", "emptytray", area),
      cv = el("canvas", "", tr),
      tw = Math.round(Math.min(area.offsetWidth || W * 0.6, S * 0.9)),
      th = Math.round(tw * 0.75),
      rs = clamp(DPR, 1, 1.5);
    cv.width = Math.ceil(tw * rs);
    cv.height = Math.ceil(th * rs);
    cv.style.cssText = "width:100%;height:100%";
    const c = cv.getContext("2d")!;
    c.scale(rs, rs);
    drawTray(c, tw, th, P, locked);
    tr.setAttribute("role", "img");
    tr.setAttribute("aria-label", f.label + (locked ? ", locked, empty" : ", empty") + ", stylised illustration");
    return;
  }
  const cats = f.categories.slice(),
    vals = cats.map((c) => (typeof c.items === "number" && c.items > 0 ? c.items : 0)),
    pos = vals.filter((x) => x > 0),
    avg = pos.length ? pos.reduce((a, b) => a + b, 0) / pos.length : 1;
  const wts = vals.map((x) => Math.max(x || avg, avg * 0.2));
  const order = cats.map((_, i) => i).sort((a, b) => wts[b] - wts[a]);
  const aw = area.offsetWidth || W - 60,
    ah = area.offsetHeight || H - sheetTop - S * 0.2;
  const sum = order.reduce((s, i) => s + wts[i], 0),
    areas = order.map((i) => (wts[i] / sum) * aw * ah);
  const rects = squarify(areas, 0, 0, aw, ah);
  cx.famSorted = order.map((i) => cats[i]);
  order.forEach((ci, k) => {
    const c = cats[ci],
      [x, y, w, h] = rects[k],
      gp2 = Math.min(5, Math.min(w, h) * 0.06);
    const b = el("button", "cat" + (c.art ? " real" : ""), area);
    b.type = "button";
    b.dataset.k = String(k);
    b.style.cssText += `left:${(x + gp2).toFixed(1)}px;top:${(y + gp2).toFixed(1)}px;width:${Math.max(4, w - gp2 * 2).toFixed(1)}px;height:${Math.max(4, h - gp2 * 2).toFixed(1)}px;z-index:${1 + (k % 5)}`;
    const n = typeof c.items === "number" && c.items > 0 ? c.items : null;
    b.setAttribute("aria-label", c.label + (n ? ", " + fmtN(n) + " items" : "") + (locked ? ", locked" : "") + (c.art ? ", key art" : ", stylised illustration"));
    if (c.art) {
      const im = new Image();
      im.src = c.art;
      im.alt = "";
      im.draggable = false;
      b.appendChild(im);
    } else {
      const cv = el("canvas", "", b);
      const bw = Math.max(8, Math.round(w - gp2 * 2)),
        bh = Math.max(8, Math.round(h - gp2 * 2));
      cx.catQ.push(() => {
        const rs = clamp(DPR, 1, 1.5) * (bw > 420 ? 0.7 : 1);
        cv.width = Math.ceil(bw * rs);
        cv.height = Math.ceil(bh * rs);
        const x2 = cv.getContext("2d")!;
        x2.scale(rs, rs);
        drawDiorama(x2, bw, bh, c.id, id, { noEmblem: Math.min(bw, bh) < 90, spread: 40, sparse: true });
        cv.classList.add("ready");
      });
    }
    el("i", "grn", b);
    if (locked) b.insertAdjacentHTML("beforeend", '<span class="lk">' + ICON.lock + "</span>");
    const bw = w - gp2 * 2,
      bh = h - gp2 * 2;
    if (bw >= 112 && bh >= 58) {
      const cfs = clamp(Math.min(bw * 0.13, bh * 0.22), 15, 40),
        lb = el("span", "lbl", b);
      lb.style.setProperty("--cfs", cfs + "px");
      const nm = el("b", "", lb);
      nm.textContent = c.label;
      if (n && !locked) {
        const em = el("em", "", lb);
        em.textContent = fmtN(n);
      }
    }
    b.onclick = () => openCat(cx, k);
    b.onpointerenter = () => hotCat(cx, b, c, n, true);
    b.onpointerleave = () => hotCat(cx, b, c, n, false);
    b.onfocus = () => hotCat(cx, b, c, n, true);
    b.onblur = () => hotCat(cx, b, c, n, false);
  });
  cx.catRun = true;
  cx.life.timeout(() => catPump(cx), 30);
}

function hotCat(cx: Cx, b: HTMLElement, c: GalaxyCategory, n: number | null, on: boolean): void {
  const area = b.parentElement!;
  if (!on) {
    b.classList.remove("hot");
    area.classList.remove("hasHot");
    hideBanner(cx);
    return;
  }
  if (cx.ST.lv !== "fam") return;
  b.classList.add("hot");
  area.classList.add("hasHot");
  const ar = area.getBoundingClientRect(),
    fam = cx.ST.fam!,
    P = palette(fam);
  showBanner(cx, {
    name: c.label,
    meta: n ? `<span class="mi">${ICON.stack}${fmtN(n)}</span>` : cx.famById.get(fam)!.status === "locked" ? `<span class="mi">${ICON.lock}</span>` : "",
    pal: P,
    x: ar.left + ar.width / 2,
    y: ar.top + ar.height / 2,
  });
}

export function openFam(cx: Cx, id: string): void {
  const f = cx.famById.get(id);
  if (!f) return;
  const { ST } = cx;
  ST.fam = id;
  ST.cat = null;
  ST.type = null;
  ST.tpl = null;
  buildLib(cx, id);
  hideBanner(cx);
  setLv(cx, "fam");
  cx.life.timeout(() => {
    const c = $(cx, ".cat", cx.els.libView);
    if (c) c.focus({ preventScroll: true });
  }, 1100);
}

export function openCat(cx: Cx, k: number): void {
  const c = cx.famSorted[k];
  if (!c || !cx.ST.fam) return;
  cx.ST.cat = c.id;
  cx.SV.list = cx.famSorted;
  const b = $(cx, '.cat[data-k="' + k + '"]', cx.els.libView),
    r = b ? b.getBoundingClientRect() : null;
  if (r) {
    cx.root.style.setProperty("--ox", r.left + r.width / 2 + "px");
    cx.root.style.setProperty("--oy", r.top + r.height / 2 + "px");
  }
  buildWorld(cx, cx.ST.fam);
  renderStage(cx, "cat", k, r);
  setLv(cx, "cat");
  hideBanner(cx);
}

export function closeCat(cx: Cx): void {
  const k = cx.famSorted.findIndex((c) => c.id === cx.ST.cat);
  cx.ST.cat = null;
  setLv(cx, "fam");
  cx.life.timeout(() => {
    const b = $(cx, '.cat[data-k="' + k + '"]', cx.els.libView);
    if (b) b.focus({ preventScroll: true });
  }, 500);
}

/** keyboard on an open family: step between its tiles */
export function stepCats(cx: Cx, dir: number): boolean {
  const l = [...cx.els.libView.querySelectorAll<HTMLElement>(".cat")],
    i = l.indexOf(document.activeElement as HTMLElement);
  if (!l.length) return false;
  l[clamp(i < 0 ? 0 : i + dir, 0, l.length - 1)].focus({ preventScroll: true });
  return true;
}

/** rebuild an open family after a resize */
export const rebuildLib = buildLib;
