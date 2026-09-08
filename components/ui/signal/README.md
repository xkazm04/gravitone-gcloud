# The signal vocabulary

> Delete every sentence whose subject is the app. Keep every sentence whose subject is the work.
> "This tab shows…", "read across a row to…", "a cue is a span of film…", "kept so that…" — the app talking about itself. It goes.
> A beat, a claim, a cut reason, a gate detail, a price, a vendor, a real error — the work. It stays, verbatim.

That is THE LAW. Everything in this directory exists to give the deleted sentence
somewhere better to go — or, more often, to make it obvious that it needed
nowhere at all.

## Why a directory rather than a copy pass

Five independent route audits of this app found roughly 170 places where a
component is accompanied by a sentence explaining what the component already
shows. All five audits then proposed the SAME handful of replacement shapes — a
disclosure glyph, a count chip, a row of pips, a proportional rail, a drawn
pipeline. None of those shapes existed in the design system, which is why the
sentence kept being the answer: **prose was the only primitive available.**

Two of these components are containers, and they matter most. A container with a
slot for a paragraph is a container that will be handed a paragraph — every time,
by everyone. `Deck`'s `sub` and the four hand-rolled tab bars' `blurb` fields are
not places narration happened to land; they are the reason it was written.

## The twelve-word rule

`<Hint>` is the most useful and the most dangerous thing here. Moving a
sixty-word explanation behind a glyph **hides** narration; it does not delete it,
and the next reader inherits the same paragraph one click further away.

> If a disclosure runs past roughly **twelve words**, it is almost certainly
> still the app narrating itself. Delete it instead.

What survives that test is a constraint, a limit, a number, a vendor rule, a
machine error — the work. `<Keycaps>` is the one deliberate exemption, and for a
stated reason: a keymap is a table, not prose. Every row is a key and a verb,
there is nothing in it to delete, and its length is a function of how many keys
the surface binds.

## The eleven

### `<Hint>` — a real disclosure, not `title=`

Native `title` waits about a second, does not exist on touch, cannot be styled,
is exposed inconsistently by screen readers, and — worst — is unbounded, so it
invites keeping the paragraph. Opens on hover, focus and tap; closes on Escape,
blur and outside pointer-down; `role="tooltip"` wired by `aria-describedby`, and
the content stays in the DOM `sr-only` when closed so a screen reader hears it on
focus without having to discover there is something to open.

```tsx
<Hint>a bar is 4 beats at the cue's tempo</Hint>
<Hint variant="lock" tone="amber">locked sheets take no new proofs</Hint>
```

Replaces, among others:

| where | what is there now |
| --- | --- |
| `app/foundry/ExtractView.tsx:609` | a three-sentence `title=` on a checkbox |
| `app/_phases/score/ScoreSpotting.tsx:77-81` | `NO_TEMPO_WHY` — four sentences, written once because it is used as a tooltip three times |
| `app/_phases/script/_matrix/shared.tsx:143-147` | a three-sentence methodology footnote printed under three tabs |

`useHint` / `<HintPopover>` are exported for the one case a glyph cannot serve:
`<TabRail>` hangs the same disclosure on the tab itself, because a button inside
a `role="tab"` button is invalid HTML.

### `<Tally>` — a count or a ratio, as a chip

```tsx
<Tally value={12} of={36} label="kept" tone="emerald" />   // KEPT 12/36
```

Replaces `app/library/LibraryView.tsx:26-29` ("Visual identities. A locked one is
required before any project." — a rule the tab cannot enforce, where the reader
wants `2/5`), `app/_phases/script/ScriptStep.tsx:74-79` (four captions restating
numbers the tabs already hold), and
`app/_phases/research/ResearchTriageBoard.tsx:62-67` (a paragraph whose own
comment records that the count was wrong for as long as it was prose).

The numerals are `aria-hidden` with a spoken equivalent beside them — `12/36`
announces as "twelve slash thirty six" otherwise. `CHIP_CLASS` is the one chip
spelling; `StaleBadge` and `Provenance` read it rather than re-deriving it.

