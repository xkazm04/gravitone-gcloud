# The pipeline canvas

`/foundry` → **Pipeline**. One board, two media, one skin. A card's POSITION is its
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
| `app/foundry/PipelineTab.tsx` | the shell: the controls row, the skin per medium, the board's height, the arm |
| `app/foundry/pipelineModals.tsx` | the dispatch confirm, the rework note, the detail (two mounts) |
| `app/foundry/pipeline/` | THE ENGINE — the board, the drag, the keyboard, two move dialogs |
| `app/foundry/pipeline/skins/` | the skin — `ledger`, round 1's winner |
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
grouping axis and whether a move writes.

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
inside `gate` (`triage · pending · remaster · edit`) and three inside `done` (`tracks · videos ·
kept`, section 14). The furniture stays still; the detail is
honest.

The Y axis is a **view choice**, not a write. The re-group `Select` offers
`source.groupAxes`, which is by contract only the axes the adapter knows are populated — an
axis that reads blank for most items is a worse board than no axis, because the operator
cannot tell "ungrouped" from "unwritten". Articles offers `bundle · status · model · effort`;
Audio offers `row · genre · provider · op · origin`. Re-grouping never writes, and a drag that
crosses a row carries the axis it was read under so an adapter can refuse a row it does not
own.

---

## 4. The skin (one, now)

Round 1 ran **four directions** behind `?v=1|2|3|4` on the same live data — Dense ledger,
Spatial field, Transit map, Workbench — so the look could be judged by flipping rather than by
reading a description. The operator flipped them and answered: *"Dense ledger is the winner
with couple of adjustments."* The other three are **deleted**, along with `?v=`, the variant
registry and the docked inspector that was the Workbench's whole bet. What they proved is in
`.vault/Masterpiece/exercises/01-pipeline-canvas.md`; what they cost to keep was three files of
taste that every future change to the card contract would have to keep compiling.

**The seam survives the cull.** A skin is still `face(entry)` plus an optional `world(layout)`
(`app/foundry/pipeline/types.ts`), still cannot reach the camera, add a column or move a card,
and `skins/index.ts` still exports one name. A second direction is a new file and an import.

**Dense ledger, and what the verdict changed.** The card carried the title and a figure, then
vendor / state / dwell under a rule; the operator's reading was that those four facts were
costing the TITLE its readability. The card is now the title alone — at `text-content`, 2px up
from the rest of the board — plus, for an audio item, a play button. The four facts live in the
detail, where `standing` was added because it was the one of them the detail did not already
carry. The card fell from 80px to 48px with them, and `CARD_W` went 272 → 282 because a
one-line card truncates its title at the width.

It renames two of the four canon stages in its own idiom, **per medium**: articles reads
`working` → `running`, audio reads `working` → `queue` (one Suno job runs and the rest wait
behind it, so "running" would be false of every card but one); both read `done` → `settled`.
`ledger` and `ledgerAudio` are two module-level objects, and `PipelineTab` picks one by medium
and hands the SAME one to the canvas, the shell's stage words and the detail's order buttons —
so the column head, a card's accessible name and an order button can never call a stage two
things. It draws a `world` layer: one hairline in the middle of every row gap, as a
repeating gradient per lane, so ruling a 500-row lane costs what ruling a 2-row one costs.


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

