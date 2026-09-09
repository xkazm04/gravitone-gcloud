"use client";

// THE reduced-motion seam — the single place anything in this app asks
// "may I move?".
//
// Most of this app moves on CSS keyframes, and the blanket rule at the foot of
// globals.css (`prefers-reduced-motion: reduce` → `animation: none`) switches
// all of that off for free. Two things it cannot reach: a motion/react spring,
// which writes inline styles from JS, and a <video> that plays itself. Both
// have to ask, and they have to ask the same question — three copies of
// `useReducedMotion() ?? false` is how a deal-in animation and an autoplaying
// clip start disagreeing about one user preference.

import { useReducedMotion } from "motion/react";

/** True when the user asked for no motion. `null` (SSR, and the first paint
 *  before the media query is read) is treated as "no preference stated", which
 *  matches what the CSS blanket rule does: it acts only on an explicit
 *  `reduce`. */
export function usePrefersReducedMotion(): boolean {
  return useReducedMotion() ?? false;
}
