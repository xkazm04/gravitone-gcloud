// REAMS: the library as paper strata, the DOM buttons that sit on the reams plane.
// buildReams builds one button per family, sized by its item count, with its
// painted ream art (artImg) and its tab label; the tabs are staggered by layoutTabs
// (tabs.ts). The reams are DOM in every tier because they are the buttons.

import { el, ICON } from "./dom";
import { reamTone } from "./diorama";
import { tr } from "./rasterJobs";
import { clamp, hash32 } from "./rng";
import type { Cx } from "./state";
import { artImg } from "./scene";
import { layoutTabs } from "./tabs";

/* ---------- reams: the library as paper strata ---------- */
export function buildReams(cx: Cx, host: HTMLElement): void {
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
