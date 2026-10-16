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

The token lint admits no raw colour or px in a `*.module.css` (the one hatch, `--one-off-*`, is
described at the end of this section), so every value a component draws is either an existing token, a
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
| ambient | the three radial glows, verbatim | 1 world sheet, every page | The ambient light behind every page. Its hues are the prototype's (cyan-400, violet-500, emerald-500), not the signal tokens; kept whole so the pixels stay byte-equal. |
| warn-cut | `#3b0712` | 1 glyph, 4 pages | Cut-out mark inside the warning glyph. |
| chan-youtube / -tiktok / -instagram | `#ff8a8a` `#8ef0f7` `#f0a6e6` | 1 rule, 3 pages | Mark colour of a publish channel. |

The space rungs are the off-scale steps the prototype's sheets use far more often than some
on-scale ones (5px and 7px against 18px); they are named by what they space, not by value.

### One-offs, moved out of the source (owner ruling, 2026-10-15)

These six were first admitted as roles against the "recurring intent" test, because the lint had
no other legal spelling for a pixel. The lint now has one: a custom property named
`--one-off-<name>`, declared once in the component's own module, may hold a px literal (never a
colour). The name is the loud part, and `tokens:check` counts every one against a budget that
may only fall (`ONE_OFF_BUDGET` in `pipeline/check-tokens.mts`). To raise the budget, add a row
here saying which component's constant it is and why no role fits.

| One-off | Value | Component |
| --- | --- | --- |
| `--one-off-gap-bar` | `3px` | StatusPill's pause mark |
| `--one-off-measure` | `260px` | Hint |
| `--one-off-w-chan` | `28px` | ChannelBadge |
| `--one-off-w-node` | `70px` | UpstreamBreak |
| `--one-off-dock` | `22px` | Toast |
| `--one-off-rise` | `20px` | Toast |

## Admitted at the Ledger port (Phase 2, lot 16)

`ledger.css` sizes its route from a handful of layout constants and colours rendered JSON with
four literals. Each is admitted with the one intent it serves; none merges with a neighbour,
because every candidate neighbour differs by at least a pixel or a channel.

| Role | Value | Uses | Definition |
| --- | --- | --- | --- |
| w-rail | `228px` | 2 | Width of a route's left rail: the Ledger's facets and the time strip's readout above them. |
| w-detail | `344px` | 1 | Width of a route's docked detail panel. |
| w-search | `clamp(220px,21vw,400px)` | 2 | Width of the search field in a route's toolbar (and the agent view's query column). |
| ledger-cols | `54px 96px 128px 128px minmax(0,1fr) 70px 90px` | 2 | Columns of an event row and its head (the `cols` precedent: a grid template is one value). |
| h-event | `34px` | 2 | Height of an event row; the list windows by it, so CSS and arithmetic read one number. |
| h-line | `22px` | 2 | Height of one JSON Lines row. Equal to `h-chip` by value, not by intent. |
| w-line-no | `46px` | 1 | Width of the line number before a JSON line. |
| h-strip | `60px` | 1 | Height of a time strip's bar box. |
| h-axis | `20px` | 1 | Height of a time axis under a strip. Equal to `h-tag` by value, not by intent. |
| code-ground | `#06080d` | 1 | Ground of a rendered JSON record. |
| code-text | `#c9d1e0` | 2 | Punctuation and plain text of rendered JSON. |
| code-key | `#8b95ab` | 2 | A key in rendered JSON. |
| code-string | `#e7ebf3` | 2 | A string value in rendered JSON. |
| hatch-future | the 135deg white .035 stripe | 1 | Fill of a day that has not happened yet (much fainter than `hatch`, which marks undecided work). |

Not admitted, mixed from a token instead: the strip's top light (`wash` at 37.5%, the
prototype's .015), the row's hairline (`hair` at 56.25%, .045), the row hover (`wash` at 70%,
.028). Moved a pixel, recorded in INVENTORY.md: an error trailing a row is `error-text`
(`#fecdd3`) where the prototype wrote `#fda4af`; the raw JSON block's corner is `r-control`
(8px) where the prototype wrote the rejected 9px.

## Admitted at the Runs port (Phase 2, lot 18)

`projects.css` draws the day-line from a few constants the token set had no word for. Each is
admitted with the one intent it serves. The day-line's track geometry (30px tracks, 4px apart,
rows at least 58px) is NOT here: the packer computes bar positions from it, so it lives once in
`components/runs/dayline.ts` and reaches the sheet as data (`--t`, `--bh`, `--h`).