A count and its `why`. **No longer drawn in the controls row** — the operator struck the
`hidden` tallies (spark audio-queue-suno); the channel stays in `CanvasStatus.notes`. Articles hides uncovered topics past the first twenty (`HIDDEN 486 · uncovered
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
| wheel | zoom at the pointer |
| `Shift` + wheel, `Alt` + wheel | pan horizontally, vertically (a trackpad's sideways swipe pans too) |
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

The board is never dragged (the operator's ruling) and draws no grab cursor; only a card is
pulled. The wheel is a zoom at the pointer (2026-10-12): zooming out and back in at a spot is
how a board without a drag reaches what is off-screen, with `Shift`/`Alt` + wheel as the pans.

An open `aria-modal` dialog disarms the canvas automatically, so the three dialogs here need no
co-ordination with it.

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
   media, its href, the moves the authority will accept, and how long it has been standing.

All three: focus trapped, `Esc` closes, and focus returns to the board — the canvas's viewport,
which carries `aria-activedescendant`, so the card is still the cursor. An order dialog
**replaces** the detail rather than stacking on it: two `aria-modal` panels would both close on
one `Esc`, and a dialog whose opener is another dialog has nowhere to hand focus back to.

None of them closes over a write that failed. Confirming awaits the move, the controls are
inert while it is in flight, and a refusal keeps the dialog up carrying the authority's own
words — `aria-modal` has removed everything behind it from the accessibility tree, so a message
rendered outside the dialog would reach nobody.

---

## 9. The controls row

A flex row **above** the board, outside it — not a cluster floating over its corner. Floating,
it sat exactly where the stage heads draw, and the fix was a measured `--gt-board-gutter` the
heads had to stop short of; a row of its own needs no gutter, and the gutter is deleted.

It carries, right-aligned: `degraded` chips (amber, reason behind a `<Hint>`), a switched
stage's state (`notes.switched`: `QUEUE RUNNING` / `QUEUE STOPPED`, amber with the job and model
behind a `<Hint>` when a crash stopped it), `DAMAGED n`,
`CHOREO n/cap`, `DRY n` (the stub receipt — moves AND spending verbs), the group `Select`, the
arm, and full screen. The `hidden` tallies and the `CARDS n` tally are gone: every stage head
carries its count. The armed chip shows a price only where one is measured (articles'
`RUN_COST_HINT`); an armed audio board says `LIVE` alone.

The load line and the load failure sit in the same wrapper, and `useFillHeight`
(`pipeline/boardMount.tsx`) observes that wrapper as well as the document: in full screen the
shell is `position: fixed`, so a row that wraps or a load line that leaves moves the board
without resizing the document. Toggling full screen re-measures on the next frame.

## 10. The headers — one system, three rungs

All three come from `pipeline/type.ts`, and full screen grows them together by rescaling the
two type tokens:

| rung | role | drawn as |
| --- | --- | --- |
| stage | `TYPE.label` in the stage's tone | dot · word · rolling count, on an opaque ink strip |
| band | `TYPE.label`, quieter (`white/45`) + `TYPE.figure` count | ONE rounded bar per banded stage, segments split by hairlines, each over its own column |
| lane | `TYPE.title` (`font-hanken text-content`) | the work's own name on head glass |

The band bar spans exactly the stage, and each segment's left/width is its column's share of
that span, so segments stay over their columns at every zoom. It registers with
`stick={false}` (`pipeline/headRegistry.tsx`): the keep-in-view nudge that stage words get
would slide the segments off their columns. The `0.12em` uppercase tracking is `TYPE.label` and
is spelled nowhere else on the board (the drag's slot word in `CellLayer` uses it too).

## 11. Cell and card menus — the source's verbs

A source may add verbs (`lib/board/pipeline.ts`): `cellVerbs(target)` for a place,
`cardVerbs(itemId)` for a card, `runVerb(id, target, input?)` to carry one out.

- **Right-click a card** — the engine's own items, then `cardVerbs(id)` appended, then the
  verbs of the **tile the card sits in** (`cellVerbs` for its lane x stage x band) under a
  separator naming the tile, so a card is also the way to its cell. Target: `{ axis, itemId }`,
  plus `itemIds` (every selected id) when the card is inside a selection of several — a card
  verb then acts on the selection, and the item's detail reads `×n`. A source applies it to the
  selected cards of the lead card's kind only.
- **Right-click off a card** — the cell under the pointer is read off `data-cell`
  (`lane|stage|band`, parsed from the end because a lane key may hold `|`), or on a seam from
  the world point by `resolveCell`. Clicks over the stage strip or the lane column resolve to
  nothing. If `cellVerbs` returns verbs the menu opens with them; if it returns none the
  **browser's own menu is left alone**. Target: `{ axis, lane, stage, band }`, `axis` being the
  group axis the lanes are read under.
- **A disabled verb** is drawn inert with its reason beside it; the reason is the item's
  accessible description and the item stays in the arrow-key walk.
- **A verb with `input`** opens `pipeline/modals/VerbAsk.tsx` (lazy, `next/dynamic`):
  `suno-fields` = Title, Style (required), Lyrics, an Instrumental toggle that sets the lyrics to
  `[Instrumental]`, Exclude — empty fields are omitted, never sent as `""`; `count` = a 1–8
  stepper. `input.initial` prefills either. A refusal stays in the dialog.
- **A verb with `confirm`** (destructive verbs carry `destructive: true`, drawn rose and never
  first) opens the same modal with the consequence as its body and the verb's own label on the
  button ("Delete all 12 here"). The sentence is the work's: what leaves, what stays.
- **A verb without input** runs at once; a refusal is announced.
- On `ok` the engine announces `result.announce` and **re-reads the board**.

**The arm answers spending verbs.** `armSource` (`pipeline/arm.ts`) looks the verb up in the
list the source itself returned for that target; a verb marked `spends: true` is answered
`{ ok: true, announce: "dry: nothing was spent" }` while the arm is STUB, and bumps `DRY n`
with the verb's label. LIVE passes it through. The source never sees a spending verb the money
switch did not allow.

## 12. Progress, polling and the re-read after a move

**Progress.** A card whose item carries `progress` (`{ phase, startedAt }`, set only on the
job a machine is on right now) draws a slow left-to-right sweep (`gt-indeterminate`, 3.2s), the
phase verbatim and an elapsed `m:ss`. Reduced motion stops the sweep where it starts: a static
partial bar. The clock is one shared 1s ticker (`ProgressClock`, `pipeline/Card.tsx`) that runs
only while a progress card is mounted, and re-renders the clock's text, not the card. The card
is `aria-busy` and its name carries the phase; there is no new live region. The card's memo
compares `progress` as well as `version`.

The ledger face also prints the lead fact when the adapter puts one first: a waiting job's
`queue #n` before the title, a clip's `model` as a chip after it. An audio medium with no `src`
yet draws a disabled play button whose accessible name says it is still rendering.

**Polling.** After every load the canvas reads `source.pollMs?.()` and polls at that rate
through `lib/usePolling` (in-flight guard, paused in a hidden tab); 0 stops it. The `pollMs`
prop is the floor a shell may still set.

**The re-read after a move.** `submitMoves` folds each answer in by the returned item's id, then
calls `reload()` once per batch that resolved anything: a move may return a different item (a
proposal queued becomes a job under a new id) or land somewhere the request did not name, and
only the source's own account knows what it became.

**Cold load.** The board is its own chunk (`next/dynamic` in FoundryView), so the other foundry tabs never pay for the engine. Until the first `loadPipeline()` answers, `BoardSkeleton` draws card-sized placeholders on the grid inside the board, with the load line, and nothing above the board changes height, so the answer moves nothing. The first view always mounts in waves, from `WAVE_MIN` cards nearest the middle, growing per frame by the measured frame cost, so a cold board arrives staggered rather than in one commit; later views wave only on a jump (a fit, a big zoom). Time to first card on a cold load is the data's, not the render's (measured 2026-10-12: articles waits on `/api/articles/topics` and nine ~250 KB details, `lib/board/sources/articles.ts`).

## 13. The Suno queue (audio)

Audio's working column is a serial Suno queue (`lib/sound/suno/queue.ts`, store
`foundry-out/sound/suno.json`): one job renders at a time, FIFO, persisted, every job on both
models (`v6`, `v6-wild`), two clips each. A prompt (`proposed`) moved to `working` under LIVE
enqueues it; under STUB the move is dry.

