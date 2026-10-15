# Component inventory - the kit extracted from the approved design

Source: `docs/next/prototype/app` (Floor `index.html`+`studio.js`+`floor.css`, Projects, Library,
Ledger, Kit; `tokens.css` holds the shared vocabulary, `shell.js` its render functions).
Pages: F floor (incl. Board sheet, Calendar), P projects (Plan/Runs/Compose), L library, G ledger.
The page sheets share almost no selector with each other (measured: 4 of ~400); what recurs
across pages lives in `tokens.css` and `shell.js`, so that is where the kit comes from.

## Shared primitives (built in this lot)

| Kit name | Replaces (prototype) | Pages | States / variants |
| --- | --- | --- | --- |
| `status/STATUS` + `StatusPill` | `.state.*`, GT.State; the 5 mapping copies (index `SLOT_STATE` + slot detail, kit `mslot`, projects `STATUS_TO_STATE` + ribbon tail) | F P L | 8 looks: idle paused running awaiting done failed reference candidate; 8 vocabularies (job run part project packet slot style library) |
| `Chip` | `.chip` (+`b`, `.dot`), `button.chip`, `a.chip` | F P L G | tone neutral/cyan/violet/emerald/amber/rose; ghost; casing caps/lower; dot; span/button(pressed)/link |
| `Tally` | `.tally`, GT.Tally | F P L G | value, of, label |
| `StackBar` | `.stackbar`, GT.StackBar | F L | kept/rejected/undecided; whole-hatched when untouched |
| `PipRow` | `.piprow .pip.*`, GT.PipRow | F P | pip per Look; capacity (`max`) as bare pips |
| `Hint` | `.hint`, GT.Hint | F L | one; text capped at 12 words by type |
| `Keycap`, `Keycaps` | `.keycap`, `.keymap`, GT.Keycaps, every hand-typed `<kbd>` | F P L G | md/sm cap; legend per keymap mode + facts/field |
| `SourceTag` | `.src.*`, GT.Src | P L G | real, illustrative, model, fixture, derived, session; `value` (the figure it qualifies: `model $417`) |
| `LedgerLink` | `.ledger-link`, GT.LedgerLink | F P L | one |
| `ErrorLine` | `.err` (+ I.warn) | F P L G | static / live (role=alert) |
| `ChannelBadge` | `.chan.*` | F P L | youtube, tiktok, instagram |
| `Button` | `.btn`, `.btn.{tone}`, `.btn.sm`, `kbd.keycap` inside | F P L G | tone x size; glyph; badge chip; tally stamp (`history 9`); trailing glyph (`Open record ›`); shortcut from keymap; aria-disabled |
| `Toggle` | `.toggle[aria-pressed]` | F P L G | on/off; glyph; count of what is on; keycap; aria-controls/expanded for a drawer |
| `Seg` | `.seg button[aria-pressed]` | F P L G | one of n; option glyph, count, actor accent (Ledger actors) |
| `Field`, `Select`, `Search` | `.field`, `select.field`, `.search` | P L G | keyfield; search caps from the mode's `search` verb |
| `CapsHeading` | `.side-h`, `.h4` / `.detail h4` | F P L G | side / section; level; tally |
| `Panel` | `.panel`, `.panel-head`, `.panel-body`, `.toolbar` | P L G | title + tally; toolbar |
| `Empty` | `.empty` | F L G | label (<= 12 words by type); one act |
| `Ghost` | `.ghost-card` | F P | count; spoken label |
| `Toast` | `.toast`, GT.toast/announce | F P L G | open/closed; always-mounted polite region |
| `Crumbs` | `[data-component=Crumbs]` | F P L | link/button steps; current place |
| `Facts` | `.obs` (dl) | F L | term/value rows |
| `Wave` | GT.Wave | F P L | tone; playhead; empty midline |
| `FacetRow` | library `.frow`, ledger `.fr` | L G | mark check (L) / rail (G) + share bar; `nested` value with its tone (ledger `.fr.sub`) |
| `Glyph` | shell.js `I.{ledger,search,warn,down,up,chevR,grid,doc,operator,agent,machine}` | all | only the glyphs a primitive draws; the three actor marks travel with ActorKind |

