# The pipeline canvas

`/foundry` → **Pipeline**. One board, two media, four directions. A card's POSITION is its
state and moving it is the act — which is the question `/board` cannot ask, because to a
verdict surface a run at the gate and a run being drafted are both "undecided".

---

## 1. The tab

The fifth station on the foundry rail, beside Extract · Styles · Forge · Cull · Dojo. Nothing
retired: the four engines of the forge and the pipeline board coexist.

Its station carries **no figure and no picture tray**, and that is deliberate. Every other
station's numbers come from a list `usePlant` reads at mount; the pipeline's come from
`CanvasStatus`, which does not exist until the canvas has mounted inside the tab. A wrong
number on a tab rail is worse than no number.

| file | what it owns |
| --- | --- |
| `app/foundry/plant.tsx` | the `Tab` union and the rail |
| `app/foundry/FoundryView.tsx` | the mount |
| `app/foundry/PipelineTab.tsx` | the shell: top bar, stage strip, the board's height, the arm |
| `app/foundry/pipelineModals.tsx` | the dispatch confirm, the rework note, the detail (two mounts) |
| `app/foundry/pipeline/` | THE ENGINE — the board, the drag, the keyboard, two move dialogs |
| `app/foundry/pipeline/skins/` | the four directions |
| `lib/board/pipeline.ts` | the contract: stages, placement, `admits`, `move`, the load notes |
| `lib/board/sources/{articles,audio}.ts` | the two adapters |

---

## 2. Two layers, and the line between them

**The engine draws the board.** Columns, lanes, cards, the camera, drag-and-drop, the whole
keymap, the move map and the move prompt, and the one live region this surface announces
through. It takes a `PipelineSource`, an `axisId` and a `skin`, and it hands back a
`CanvasStatus`. It draws **no sentence about itself**.

**The shell draws everything around it, from that status.** Counts, totals, what is selected,
whether the board is still choreographing, what the load could not do — all as state, never as
prose. The shell owns the controls the canvas deliberately does not: which medium, which
grouping axis, which direction, and whether a move writes.

The canvas **fills its parent**, so the parent carries an explicit height. There is no
content-driven size here; a board that sizes to its cards has no viewport to pan.

A skin is a **stable module-level reference**, and so is a source. The canvas memoises on
identity (`PipelineCanvas`'s comparator reads `source`, `axisId`, `skin`, `pollMs`,
`choreoCap`, `className`), so a source rebuilt on every render defeats the engine entirely.
Callback props are deliberately *not* in that comparator — the shell may hand it fresh arrows.

---

## 3. The stage canon

Four columns, for every medium, forever. `CANON_STAGES` in `lib/board/pipeline.ts`.

| stage | what it means |
| --- | --- |
| `proposed` | a candidate nothing has been spent on yet |
| `working` | a machine is working; nobody is waiting on you |
| `gate` | waiting on your judgement |
| `done` | landed; leaves the board on its own |

`gate` is the only stage waiting on a **human**, and `working` the only one waiting on a
**machine**. Keeping those apart is why the canon has four columns and not three: a surface
that mixes "is happening" with "needs me" teaches its operator that most items need nothing,
and then the ones that do are missed. A skin is required to tell `gate` from `working` in
KIND — colour, weight, chrome — not merely by its place on the X axis.

Articles has eleven statuses and Audio has four; neither decides the geometry. Each adapter
maps its own machine onto the canon and declares **sub-bands** where it has detail worth
seeing — Articles draws four inside `working` (`rsrch · draft · crit · ck`), Audio draws four
inside `gate` (`triage · pending · remaster · edit`). The furniture stays still; the detail is
honest.

The Y axis is a **view choice**, not a write. The re-group `Select` offers
`source.groupAxes`, which is by contract only the axes the adapter knows are populated — an
axis that reads blank for most items is a worse board than no axis, because the operator
cannot tell "ungrouped" from "unwritten". Articles offers `bundle · status · model · effort`;
Audio offers `row · genre · provider · op · origin`. Re-grouping never writes, and a drag that
crosses a row carries the axis it was read under so an adapter can refuse a row it does not
own.

---

## 4. The four directions (`?v=`)

The direction lives in the URL, so a board can be linked and two directions can be compared
by flipping between them. Changing it changes the **skin only**: the canvas does not remount
and the data is not re-read.

Each direction renames the canon in its own idiom and draws its own world layer behind the
cards. Only the words and the drawing change — the four columns are the same four columns.

