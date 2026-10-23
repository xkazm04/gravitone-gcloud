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
// Seven things sit outside that rule; five always did and the rule simply never
// said so, which made it read as violated when it was not:
//
//  1. TAILWIND UTILITY CLASSES — `text-cyan-300`, `bg-white/5`,
//     `border-rose-400/30`. Those are names resolved from Tailwind's own
//     palette, not literals, and they are the rendered form of the accents
//     declared below. Nearly all of this app's colour is spelled that way.
//  2. STYLE PALETTE DATA — the presets' hexes (`packages/catalog/src/presets.ts`,
//     outside this walk) and the fixture and specimen styles' palettes in
//     `LibraryKit.tsx`, `StyleKit.tsx`, the Library's `fixtureCorpus.ts` and
//     `fixtureData.ts`, and the atelier's `fixtureData.ts` (Phase 5; the v1
//     `app/library` presets and atelier they replace are gone). Those describe
//     what a GENERATED IMAGE should look like: they are prompt input, and they
//     are shown to the user as the palette a style draws in. They are CONTENT,
//     not chrome. Editing one changes a picture the model makes, not a pixel of
//     this app's furniture, and each belongs beside the style it describes.
//     This file must never absorb them. The same holds for the Library's
//     `fixtureModels.ts` (spark game-3d-assets): its SVG is a fixture 3D
//     asset's poster render, a picture of the asset, not chrome.
//  3. PROSE. A comment that records a measurement ("#67e8f9 on #080a10 is
//     ~13.7:1") has to name the values it measured, or the measurement cannot
//     be rechecked.
//  4. app/global-error.tsx — SEVEN literals, and they are right. It is the App
//     Router boundary that replaces the root layout, so it brings its own
//     <html>/<body> and <GravitoneTokens> never renders: a `var(--gt-ink)`
//     there resolves to nothing, on the one screen that exists because the
//     shell already failed. It is the single place in the app that must NOT
//     read this file. The cost is real and worth stating — its `#67e8f9`
//     button is a hand-maintained copy of ACCENT.cyan, so changing the accent
//     here means changing it there too, and nothing will tell you.
//  5. app/_dev-inspector/devInspectorUi.tsx - the DEVTOOLS SKIN, and the one
//     entry here that is not old. Dev-only furniture for the inspect overlay
//     (`npm run dev:inspect`), deliberately fixed: a tool for debugging the
//     theme must not be drawn FROM the theme, or a half-finished edit to the
//     accents below takes the inspector down at exactly the moment it is
//     wanted. It never reaches a production bundle - app/layout.tsx mounts it
//     behind a NODE_ENV literal Next inlines, and next.config.ts keeps the
//     client reference out of the build. The cost is item 4's, smaller: its
//     cyan is a hand-kept cousin of ACCENT.cyan and nothing will tell you if
//     the two diverge. (The file's own header also claims kinship with
//     global-error.tsx on the grounds that it renders where <GravitoneTokens>
//     does not. That half is wrong - it mounts inside the root layout, which
//     the error boundary REPLACES, so it never renders there. The exemption
//     stands on debug-independence alone.)
//  6. app/_landing/cosmos/engine/inks.ts - the Paper Cosmos landing's CANVAS
//     paint: the colours of the drawn paper artwork (the dusk horizon, the
//     galaxy's seven sheets, the lamp's petals, the reams' paper stock and
//     latches, the grain, a sheet's lit edge and cast shadow). Illustration,
//     like item 2's palettes, not furniture: the landing's chrome reads the
//     --pc-* tokens below. Every engine module takes its paint from that one
//     file so the exemption stays one file wide.
//
// (The music-video compositor's particle and bloom colours - a GENERATED
// VIDEO's overlay, content like item 2's palettes - were item 6 until L75 moved
// the compositor to lib/sound/mv/compositor.ts, outside this walk, as the
// presets' hexes went to packages/catalog. Still deliberately not ACCENT.cyan:
// a shipped video's bloom must not re-tint when this app's accent does.)
//
// Everything that actually draws chrome obeys. The inventory above is meant to
// be RECHECKABLE, so it is worth saying how: grep app/ and components/ for hex
// and rgb() literals, subtract this file and the six classes above, and the
// remainder should be empty. It was NOT, from 2026-08-14 until this line was
// written — the list said "three things" and named globals.css prose plus the
// preset data, while global-error.tsx had seven, which made the rule read as
// broken by a file that was obeying a different one. The last five literals to
// leave the chrome were box-shadows — four hand-typed float shadows and the
// Button glow — which is why two complete shadows are declared below alongside
// the colours.

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

// (ACCENT.rose, INK and INK_BRIGHT - `--gt-accent-rose`, `--gt-ink`, `--gt-ink-bright` -
// went in Phase 6 wave C with their last readers: the Library audio workbench's Obsidian
// remap, the v1 StudioFrame's page ground and the Almanac kit's Obsidian skin. The ink is
// still #080a10 in prose below because the measurements that name it were taken on it.)

// (SURFACE - the glass class list Primitives.tsx's `Panel` read - went at L74 with `Panel`, its
// last reader; before it, HAIRLINE and TEXT went for having none. `.glass-panel` in globals.css
// is the same surface drawn off the `--gt-*` vars. `git log` this file for the values.)

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

  // (--gt-frame-mark and --gt-wash went with the v1 storyboard marks and plate
  // wash, Phase 4-6; the new world draws both from @gt/ui's tokens.)

  // motion
  "--gt-ease": EASE_CSS,
  "--gt-eq-period": "1.1s",
  "--gt-aurora-period": "22s",
};

