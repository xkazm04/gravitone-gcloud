# Role admission

Source: the approved prototype `variant-1` (`tokens.css` plus the page sheets `floor`, `projects`,
`library`, `ledger`, `kit`). Counts are literals outside the `:root` block, measured 2026-10-14.
299 colour literals in all; the 57 prototype `:root` properties are carried verbatim as primitives.

A role is admitted only if it has (1) recurring intent, (2) a one-sentence definition, and (3) a
name that states the intent, not the raw value. Extraction names values; it never changes pixels,
so a candidate whose merge with a neighbour would shift a rendered value is rejected.

## Admitted

| Role | Value | Uses | Definition |
| --- | --- | --- | --- |
| wash | `rgba(255,255,255,.04)` | 14 | Resting hover fill on a neutral surface. |
| wash-hi | `rgba(255,255,255,.05)` | 12 | Hover or selected fill on a control, one step above wash. |
| focus-line | `rgba(103,232,249,.55)` | 5 | Border of a field or card that has focus or is hovered. |
| ink-veil | `rgba(8,10,16,.85)` | 4 | Translucent ink behind a glyph or label on imagery. |
| shadow | `rgba(0,0,0,.6)` | 10 | Colour of every elevation shadow. |
| letterbox | `#000` | 7 | Ground behind letterboxed video and imagery. |
| error-text | `#fecdd3` | 7 | Text of an error message on a rose wash. |
| done-text | `#a7f3d0` | 3 | Text of a ratified or done state, one step lighter than emerald. |
| illustrative-text | `#fcd77a` | 4 | Text that marks content as illustrative rather than real. |
| reference-text | `#c3cad8` | 3 | Text and rim of a reference-mode item. |
| reading | `#e9e4d8` | 5 | Serif reading text on the dark ground. |
| paper | `#ece6d8` | 4 | Ground of a paper (script or document) surface. |
| r-chip | `6px` | 26 | Corner of a chip, tally or small tag. |
| r-control | `8px` | 22 | Corner of a button, segment or nav control. |
| z-docked | `25` | 2 | Detail or month surface docked over a route. |
| z-header | `30` | 1 | The studio header. |
| z-scrim | `40` | 1 | The scrim behind a level sheet. |
| z-sheet | `50` | 1 | The level sheet. |
| z-popover | `60` | 1 | A popover anchored to a control. |
| z-tooltip | `80` | 1 | A hint tooltip. |
| z-flyer | `200` | 1 | A flyer animating between surfaces. |
| z-toast | `210` | 1 | A toast above everything. |

The z-roles recur by intent, not by count: they are the named layers of one stacking order, and a
numeric z-index in a module would be an unnamed position in it.

## Rejected

| Candidate | Uses | Reason |
| --- | --- | --- |
| `rgba(103,232,249,.10)` | 7 | Equal to the existing `--cyan-a`; use that, no new role. |
| `rgba(251,191,36,.10)` | 6 | Equal to the existing `--amber-a`; use that. |
| `#0b0e15` | 7 | Equal to the existing `--ink-1`; use that. |
| `rgba(255,255,255,.035)` | 7 | No intent distinct from wash; merging it shifts a rendered alpha, so the port decides. |
| `rgba(255,255,255,.03)`, `.02`, `.015` | 6, 5, 5 | Same: near-duplicates of wash with no separate intent. |
| `rgba(251,191,36,.18)` | 5 | One hue on one family (awaiting halo); no shared intent across components. Revisit at port. |
| `rgba(103,232,249,.35)`, `.4`, `.5`, `.6`, `.22` | 3-5 each | Per-component border tints in one hue; five alphas share no single definition. |
| `rgba(251,191,36,.5)`, `rgba(110,231,183,.5)`, `rgba(251,113,133,.5)` | 3-4 | Button borders per hue; the values differ by hue, so a role would be a name-tagged value. |
| Signal alphas at `.32 .34 .36` (chip borders) | 2 each | Differ by hue by a hair; unifying would change pixels. |
| `rgba(0,0,0,.18)` | 5 | Dim panel backdrop with no second meaning found; a single-use tint. |
| `#121a26`, `#0b1018` | 4, 3 | The audio plate gradient pair of one surface: a component constant, not a role. |
| `border-radius: 9px` | 14 | Used by piles, tiles, panels and commit buttons with no shared intent; off the 5/7/10/14 scale. Port decides which rung it joins. |
| Breakpoints 1360, 1180 | 3, 3 | A custom property cannot appear in `@media`; they stay literal there and the lint skips `@media` preludes. |
| z-index 1-9, 19-26 (local stacking) | many | Component-local stacking inside a surface; not a global layer. |
