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
| `Chip` | `.chip` (+`b`, `.dot`), `button.chip`, `a.chip` | F P L G | tone neutral/cyan/violet/emerald/amber/rose; ghost; casing caps/lower; dot; span/button(pressed)/link; a door described by its `Tip` (`describedBy`) |
| `Tally` | `.tally`, GT.Tally | F P L G | value, of, label |
| `StackBar` | `.stackbar`, GT.StackBar | F L | kept/rejected/undecided; whole-hatched when untouched |
| `PipRow` | `.piprow .pip.*`, GT.PipRow | F P | pip per Look; capacity (`max`) as bare pips |
| `Hint`, `Tip` | `.hint`, GT.Hint | F L | Hint: one "?" glyph, text capped at 12 words by type. Tip (2026-10-23): the same `tooltip` layer opened by the control itself, its id handed to the trigger's aria-describedby; a bold `term` for a bare trigger (a key cap); `above` at a desk foot; `seededOpen` for /kit. Its text is data (a reject reason's meaning, @gt/domain/source `REASON_MEANING`), held to 12 words by the domain test |
| `Keycap`, `Keycaps` | `.keycap`, `.keymap`, GT.Keycaps, every hand-typed `<kbd>` | F P L G | md/sm cap; legend per keymap mode + facts/field; `tips` by row and cap: a cap that stands for something (a reason key) takes focus and opens its `Tip` |
| `SourceTag` | `.src.*`, GT.Src | P L G | real, illustrative, model, fixture, derived, session; `value` (the figure it qualifies: `model $417`) |
| `LedgerLink` | `.ledger-link`, GT.LedgerLink | F P L | one |
| `ErrorLine` | `.err` (+ I.warn) | F P L G | static / live (role=alert) |
| `ChannelBadge` | `.chan.*` | F P L | youtube, tiktok, instagram, blog (lot 20) |
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
- The prototype's `blog` channel ("PR", amber) had no badge at first (the domain publishes to
  youtube, tiktok and instagram only); lot 20 gave it one, as a badge, not a slot channel.

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

## Floor parts (Phase 3, lot 20)

| Kit name | Replaces (prototype) | Pages | States / variants |
| --- | --- | --- | --- |
| `Lane`, `LaneSummary` | index.html `Lane`, floor.css `.lane`, `.lane-rail`, `.cell`, `.c-foundry/.c-weir/.c-shelf`, the weir wall, `.summary` | F | open / focused (cyan edge) / folded (rail lies down, cells hold a one-line summary); the rail's key is the keymap's `open-lane` cap by position |
| `RunRow` | index.html `RunRow`, `.run-thumb`, `.run-meta`, `.run-bar` (+ `.shimmer`) | F | state via STATUS.job; done/total and stage; attempt > 1; v1's error verbatim; share rail, or shimmer when running uncounted; link or text |
| `Pile` | index.html `Pile`, `PileFace`, `CoverFace`; `.pile-face`, `.sheet-l`, `.mode-glyph` | F | faces: paper (article), waveform sheets (audio), designed face source + run id (image, video), cover when known; mode glyph per desk; NEXT ring; decided/pending rail |
| `ShelfCell`, `ShelfGrid`, `ShelfStyle`, `ShelfList`, `ShelfRow` | index.html `Shelf`, `ShelfStyle`, `TakeRow`, posts; `.shelf-head`, `.styles-grid`, `.row-btn` | F | head with door and counts; folded to its head when empty; style tile with lock (plate or designed ground); row with lead mark, title, fact, trailing chip |
| `CalendarColumn` | index.html `CalendarColumn`, `.cal-head`, `.cal-sec`, `.cal-day`, `.now-line` | F | Next by UTC day with NOW after the overdue; Failed · missed with errors; Published (first 6); expand control with its C cap |
| `SlotRow`, `SlotMark` | index.html `SlotRow`, `.chan` | F | STATUS.slot; error verbatim when failed/missed; cancelled struck; unknown channel id spoken behind a neutral mark |
| `MonthCalendar` | index.html `renderMonth`, `MonthSlot`; `#month`, `.mday`, `.mslot`, `.m-side` | F | Monday-first whole weeks; out/past/today/selected/has-fail days; slot rule per look; +N past MAX_PER_DAY; channel toggles; month state counts; day or month agenda |
| `SlotDetail` | index.html slot level (`openLevel({kind:"slot"})`) | F | the slot record: player or blog PR card, description verbatim, error on the `UpstreamBreak` chain scheduled → auth → upload → live, metrics as Tallies (null —, lower bound ≥ N), verbs |
| `SlotConfirm` | `consequence/` vocabulary | F | cancel / publish-now confirm naming the slot and the consequence |
| `ScheduleForm` (+ `schedule.ts`) | v1 app/calendar/Composer.tsx | F | export x channel x UTC hour x title/description/tags; warns a past hour, a same-minute clash, an export already on the channel; engine refusal verbatim; blog never offered |
| `ChannelReadiness` | v1 app/calendar/ChannelsTab.tsx | F | per channel live / dry / not wired (env NAMES only) / act (blog); standing failure with its count in a row; the CLI command to wire it |
| `slot.ts` | index.html slot verbs; v1 app/calendar/calendarModel.ts | F | verb rules (movable, cancellable, publishable; blog never uploads), UTC move field from the next full hour, `breakOf`, `figure` |
| `NextButton`, `SpendChip`, `LedgerDelta` | shell.js `header()` `.next-btn`, `.hdr-spend`, `#hdr-ses` | all | NEXT with title, size, ⏎ / weir clear; spend total with each non-real source's share, `+` when the read was capped; ledger +N (cyan when new) |
| `FloorGlyph` | shell.js `I.image/article/audio/video`, `I.cull/pair/review`, `I.lock/expand/collapse/chevL/chevR` | F | the Floor's own marks, beside the Floor rather than in `Glyph` |

