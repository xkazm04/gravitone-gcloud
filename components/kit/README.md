# The kit

The Almanac world's working parts (`data-world="almanac"`, tokens `--al-*` in `components/ui/tokens.ts`).
Import from `@/components/kit`; one import site is what stops a second spelling.

> **A local duplicate of a kit part is a finding.** If a surface needs a shape the kit lacks, add it here, once, and say so.
> The law in `components/ui/signal/README.md` applies unchanged: no slot for a paragraph, state rides on marks and tallies.

## How the world reaches a part

`<WorldRoot>` (or `<StudioFrame world="almanac">`, which mounts one) declares `data-world` and provides the world through
context (`components/ui/world.tsx`). The shared parts `Button`, `Tally`, `TabRail`, `StackBar`, `Hint` and the portalled `Modal`
read it, so they wear the Almanac skin from the imports a surface already uses. Outside a `WorldRoot` nothing changes.

Styles are `kit.css` (`k-*` classes): colours only via `var(--al-*)` / `color-mix`, nothing under `text-label` (1rem).
Type: no italics (the display voice is upright Instrument Serif), text is `--al-white` or `--al-vellum` and nothing else (both 11:1 or better; `--al-ash` is for rings and rules, never text), a hue used as text is its lightened `-t` spelling, and state is a dashed edge or a rule, never a dimmer colour. `/kit` Identity measures all of it.

## Parts

