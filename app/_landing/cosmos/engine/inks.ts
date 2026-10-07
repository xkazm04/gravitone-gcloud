// THE INKS: every colour the Paper Cosmos PAINTS onto a canvas, in one file.
//
// These are the colours of the drawn paper artwork (the dusk horizon, the
// galaxy's sheets, the lamp, the reams' paper stock and their latches, the
// grain, a sheet's lit edge and its cast shadow): illustration content, not the
// app's chrome. The chrome the stylesheet draws reads var(--pc-*) from
// components/ui/tokens.ts (WORLD_PAPER_COSMOS); this is the one engine file
// exempted by name in tests/golden-path/chrome-colour-literals, and every other
// engine module takes its paint from here so the exemption stays one file.
//
// Values are the contest winner's (landing-universe, "Paper Cosmos"), verbatim.

/** the grain tile: fibre strokes over the noise */
export const GRAIN_INK = { light: "rgba(255,248,230,.10)", dark: "rgba(40,24,36,.09)" };

/** a paper sheet: cast shadow, the lit top-left edge, the shaded bottom-right */
export const PAPER_INK = {
  cast: "rgba(18,10,34,.42)",
  lit: (a: number): string => "rgba(255,246,226," + a + ")",
  shade: (a: number): string => "rgba(22,10,34," + a + ")",
};

/** a medallion: the recessed window's inner shadow and its scored rim */
export const MEDAL_INK = { inset: "rgba(14,6,30,.6)", insetFill: "#000", score: "rgba(60,36,44,.28)" };

/** night dioramas: the scattered stars */
export const DIORAMA_INK = { star: "rgba(255,236,190,.85)" };

/** horizon palette: dusk, never neon */
export const HZ = {
  sky: ["#0c1132", "#141a4a", "#2a2161", "#5a2f74", "#a3496b", "#e0795c", "#f4ac62", "#f8d495"],
  far: "#4a2f78",
  midA: "#2e2f78",
  midB: "#1d2c64",
  front: "#15204f",
  floor: "#0f1840",
  rim: "rgba(255,176,98,.75)",
};

/** the seven galaxy sheets, back to front */
export const DISC = ["#1d2354", "#262c64", "#323470", "#473a79", "#613e79", "#82466f", "#a95460", "#cf7358", "#efa863"];

export const SKY_INK = {
  /** warm bloom behind the galaxy */
  bloom: ["rgba(255,170,100,.34)", "rgba(220,100,110,.12)", "rgba(220,100,110,0)"],
  /** below the horizon */
  ground: "#0b0f2e",
  starGlow: "rgba(255,190,110,.95)",
  star: "#fff0cf",
  /** cloud banks: colour, height, alpha */
  clouds: [
    ["#37307a", 0.12, 0.62],
    ["#432f7c", 0.27, 0.5],
    ["#5a3480", 0.2, 0.7],
  ] as [string, number, number][],
  discGlow: (a: number): string => "rgba(255,150,80," + a + ")",
  /** the six-petal heart: three rings, then its centre */
  petals: ["#f8d79a", "#f2a354", "#df7059", "#f6e6c2"],
  heart: "#fff0cd",
  floorRim: "#3a335f",
};

/** the library's paper stock */
export const REAM_INK = {
  tones: ["#ecdcbc", "#dcb9a0", "#cdd0b2", "#b9c4c9", "#e4b79e", "#d6c6e0", "#e8cc9c", "#d9c8a2"],
  /** loose sheets behind a ream: the back one, then the front one */
  loose: ["#cdb894", "#bda384"],
  looseRim: "#f5ecd8",
  bodyRim: "#f8f1e0",
  band: "rgba(90,60,40,.075)",
  seam: "rgba(84,56,40,.34)",
  seamLit: "rgba(255,250,235,.55)",
  blankSeam: "rgba(84,56,40,.25)",
  edge: ["rgba(255,250,235,.22)", "rgba(255,250,235,0)", "rgba(60,34,30,0)", "rgba(60,34,30,.22)"],
  trayRim: "#fbf3e2",
};

/** a locked family: strap, stitching, latch */
export const LOCK_INK = {
  strap: "#3a2f55",
  stitch: "rgba(255,236,190,.35)",
  shackle: "#d99a42",
  latch: "#f0aa50",
  keyhole: "#4a2e2a",
};