Pure modules beside them: `floor/floor.ts` (`FLOOR_LANES`, the zod-free twin of MEDIA_LANES;
`modeOf`, `laneRows`, `progressShare`), `floor/calendar.ts` (UTC `clock`/`dayLabel`, `railOf`,
`nextRows`, `monthCells`, `shiftMonth`, `moveDay`, `byDay`), `header/header.ts` (`spendParts`,
`ledgerDelta`).

Where this port moved from the prototype:
- No composer, no Launch, no Estimate (COMMON decision 11): the Foundry cell is the run track
  alone. RunRow thumbnails are the lane's mark, not a plate: v1's live work carries no preview.
- Image and video piles draw the designed face (source + run id) where the prototype drew three
  plates: v1's Weir item names no cover. A pile's rail is decided/pending, not kept/rejected:
  v1 counts decided items without their split, and StackBar would have to invent it.
- The shelf's play and Spawn MV controls are not drawn (the Floor writes nothing in this phase).
- Calendar times are UTC and the NOW line says so; the prototype mixed UTC day keys with local
  times. A scheduled slot past its hour stays under Next, before NOW, until v1 calls it missed.
- The month's +N is a fixed count per day (MAX_PER_DAY 3), not a measured overflow.
- Moved a pixel: the column washes, the weir's stripes and wall ends, the pile hovers and the
  month's slot fills are their signal tokens mixed to the prototype's alphas (the wall's ends are
  `--wall` mixed toward `--letterbox`, where it wrote `#5a3f0b` and `#7a5410`); the month ground
  is `--ink-1` (`#0b0e15`, the prototype `#0a0c13`); the article pile's ink is `--paper-ink`.

## Board parts (Phase 3, lot 21)

