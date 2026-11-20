// THE MAP'S ENGINE - mounted on a <canvas> by ui/MapCanvas.tsx (port of the winner's map.js interaction and main.js
// frame loop). Imperative by design: it owns the frame loop (the reels' steps, the camera's flight, the water running
// east on first load, the particles, the draw), the pointer (drag pans, the wheel zooms about the pointer, a click
// answers by level, right-click or a long press opens the menu, a double click zooms in) and the hover. It writes the
// store's camera and UI state directly; React hears through st.changed(). Answers the unmount.

import { tick } from "../acts.ts";
import { anchorOf, anchorPoint } from "../scene/scopes.ts";
import { LH, LW } from "../scene/geo.ts";
import type { Hit, Scope } from "../scene/types.ts";
import type { CanvasStore } from "../store.ts";
import { BLOCK, levelOf, type BlockKind } from "../tables.ts";
import { readPalette } from "../tokens.ts";
import { clampCam, fitZ, flyTo, locate, stepFlight, stopFlight, toS, toW, zoomBy } from "./camera.ts";
import { draw } from "./frame.ts";
import { pickAt, toHit, type Pick } from "./hit.ts";
import { Z } from "./prims.ts";
import { rs, type Hot, type MapHit } from "./state.ts";
import { tipOf, type Tip } from "./tip.ts";

/** What the engine tells the component: the tip, the cursor, where the pointer is. */
export type MapView = {
  readonly setTip: (t: Tip | null) => void;
  readonly setDragging: (on: boolean) => void;
  readonly setPointy: (on: boolean) => void;
  readonly placeTip: () => void;
  readonly mouse: { current: [number, number] };
};

const LONG_PRESS_MS = 550;

const sameMapHit = (a: MapHit | null, b: MapHit | null): boolean => {
  if (a === null || b === null) return a === b;
  if (a.type !== b.type) return false;
  if (a.type === "block" && b.type === "block") return a.kind === b.kind && a.scope.type === b.scope.type && ("ref" in a.scope && "ref" in b.scope ? a.scope.ref === b.scope.ref : true);
  return "ref" in a && "ref" in b ? a.ref === b.ref : true;
};

/** A blocking point opens the surface that clears it. */
export function openTool(st: CanvasStore, kind: BlockKind, scope: Scope): void {
  if (BLOCK[kind].tool === "gallery") st.openSurface({ kind: "gallery", scope, block: kind, focus: null });
  else st.openSurface({ kind: "audio", scope });
}

/** What a menu opened on a hit is about: a weir's scope, a slot's port, a place; the song port is the Songs basin. */
function targetOf(st: CanvasStore, h: MapHit | null): Hit | null {
  if (h === null) return null;
  let t: Hit | null;
  if (h.type === "block") t = h.scope.type === "all" ? null : h.scope;
  else if (h.type === "slot") {
    const port = st.scene.chanById.get(h.ref.channel)?.port ?? null;
    t = port === null ? null : { type: "port", ref: port };
  } else if (h.type === "night" || h.type === "note" || h.type === "station") t = null;
  else t = h;
  if (t !== null && t.type === "port" && t.ref.song) {
    const song = st.scene.basins.find((b) => b.key === "song");
    t = song === undefined ? null : { type: "basin", ref: song };
  }
  return t;
}

/** Right-click, long press: the note first, then what can be done here. x, y are client (viewport) px. */
function openMenu(st: CanvasStore, h: MapHit | null, x: number, y: number): void {
  if (h !== null && h.type === "night") return st.openSurface({ kind: "brief" });
  if (h !== null && h.type === "note") {
    const n = st.ui.notes.find((v) => v.id === h.ref);
    if (n !== undefined) st.openMenu(x, y, null, { kind: n.kind, key: n.key, name: n.name });
    return;
  }
  const target = targetOf(st, h);
  if (target === null) return st.closeMenu();
  st.openMenu(x, y, target, anchorOf(target));
}

