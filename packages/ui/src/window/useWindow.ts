"use client";

// THE ONE WINDOW HOOK: wires `windowOf` to a scroll container. No arithmetic here.
//
// Two v1 lessons it carries:
//   · `key` (Pager.tsx, Wave 0): a filter, sort or query makes the list a DIFFERENT
//     list, and the window must go back to the top by itself - the caller that forgot
//     `reset()` showed page four of a list just narrowed to six rows. Only an
//     IDENTIFYING change resets; resizing or scrolling is windowing and keeps the
//     place (async-ui-states windowing-vs-identifying-keys).
//   · No per-scroll churn (§9.5): the scroll handler recomputes the window and sets
//     state only when `sameWindow` says the held items changed, so scrolling inside
//     one row re-renders nothing (the prototype's `lastRange` check).
//
// Not verifiable in node (no DOM for Vitest): the wave-2 Library drives it live.

import { useLayoutEffect, useRef, useState, type RefObject, type UIEvent } from "react";

import { revealTop, sameWindow, windowOf, type Layout, type Win } from "./core.ts";

export type UseWindowOptions = {
  readonly count: number;
  /** The layout for a measured container width. */
  readonly layout: (width: number) => Layout;
  readonly overscan?: number;
  /** Changes when the list becomes a different list; compared with Object.is. */
  readonly key?: unknown;
};

export type WindowHandle<E extends HTMLElement> = Win & {
  /** Attach to the scroll container. The hook owns it, so it may scroll it. */
  readonly ref: RefObject<E | null>;
  readonly onScroll: (e: UIEvent<E>) => void;
  /** Scroll so item i is fully visible. */
  readonly reveal: (i: number) => void;
  /** The container's measured width: what a grid sizes its tiles from (the Library's TileGrid). */
  readonly width: number;
};

export function useWindow<E extends HTMLElement = HTMLDivElement>(opts: UseWindowOptions): WindowHandle<E> {
  const ref = useRef<E | null>(null);
  const overscan = opts.overscan ?? 2;
  const [size, setSize] = useState({ width: 0, height: 720 });
  const [scrollTop, setScrollTop] = useState(0);
  const layout = opts.layout(size.width);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight || 720 }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // An identifying change is derived during render, not in an effect, so the
  // narrowed list never draws one frame at the old scroll offset (v1 Pager.tsx).
  const [seenKey, setSeenKey] = useState<unknown>(opts.key);
  const [resetTick, setResetTick] = useState(0);
  if (!Object.is(seenKey, opts.key)) {
    setSeenKey(opts.key);
    setScrollTop(0);
    setResetTick((n) => n + 1);
  }
  useLayoutEffect(() => {
    if (ref.current !== null && resetTick > 0) ref.current.scrollTop = 0;
  }, [resetTick]);

  const win = windowOf({ count: opts.count, layout, viewport: size.height, scrollTop, overscan });

  const onScroll = (e: UIEvent<E>): void => {
    const top = e.currentTarget.scrollTop;
    const next = windowOf({ count: opts.count, layout, viewport: size.height, scrollTop: top, overscan });
    if (!sameWindow(win, next)) setScrollTop(top);
  };

  const reveal = (i: number): void => {
    const el = ref.current;
    if (el === null) return;
    const top = revealTop({ count: opts.count, layout, viewport: size.height, scrollTop: el.scrollTop }, i);
    if (top !== el.scrollTop) el.scrollTop = top;
  };

  return { ...win, ref, onScroll, reveal, width: size.width };
}
