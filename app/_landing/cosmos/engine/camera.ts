// Parallax and dolly: transforms only. The step lives on the one frame loop
// (Life.want) and gives its slot back once the camera has settled. It moves
// whatever planes the tier built: about sixteen in `full`, the three bands in
// `lite`; `still` has no parallax (cx.RM). A covered overview is not moved.
//
// PAUSING: a hidden tab, a root scrolled out of view, and an overview fully
// covered by a type's world all stop the idle motion (animation-play-state) and
// the overview's frames; a covered overview is also taken out of compositing
// (visibility) until the way back to it starts.

import { clamp } from "./rng";
import type { Cx, Plane } from "./state";

function applyPlane(cx: Cx, p: Plane, A: number, dolly: number): void {
  const { cam } = cx,
    { H } = cx.g;
  const x = -(cam.px + cam.dx) * A * p.d,
    y = -(cam.py + cam.dy) * A * p.d * 0.6 - dolly * H * 0.035 * p.d,
    sc = 1 + dolly * 0.045 * p.d;
  if (cx.tier === "full") p.pl.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) scale(${sc.toFixed(4)})`;
  // lite: whole pixels and no identity scale. A software compositor blits a
  // layer at an integer offset and filters one at a fractional offset or scale,
  // which is most of what a parallax frame costs it.
  else p.pl.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)` + (Math.abs(sc - 1) > 0.0005 ? ` scale(${sc.toFixed(4)})` : "");
}

function frame(cx: Cx, now: number): boolean {
  const { cam } = cx;
  const dt = clamp(now - (cam.lastT || now - 16), 1, 100);
  cam.lastT = now;
  const f60 = dt / 16.7;
  if (cx.RM) cam.px = cam.py = cam.dolly = 0;
  const k = 1 - Math.pow(1 - 0.085, f60);
  cam.px += (cam.tx - cam.px) * k;
  cam.py += (cam.ty - cam.py) * k;
  if (!cam.drag) {
    const d = Math.pow(0.9, f60);
    cam.dx *= d;
    cam.dy *= d;
  }
  if (now - cam.wheelT > 800) cam.dolly *= Math.pow(0.94, f60);
  const A = cx.g.W * (cx.g.portrait ? 0.018 : 0.03);
  const inRoot = cx.ST.lv === "root";
  if (!cx.covered) cx.planes.forEach((p) => p.d && applyPlane(cx, p, A, inRoot ? cam.dolly : 0));
  cx.wplanes.forEach((p) => p.d && applyPlane(cx, p, A * 1.1, 0));
  const moving =
    Math.abs(cam.tx - cam.px) > 0.002 ||
    Math.abs(cam.ty - cam.py) > 0.002 ||
    Math.abs(cam.dx) > 0.002 ||
    Math.abs(cam.dy) > 0.002 ||
    Math.abs(cam.dolly) > 0.002 ||
    !!cam.drag;
  if (moving && !document.hidden) return true;
  cam.lastT = 0;
  return false;
}

export function frameReq(cx: Cx): void {
  cx.life.want("camera", (now) => frame(cx, now));
}

function setLook(cx: Cx, nx: number, ny: number): void {
  if (cx.RM) return;
  cx.gov?.kick("move", 2000);
  cx.cam.tx = clamp(nx, -1, 1);
  cx.cam.ty = clamp(ny, -1, 1);
  frameReq(cx);
}

/** pointer parallax, the wheel's dolly, and waking on a visible tab */
export function wireCamera(cx: Cx): void {
  const { life, cam } = cx;
  life.on(
    window,
    "pointermove",
    (e) => {
      if (e.pointerType === "touch" && !cam.drag) return;
      if (cam.drag) {
        cam.dx = clamp(cam.drag.ox + (e.clientX - cam.drag.x) / (cx.g.W * 0.25), -1.4, 1.4);
        cam.dy = clamp(cam.drag.oy + (e.clientY - cam.drag.y) / (cx.g.H * 0.25), -1.4, 1.4);
        frameReq(cx);
        return;
      }
      setLook(cx, (e.clientX / cx.g.W - 0.5) * 2, (e.clientY / cx.g.H - 0.5) * 2);
    },
    { passive: true },
  );
  life.on(window, "pointerleave", () => setLook(cx, 0, 0));
  life.on(
    window,
    "wheel",
    (e) => {
      if (cx.ST.lv !== "root" || cx.searchOpen) return;
      cam.dolly = clamp(cam.dolly + e.deltaY * 0.0012, -0.5, 1);
      cam.wheelT = performance.now();
      frameReq(cx);
    },
    { passive: true },
  );
}

/** the overview is covered from when a level's world finishes opening until the way back starts */
export function setCovered(cx: Cx, on: boolean): void {
  if (cx.covered === on) return;
  cx.covered = on;
  cx.root.classList.toggle("covered", on);
  if (!on) frameReq(cx);
}

/** tab hidden or root off screen: idle motion and the frame loop stop */
export function wirePause(cx: Cx): void {
  const { life, root } = cx;
  let off = false;
  const sync = () => {
    const paused = document.hidden || off;
    root.classList.toggle("paused", paused);
    if (!paused) frameReq(cx);
  };
  life.on(document, "visibilitychange", sync);
  if (typeof IntersectionObserver === "function") {
    const io = life.observe(
      new IntersectionObserver((es) => {
        off = !es.some((e) => e.isIntersecting);
        sync();
      }),
    );
    io.observe(root);
  }
}
