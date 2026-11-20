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

## Status — 2026-11-20 (the night of the port)

Landed on `main` (three commits): `/scout/canvas`, tab **Canvas** beside Graph.

| Exit condition (port-quality.md) | Measured |
|---|---|
| Fidelity | `style-contract.py` against the winner on the same real data, 1920x1080: **0 deviations on 30 roles** across four states (map 13, sheet 5, gallery 6, desk 6). Driven in a browser on both: first screen, `W` sheet, `G` gallery, `A` audio desk, `B` brief, right-click menu, Street level. |
| Model | the scene built from the contest's real data matches the winner exactly: 367 blocking points (32 verdicts, 319 seeds, 16 silent, 0 to schedule), 61 rivers, world bounds, every river's position, height and point count. |
| Gates | `tsc` 0, `eslint` 0 errors, `check:narration` OK, `check:type` OK, `next-structure` (boundaries, cycles, hygiene, size) 0, full `test:unit` 5,488 passed, live `studio-routes` + `legibility` on `/scout/canvas` pass. Largest new file 299 lines. |
| Old code | `/scout` (Graph) stays until the owner promotes the canvas (Q5). |

What the owner can do on the **real** side today: see every blocking point at every level; triage any open
packet's work from the fullscreen gallery (verdicts go through the Board's own doors; commit = preview then
commit, undecided cells left for the remainder); pin notes and set the round's goal (carried into the next
night's `taste.md` under `## Operator notes`); read the reel road, the release calendar and the exact
`/scout night` command.

What answers with its sentence until built: the reel road past the brief (Phase 4b: a `reel` production
source kind), the scout export → slot step (4c), dispatch (5), and the steer's split / pause (archived by the
baseline). On the **fixture** side (`GRAVITONE_PRODUCE_SIDE=fixture`) the whole road runs in memory: five kept
silent reel cuts → briefs → generate + lay → five dated slots every two days.

Departures from the winner, each on purpose:
- the gallery covers the window (the winner's too); every other surface lives inside the page under the studio header;
- the legend's "dry bed" key is a plain row (the winner's disabled button was under the 4.5:1 / 3:1 floors);
- the `W` pulse no longer draws before its start (the winner threw on a negative radius every frame of the flight);
- the simulated night (fake lots after dispatch) is not ported: a planned function is shown as planned, never faked;
- text controls go through `@gt/ui` `Field` / `TextArea` with the winner's look as a `skin`;
- the kit pieces (chip, seg, keycap, stackbar, the weir pill) stay route-local until the owner's manual tests
  settle the look; then they fold into `@gt/ui` with `/kit` specimens.

Not yet verified: a verdict and a commit against a live open packet in the operator's store (no session may open
it); the first real triage from the canvas is the owner's manual test.

## Production basin (character-cores S1)

Spark `character-cores` (`.vault/Spark/ideas/character-cores.md`), WP2, 2026-11-20. A music clip driven as a graph of
stations - track → look → cast (a character core) → keyframes → clips → cut - drawn on this canvas from the fixture
WP1 imported out of Unlatched's first 1:46 (`lib/production/fixtureProduction.json`, 57 nodes, 27 cores). Types:
`@gt/domain/productionGraph` (WP0). The real side holds no production yet (S2: the kernel production manifest), so the
basin is drawn only on the fixture side; nothing here spends or regenerates.

| Zoom | What it draws | Where |
|---|---|---|
| Continent | a fourth basin, **Productions**, south of the reels, with each production's title, cast and state counts | `pipelines.ts` `FAMILIES.production`, `scene/layout.ts` `newBasins(true)`, `render/labels.ts` |
| Basin / town | one synthetic river per production (`prod:<id>`, province "Music clips") with its six station marks; a click on it or a station opens the street | `scene/build.ts` `River.prod`, `store.ts` `openSheet` |
| Street | **the street**, docked under the map like the desk (the map's bottom inset), opened on arrival at street zoom over the river, on a click, or by a link | `_canvas/production/` |

**The timeline street is the production's street** - the only drawing, no switch. The master clock is the street: a
ruler of sections, beats (every fourth a bar), lyric lines and clock marks, with the stations as lanes above it (plates
where first used, the cast across the track, keyframes where they play, takes and the cut as spans). The ripple runs
along the clock. Every node on it is a press that opens its overlay (S1.5 WP7). **The ruler is drawn locally**: WP3's
`@gt/ui` Timeline did not exist yet; replace this ruler with it when it lands (recorded duplication).

Retired (picked 2026-11-20, WP9): **A · River** (the stations as columns on one river line) and **C · Film strip** (the
takes as frames of film), with the switch, `V`, the store's variant and the `v=` link param. An old link's `v=a|b|c`
is read as nothing and opens the timeline street. The drop-a-core-on-the-cast-card target lived only in A and C and
went with them: the core picker is the way to swap.

The swap: the cast chip in the bar or the cast lane (or `C`) opens the core picker → a core → `swapPreview` → the take
starts as cast now beside the same frames redrawn with the core (WP4's experiment frames; a frame not drawn yet is
**pending**, never the old frame passed off as new), the eye's drift badge on each, and the redo receipt in the work's
units (`34 keyframes × ~4 min · 6 clips × ~25 min · 1 cut`, `~4 h 46 min`) → **Accept** (`swapAccept`: the port's
production replaces the store's, the nodes it made stale ripple once, then hold the amber hatch) or **Keep current**
(`Esc`). After Accept exactly the nodes `staleAfter(nodes, "cast")` names are stale: the 34 keyframes the lead is in,
the 6 takes and the cut; never the track, the look, a plate, or E01a / E01m / P202 (drawn without her). A refusal
(`… is already cast …`) shows verbatim as an `ErrorLine` in the street.

States: made (hair border), **stale** (amber border + hatch, never rose - `@gt/ui` StaleBadge's rule), **pending** (cyan
dashed), **failed** (rose). Drift is advisory: three marks (identity · room · wardrobe), hollow holds, violet drifts -
never the verdict's emerald or rose; the eye's reason on hover and focus and in every tile's accessible name. A tile
picked shows the node's own words under the drawing: inputs, the prompt verbatim, the eye's reading.

Links (also the `cx-screens.mjs` ids `scout-canvas-street`, `-cores`, `-swap`, `-swap-pending`, the three
`-*-overlay` ids and `-stale`): `/scout/canvas?street=unlatched`, `&tray=1`, `&swap=<core id>` (the preview is asked on the server). The
`-stale` id accepts a swap; the fixture holds it for the dev server's life, so it is captured last.

Pure readings in `_canvas/production/model.ts` (lanes and ruler, overlay runs, receipt, drift words), tested on the
fixture in `tests/next-server/scout-canvas-production.test.ts`.
