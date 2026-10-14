// The style block: the four slots a visual identity is written in. Pure types;
// lib/themes.ts re-exports them and owns the theme record built on top.


/* ── The style block ──────────────────────────────────────────────────────── */

/** Which job a colour does. An unassigned palette drifts: the model re-casts
 *  which colour carries meaning on every frame. */
export type ColorRole = "ground" | "objects" | "accent";

export interface PaletteColor {
  name: string;
  hex: string;
  role: ColorRole;
}

/** The four slots. Plain language on purpose — this is what the user edits,
 *  and it is compiled to model syntax only at generation time. */
export interface StyleBlock {
  technique: string;
  subject: string;
  /** Exactly three, one per role. */
  palette: PaletteColor[];
  finish: string;
}

