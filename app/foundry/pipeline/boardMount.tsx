"use client";

// HOW TALL THE BOARD IS — measured, not spelled.
//
// The canvas is `absolute inset-0` inside its parent, so the parent needs a real
// height. That was `calc(100vh - 34rem)`, and 34rem is 544px: on a 1080p screen
// the board got 536px and over half the window was reserved for chrome. Round
// 1's first sentence was that the canvas is barely visible, and that number was
// most of the reason — correct for the chrome of the day it was written, and
// nothing re-derived it when that chrome changed three times since.
//
// So it is read off the element: whatever sits above the board, the board runs
// from where it starts to the bottom of the viewport.

import { useEffect, useState } from "react";

/* ── the mount counter ────────────────────────────────────────────────────── */

// WP4a acceptance 2: the canvas mounts once per MEDIA switch, not per render.
// The counter lives on the canvas's parent with `[]` deps, so it counts mounts
// and nothing else. Kept in the tree rather than deleted after the measurement:
// it is three lines, it costs one effect, and the claim it proves is the one a
// re-render-happy shell breaks first. Read it off the console, or off
// `window.__gtPipelineMounts` in a driven browser.
declare global {
  interface Window {
    __gtPipelineMounts?: number;
  }
}

/**
 * THE BOARD'S HEIGHT, MEASURED — not `calc(100vh - 34rem)`.
 *
 * The canvas is `absolute inset-0` inside its parent, so the parent needs a real
 * height and not a content-driven one. That was spelled as a viewport
 * subtraction, and 34rem is 544px: on a 1080p screen the board got 536px and
 * over half the window was reserved for the chrome above it. Round 1's first
 * sentence was that the canvas is barely visible, and this number is most of the
 * reason — it was correct for the chrome of the day it was written and nothing
 * re-derived it when that chrome changed.
 *
 * So it is read off the element: whatever sits above the board, the board runs
 * from where it starts to the bottom of the viewport. A ResizeObserver on the
 * document element catches the chrome above growing or shrinking (the top bar
 * wraps at narrow widths, the degraded strip appears and disappears) without
 * this needing to know what any of it is.
 */
export function useFillHeight(ref: React.RefObject<HTMLElement | null>, gutter = 12): number {
  const [h, setH] = useState(520);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // FLOOR, not a clamp for tidiness: on a short viewport, or mid-layout when
    // the chrome above has not settled, the subtraction can go to nothing, and a
    // board of 0px reads as a board that failed to load.
    const measure = () => setH(Math.max(280, Math.round(window.innerHeight - el.getBoundingClientRect().top - gutter)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.documentElement);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [ref, gutter]);
  return h;
}

export function CanvasMount({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const n = (window.__gtPipelineMounts ?? 0) + 1;
    window.__gtPipelineMounts = n;
    // The counter is kept in both builds (it is one number and a driven browser
    // can read it); only the console line is dev's.
    if (process.env.NODE_ENV !== "production") console.log(`[pipeline] canvas parent mounted ${n}x`);
  }, []);
  return <div className="relative h-full w-full">{children}</div>;
}
