// LEVELS: root > type | family > template | category. The level is a class on
// the root (lv-*) that the stylesheet animates from; this module flips it, keeps
// the crumbs, back button and depth stack true, and routes every way of moving.

import { hideBanner, showBanner } from "./banner";
import { frameReq, setCovered } from "./camera";
import { buildTypeView, closeTpl, focusCard, openTpl } from "./carousel";
import { el, ICON } from "./dom";
import { closeCat, openCat, openFam } from "./library";
import { famItems, fmtN } from "./layout";
import { palette } from "./palette";
import { buildWorld, prewarmWorld } from "./scene";
import { closeSearch } from "./search";
import type { Cx, Level } from "./state";

const levelOf: Record<Level, number> = { root: 0, type: 1, fam: 1, tpl: 2, cat: 2 };
export const tplOf = (cx: Cx, id: string | null) => cx.templates.find((x) => x.id === id);
export const catOf = (cx: Cx, famId: string | null, id: string | null) => {
  const f = famId ? cx.famById.get(famId) : undefined;
  return f && f.categories.find((x) => x.id === id);
};
const LV_CLASSES = ["lv-type", "lv-tpl", "lv-fam", "lv-cat"];

/** the world's reveal is over by then: .38 s delay + 1.15 s clip-path in full,
 *  .2 s + .3 s crossfade in lite, .15 s in still; and in lite and still the
 *  crossfade waits for the world's pixels (its .2 s delay and .3 s fade then
 *  run from when they land), so the overview stays until it ends */
const COVER_MS = { full: 1700, lite: 550, still: 300 };
const FADE_MS = { full: 0, lite: 550, still: 200 };

function tryCover(cx: Cx): void {
  const due = cx.worldReady && performance.now() - cx.worldReadyAt >= FADE_MS[cx.tier];
  if (due) setCovered(cx, true);
  else cx.coverT = cx.life.timeout(() => tryCover(cx), 100);
}

export function setLv(cx: Cx, lv: Level): void {
  const { root, els } = cx;
  const was = cx.ST.lv;
  cx.ST.lv = lv;
  if (was !== lv) cx.gov?.kick("level", 2000);
  const covering = lv === "type" || lv === "tpl" || lv === "cat";
  cx.life.clear(cx.coverT);
  cx.coverT = 0;
  if (!covering) setCovered(cx, false);
  else if (!cx.covered) cx.coverT = cx.life.timeout(() => tryCover(cx), COVER_MS[cx.tier]);
  root.dataset.lv = lv;
  root.classList.remove(...LV_CLASSES);
  if (lv !== "root") root.classList.add("lv-" + lv);
  if (cx.medalsEl) cx.medalsEl.inert = lv !== "root";
  if (cx.reamsEl) cx.reamsEl.inert = lv !== "root";
  els.typeView.inert = lv !== "type";
  els.stageView.inert = !(lv === "tpl" || lv === "cat");
  els.libView.inert = lv !== "fam";
  renderNav(cx);
}

export function currentPath(cx: Cx): string[] {
  const { ST } = cx;
  if (ST.type) return ST.tpl ? [ST.type, ST.tpl] : [ST.type];
  if (ST.fam) return ST.cat ? [ST.fam, ST.cat] : [ST.fam];
  return [];
}

export function renderNav(cx: Cx): void {
  const { ST } = cx;
  type Crumb = { root?: boolean; label: string; go?: () => void; cur?: boolean };
  const a: Crumb[] = [{ root: true, label: "Overview", go: () => void navTo(cx, { lv: "root" }) }];
  if (ST.type) {
    const t = cx.typeById.get(ST.type)!;
    const type = ST.type;
    a.push({ label: t.label, go: () => void navTo(cx, { lv: "type", type }), cur: ST.lv === "type" });
    if (ST.tpl) a.push({ label: tplOf(cx, ST.tpl)!.label, cur: true });
  } else if (ST.fam) {
    const f = cx.famById.get(ST.fam)!;
    const fam = ST.fam;
    a.push({ label: f.label, go: () => void navTo(cx, { lv: "fam", fam }), cur: ST.lv === "fam" });
    if (ST.cat) a.push({ label: catOf(cx, ST.fam, ST.cat)!.label, cur: true });
  } else a[0].cur = true;
  const box = cx.els.crumbs;
  box.innerHTML = "";
  const show = cx.g.portrait && a.length > 2 ? [a[0], a[a.length - 1]] : a;
  show.forEach((x, i) => {
    if (i) box.insertAdjacentHTML("beforeend", '<span class="sep" aria-hidden="true">›</span>');
    const b = el("button", "crumb" + (x.root ? " root" : ""), box);
    b.type = "button";
    if (x.root) {
      b.innerHTML = ICON.home;
      b.setAttribute("aria-label", x.label);
    } else b.textContent = x.label;
    if (x.cur) b.setAttribute("aria-current", "page");
    else if (x.go) b.onclick = x.go;
  });
  cx.els.back.disabled = ST.lv === "root";
  const lvl = levelOf[ST.lv],
    dp = cx.els.depth;
  dp.innerHTML = "";
  const labs = [
    "Overview",
    ST.type ? cx.typeById.get(ST.type)!.label : ST.fam ? cx.famById.get(ST.fam)!.label : "",
    ST.tpl ? tplOf(cx, ST.tpl)!.label : ST.cat ? catOf(cx, ST.fam, ST.cat)!.label : "",
  ];
  for (let i = 0; i < 3; i++) {
    const b = el("button", i === lvl ? "cur" : "", dp);
    b.type = "button";
    b.setAttribute("aria-label", labs[i] || "Level " + (i + 1));
    if (i > lvl) b.disabled = true;
    else if (i !== lvl)
      b.onclick = () => {
        if (i === 0) void navTo(cx, { lv: "root" });
        else if (cx.ST.type) void navTo(cx, { lv: "type", type: cx.ST.type });
        else void navTo(cx, { lv: "fam", fam: cx.ST.fam });
      };
    if (i === lvl) b.setAttribute("aria-current", "step");
  }
}