| Kit name | Replaces (prototype) | Pages | States / variants |
| --- | --- | --- | --- |
| `LevelSheet` | tokens.css `[data-component=LevelSheet]`, `.scrim`, `.grab`, `.sheet-bar`, `.sheet-close`, index.html `openLevel` | F | sheet over the Floor (rises; a `sheet` layer in the desk's keymap mode; its close is the caller's) / full page (in flow, no scrim, still on the stack) / specimen |
| `BoardDesk`, `DeskFrame` | `[data-component=BoardDesk]`, `.desk`, `.desk-top`, `.desk-main`, `.desk-foot` | F | title + mono second line; marks; foot; an overlay (the lens, the consequence) |
| `PacketRail` | index.html `PacketRail`, `.rail-lane`, `.rail-item` (+ `.done`, `[aria-current]`) | F | grouped by lane (its FloorGlyph mark, open tally) then desk; open (amber mode mark, FloorGlyph), committed (✓), returned (↩); link + client open |
| `OracleStrip` | index.html `Oracle` | F | pass / fail, summary, digest, fixture |
| `CommitButton` | `.commit`, `.commit.wait`, `.commit.refuse` + `@keyframes shake` | F | ready / waiting (`N undecided`, `N left`) / refusal replayed per press; cap from the mode's `commit` row |
| `MatrixCull` (+ `RunMosaic`, `RunCard`, `RunModal`, `RunView`, `VariantCard`, `VerdictPick`, `VideoBar`, `IdeaList`, `CullFoot`, `useRunDesk`, board `runs.ts`) | the run grid (2026-10-22, operator-designed; no prototype source) | F | runs filed in tabs by content kind (images · videos · audio · ideas) and category rows; a run card per run (picture, label, a pip per variant); a run opens across the whole screen with its brief (aim, checks), at most three variants a row, a verdict by click under each and on the whole run, each reject reason opening its meaning as a `Tip` (and each reason key in `CullFoot`), a clip's play / sound / volume bar; words-only runs decided in place in the ideas list; every act also a key |
| `NoteField`, `NoteText` | — (no prototype; spark scout-decision-graph WP-S1) | B | a one-line note on a cull decision: @gt/ui `Field` keyed `note`, opened by E, saved with ⏎ and dropped with Esc in `board.cull`; `NoteText` the saved note under its row, in the operator's words |
| `CullTile`, `Zoom` | index.html `CullTile`, `Zoom`; `.tiles`, `.badge`, `.reason`, `.nudge`, `.wavebox`, `.take-tile-body`, `.zoom` | F | tile image / video / audio take / text; cur / keep / reject / nudge; reasons as rose chips; the lens over a desk; a `model/*` cell (spark game-3d-assets): the tile its poster (`ItemWords.poster`) or its words, never a canvas, the lens the `ModelViewer`; in an opened run the current model cell is the live viewer (`VariantCard`, one canvas at a time) |
| `Plate` | every `<img>` a desk draws | F | lazy or eager; the one exemption from next/image (a candidate is judged as its own bytes) |
| `BlindPair` | index.html `BlindPair`; `.pair-q`, `.pair-arms`, `.arm` (+ `.picked .dropped .bad`), `.armcap`, `.masked`, `.agree-banner` | F | masked arms / revealed for a beat (agrees, differs, not comparable) / summary with agreement tally |
| `PacketReview`, `ArticlePage`, `EditNote` | index.html `ArticleReview`, `EditNote`; `.page-wrap`, `.sec` (+ `.focus .noted .sec-tools`), `.directives`, `.note-chip`, `.review-side`, `.rev`, `.checkrow` | F | illustrative / stand-in draft; section focus and notes; the five directives; reviewers' quorum pips; edit plan; reject reasons from the source |
| `ApproveSchedule` (+ `review/schedule.ts`) | index.html `Approve → calendar` :659, :848-850 | F | the calendar half of Approve: channel + UTC hour, proposed next day 08:00 UTC; a malformed `calendar:` line refused, never read as none |
| `CutReview` | index.html `CutReview`; `.player`, `.beats`, `.beat` (+ `.focus .noted`) | F | player, caption beats with seek, a note per beat; approve / reject |
| `ConsequencePanel` | none (decision 6 is new) | F | reading / shown with counts, outward acts verbatim, deletes, promotions, writes, renames, near-duplicates, token / moved (stale preview replaced) / the failure verbatim |

Pure modules beside them, in `src/board/`: `gate.ts` (the gate kernel moved from v1
`app/foundry/gate/useGate.ts`, with a history mode), `useGate.ts` (its React binding),
`undo.ts` (v1 `lib/board/undo.ts`), `port.ts` (the BoardPort contract and `Presentation`),
`boardGate.ts` (the GatePort over a BoardPort), `cull.ts` (cells, rows, ↑/↓, tally, undecided,
reason keys), `pair.ts` (current pair, arm looks, agreement), `commit.ts` (the commit flow as a
machine, directives).

Where this port moved from the prototype:
- A reject may carry several reasons, from its source's own list (decision 4); the tile draws
  each as a chip where the prototype drew one. A reason key on a standing reject toggles.
- Approve and Reject on a review, and every commit, show the consequence before anything is
  written (decision 6); the prototype committed on the key and flew thumbnails afterwards.
- Spawn MV (audio M) is not drawn: the BoardPort has no spawn verb until Phase 4's projects.
- The cut desk drops the prototype's slot proposal, channel toggles and StepTrack (the per-step
  sign-off moves to Phase 4, decision 9).