**The queue is switched by hand.** Queueing never starts it: the worker drives the operator's
browser and spends credits, so a batch waits in the column until the Queue tile's menu says
**Start queue · n** (`spends`: the arm holds it while STUB) and runs until it is empty or
**Stop queue**. Stop lets the create in flight finish — a Suno create cannot be called back — and
returns its job to the queue holding the clips it has; the next Start creates only the missing
model. The state persists (`suno.json` `queue.running`, absent = stopped). A server that dies
mid-create comes back with the queue **stopped** and `queue.interrupted` naming the job and
model, because that model may already be spent on Suno: check the library, then Start.

**Delete all, per tile.** Every audio tile's menu ends with a destructive clear (`suno.clear-cell`,
one `POST /api/sound/suno/clear`): Proposed deletes its prompts (hunt leaves stay with their
hunt), Queue cancels what waits (a job Suno is creating is skipped), the gate deletes its clip
records. Nothing on suno.com is touched; a deleted library clip comes back with the next import.
A clip card's own **Delete** does the same for the card or the selection. A queued job moved back to `proposed` cancels it; the
active one is refused ("rendering now - it lands in triage when Suno finishes"). Finished clips
land in `gate / triage` with no verdict; `pending` is keep; drop takes the clip off the board
(counted under `hidden`). A clip's card links to its Suno song page. Hunt leaves dropped on
`working` become one Suno proposal each. The driver is `lib/suno/` (see `docs/suno-driver.md`);
a driver that is down pauses the queue and reports `degraded` on `working`.

**The Suno library.** Right-click any `gate / triage` cell → **Import Suno library** (free:
no `spends`, the arm passes it in STUB too) reads every finished, untrashed song in the
operator's Suno library into triage as clips with `origin: "library"` — Suno URL, title, model
label, and the prompt (style tags, lyrics, negative tags) shown whole in the detail pane. It is
idempotent by song id against every clip already stored, queue-made ones included; the
announcement is `Suno library: added N, skipped M`. A library clip has no job and no lane: it
draws in the **ungrouped** lane under every axis until it is moved. Dropping a clip in another
lane (any gate band) writes its `lane` (`{ axis, value }`, the axis the board is grouped by)
through `PATCH /api/sound/suno/clips/[id]`, and that lane wins over the job's from then on.
The same import runs without the app: `npm run suno:import`.

## 14. Music videos (Settled, audio)