/* ---------- navigation ---------- */
function resetInstant(cx: Cx): void {
  cx.root.classList.add("skip");
  cx.ST.type = cx.ST.tpl = cx.ST.fam = cx.ST.cat = null;
  setLv(cx, "root");
  hideBanner(cx);
  cx.medEls.forEach((b) => b.classList.remove("chosen"));
  cx.life.raf(() => cx.life.raf(() => cx.root.classList.remove("skip")));
}

export interface NavTarget {
  lv: Level;
  type?: string | null;
  tpl?: string | null;
  fam?: string | null;
  cat?: string | null;
}

export async function navTo(cx: Cx, t: NavTarget, opts?: { fast?: boolean }): Promise<void> {
  const o = opts || {};
  const { ST, life } = cx;
  const tok = ++cx.navTok;
  const same = t.lv === "type" || t.lv === "tpl" ? ST.type === t.type : t.lv === "fam" || t.lv === "cat" ? ST.fam === t.fam : false;
  if (t.lv === "root") {
    ST.type = ST.tpl = ST.fam = ST.cat = null;
    setLv(cx, "root");
    hideBanner(cx);
    const op = ST.opener;
    life.timeout(() => {
      if (cx.navTok === tok && ST.lv === "root") cx.medEls.forEach((b) => b.classList.remove("chosen"));
    }, 1300);
    if (op && cx.root.contains(op)) life.timeout(() => op.focus({ preventScroll: true }), o.fast ? 0 : 350);
    return;
  }
  if (!same && ST.lv !== "root") {
    resetInstant(cx);
    await life.sleep(60);
    if (tok !== cx.navTok) return;
  }
  if (t.lv === "type") {
    if (ST.type === t.type && ST.lv === "tpl") {
      closeTpl(cx);
      return;
    }
    if (ST.type !== t.type && t.type) openType(cx, t.type);
    return;
  }
  if (t.lv === "tpl") {
    if (ST.type !== t.type && t.type) {
      openType(cx, t.type);
      await life.sleep(o.fast ? 400 : 1150);
      if (tok !== cx.navTok) return;
    }
    if (ST.lv === "type" || ST.lv === "tpl") {
      const i = (cx.tplByType.get(t.type || "") || []).findIndex((x) => x.id === t.tpl);
      if (i >= 0) openTpl(cx, i);
    }
    return;
  }
  if (t.lv === "fam") {
    if (ST.fam === t.fam && ST.lv === "cat") {
      closeCat(cx);
      return;
    }
    if (ST.fam !== t.fam && t.fam) openFam(cx, t.fam);
    return;
  }
  if (t.lv === "cat") {
    if (ST.fam !== t.fam && t.fam) {
      openFam(cx, t.fam);
      await life.sleep(o.fast ? 450 : 1050);
      if (tok !== cx.navTok) return;
    }
    const i = cx.famSorted.findIndex((c) => c.id === t.cat);
    if (i >= 0) openCat(cx, i);
  }
}

export function back(cx: Cx): void {
  if (cx.searchOpen) {
    closeSearch(cx);
    return;
  }
  cx.root.classList.add("quick");
  cx.life.timeout(() => cx.root.classList.remove("quick"), 900);
  if (cx.ST.lv === "tpl") closeTpl(cx);
  else if (cx.ST.lv === "cat") closeCat(cx);
  else if (cx.ST.lv !== "root") void navTo(cx, { lv: "root" });
}