Built for the signal vocabulary although on one page: `Fold` (library `.fgh`), `TabRail`
(projects `.tabrail`), `UpstreamBreak` (floor slot detail), `Provenance` (floor style detail).

Layout-only classes are not components: `.kv` (a wrapping row; Provenance carries its gap),
`.route`, `.detail`, `.detail-grid`, `.ell`, `.mono`, `.sr-only` (-> `a11y/SrOnly`).

## v1 signal vocabulary (`components/ui/signal/*`) -> the new kit

| v1 | Prototype counterpart | New kit |
| --- | --- | --- |
| Hint (+ useHint, HintPopover) | `.hint` | `Hint`; the open tip is a `tooltip` layer, dismissed by Escape through the keymap (see Hint.tsx) |
| Tally (+ CHIP_CLASS, TALLY_TONE) | `.tally` (stamp) and `.chip` (tag) | `Tally` + `Chip`; tone/zero/door move to Chip |
| PipRow | `.piprow` | `PipRow` over Looks; label required |
| TabRail | projects `.tabrail` | `TabRail` as nav + aria-current; no blurb |
| Fold | library facet group head `.fgh` | `Fold` (controlled) |
| StackBar | `.stackbar` (k/x/u) | `StackBar` (fixed kept/rejected/undecided; v1's free segments dropped) |
| BandTrack | no prototype counterpart | not built |
| Ghost | `.ghost-card` | `Ghost` |
| UpstreamBreak | floor `UpstreamBreak` | `UpstreamBreak` (error form only) |
| Keycaps (+ keymap.ts) | `.keymap` (drawn open) | `Keycaps` from `keyTable`; keymap lives in `src/keymap` |
| StaleBadge | ledger `.apx` (the "≈ derived time" mark) - a glyph, not a badge | `StaleBadge` over @gt/ui/freshness's edge (Phase 2, lot 16); the `≈` mark lives in `EventRow` and speaks "derived time" |
| Provenance | floor `[data-component=Provenance]` | `Provenance` |
| useCountFilter | none (route logic) | not a component |

## Page compositions - wave 3+ (not this lot)

Floor: StudioHeader (+ next-btn, nav, brand mark, reset chip), Lane, FoundryCell, IdeaComposer,
Estimate, RunRow (+ stagepips, run-bar shimmer), RunTrack, WeirCell, Pile, ShelfCell,
ShelfStyle, CalendarColumn, SlotRow, MonthCalendar (mday/mslot), LevelSheet + scrim + grab,
flyer, `.ledger-t` table. Board: BoardDesk, PacketRail, MatrixCull + CullTile, BlindPair,
PacketReview, ArticlePage, EditNote, CutReview, OracleStrip, StepTrack, commit/wait/refuse.
Projects: CompositionList (`.prow`), PlanBreakdown, IdeaSlotRibbon (`.rnode`), re-route
`.alt`, launch-plan. RunsDayline, lane chips and the resource summary: built in Phase 2 (below).
Library: LibraryNav (`.kind`), FacetGroup body, LibraryToolbar (`.fchips`), LibraryResults
(virtual grid/list), LibraryDetail. Ledger: built in Phase 2 (below). Kit page itself (`/kit`, wave 3).

## Where extraction moved a pixel decision (owner to confirm)

- Outer margins are placement, the caller's (ui-controls/call-site-ownership): `.err`
  margin-top 5px, `.h4` margin 22px 0 8px, `.kv` margin 8px 0. A composition restores them.
- Chip `casing="lower"` is `.chip.lc` (letter-spacing 0); Provenance's prototype chips kept
  .03em tracking with only `text-transform:none`. Provenance now uses the `lc` look.
- Ghost rows are one height (32px, `--h-field`); the prototype set 32 or 34 inline per site.
- The two facet rows (Library check, Ledger rail) are one component with two marks, both
  pixel-exact; which survives is the owner's call.
- The prototype's `blog` channel ("PR", amber) has no badge: the domain publishes to
  youtube, tiktok and instagram only.

## Ledger parts (Phase 2, lot 16)

| Kit name | Replaces (prototype) | Pages | States / variants |
| --- | --- | --- | --- |
| `TimeStrip` (+ `strip.ts`) | ledger.js `renderStrip`, `.lg-strip`, `.ts-*` | G | √n bars stacked machine/agent/operator; future days hatched; empty days drawn as measured zero; NOW line; drag sets a range, a click on the whole range clears it; hover readout as a live region |
| `EventRow` (+ `usd.ts`) | ledger.js `rowHtml`, `.ev`, `.ty` | G | actor rule and glyph; type tag by tone; subject link; error/note trail; cost with `est`/`ill` mark; `≈` derived time (spoken); the v1 store it came from; selected; fresh |
| `JsonLine`, `JsonBlock` (+ `highlight.ts`) | ledger.js `lineHtml`, `jsonHi`, `.jl`, `.json` | G | one line with its number (fixed height, windowed); one pretty record; runs, never HTML |
| `StaleBadge` | v1 `signal/StaleBadge.tsx` | G | nothing when live; amber `stale 42 s` / `offline 9 min` from the freshness view |

Not extracted: the facet drawer is the route's own layout (two media queries over the rail);
the list's column head shares `--ledger-cols` with `EventRow` and stays in the route.

Pixel decisions at the Ledger port (owner to confirm):
- A row's trailing error is `--error-text` (`#fecdd3`); the prototype wrote `#fda4af` there only.
- The raw JSON block's corner is `--r-control` (8px) where the prototype wrote the rejected 9px.
- The `facets` toggle's glyph sits 4px from its word (the prototype's inline 5px margin).
- A row carries no provenance tag (the prototype's `.src` per row): a store holds one universe,
  so the toolbar says `fixture` once, as a solid chip - a dashed tag per row also read under
  the 3:1 mark floor on every row of a fixture ledger.
- The strip draws no session segment and no due marks: nothing writes from the studio in
  Phase 2, and publish slots arrive with their source.

## Runs parts (Phase 2, lot 18)

| Kit name | Replaces (prototype) | Pages | States / variants |
| --- | --- | --- | --- |
| `RunsDayline` | projects.js `renderRuns`, `Bar`, `drawLinks`; projects.css "runs" | P | one row per `RESOURCE_LANES` lane + Weir + Calendar; bar per Look (status.ts) + gate ◆ + blocked + floor corner; sub-track packing to capacity, `+N` open/closed; label in / beside / hover; NOW; night bands; UTC axis at 12h · 24h · 3d · week; links up (cyan) / down (amber) / rest / bad (rose dashed); calendar pins per SlotState |
| `LaneChip` | projects.css `.lane-chip` (+ `.l-*` classes) | P | mark by kind: local, seat, cloud, weir, calendar |
| `ResourceSummary` | projects.css `.res-list` / `.res` | P | per lane: running, waiting, occupancy meter |

Pure modules beside them: `runs/dayline.ts` (zooms, axis, nights, `pack`, `barBox`/`anchors` -
one geometry for bars and links -, `inWindow`, `seatLabels`, `occupancy`), `runs/thread.ts`
(`upstreamOf`, `downstreamOf`, `blockedBy`, `light`), `runs/lanes.ts` (`LANE_SPECS`, total over
the domain's lanes; `LANE_ORDER`, its zod-free twin).

Where this port moved from the prototype:
- Utilisation is occupancy now (running over capacity), not next-24h planned minutes: v1 records
  no ETA for any job, so minutes would be a guess. The meter returns to minutes with Phase 4 plans.
- A live bar's end is NOW (open), and a job with no recorded start sits at NOW at the packer's
  minimum width, marked ≈ in its name. The prototype drew planned futures; none exist yet.
- The lane icons are the prototype's three SVGs (machine, agent, route) drawn by the row's kind,
  so a lane added to the domain gets its kind's mark rather than none.
- Moved a pixel: NOW label ink `ink` (prototype `#05252b`), bar hover ground `ink-3` (`#141a26`),
  done labels `done-text` (`#c9f7e6`, `#9fd9c1`), link stroke `ink-bright` 28% (white .28).