| Role | Value | Uses | Definition |
| --- | --- | --- | --- |
| w-lane | `214px` | 4 | Width of a resource lane's label column on the Runs day-line (label, axis corner, links' and NOW's origin). |
| h-hours | `34px` | 3 | Height of the hour axis over the Runs day-line. |
| fs-bar | `12.5px` | 2 | Label inside a bar on a time track, and the same label set beside it. Equal to `fs-error` by value, not by intent. |
| size-mark | `14px` | 4 | Side of a lane's mark and of a pin on a time track; the pin's diamond is 9/14 of it. |
| cloud-mark | `#cbd5e1` | 1 rule, 3 lanes | Mark of a paid cloud resource (Google, ElevenLabs, Leonardo, Qwen) on a lane chip. |
| w-list | `clamp(250px,19vw,300px)` | 1 | Width of the Projects route's composition list (the `cal-w` precedent: a clamped column is one value). |
| w-inspector | `clamp(290px,23vw,360px)` | 1 | Width of the inspector beside the Runs day-line. |
| fs-title | `24px` | 1 | Serif title of what a Projects view is showing; off the type scale (19, 32) in the prototype too. |

Moved a pixel, recorded in INVENTORY.md: the NOW label's ink is `ink` (`#080a10`) where the
prototype wrote `#05252b`; a hovered bar's ground is `ink-3` (`#161b27`) where it wrote `#141a26`;
a done bar's label and the "beside" label of a done bar are `done-text` where it wrote `#c9f7e6`
and `#9fd9c1`; the link stroke is `ink-bright` at 28% where it wrote white at .28.

## Admitted at the Floor port (Phase 3, lot 20)

`floor.css` lays the Floor out from a handful of lengths the set had no word for; each is admitted
with the one intent it serves. Colours are not admitted: every wash, stripe and wall end on the
Floor is a signal token mixed to the prototype's alpha (recorded in INVENTORY.md), except the
paper ink, which the Board's article page (lot 21) sets on the same paper.

| Role | Value | Uses | Definition |
| --- | --- | --- | --- |
| h-lane-folded | `48px` | 2 | Height of a Floor lane folded to its summary while another lane is focused. |
| h-lane-min | `176px` | 2 | Least height of an unfocused Floor lane whose ratified column is empty. |
| w-wall | `9px` | 1 | Width of the Weir's wall at the right edge of the Weir column. |
| w-thumb | `52px` | 2 | Width of a run's thumbnail in the Foundry column (equal to the lane rail by value, not intent). |
| h-thumb | `36px` | 1 | Height of a run's thumbnail. Equal to `h-control` by value, not by intent. |
| h-pile-face | `64px` | 1 | Height of a Weir pile's stacked face. |
| w-pile | `112px` | 2 | Least width of a Weir pile in its grid (the Floor and the kit). |
| w-shelf-tile | `86px` | 1 | Least width of a style tile on a Library shelf. |
| h-progress | `3px` | 1 | Height of a run's progress rail. |
| slot-cols | `42px 26px minmax(0,1fr)` | 1 | Columns of a calendar slot row: time, channel, title (the `ledger-cols` precedent). |
| w-next | `360px` | 2 | Widest the header's NEXT button grows (and a third of it, its title at 1340px). |
| h-month-bar | `52px` | 1 | Height of the calendar month's top bar. |
| w-month-side | `clamp(300px,25vw,400px)` | 1 | Width of the agenda beside the calendar month (the `cal-w` precedent). |
| paper-ink | `#1d1a16` | 2 | Text set on a paper surface: a pile's article title, the Board's article page. |
| paper-faint | `#6d6455` | 1 | Secondary text on paper: the turn or source label. |

## Admitted at the Board port (Phase 3, lot 21)

`floor.css`'s board desk, `tokens.css`'s level sheet and the inline sizes `index.html` set on the
desks (`--tile:150px`/`230px`). Each role serves one intent of the Board; where a neighbour was
equal by value but not by intent it was reused only where the intent matched (`fs-h2` for the
article's 19px standfirst and section heads, `warn-cut` for a reject badge's cut-out mark).

