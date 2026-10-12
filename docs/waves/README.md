# Improvement waves

One branch (`claude/gracious-euler-42slgl`), one PR, the whole app covered in waves. Every wave runs
the same trio over its scope, and every scope is a directory, so parallel work inside a wave never
touches the same file.

## The trio

**a) UI: layered, not printed.** Long reads become a nested experience: the first level is the
state of the work (counts, pips, verdicts, the one action that matters); the second opens on demand
(a section, a tab, a drawer); the third is the full record. This is done with the house vocabulary
(`components/ui/signal/`: `Tally`, `PipRow`, `TabRail`, `Hint`, `StackBar` …) and under the house law
(CLAUDE.md, "The app does not explain itself"): a paragraph about the app is deleted, not folded
away; a paragraph about the work stays verbatim, one level down if it is long. `npm run
check:narration` may only fall.

**b) Performance: load what is on screen.** Route-level code splitting for heavy client views (the
tree had zero `next/dynamic` imports when this started), memoisation where a render is measurably
hot, and, wherever a list reads an unbounded store (IndexedDB `getAll`, asset shelves, run logs,
ledgers), a window: paged reads or incremental reveal, never "everything, then filter".
`npm run check:bundle` is the referee.

**c) Product: is the feature at its best?** For each surface: what does the user come here to do,
how many steps does it take now, and what would make it one fewer? Shipped where the change is
local and safe (defaults, shortcuts, empty states that lead somewhere, bulk actions, remembered
choices); anything larger is written down as a proposal in the wave ledger, not built half-way.

## Rules every wave keeps

- Scope is a directory list. Shared code (`components/ui`, `lib`) is changed only in Wave 0 or by the
  integrator; a wave that needs a shared change asks for it.
- Behaviour that tests pin stays pinned: the Playwright suite and the regression gates pass after
  every wave (`npm run verify`, plus `cx-capture` for screens whose shape changed).
- No new explanatory slots on shared components, no `title=` paragraphs, a11y names never deleted.
- New files for a studio step stay inside its step directory (the map is shaped by directories).

## The waves

| wave | scope | why this order |
|---|---|---|
| 0 · foundation | `components/ui`, `lib` hooks, `next.config.ts`, route entry points | the primitives the others need: a nested-section disclosure, a windowed-list / load-more hook, the dynamic-import pattern |
| 1 · entry & shelf | `app/_landing`, `app/projects`, `app/_projects`; `app/studio`, `app/_studio`, `app/_phases/_shared`, `app/_library` | the first five minutes of every user, and the shell every step sits in |
| 2 · research & script | `app/_phases/research`, `app/_phases/script` | the two densest, most text-heavy steps (~18k lines) |
| 3 · frames, motion, score, cut | `app/_phases/frames`, `app/_phases/motion`, `app/_phases/score`, `app/_phases/cut` | the media steps: heaviest renders, biggest lists of candidates |
| 4 · library & foundry | `app/library`, `app/foundry` | the unbounded stores: assets, audio ledgers, style extraction runs |
| 5 · workbench | `app/playground`, `app/kit`, `app/board`, `app/calendar`, `app/articles` | internal and secondary surfaces |
| 6 · integration | whole tree | full gates, screenshots, context-map gate, the PR |

## Wave 0 primitives

What Waves 1–5 build with. Use these before inventing a local copy; a second spelling is a finding.

| need | primitive | import | one line |
|---|---|---|---|
| L2 on demand: a section the reader opens | `Fold` | `@/components/ui/signal` | `<Fold title="Sources" tally={{ value: n }} remember="research.sources">…</Fold>`: title + Tally/marks only, no prose slot; body mounts on first open |
| a long list, shown a page at a time | `useWindow` + `Pager` | `@/components/kit` | `const w = useWindow(rows, { size: 24, key: filter }); w.visible.map(…); <Pager shown={w.shown} total={w.total} onMore={w.more} onAll={w.all} step={24} noun="assets" auto />` |
| remember a choice across reloads | `useRemembered` | `@/lib/useRemembered` | `const [tab, setTab] = useRemembered("library.module", "styles", IDS)`; one evicted localStorage record, never a new key |
| split a tab/modal-only view out of the route chunk | `next/dynamic` + `pendingPanel` | `next/dynamic`, `@/components/ui/Pending` | `const X = dynamic(() => import("./X").then((m) => m.X), { loading: pendingPanel })` in a `"use client"` file, never in a Server Component |
| a route segment that renders on demand | `loading.tsx` + `Pending` | `@/components/ui/Pending` | `export default function Loading() { return <Pending tall />; }` |
| bytes behind a few proof pointers | `getThemes(uid, ids)` | `@/lib/themes` | reads only the named themes, not every proof sheet the account has |

