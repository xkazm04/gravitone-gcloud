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
| `SourceTag` | `.src.*`, GT.Src | P L G | real, illustrative, model, fixture, derived, session |
| `LedgerLink` | `.ledger-link`, GT.LedgerLink | F P L | one |
| `ErrorLine` | `.err` (+ I.warn) | F P L G | static / live (role=alert) |
| `ChannelBadge` | `.chan.*` | F P L | youtube, tiktok, instagram |
| `Button` | `.btn`, `.btn.{tone}`, `.btn.sm`, `kbd.keycap` inside | F P L G | tone x size; glyph; badge chip; shortcut from keymap; aria-disabled |
| `Toggle` | `.toggle[aria-pressed]` | F P L G | on/off |
| `Seg` | `.seg button[aria-pressed]` | F P L G | one of n |
| `Field`, `Select`, `Search` | `.field`, `select.field`, `.search` | P L G | keyfield; search caps from the mode's `search` verb |
| `CapsHeading` | `.side-h`, `.h4` / `.detail h4` | F P L G | side / section; level; tally |
| `Panel` | `.panel`, `.panel-head`, `.panel-body`, `.toolbar` | P L G | title + tally; toolbar |
| `Empty` | `.empty` | F L G | label (<= 12 words by type); one act |
| `Ghost` | `.ghost-card` | F P | count; spoken label |
| `Toast` | `.toast`, GT.toast/announce | F P L G | open/closed; always-mounted polite region |
| `Crumbs` | `[data-component=Crumbs]` | F P L | link/button steps; current place |
| `Facts` | `.obs` (dl) | F L | term/value rows |
| `Wave` | GT.Wave | F P L | tone; playhead; empty midline |
| `FacetRow` | library `.frow`, ledger `.fr` | L G | mark check (L) / rail (G) + share bar |
| `Glyph` | shell.js `I.{ledger,search,warn,down}` | all | only the glyphs a primitive draws |

Built for the signal vocabulary although on one page: `Fold` (library `.fgh`), `TabRail`
(projects `.tabrail`), `UpstreamBreak` (floor slot detail), `Provenance` (floor style detail).

Layout-only classes are not components: `.kv` (a wrapping row; Provenance carries its gap),
`.route`, `.detail`, `.detail-grid`, `.ell`, `.mono`, `.sr-only` (-> `a11y/SrOnly`).

## v1 signal vocabulary (`components/ui/signal/*`) -> the new kit

| v1 | Prototype counterpart | New kit |
| --- | --- | --- |
| Hint (+ useHint, HintPopover) | `.hint` | `Hint`; Escape/outside dismissal not kept (see Hint.tsx) |
| Tally (+ CHIP_CLASS, TALLY_TONE) | `.tally` (stamp) and `.chip` (tag) | `Tally` + `Chip`; tone/zero/door move to Chip |
| PipRow | `.piprow` | `PipRow` over Looks; label required |
| TabRail | projects `.tabrail` | `TabRail` as nav + aria-current; no blurb |
| Fold | library facet group head `.fgh` | `Fold` (controlled) |
| StackBar | `.stackbar` (k/x/u) | `StackBar` (fixed kept/rejected/undecided; v1's free segments dropped) |
| BandTrack | no prototype counterpart | not built |
| Ghost | `.ghost-card` | `Ghost` |
| UpstreamBreak | floor `UpstreamBreak` | `UpstreamBreak` (error form only) |
| Keycaps (+ keymap.ts) | `.keymap` (drawn open) | `Keycaps` from `keyTable`; keymap lives in `src/keymap` |
| StaleBadge | ledger `.apx` (the "≈ derived time" mark) - a glyph, not a badge | not built; the `.apx` mark is ledger-only (wave 3) |
| Provenance | floor `[data-component=Provenance]` | `Provenance` |
| useCountFilter | none (route logic) | not a component |

## Page compositions - wave 3+ (not this lot)

Floor: StudioHeader (+ next-btn, nav, brand mark, reset chip), Lane, FoundryCell, IdeaComposer,
Estimate, RunRow (+ stagepips, run-bar shimmer), RunTrack, WeirCell, Pile, ShelfCell,
ShelfStyle, CalendarColumn, SlotRow, MonthCalendar (mday/mslot), LevelSheet + scrim + grab,
flyer, `.ledger-t` table. Board: BoardDesk, PacketRail, MatrixCull + CullTile, BlindPair,
PacketReview, ArticlePage, EditNote, CutReview, OracleStrip, StepTrack, commit/wait/refuse.
Projects: CompositionList (`.prow`), PlanBreakdown, RunsDayline (bars, dep links, lane
chips), IdeaSlotRibbon (`.rnode`), re-route `.alt`, resource summary `.res`, launch-plan.
Library: LibraryNav (`.kind`), FacetGroup body, LibraryToolbar (`.fchips`), LibraryResults
(virtual grid/list), LibraryDetail. Ledger: TimeStrip, facet sections, event rows `.ev`,
JSONL view, facet drawer. Kit page itself (`/kit`, wave 3).

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
