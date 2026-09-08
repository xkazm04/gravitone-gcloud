// The deck's emblem set — WP2's replacement for the initial-glyph placeholder.
//
// One distinctive stroke motif per card-family member, drawn inline over the
// gradient ground. Motifs mostly echo the same symbol their illustrated face
// (app/_studio/deckArt.ts) was generated from, so the emblem and illustrated
// variants read as two densities of one identity rather than two art
// directions — the DISCIPLINE family is the deliberate exception since
// 2026-09-08 and says why beside itself. All strokes are `currentColor`; the
// family's accent arrives as a
// Tailwind text class from `emblemToneClass` — no colour literal leaves
// components/ui/tokens.ts (the chrome-colour probe walks this file).
//
// Keys are the deck-art manifest keys (`<family>-<id>`). An unknown key
// renders nothing and returns null, so the caller can fall back to the glyph
// placeholder honestly instead of drawing a wrong emblem.

import type { ReactNode } from "react";

/** Motifs, 2–3 strokes each. viewBox 0 0 48 48, stroke inherited. */
const EMBLEMS: Record<string, ReactNode> = {
  // ── disciplines (cyan) ──────────────────────────────────────────────────
  //
  // THESE THREE NAME THE THING, they do not echo the illustration (2026-09-08).
  // See the note at the top of this file: the discipline cards are the first
  // screen of the create wizard and they are HERO cards — the art and one
  // title, nothing else — so the art is doing half the work of the only
  // question on screen. It was not doing any: covering the three titles, the
  // converging-chains lens, the two monoliths and the pendulum were mutually
  // unguessable, and so (checked, same day) are the illustrated faces they
  // echoed. A motif whose meaning arrives only from the caption beside it is
  // decoration.
  //
  // So the discipline family alone trades the atmospheric motif for the
  // denotative one — the mark a stranger reads in the first glance, before the
  // words. The template and engine families keep the echo: their cards are
  // picked AFTER the question has been narrowed, they are read against each
  // other rather than cold, and nothing measured says they fail.
  //
  // the mortarboard — teaching, the thing being explained
  "discipline-educational": (
    <>
      <path d="M6 19.5 L24 11.5 L42 19.5 L24 27.5 Z" />
      <path d="M14 23.1 V31 C14 34.6 34 34.6 34 31 V23.1" />
      <path d="M42 19.5 V30" />
      <circle cx={42} cy={32.5} r={2} fill="currentColor" stroke="none" />
    </>
  ),
  // the clapperboard — the cinema slate, a piece cut to sell a picture
  "discipline-trailer": (
    <>
      <path d="M7 12 H41 V37 H7 Z" />
      <path d="M7 21 H41" />
      <path d="M14 21 L18 12 M23 21 L27 12 M32 21 L36 12" />
    </>
  ),
  // the open frame around a play mark — a video of no declared kind
  "discipline-free": (
    <>
      <path d="M8 15 V9 H14 M34 9 H40 V15 M40 33 V39 H34 M14 39 H8 V33" />
      <path d="M20 17.5 L31 24 L20 30.5 Z" />
    </>
  ),

  // ── templates (violet) ──────────────────────────────────────────────────
  // the shard cleaved off, streaking away
  "template-short-form-clip": (
    <>
      <path d="M30 14 L38 22 L27 26 Z" />
      <path d="M22 17 H10 M21 24 H14 M24 31 H18" />
    </>
  ),
  // one orb held in a hairline armature
  "template-short-educational-video": (
    <>
      <circle cx={24} cy={21} r={7} />
      <path d="M12 27 a 12 12 0 0 0 24 0" />
      <path d="M24 39 v3" />
    </>
  ),
  // the arched bridge that carries a full argument
  "template-mid-educational-video": (
    <>
      <path d="M8 34 C14 16 34 16 40 34" />
      <path d="M6 34 H42" />
      <path d="M16 34 V25 M32 34 V25" />
    </>
  ),
  // the barely-open aperture, one sliver let out
  "template-teaser": (
    <>
      <path d="M8 20 C16 12 32 12 40 20" />
      <path d="M8 28 C16 36 32 36 40 28" />
      <path d="M18 24 H30" />
    </>
  ),
  // the staircase up to the portal — the full spine
  "template-trailer": (
    <>
      <path d="M6 40 H15 V31 H24 V22 H33 V13" />
      <circle cx={38} cy={9} r={4.5} />
    </>
  ),
  // the anamorphic flare over the set
  "template-cinematic": (
    <>
      <path d="M4 24 H44" />
      <ellipse cx={24} cy={24} rx={9} ry={4.5} />
      <path d="M24 14 V34" />
    </>
  ),
  // ribbons out of the open frame
  "template-free-form": (
    <>
      <path d="M32 10 H10 V38 H32" />
      <path d="M16 30 C26 27 22 17 32 15 C38 14 39 20 44 18" />
    </>
  ),

  // ── script engines (emerald) ────────────────────────────────────────────
  // the hairpin reversal, corrected direction leading
  "engine-reversal-chain": (
    <>
      <path d="M8 34 H29 A 6.5 6.5 0 0 0 29 21 H16" />
      <path d="M21 15 L15 21 L21 27" />
    </>
  ),
  // the balance settling — a question adjudicated
  "engine-adjudication": (
    <>
      <path d="M24 10 V38 M17 38 H31" />
      <path d="M10 14 H38 M10 14 V22 M38 14 V22" />
      <path d="M5 22 A 5 5 0 0 0 15 22 M33 22 A 5 5 0 0 0 43 22" />
    </>
  ),
  // interlocked impossible rings, resolved at one point
  "engine-derived-short": (
    <>
      <circle cx={19} cy={24} r={8} />
      <circle cx={29} cy={24} r={8} />
      <circle cx={24} cy={24} r={1.5} fill="currentColor" stroke="none" />
    </>
  ),
};

/** The accent a family's emblem is drawn in — Tailwind classes, the same
 *  assignment the deck's chips and gradients make. */
export function emblemToneClass(emblemKey: string): string {
  if (emblemKey.startsWith("discipline-")) return "text-cyan-200/85";
  if (emblemKey.startsWith("template-")) return "text-violet-200/85";
  if (emblemKey.startsWith("engine-")) return "text-emerald-200/85";
  return "text-white/60";
}

/** True when a key has a drawn motif — the caller's honest-fallback test. */
export function hasEmblem(emblemKey: string): boolean {
  return emblemKey in EMBLEMS;
}

export function DeckEmblem({ emblemKey, className }: { emblemKey: string; className?: string }) {
  const motif = EMBLEMS[emblemKey];
  if (!motif) return null;
  return (
    <svg
      aria-hidden
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {motif}
    </svg>
  );
}