/** A click answers by level: far out it flies in, close in it opens. */
function activate(st: CanvasStore, pick: Pick | null, rect: DOMRect): void {
  const z = st.ui.cam.z;
  if (pick === null) return st.closeSheet();
  const h = pick.hit;
  if (h.type === "block") return openTool(st, h.kind, h.scope);
  if (h.type === "night") return st.openSurface({ kind: "brief" });
  if (h.type === "note") {
    const n = st.ui.notes.find((v) => v.id === h.ref);
    const pt = n === undefined ? null : anchorPoint(st.scene, n);
    if (n === undefined || pt === null) return;
    const [px, py] = toS(st, pt[0], pt[1]);
    return st.openMenu(px + rect.left, py + rect.top, null, { kind: n.kind, key: n.key, name: n.name });
  }
  if (h.type === "slot") {
    const port = st.scene.chanById.get(h.ref.channel)?.port ?? null;
    if (port !== null) openTool(st, "slot", { type: "port", ref: port });
    return;
  }
  if (pick.soft && (h.type === "prov" || h.type === "basin")) {
    if (z < Z.basin) {
      const basin = h.type === "prov" ? h.ref.basin : h.ref;
      locate(st, { type: "basin", ref: basin });
      return st.openSheet({ type: "basin", ref: basin });
    }
    return st.closeSheet();
  }
  if (h.type === "basin" || h.type === "prov" || h.type === "bundle") {
    locate(st, h);
    return st.openSheet(h.type === "bundle" ? { type: "prov", ref: h.ref.prov } : h);
  }
  if (h.type === "river" && z < Z.basin) {
    const basin = h.ref.province?.basin ?? null;
    if (basin !== null) locate(st, { type: "basin", ref: basin });
    return st.openSheet(h);
  }
  if (h.type === "town" && z < 1.25) {
    locate(st, h);
    return st.openSheet(h);
  }
  st.openSheet(h);
}