- Moved a pixel: the scrim and the lens are `--ink` at .62 / .94 (the prototype wrote 4,5,9 and
  5,6,10); a tile's cursor shadow is `0 10px 24px` on `--shadow` (it wrote a 30px blur at .6);
  a kept badge's mark is `--ink` (it wrote `#062a1d`); the rail's scroll room is 24px (30px);
  the review side's ground is `--panel-ground` (.14 where it wrote .15) and its scroll room
  60px (40px); the article page's side inset is 28px (30px).

## Library parts (Phase 5, L50)

| Kit name | Replaces (prototype) | Pages | States / variants |
| --- | --- | --- | --- |
| `Rail`, `FacetGroup` | library.js `renderNav`, `groupHTML`; `.nsec`, `.kind`, `.fg`, `.frows`, `.more` | L | Kind with live counts (zero dimmed, current lit); vocabulary · kind; Attention only while it counts; State (state dots via FacetRow `lead`); Collections; Origin; 7 rows then +N more (only when it hides more than two), fewer; a pressed value kept at 0 |
| `LibraryTile`, `TileGrid`, `TileSlot` | library.js `make` (grid), `.tile`, `.th`, `.kg`, `.refmark`, `.lk`, `.sd`, `.cap` | L | faces below; selected; REF on a reference image; lock on a ratified style; state dot per state; attention chip; S/M/L; a slot for a row not fetched yet |
| `LibraryRow`, `LibraryColumns`, `ColumnsHead`, `RowList` | library.js `make` (list), `.lrow`, `.lcols` | L | thumb, name (+ attention), kind, three facets, state, date, source; >1360 / >1100 / phone columns; S/M/L |
| `FaceView` | library.js `face`, `vface`; `.wv`, `.paper`, `.swatch`, `.vf` | L | image, poster, wave, paper, swatch, designed face; row / tile / preview sizes; palette as data |
| `LibraryGlyph` (+ `KINDS`) | shell.js `I.ref|image|style|motion|doc|play|pause` | L | one mark per kind; the kinds' order and words from `@gt/domain/library` KIND_LABELS; play/pause for the Cull's VideoBar |
| `DetailPanel`, `DetailSection`, `DetailTitle`, `DetailChips`, `DetailFacets`, `DetailPreview` | library.js `detHead`, `body`, `preview`; `.det`, `.dbody`, `.pv`, `.dtitle`, `.did`, `.dchips`, `.det h4`, `.fdl` | L | head with kind, i / N, prev / next, close `]`; facets as pressed chips that filter; a clip loops muted, an export plays |
| `Lineage` | library.js `lineage`, `node`; `.lin`, `.lnode`, `button.lk` | L | one line per role; item door (thumb or kind mark), facet door (+ ledger link for a run), text, ghost for a parent that is gone; THIS lit |
| `SetSummary` | library.js `summary`; `.sumh`, `.stbar`, `.stl`, `.kbar`, `.recent`, `.keys-d` | L | count of N; state bar and state doors; kind bars on All; newest pictures; the library keymap |

Pure module beside them: `library/library.ts` (`SIZES` from the tokens, `tileBox`, `layoutFor` for the
one window, `orderValues`, `foldValues`, `blocksFor` + `BLOCK`, `stepTo`, `backStep`).

Where this port moved from the prototype:
- No corpus toggle (real · real + scaled): a stored item is never illustrative (@gt/domain/libraryItem),
  so the fixture library is 5,000 `fixture` items, a tenth `derived`, and Origin carries the two
  record fields (`origin` the mill, `source` real · fixture · derived).
- No play button on an audio tile or row (a control inside an option); the detail's AudioPreview plays.
- No browser-side media probe and no `markBad`: attention is a media fact from the index.
- Moved a pixel: a tile's meta and the "+N more" are `--muted` (the prototype's `--faint` reads
  under 4.5:1 on `--ink-2`); the detail head's left inset 12px as the panel head's; the lineage
  thumbnail 30 x 18.75 (16:10) where it wrote 30 x 19; the kind bar's columns are multiples of
  `--sp-7` (22 · 1fr · 44 · 70 became 22 · 1fr · 44.4 · 69.6).

## Audio desk (Phase 6, lot 60)

