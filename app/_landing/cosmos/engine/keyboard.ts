// KEYBOARD: arrows walk the overview's medallions then reams, the carousel,
// the stage and a family's tiles; Esc steps back; "/" opens search. Any key
// during the intro ends it.

import { stepCarousel } from "./carousel";
import { endIntro } from "./intro";
import { stepCats } from "./library";
import { back } from "./nav";
import { clamp } from "./rng";
import { closeSearch, openSearch, pickRes, renderRes } from "./search";
import { stageGo } from "./stage";
import type { Cx } from "./state";

export function wireKeyboard(cx: Cx): void {
  cx.life.on(window, "keydown", (e) => {
    cx.lastPtr = "key";
    if (cx.introOn) {
      endIntro(cx);
      if (e.key !== "Escape") return;
    }
    if (cx.searchOpen) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeSearch(cx);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        cx.sel = Math.min(cx.sres.length - 1, cx.sel + 1);
        renderRes(cx);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        cx.sel = Math.max(0, cx.sel - 1);
        renderRes(cx);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (cx.sres[cx.sel]) pickRes(cx, cx.sres[cx.sel]);
      }
      return;
    }
    const tag = (e.target as HTMLElement | null)?.tagName || "";
    if (e.key === "/" && tag !== "INPUT") {
      e.preventDefault();
      openSearch(cx);
      return;
    }
    if (e.key === "Escape") {
      if (cx.ST.lv !== "root") {
        e.preventDefault();
        back(cx);
      }
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const nx = e.key === "ArrowRight" || e.key === "ArrowDown",
      pv = e.key === "ArrowLeft" || e.key === "ArrowUp";
    const lv = cx.ST.lv;
    if (lv === "root" && (nx || pv || e.key === "Home" || e.key === "End")) {
      const l = [...cx.medEls, ...cx.reamEls],
        i = l.indexOf(document.activeElement as HTMLButtonElement);
      let j: number;
      if (e.key === "Home") j = 0;
      else if (e.key === "End") j = l.length - 1;
      else if (i < 0) j = nx ? 0 : l.length - 1;
      else j = clamp(i + (nx ? 1 : -1), 0, l.length - 1);
      e.preventDefault();
      if (l[j]) l[j].focus({ preventScroll: true });
    } else if (lv === "type" && (nx || pv || e.key === "Home" || e.key === "End")) {
      e.preventDefault();
      const i = Math.round(cx.CAR.target);
      stepCarousel(cx, e.key === "Home" ? 0 : e.key === "End" ? cx.CAR.n - 1 : i + (nx ? 1 : -1));
    } else if ((lv === "tpl" || lv === "cat") && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      e.preventDefault();
      stageGo(cx, cx.SV.idx + (e.key === "ArrowRight" ? 1 : -1));
    } else if (lv === "fam" && (nx || pv)) {
      if (stepCats(cx, nx ? 1 : -1)) e.preventDefault();
    }
  });
}
