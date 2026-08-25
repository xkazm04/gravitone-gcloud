// Obsidian design system — the single quality bar every module variant mines.
// Import these instead of re-deriving colors/motion so modules read as siblings
// of the landing page, not one-off prototypes.
//
// SINGLE SOURCE OF TRUTH. The design language used to be declared twice — here,
// and hand-copied into globals.css — and the two had already drifted. Now every
// chrome literal lives in THIS file, is emitted once as CSS custom properties by
// <GravitoneTokens> (layout.tsx), and globals.css and the components consume the
// vars.
//
// ── THE COLOUR-LITERAL RULE, SCOPED ─────────────────────────────────────────
//
// This file is the only place that may DECLARE a colour used to draw the app's
// CHROME — surfaces, hairlines, accents, glows, shadows, focus rings, the
// furniture. Chrome colour is a shared vocabulary, and two files spelling the
// same grey differently is drift.
//
// Three things sit outside that rule, and always did; the rule simply never
// said so, which made it read as violated when it was not:
//
//  1. TAILWIND UTILITY CLASSES — `text-cyan-300`, `bg-white/5`,
//     `border-rose-400/30`. Those are names resolved from Tailwind's own
//     palette, not literals, and they are the rendered form of the accents
//     declared below. Nearly all of this app's colour is spelled that way.
//  2. STYLE-PRESET DATA — the 21 hexes in `app/library/presets.ts` and
//     `app/library/LibraryAtelier.tsx`. Those describe what a GENERATED IMAGE
//     should look like: they are prompt input, and they are shown to the user
//     as the palette a style draws in. They are CONTENT, not chrome. Editing
//     one changes a picture the model makes, not a pixel of this app's
//     furniture, and each belongs beside the preset it describes. This file
//     must never absorb them.
//  3. PROSE. A comment that records a measurement ("#67e8f9 on #080a10 is
//     ~13.7:1") has to name the values it measured, or the measurement cannot
//     be rechecked.
//
// Everything that actually draws chrome obeys, and as of 2026-08-14 the chrome
// is clean: outside this file, the only colour literals left in app/ and
// components/ are the three in globals.css prose that record the focus ring's
// contrast measurement, plus the style-preset data. The last five to go were
// box-shadows — four hand-typed float shadows and the Button glow — which is
// why two complete shadows are declared below alongside the colours.

/**
 * The one curve. Every entrance in the app eases on this and nothing else.
 *
 * MOTION LIVES IN CSS HERE, not in TypeScript: every entrance in this app is a
 * `@keyframes` rule that eases on `var(--gt-ease)`. This repo carries no
 * framer-motion (check package.json before writing a variant object — a
 * `makeRise`/`rise` variant pair used to sit in this file for a library that
 * was never a dependency, and nothing imported it for as long as it existed).
 */
export const EASE = [0.22, 1, 0.36, 1] as const;
/** The same curve as EASE, in CSS form (`--gt-ease`). */
export const EASE_CSS = `cubic-bezier(${EASE[0]}, ${EASE[1]}, ${EASE[2]}, ${EASE[3]})`;

export const ACCENT = {
  cyan: "#67e8f9",
  violet: "#a78bfa",
  emerald: "#6ee7b7",
} as const;

/** Page ink — the studio background. */
export const INK = "#080a10";

/**
 * The canonical glass surface, as a class list. The one export of this file
 * that components read directly (Primitives.tsx); `.glass-panel` in globals.css
 * is the same surface drawn off the `--gt-*` vars for the callers that want a
 * class rather than an import.
 *
 * `HAIRLINE` and `TEXT` used to sit beside it. Both were exported and NEITHER
 * had a reader: the only two imports of this file anywhere are `tokensCss`
 * (GravitoneTokens.tsx) and `SURFACE` (Primitives.tsx), and `HAIRLINE` /
 * `TEXT.hero|body|label|meta` appeared in no other file in the repo. They go
 * for the same stated reason `--gt-chart-*` and `--gt-hue` went — EVERY TOKEN
 * HERE HAS A READER — and the drift they were meant to prevent had already
 * happened around them: `HAIRLINE` was a third spelling of the hairline that
 * `SURFACE` inlines and `--gt-hairline` publishes, and `TEXT.meta` named a
 * text colour that 43 places in app/ spell by hand without ever importing it.
 *
 * Reviving one is a commit that brings back the constant AND converts the call
 * sites that should read it; `git log` this file for the values.
 */
export const SURFACE =
  "border border-white/8 bg-gradient-to-b from-white/[0.05] to-white/[0.015] backdrop-blur-[14px]";

/**
 * Design tokens as CSS custom properties. Emitted verbatim by
 * <GravitoneTokens>; consumed by globals.css and by any component that needs a
 * value at runtime. Every entry here replaces a literal that used to be
 * hand-copied into globals.css — the values are byte-identical to what shipped,
 * so publishing them changes zero pixels.
 *
 * EVERY TOKEN BELOW HAS A READER. That is the entry condition, not a nicety: a
 * `--gt-chart-*` trio once lived here, justified in forty lines of validator
 * output by "the pricing section and its lazy chart module" — neither of which
 * has ever existed in this repo, which carries no charting dependency and no
 * `scripts/validate_palette.js` to re-run. It was deleted rather than kept
 * warm. If you need a chart palette, `git log` this file and bring back the one
 * that was measured, together with the chart that reads it.
 */
