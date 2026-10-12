"use client";

// RUNG 1 — THE CONTAINER OWNS THE CAMERA.
//
// One `world` element carries `translate3d(x,y,0) scale(k)`, written straight to
// the DOM by `setCam`. No card receives the camera, no React state holds it, so a
// pan step re-renders nothing at all. The heads follow by the same route
// (`heads.apply`), because they have to track the camera without scaling with it
// — a head that scaled would stop being a fixed reference.
//
// The five verbs below are everything that moves it on purpose: `glideTo` is the
// animated form of `setCam` (and jumps when the operator asked for reduced
// motion), `reveal` brings one card into view, `zoomBy` and `fit` are the
// keyboard's and the shell's. Rung 2 is ./useCullRect.ts, rung 3 ./waveRunner.ts,
// and the four events that move the camera without anybody asking are
// ./useViewportEvents.ts.
//
// `setCam` CLAMPS rather than refusing: some part of the board always stays in
// reach, and "0" (fit) brings the rest back. A camera that could be driven off
// the board is a board the operator has to reload.
//
// EVERY SHARED REF IS AN ARGUMENT, not a local, and that is a lint rule rather
// than taste: `react-hooks/immutability` refuses a write to a ref reached through
// a value another hook returned, so a ref two pieces touch is created by
// ./useBoardEngine.ts and named in the signature of each piece that may touch it.
// `framedRef` and `viewRafRef` below are shared with the two files this one
// composes and with nothing else.

import { useRef } from "react";

import { animate, type AnimationPlaybackControls } from "motion/react";

import type { Live } from "./canvasTypes";
import type { HeadRegistry } from "./Frame";
import { FRAME, fitCamera, revealCamera, zoomAt, type Camera, type Layout } from "./geometry";
import { EASE4 } from "./tunables";
import { useCullRect, type ViewState, type WaveState } from "./useCullRect";
import { useViewportEvents } from "./useViewportEvents";

export type { ViewState, WaveState };

export interface Viewport {
  view: ViewState | null;
  wave: WaveState | null;
  /** Where the camera is now. The shell reads it through `PipelineHandle`. */
  camera(): Camera;
  setCam(c: Camera): void;
  glideTo(to: Camera): void;
  reveal(id: string): void;
  zoomBy(factor: number): void;
  fit(): void;
}

/** Where the camera sits before anything has been measured — and where the head
 *  registry starts, so the two agree on the first frame. */
export const HOME: Camera = { x: FRAME.left + FRAME.insetX, y: FRAME.top + FRAME.insetY, k: 1 };

export function useViewport({
  viewportRef,
  worldRef,
  camRef,
  sizeRef,
  camAnimRef,
  deadRef,
  mountedRef,
  freshRef,
  liveRef,
  heads,
  layout,
  loading,
  calm,
}: {
  viewportRef: React.RefObject<HTMLDivElement | null>;
  worldRef: React.RefObject<HTMLDivElement | null>;
  camRef: React.RefObject<Camera>;
  sizeRef: React.RefObject<{ w: number; h: number } | null>;
  camAnimRef: React.RefObject<AnimationPlaybackControls | null>;
  deadRef: React.RefObject<boolean>;
  mountedRef: React.RefObject<readonly { id: string }[]>;
  freshRef: React.RefObject<number>;
  liveRef: React.RefObject<Live | null>;
  heads: HeadRegistry;
  layout: Layout;
  loading: boolean;
  calm: boolean;
}): Viewport {
  /** Whether the board has had its one opening framing. */
  const framedRef = useRef(false);
  /** The pending re-measure, so a burst of camera writes costs one. */
  const viewRafRef = useRef(0);
  const { view, wave, scheduleView } = useCullRect({ camRef, sizeRef, framedRef, mountedRef, freshRef, deadRef, liveRef, viewRafRef });

  const setCam = (c: Camera) => {
    const s = sizeRef.current;
    const L = liveRef.current;
    let next = c;
    if (s && L) {
      const keep = 160;
      next = {
        k: c.k,
        x: Math.min(s.w - keep, Math.max(keep - L.layout.width * c.k, c.x)),
        y: Math.min(s.h - keep, Math.max(keep - L.layout.height * c.k, c.y)),
      };
    }
    camRef.current = next;
    const w = worldRef.current;
    if (w) w.style.transform = `translate3d(${next.x}px, ${next.y}px, 0) scale(${next.k})`;
    heads.apply(next);
    scheduleView();
  };

  const glideTo = (to: Camera) => {
    camAnimRef.current?.stop();
    if (calm) return setCam(to);
    const from = camRef.current;
    camAnimRef.current = animate(0, 1, {
      duration: 0.34,
      ease: EASE4,
      onUpdate: (t) => setCam({ k: from.k + (to.k - from.k) * t, x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }),
    });
  };

  const reveal = (id: string) => {
    const s = sizeRef.current;
    const L = liveRef.current;
    if (!s || !L) return;
    const to = revealCamera(camRef.current, L.layout, id, s.w, s.h);
    if (to) glideTo(to);
  };

  const zoomBy = (factor: number) => {
    const s = sizeRef.current;
    if (!s) return;
    const c = camRef.current;
    glideTo(zoomAt(c, c.k * factor, FRAME.left + (s.w - FRAME.left) / 2, FRAME.top + (s.h - FRAME.top) / 2));
  };

  const fit = () => {
    const s = sizeRef.current;
    const L = liveRef.current;
    if (s && L) glideTo(fitCamera(L.layout, s.w, s.h));
  };

  useViewportEvents({ viewportRef, sizeRef, framedRef, camRef, camAnimRef, deadRef, viewRafRef, liveRef, loading, layout, setCam, scheduleView });

  return { view, wave, camera: () => camRef.current, setCam, glideTo, reveal, zoomBy, fit };
}
