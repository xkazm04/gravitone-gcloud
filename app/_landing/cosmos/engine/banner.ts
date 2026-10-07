// The banner: the hovered name, cut from paper, at centre stage. Also the
// paper title strip the views use, which shares its torn edges.

import { el } from "./dom";
import { tornClip } from "./layout";
import type { Palette } from "./palette";
import { hash32 } from "./rng";
import { $, type Cx } from "./state";

export interface BannerSpec {
  name: string;
  meta?: string;
  pal?: Palette | null;
  x: number;
  y: number;
}

export function showBanner(cx: Cx, o: BannerSpec): void {
  const bannerEl = cx.els.banner;
  const nm = $(cx, ".bn-name", bannerEl)!,
    mt = $(cx, ".bn-meta", bannerEl)!,
    fr = $(cx, ".bn-front", bannerEl)!,
    bk = $(cx, ".bn-back", bannerEl)!;
  const { W, S, portrait } = cx.g;
  nm.textContent = o.name;
  mt.innerHTML = o.meta || "";
  const P = o.pal;
  bannerEl.style.setProperty("--bn1", P ? P.t("paper", -1) : "var(--pc-bone)");
  bannerEl.style.setProperty("--bn2", P ? P.k.acc : "var(--pc-coral)");
  bannerEl.style.setProperty("--bnink", P ? P.t("deep", -2, 6) : "var(--pc-ink)");
  bannerEl.style.setProperty("--bnfs", S * 0.085 + "px");
  bannerEl.style.left = o.x + "px";
  bannerEl.style.top = o.y + "px";
  const maxW = W * (portrait ? 0.92 : 0.6);
  let w = fr.offsetWidth;
  if (w > maxW) {
    bannerEl.style.setProperty("--bnfs", ((S * 0.085 * maxW) / w) * 0.97 + "px");
    w = fr.offsetWidth;
  }
  const h = fr.offsetHeight,
    sd = hash32(o.name);
  fr.style.clipPath = tornClip(w, h, 5, sd);
  bk.style.clipPath = tornClip(w + 18, h + 15, 6, sd ^ 0x55);
  bannerEl.classList.add("on");
}

export function hideBanner(cx: Cx): void {
  cx.els.banner.classList.remove("on");
}

/** a title cut from paper: a coloured back sheet and a torn front sheet */
export function paperStrip(cx: Cx, host: HTMLElement, text: string, cls: string, P: Palette, seed: number): { w: HTMLDivElement; h: HTMLHeadingElement } {
  const w = el("div", "pstrip " + cls, host),
    b = el("i", "pb", w),
    h = el("h1", "pt", w);
  h.textContent = text;
  w.style.setProperty("--p1", P.t("paper", -1));
  w.style.setProperty("--p2", P.k.acc);
  w.style.setProperty("--pink", P.t("deep", -2, 6));
  const fit = () => {
    const ww = h.offsetWidth,
      hh = h.offsetHeight;
    if (!ww) return;
    h.style.clipPath = tornClip(ww, hh, 5, seed);
    b.style.clipPath = tornClip(ww + 17, hh + 14, 6, seed ^ 0x33);
  };
  fit();
  if (typeof ResizeObserver === "function") {
    // retire observers whose strip a view rebuild has already thrown away
    cx.strips = cx.strips.filter((s) => {
      if (s.el.isConnected) return true;
      cx.life.unobserve(s.ro);
      return false;
    });
    const ro = cx.life.observe(new ResizeObserver(fit));
    ro.observe(h);
    cx.strips.push({ ro, el: h });
  }
  return { w, h };
}
