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
Type: no italics (the display voice is upright Instrument Serif), text is `--al-white` or `--al-vellum` and nothing else (both 11:1 or better; `--al-ash` is for rings and rules, never text), a hue used as text is its lightened `-t` spelling, and state is a dashed edge or a rule, never a dimmer colour.

## Parts

| Part | For | API |
|---|---|---|
| `WorldRoot` `Sky` | the root, the starfield | `<WorldRoot>` |
| `Bar` `Crumbs` | top bar; the path | `<Bar brand crumbs nav right/>`, `<Crumbs items={[{label, href? \| onSelect?}]}/>` |
| `TabRail` `Tally` `StackBar` | modules with counts, proportions (signal, extended) | `tabs=[{id,label,tally,testId}]` |
| `StatusGlyph` | one mark per state (live, ready, inc, failed, committed, gate, keep, reject, undecided, queued, lock) | `<StatusGlyph kind label? decorative?/>` |
| `ConfirmDialog` | destructive confirm: rail + consequence + real error | `rail`, `consequence`, `confirmLabel`, `tone` |
| `Ghost` `Hint` | empty; a disclosure | |
| `Dropzone` | a file drop | |
| `Field` `TextInput` `TextArea` `NumberInput` `Select` `Segmented` | `components/ui/Field.tsx`, which reads the world: a caps label over a ruled control; choice-of-few as pills | `<Field label htmlFor hint?>`, `<Segmented label value options onChange/>` |
| `useToast` `ToastTray` | the outcome of an action for a moment; a failure stays until dismissed; the bell keeps the record | `const { toasts, push, dismiss } = useToast()` |
| `Pager` `useWindow` | a list that windows itself; a meridian inked to the share shown, "48 of 212", `+N` and `all` | `const w = useWindow(items, {size, key?})` (a new `key` resets), `<Pager shown total onMore onAll auto?/>`; outside a world it draws a `Tally` and ghost `Button`s |
| `useRoving` | one tab stop per grid, arrows move within it | `const r = useRoving({count}); <div {...r.itemProps(i)}/>` |
| `NotificationBell` `UserMenu` | the shell's account controls; they read the world, so inside `<Bar right>` they wear the Almanac skin | `<Bar right={<><NotificationBell/><UserMenu/></>}/>` |
| `Button` (extended) | `primary` gold, `ghost` ruled, `danger`, `keep`, `reject`; `size="sm"` | |
| `Deck` `DeckStage` `DeckCard` `StageRail` | the wizard as a card table (the shared deck, read in the world) | `<Deck stages active onNavigate finishLabel onFinish/>`, `<DeckCard spec picked onPick/>` |
| `Transport` `Waveform` `Player` `clock` | play marks, a magnitude wave you seek on, both; controlled, no `<audio>` inside | `<Player label kind peaks marks? playing position duration onToggle onSeek/>` |
| `PipRow` `BandTrack` `UpstreamBreak` `Keycaps` `StaleBadge` `Provenance` `Fold` `useCountFilter` `defineKeymap` `useKeymap` `resolveKey` `keycapsRows` `activeKeymaps` `useHint` `HintPopover` `hintRootClass` `CHIP_CLASS` `TALLY_TONE` | the rest of the signal vocabulary (`components/ui/signal`, imported from there): slots as pips, a value in its band, the step upstream that is missing, a keymap, a measurement that is stale, where a thing came from, a section opened on demand; one keymap (`defineKeymap`) bound with the kernel guard by `useKeymap` and drawn by `Keycaps` from the same object, with `resolveKey` the pure press-to-action read, `keycapsRows` the rows it draws and `activeKeymaps` the live ids; one count-filter selection held in the URL (`?only=`) for a `Tally select` or `StackBar onSegment`; Hint's disclosure on a trigger of your own; the chip shape and tones a Tally draws | `<PipRow states max?/>`, `<BandTrack value min max band?/>`, `<UpstreamBreak blockedAt current done action?/>` |
| `Mark` `Wordmark` `ASTERISM_PATH` `ASTERISM_STARS` | the G asterism, the wordmark (`components/kit/brand`) | `<Mark size construction? title?/>`, `<Wordmark height/>` |

**Corrected 2026-10-15 (Phase 1 wave 3).** This page said `/kit` rendered every row above from
`app/kit/catalog.ts`, guarded by `kit-catalog.probe` and a census gate (`check:kit-census`). All of that
retired with v1's Almanac kit route, and so did 31 parts whose only renderer was that route (each a
zero-adopter in the census, re-measured over app/, components/, lib/, pipeline/ and tests/ before deletion).
The rows above are what a v1 route still imports. `/kit` is now the new design system (`packages/ui`,
`@gt/ui`); nothing here is drawn there. This world shrinks as each v1 surface is retired (plan §9).

## When to use which

- A list of things with a state: `StatusGlyph` per row. Never a column of status words.
- An irreversible action: `ConfirmDialog`, with the rail carrying the arithmetic. A failed action stays in the dialog.
- An empty list: `Ghost`.
