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

## Admitted at the component port (wave 2, lot 7)

The token lint admits no raw colour or px in a `*.module.css` and has no hatch for a
component-local constant, so every value a component draws is either an existing token, a
derivation of one, or a role below. Counts are literals in the prototype's sheets outside
`:root`, measured 2026-10-15 with the same method as above.

**Derived, not admitted.** A hue at the prototype's alpha is `color-mix(in srgb, var(--hue) N%,
transparent)`, which renders the same rgba (chip and button rims, the tally's ink at 82%,
the ghost outline as hair-2 to hair-3 at 25%, white at .02/.03/.035 as wash at 50/75/87.5%).
These are the per-hue alphas the table above left to the port: the hue stays a token, the
alpha stays with the one component that uses it. Geometry with a real relation is `calc()`:
the tab rail's 9px corner is the tab's 7px plus the rail's 2px inset (concentric curves);
the search field's 30px inset is glyph inset + glyph + gap; the pip triangle is a pip + 1px.

| Role | Value | Uses | Definition |
| --- | --- | --- | --- |
| h-tag | `20px` | 15 | Height of a compact tag: a channel badge, a keycap inside a tab. |
| h-chip | `22px` | 6 | Height of a chip or keycap. |
| h-row | `28px` | 12 | Height of a facet or list row. |
| h-control-sm | `30px` | 15 | Height of a small button, toggle, segment, tab or group head. |
| h-field | `32px` | 8 | Height of a text field, select or ghost row. |
| h-control | `36px` | 5 | Height of a full button. |
| h-meter | `5px` | 4 | Height of a proportional meter rail. |
| size-dot | `7px` | 5 | Diameter of a status dot. |
| size-pip | `10px` | 3 | Diameter of a pip in a pip row. |
| size-glyph-xs | `12px` | 5 | Side of a chain node or a disclosure chevron. |
| size-glyph-sm | `13px` | 12 | Side of an inline glyph: an error mark, a checkbox, a link glyph. |
| size-glyph | `15px` | 6 | Side of a field glyph. |
| size-glyph-btn | `18px` | 5 | Side of a round glyph button. |
| sp-nudge | `2px` | 16 | Optical nudge: a glyph to its first line, a rail to its tabs. |
| sp-hair | `3px` | 13 | Vertical inset of a source tag or count badge. |
| sp-tight | `5px` | 26 | Space inside a chip, keycap or state: glyph to words, keycap sides. |
| sp-snug | `7px` | 28 | Inset of a stamp (tally, ledger link, tip) and gap of an error line. |
| sp-control | `9px` | 14 | Side inset of a toggle and of a field glyph. |
| sp-loose | `14px` | 29 | Gap between keymap entries; side inset of a notice. |
| sp-wide | `16px` | 15 | Side inset of a toast; gap between a term and its value. |
| stroke-glyph | `1.5px` | 17 | Ring or dashed outline of a glyph, pip or placeholder. |
| stroke-mark | `2px` | 17 | Thickness of a selection underline, keycap base or share bar. |
| stroke-bar | `2.5px` | 2 | Bar width of the pause mark. |
| ring-halo | `3px` | 6 | Spread of the halo around a node awaiting the operator. |
| r-box | `4px` | 6 | Corner of a checkbox mark. |
| r-meter | `3px` | 10 | Corner of a meter rail or hatch. |
| fs-error | `12.5px` | 9 | A verbatim error line. |
| fs-control-sm | `13.5px` | 13 | Text of a small button, a keymap legend, a hint tip. |
| fs-nav | `14.5px` | 11 | Text of navigation, crumbs, facts and a toast. |
| panel-ground | `rgba(0,0,0,.14)` | 2 | Recessed ground of a route panel (Projects, Library, Ledger). |
| hatch | the 135deg white .28 stripe | 1 sheet rule, 2 components | Fill of an undecided or unmeasured span (StackBar; v1 BandTrack's hatched band). |
| warn-cut | `#3b0712` | 1 glyph, 4 pages | Cut-out mark inside the warning glyph. |
| chan-youtube / -tiktok / -instagram | `#ff8a8a` `#8ef0f7` `#f0a6e6` | 1 rule, 3 pages | Mark colour of a publish channel. |

The space rungs are the off-scale steps the prototype's sheets use far more often than some
on-scale ones (5px and 7px against 18px); they are named by what they space, not by value.

### Admitted against the test (one component each) - Director to rule

These fail "recurring intent": each is one component's constant. They are admitted only
because the lint has no other legal spelling for a pixel. The better shape is a loud,
countable local-constant hatch in the lint (design-tokens/token-taxonomy: "an escape hatch
for the genuine one-off should exist, be syntactically loud, and be countable"); if one is
added, these six move back into their modules.

| Role | Value | Uses | Component |
| --- | --- | --- | --- |
| gap-bar | `3px` | 1 | StatusPill's pause mark |
| measure-tip | `260px` | 2 | Hint |
| w-chan | `28px` | 4 | ChannelBadge |
| w-node | `70px` | 1 | UpstreamBreak |
| toast-dock | `22px` | 2 | Toast |
| toast-rise | `20px` | 1 | Toast |
