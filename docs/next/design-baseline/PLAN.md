# The design baseline - implementation plan for the whole studio

Written 2026-11-17 for a later session to follow end to end. It turns the owner's contest verdict into the app's
default look on every route of `app/(studio)/`, removes the design switch, and leaves `@gt/ui` and its tokens as the
standard every future screen is built from.

> Owner, 2026-11-17: "Lets use X1 as baseline for navigation and layout. Y2 for page and sections background and
> gradients, as its general style theme looks better. Then prepare implementation plan with full app coverage, which
> another session will take and follow"

Read this whole file before the first edit. Then read `CLAUDE.md`, `AGENTS.md`, `.claude/spark/config.md`
(`## Gates`, `## Repo law`), and the contest skill's `references/promotion.md` and `references/port-quality.md`
(`C:\Users\kazda\kiro\ai-registry\skills\contest\references\`).

---

## 0. Where everything is

| What | Where |
|---|---|
| The contest (brief, seats, verdict) | `.contest/arena/app-design-baseline/` (`BRIEF.md`, `contest.json` - `combined: [X/1, Y/2]`) |
| Every design's notes + 15 screenshots each (make, package, package-ep, release, floor at 1366 / 1920 / 2560) | `.contest/arena/app-design-baseline/archive/<X\|Y>-<n>/` - **open X-1 and Y-2 first** |
| The vault record | `.contest/Contest/contests/app-design-baseline.md`, `Patterns.md` (`navigation-is-one-tree`, `state-as-light-on-glass`) |
| **X1 "Spine"** - navigation and layout | branch `contest/app-design-baseline-x` @ `65686066`; `app/(studio)/_design/d1/`, shared `_design/{design,server,context,nav,DesignHeader,DeskNav}.ts(x)`, `_design/parts/`, `packages/ui/src/designs/d1/`, token mode `design-1` in `packages/ui/tokens/source.json`, `SectionGlyph` |
| **Y2 "Aperture"** - grounds, gradients, style theme | branch `contest/app-design-baseline-y` @ `9c6b5a7d`; `app/(studio)/_design/aperture/`, `_design/themes.css` (the `design-aperture` token block), token group `design-aperture` in `source.json`, the room light in `aperture/Packaging.tsx`, `Button size="lg" solid` |
| Y's shared, design-free parts worth keeping | `_design/nav.ts` (one navigation model from the address), `_design/stage/walk.ts` (Focus's walk without its markup), `_design/stage/leadView.ts`, `_design/talk/Composer.tsx` |
| The base everything starts from | `main` at or after `569857d9` (Focus is the package stage) |

`.contest/` is gitignored: the arena, the archive and the vault exist on the owner's machine only. **The two contest
branches are the durable source** (local, not pushed); on another machine, read the designs from them and ask the
owner for the archive's screenshots.

To run a reference design side by side while you port (both branches stay until §7). On the owner's machine the
worktrees already exist with dependencies installed - `C:/t/ct-x` and `C:/t/ct-y` - so start there; elsewhere:

```bash
git worktree add C:/t/ct-x contest/app-design-baseline-x   # then npm ci there (~8 min)
git worktree add C:/t/ct-y contest/app-design-baseline-y
# each: temp stores, GRAVITONE_DRY_ONLY=1, NEXT_PUBLIC_DEV_AUTH=1, NEXT_DIST_DIR=.next-ref, next dev -p 3201 / 3202
# X1:  http://localhost:3201/audio?s=studio&source=fixture&session=night-drive&stage=package&r=rel-0000000000a1&design=1
# Y2:  http://localhost:3202/audio?s=studio&source=fixture&session=night-drive&stage=package&r=rel-0000000000a1&design=2
```

---

## 1. The fused design - what to build (the spec)

The verdict splits by concern. **Structure comes from X1, material and theme from Y2.** Where the two disagree, the
row below is the ruling; each is the plan's reading of the owner's split and may be overruled by the owner.

### 1a. Navigation and layout (X1 "Spine")

- **One navigation tree in one column at the left edge; no rows above the work.** The app header, the audio desk's tab
  rail and the studio's stage rail are retired as rows.
  - **Spine** (narrow, ~84 px): the app's sections, a `SectionGlyph` over each name; the current section is a lifted
    key with an accent bar. Its foot holds what the header's right side held: the dev-auth pill, the 24 h spend
    readout, Kit, Sign out.
  - **Context column** (~200 px at 1366, wider at 2560) beside the spine, only on a route that has rooms: the route's
    rooms (the audio desk's ten sections with their tallies as quiet mono numbers), and under the current room its
    stages as a numbered descent (`compose` -> 1 Make, 2 Package, 3 Release). Same row shape, same "here" mark at
    every level; the mark glides between rows (`motion` `layoutId`; stiffness 520, damping 42; zero under reduced
    motion).
  - A route with no rooms (the Floor today) draws the spine only and the work takes the rest.
  - App > room > stage > step reads as one tree. The package stage's seven steps are drawn with the same row (Focus's
    rail already is one column - it adopts the row shape).
- **Make reaches Package and Release directly** (the stages are always in the tree; today make has no stage rail).
- **Width:**
  - spine and context column fixed; the work takes the rest with a fluid gutter (`--gutter`, ~16-44 px);
  - make: versions | answers | next steps, the side column growing to ~1.4x at 2560;
  - package / release: **from ~1900 px the step body is two columns - the lead (sticky) left, the read right**, and
    the read splits into as many columns as `--w-read-col` allows; under 1900 the lead sits above the read (Focus);
  - **from ~2400 px type and spacing step up ~12 %** (clamped tokens), so 2560 is not a 1366 layout in a dark field.
- **The conversation input is a composer along the foot of the work column** (not the window): the listening mark and
  the agent's last line on one row (the full line is the card above), the verdict tray (grouped toggles), and the line
  in with **Send inside it**; at 2560 the verdict tray and the line in share one row. In package / release, folded,
  it is the agent's line and the line in; the verdict waits in the open conversation (see risk R6).

### 1b. Material, grounds and theme (Y2 "Aperture")

- **Ground:** a deep near-black (`aperture-ground #05060a`) that light falls into. **State is light**: the stage's
  ground takes the hue of what the step leads with (rose blocked, violet agent, amber warn, emerald ready), a soft
  radial wash cross-fading over ~0.7 s when the lead's kind changes (`data-kind`); a release with a sleeve glows with
  its art out of focus behind the stage (`aperture-haze`). Routes outside the studio get the ground and a quiet,
  state-free light (one neutral wash) - see 3.
- **Glass surfaces** for panels, the spine, the context column and the composer: white at ~4.2 % (`aperture-glass`),
  a 12 % rim, a 9 % top shine, a long cast, `blur(28px) saturate(1.3)` behind it; ~8.5 % under the pointer.
- **Opaque where read closely** (`aperture-raise`): fields, native lists, menus, anything over moving light.
- **The lead carries no tinted fill** - the room is the tint; only the lead's top edge takes the hue. (Ruling: X1's
  "one lifted tinted plate" is replaced by Y2's "never tint a panel as well as the room".)
- **Type:** one grotesque for UI and display (Hanken Grotesk; display sizes light 300, tracking -0.03 em; interface
  sizes 500-600), JetBrains Mono for data and short labels. No serif. (Ruling: Y2's faces over X1's single sans.)
- **Controls are capsules** (`r-pill`); **the primary act is the only solid control** on a screen (`Button solid`),
  and in the composer the Send.
- **Accent and signal hues:** Y2's. Accent means "here" or "act now"; rose / amber / emerald / violet stay on small
  marks and in the room's light.
- **Motion** (austerity rules of `/prototype`): entrances once, click- or change-gated transitions, the room light's
  cross-fade, the "here" glide; nothing loops; everything stops under reduced motion.

### 1c. Rules a later screen follows (the practices both notes agreed on, merged)

1. Navigation is one tree in one column; a level never invents its own row or mark.
2. One thing per screen is the lead (Focus); state is said by the room's light first and small marks second.
3. Glass for surfaces, opaque for what is read closely; text quieter by ink and size, never by alpha (4.5:1 holds).
4. A value is read in a quiet list; its edit and every explanation open on click (the dialog).
5. Wells for what you type or read off, capsules for what you press; one solid control per screen.
6. Past ~1900 px the lead sits beside the read; past ~2400 px the type tokens step up.
7. A row of text is one line; the full text lives in one place on the page, never twice.

---

## 2. How the switch becomes the default (architecture of the port)

Both seats layered their designs on the base behind `?design=` (X: `skin(base, d1, d2, d3)` per component + token
**modes**; Y: `themes.css` re-valuing tokens under `:has([data-design])` + per-design shells). **Copy neither
mechanism.** The port is a rebuild (contest `references/port-quality.md` Q0-Q5):

- **No switch, no cookie, no `proxy.ts`, no `skin()`, no `[data-design]` selectors.** The winner's rules become the
  base stylesheets of the components they style; the old rules they replace are deleted in the same change.
- **Tokens:** admit the new roles in `packages/ui/tokens/source.json` (with their roles in `ADMISSION.md`), re-value
  the existing roles the fused design changes (the ink ramp, panel ground, radii, faces, accent), run
  `npm run tokens:gen`. No token "modes" - there is one design. Retire any role left with no consumer
  (`tokens:check` and a grep say which).
- **Navigation model:** one pure function from the address to the tree (start from Y's `_design/nav.ts` or X's
  `_design/nav.ts` - read both, keep one): sections, the open section's rooms, the open room's stages / kinds. A page
  hands the shell only what the address cannot say (its rooms' tallies), through one typed slot - no portal
  "into slot" hacks (X2/X3's `IntoSlot` painted after first paint; avoid it).
- **Fonts:** `app/layout.tsx` already loads Hanken Grotesk, JetBrains Mono and Instrument Serif through `next/font`
  with the variables `--font-hanken`, `--font-jetbrains`, `--font-instrument`. Point the face tokens at those
  variables (`var(--font-hanken), <fallbacks>`); never name a face by its registered family string (Y's tokens did -
  a build that hashes the family falls back). Drop Instrument Serif from the layout if no consumer survives P5.
- **Glass performance:** `backdrop-filter` is expensive over large areas - budget it (R3).
- **What stays:** the session/port contracts, Focus's logic (`dock/focus/lead.ts`, the dialogs), the conversation's
  host logic; only their presentation changes.

---

## 3. Full app coverage - every route, what it becomes

The legibility lane and `pipeline/cx-capture.mjs` walk `pipeline/cx-screens.mjs`; **every row below must have its
screen ids there** (add the missing ones in §4 P0) and every id is captured at 1366, 1920 and 2560 at the end of its
phase. "Context column" lists the rooms the route shows beside the spine; *verify* means the session confirms the
route's real structure before building.

| Route (`app/(studio)/...`) | Context column (rooms > stages) | What changes beyond the shell | Screen ids (today) |
|---|---|---|---|
| `/audio` compose (studio) | the ten desk sections; under compose: Make / Package / Release | the reference surface (§4 P3): composer, make columns, Focus in package/release, room light + sleeve glow | `audio`, `audio-suno`, `audio-package`, `audio-release-stage` |
| `/audio` arrange, cover, hunt, lessons, strengths, rubric, batch, song lab, release (catalog) | same desk column; kind (music / sfx) as the room's own small switch, not a row | each section's panels onto glass / raise; tab rails inside sections become the tree or a `Seg` | `audio-arrange*`, `audio-effects`, `audio-hunt*`, `audio-lessons`, `audio-strengths`, `audio-rubric`, `audio-batch*`, `audio-cover*`, `audio-songlab*`, `audio-release`, `audio-release-open` |
| `/floor` | none (spine only) - *verify* whether the Floor's lanes (Foundry / Weir / Library / Calendar) want a context column | lanes and piles on glass, the Weir's band keeps its own colour logic | `floor`, `floor-calendar`, `floor-slot`, `floor-schedule` |
| `/board`, `/board/[packet]`, `@sheet/(.)board/[packet]` | packet sources as rooms (*verify*) | the Board sheet becomes the dialog / sheet look; cull grid on glass | `board`, `board-sheet`, `board-scout` |
| `/ledger` | ledger sources (*verify*) | the table on raise, rows as one line | `ledger` |
| `/projects`, `/projects/new`, `/projects/import`, `/projects/runs` | Projects: list, Runs, New, Import | the new-project wizard steps become the tree's stages | `projects`, `projects-empty`, `wizard-*`, `runs` |
| `/projects/[id]`, `/projects/[id]/[part]` | the project's parts as rooms; a part's editor tabs as stages | every part editor (notebook, document, beats, trailer, frames, motion, score, cut, explainer) onto the new surfaces | `part-*` (19 ids) |
| `/studio/[projectId]` | the studio's steps (research, script, frames, motion, score, cut, outputs) as stages | *verify* overlap with `/projects/[id]` before designing twice | `studio-*` (7 ids) |
| `/library`, `/library/style/[id]` | library kinds (styles, characters, genres, ventures, models, ...) | the densest surface: tiles on glass, detail in the dialog | `library*` (7 ids) |
| `/scout`, `/scout/runs`, `/scout/runs/[packet]`, `/scout/productions`, `/scout/ventures` | Scout: runs, productions, ventures | storyboards and reels on glass | `scout`, `scout-runs` (**add** productions, ventures, a packet) |
| `/articles`, `/articles/new`, `/articles/[runId]` | Articles: list, new | *verify* the [runId] redirect to the Board | **add** ids |
| `/kit` | kit sections (`kit/sections.ts`) as rooms | every specimen re-shot; new components get specimens (§4 P2) | `kit`, `kit-*` |
| `/local-draws` | *verify* | | **add** an id |
| `/foundry`, `/playground`, `/calendar` | none - each is a `redirect.ts` (to `/floor`, the audio desk / hunt, the Floor's calendar); nothing to restyle | | |
| `error.tsx`, `not-found.tsx`, `loading.tsx` frames (`_shell/frames/*Frame.tsx`) | spine only | the loading frames must match the new shell exactly (no jump when the page lands) | |
| Out of scope | the public landing (`app/page.tsx`, `app/_landing/`) keeps its own system; `app/_dev-inspector/` is dev tooling | | `landing` |

---

## 4. Phases (each lands on `main` green before the next starts)

Work in a worktree per phase (`.claude/spark/config.md` `## Gates` `worktree` recipe: `git worktree add C:/t/<id>`
then `npm ci`). Commit on the branch, ff-merge to local `main`, **never push**. Parallel builders only on disjoint
files; the Director owns `source.json`, `tsconfig.json`, `pipeline/cx-screens.mjs`, `tests/live/legibility-baseline.json`,
`pipeline/bundle-budget.json` and `tests/mutants*/registry.ts`.

### P0 - Inventory and harness (one session, no visual change)

1. Fill §3's *verify* cells from the code; add the missing screen ids to `pipeline/cx-screens.mjs` (fixture side
   where the route has one).
2. Capture **before** shots of every id at 1366 / 1920 / 2560 into `.contest/arena/app-design-baseline/before/`.
3. Run the contest's fidelity capture on the two references (`promotion.md` steps 1-2): name the roles the owner's
   words point at - from X1: the spine, the context column, the "here" mark, the stage descent, the composer's
   placement, the two-column step past 1900 px; from Y2: the ground, the room light per `data-kind`, the glass panel
   (fill, rim, shine, cast, blur), the raise, the lead's edge, the capsule, the solid primary, the display type -
   and `python <skill>/scripts/style-contract.py capture <reference> roles.json contract.json` for each. These
   contracts are the acceptance bar for P1-P3.
4. Q0 inventory (`port-quality.md`): list the duplicates and dead code in both references before porting any of it.

### P1 - Tokens, faces and material primitives (the global flip, part 1)

- Admit the roles (`source.json` + `ADMISSION.md`, `tokens:gen`): ground ramp, glass / glass-hi / rim / shine / cast /
  frost / haze, raise / lift, room-light hues, `r-pill`, `gutter`, `w-spine`, `w-context`, `w-read-col`, `fs-display`
  and the 2400 px step-up clamps, the composer's height, the faces (from `next/font` variables).
- Re-value the existing ink ramp and panel ground to the fused design so **every route already reads in the new
  material** before any route is touched (Y showed this works: its Floor converted with no Floor file edited).
- `@gt/ui` primitives with `/kit` specimens: `Surface` (glass / raise / well variants), `RoomLight` (the ground wash
  by `data-kind`, the sleeve glow), `Button size="lg"` + `solid`, capsule radii on `Button`, `Chip`, `Tally`,
  `Toggle`, `Seg`.
- Gates + legibility lane on **every** screen id (the flip touches them all); re-seed only with evidence.

### P2 - The shell (the global flip, part 2)

- `@gt/ui` components with specimens: `SectionGlyph` (from X), `NavTree` / `NavRow` (the one row shape and the gliding
  "here" mark), `AppSpine`, `ContextColumn`, `SpendReadout`, `Composer` (X1's structure in Y2's material; replaces
  the kit `Dock` for the studio), `Dialog` (promote `audio/studio/_package/dock/_kit/Dialog.tsx`).
- `app/(studio)/layout.tsx` + `_shell/`: the spine replaces `StudioHeader` / `HeaderBar`; the navigation model (§2)
  feeds the spine and the context column; the jump dialog (⌘K), the key sheet (⌘/), the agent nav
  (`AgentNav.tsx`, `agentNav.ts`), the bell / live feed and the spend slot keep working - **drive each**.
- The loading frames (`_shell/frames/`) match the new shell.
- Delete `TabRail` usages that are now the tree; keep `TabRail` only where it is a real in-page switch (or retire it).
- Acceptance: fidelity contract for the shell roles at 0 deviations (`style-contract.py check`), every route renders
  with the spine, no horizontal scroll at 1366, keyboard reaches every place, legibility lane green.

### P3 - The audio studio (the reference surface; the owner reviews this phase before P4 starts)

- `audio/page.tsx`: the desk's sections become the context column (tallies kept).
- Make (`studio/_host`, `studio/_view`): versions | answers | next steps by width; the composer at the work's foot.
- Package / release (`studio/_package/dock/focus/`): the lead beside the read past 1900 px, the room light from the
  lead's kind, the sleeve glow, the composer folded; the dock's "conversation" toggle and grip become the composer's.
- The release catalog (`audio/_release/catalog`) and the wizard's remaining stop-gaps (picker, `StepSleeve`, `Splits`,
  `StepExtras`, `Shelf`) restyled to the new surfaces - the dialogs must not show the old look any more.
- Acceptance: the fidelity contract for every named role at 0 deviations; the interactions the owner named driven in
  a browser (accept a suggestion and watch the light change, open a dialog, fold / open the conversation, send from
  the composer, move between stages from make); 1366 / 1920 / 2560 shots next to X1's and Y2's archive shots.
  **Stop and show the owner.**

### P4 - Every other route (parallel, one builder per row group of §3)

Groups, disjoint by files: (a) the other audio sections; (b) Floor + Board + Ledger; (c) Projects + part editors +
`/studio/[projectId]`; (d) Library + Scout + Articles + Kit + Local draws. Each builder: its routes onto the shell's
context column, its panels onto `Surface`, its explanations behind the dialog, its own tab rows into the tree, its
legibility ids green, its 3-width shots opened and fixed. No new token, no new shared component without asking the
Director (who adds it once to `@gt/ui` with a specimen).

### P5 - Delete the old, prove the whole

- Remove dead components and CSS (the header bar, the retired rows, the kit `Dock` if unused, the old wizard pieces
  Focus no longer reaches); `npm run next-structure`, `lint:ratchet` and a dead-code grep.
- `INVENTORY.md`, `/kit`, `CLAUDE.md` "Where things live", `docs/` updated; the bundle budgets re-measured and raised
  only with a reason (`pipeline/bundle-budget.json`).
- Full gates (§5), `npm test`, `npm run test:live` (on the base and the branch, diff the failure lists), the
  legibility baseline re-seeded with every new entry justified.
- After the owner's acceptance: `git worktree remove` the reference worktrees, delete the contest branches, run the
  contest's `wrap` for the family (`node <skill>/scripts/contest.mjs wrap --id app-design-baseline` - its instrument
  state is the hand-written `contest.json`; if `wrap` refuses it, archive by hand: the archive folder already holds
  every variant's notes and screenshots).

---

## 5. Gates (every phase, on the branch, before the merge)

`npm run typecheck`, `npm run lint:ratchet`, `npm run tokens:check`, `npm run check:narration`, `npm run next-structure`,
`npm run test:unit`, `npm test` (golden path - after the commit, the probes walk tracked files), `npm run build` +
`npm run check:bundle` (`NEXT_DIST_DIR=.next-<name>`), the legibility lane for every touched screen id
(`LEGIBILITY_SCREENS=...`; `LEGIBILITY_UPDATE=1 LEGIBILITY_SEED=1` only with a reason), the fidelity contract
(`style-contract.py check`) at 0 deviations for P1-P3, and **opened screenshots** at 1366 / 1920 / 2560.
Store isolation always (`GRAVITONE_STORE_PATH`, `SOUND_STORE_DIR`, `SOUND_LEDGER_PATH` to temp; `GRAVITONE_DRY_ONLY=1`).
Known inherited red: `tests/golden-path/runs-live.probe.spec.ts` (suno source) fails on base - compare, don't fix
silently.

Traps this repo has already measured (from `.claude/spark/config.md` and the last sparks - put them in every brief):
- a client island must not import a Server Action file by value (client-closure); pass actions as props or `import()`;
- every `localStorage.setItem` needs a row on the owner's lists (`lib/identityEviction.ts`, identity-and-writes probe);
- a new `app/**/use*.ts(x)` hook needs `hook-coverage` coverage;
- a dashed border carries state and must hold 3:1; `color-mix(in oklch, X, transparent)` tints maroon in Chrome - mix
  `in srgb` or `in oklab`;
- the studio view and the wizard used window-width breakpoints - use container queries in everything you touch;
- `next dev` rewrites `tsconfig.json` and `AGENTS.md`: the Director reverts them before each commit;
- worktree files are CRLF; scripted edits detect the newline first.

---

## 6. Risks

| # | Risk | Handling |
|---|---|---|
| R1 | Glass over light drops text below 4.5:1 on some hue | the legibility lane measures every id; text on glass uses `--text` / `--ink-bright`, never alpha; raise under small text |
| R2 | The global flip (P1-P2) changes every route at once | P1 re-values tokens so untouched routes stay coherent; the full legibility lane runs at P1 and P2, not only at the end |
| R3 | `backdrop-filter` cost (Y used it on the bar, panels and island) | budget: at most N blurred surfaces per screen (count them in a probe), none over scrolling lists; measure a 2560 scroll |
| R4 | Fonts fall back in a production build | `next/font`, tokens from its variables; check the computed `font-family` on a `next build` run, not only `next dev` |
| R5 | Navigation model drift (three readers of the address today) | one function, unit-tested over every route's address; the spine, the context column and the jump dialog all read it |
| R6 | The folded composer hides the verdict tray in package / release (both seats did) | confirm with the owner in P3; if kept, the verdict stays one press away and the fold says so with a count, not a sentence |
| R7 | The keymap and jump dialog assume the old header | drive ⌘K, ⌘/ and every key of the studio and Floor in P2 |
| R8 | Bundle growth from `motion` layout animations in the shell | the shell's motion is one `layoutId` glide; measure `check:bundle` at P2 |
| R9 | The context map (Personas) goes stale with every moved file | per CLAUDE.md, only the owning machine scans; append the drift to `.vault/map-drift.md` or ask the owner |

---

## 7. Done means

- Every route in §3 renders in the fused design at 1366 / 1920 / 2560, with its screen ids captured and opened.
- No `?design`, no cookie, no `proxy.ts` for designs, no `skin()`, no `[data-design]`, no token modes; the contest
  branches deleted after the owner's acceptance.
- `@gt/ui` holds every shared piece with a `/kit` specimen; `INVENTORY.md` and `ADMISSION.md` describe them.
- Gates green; the fidelity contract at 0 deviations for the roles in P0.3; the legibility baseline justified.
- The contest family wrapped; the vault's contest note links the merged commits.
