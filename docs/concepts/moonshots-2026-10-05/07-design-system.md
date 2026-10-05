# Moonshot cards · Design System

_Part of [the 2026-10-05 moonshot backlog](README.md). Each card is one dispatchable session; start from its **First session dispatch**._

## ui-shell

### UI-SHELL-A · Roles, not worlds: delete every `almanac ?` branch and theme by binding only

**Context:** ui-shell · **Slot:** A architecture
**Size:** XL · **Effort:** 8/10 · **Impact:** 9/10 · **Risk:** 7/10 · **Gate:** direction
**Registry:** software-engineering/design-tokens#theme-architecture (also #token-taxonomy)

**Summary.** The app has two worlds drawn three ways: Obsidian Tailwind utilities, Almanac `k-*` classes, and the Obsidian-kit variable remap. Every shared part picks between them with `useWorld() === "almanac"` and a forked className. This card makes the world a set of role-token bindings and nothing else, so a component never asks which world it is in. It adopts the shipped `cardModel` dedupe (ef45fce) and goes much further: that commit deduplicated one card's logic, while this removes the skin fork from all ~78 branch sites and makes a third world cost one binding table.

**Premise (verified).**
- `components/ui/tokens.ts:335`: `tokensCss()` already emits three scopes: `:root`, `[data-world="almanac"]` and `[data-world="obsidian"]`. `WORLD_OBSIDIAN_KIT` (`tokens.ts:283`) shows that Obsidian can be expressed entirely as `var(--gt-*)` rebinds of the same `--al-*` names. The binding mechanism exists, but components do not use it.
- `components/ui/world.tsx:23`: `useWorld()` is read 20 times under `components/`. About 78 `almanac ?` / `if (almanac)` conditionals sit in `components/ui`: Field 15, Deck 7, signal 14, Modal 4, StudioFrame 3, and so on. `components/ui/deck/DeckCardAlmanac.tsx` is still a whole second skin file, even after the cardModel extraction.
- Parts that never branch draw Obsidian inside Almanac: `components/ui/signal/StaleBadge.tsx:53` and `Provenance.tsx:56` hard-wire `TALLY_TONE`, and `Keycaps.tsx:59` hard-wires `border-white/20 … text-white/85`. Inside a `<Tally>`, which does branch (`Tally.tsx:93`), the same page therefore mixes two chip spellings.
- `components/kit/kit.css:21` says kit rules reach "the root of a portalled Modal". But `components/ui/Modal.tsx:226-229` stamps `data-world` on the portal only for Almanac. A Modal or ConfirmDialog opened under `WorldRoot world="obsidian"` (Foundry, Calendar, AudioWorkbench) portals to `<body>` with no world, so `.k-confirm`/`.k-acts` (`kit.css:466-467`) resolve outside their scope. The same class of drift already shipped once: ffaf025, "forms.css scoped its 13 toast rules to almanac only … rendered unstyled".
- The registry's theme-architecture technique states the absolute rule: "components never branch on the theme's identity … push the decision up into the binding set." Every fork above deviates from it.