### `<PipRow>` — discrete state, drawn

```tsx
<PipRow states={["filled", "filled", "hollow"]} max={5} label="2 of 5 approved" />
```

Replaces `app/library/parts.tsx:265-268` (two sentences to say a reference-image
window is full — five filled pips say it on sight),
`app/_phases/research/beats/BeatVariantBoard.tsx:70-76` (a spine-status sentence
that is one pip per slot), and `app/playground/PlaygroundView.tsx:544-546` ("an
edit that touches nothing is a copy" — four section pips say it).

Every pip is `aria-hidden`; the row is one image with one name.

### `<StackBar>` — proportional parts of a whole

```tsx
<StackBar segments={[
  { n: 12, tone: "emerald", label: "kept" },
  { n: 5,  tone: "rose",    label: "rejected" },
  { n: 3,  tone: "rose",    label: "undecided", hatched: true },
]} />
```

Replaces the same commit-dialog paragraph written three times —
`app/foundry/FoundryView.tsx:178-183`, `app/foundry/ExtractView.tsx:419`,
`app/foundry/DojoView.tsx:357` — each explaining in prose that an undecided tile
commits as a rejection. `hatched` draws that: same tone as the segment beside it,
striped, because it is not a fourth outcome. The rail is `aria-hidden` and a real
list of `label — n` sits beside it, visible or `sr-only` per `showCounts`.

### `<BandTrack>` — a value inside a measured window

```tsx
<BandTrack value={targetS} min={15} max={600} band={[90, 150]} unit="s" />
```

Replaces `app/_projects/wizard/stages.tsx:226-234` (three branches of
runtime-hint prose — below, above, inside — where the branch IS the picture) and
`app/_phases/script/_parts/Meters.tsx:85-86` (`belowNote` / `aboveNote`, printed
beside a meter that already draws the band).

Read-only by construction: no focus, no input, `role="img"`. `hatchBand` marks a
window that came from a craft note with an n=0 corpus, so a stand-in never reads
as a measurement.

### `<Ghost>` — an empty state shaped like the thing that will fill it

```tsx
<Ghost shape="card" count={3} label="no projects yet"
       action={<Button onClick={onCreate}>New project</Button>} />
```

Replaces `app/_projects/parts.tsx:159-163` ("No projects yet." plus a paragraph
defining what a project is, on the one screen where the reader already knows),
`app/library/AssetsBrowser.tsx:812-816`,
`app/_phases/script/trailer/PromiseLedger.tsx:46-48`,
`app/_phases/script/trailer/MovementSection.tsx:70-72`.

The outline is 40% opacity and `aria-hidden`; `label` is `sr-only`, because a
dashed border says nothing to a screen reader. The action renders at full
strength — fading the one thing the user can press would draw the fix as if it
were also absent.

### `<UpstreamBreak>` — blocked because an earlier step produced nothing

The highest-value component here. Four surfaces each write 40–60 words
re-teaching the same five-node pipeline, each slightly differently:
`app/_phases/score/ScoreSpotting.tsx:211-215` and `:549-558`,
`app/_phases/frames/ShotSheet.tsx:134-147`,
`app/_phases/script/ScriptStep.tsx:237-242`.

```tsx
<UpstreamBreak
  blockedAt="frames" current="score" done={["research", "script"]}
  action={{ label: "Open Frames", href: `/studio/${id}?step=frames` }}
/>
```

The order is read from `lib/projects.ts` `PHASES` — never a second copy. Filled
dot = the artifact exists; hollow pulsing cyan ring = the missing one; a solid
block = where the user is standing. The rail is cyan up to the break and hairline
after it. Under the missing node: its name, one verb of at most four words, and a
real navigation control. `severity="error"` swaps the ring for a triangle and
renders `detail` **verbatim** — `kind · op · message` is the work.

Severity follows `app/_phases/_shared/ui/Notice.tsx` and must not contradict it:
`error` is rose and `role="alert"`; `info` is cyan and `role="status"`. A
blocked-by-upstream is normally `info` — a limit you should know about, not a
thing that broke.

### `<Keycaps>` — a keymap behind a disclosure

```tsx
<Keycaps map={[{ keys: ["←", "→"], does: "move" }, { keys: ["K"], does: "keep" }]} />
```

Replaces `app/library/AssetsBrowser.tsx:478-481` (a permanent four-clause keymap
line), `app/foundry/FoundryView.tsx` ("arrows move · K keep · X reject · U clear ·
Enter compare"), `app/library/AssetLightbox.tsx:93-95`. At rest it is one glyph.

### `<StaleBadge>` — "this number was measured against something else"

```tsx
<StaleBadge words="not re-run" why="the checks were typed against the original chain" />
```

Replaces the same two-sentence disclaimer six times across three columns —
`app/_phases/script/_parts/HypothesisColumn.tsx:102-107` and `:127-135`,
`app/_phases/script/_parts/ConstraintLedger.tsx:44-49`. Amber, never rose: an
unmeasured figure is a limit, not a failure.

### `<Provenance>` — who made this, in which run, with what

```tsx
<Provenance model="gpt-image-2" run={runId} step={stepId} vendor="openai" cost="$0.04" />
```

Replaces `app/_studio/assetParts.tsx:106-114` ("Made by X in run R, step S." —
three facts wearing an English sentence, two of them already styled mono because
the sentence could not carry them), the `ScoreSpotting` credit line, and
`app/library/parts.tsx` provenance. Values are verbatim: a model id or a price is
what somebody pastes into a search box or an invoice.

### `<TabRail>` — the tab bar with no slot for a paragraph

```tsx
<TabRail
  label="library modules"
  active={module} onSelect={setModule}
  tabs={[
    { id: "styles", label: "Styles", tally: { value: 2, of: 5, tone: "cyan" } },
    { id: "animations", label: "Animations", disabled: true, disabledReason: "no engine yet" },
  ]}
/>
```

Four surfaces hand-roll this row and all four pair it with a blurb slot, so all
four fill it: `app/library/LibraryView.tsx:26-29,74`,
`app/foundry/FoundryView.tsx:47-60` (up to 45 words per tab),
`app/_phases/script/ScriptStep.tsx:74-79`,
`app/_phases/frames/FramesStep.tsx:24-29`.

There is no `blurb`, no `sub` and no `description` prop, and that absence is the
component. What the blurb reached for rides on the tab instead — the state as a
`<Tally>`, and a locked tab's reason behind a `<Hint>` hung on the tab itself.

Semantics: `role="tablist"` / `role="tab"` / `aria-selected`, roving tabindex,
arrow keys and Home/End, **manual** activation (arrows move focus; Enter/Space
selects). A locked tab is `aria-disabled`, never `disabled` — a `disabled` button
leaves the tab order, which would put the explanation of the lock behind a mouse.

## House rules these obey

- **No colour literal.** Tailwind utilities only; `components/ui/tokens.ts` is
  the only file that may declare a chrome colour, and
  `tests/golden-path/chrome-colour-literals.probe.spec.ts` rechecks it. The two
  hatch patterns here paint from `currentColor` for exactly this reason.
- **Nothing below `text-label`** (1rem). `npm run check:type` fails the build
  otherwise. If something feels like it needs smaller text, it belongs behind a
  `<Hint>` — or it belongs deleted.
- **Keyboard and screen reader, always.** The prose being replaced was at least
  readable by everyone; a glyph only a mouse can reach is a regression, not a
  fix. Every drawn state here has a spoken equivalent.
- **No JS-driven animation.** The one moving thing is `animate-pulse`, a CSS
  animation, which the blanket `prefers-reduced-motion` rule at the foot of
  `app/globals.css` switches off for free. Anything that moves from JS must
  guard itself — see `components/ui/deck/motionGuard.ts`.
