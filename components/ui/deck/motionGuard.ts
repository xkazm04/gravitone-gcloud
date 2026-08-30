"use client";

// THE reduced-motion seam for the deck engine — the single place every deck
// animation asks "may I move?".
//
// The deck is this repo's FIRST JS-driven animation. Everything else moves on
// CSS keyframes, and the blanket rule at the foot of globals.css
// (`prefers-reduced-motion: reduce` → `animation: none`) switches all of that
// off for free. A motion/react spring writes inline styles from JS and that
// rule CANNOT reach it — so an entrance that moves to JS has to disable itself
// (globals.css says exactly this beside gt-rise). This hook is how it does.
//
// One seam rather than a matchMedia call per component, for the same reason
// `styleFits` is one predicate: three copies of `useReducedMotion() ?? false`
// is how the deal-in and the hover lift start disagreeing about the same user
// preference. When this returns true, springs collapse to simple opacity (or
// nothing) — see DeckCard/DeckStage for what each animation degrades to.

import { useReducedMotion } from "motion/react";

/** True when the user asked for no motion. `null` (SSR, first paint before the
 *  media query is read) is treated as "no preference stated", which matches
 *  what the CSS blanket rule does: it only acts on an explicit `reduce`. */
export function useDeckReducedMotion(): boolean {
  return useReducedMotion() ?? false;
}