**The move.** Stage 1 (zero pixels): add `ROLE_TOKENS` to `tokens.ts`. It is a closed role vocabulary (`--r-ground`, `--r-ink`, `--r-ink-2`, `--r-rule`, `--r-rule-strong`, `--r-accent`, `--r-pick`, `--r-error`, `--r-warn`, `--r-focus`, `--r-chip-bg`, …), bound once in each of the three scopes and referencing only existing `--gt-*`/`--al-*` values. Stage 2: rewrite `signal/*`, `Primitives.Button`, `Field`, `Modal`, `NotificationBell` and `UserMenu` to draw from roles through one `kit.css`-style class set (`.r-chip`, `.r-tab`, `.r-ctl`, …). Delete the visual `useWorld()` reads. `Modal` keeps the context only to re-stamp `data-world={world}` on its portal for every world. Stage 3 (the direction call): the structural forks (`DeckCardAlmanac` vs `DeckCard`, StudioFrame's `Bar` vs nav at `StudioFrame.tsx:102`) are not themes. The operator picks one structure for each, and the loser is deleted. Stage 4: a ratchet probe holds `useWorld()` readers at 1 (Modal) and requires every role to be bound in every scope.

**Why it is a moonshot / what it unlocks.** The Almanac redesign was meant to "land one surface at a time" (`tokens.ts:219-222`). Today each surface migration also forks every part it touches. After this card, migrating a route means changing one attribute. A light, high-contrast or per-project world becomes one binding table that the role-completeness probe checks. Builders stop having to remember that StaleBadge and Keycaps ignore the world. The /kit specimen and the contrast numbers become valid for every world at once (see KIT-B).

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. Every key of `ROLE_TOKENS` is bound in `:root`, `[data-world="almanac"]` and `[data-world="obsidian"]` → missing list `[]`.
2. `<Tally tone="amber" value={2}/>` rendered (via `renderToStaticMarkup`) under `WorldProvider` almanac and under obsidian → identical className strings.
3. Markup of StaleBadge, Provenance, Keycaps, Ghost, BandTrack, PipRow and UpstreamBreak contains no Tailwind colour utility (`/(text|bg|border)-(white|cyan|rose|amber|emerald)/`) → 0 matches.
4. A Modal opened inside `WorldRoot world="obsidian"` → its portal root carries `data-world="obsidian"`. Today it carries none.
5. Files calling `useWorld()` under `components/` → exactly `["components/ui/Modal.tsx"]` at the end of stage 2, and ratcheted from the measured 20 at stage 1.
6. Stage 1 `pipeline/cx-capture.mjs` PNGs for `projects`, `library-styles` and `foundry` before and after → no visible change, confirmed by opening the PNGs (repo law).

**Write set.** Staged XL. S1: `components/ui/tokens.ts`, new `components/ui/roles.css`, new `tests/golden-path/role-completeness.probe.spec.ts`. S2: `components/ui/signal/{Tally,Hint,TabRail,StackBar,StaleBadge,Provenance,Keycaps,Ghost,BandTrack,PipRow,UpstreamBreak}.tsx`, `components/ui/{Primitives,Field,Modal}.tsx`. S3: `components/ui/deck/{Deck,DeckCard,DeckCardAlmanac,StageRail}.tsx`, `components/ui/StudioFrame.tsx`. S4: `components/kit/kit.css`, `forms.css` (selectors narrowed to roles), the ratchet probe.

**Risks & rollback.** Obsidian pixels can shift wherever a Tailwind alpha (`/[0.07]`) has no exact role equivalent. Stage 1 is designed to be pixel-identical, and each stage is a separate revertable commit. The direction call in stage 3 can be deferred indefinitely without blocking stages 1, 2 and 4.

**First session dispatch.**
Read `components/ui/tokens.ts` (all of it), `components/ui/world.tsx`, `components/kit/kit.css:1-40`, and the registry technique `design-tokens/techniques/theme-architecture.md`.
Build stage 1 only: `ROLE_TOKENS` plus the three bindings, and the role-completeness probe, red first, then green.
Then convert `StaleBadge`, `Provenance` and `Tally` to roles as the pilot, and photograph `/foundry` and `/kit` with `pipeline/cx-capture.mjs`.
Gates: `npm run typecheck`, `npm test` (tests/golden-path), `npm run check:narration`.

_Runner-up:_ The shell becomes a `ShellModel` (modules, active place, local/dev-auth posture) that both StudioFrame skins render, ending the duplicated nav and dev-banner branches.

### UI-SHELL-B · Go anywhere from anywhere: a shell palette over projects, steps, decisions

**Context:** ui-shell · **Slot:** B experience
**Size:** L · **Effort:** 6/10 · **Impact:** 8/10 · **Risk:** 4/10 · **Gate:** direction
**Registry:** software-engineering/app-shell#shell-hosted-services (also #navigation-model)

**Summary.** Today, reaching "Glass Harbor, Score step" or "the 12 decisions waiting on the Board" means landing on /projects, finding the row, opening the studio and picking a tab. Below `md` widths the shell has no navigation at all. This card adds a shell-resident palette (Ctrl/⌘K, plus a visible button on narrow screens). Its index is derived from stores the app already has, and opening it turns the shell from a link row into the place you act from.

**Premise (verified).**
- `components/ui/StudioFrame.tsx:35-58`: `MODULES` (six links) is the app's only navigation. `StudioFrame.tsx:177` renders it `hidden … md:flex`, with no small-screen alternative anywhere in the file.
- No palette or global jump exists: grepping `app/` and `components/` for `CommandPalette|cmdk|key === "k"` finds nothing. Every Ctrl/⌘ check in the tree is a local guard.
- Deep links already exist as a vocabulary. `lib/jobLinks.ts:19` `studioHref(projectId, step)` is the one spelling of `/studio/<id>?step=<step>`, and `pipeline/cx-capture.mjs:43-59` reaches every studio step by URL.
- The facts to index are already in hooks: `lib/useProjects.ts:79` (projects), `lib/useAssets.ts:144` (library assets), `lib/board/registry.ts:60` plus `source.ts:80` `SOURCE_ORDER` (8 decision sources with counts), and `useJobs` (running work, read by `NotificationBell.tsx`).
- Every route binds its own keys and draws its own `<Keycaps>` (19 files add a window `keydown` listener). No surface can say what is bound right now.

**The move.** New `components/ui/shell/` folder: `palette.ts` holds a pure `paletteIndex({projects, assets, boardCounts, jobs, commands}) → Entry[]` with a typed `Entry = {kind: "place"|"project-step"|"decision"|"job"|"command", label, href|run, facts: Tally[]}` and a pure fuzzy ranker. `Palette.tsx` is a combobox dialog built on `Modal`, with `role="combobox"`/`listbox` and roving selection, and its entry facts drawn as `<Tally>`, never as prose. A `useShellCommands()` registry lets a mounted route contribute verbs ("New project", "Commit cull", "Next undecided"). These verbs come from the keymap registry in SIGNAL-A when it lands and are plain registrations before that. StudioFrame mounts the palette once and adds a narrow-screen trigger, which fixes the missing mobile nav. Recent destinations persist per viewer in `localStorage` (guarded).

**Why it is a moonshot / what it unlocks.** It turns a five-click path into two keystrokes. "What is waiting on me?" becomes a single view (Board counts and running jobs in the palette). Narrow screens get navigation for the first time. Because the index is derived, a new route or Board source shows up in the palette with no hand edit. The command registry is also the substrate an agent-addressable UI needs: the palette's commands are an enumerable action surface.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. `paletteIndex` with 2 projects → 2 × 5 `project-step` entries whose `href === studioHref(id, step)` for each of `PHASES`.
2. Board counts `{cull: 4, proof: 0}` → one `decision` entry ("Cull · 4" as a Tally) and no zero-count entry.
3. The ranker for query `"harb sco"` → first entry is Glass Harbor · Score.
4. A command registered by a mounted route appears in the index, and disappears after unmount.
5. Ctrl/⌘K while typing in an `<input>` opens the palette (a deliberate global). Plain `k` in an input → nothing.
6. At a 390px viewport the StudioFrame nav exposes a reachable trigger with an accessible name (live lane).

**Write set.** new `components/ui/shell/palette.ts`, new `components/ui/shell/Palette.tsx`, new `components/ui/shell/useShellCommands.ts`, `components/ui/StudioFrame.tsx`, `lib/jobLinks.ts` (export the step vocabulary only), new `tests/golden-path/shell-palette.probe.spec.ts`, `tests/live/golden-path.live.spec.ts` (narrow-viewport case).

**Risks & rollback.** A global Ctrl/⌘K can collide with browser or route bindings, so the palette claims only that chord and Escape. Index cost grows with the asset count: build it lazily on open and window to 50 rows. Rollback is to unmount it from StudioFrame; nothing else depends on it.

**First session dispatch.**
Read `components/ui/StudioFrame.tsx`, `lib/jobLinks.ts`, `lib/board/registry.ts`, `lib/board/source.ts`, and the registry `app-shell/techniques/shell-hosted-services.md`.
Build `palette.ts` (pure index plus ranker) and its probe first, red then green.
Then build `Palette.tsx` on `Modal` and mount it in StudioFrame with the narrow-screen trigger.
Gates: `npm run typecheck`, `npm test`, `npm run test:live` for the viewport case, and a `cx-capture` of `projects` at 390px and 1920px.

_Runner-up:_ A shell "in flight" rail: running jobs and storage trouble as a persistent StatusStrip under the nav, instead of only inside the bell tray.

_Checked:_ read in full `components/ui/tokens.ts`, `GravitoneTokens.tsx`, `world.tsx`, `motionPreference.ts`, `StudioFrame.tsx`, `components/kit/WorldRoot.tsx`, `components/kit/index.ts`, `components/kit/README.md`; skimmed `Modal.tsx:215-240`, `NotificationBell.tsx:1-120`, `Field.tsx` (branch sites), `kit.css:1-30`, `lib/jobLinks.ts`. Traced the world branch census (20 readers, ~78 conditionals), the Foundry obsidian-kit revert (6aca00e) and the toast scoping fix (ffaf025), and confirmed no palette or global search exists. Both backlog items (cardModel, bell deep links) are already shipped; UI-SHELL-A explicitly builds past the first.

## signal-vocabulary

### SIGNAL-A · One keymap, declared once: bind, guard and draw from the same object

**Context:** signal-vocabulary · **Slot:** A architecture
**Size:** L · **Effort:** 6/10 · **Impact:** 8/10 · **Risk:** 5/10 · **Gate:** architecture
**Registry:** software-engineering/accessibility#keyboard-navigation-models (also ui-controls#composition-contracts, test-harness#gate-scope-is-not-report-scope)

**Summary.** `<Keycaps>` draws a keymap, but the keys it claims are bound somewhere else by a hand-rolled `switch` with its own private guard, so display and behaviour drift independently. Only the Board has the full guard (typing, overlay, repeat, modifier). This card adds a pure `keymap` kernel to the signal vocabulary: one declaration yields the resolver, the window binding and the disclosure, and a registry knows what is bound right now.

**Premise (verified).**
- `lib/board/keys.ts:5-9` records a live conflict: K means *keep* on the foundry cull and in the kit's VerdictKeys, and *prev* on the Board. It is "reported as a kit request" with no mechanism to hold it.
- Three guard strengths in one app. `lib/board/keys.ts:39-50` `typing()` covers SELECT and an open `[role=combobox]`, and `boardKeyAction` (`:81`) refuses modifiers and repeats. `app/foundry/CullGrid.tsx:128`, `app/foundry/DojoView.tsx:182` and `app/library/AssetLightbox.tsx:65` each hand-copy a weaker check (INPUT/TEXTAREA/contentEditable only), and CullGrid's `switch` (`:134-172`) checks neither `ctrlKey` nor `repeat`, so Ctrl+K sets a keep verdict.
- Two copies of the Enter rule disagree. `CullGrid.tsx:58-63` `activatesOnEnter` covers button/link/menuitem/tab, while `lib/board/keys.ts:98` `enterBelongsToTarget` also covers checkbox, radio, INPUT and TEXTAREA.
- Display and binding are separate objects. `app/foundry/FoundryView.tsx:100-106` `CULL_KEYS` (what `<Keycaps>` draws) is a literal unconnected to the `switch` in `CullGrid.tsx:134-172`. The kit adds a third display, `KeyRow` (`components/kit/Dock.tsx:40`).
- 19 files add a window `keydown` listener. `tests/golden-path/cull-keys.probe.spec.ts:124` checks the Enter rule only under `app/foundry`, a hand-picked population.

**The move.** New `components/ui/signal/keymap.ts` (pure, node-testable): `defineKeymap({id, bindings: [{keys, does, action, repeat?, modifiers?, enter?: "grid"|"target"}]})`, and `resolveKey(map, e, {overlay}) → action|null`. The default policy is the Board's guard, promoted and generalized: one `typing`, one `enterBelongsToTarget`, one modifier/repeat rule, one `overlayOpen`. Also new: `useKeymap(map, handlers, {enabled})` with a single window listener per map, registered in an `activeKeymaps()` store. `<Keycaps>` and kit `KeyRow` accept a keymap and derive rows from its bindings, and `KeyBinding[]` stays as the derived type. Migrate `lib/board/keys.ts` (it becomes a definition over the kernel), CullGrid, Dojo, ExtractBoard, Lightbox and AssetLightbox. Add a verb-consistency table in the probe: `keep`/`reject`/`clear` must map to the same key on every verdict surface unless a declared exception (the Board's `A`) is drawn through VerdictKeys' `keepKey`.