export function mountMap(st: CanvasStore, cv: HTMLCanvasElement, view: MapView): () => void {
  const { setTip, setDragging, setPointy, placeTip, mouse } = view;
    const ctx = cv.getContext("2d");
  if (ctx === null) return () => undefined;
    const pal = readPalette();
    const R = rs(st);
    let hot: Hot[] = [];

    const resize = (): void => {
      st.size(cv.clientWidth, cv.clientHeight, Math.min(2, window.devicePixelRatio || 1));
      cv.width = st.ui.W * st.ui.dpr;
      cv.height = st.ui.H * st.ui.dpr;
      if (!R.camInit && st.ui.W > 0 && st.ui.H > 0) {
        const w = st.scene.world;
        st.ui.cam.x = (w.x0 + w.x1) / 2;
        st.ui.cam.y = (w.y0 + w.y1) / 2;
        st.ui.cam.z = fitZ(st);
        R.camInit = true;
      }
      if (R.camInit) clampCam(st);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(cv);
    resize();
    cv.focus({ preventScroll: true });

    const at = (e: { readonly clientX: number; readonly clientY: number }): [number, number] => {
      const r = cv.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    const setHover = (h: MapHit | null): void => {
      if (sameMapHit(R.hoverX, h)) return;
      R.hoverX = h;
      R.hoverHit = h === null ? null : toHit(st, h);
      st.ui.hover = R.hoverHit;
      setPointy(h !== null);
      setTip(h === null ? null : tipOf(st, h));
      st.changed("ui");
    };

    let drag: { readonly x: number; readonly y: number; readonly cx: number; readonly cy: number } | null = null;
    let moved = false;
    let press: { readonly t0: number; readonly mx: number; readonly my: number; readonly x: number; readonly y: number } | null = null;

    const down = (e: PointerEvent): void => {
      if (e.button === 2) return;
      cv.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, cx: st.ui.cam.x, cy: st.ui.cam.y };
      moved = false;
      stopFlight(st);
      st.closeMenu();
      const [mx, my] = at(e);
      press = e.pointerType !== "mouse" ? { t0: performance.now(), mx, my, x: e.clientX, y: e.clientY } : null;
    };
    const move = (e: PointerEvent): void => {
      const [mx, my] = at(e);
      mouse.current = [e.clientX, e.clientY];
      if (drag !== null) {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4 && !moved) {
          moved = true;
          setDragging(true);
        }
        if (moved) {
          st.ui.cam.x = drag.cx - dx / st.ui.cam.z;
          st.ui.cam.y = drag.cy - dy / st.ui.cam.z;
          clampCam(st);
          setTip(null);
        }
        return;
      }
      const p = pickAt(st, hot, mx, my);
      setHover(p !== null && !p.soft ? p.hit : null);
      placeTip();
    };
    const leave = (): void => setHover(null);
    const up = (e: PointerEvent): void => {
      press = null;
      setDragging(false);
      const was = drag;
      drag = null;
      if (was === null || moved) return;
      const [mx, my] = at(e);
      activate(st, pickAt(st, hot, mx, my), cv.getBoundingClientRect());
    };
    const context = (e: MouseEvent): void => {
      e.preventDefault();
      const [mx, my] = at(e);
      setTip(null);
      openMenu(st, pickAt(st, hot, mx, my)?.hit ?? null, e.clientX, e.clientY);
    };
    const dbl = (e: MouseEvent): void => {
      const [mx, my] = at(e);
      const h = pickAt(st, hot, mx, my)?.hit ?? null;
      if (h !== null && h.type === "block") return;
      if (h !== null && h.type === "item") return flyTo(st, h.ref.x + LW / 2, h.ref.y + LH / 2, Math.max(5.6, st.ui.cam.z));
      const [wx, wy] = toW(st, mx, my);
      flyTo(st, wx, wy, st.ui.cam.z * 2.2, 450);
    };
    const wheel = (e: WheelEvent): void => {
      e.preventDefault();
      st.closeMenu();
      zoomBy(st, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), at(e));
    };
    cv.addEventListener("pointerdown", down);
    cv.addEventListener("pointermove", move);
    cv.addEventListener("pointerleave", leave);
    cv.addEventListener("pointerup", up);
    cv.addEventListener("contextmenu", context);
    cv.addEventListener("dblclick", dbl);
    cv.addEventListener("wheel", wheel, { passive: false });

    let raf = 0;
    let last = performance.now();
    let lastL = -1;
    const frame = (now: number): void => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      tick(st, now);
      if (press !== null && drag !== null && !moved && now - press.t0 >= LONG_PRESS_MS) {
        const p = press;
        press = null;
        drag = null;
        openMenu(st, pickAt(st, hot, p.mx, p.my)?.hit ?? null, p.x, p.y);
      }
      if (st.ui.surface?.kind !== "gallery" && st.ui.W > 0) {
        stepFlight(st, now);
        if (st.ui.reveal < 1) st.ui.reveal = Math.min(1, st.ui.reveal + dt / 1.7);
        if (!pal.still) {
          for (const p of R.particles) {
            p.u += p.v * dt;
            if (p.u > 1) p.u -= 1;
          }
        }
        hot = draw(st, ctx, pal, now);
        const L = levelOf(st.ui.cam.z);
        if (L !== lastL) {
          lastL = L;
          st.changed("camera");
        }
        for (const f of R.frameSubs) f(now);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      cv.removeEventListener("pointerdown", down);
      cv.removeEventListener("pointermove", move);
      cv.removeEventListener("pointerleave", leave);
      cv.removeEventListener("pointerup", up);
      cv.removeEventListener("contextmenu", context);
      cv.removeEventListener("dblclick", dbl);
      cv.removeEventListener("wheel", wheel);
    };
}