// THE ALMANAC WORLD (`WORLD_ALMANAC`, `[data-world="almanac"]`) and the kit's Obsidian
// skin (`WORLD_OBSIDIAN_KIT`, `[data-world="obsidian"]`) retired with the Almanac kit
// (components/kit) and the v1 StudioFrame in Phase 6 wave C: nothing left in the tree drew
// under either attribute. The design reference stays at docs/design/almanac-v2/.

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

/**
 * THE PAPER COSMOS WORLD, scoped. Chosen 2026-10-07 from contest
 * landing-universe (variant "Paper Cosmos"): the public landing drawn as a
 * backlit cut-paper shadow-box. The owner's instruction was to keep the
 * winner's OWN design rather than restyle it in this app's kit, so these are
 * the winner's colours, carried here only so the colour-literal rule holds:
 * chrome is spelled in this file and nowhere else. The landing's root opts in
 * with `data-world="paper-cosmos"`; nothing else reads these.
 *
 * The CANVAS paint of the paper artwork (sheet colours, the dusk horizon, ream
 * tones) is illustration content, not chrome, and lives with the drawing code
 * in app/_landing/cosmos/engine/inks.ts, exempted by name in the colour-literal
 * probe (item 6 above).
 * Alpha variants are written at the use site as color-mix over these tokens.
 */
export const WORLD_PAPER_COSMOS: Record<string, string> = {
  "--pc-ink": "#251a33",
  "--pc-ink2": "#3b2a47",
  "--pc-bone": "#f3e6cf",
  "--pc-cream": "#fff3da",
  "--pc-indigo": "#161b45",
  "--pc-coral": "#ee7358",
  "--pc-ochre": "#f0aa50",
  "--pc-rust": "#c4553d",
  // The rest of the stylesheet's chrome, each named for where the winner used
  // it. Several shadows differ by one or two units of blue; they are kept
  // distinct because the brief was to port the design, not to tidy it.
  "--pc-black": "#000000",
  "--pc-white": "#ffffff",
  "--pc-app": "#10153a",
  "--pc-world": "#1b2150",
  "--pc-art": "#2b2150",
  "--pc-dim": "#0f0b2c",
  "--pc-print": "#f4e8d2",
  "--pc-print-ink": "#2f2230",
  "--pc-tape": "#ecd8a8",
  "--pc-tab": "#e6d3ae",
  "--pc-tab-hot": "#fff0cc",
  "--pc-tab-ink": "#3a2a2c",
  "--pc-sheet": "#e9d9b8",
  "--pc-sheet-ink": "#2a1c2c",
  "--pc-cat": "#cdb890",
  "--pc-pick": "#fff1cd",
  "--pc-enter": "#ec6a4d",
  "--pc-enter-hi": "#f68b6c",
  "--pc-enter-lo": "#e45a3c",
  "--pc-enter-ink": "#fff5e2",
  "--pc-enter-edge": "#9c3b25",
  "--pc-enter-glint": "#ffdcc8",
  "--pc-sun-hi": "#ffd89a",
  "--pc-sun-lo": "#b5452f",
  "--pc-glow": "#ffc46e",
  "--pc-ream-glow": "#ffbe64",
  "--pc-depth-glow": "#ffa05a",
  "--pc-lamp": "#ffecbe",
  "--pc-lamp-2": "#ffb062",
  "--pc-lamp-3": "#ff965a",
  "--pc-flare": "#fff6d8",
  "--pc-flare-sheet": "#fff0cf",
  "--pc-flare-ink": "#2a2f7a",
  "--pc-shadow": "#0a061e",
  "--pc-shadow-2": "#0a061c",
  "--pc-shadow-3": "#080418",
  "--pc-umber": "#1e101e",
  "--pc-plum": "#1e1232",
  "--pc-depth-ring": "#160c2a",
  "--pc-haze": "#0c0820",
  "--pc-scrim": "#09071e",
  "--pc-vignette": "#060416",
  "--pc-sheet-shadow": "#040214",
  "--pc-veil-in": "#120c30",
  "--pc-veil-out": "#0a0720",
  // The dusk the landing paints before any canvas exists (cosmos.css .sky0):
  // the sky plane's own eight stops and the ground below the horizon, so the
  // first paint and the painted sky that fades in over it are the same colours.
  // engine/inks.ts HZ.sky and SKY_INK.ground read these, one source.
  "--pc-sky-0": "#0c1132",
  "--pc-sky-1": "#141a4a",
  "--pc-sky-2": "#2a2161",
  "--pc-sky-3": "#5a2f74",
  "--pc-sky-4": "#a3496b",
  "--pc-sky-5": "#e0795c",
  "--pc-sky-6": "#f4ac62",
  "--pc-sky-7": "#f8d495",
  "--pc-ground": "#0b0f2e",
};

/** The `:root { … }` rule <GravitoneTokens> injects. */
export function tokensCss(): string {
  const decls = [
    ...Object.entries(CSS_TOKENS),
    ...Object.entries(SIGNAL_DEFAULTS),
  ]
    .map(([k, v]) => `${k}:${v};`)
    .join("");
  const paperCosmos = Object.entries(WORLD_PAPER_COSMOS)
    .map(([k, v]) => `${k}:${v};`)
    .join("");
  return `:root{${decls}}[data-world="paper-cosmos"]{${paperCosmos}}`;
}

// ── TYPE SCALE, BY REFERENCE ────────────────────────────────────────────────
// Font SIZES are tokens too, but they live where Tailwind can compile them:
// app/globals.css declares `--text-content` (1rem, anything the user reads)
// and `--text-label` (0.875rem, secondary short labels — the floor) in
// @theme, and pipeline/check-type-scale.mjs fails `verify` on anything
// smaller. Declared there rather than here for the same reason the colour
// vars are emitted by <GravitoneTokens>: each token lives in the one place
// the machinery that enforces it can read.