| `?v=` | name | its four words | the bet | what it loses |
| --- | --- | --- | --- | --- |
| `1` | **Dense ledger — round 1's winner** | `PROPOSED · RUNNING · GATE · SETTLED` | rules and type do all the work | first impression — nothing to admire |
| `2` | Spatial field | `PROPOSED · IN FLIGHT · NEEDS YOU · LANDED` | glass, depth and air; lanes implied by light | items per screen, and honesty at volume |
| `3` | Transit map | `ORIGIN · TRANSIT · HELD · TERMINUS` | items ride continuous lines; stages are stations | dense lanes — a station with 498 trains |
| `4` | Workbench | `STOCK · MACHINE · BENCH · FINISHED` | a docked inspector follows the selection; detail costs no modal | screen width — it spends space on chrome |

**Round 1 picked `?v=1`, and the card changed with the verdict.** A ledger card carried the
title and a figure, then vendor / state / dwell under a rule; the operator's reading was that
those four facts were costing the TITLE its readability. So the card is now the title alone
(at `text-content`, 2px up from the rest of the board) plus, for an audio item, a play button.
The four facts live in the detail, where `standing` was added because it was the one of them
the detail did not already carry. The card fell from 80px to 48px with them, which is most of
the vertical space round 1 said the Y axis was eating.

Those two sentences per direction are **declared once**, beside the skin itself in
`app/foundry/pipeline/skins/index.ts`, and the rail renders them as two disclosures. The table
above is a reading of that registry, not a second authority: when a direction's claim changes,
the rail changes with it and this table is what goes stale.

Variant 4 is the only structural bet. `Variant.inspector` is what says so, and it is the
reason `ItemDetail` is one component with two mounts (`DetailModal`, `DetailPane`): a
direction that bets on the *layout* has to be drawing the same *content*, or the comparison
is between two write-ups rather than two shapes. The pane is **not** a dialog — it traps
nothing and takes no `aria-modal` — which is why the board keeps its keyboard while the pane
is open (`overlayOpen` in `lib/board/keys.ts` reads `[aria-modal="true"]`).

---

## 5. The LIVE / STUB arm

**STUB is the default, and it survives a reload.** It is not a label.

In LIVE, a dispatch spends real money:

- **Articles** — `$47–92` and `26–32` turns on the operator's own Claude seat, measured over
  the runs of `2026-10` (`RUN_COST_HINT`, `lib/articles/types.ts`). The figure moves with the
  model and the critique roster, and the dialog says so in the authority's own words.
- **Audio** — ElevenLabs bills per call. The adapter's ceiling is seconds of audio per rolling
  window, refused with HTTP 402 before the vendor is reached; no dollar figure is measured.

`MoveRequest.live` is the flag that decides, and the contract is explicit that an unset `live`
never bills. **The arm is applied to the SOURCE, not to the controls**: `armSource` in
`PipelineTab.tsx` wraps `move()` and clears `live` while the arm is on stub.

That placement is load-bearing. The engine's own `MovePrompt` answers a `needs: "confirm"`
offer with `{ live: true }` unconditionally, and `PipelineCanvas` hands that straight to
`source.move()` — there is no prop through which a shell can disarm a **dragged** confirm. The
wrapper is the only seam that covers every path, dragged or ordered.

A dry move comes back as `stubbedMove(item, wouldCall)` — a SUCCESS, with the route that was
*not* called. The dialog stays open carrying it, and the strip keeps a running `DRY n` beside
the last one (`POST /api/articles`, `POST /api/articles/<id>/rework`, `POST /api/sound/generate`).
A switch whose only evidence is that nothing happened is a switch nobody trusts.

A caller that commits on `ok` alone draws a move that never happened: read `stub`.

---

## 6. The three honesty channels

`CanvasStatus.notes` is the source's account of the last load. **All three mean the load
SUCCEEDED** and something inside it did not, so none of them is an error and none may be drawn
as a failed board.

### `degraded` — a stage whose upstream could not be read

`loadPipeline()` can only throw or succeed, and the Articles lane is read from two places: the
`proposed` column needs the sibling knowledge registry, the other three need the studio's own
routes. Throwing on the registry would render the whole lane as failed and take the **gate**
column — the one with work waiting in it — down with it. So a read that fails for one stage is
reported here, that stage draws its failure, and the rest of the lane still draws its items.

This is the live case in a worktree, not a defensive branch. `registry.local` in
`.ai/manifest.yaml` is a relative sibling path, and a worktree under `.claude/worktrees/<name>/`
is two levels below the repo root, so `../ai-registry` names nothing there and
`GET /api/articles/topics` answers `503 registry-unreachable`. The reason is drawn **on the
`proposed` cell**, verbatim, in amber:

```
registry-unreachable: no registry found; tried <worktree>/../ai-registry (manifest
registry.local), <worktree>/../ai-registry (../ai-registry). Set AI_REGISTRY_DIR.
```

Set `AI_REGISTRY_DIR` to the real checkout and the column fills.

