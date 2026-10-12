// THREE TYPE ROLES FOR THE WHOLE PIPELINE SURFACE — and only three.
//
// The board had grown five spellings of "a small label" and four of "a number",
// each correct in its own diff: `font-jetbrains text-label tracking-[0.12em]
// uppercase` in one head, the same minus the tracking in another, `text-label
// tabular-nums` here and `text-right text-label tabular-nums` there. Nothing was
// wrong enough to fail a gate and the page read as three designs.
//
// So the surface has three roles, named for what the text IS rather than for how
// it looks, because a name like `small` is one someone else will reasonably use
// for something else:
//
//   TITLE   the work's own name, in the work's own words — a card's title, a
//           lane's label. The only serif-ish rung on the board and the only one
//           that may be `text-content`.
//   LABEL   FURNITURE: what a column is, what a control does. Uppercase, tracked,
//           monospace — it reads as a field name and never as content.
//   FIGURE  a number that is compared down a column, so tabular by definition.
//
// Sizes come from the two scale tokens and nowhere else (app/globals.css
// @theme): `text-content` 1.125rem, `text-label` 1rem, which is the floor
// `npm run check:type` enforces. Full screen scales both by redefining the
// tokens on one container, so every role moves together and none of these
// strings mentions a size in pixels.

export const TYPE = {
  /** The work's own name. Add `truncate`/`min-w-0` at the call site. */
  title: "font-hanken text-content",
  /** Furniture: a column's name, a control's name. */
  label: "font-jetbrains text-label tracking-[0.12em] uppercase",
  /** A number, tabular so a column of them lines up. */
  figure: "font-jetbrains text-label tabular-nums",
} as const;