/* ---------- root: hovering and choosing ---------- */
function hotOn(cx: Cx, b: HTMLElement): void {
  if (cx.ST.lv !== "root") return;
  if (cx.hotEl && cx.hotEl !== b) cx.hotEl.classList.remove("hot");
  cx.hotEl = b;
  // a pointer or focus resting here is the click that usually follows: paint its world now
  const id = b.dataset.id;
  cx.life.clear(cx.preT);
  if (id) cx.preT = cx.life.timeout(() => prewarmWorld(cx, id), 120);
  const { L, g } = cx;
  if (b.classList.contains("med")) {
    const t = cx.typeById.get(b.dataset.id!)!,
      n = (cx.tplByType.get(t.id) || []).length;
    showBanner(cx, { name: t.label, meta: n ? `<span class="mi">${ICON.stack}${n}</span>` : "", pal: palette(t.id), x: L.cx, y: L.cy });
  } else {
    const f = cx.famById.get(b.dataset.id!)!,
      tot = famItems(f),
      locked = f.status === "locked";
    showBanner(cx, {
      name: f.label,
      meta: locked ? `<span class="mi">${ICON.lock}</span>` : tot ? `<span class="mi">${ICON.stack}${fmtN(tot)}</span>` : "",
      pal: palette(f.id),
      x: L.cx,
      y: Math.min(L.cy, g.H * 0.4),
    });
  }
}
function hotOff(cx: Cx, b: HTMLElement): void {
  cx.life.clear(cx.preT);
  if (cx.hotEl === b) {
    b.classList.remove("hot");
    cx.hotEl = null;
    hideBanner(cx);
  }
}

/** hover, focus and click on the overview's medallions and reams, and the
 *  background drag. Bound to the scene element, which outlives rebuilds. */
export function wireRoot(cx: Cx): void {
  const host = cx.els.scene,
    { life, cam } = cx;
  const target = (e: Event) => (e.target as Element | null)?.closest?.<HTMLElement>(".med,.ream") ?? null;
  life.on(host, "pointerover", (e) => {
    const b = target(e);
    if (b && e.pointerType !== "touch") hotOn(cx, b);
  });
  life.on(host, "pointerout", (e) => {
    const b = target(e);
    if (b && e.pointerType !== "touch" && !b.contains(e.relatedTarget as Node | null)) hotOff(cx, b);
  });
  life.on(host, "focusin", (e) => {
    const b = target(e);
    if (b && cx.lastPtr !== "touch") hotOn(cx, b);
  });
  life.on(host, "focusout", (e) => {
    const b = target(e);
    if (b) hotOff(cx, b);
  });
  life.on(host, "click", (e) => {
    const b = target(e);
    if (!b || cx.ST.lv !== "root") return;
    if (((e as PointerEvent).pointerType === "touch" || cx.lastPtr === "touch") && cx.hotEl !== b) {
      hotOn(cx, b);
      b.classList.add("hot");
      return;
    }
    cx.ST.opener = b;
    if (b.classList.contains("med")) openType(cx, b.dataset.id!);
    else openFam(cx, b.dataset.id!);
  });
  life.on(host, "pointerdown", (e) => {
    if (cx.ST.lv !== "root" || e.button || target(e)) return;
    cam.drag = { x: e.clientX, y: e.clientY, ox: cam.dx, oy: cam.dy };
    cx.root.classList.add("dragging");
    const offs: (() => void)[] = [];
    const up = () => {
      cam.drag = null;
      cx.root.classList.remove("dragging");
      offs.forEach((f) => f());
      frameReq(cx);
    };
    offs.push(life.on(window, "pointerup", up), life.on(window, "pointercancel", up));
  });
}

export function openType(cx: Cx, id: string): void {
  const t = cx.typeById.get(id);
  if (!t) return;
  const { ST } = cx;
  ST.type = id;
  ST.tpl = null;
  ST.fam = null;
  ST.cat = null;
  const i = cx.types.indexOf(t),
    m = cx.L.med[i];
  cx.root.style.setProperty("--ox", m.x + "px");
  cx.root.style.setProperty("--oy", m.y + "px");
  cx.medEls.forEach((b, j) => {
    const q = cx.L.med[j];
    b.classList.toggle("chosen", j === i);
    const dx = q.x - m.x,
      dy = q.y - m.y,
      dd = Math.hypot(dx, dy) || 1;
    b.style.setProperty("--ax", (dx / dd) * 120 + "px");
    b.style.setProperty("--ay", (dy / dd) * 90 + "px");
  });
  buildWorld(cx, id);
  buildTypeView(cx, id);
  hideBanner(cx);
  setLv(cx, "type");
  cx.life.timeout(() => {
    if (cx.ST.lv === "type") focusCard(cx);
  }, 1500);
}

