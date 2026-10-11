"use client";

// WHAT MAKES THE CAMERA MOVE WITHOUT ANYBODY ASKING IT TO — the four events the
// viewport subscribes to, and the one-time framing they feed.
//
//   THE RESIZE is the cold start. `view` is null until the viewport has been
//   MEASURED and the data has LOADED, and null culls to nothing, so until this
//   has answered the board mounts no cards at all. That is why `frame()` is
//   reachable from both the resize and the load: whichever arrives second does
//   it, and `framedRef` makes sure only one of them does.
//
//   THE LOAD frames the board once, on the animation frame after `loading` goes
//   false — not in the same tick, because the layout the framing measures is
//   built from the entries that just arrived.
//
//   THE RELAYOUT (a poll, a move) re-culls against the SAME camera: the board
//   must not jump because a card changed column.
//
//   THE WHEEL has to be a non-passive NATIVE listener. React's `onWheel` is
//   passive, and a passive listener cannot `preventDefault`, so the page would
//   scroll behind the board. Plain wheel pans, Shift pans horizontally,
//   Ctrl/Cmd zooms at the pointer — and since the operator's ruling that the
//   board must not be dragged, this is the only way to reach what is off-screen.
//
// Every handler is an `useEffectEvent`, so each listener is bound exactly once
// and still reads the current camera, size and layout.

import { useEffect, useEffectEvent, useLayoutEffect } from "react";

import type { AnimationPlaybackControls } from "motion/react";

import { overlayOpen } from "@/lib/board/keys";

import type { Live } from "./canvasTypes";
import { frameCamera, zoomAt, type Camera, type Layout } from "./geometry";

export function useViewportEvents({
  viewportRef,
  sizeRef,
  framedRef,
  camRef,
  camAnimRef,
  deadRef,
  viewRafRef,
  liveRef,
  loading,
  layout,
  setCam,
  scheduleView,
}: {
  viewportRef: React.RefObject<HTMLDivElement | null>;
  sizeRef: React.RefObject<{ w: number; h: number } | null>;
  framedRef: React.RefObject<boolean>;
  camRef: React.RefObject<Camera>;
  camAnimRef: React.RefObject<AnimationPlaybackControls | null>;
  deadRef: React.RefObject<boolean>;
  viewRafRef: React.RefObject<number>;
  liveRef: React.RefObject<Live | null>;
  loading: boolean;
  layout: Layout;
  setCam(c: Camera): void;
  scheduleView(): void;
}) {
  // The cleanup calls `quiet` rather than reading the refs itself: a ref read
  // written inline in a cleanup is the one `react-hooks/exhaustive-deps` warns
  // about, and it is right in general — here the LATEST animation is exactly
  // what has to be stopped, so the read must happen at unmount, not at setup.
  const quiet = useEffectEvent(() => {
    cancelAnimationFrame(viewRafRef.current);
    viewRafRef.current = 0;
    camAnimRef.current?.stop();
  });
  useEffect(() => {
    deadRef.current = false;
    return () => {
      deadRef.current = true;
      quiet();
    };
  }, [deadRef]);

  const frame = () => {
    const s = sizeRef.current;
    const L = liveRef.current;
    if (!s || !L || framedRef.current || loading || s.w === 0) return;
    framedRef.current = true;
    setCam(frameCamera(L.layout, s.w, s.h));
  };

  const onResize = useEffectEvent(() => {
    const el = viewportRef.current;
    if (!el) return;
    sizeRef.current = { w: el.clientWidth, h: el.clientHeight };
    if (!framedRef.current) frame();
    else scheduleView();
  });
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => onResize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [viewportRef]);

  const onLoaded = useEffectEvent(() => frame());
  useEffect(() => {
    if (loading) return;
    const id = requestAnimationFrame(() => onLoaded());
    return () => cancelAnimationFrame(id);
  }, [loading]);

  const onRelayout = useEffectEvent(() => scheduleView());
  useEffect(() => {
    onRelayout();
  }, [layout]);

  const onWheelEvent = useEffectEvent((e: WheelEvent) => {
    const el = viewportRef.current;
    if (!el || overlayOpen()) return;
    e.preventDefault();
    camAnimRef.current?.stop();
    const r = el.getBoundingClientRect();
    const c = camRef.current;
    const unit = e.deltaMode === 1 ? 16 : 1;
    if (e.ctrlKey || e.metaKey) {
      setCam(zoomAt(c, c.k * Math.exp((-e.deltaY * unit) / 400), e.clientX - r.left, e.clientY - r.top));
    } else {
      const horizontal = e.shiftKey && e.deltaX === 0;
      setCam({ k: c.k, x: c.x - (horizontal ? e.deltaY : e.deltaX) * unit, y: c.y - (horizontal ? 0 : e.deltaY) * unit });
    }
  });
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const listener = (e: WheelEvent) => onWheelEvent(e);
    el.addEventListener("wheel", listener, { passive: false });
    return () => el.removeEventListener("wheel", listener);
  }, [viewportRef]);
}