| Role | Value | Uses | Definition |
| --- | --- | --- | --- |
| w-packet-rail | `268px` | 1 | Width of the Board's packet rail beside the desk. |
| h-sheet-bar | `50px` | 1 | Height of a level sheet's crumb bar. |
| w-grab | `44px` | 1 | Width of the grab handle on a level sheet. |
| dur-sheet | `.34s` | 1 | How long a level sheet takes to rise over the Floor. |
| sheet-ground | the 180deg `#0f131c` → `#0a0d14` gradient | 2 | Ground of a level sheet (and of the consequence panel drawn on it). |
| shadow-sheet | `0 -30px 80px rgba(0,0,0,.7)` | 1 | The shadow a level sheet casts up over the Floor (one value: a shadow is one declaration). |
| h-commit | `38px` | 1 | Height of the commit button that ends a desk. |
| r-tile | `9px` | 2 | Corner of a decision tile and the commit button (the 9px the table above left to the port). |
| w-foot-tally | `200px` | 1 | Least width of the kept · rejected · undecided meter in a desk's foot. |
| w-cull-label | `132px` | 2 | Width of a matrix row's label column and its reference image. |
| w-tile | `150px` | 2 | Least width of an image tile in the matrix cull. |
| w-tile-audio | `230px` | 1 | Least width of an audio take tile. |
| size-badge | `26px` | 2 | Side of the keep / reject badge on a decided tile. |
| h-wavebox | `86px` | 1 | Height of the waveform box on an audio take tile. |
| wave-ground | the 180deg `#121a26` → `#0b1018` gradient | 1 | Ground behind an audio take's waveform (the pair the table above called a component constant; the lint has no colour hatch, so it is named for its one intent). |
| r-arm | `12px` | 2 | Corner of a blind pair's arm and of the cut review's player. |
| w-pair-thumb | `160px` | 2 | Width of an arm's thumbnail in a blind pair's summary. |
| w-desk-side | `300px` | 2 | Width of a review desk's side column (the article's checks and plan, the cut's beats). |
| sp-page | `28px` | 1 | Inset of the article page in a review desk. |
| sp-page-end | `60px` | 2 | Scroll room after the last section of a review desk's page and side. |
| sp-page-gap | `22px` | 1 | Space between an article's standfirst and its first section. |
| fs-article | `34px` | 1 | Serif title of an article under review (off the 32px `fs-h1`). |
| reading-bright | `#fbf7ee` | 2 | Serif headings of an article under review. |
| reading-muted | `#c9c2b3` | 1 | An article's standfirst under its title. |
| h-directive | `26px` | 1 | Height of a directive toggle in an edit note (equal to `size-badge` by value, not by intent). |
| note-text | `#fde68a` | 2 | Text of an operator's edit note on a section or a beat. |
| w-timecode | `62px` | 1 | Width of a caption beat's timecode column. |
| fs-beat | `15.5px` | 1 | Text of a caption beat in the cut review. |

Not admitted, mixed from a token instead: the commit button's emerald at .45 / .14 / .22, the
refusal's rose at .6, the edit note's amber at .4 / .06, the focused section's wash at 87.5%
(the prototype's white .035), the rail's and the foot's letterbox at .18 / .2, the tile caption
ground `--ink` at .9. Moved a pixel, recorded in INVENTORY.md "Board parts".

## Admitted at the Library port (Phase 5, L50)

From `library.css` (the route's grid, the tile and row sizes per density, the list's columns, the
detail's type) and the prototype's `PAL` fallback. Every value is the prototype's; each role is one
intent of the Library. The tile and row sizes are read back by the window arithmetic through
`tokens.ts` (`packages/ui/src/components/library/library.ts SIZES`), so CSS and JS share one number.

| Role | Value | Uses | Definition |
| --- | --- | --- | --- |
| w-lib-nav | `clamp(236px,17vw,276px)` | 2 | Width of the vocabulary rail (column and drawer). |
| w-lib-detail | `clamp(340px,25vw,404px)` | 3 | Width of the detail panel (column and drawer); the search field's cap is read from it. |
| w-lib-tile-s / -m / -l | `150px` / `206px` / `300px` | 2 | Least width of a grid tile per size (equal to `w-tile` by value, not by intent). |
| h-lib-cap-s / h-lib-cap | `32px` / `48px` | 2 | A tile's caption height per size. |
| h-lib-row-s / -m / -l | `34px` / `40px` / `56px` | 2 | A list row's height per size. |
| w-lib-thumb-s / -m / -l | `48px` / `56px` / `84px` | 2 | A list row's thumbnail column per size. |
| lib-cols, lib-cols-mid, lib-cols-narrow | the `.lrow` track lists at >1360, >1100, below | 2 | A list row's columns after its thumbnail, at the prototype's two narrowing steps. |
| size-kind-badge | `24px` | 2 | The kind mark in a tile's corner (and the ref mark's offset from it). |
| fs-lib-title | `22px` | 1 | The item's serif title in the detail. |
| fs-lib-count | `34px` | 1 | The set summary's serif count (equal to `fs-article` by value, not by intent). |
| h-lib-audio | `150px` | 1 | The audio preview's height (drawn by L52's AudioPreview, defined once here). |
| w-lineage-role | `62px` | 1 | A lineage node's role column (equal to `w-timecode` by value, not by intent). |
| w-lineage-thumb | `30px` | 1 | The thumbnail on a lineage link. |
| lib-face-a / lib-face-b | `#24304a` / `#3a2537` | 2 | A designed face's two grounds when the item names no palette (library.js `PAL` fallback). |

Not admitted, mixed or composed from tokens instead: the scrim at `--ink` 58% (the prototype's
`rgba(5,7,12,.58)`), the tile's kind badge ground `--ink` 78%, the ref mark's `--ink` 80%, the
selected row's cyan at 9%, the summary's kind-bar columns as multiples of `--sp-7`. Moved a pixel,
recorded in INVENTORY.md "Library parts".
