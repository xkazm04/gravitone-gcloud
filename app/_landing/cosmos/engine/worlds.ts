// WORLDS: a type's own world, the scene behind the medallion or ream that was
// opened. worldSpec describes its planes from one seeded stream; paintWorld and
// prewarmWorld paint it in the raster worker (a prewarm is the click that usually
// follows a hover); buildWorld puts the planes into the world element and lands
// each layer as it is painted. The overview's stack builder is scene.ts.

import { frameReq } from "./camera";
import { el } from "./dom";
import { palette } from "./palette";
import { release, surfaceCanvas, type Surface } from "./raster";
import { tr, type Job, type Op } from "./rasterJobs";
import { hash32, RNG } from "./rng";
import type { Cx, Plane } from "./state";
import { addPlane, box, foldItems, full, placeItem, softRS, token, type PlaneSpec } from "./planes";

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
  const ended = cx.raster
    .paint(worldSpec(cx, id).job, prio, tag, (i, srf) => {
      if (wp.on) wp.on(i, srf);
      else wp.parts[i] = srf;
    })
    .then((r) => {
      wp.done = true;
      return typeof r === "string" ? r : "painted";
    });
  ENDED.set(wp, ended);
  return wp;
}

/** how each world job ended, for the buildWorld that adopts or starts it */
const ENDED = new WeakMap<object, Promise<"painted" | "dropped" | "failed">>();

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
  if (wp && wp.key === worldKey(cx, id)) {
    cx.worldPre = null;
    // it was queued behind the family's tiles at the prewarm's priority; this world is open now
    cx.raster.bump("prewarm", -1, "world");
  } else {
    dropPrewarm(cx); // a prewarm for another world is let go before this one paints
    wp = paintWorld(cx, id, -1, "world");
  }
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
  // a world that could not be painted lands empty, on its own colour: left unready it
  // would hold the overview up behind it for as long as the level stays open
  void ENDED.get(wp)?.then((how) => {
    if (how !== "failed" || tok !== cx.worldTok || cx.life.dead || landed >= items.length) return;
    if (!keep) stack.classList.add("wready");
    cx.worldReady = true;
    cx.worldReadyAt = performance.now();
  });
}