**Why it is a moonshot / what it unlocks.** A shortcut can no longer appear in a disclosure without working, or work without being disclosed. The modifier/repeat/combobox fixes land on every surface at once instead of one bug at a time. The registry is the source the shell needs for a global "?" overlay and for palette verbs (UI-SHELL-B). Cut and Sound lab, both growing fast, get guarded keys without writing a fourth `typing()`.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. `resolveKey(CULL, {key: "k", ctrlKey: true})` → `null`. Today CullGrid keeps.
2. `resolveKey(CULL, {key: "x", repeat: true})` → `null`, and `{key: "ArrowRight", repeat: true}` → `"move"`.
3. Target inside `[role=combobox][aria-expanded=true]` → `null` for a letter key.
4. Enter on a `role="checkbox"` target → `null` (belongs to target) for every keymap. One rule, so `activatesOnEnter` is deleted.
5. `keycapsRows(CULL)` deep-equals `CULL.bindings.map(({keys, does}) => ({keys, does}))`, and adding a binding changes the disclosure with no second edit.
6. Census over the whole of `app/` and `components/`: every module calling `addEventListener("keydown")` either uses `useKeymap` or appears on a reasoned allowlist (Modal focus trap, DevInspector) → no unlisted file.
7. Verb table: the keep key across foundry cull, dojo, extract and lightbox is one letter, and the Board's divergence is declared → no undeclared mismatch.

**Write set.** new `components/ui/signal/keymap.ts`, `components/ui/signal/Keycaps.tsx`, `components/ui/signal/index.ts`, `components/kit/Dock.tsx` (KeyRow), `lib/board/keys.ts`, `app/foundry/{CullGrid,DojoView,ExtractBoard,Lightbox,FoundryView}.tsx`, `app/library/AssetLightbox.tsx`, `tests/golden-path/cull-keys.probe.spec.ts`, new `tests/golden-path/keymap.probe.spec.ts`, `components/ui/signal/README.md`.

**Risks & rollback.** Promoting the Board's guard tightens the foundry: held K stops deciding many tiles, and Ctrl+K stops keeping. That is intended but changes muscle memory, so say so in the commit. A per-surface migration can be reverted one file at a time because the kernel is additive.