export const CSS_TOKENS: Record<string, string> = {
  // accents
  "--gt-accent-cyan": ACCENT.cyan,
  "--gt-accent-violet": ACCENT.violet,
  "--gt-accent-emerald": ACCENT.emerald,
  "--gt-ink": INK,

  // glass surface (.glass-panel / SURFACE)
  "--gt-surface-top": "rgba(255,255,255,0.05)",
  "--gt-surface-bottom": "rgba(255,255,255,0.015)",
  "--gt-hairline": "rgba(255,255,255,0.08)",
  "--gt-blur": "14px",

  // aurora atmosphere (.aurora)
  "--gt-aurora-1": "rgba(34,211,238,0.18)",
  "--gt-aurora-2": "rgba(139,92,246,0.16)",
  "--gt-aurora-3": "rgba(16,185,129,0.10)",

  // cyan glow (.cta-glow)
  "--gt-ring-cyan": "rgba(103,232,249,0.3)",
  "--gt-glow-cyan": "rgba(103,232,249,0.45)",
  // (--gt-glow-cyan-strong / --gt-track-* / --gt-thumb-ring went with the
  // landing bill-calculator slider they were the only consumer of. A token
  // nothing reads is drift waiting to happen.)

  // ── THE THREE EFFECTS ──────────────────────────────────────────────────
  // Above this line are colours. These two are complete box-shadows, and they
  // are here for the same reason the colours are: each was hand-typed at every
  // call site, and the copies had drifted.

  /** What a panel that has left the page casts. The bell tray, the notepad, the
   *  preset list and the right-click menu each spelled this out for themselves
   *  and no two of the four agreed; this is what two of them said, and now what
   *  all four do. Consumed as `.gt-float` (globals.css). */
  "--gt-shadow-float": "0 20px 60px -20px rgba(0,0,0,0.9)",

  /** What a primary action glows with. The shared <Button> re-typed this
   *  literal at the exact opacity --gt-glow-cyan already held, which is the
   *  failure the header of this file exists to prevent. One definition,
   *  consumed as `.gt-glow`; `.cta-glow` is this plus the 1px ring the landing
   *  door wears. */
  "--gt-shadow-glow": "0 8px 40px -8px var(--gt-glow-cyan)",

  // themed scrollbars (.scroll-y / .scroll-x). One thumb colour, spelled once:
  // the standard `scrollbar-color` property and the ::-webkit-scrollbar-thumb
  // fallback are two ways of drawing the same 6px thumb, and they had drifted
  // 0.03 apart in alpha.
  "--gt-scroll-thumb": "rgba(103,232,249,0.25)",
  "--gt-scroll-thumb-hover": "rgba(103,232,249,0.45)",

  // storyboard element marks (app/_phases/frames/parts.tsx). SVG `stroke` takes
  // a paint value, not a Tailwind class, so the non-accent mark needs a var.
  "--gt-frame-mark": "rgba(255,255,255,0.85)",

  // "there is nothing here yet" — the diagonal wash behind an ungenerated
  // plate. A var rather than Tailwind's gradient utilities because those
  // interpolate `in oklab`; this one fades to `transparent` in sRGB and is
  // staying exactly as it renders today.
  "--gt-wash": "rgba(255,255,255,0.04)",

  // motion
  "--gt-ease": EASE_CSS,
  "--gt-eq-period": "1.1s",
  "--gt-aurora-period": "22s",
};

/**
 * Signal Layer channel defaults (contract C4). Declared on :root so every
 * reader resolves even when no AudioBus is mounted or no source is registered —
 * at these values every reader is a no-op, which is what preserves the idle
 * look. AudioBus overrides them on its own scoped node.
 *
 * A CHANNEL IS ONLY IN THE CONTRACT IF A RULE READS IT. Each of the four below
 * is read by name in globals.css (level/peak/centroid by `.eq-bar`, level and
 * working by `.aurora` and `.cta-glow::after`). A fifth, `--gt-hue`, was
 * published and documented as a channel for months while no rule anywhere read
 * it — a default nobody consumes is a promise, not a contract. Add it back in
 * the same commit as the rule that tints something by it.
 */
export const SIGNAL_DEFAULTS: Record<string, string> = {
  "--gt-level": "0",
  "--gt-peak": "0",
  "--gt-centroid": "0.5",
  "--gt-working": "0",
};

/** The `:root { … }` rule <GravitoneTokens> injects. */
export function tokensCss(): string {
  const decls = [
    ...Object.entries(CSS_TOKENS),
    ...Object.entries(SIGNAL_DEFAULTS),
  ]
    .map(([k, v]) => `${k}:${v};`)
    .join("");
  return `:root{${decls}}`;
}