An empty column with no reason reads as "no topics to write about" when the truth is "nobody
could ask". That difference is the whole reason this channel exists.

Amber, never rose: a stage whose upstream is absent is a **limit**, not a failure.

### `hidden` — rows deliberately not drawn, with the reason

A count and its `why`, drawn on the stage it belongs to as a `<Tally>` with the reason behind
a disclosure. Articles hides uncovered topics past the first twenty (`HIDDEN 486 · uncovered
topics past the first 20`) and landed posts older than seven days. "Nothing here" and "486
things I could not place" are different sentences and only one of them is good news.

### `damaged` — records that would not read

A list of ids whose manifest could not be read at all. Drawn as a count in the strip with the
ids behind a disclosure.

None of the three is spoken twice: a degraded stage is announced once through
`lib/announcer.tsx`, keyed off the reason, because this surface adds no live region of its own.

---

## 7. The keymap

The board's keys are the **engine's**, and they are pure (`app/foundry/pipeline/keymap.ts`).
The shell binds exactly one, `F`.

| key | does |
| --- | --- |
| `←` `→` `↑` `↓` | walk to the nearest card in that direction |
| `Shift` + arrow | move the card one cell — a REQUEST; the authority may refuse |
| `Space` | select / deselect |
| `Enter` | open the card's native surface |
| `M` | the move map ("move to…") |
| `R` | retry the move that failed |
| `ContextMenu`, `Shift`+`F10` | the verb menu |
| `+` `-` `0` | zoom in, zoom out, fit |
| `Esc` | closes the innermost thing: menu, map, selection, cursor |
| `F` | fill the screen, and leave it — **the shell's, not the engine's** |

The guards are the Board's, not a second set: `refusedKey` first (a chord belongs to the
browser; a held key repeats everything but an arrow), then `typing` (a letter in a field is
text, not a verb), then an open overlay owns the keyboard — except `Esc`, which only ever
closes. `Shift`+arrow does not repeat even though a bare arrow does: a held chord must move one
card one cell, not march it across the board and ask the authority four times.

`F` is the one key the shell owns (`PipelineTab.tsx`), and it consults the same `refusedKey`
and `typing` guards before it reads the key — `foundry-key-guard` walks every `window`
keydown handler under `app/foundry` and fails one that does not. **`Esc` deliberately does
not leave full screen.** Escape is the canvas's own innermost-first close, and a second
listener taking it would collapse the board and clear the selection on one press.

Full screen also promotes the type by **+1px**, and does it by redefining the two scale
tokens on the container (`--text-label` 1rem → 1.0625rem, `--text-content` 1.125rem →
1.1875rem) rather than by changing a single class. Tailwind compiles `text-label` to
`font-size: var(--text-label)`, so every label and every card title under that root moves
together; writing sizes into the markup instead would mean one arbitrary size per element,
which is what `npm run check:type` exists to stop.

An open `aria-modal` dialog disarms the canvas automatically, so the three dialogs here need no
co-ordination with it. The docked inspector of variant 4 is not a dialog and deliberately does
not disarm it.

---

## 8. The dialogs

The engine owns two — `MovePrompt` (the answer a dragged move asks for) and `MoveMap` ("move
to…"). The shell owns three, in `pipelineModals.tsx`:

1. **Dispatch confirm** — the money gate, for a move ordered from the detail rather than by
   dragging. A costly or irreversible confirm states its consequence in full, which is one of
   `CLAUDE.md`'s three standing exemptions. Every figure is the **authority's**, read off the
   `MoveCost` that `admits()` returned and formatted by `costLine`; nothing is retyped.
2. **Rework note** — a move back to drafting, which the authority refuses without the
   operator's instruction. That instruction is what the draft turn is fed. The field carries
   **no `maxLength`**: `NOTE_MAX_CHARS` lives in `lib/articles/engine.ts`, which is server-only
   by construction and is not re-exported from the client's door, so the route's own refusal is
   what bounds the field and it is rendered verbatim.
3. **Detail** — opened by `Enter`, a double-click or the card menu. The item's facts, its
   media, its href, and the moves the authority will accept. A modal in directions 1–3, a
   docked pane in direction 4.

All three: focus trapped, `Esc` closes, and focus returns to the board — the canvas's viewport,
which carries `aria-activedescendant`, so the card is still the cursor. An order dialog
**replaces** the detail rather than stacking on it: two `aria-modal` panels would both close on
one `Esc`, and a dialog whose opener is another dialog has nowhere to hand focus back to.

None of them closes over a write that failed. Confirming awaits the move, the controls are
inert while it is in flight, and a refusal keeps the dialog up carrying the authority's own
words — `aria-modal` has removed everything behind it from the accessibility tree, so a message
rendered outside the dialog would reach nobody.