**First session dispatch.**
Read `lib/board/keys.ts` (all of it), `app/foundry/CullGrid.tsx:50-180`, `components/ui/signal/Keycaps.tsx`, and `tests/golden-path/cull-keys.probe.spec.ts`.
Write `keymap.probe.spec.ts` cases 1-5 red, build `keymap.ts` until they pass, then port `lib/board/keys.ts` onto it with the Board's existing probe still green.
Then migrate CullGrid and point FoundryView's Keycaps at the keymap.
Gates: `npm run typecheck`, `npm test`.

_Runner-up:_ `UpstreamBreak` and kit `Steps` merge into one phase-chain part, ending the second hand copy of the phase order (`components/kit/Steps.tsx:49` `STUDIO_STEPS` vs `lib/projects.ts:39` `PHASES`) and their two state vocabularies.

### SIGNAL-B · Every count is a door: tallies and rails that filter what they count

**Context:** signal-vocabulary · **Slot:** B experience
**Size:** L · **Effort:** 5/10 · **Impact:** 7/10 · **Risk:** 4/10 · **Gate:** direction
**Registry:** software-engineering/status-vocabulary#status-color-mapping

**Summary.** The vocabulary turned ~170 sentences into counts, but every count is a dead stamp. "missed 2", "orphan 3" and "kept 12/36" tell you something exists and give no way to see which items. This card lets a `<Tally>` or a `<StackBar>` segment become the filter for the set it counts, with the selection held in the URL. Status displays become the place you act. It also moves the "zero is not news" tone rule into the part.

**Premise (verified).**
- `components/ui/signal/Tally.tsx:96` renders a `<span>`, and `StackBar.tsx:122-129` / `:153-171` renders its legend as plain `<li>`. Neither part can be interacted with.
- `app/calendar/BroadcastWeek.tsx:147-149`: booked, missed and aired tallies sit in the week header over a grid the user then scans by eye for the missed slots.
- The tone-by-zero rule is hand-typed at each call site: `BroadcastWeek.tsx:148` `tone={counts.missed ? "amber" : "neutral"}`, `app/calendar/ChannelsTab.tsx:165`, `app/foundry/StylesShelf.tsx:337`, and `app/playground/arrange/Board.tsx:251`, which is a three-way ternary per stage head. This is the "two surfaces render the same member in different shades" failure from status-color-mapping, waiting to happen.
- Countable sets beside their counts: `app/foundry/RunCards.tsx:118-119` (kept/deleted), `app/board/ContactSheet.tsx:291-292` (frames plus a StackBar), and `app/playground/arrange/Board.tsx:418-419` (cards/orphan).
- `components/ui/signal/TabRail.tsx:229-236` nests a Tally inside a `role="tab"` button. An interactive Tally there would be invalid HTML, so the contract must exclude it by type.

**The move.** Extend `Tally` with `select?: {pressed: boolean; onToggle(): void}` or `href`. Either way it renders the same chip as a `<button aria-pressed>` or `<Link>`, and its accessible name stays "missed 2" plus pressed state. Add `zero="neutral"` as the default, so `tone` applies only when `value > 0`, with `zero="keep"` as the opt-out. Extend `StackBar` with `selected?: string; onSegment?(label)`: the legend items become buttons, the rail stays `aria-hidden`, and zero-count segments are not focusable. New `components/ui/signal/useCountFilter.ts` syncs one selection to a search param (`?only=missed`) so a filtered view is linkable from the bell, the palette or a share. `TabRail`'s `tally` prop type becomes `Omit<TallyProps, "select" | "href">`. Adopt at four sites: calendar missed/booked/aired, arrange stage heads and orphan, the foundry StylesShelf kept tally, and the ContactSheet rail.

**Why it is a moonshot / what it unlocks.** The numbers the law created become the app's fastest filters, with no new filter UI and no prose. "Show me what failed" is one press everywhere. Deep links like `/calendar?only=missed` let notifications land on the exact subset. Moving the zero rule into the part ends tone drift between surfaces.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. `<Tally value={0} tone="amber"/>` → neutral tone classes. `<Tally value={0} tone="amber" zero="keep"/>` → amber.
2. `<Tally value={2} label="missed" select={{pressed: false, onToggle}}/>` → a `<button aria-pressed="false">` whose sr-only text is "missed 2".
3. `<StackBar onSegment>` with segments `[{n: 3}, {n: 0}]` → one legend button and one non-interactive item.
4. `useCountFilter("only")`: set `"missed"` → URL `?only=missed`, and re-reading the URL restores the selection, with a pure reader probe.
5. A `TabRail` tab passed a `tally.select` → a type error (`@ts-expect-error` probe).
6. `BroadcastWeek` filtered to missed with 2 missed of 9 slots → exactly 2 slots rendered as matched.

**Write set.** `components/ui/signal/Tally.tsx`, `StackBar.tsx`, `TabRail.tsx`, new `components/ui/signal/useCountFilter.ts`, `components/ui/signal/index.ts`, `README.md`, `app/calendar/BroadcastWeek.tsx`, `app/calendar/ChannelsTab.tsx`, `app/playground/arrange/Board.tsx`, `app/foundry/StylesShelf.tsx`, `app/board/ContactSheet.tsx`, new `tests/golden-path/count-door.probe.spec.ts`.

**Risks & rollback.** Over-adoption could make every chip look pressable. The chip changes shape only when `select` or `href` is passed, and the README states that a door appears only where a filtered set exists on the same screen. Each adoption is its own commit, and removing `select` reverts a site.

**First session dispatch.**
Read `components/ui/signal/Tally.tsx`, `StackBar.tsx`, `TabRail.tsx:180-241`, and `app/calendar/BroadcastWeek.tsx:120-200`.
Write `count-door.probe.spec.ts` cases 1-5 (render with `react-dom/server`, as resize-keyboard does with pure props) red first.
Extend Tally and StackBar, then adopt on BroadcastWeek with `useCountFilter`.
Gates: `npm run typecheck`, `npm test`, `npm run check:narration`, and a cx-capture of the calendar screen.

_Runner-up:_ `StaleBadge` grows a `rerun` action, so a stale figure is re-measured where it is shown instead of a page away.