| Kit name | Replaces (v1) | Pages | States / variants |
| --- | --- | --- | --- |
| `ArrangeBoard`, `TakeCard`, `RowHead`/`RowFoot`, `LabelPrompt`, `RoundTrip`, `EngineList` (+ `arrange.ts`, `arrangeGroups.ts`) | app/playground/arrange/*, engines.ts | /audio | card provisional/pending, vN versions open, finalized label; cell lit on drag; withheld op with reason |
| `StrengthTable`/`StrengthHead`, `RubricCard`, `BriefDelta`, `BatchForm` (+ `strengths.ts`, `rubric.ts`, `brief.ts`, `batch.ts`) | app/playground/triage/{Strengths,Judge,Batch}.tsx, shared/Rubric.tsx | /audio, Board audio tile | cell measured/waiting/empty, heat ±2; dim scored/unscored/busy, proven; axis held/missed/octave/unmeasured; batch music/sfx, problem badge |
| `HuntShelf`/`HuntIdea`, `HuntMap`, `HuntRenderBar`, `HuntAudition`, `LessonForm`, `LessonList` (+ `hunt.ts`, `lesson.ts`) | app/playground/hunt/*, hunt/Lesson.tsx | /audio | idea / drafting / map; leaf idle-selected-rendering-rendered-crowned; render bar priced in audio-seconds; audition side by side; lesson draft / hand / signed, refused without "because" or under three takes |

## Model (spark game-3d-assets WP3)

| Kit name | Replaces (v1) | Pages | States / variants |
| --- | --- | --- | --- |
| `ModelViewer` (+ `ModelStage`, its lazy three + @react-three/fiber chunk) | none (PoF's r3f viewer is the reference; no prototype) | Library detail, Board zoom | loading (poster under a loading chip), ready (orbit, wireframe, bones over a rigged model, tris and bones from the scene), failed (the loader's sentence verbatim), no WebGL; pane 16:10 or `fill` (the lens) |

## Load (spark night-load-band)

| Kit name | Replaces (prototype) | Pages | States / variants |
| --- | --- | --- | --- |
| `LoadBand` (+ `load/band.ts`) | none (prototype source: none - spark night-load-band; v1's `BandTrack` was never built) | F (a /scout night's desk, open and committed), /kit | per resource (cpu, ram, gpu) a meter: average in band (emerald) / under (amber, the box idled) / over (rose, the night queued itself), p95 tick, `avg 64 · p95 81 · 72% in band`; unread (hatched track, `unread`, no marks, spoken `gpu unread`); the night strip, a bar per 5 min coloured by its own slot's look, a read slot never under a hairline, a slot with no reading a gap (nothing drawn); `commit 88 of 102 GB peak` (no limit: `commit 88 GB peak`; no peak: absent); `waited: memory 41 min · comfy queue 12 min`, longest first (none: absent); no `load`: nothing drawn |

Mounted through `DeskFrame`'s `load` prop (the summary, not a slot): `MatrixCull` passes `present.load`, the
Board's `DecidedDesk` its packet's `present.load`. The three cells sit side by side on a wide desk and wrap as it
narrows (a cell is at least `--w-detail`).

## Scout graph (spark scout-decision-graph WP-S2)

| Kit name | Replaces (prototype) | Pages | States / variants |
| --- | --- | --- | --- |
| `StageGraph` (+ `StageHead`, `GraphNodeButton`, `graph/stageGraph.ts`) | none (prototype source: none; the geometry is the day-line's shared-anchor rule, `runs/dayline.ts`) | /scout, /kit | five columns by `GRAPH_STAGES` (seed · derived · idea · run · output); a node per decision as a button, its mark the verdict's Look (`GRAPH_LOOK`: kept done, open awaiting, pending running, rejected and failed failed); dead (rejected, failed) in the faint role - faint words, dashed edge, never opacity; paused (the paused bars, dotted edge and links); selected (cyan, its links lit); `all` / `live` (the dead and their links hidden, each column head `+N`); links as cubic beziers from the node boxes, a loop for a link inside one column |
| `ShareMeter` | none | /scout, /kit | a group's share of the runs (fill) against the split's target (tick): under, at, over (amber fill), no split set (no tick); one image named `kids: took 29% of runs, split 50%` |

Pure module beside them: `graph/stageGraph.ts` (`GEOMETRY` from the tokens, `layout` - columns ordered by
the barycentre of what each node grows from -, `nodeBox`, `linkPath`, `visibleOf`, `spokenNode`, `spokenGraph`).

Not a StackBar: StackBar's segments are kept / rejected / undecided and speak those words; a share against a
target is one quantity and a mark (ShareMeter's header says why). The graph is not windowed: /scout draws only
unfolded bands, and the 10x fixture measure (WP-S2 report) decides whether a column needs `window/useWindow`.