Audio's Settled column is a second hand-switched queue (`lib/sound/mv/`, store
`foundry-out/sound/mv.json`), drawn in three bands: **tracks** (finalized takes, as before),
**videos** (every job not kept — queued with its place, active with its phase and clock, failed
wearing the error's first words, finished and unjudged, dropped) and **kept**. A video is the
native kind `mv`, id `audio:mv:<jobId>`, and draws in its **track's** lane: the take's row, the
clip's lane (or its job's), and under every other axis whatever the track's own card reads; a
track the board does not draw leaves it ungrouped. A cancelled job is not drawn and is counted
under `hidden`.

**Making one is free.** A take with a file, or a **kept** Suno clip, dropped on `videos` — or
its card's **Make video** — becomes a job (`POST /api/sound/mv`); the track stays where it was.
A clip dropped on `tracks` is refused ("a Suno clip is a link, not a file: drop it on videos"),
an unkept clip is refused until it is kept, and a take dropped on `tracks` still finalizes with
its label. A track that already holds a live job is skipped by the server; its Make video is
inert, saying so.

**The queue is switched by hand**, like the Suno queue. The Videos tile's menu says
**Start videos · n** (`spends`: a Leonardo still through the studio pool and two text turns per
job, so the arm holds it while STUB; inert with "nothing queued" or the still vendor's own
sentence) and **Stop videos**. A job analyses the track, writes a treatment from the title and
the analysis only, renders one still (GPT Image 2.5 Sunburst at High, 1376x768, 71 studio
credits), animates particles and the low-band edge light over it, and writes the YouTube proposal
(title, description with its chapter lines, tags). No thumbnail: it is taken from a frame of the
video. The code-drawn pulsing element was descoped on 2026-10-12. The chip in the controls row reads `VIDEOS RUNNING` / `VIDEOS STOPPED`
(`notes.switched` carries `label: "videos"`, because "settled running" names nothing), amber
with the job and phase when a crash stopped it. The board polls every 2s while a video is
active, or queued with the queue running. A music-video read that fails degrades Settled alone;
the tracks and every Suno stage still draw.

**The tiles.** `tracks` and `videos` both offer **Import audio folder** (free; one path,
default `~/Downloads/Misu`, `~` read as the studio machine's home): every audio file directly in it becomes a finalized
take, a file already imported (same path and size) is skipped, and the answer is
`N imported, M already here`. `videos` ends with **Delete all n here**: the records and their
render files go, queued jobs are cancelled, the tracks stay; a video rendering now is left to
finish.

**A video's verbs.** **Keep** / **Drop** while a finished video waits on a verdict (Drop deletes
the video and still and keeps the record and its metadata; dragging between `videos`
and `kept` is the same verdict). **Regenerate** — a part (`image`: a new treatment and still,
then a re-render; `motion`: new effect parameters on the same still; `metadata`: new text, no
render) and an optional note; everything not named is kept byte-identical; inert while queued or
rendering. The API also takes `prompt` with `image`: the operator's own still prompt, used as
written (the no-text clause welded on) in place of the treatment turn; the canvas form does not
offer it yet.

**A whole album, headless.** `pipeline/music-video.mts` (the `/music-video` skill) runs the same
queue over a folder: `plan` reads only; `run --yes` imports, queues each track (a failed one is
retried from its failed step), drains, switches the queue off, and writes `<track>.mp4` and
`<track> - youtube.txt` beside each source. One process drains the store at a time
(`mv.json` `worker`): a dev server whose queue is on pauses the CLI naming its pid, and the reverse. **Edit metadata** (title, description, tags). **Send to Calendar** — a publish date
and time, a dry-run YouTube slot; finished videos only, inert once a slot exists. **Delete**
(the record and its render files; the track stays). A verb on a card inside a selection acts on
every selected video, stopping at the first refusal and saying how far it got.

### The detail, for every source

- **Video.** A `video` medium plays in a `<video controls preload="metadata">` with the first
  image as its poster (the still is not drawn twice). The raw element is the reviewed
  exception the kit census counts, as the `<audio>` is: `components/kit/Player` owns no element.
- **The source's verbs.** `cardVerbs(id)` draws as a row of buttons under the move orders,
  disabled ones with their reason beside them. A click takes the menu's path: input or a
  consequence opens VerbAsk, which replaces the detail; otherwise it runs at once, and a refusal
  stays in the detail. The source is the armed one, so a spending verb is dry while STUB. An
  `ok` is announced, re-reads the board and closes the detail.
- **Texts.** `PipelineEntry.texts` (`{ label, value }[]`) draws each as a labelled block with a
  **copy** button (`Copy <label>`). A video fills Title, Description and Tags.

VerbAsk's forms: `suno-fields`, `count`, `text` (one labelled line), `datetime` (the browser's
picker, sent as ISO 8601), `choice` (pills from `input.options`, plus a note) and `metadata`.