| Part | For | API |
|---|---|---|
| `WorldRoot` `Sky` | the root, the starfield | `<WorldRoot>` |
| `Bar` `Crumbs` | top bar; the path | `<Bar brand crumbs nav right/>`, `<Crumbs items={[{label, href? \| onSelect?}]}/>` |
| `PageHead` `Tag` `Kicker` | page title, figure slot; boxed word; gold caps line | `<PageHead eyebrow title figure caption/>` |
| `TabRail` `Tally` `StackBar` | modules with counts, proportions (signal, extended) | `tabs=[{id,label,tally,testId}]` |
| `StatusGlyph` `StatusPill` | one mark per state (live, ready, inc, failed, committed, gate, keep, reject, undecided, queued, lock) | `<StatusGlyph kind label? decorative?/>` |
| `StatusStrip` `Meridian` | a run's state, facts, error, log, progress | `<StatusStrip kind word progress facts error log actions/>` |
| `Magnitude` `gradeOf` `ScoreChip` `FlagChip` `pct` `Credit` | a score as a star; grader credit marks | `<ScoreChip label value/>`, `<Credit value>field</Credit>` |
| `Chip` `Chips` `Plate` | a labelled fact; image with registration corners | `<Chip name tone?>value</Chip>` |
| `Tile` `VerdictKeys` | a judged candidate; K / X / U | `<Tile label src verdict focused state chips actions/>`, `<VerdictKeys variant="tile\|row\|card" value onVerdict/>` |
| `Scene` `Matrix` `RowHead` | pinned source frame + styles-by-mechanisms grid | `<Matrix label columns rows/>` |
| `SideList` `SideItem` | runs, cycles, families | `<SideItem glyph title meta current onSelect/>` |
| `Entry` `VerdictMark` `Column` | a work row judged as a whole | `<Entry label focused verdict title lede aside/>` |
| `Card` `CardGrid` `Thumb` `Figures` | media card; opening thumbnail; captioned strip | |
| `Duo` | seed-matched A/B pair, pick marked | `<Duo scene seed arms judge dissent/>` |
| `Dock` `Count` `SaveState` `KeyRow` `LockNote` `Final` `DockAction` | the bottom bar | |
| `ConfirmDialog` `Sheet` | destructive confirm: rail + consequence + real error; full-screen comparison | `rail`, `consequence`, `confirmLabel`, `tone`; `<Sheet open title onPrev onNext footer/>` |
| `Report` `OpenLink` | the bar after a commit | |
| `Doc` `DocLede` `DocSection` `Rule` `DefList` `Stats` `DataTable` `Verbatim` `Prose` | what is read rather than judged | |
| `ErrorBox` `Loading` `Command` `Ghost` `Hint` | unreachable, loading, empty; a disclosure | `<ErrorBox role="alert">` |
| `Dropzone` `TextField` `NumberField` `CheckField` `FieldRow` `PanelBox` | forms | |
| `Field` `TextInput` `TextArea` `NumberInput` `Select` `Segmented` | `components/ui/Field.tsx`, which reads the world: a caps label over a ruled control; choice-of-few as pills | `<Field label htmlFor hint?>`, `<Segmented label value options onChange/>` |
| `Callout` | a claim with its source, ruled, upright serif; tone is the claim's standing | `<Callout source? tone="gold\|ald\|ant" size? dashed?>` |
| `useToast` `ToastTray` | the outcome of an action for a moment; a failure stays until dismissed; the bell keeps the record | `const { toasts, push, dismiss } = useToast()` |
| `Table` | rows that are worked: sortable heads (`aria-sort`, a gold rule and caret on the sorted one), a head that sticks when `maxHeight` is set; `DataTable` stays for a fixed reading | `<Table label columns=[{id,head,cell,sortBy?,num?}] rows defaultSort? maxHeight? onOpenRow?/>` |
| `Pager` `useWindow` | a list that windows itself; a meridian inked to the share shown, "48 of 212", `+N` and `all` | `const w = useWindow(items, {size})`, `<Pager shown total onMore onAll auto?/>` |
| `Steps` `STUDIO_STEPS` | Research, Script, Frames, Score, Cut as stars on a meridian; the current one ringed, the state in the star's shape | `<Steps label steps=[{id,label,state?,tally?,locked?}] current onSelect/>` |
| `useRoving` | one tab stop per grid, arrows move within it; `Tile` takes `rovingProps` | `const r = useRoving({count}); <Tile rovingProps={r.itemProps(i)}/>` |
| `NotificationBell` `UserMenu` | the shell's account controls; they read the world, so inside `<Bar right>` they wear the Almanac skin | `<Bar right={<><NotificationBell/><UserMenu/></>}/>` |
| `Button` (extended) | `primary` gold, `ghost` ruled, `danger`, `keep`, `reject`; `size="sm"` | |
| `Deck` `DeckStage` `DeckCard` `StageRail` | the wizard as a card table (the shared deck, read in the world) | `<Deck stages active onNavigate finishLabel onFinish/>`, `<DeckCard spec picked onPick/>` |
| `ContextMenu` `FolderTree` | a right-click menu over a row; a tree of named places with totals | `<ContextMenu label x y items onClose/>`, `<FolderTree label nodes selected expanded onSelect onToggle/>` |
| `LayerList` | layers, top-down, drag or arrow to reorder | `<LayerList label heading layers selectedId onSelect onReorder onToggleHidden onRemove/>` |
| `Transport` `Waveform` `Player` `clock` | play marks, a magnitude wave you seek on, both; controlled, no `<audio>` inside | `<Player label kind peaks marks? playing position duration onToggle onSeek/>` |
| `Timeline` | tracks against one ruler, cues as marks, drift drawn with both ends | `<Timeline label duration tracks cues? playhead? onSelect?/>` |
| `Mark` `Wordmark` `ASTERISM_PATH` `ASTERISM_STARS` | the G asterism, the wordmark (`components/kit/brand`) | `<Mark size construction? title?/>`, `<Wordmark height/>` |

`/kit` renders every row above in each of its states from `app/kit/catalog.ts`, and
`tests/golden-path/kit-catalog.probe.spec.ts` fails when an export, the catalog and this table disagree.
The migration map (which module needs which part, and which parts do not exist yet) is `app/kit/migrationMap.ts`.

## When to use which

- A list of things with a state: `SideList` + `StatusGlyph`. Never a column of status words.
- A judgement on a picture: `Tile` (grid) or `Entry` (a row that is judged whole). A verdict shows in the border, not in prose.
- An irreversible action: `ConfirmDialog`, with the rail carrying the arithmetic. A failed action stays in the dialog as an `ErrorBox`.
- Heavy content: a `Sheet`, not a bigger modal.
- An empty list: `Ghost`; an unreachable one: `ErrorBox` with a retry.