Rules that come with them:

- A `Fold` is for the work when it is long (sources, gate details verbatim, logs, rejected candidates). A paragraph about the app is deleted, not folded.
- `useWindow`'s `key` resets the window when the list becomes a different list (filter, sort, query). Pass it rather than calling `reset()` in every handler.
- `Pager` draws the kit meridian under a `[data-world]` and a `Tally` with ghost `Button`s elsewhere; the same props either way.
- `package.json` `sideEffects` is now declared (next.config.ts says why). A module imported bare for what it does on import must be added to that list; `tests/golden-path/side-effects-declared.probe.spec.ts` fails until it is.
- `next/dynamic` in a Server Component does not split client code (Next's own lazy-loading guide). Split inside the client view that switches the tab.

## Ledger

Each wave appends what it shipped, what it measured, and what it proposes but did not build.

### Wave 0 · foundation (2026-10-08)

**Shipped.**
- `Fold` (`components/ui/signal/Fold.tsx`): nested disclosure, WAI pattern, lazy body, `remember`; almanac skin `k-sect` in `components/kit/kit.css`; signal README, kit README, catalog and `/kit` specimen.
- `useWindow` / `Pager` (`components/kit/Pager.tsx`, already existed with zero adopters): `key` resets the window; an Obsidian rendering outside a world, where the `k-*` classes never applied.
- `useRemembered` (`lib/useRemembered.ts`): one localStorage record `gravitone.ui.v1`, hydration-safe, on the identity-eviction list (and its in-memory copy dropped by `evictIdentity`).
- `getThemes(uid, ids)` (`lib/themes.ts`), adopted by `lib/useAssets.ts#hydrateProofs`: the shelf reads only the themes its `proof:` pointers name instead of every proof sheet.
- Code splitting: the six studio steps (`app/studio/[projectId]/phases.tsx`, with hover/focus preload from the stepper) and the tab panels of `/library`, `/kit`, `/playground`, `/calendar`, `/foundry` (cull stays static) are `next/dynamic`; `loading.tsx` for the three on-demand segments (`/studio/[projectId]`, `/articles/new`, `/articles/[runId]`).
- `package.json` `sideEffects`, so barrel re-exports nobody uses are dropped; guarded by a new probe.

**Measured.** First-load JS per route, `next build` + client manifests, modern browsers (the `nomodule` polyfill excluded), raw / gzip KB, before → after:

| route | raw | gzip |
|---|---|---|
| /studio/[projectId] | 1527 → 721 | 466 → 224 |
| /library | 1071 → 678 | 331 → 209 |
| /kit | 1034 → 737 | 310 → 221 |
| /playground | 985 → 683 | 301 → 210 |
| /board | 948 → 744 | 290 → 228 |
| /calendar | 890 → 697 | 272 → 215 |
| /foundry | 964 → 869 | 292 → 269 |
| /projects | 879 → 868 | 273 → 270 |
| /projects/new | 852 → 838 | 263 → 259 |
| / | 690 → 677 | 212 → 208 |
| /articles (each) | 693–725 → 684–717 | 212–220 → 211–218 |

Paged IndexedDB reads were looked for and not built: the asset rows are pointers and the folder tree needs all of them (`buildTree`), the bytes already live apart in `UPLOADS_STORE`, and no store has an index whose order matches what a surface shows. The real over-read was the themes, fixed above.

**Proposals (not built).**
- Wave 1: `LibraryShelves` in `StudioView` renders only when `outputsOpen`; a `dynamic` import would take it out of the studio chunk. `ProjectDialog` on `/projects` likewise only matters when opened.
- Wave 4: `useAssets` hydrates an object URL for every uploaded plate on the shelf on each reload; hydrating only the rows a window shows (`useWindow` + `getUploadBlobs(ids)`) is the next step once the shelf is windowed.
- Wave 6: `firebase/auth` (~110 KB raw) is in the root layout chunk of every route, including the landing; it gates every signed-in route, so moving it is an auth-architecture change, not a split.
- The integrator, after `git add`: re-run `npx tsx pipeline/kit-census.mts` (the census walks tracked files only, so `Fold` enters `app/kit/census.json` once it is tracked; `kit-catalog` fails "every catalogued part is a census part" until then).


### Wave 1 · entry, shelf, studio shell (2026-10-08)

**Shipped.**
- `/projects`: `ProjectDialog` and `ConfirmDelete` are `next/dynamic`, mounted only while open and preloaded on idle after the shelf paints, so the form and the wizard's stages leave the route chunk. Sort and group are remembered (`useRemembered`), a URL `s=`/`g=` still wins; filters and search deliberately are not.
- `/projects/new`: a returning user is dealt their last discipline, template and style while each is still valid, and the wizard opens on the first unanswered stage (three clicks fewer on a repeat); Back still walks one stage at a time.
- The demo mark lost its 100-character `title=` (the long-`title=` budget falls 5 → 4).
- Studio shell: `LibraryShelves` split out (preloaded on Outputs hover/focus), the outputs count reader lazy-imported, the step surface memoised on step + project id, shelf cards paged by 12 with lazy-decoded plates, `[` / `]` move between steps from anywhere, the stepper takes ←/→/Home/End/Enter like `TabRail`.
- `Modal` returns focus to the real opener when a child autofocuses on open (it recorded its own input, so closing quick-create dropped focus to `<main>`).

**Measured.** The shelf was already windowed (`useVirtual`, render-budget probe) and `stepStore` reads and writes one key each with latest-wins; neither changed.

**Proposals (not built).**
- Bulk select and delete on the race sheet; an undo toast in place of the delete confirm (needs a soft delete in `lib/projects`).
- An upstream-break mark between steps on the rail for what blocks the next step (today only `title=`/sr-only).
- `listAssetsFor(uid, projectId)` so the outputs shelf's kept index stops reading the whole account (handed to Wave 4).

### Wave 2 · research & script (2026-10-08)

**Shipped.**
- Research: only the face on screen is fetched. The guided wizard (deck engine, run stage, live client) and the expert board (triage board, card tiles, follow-up queue) are separate `next/dynamic` chunks, the other preloaded on idle; `NotebookBody` and `EvidenceLog` load on first open; the ads, music-video and beat-variant faces leave the chunk of educational projects. `FaceSwitch` and `ArtifactPills` moved to their own files (re-exported) to make the split possible.
- Research, B-002 (interim of C-001): the guided review stage prints `DEALT 8/39 · NOT DEALT 31` with the class breakdown and a way to the expert board before `confirm scope`, which used to sign off on 39 cards after showing 8.
- Research: a failed run's findings and the notebook's declared gaps used to end at "…and N more." with no way to read them; the rest now sit verbatim in a `Fold`. Triage columns show 10 cards, then a `Pager`.
- Script: gate findings, the constraint ledger, craft checks, the recalibrate summary and the trailer's advisory rules sit behind `Fold`s whose headers carry the verdict and counts (the gate's opens itself when it blocks); details and quotes stay verbatim one press down. The tab rail shows the gate's state (`N blocking` / `N not checked`) instead of a constant "3 renders". TrailerScript (with its 1.3k-line structure checker), AdsScenario, the three grid tabs and the expert columns are `next/dynamic`; the expert face stops re-running the gate three times and reads the rollup. The step tab is remembered. B-005 (part): the guided duel shows a render's cut facts verbatim.

