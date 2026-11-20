"use client";

// THE "HERE" MARK'S GLIDE, WITHOUT A MOTION LIBRARY (design baseline; 2026-11-17). The spine and every context column
// draw the current place's lit ground inside its row; when the place changes the ground is a new element in a new
// row, and this slides it in from where the last one stood - a FLIP through the browser's own Web Animations API:
// measure the new box, start it at the old one's offset and size, animate to none. It replaced motion/react's
// `layoutId`, which put ~52 KB gzip on the first load of every (studio) route through the shell (check:bundle,
// measured on the push gate); motion stays where it was before, inside the audio surfaces that load it.
//
// The last box is kept per mark (`key`) at module scope, so it survives the old row unmounting and a page's column
// remounting. Under reduced motion the mark simply appears in its row. Timing is the tokens' (--dur, --ease).
import { useLayoutEffect, useRef } from "react";

import { tokens } from "@gt/ui/tokens";

const LAST = new Map<string, DOMRect>();
const DURATION = Number.parseFloat(tokens.dur) * 1000;

/** A ref for the lit ground of the current row; `on` is whether this row is the current one. */
export function useGlide<T extends HTMLElement>(key: string, on: boolean) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!on || el === null) return;
    const now = el.getBoundingClientRect();
    const was = LAST.get(key);
    LAST.set(key, now);
    if (was === undefined || now.width === 0 || now.height === 0) return;
    const dx = was.left - now.left;
    const dy = was.top - now.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(was.height - now.height) < 1) return;
    if (typeof el.animate !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.animate([{ transformOrigin: "top left", transform: `translate(${dx}px, ${dy}px) scale(${was.width / now.width}, ${was.height / now.height})` }, { transformOrigin: "top left", transform: "none" }], {
      duration: DURATION,
      easing: tokens.ease,
    });
  });
  return ref;
}

/** The lit ground of the current row: an aria-hidden span that glides in from where the last one stood. */
export function Here({ mark, className }: { readonly mark: string; readonly className: string | undefined }) {
  const ref = useGlide<HTMLSpanElement>(mark, true);
  return <span ref={ref} className={className} aria-hidden="true" />;
}
