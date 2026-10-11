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

import { frameReq } from "./camera";
import { el } from "./dom";
import { layout0 } from "./layout";
import { release, surfaceCanvas, urlGet, urlPut, yieldMain } from "./raster";
import type { Job } from "./rasterJobs";
import type { Cx, Plane } from "./state";
import { addPlane, box, fold, placeItem, softRS, token, type PlaneSpec } from "./planes";
import { sceneSpec } from "./sceneSpec";
import { buildMedals } from "./medalLayer";
import { buildReams } from "./reams";

export { layoutTabs } from "./tabs";
export { buildWorld, dropPrewarm, prewarmWorld } from "./worlds";

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
export function artImg(cx: Cx, img: HTMLImageElement, key: string, w: number, h: number, job: Job): void {
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
