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
