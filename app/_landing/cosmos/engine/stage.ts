// STAGE: a template or a category at full size, with its title strip, chips,
// the studio steps (templates) and previous / next.

import type { GalaxyCategory, GalaxyTemplate } from "../types";
import { paperStrip } from "./banner";
import { syncCarousel } from "./carousel";
import { el, ICON } from "./dom";
import { fmtDur, fmtN, stageGeom } from "./layout";
import { renderNav } from "./nav";
import { palette } from "./palette";
import { artGet, artPut, drawInto, type Surface } from "./raster";
import { clamp, hash32 } from "./rng";
import { $, type Cx } from "./state";

export function renderStage(cx: Cx, kind: "tpl" | "cat", idx: number, flip: DOMRect | null): void {
  const { ST, SV, g } = cx;
  const v = cx.els.stageView;
  v.innerHTML = "";
  SV.kind = kind;
  SV.idx = idx;
  const s = stageGeom(g),
    item = SV.list[idx];
  const isT = kind === "tpl",
    parent = (isT ? ST.type : ST.fam) || "";
  const P = palette(parent);
  v.style.setProperty("--aw", s.aw + "px");
  v.style.setProperty("--svbg", isT ? "transparent" : palette(ST.fam || "").t("deep", -2));
  el("div", "sv-bg", v);
  const art = el("div", "sv-art" + (item.art ? " real" : ""), v);
  art.style.cssText += `left:${s.ax}px;top:${s.ay}px;width:${s.aw}px;height:${s.ah}px`;
  const holder = el("div", "art", art);
  const label = item.label,
    locked = !isT && cx.famById.get(ST.fam || "")?.status === "locked";
  art.setAttribute("role", "img");
  art.setAttribute("aria-label", label + (item.art ? ", key art" : ", stylised illustration"));
  if (item.art) {
    const im = new Image();
    im.src = item.art;
    im.alt = "";
    im.draggable = false;
    holder.appendChild(im);
  } else {
    const cv = el("canvas", "", holder),
      w = Math.round(s.aw * 0.955),
      h = Math.round(s.ah * 0.9),
      rs = (cx.tier === "full" ? clamp(g.DPR, 1, 1.5) : 1) * (s.aw > 800 ? 0.85 : 1),
      o = isT ? null : { spread: 40, sparse: true },
      key = `stage|${item.id}|${parent}|${w}x${h}|${rs}`,
      tok = ++cx.stageTok;
    const show = (x: Surface) => {
      drawInto(cv, x);
      cv.classList.add("ready");
    };
    const hit = artGet(key);
    if (hit) show(hit);
    else
      void cx.raster.run({ rs, layers: [{ w, h, ops: [{ p: "diorama", w, h, id: item.id, parent, o }] }] }, -2, "stage").then((r) => {
        if (!r) return;
        artPut(key, r.out[0]);
        if (tok === cx.stageTok && !cx.life.dead) show(r.out[0]);
      });
  }
  const side = el("div", "sv-side", v);
  side.style.cssText += `left:${s.sx}px;top:${s.sy}px;width:${s.sw}px;${s.sh ? "height:" + s.sh + "px;justify-content:center;" : ""}`;
  const ps = paperStrip(cx, side, label, "sv", P, hash32(label));
  const fs = clamp(g.S * 0.07 * (label.length > 16 ? 0.88 : 1) * (label.length > 26 ? 0.85 : 1), 26, 130);
  ps.h.style.setProperty("--svfs", fs + "px");
  const chips = el("div", "sv-chips", side);
  if (isT) {
    const sec = (item as GalaxyTemplate).seconds;
    if (typeof sec === "number") chips.innerHTML = `<span class="chipx">${ICON.clock}${fmtDur(sec)}</span>`;
  } else {
    const n = (item as GalaxyCategory).items;
    if (locked) chips.innerHTML = `<span class="chipx">${ICON.lock}</span>`;
    else if (typeof n === "number" && n > 0) chips.innerHTML = `<span class="chipx">${ICON.stack}${fmtN(n)}</span>`;
  }
  if (isT && cx.steps.length) {
    const st = el("div", "steps", side);
    cx.steps.forEach((x, i) => {
      if (i) el("i", "", st);
      const sp = el("span", "", st);
      sp.textContent = x;
    });
  }
  const nav = el("div", "sv-nav", v);
  nav.style.cssText += `left:${s.nav[0]}px;top:${s.nav[1]}px;width:${s.nav[2]}px`;
  const pv = SV.list[idx - 1],
    nx = SV.list[idx + 1];
  const mk = (it: { label: string } | undefined, ic: string, dir: number) => {
    const b = el("button", "", nav);
    b.type = "button";
    if (!it) b.style.visibility = "hidden";
    b.setAttribute("aria-label", (dir < 0 ? "Previous: " : "Next: ") + (it ? it.label : ""));
    b.innerHTML = dir < 0 ? ic + "<span></span>" : "<span></span>" + ic;
    const sp = $(cx, "span", b)!;
    if (it) sp.textContent = it.label;
    else b.disabled = true;
    if (it) b.onclick = () => stageGo(cx, idx + dir);
  };
  mk(pv, ICON.prev, -1);
  mk(nx, ICON.next, 1);
  if (flip) {
    const to = art.getBoundingClientRect(),
      from = flip,
      sc = from.width / to.width;
    art.style.transition = "none";
    art.style.transform = `translate(${from.left - to.left}px,${from.top - to.top}px) scale(${sc})`;
    void art.offsetWidth;
    art.style.transition = cx.RM ? "transform .01s" : "transform .95s cubic-bezier(.62,.02,.18,1)";
    art.style.transform = "none";
  } else art.style.animation = "pc-svIn .55s cubic-bezier(.2,.9,.25,1) both";
}

export function stageGo(cx: Cx, i: number): void {
  const { SV, ST } = cx;
  if (i < 0 || i >= SV.list.length || !SV.kind) return;
  if (SV.kind === "tpl") {
    ST.tpl = SV.list[i].id;
    syncCarousel(cx, i);
  } else ST.cat = SV.list[i].id;
  renderStage(cx, SV.kind, i, null);
  renderNav(cx);
}