_Checked:_ read in full `components/ui/signal/{README.md,index.ts,Hint,Tally,TabRail,StackBar,BandTrack,Ghost,UpstreamBreak,Keycaps,StaleBadge,Provenance}.tsx`, `lib/board/keys.ts`, `app/foundry/CullGrid.tsx:50-180`, and `components/kit/Steps.tsx:1-80`. Ran an adoption census of all 11 parts (BandTrack has 0 adopters, PipRow and StackBar 2 each) and a keydown-listener census (19 files). Map finding: `context-map.json` lists `components/ui/signal/Tally.tsx` twice in signal-vocabulary (dup-in-one, the app-side ingest bug CLAUDE.md describes). Report it rather than edit it.

## kit-specimen-route

### KIT-A · The kit census: adoption, gaps and the migration map derived from the tree

**Context:** kit-specimen-route · **Slot:** A architecture
**Size:** L · **Effort:** 6/10 · **Impact:** 8/10 · **Risk:** 3/10 · **Gate:** architecture
**Registry:** software-engineering/ui-controls#control-inventory-and-discovery (also #adoption-enforcement)

**Summary.** /kit's Migration tab and its amber tally rest on a hand measurement from 2026-09-29 that has already rotted: it says Cut has 1 file and Playground 2, and that the gap list is empty. This card replaces `migrationMap.ts`'s facts with a generated census: which part each file imports, which parts have no adopters, and where hand-rolled duplicates of kit shapes live. A probe makes the census unable to go stale.

**Premise (verified).**
- `app/kit/migrationMap.ts:6`: "MEASURED 2026-09-29 … file counts, and the evidence column, are what the module contains today." Recounted with `git ls-files` today: Cut is 1 → 18 (`:87`), Playground 2 → 35 (`:119`), Library 23 → 40 (`:111`), Frames 15 → 20, Projects 8 → 13.
- `app/kit/migrationMap.ts:27`: `GAPS = []`, so `app/kit/KitView.tsx:62` shows an amber Migration tally of 0. Meanwhile `app/_phases/cut` (18 files), `app/playground` (35) and `app/_phases/score` each import nothing from `@/components/kit`.
- `needs` and `evidence` are hand-typed strings, for example `migrationMap.ts:85-90` for Cut: "one file; <video in CutTimeline".
- The signal parts outside the kit barrel are invisible to every list. `components/kit/index.ts:98` re-exports only Ghost, Hint, TabRail, Tally and StackBar. `tests/golden-path/kit-catalog.probe.spec.ts:56` reads only the two kit barrels. PipRow, BandTrack, UpstreamBreak, Keycaps, StaleBadge and Provenance have 0 catalog entries, and BandTrack has 0 adopters anywhere.
- The registry's control-inventory technique names exactly this failure: "keeping the component catalog fresh without hand edits; a catalogued primitive has zero adopters."

**The move.** New `pipeline/kit-census.mts`, an AST walk with the `typescript` dependency (6.0.3, already in `package.json`) over `app/` and `components/`. It emits a committed `app/kit/census.json` containing: `parts` (every value export of `components/kit`, `components/ui/signal` and `components/ui/{Primitives,Field,Modal,Select}`) with adopter file lists; `modules` (path → source-file count, kit/signal import counts, and hand-rolled suspects found by AST: raw `role="tab"`, `<select>`, `<audio>`/`<video>`, native `title=`, private `typing()`); and `zeroAdopters`. `migrationMap.ts` shrinks to declared intent only (module → `needs`), and `Migration.tsx` renders intent next to measured facts, so a gap is a `needs` part the module does not import while a suspect is present. `KIT_GROUPS` gains a `signal` group so all 11 signal parts get specimens. `kit-catalog.probe.spec.ts` recomputes the census in-process and fails when `census.json` differs (stale) or a suspect count rises (ratchet).

**Why it is a moonshot / what it unlocks.** /kit stops being a document someone must remember to re-measure and becomes an instrument. The fast-growing steps (Cut 18×, Sound lab 17×) show up as migration debt the day they grow. "Does this exist before I build it?" gets an answer with adopters attached. Zero-adopter parts surface as delete-or-adopt decisions. The same census powers adoption ratchets for any future world or role migration (UI-SHELL-A).

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. The census over today's tree → `modules["app/_phases/cut"].files === 18` and `kitImports === 0`.
2. `zeroAdopters` includes `"BandTrack"`. It drops out once one non-kit file renders it.
3. A fixture file with `<button role="tab">` and no TabRail import → counted under `suspects.tab` for its module.
4. `census.json` edited by hand or left behind after a new import → the catalog probe fails, naming the module and field.
5. `KIT_GROUPS` contains every value export of `components/ui/signal/index.ts` → missing list `[]`, with `Parts.tsx` failing typecheck until each has a specimen.
6. The Migration tab's amber tally equals the computed gap count, not `GAPS.length`.

**Write set.** new `pipeline/kit-census.mts`, new `app/kit/census.json`, `app/kit/migrationMap.ts`, `app/kit/Migration.tsx`, `app/kit/KitView.tsx`, `app/kit/catalog.ts`, `app/kit/Parts.tsx` (signal specimens), `tests/golden-path/kit-catalog.probe.spec.ts`, `components/kit/README.md`, `package.json` (a `check:kit-census` script added to `verify`).

