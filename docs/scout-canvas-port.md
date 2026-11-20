# Scout Canvas — the port of the Watershed winner

The owner chose **A/1 "Watershed · Weirs"** in contest `scout-canvas-v2-r2` (2026-11-20; round 1's
winner D/1 "Watershed" was its baseline). The winner is a static prototype:
`.contest/arena/scout-canvas-v2-r2/judging/entries/A/variant-1/` (11 files, 2,781 lines: a 2D-canvas map
plus DOM chrome, all actions simulated). Its notes: `NOTES.md` beside it.

**The owner's order:** port it into the app as an **alternative graph page** (`/scout/canvas`, beside the
current `/scout` graph) until it is polished. Implement all related features, reach the same look as the
prototype, then the owner's manual tests decide. The current `/scout` graph is not touched or deleted
until the owner promotes the canvas (Q5 below waits for that ruling).

Contracts: `ai-registry/skills/contest/references/promotion.md` (fidelity) and `port-quality.md` (quality).

## What the owner chose it for (the fidelity roles)

From the owner's brief for the round, case by case:

| Case | What the winner does | Role names (data-role) |
|---|---|---|
| a) silent reels block on the operator; audio in a couple of clicks; then the calendar | amber weir pills `16 Silent` in the header and on the rivers; the Audio → calendar desk docked under the map: per-reel brief, decideAudio segments, five chain pips, a dated slot per reel, a cadence, a vendor/cost table, a 21-day release strip | `inbox`, `weir`, `desk`, `desk-row`, `chain-pips`, `cal-strip`, `steps-table` |
| b) a note for the next scouting on right-click / long-press / `N` | an in-place menu: the note field first, four stances (more · new angle · fewer · stop), "into the next brief", triage / pause / open below | `menu`, `note-field`, `stance`, `note-flag` |
| c) a fullscreen nested gallery across all runs | point → river → wall → candidate → frame; K/X, reasons 1–6, note, undo, commit; real frames with their beat captions, silent videos; a rail of the tree with counts; `32 left` | `gallery`, `gallery-rail`, `gallery-stage`, `gallery-caption`, `gallery-foot`, `left-count` |
| d) a masterclass at every level | four vocabularies (Continent rivers + basin pills; Basin towns as state rings; Town lots on night streets + edges; Street lot cards with pictures and a reel's road), labels that never collide, a minimap, crumbs, a level ladder, a legend that is the lens | `map`, `crumbs`, `ladder`, `legend`, `minimap`, `sheet` |

`style-contract.py capture` runs over these roles on the winner; the port carries the same `data-role`
hooks. Exit: **0 deviations**, every interaction above driven in a browser.

## Q0 — what the winner's code is (inventory, 2026-11-20)

- **Files:** `core.js` tables + helpers (199), `model.js` material, layout, tallies, actions (444),
  `map.js` the canvas renderer (771), `chrome.js` inbox, crumbs, ladder, legend, minimap, search, menu,
  keys (265), `sheet.js` one sheet per kind of place (172), `gallery.js` (202), `audio.js` the desk (115),
  `brief.js` next night + simulated dispatch (116), `main.js` boot + frame loop + key dispatch (44),
  `styles.css` (375).
- **Already good:** one table file (states, levels, blocking kinds, verdicts, chain, decideAudio,
  stances, keymap); tokens read once from `tokens.css` (the app's own), tints by `color-mix`; one key
  dispatcher over a keymap table with three scopes (map, gallery, desk).
- **Not to port:** the `window.WS` global and its mutable singletons; HTML built as strings (`esc(` and
  `innerHTML`); a `setTimeout` toast; simulated jobs (`act.tick`) standing in for server work; two copies
  of the pill (DOM string and canvas) — the canvas one stays canvas, the DOM one becomes one component;
  `Date(2026, 10, 19)` as "today".
- **Keys:** map `1-4 + - 0 ←→↑↓ w W g a n p b / ? Esc`; gallery `k x 1-6 ←→ j h ↓↑ ↵ n z c Space Esc`;
  desk `↵ Esc` (desk falls through to map). No key changes meaning inside a scope.

## Q1 — the structure

```
app/(studio)/scout/canvas/
  page.tsx                 server: reads the CanvasView through _port, draws ScoutHead (tab "Canvas") + the island
  _port/                   contract.ts (types) · port.ts (SIDE switch) · fixture.ts · real.ts · actions.ts ("use server")
  _canvas/
    tables.ts              the tables (states, levels, blocks, verdicts, chain, decide, stances, calendar)
    glyphs.ts              the 16x16 glyph paths, shared by DOM and canvas
    pipelines.ts           the three families' stations (song, video, reel) as data
    scene/                 PURE: material → basins/provinces/rivers/towns/lots → tallies → layout → geometry
    store.ts               the client store: scene + UI state + optimistic verdicts, useSyncExternalStore
    render/                the canvas: camera, primitives, ground, rivers, lots, rings, ports, labels, overlays, minimap
    ui/                    React: Toolbar (inbox, crumbs, search, keys, night), Docks (ladder, legend, minimap,
                           projections), Sheet, Menu, Gallery, AudioDesk, BriefDesk, Keys, Tip
    *.module.css           the winner's styles.css split by surface, over @gt/ui tokens
```

- **One door:** the server builds `CanvasView` (graph, channels, media, notes, slots, reel audio,
  calendar day zero); the client never reads files. Every write goes through `_port/actions.ts`
  (`action()` wrapper: principal, `money` key use, zod door).
- **Scene is pure** and unit-tested (`tests/next-server/scout-canvas-*.test.ts`): the same graph builds
  the same territory, blocking counts match the graph's states, verdict → recount moves a river's reach.
- **Canvas stays canvas.** The renderer is the winner's draw code, typed and split by visual thing;
  pixels come from the same tokens. DOM chrome becomes React components; no `innerHTML`.
- **Keys:** the canvas registers modes `canvas`, `canvas-gallery`, `canvas-desk` in
  `packages/ui/src/keymap/bindings.ts`; the winner's bindings kept as they are; `conflicts()` stays green.
- **New @gt/ui shapes** (CLAUDE.md: the vocabulary first): `Weir` (the amber blocking pill, with the
  `/kit` specimen) and `ChainPips` (a job's road as pips). Everything else reuses `Chip`, `Tally`,
  `StackBar`, `Keycaps`, `ErrorLine`, `Toast`.

## What is real tonight, and what waits for a backend

| Feature | Backend today | Tonight |
|---|---|---|
| Graph, channels, episodes | `buildGraph`, the channel store | **real** reads |
| Pictures and videos | `/api/foundry/file?kind=scout` via `scoutFileUrl` | **real**: the open packets' cells (`loadPacket`) plus the first frame of kept nodes found on disk |
| Verdicts across packets | Board `patch` / `undo` / `preview` + `commit` (one packet per call; commit spends nothing; a DRY night records verdicts only) | **real**: the canvas groups by packet; commit is preview → commit with `undecidedAs: "leave"` |
| Scouting notes (b) | none | **new store** `lib/foundry/scout/notes.ts` (one JSON file, lock, atomic write, zod door) + the next night's `taste.md` gains `## Operator notes` |
| Goal and hints for the next round | none | **new**: stored with the notes, carried the same way |
| Split, pause / resume | `steer.ts`, but the doors answer `ARCHIVED_DOOR` since the baseline | **real** call; the refusal shows verbatim (`ErrorLine`) |
| Audio brief (LLM) | none | **planned** (Phase 4a) |
| decideAudio → generate → lay the cut | Productions only; **no `reel` source kind** | **planned** (Phase 4b); the desk runs on the fixture side, the real side refuses with its sentence |
| Reel cut → Library export → slot | `schedule` takes `video:export:<id>`; no scout export step | **planned** (Phase 4c) |
| Dispatch a night from the canvas | a night is a `/scout night` seat session | **planned** (Phase 5); the brief desk shows the exact command to run |
| Views and revenue | none | **projected**, hatched, from editable assumptions (the winner's) |

## Phases

1. **Foundation** — route, tab, `_port` contract and both sides, tables, glyphs, pipelines.
2. **Scene** — `model.js` → `scene/` (pure, tested).
3. **Renderer** — `map.js` → `render/` + the canvas island, camera, frame loop, hit testing, minimap.
4. **Chrome and sheet** — `chrome.js` + `sheet.js` → React + CSS modules.
5. **Gallery** — `gallery.js` → React, wired to the real Board doors.
6. **Desks** — `audio.js` + `brief.js` → React; notes store + taste wiring (real); audio chain on the
   port (fixture simulated, real refuses until Phase 4b).
7. **Fidelity** — `style-contract.py` capture on the winner, check on the port until 0 deviations;
   the four cases driven in a browser; `cx-screens.mjs` gains `scout-canvas`; legibility lane.
8. **Gates** — `typecheck`, `lint`, 400-line cap, `check:narration`, `check:type`, `test:unit`,
   `tokens:check`, `next-structure`; each green at zero on the new files.

Later, each its own change after the owner's manual tests:

- **4a** LLM audio brief per reel (seat, $0): reads the reel's table, beats, logline.
- **4b** `reel` production source kind: a kept reel-cut enters Productions at `audio`; decideAudio;
  score / voice / sfx producers (receipt-priced, DRY by default, the operator arms live); the cut lays
  audio over the existing mp4 (`requestCut`'s `box.render`, $0).
- **4c** scout export bridge: `scout-<night>-c-NN.mp4` + sidecar into the exports root, then
  `schedule` on the episode's channel; only a kept, voiced cut may be sent.
- **5** dispatch: enqueue a night through the worker, or keep the copyable command.
- **Q5** when the owner promotes the canvas to `/scout`: characterise the old graph's behaviour the
  canvas must keep, cut over, delete `_scout/` in the same change.

## Rules this port keeps

- Nothing a session runs opens `foundry-out/gravitone.sqlite`; tests and the dev server set
  `GRAVITONE_STORE_PATH` and the scout store dirs to temp copies.
- No spend: every vendor step is receipt-priced and DRY; nothing here arms live.
- The screen does not explain itself: no sentence whose subject is the app; the work's own words stay.
