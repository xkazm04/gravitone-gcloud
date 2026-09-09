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

// The implementation moved UP to components/ui/motionPreference.ts when a
// second JS-driven mover arrived (an autoplaying <video>, components/ui/Clip.tsx).
// This stays as the deck's name for it — one predicate, two call sites.
export { usePrefersReducedMotion as useDeckReducedMotion } from "../motionPreference";