**Risks & rollback.** An AST walk of the tree adds seconds to `verify`. Cache the `ts.Program` and scope the walk to `app/` and `components/`. The suspect heuristics will have false positives, so they ratchet and never fail on first sight (quality-gates#excess-indicts-the-instrument). Rollback is to revert to the hand map; the census file is additive.

**First session dispatch.**
Read `app/kit/migrationMap.ts`, `app/kit/catalog.ts:1-40` and `:348-350`, `app/kit/Migration.tsx`, `tests/golden-path/kit-catalog.probe.spec.ts`, and the registry `ui-controls/techniques/control-inventory-and-discovery.md`.
Write acceptance cases 1, 2 and 4 red, then build `pipeline/kit-census.mts` emitting `census.json`.
Then re-point `Migration.tsx` and the KitView tally.
Gates: `npm run typecheck`, `npm test`, `npx tsx pipeline/kit-census.mts --check`.

_Runner-up:_ The Law tab's "Held by" column becomes live: each rule links to the gate or probe that holds it and shows that gate's last verdict.

### KIT-B · Specimens in the world they ship in: every part, every world, measured

**Context:** kit-specimen-route · **Slot:** B experience
**Size:** L · **Effort:** 6/10 · **Impact:** 7/10 · **Risk:** 3/10 · **Gate:** direction
**Registry:** software-engineering/design-tokens#theme-architecture (per-state completeness), accessibility#a11y-verification

**Summary.** /kit shows every part only in Almanac, yet 9 of the 10 framed routes render Obsidian, and Foundry, Calendar and AudioWorkbench render kit parts in the Obsidian-kit remap. A builder picks a part blind to the look it will actually ship with, and the contrast table measures a world almost nobody uses. This card makes the specimen sheet and the Identity contrast table world-parametric: Almanac, Obsidian-kit and bare Obsidian side by side, with contrast computed per world.

**Premise (verified).**
- `app/kit/KitView.tsx:47`: `<StudioFrame world="almanac">`, so every specimen renders in Almanac. Other StudioFrame mounts (`app/projects/ProjectsView.tsx:181`, `app/library/LibraryView.tsx:54`, `app/studio/[projectId]/StudioView.tsx:282`, `app/foundry/FoundryView.tsx:396`, …) default to Obsidian, and `app/library/audio/AudioWorkbench.tsx:553` uses `WorldRoot world="obsidian"`.
- `app/kit/contrast.ts:1-3`: "The page reads `WORLD_ALMANAC` … derives every ratio". `app/kit/Identity.tsx:130` resolves only against `WORLD_ALMANAC`.
- `app/kit/contrast.ts:7`: the `MIX` regex accepts only `#hex` or `var(--x)` operands. Every alpha token in `WORLD_OBSIDIAN_KIT` (`components/ui/tokens.ts:286,289,290`, e.g. `color-mix(in srgb, var(--gt-ink-bright) 72%, transparent)`) resolves to `null`, so Obsidian vellum and ash text cannot be measured even if passed in.
- The one defect the repo says no gate caught was an Obsidian contrast hole: `components/ui/signal/Ghost.tsx:64-73`, an outline at ~0.12 effective alpha on `#080a10`, found only by photograph.
- `app/kit/Parts.tsx:529`: `DEMOS: Record<PartName, () => ReactNode>` is already a single map of specimens, so rendering each one under three roots is a layout change, not a rewrite.

**The move.** `contrast.ts` learns alpha. `resolve()` returns `{rgb, alpha}`, handles `transparent`/`white` keywords and `color-mix(… X%, transparent)`, and `contrastOver(fg, ground)` composites before measuring. `Identity.tsx` gets a world switch (`TabRail` with Almanac / Obsidian) and draws its palette and contrast tables from `WORLD_ALMANAC`, `WORLD_OBSIDIAN_KIT` (resolved through `CSS_TOKENS`) and the Obsidian `CSS_TOKENS`. `Parts.tsx` gets a "Worlds" face: each specimen in three columns (`WorldRoot world="almanac"`, `WorldRoot world="obsidian"`, and a bare Obsidian div with no `WorldRoot`), keyed by `/kit#parts?world=all`. A per-world contrast floor table (text ≥ 7:1 per the Law tab, non-text ≥ 3:1) shows each token pair's tier with `<Tally>` tones and no prose. A world in which a part renders wrong (unstyled portal, Obsidian chip in Almanac) is visible on sight.

**Why it is a moonshot / what it unlocks.** The specimen sheet becomes a picture of what ships. The Ghost-class hole, the toast-scope hole (ffaf025) and the StaleBadge-in-Almanac mismatch are each visible in one glance at one route instead of found per surface. It is also the review instrument for UI-SHELL-A: each role migration is checked by looking at three columns that should converge.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. `resolve("color-mix(in srgb, var(--gt-ink-bright) 72%, transparent)", tokens)` → `{rgb: "#f3f6fb", alpha: 0.72}`.
2. `contrastOver({rgb: "#ffffff", alpha: 0.12}, "#080a10")` < 3, the Ghost's first version, and `alpha 0.25` → ≥ the recorded value.
3. The Obsidian contrast table has a row for every text role in `WORLD_OBSIDIAN_KIT`, with none `null`.
4. `/kit#parts` with `world=all` renders each `PartName` exactly three times (a count of `data-specimen` attributes, live lane).
5. A Modal specimen opened in the Obsidian-kit column → its portal carries that world (ties to UI-SHELL-A case 4; red until then, recorded as an expected failure).

**Write set.** `app/kit/contrast.ts`, `app/kit/Identity.tsx`, `app/kit/Parts.tsx`, `app/kit/PartsWorkbench.tsx`, `app/kit/GrowG3Demos.tsx` (specimen wrapper only), `app/kit/kit-route.css`, `app/kit/KitView.tsx`, new `tests/golden-path/kit-contrast.probe.spec.ts`, `tests/live/golden-path.live.spec.ts` (the specimen count case).

**Risks & rollback.** Rendering ~90 specimens three times can make /kit heavy, so mount the Worlds face lazily per group. Showing Obsidian on /kit is a direction call about what /kit is for. The default stays Almanac, and the switch is additive and removable.

**First session dispatch.**
Read `app/kit/contrast.ts`, `app/kit/Identity.tsx:120-200`, `components/ui/tokens.ts:150-300`, and `app/kit/Parts.tsx:520-560`.
Write `kit-contrast.probe.spec.ts` cases 1-3 red, then extend `contrast.ts` with alpha compositing and add the Obsidian table to Identity.
Then add the three-column Worlds face to Parts.
Gates: `npm run typecheck`, `npm test`, and a cx-capture of `/kit#parts` opened by eye.

_Runner-up:_ Each specimen gets a copy button for its exact call shape (`api` from catalog.ts), so /kit is where a builder starts writing code, not just where they look.

_Checked:_ read in full `app/kit/{page,KitView,Law,Migration,migrationMap,contrast}.tsx/.ts`, `app/kit/catalog.ts` (structure plus `RULES`/`TOKEN_ROLES`), `tests/golden-path/kit-catalog.probe.spec.ts:1-80`, `components/kit/{index.ts,README.md,WorldRoot.tsx}`; skimmed `Parts.tsx` (imports, `DEMOS` typing) and `PartsWorkbench.tsx:1-60`. Recounted module file counts with `git ls-files` and counted kit imports per module. Not in `.ai/registry-map.json` (no row for kit-specimen-route), so the registry subjects were chosen by technique `use_when`.

## ui-component-probes

### UCP-A · Probes query the program, not the text: one AST layer for every source probe

**Context:** ui-component-probes · **Slot:** A architecture
**Size:** L · **Effort:** 7/10 · **Impact:** 8/10 · **Risk:** 4/10 · **Gate:** architecture
**Registry:** software-engineering/test-harness#pin-the-call-not-the-name (also quality-gates#match-the-resolved-artifact, test-harness#gate-scope-is-not-report-scope)

**Summary.** About 37 of the ~100 golden-path specs prove rules by reading source as text: comment stripping, `indexOf('case "Enter"')`, brace-matched function bodies, and hand-picked directories. The comment-strip ratchet exists because text scanning has already blinded probes once. This card adds one cached TypeScript-compiler query layer that source probes call: function bodies, switch cases, JSX attributes, import graphs and call sites. Probe populations then come from the import graph instead of a directory someone chose.

**Premise (verified).**
- 37 specs in `tests/golden-path/` call `readFileSync` on source, and 30 import `stripComments` (`tests/golden-path/_helpers.ts:127`), which is a text scanner.
- `tests/golden-path/comment-strip-ratchet.probe.spec.ts:9-18`: the private comment-strip pair "takes the code between with it". Measured 2026-09-05: "14 files lose a contiguous region, up to 80% of lib/imaging/api.ts". The repo has already paid for text-level probing.
- `tests/golden-path/cull-keys.probe.spec.ts:124-125` walks only `app/foundry` (`readdirSync` + `/\.tsx$/`), and its Enter-case reader (`:50-70`) locates the first `case "Enter"` with `indexOf`. A second handler in the same file, or any handler outside foundry (19 files bind `keydown`), goes unchecked.
- `tests/golden-path/commit-gate-parity.probe.spec.ts:45` reads a server guard via a private `bodyOf()` brace matcher, and `dialog-closes-on-success.probe.spec.ts:17-21,35-36` admits it is a source ratchet over two named files because "the probe lane has no DOM".
- `package.json:51` already has `typescript` 6.0.3, and the lane is serial in one process (`playwright.config.ts:28`), so one shared `ts.Program` is reusable across all specs.

**The move.** New `tests/golden-path/_ast.ts`: `program()` (lazy, one per process, from `tsconfig.json`) and typed queries: `fn(file, name)`, `switchCase(fnNode, label)`, `jsx(file, component)` returning element attrs, `importers(module, symbol)` (from the resolved module graph, so aliases and barrels count), `callsTo(symbol)`, and `ordered(fnNode, a, b)` (is call `a` before call `b` on every path; the dialog-close rule). Every query returns resolved nodes, never strings, so comments cannot satisfy or blind it. Migrate the five weakest probes first: cull-keys (population = `callsTo("addEventListener")` with a `"keydown"` arg across `app/`), commit-gate-parity (`fn` instead of `bodyOf`), dialog-closes-on-success (population = every `Modal` caller with an async submit), chrome-colour-literals' TS branch, and comment-strip-ratchet (retired for migrated files). A new ratchet probe counts specs that `readFileSync` a `.ts`/`.tsx` and match with a regex. That count may only fall.

**Why it is a moonshot / what it unlocks.** Probes stop being correct only for the files their author thought of: a new step directory joins every relevant population on its first import. Rules about ordering, wiring and absence ("no surface binds K without the guard") become checkable across the whole app. This makes SIGNAL-A case 6 and KIT-A's census cheap to write. The lane's verdicts become resolved-artifact verdicts, which the registry treats as the only kind a text match cannot fake.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. `fn("lib/foundry/store.ts", "commitRun")` returns a body that contains the status guard even when a block-comment-looking route glob sits in a line comment above it, the hazard recorded in comment-strip-ratchet.
2. `callsTo("addEventListener").filter(arg0 === "keydown")` over `app/` and `components/` returns all 19 files. cull-keys then checks Enter in every file that has an Enter case, not just foundry.
3. A fixture handler with two `switch` statements, each with `case "Enter"` → `switchCase` returns both.
4. `importers("@/components/ui/signal", "BandTrack")` → `[]`, and `importers(…, "Tally")` includes files that import it through `@/components/kit`.
5. `ordered(ProjectDialog.submit, "await save", "onClose")` → true, with negative control: swapping the two in a fixture → false (test-harness#negative-control-tests).
6. Program construction plus the five migrated probes adds under 15 s to `npm test` on this tree (measured, recorded in the probe header).

**Write set.** new `tests/golden-path/_ast.ts`, new `tests/golden-path/_ast.probe.spec.ts`, `tests/golden-path/cull-keys.probe.spec.ts`, `commit-gate-parity.probe.spec.ts`, `dialog-closes-on-success.probe.spec.ts`, `chrome-colour-literals.probe.spec.ts`, `comment-strip-ratchet.probe.spec.ts`, new `tests/golden-path/text-probe-ratchet.probe.spec.ts`, `tests/golden-path/_helpers.ts`.

**Risks & rollback.** Program build time is the main risk: cache it per process and scope it to `app/`, `components/` and `lib/`. A query can be wrong in a new way, which is why each migrated probe keeps its negative control. Migration is per probe, so any probe can revert to its text form.

**First session dispatch.**
Read `tests/golden-path/_helpers.ts:120-190`, `comment-strip-ratchet.probe.spec.ts`, `cull-keys.probe.spec.ts`, `commit-gate-parity.probe.spec.ts`, and the registry `test-harness/techniques/pin-the-call-not-the-name.md`.
Build `_ast.ts` with `fn`, `switchCase` and `callsTo`, plus `_ast.probe.spec.ts` cases 1-3, red first.
Then migrate cull-keys to the derived population and record the timing.
Gate: `npm test`.

_Runner-up:_ A DOM-capable component lane (happy-dom plus React render) inside the node lane, so dialog, keyboard and announcement contracts are asserted by behaviour instead of by source order.

### UCP-B · The legibility lane: assert what only photographs caught

**Context:** ui-component-probes · **Slot:** B-architecture (no UI surface)
**Size:** L · **Effort:** 7/10 · **Impact:** 8/10 · **Risk:** 5/10 · **Gate:** architecture
**Registry:** software-engineering/accessibility#a11y-verification (also test-harness#negative-control-tests)

**Summary.** The repo's own law says the defect that survived its biggest refactor, a Ghost outline at ~0.12 effective alpha, passed every gate and was found only by photographing the screen. This card turns that photograph into an assertion. A live-lane spec walks the named cx screens and the /kit specimens and computes, in the page, the composited contrast of every visible text run and every drawn non-text mark against its real backdrop. It fails under the floors and ratchets known failures.

**Premise (verified).**
- `CLAUDE.md` ("The gate, and the two things it cannot do", item 2) and `components/ui/signal/Ghost.tsx:64-73`: `border-white/30` inside `opacity-40` "composites to ~0.12 alpha … Every gate was green … only photographing the screen found it". The fix (`Ghost.tsx:78`, `border-white/45` under `opacity-55`) is protected by nothing.
- `tests/live/` holds two specs (`golden-path.live.spec.ts`, `extract-progress.live.spec.ts`) plus the typed harness client `tests/live/_control.ts`. No visual or contrast assertion exists in either lane, and the repo has no axe or jsdom dependency (checked in `package.json`).
- `pipeline/cx-capture.mjs:32-70` already resolves the named screens with deterministic reach (dev-auth bypass, `via` walks for Score and Cut), but only as a CLI that writes a PNG for a person to open.
- `app/kit/contrast.ts:1-3` measures token pairs from `WORLD_ALMANAC` only. It cannot see Tailwind alphas, ancestor `opacity`, or the Obsidian ground, which are exactly the three factors that made the Ghost invisible.
- The floors exist as law and are held only by eye or by a token table. `app/kit/catalog.ts:445`: "white, then vellum, both 11:1", held by "/kit contrast table, computed from WORLD_ALMANAC". `app/kit/catalog.ts:447`: "State is never a dimmer colour", held by "type-pass audit (dimmed text counted); the diff".

**The move.** Move `SCREENS` out of `pipeline/cx-capture.mjs` into an importable `pipeline/cx-screens.mjs`, so cx-capture and the lane share one reach table. New `tests/live/legibility.live.spec.ts`: for each screen (and `/kit#parts`), inject `tests/live/_legibility.ts`. That page-side measurer walks visible text nodes and elements with a border, outline or fill wider than 1px. For each it computes `effectiveColor = color × alpha × Π(ancestor opacity)` composited over the nearest opaque backdrop (walking `background-color` up the tree, and treating `--gt-ink` or `--al-night` as the floor). It records `{selector, text|shape, ratio, floor}`. Floors: text ≥ 4.5 (Almanac ≥ 7 per the kit law), non-text marks ≥ 3 (WCAG 1.4.11). Findings ratchet against a committed `tests/live/legibility-baseline.json` that may only shrink. A negative control seeds the 2026-09 Ghost values into a fixture route and requires red.

**Why it is a moonshot / what it unlocks.** The narration law's deletion passes and UI-SHELL-A's 78-site migration can run with a machine checking that what remains is visible, instead of 17 PNGs opened by hand. Ghost, low-alpha chips and dimmed-state text (the kit law "state is never a dimmer colour") become regressions a gate names with a selector. The baseline file is a ranked legibility backlog for /cx sessions.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. The pure composite function `effective({rgba: [255,255,255,0.3]}, [0.4], ground "#080a10")` → contrast < 3. With `(0.45, 0.55)` → ≥ 3. Node-lane unit test.
2. Fixture route rendering `<Ghost>` with the pre-fix classes → the lane reports one non-text finding for it (negative control red).
3. `projects` screen today → findings count equals the committed baseline. Adding one `text-white/20` label → red, naming its selector.
4. `cx-capture.mjs` and the lane import the same `SCREENS` object, so a screen id added in one appears in the other.
5. `aria-hidden` decorative marks are excluded from the text floor but included in the non-text floor only when they carry state (`data-state` or a dashed border). This is the explicit rule.
6. A run over all screens finishes under 4 min on the live lane's port (`playwright.live.config.ts`, 3187), measured and recorded.

**Write set.** new `pipeline/cx-screens.mjs`, `pipeline/cx-capture.mjs`, new `tests/live/_legibility.ts`, new `tests/live/legibility.live.spec.ts`, new `tests/live/legibility-baseline.json`, new `tests/golden-path/legibility-composite.probe.spec.ts`, `playwright.live.config.ts` (if a project or timeout entry is needed), a fixture route under `app/_dev-inspector/` or an equivalent dev-only path.

**Risks & rollback.** Backdrop resolution is heuristic over gradients, images and the aurora, and can produce false positives. Gradient and image backdrops are reported as `unmeasured` (measurement-honesty), never as passes, and the ratchet starts from today's baseline instead of failing the tree. It is live-lane only, so the fast lane is untouched, and it is removable as a single spec.

**First session dispatch.**
Read `components/ui/signal/Ghost.tsx`, `pipeline/cx-capture.mjs`, `tests/live/_control.ts`, `playwright.live.config.ts`, and the registry `accessibility/techniques/a11y-verification.md`.
Build the pure composite function and its node probe first (case 1), then extract `cx-screens.mjs`.
Then write the live spec for `projects` and the Ghost negative-control fixture.
Gates: `npm test`, then `npm run test:live` for the new spec.

_Runner-up:_ A replayable keyboard-walk lane: Tab through every screen and assert each stop is visible, named and not inside hidden-but-mounted content (accessibility#hidden-but-mounted-inertness).

_Checked:_ read the headers and structure of `theme-ratchet`, `chrome-colour-literals`, `comment-strip-ratchet`, `commit-gate-parity`, `adopted-render`, `resize-keyboard`, `cull-keys` (whole) and `dialog-closes-on-success` probe specs, `playwright.config.ts`, the `playwright.live.config.ts` header, `pipeline/cx-capture.mjs:1-75`, and `tests/live/_control.ts:1-30`. Counted source-reading specs (37 use `readFileSync`, 30 use `stripComments`). Confirmed there is no DOM/axe dependency. The context is thematically mixed: theme-ratchet is the style-lock ratchet over `lib/themes`, and commit-gate-parity and adopted-render guard foundry and script seams, not UI. Both cards target the lane's instruments, not those individual rules.