**Measured.** The gate memo was already stable and trailer typing already debounced (400 ms); neither changed. No version-history list exists in Script to window.

**Proposals (not built).**
- C-001 option 1: reversals dealt with the facts they rest on, as their own guided stage (design call; concept open).
- Research cards show the claim only, with precedent / wrong-if / sources per card on demand (needs its own pass over CardTile's overlay-button a11y).
- B-005 rest: the evidence-log modal mounted on Script; B-007: lock facts→beats while an adoption exists; C-003: the gate refuses a candidate that speaks a scope exclusion. All cross the research/script seam or change gate behaviour.
- B-003 (visible glossary lines under chips) was not built: it contradicts the narration law as written, so it is the operator's call.
- M-001 fires: `guided/` changed, so `compose-from-scratch` L2 should be re-run for Priyanka, Kwame and Marco.

### Wave 3 · frames, motion, score, cut (2026-10-08)

**Shipped.**
- Motion, a data-loss fix: accepting a motion line wrote it to the `frames` copy only, not to `units`, which is what Frames reads, so the line vanished on the next Frames open and was erased by its next save. `useMotion.accept` writes both.
- Frames: the shot sheet's review rows and "not checked" list sit behind `Fold`s with counts (the review opens itself on a violation); each shot's full proposed prompt and move, reachable only by mouse-hover `title=`, is shown verbatim on expanding the row. Contact sheet, shot sheet, ads and music-video views and the effects studio are `next/dynamic`. `generatePlate` is stable across edits; ledger rows are memoised so a layer drag re-renders one row, and the direction pass's one-second clock is its own component instead of re-rendering the ledger every second. The contact sheet's scroll updates once per frame; plates lazy-decode; Ads Frames/Motion load the image data of the shot on screen, not every take of every shot; `useAssetUrls` refetches after a remount instead of holding revoked URLs.
- Frames keys: J/K rows, N next frame with no plate, ←/→ scenes and ↑/↓ cycle the kept alternative on the contact sheet, 1–9 adopt a take and N next un-adopted shot in Ads Frames, Ctrl/⌘+Enter accepts in Motion, each listed in `Keycaps`.
- Score: an amber `gaps N` tally on the coverage row; "add a cue" lands on the first uncovered run and focuses its title; deleting a cue shows an undo chip (Ctrl/⌘+Z); ←/→/Home/End walk cues. Scene layout, coverage and gaps are memoised.
- Cut: `PipRow` of finish-line checks beside "next"; ↑/↓ jump between edit points on any lane, G / ⇧G between music gaps, Shift-drag snaps the playhead within 8px, Ctrl/⌘+Z undoes sync nudges; Space ignored under a dialog. Takes' `<audio>` start at `preload="metadata"` and go `auto` within 6 s of the playhead, so opening a cut no longer downloads every stored take. `AdsScore`, `AdsFinish`, `MusicVideoExport` are `next/dynamic`.
- New pure seams `cut/edits.ts` and `score/gaps.ts`, held by `tests/golden-path/cut-edits.probe.spec.ts`. The long `title={expr}` budget falls 6 → 5.

**Measured.** The Cut's lanes already stay out of React during playback (render counter flat at 3 over 1.5 s of play), so the clock was left alone.

**Proposals (not built).**
- "Direct all undirected plates" in Motion (a series of paid calls: needs a cost estimate first); "accept all proposals" (what happens to edited drafts is undecided); bulk "use this alternative" across scenes.
- A studio-styled undo toast shared by Score and Cut (`kit/Toast` does not style the studio); a playhead on Score so G and J/K/L mean the same on both steps; collapse a long cue's "briefed from" chips.
- At 1600px the frames ledger's breakdown column wraps its dots above the labels (pre-existing).

### Wave 4 · library & foundry (2026-10-08)

**Shipped.**
- Library assets: the gallery draws 24 tiles at a time (`useWindow` + auto `Pager`, reset on folder or search). Upload bytes are read and minted as blob URLs only for rows on screen (`useUploadSrcs`: the window, the open plate and its strip), and revoked when they leave: 47 plates showed 24 blob images, 40 after one page. The Styles tab no longer reads any upload's bytes; adding files updates the list in place instead of reloading (which re-read every promoted proof's theme).
- Library: a search box (name, folder, style, brief, file name) with `/` to focus and Esc to clear, and an empty state that names the query with "clear search"; "select all N" selects only drawn tiles, so a bulk remove never reaches a plate not on screen; Home/End in the plate viewer; the tab and the assets folder are remembered (`?style=` still wins).
- Audio ledger: 50 rows per group, then a `Pager`; the window stretches to the selected take so `j`/`k` and a new take land on a drawn row. The References tab is `next/dynamic` and the decoder loads on the first file dropped.
- `listAssetsFor(uid, projectId)` (cursor over the account's uid index, filtered as it goes) feeds the outputs shelf's kept index, which used to materialise every asset on the account. It is also more correct: the index is keyed by output id, so a same-id output kept in another project no longer marks this one kept.
- Foundry: the extract board shows each replica's last round, earlier rounds in one remembered `Fold` per row; style rows windowed by 6; the engine log, once only its last line, is a `Fold` newest-first paged by 40; cull tiles are memoised so a K/X or arrow re-renders 1–2 tiles, not the sheet; kept plates and ledger rows on the style document are paged.
- Foundry: N jumps to the next undecided item in cull, extract and dojo (`nextUndecided`, probe-held); the tab, the open extraction (reopens paused with resume in place), the run shape and the family filter are remembered. Three private typing guards replaced by the shared one.

**Proposals (not built).**
- Undo in place of an immediate permanent remove on the shelf (soft delete in `lib/assets`).
- An `assets.meta.projectId` index the next time `lib/studioDb.ts` bumps its version for another reason; then `listAssetsFor` becomes a keyed read.
- Memoised ledger rows (needs stable handlers first); "keep the whole scene" bulk cull; opt-in auto-advance after K/X (changes keys the probes pin).

### Wave 5 · workbench (2026-10-08)

**Shipped.**
- `/articles/[runId]`: the printed wall became levels. At the gate a summary row counts check fails, not-measured items, blockers the writer did not accept, unanswered findings and picked patches, each linked to its section; draft, outline (never shown before, now verbatim), critique, check, sources and patches are `Fold`s that open themselves when they hold a decision. Check passes and loop history fold away; reviewers fold to "completed of N" and open on a failure; findings fold per lens with blocker/unanswered counts. The refused-patches `Hint` (app narration) is deleted, its reason kept as a comment.
- `/articles`: 30 runs at a time; the count chips are filters (gate, running, stopped, done) and the filter is remembered. `/articles/new` remembers kind, bundle, model and effort while each is offered; Ctrl/⌘+Enter starts the run.
- `/calendar`: `[`/`]` (and ←/→ in the grid) change week, T this week, N the next slot needing a decision, Esc closes a slot; the last channel and the metrics sort are remembered. The week's days and stacks are memoised per schedule so a drag no longer re-buckets the week; metrics rows paged by 25 and memoised off the 30 s clock; export posters are grabbed near the viewport, two at a time, instead of every export downloading its video at first paint. Held by `workbench-keys.probe.spec.ts`.
- `/kit` Parts: 32 group `Fold`s (remembered) whose specimens mount on open, 0 of 115 at first paint; search with `/` and Esc; open/close all; `#g-` deep links open then scroll. The ContextMenu specimen no longer mounts open and steals focus.
- `/board`: roll totals computed once per load instead of per render per key; J/K and the loupe's arrows grow the 48-frame window to the selected frame and scroll it in; select-all, select-roll and Shift-ranges take drawn frames only; an empty sheet under All sources links to /projects.
- `/playground`: triage queue and judged list paged by 30 and stretching to the open take; `Strengths` is `next/dynamic`; hunt's per-node take lookup built once, `LeafCard` and `MiniMap` memoised (a marquee drag or a keystroke no longer re-renders every card or rebuilds every thumbnail); arrange moves the drag ghost directly. Z undoes the last verdict (probe-held), a held key files one judgement, keys pause under a dialog.

**Proposals (not built).**
- Undo instead of the cancel confirm on a calendar slot (un-cancel in `lib/publish`); J/K between findings on a run; "pick all patches".
- Shift+J/K to extend a board batch (needs `lib/board/keys.ts` to tell Shift apart); memoised board `Frame` cells and arrange `Card`s (need stable handlers); the board's per-roll "N more" onto `Pager`.
- Triage N as "next unjudged" like the foundry's; Shift+X reject without a defect; J/K between hunt leaves.
- The kit search field has no visible border until focused (the `k-ctl` skin).

### Wave 6 · integration (2026-10-08)

**Shipped.**
- Research expert board, card detail on demand (the Wave 2 proposal): a card shows its chips, the claim verbatim and any work warning ("load-bearing at low confidence — needs a second source…"); the fact's note (corrections, follow-ups), the pattern, "wrong if", sources with evidence class and locator, and the source line open per card (a `Details` control beside like/deepen, outside the scope overlay, `aria-expanded`) or board-wide with a remembered `details` switch. Measured at 1600px on the fixture: 10364px → 6344px with details off, 10341px with every card open, so nothing was removed, only moved one level down.

**Measured.** Every gate in `npm run verify` passes except `probes`, whose only failures are the ten that also fail on the untouched base in this container (`hint-tap` ×4 and the `articles-checks` rendered case: the Playwright build expects a Chromium this image lacks; `articles-critique`/`-engine`/`-ui` ×5: git push and PR steps). Passing probes 1817 → 1832.

**Proposals (not built).**
- J/K card focus on the triage board with a key to expand the focused card (the board has no card focus today); a two-row layout for the seven-card Conclusions column (~1500px more).
- Context map: the 15 new files all sit in directories existing contexts own (DRIFT none), but the map carries 18 stale paths that predate this branch; it needs a delta scan on the machine that owns it (project `d57f858b`).
