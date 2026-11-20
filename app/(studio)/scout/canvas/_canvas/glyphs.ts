// THE CANVAS'S GLYPHS - 16x16 path data, ONE declaration for the DOM (<Gl/> in ui/) and the canvas (render/prims.ts
// makes a Path2D of each once). `s` is stroked, `f` filled, `w` the stroke width when it is not 1.6.

import type { GlyphName } from "./tables.ts";

export type GlyphPath = { readonly s?: string; readonly f?: string; readonly w?: number };

export const GLYPHS: Readonly<Record<GlyphName, GlyphPath>> = {
  eye: { s: "M1.5 8c2-3.4 4.2-5 6.5-5s4.5 1.6 6.5 5c-2 3.4-4.2 5-6.5 5S3.5 11.4 1.5 8z", f: "M8 5.8a2.2 2.2 0 1 0 0 4.4a2.2 2.2 0 1 0 0-4.4z" },
  seed: { s: "M8 2c3 2.5 4.5 5 4.5 7.2A4.5 4.5 0 0 1 8 13.7a4.5 4.5 0 0 1-4.5-4.5C3.5 7 5 4.5 8 2zM8 7.5v3.5" },
  mute: { f: "M2 6h2.6L8 3v10L4.6 10H2z", s: "M10.5 6l4 4m0-4l-4 4" },
  cal: { s: "M3.5 3.5h9A1.5 1.5 0 0 1 14 5v7a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12V5a1.5 1.5 0 0 1 1.5-1.5zM2 7h12M5.5 2v3M10.5 2v3" },
  flag: { f: "M3 1.5h1.4v13H3zM4.4 2l8.6 2.9-8.6 3.2z" },
  x: { s: "M3 3l10 10M13 3L3 13" },
  loc: { s: "M8 3.5a4.5 4.5 0 1 0 0 9a4.5 4.5 0 1 0 0-9zM8 0v3M8 13v3M0 8h3M13 8h3" },
  moon: { s: "M4.5 12h7a3 3 0 0 0 .3-6A4 4 0 0 0 4 6.5 2.8 2.8 0 0 0 4.5 12z" },
  pause: { f: "M4 3h2.6v10H4zM9.4 3H12v10H9.4z" },
  play: { f: "M4 2.5v11l9-5.5z" },
  undo: { s: "M6 3L2.5 6.5 6 10M3 6.5h6a4 4 0 0 1 0 8H7" },
  check: { s: "M2.5 8.5l3.5 3.5 7.5-8", w: 2 },
  keys: { s: "M2.5 4h11a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM4 7h1M7.5 7h1M11 7h1M5 9.5h6" },
  next: { s: "M5.5 3l5 5-5 5" },
  prev: { s: "M10.5 3l-5 5 5 5" },
};
