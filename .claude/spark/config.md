---
product: "Gravitone Studio"
stack: "Next.js 16 (App Router, Turbopack) + React 19 + TypeScript + Tailwind v4. IndexedDB project records; fixtures in app/_studio; governed imaging chokepoint in lib/imaging."
vault: ["C:/Users/mkdol/dolla/gravitone-gcloud/.vault"]
vault_subdir: Spark
context_map: context-map.json
base_branch: main
active_runs_ledger: ".vault/active-runs.md"
locale_count: 1
---

# spark overlay - gravitone-gcloud

Scaffolded 2026-08-27 from what this repo declares. The product brief, Class B/C registries and
Repo law are the same ones `.claude/perfect/config.md` carries - read that file's `## Product brief`,
`## Class B`, `## Class C`, `## Context sources` and `## Vetoes` sections as part of this overlay
(one copy, not two).

## Gates

- `always:` `npm run typecheck` (`tsc --noEmit`), `npm run lint` (eslint - ratcheted, see
  `npm run lint:ratchet`), and `npm run check:type` (readable-floor check: nothing under
  `text-label`/1rem in `app/` or `components/`). Missing from this list until 2026-10-04 - the
  pre-push hook caught a real `text-xs` violation this list would have caught earlier.
- `when app/_phases/script/** or the notebook schema changed:` `npm run check:notebook`,
  `npm run check:trailer-structure`.
- `when routing/layout/server code changed:` `npm run build` - once per spark, on the spark branch.
- `test:` `npm test` (Playwright golden-path probes; offline, no vendor billed) - run the FULL
  suite before any push, not a single spec. `npm run test:live` starts its own `next dev` on 3187 -
  never port 3000. 2026-10-04: a Director ran only `kit-catalog.probe.spec.ts` at each work package
  and before merge; the pre-push hook's full run caught a chrome-colour-literals failure
  (`app/library/audio/audio-workbench.css` spelling hex/rgba instead of declaring tokens in
  `components/ui/tokens.ts`) that a full local run would have caught the same day it was written,
  not at push time two fix-commits later.
- `builder:` `npm run typecheck`; a builder that changed a rendered surface must also drive it on a
  dev server of its own (`next dev -p 31xx`) and report what it saw. Builders NEVER stage and NEVER stash - only the
  Director touches the index. Smoke via a prod build on 31xx (a second `next dev` is refused while :3000 is held).
  **"Never stash" has now been violated twice** (2026-08-27, 2026-10-04 - the second a `git stash
  push -u` run WHILE a parallel builder was actively writing files in the same shared worktree,
  caught and recovered by the builder itself, no corruption found on Director verification - but
  "recovered cleanly" is not evidence the rule is optional). State it as an absolute in every builder
  brief's Rules section, not just the overlay: "never git stash, for any reason, even to diff against
  a clean baseline - a parallel package may be writing files in this same worktree right now."
  **Any `next dev`/`next build` run auto-appends `.next-<name>/types/**` entries to `tsconfig.json`
  as a side effect** - a builder claiming it reverted this needs it verified by the Director reading
  the actual committed diff, not trusted from the report (seen twice: 2026-09-05 as a bare lesson,
  2026-10-03 as a real leaked commit the Director caught and amended out).
- `worktree:` Turbopack refuses a worktree whose `node_modules` is a junction to the main checkout
  ("Symlink [project]/node_modules is invalid, it points out of the filesystem root"), for `next dev`
  AND `next build`. Builders run `next dev --webpack`. The Director's build is NOT `next build
  --webpack`: webpack's route-export typecheck is stricter and fails on untouched pre-existing routes
  (`api/foundry/extract`, `api/frames`). Build with Turbopack after a TEMPORARY, never-committed line
  in next.config.ts: `nextConfig.turbopack = { ...nextConfig.turbopack, root: "<main checkout>" }`,
  then `npm run check:bundle`, then restore the file (copy it aside first). Measured 2026-10-05.

## Rituals

- Phase 0: read `.vault/active-runs.md`, add an entry under `## Active` with declared paths, in the
  same bash invocation (never edit-then-commit across sessions). Always `git status` first.
  **Check BOTH directions of divergence before cutting a worktree**: `rev-list --count
  main..origin/main` AND `rev-list --count origin/main..main`. This repo routinely carries dozens
  of unpushed local commits (measured 2026-10-03: local 53 ahead, origin 3 ahead, both nonzero) -
  checking only the "behind" direction found real work (a whole theme system) sitting on the wrong
  side of a worktree cut, discovered only after two scouts ran against it and one had to
  self-correct mid-report.
- Phase 5: if files under `app/` or `components/` were added/moved/deleted, refresh the context map
  per CLAUDE.md (bridge probe 17400..17410; else append to `.vault/map-drift.md`).
- Phase 6: move the ledger entry to `## Recently completed` with the SHA and declared/not-touched
  paths.

## Repo law

See `.claude/perfect/config.md` `## Repo law` verbatim, plus:
- A step surface MUST be scouted against `knowledge/templates/<template>/steps/<step>/PATTERNS.md`
  and `params.json` before it is designed. "Commission the craft research" is a valid answer.
- `lib/projects.ts` `PHASES` and `TEMPLATES` are append-only registries (positional fallback).
- **Tree-wide probes judge files a builder never opens — name them in every brief.** An API route
  calls a `lib/apiAuth.ts` door (`guardRequest` / `guardAccessOnly` / `checkAccess`) IN ITS OWN FILE;
  a wrapper hides it from `imaging-auth.probe.spec.ts`. A hand-rolled `let alive = true` guard needs
  `useLoadFor`/`useStepFor` or a reasoned `OWN_LOAD_GUARD` entry. NO client-reachable module may
  spell a server-only env var NAME, not even in a dev fixture or a label (`check:bundle`; a dynamic
  import behind an inline NODE_ENV test did NOT keep the chunk out). All three surfaced only at the
  Director's verify on 2026-10-05, after six builders reported green.
- **A new Obsidian surface is built in the Projects/Library idiom, NOT from `components/kit`.** The kit is
  the Almanac print idiom (square corners, dashed absence, flat fields) remapped to obsidian colours;
  round 1 of platform-consolidation briefed six builders to "reuse components/kit" and the operator's
  verdict on every kit-built page was "like looking at wireframes" (2026-10-05). Reuse targets:
  `components/ui/{Primitives,Select,tokens}`, `components/ui/signal/*`, and the baseline pages
  `app/_projects/*`, `app/library/*`. Dropdowns are `components/ui/Select`, never a native `<select>`.
- Prompts live in `pipeline/*-PROMPT.md` and are read by the code (`app/_phases/**/run/*`); a prompt
  change is a code change and its regression control (`pipeline/*-regression.mts`) runs.

## Wave defaults

One AskUserQuestion call of up to 4 questions per wave.

## Question taste

- 2026-08-27: operator picks the fuller surface over the minimal seam when the types already exist (overrode "persist + minimal read" → full trailer Script; "no cue" → fixture cue). Offer the full option first when the vocabulary is already in the repo.
- Decide by convention, do not ask: untagged records = visible everywhere (honest-absence law); verdict panels follow GatePanel.
- 2026-08-30 (dojo): operator prefers keeping cross-machine workflows INSIDE the product (a second gravitone checkout on the GPU box) over external glue (file sync, upload routes), and prefers the measured option over the pre-decided one (ship both judges, let cycle data pick). Offer "the app travels to the data" and "measure it in v1" options explicitly.
- 2026-08-30 (card-decision-engine): on visual/motion ambition the operator picks the BOLDER option — framer-motion physics over the CSS-only recommendation, and “prototype all three art variants behind a switcher, we pick or fuse” over choosing one. Offer the ambitious option as a first-class choice, not a warning-wrapped afterthought; a real dependency cost stated in the option text is an acceptable price, not a veto.
- 2026-08-30 (card-decision-engine, round 2): showcase card art is for CURATED choices (few, fixed, art-worthy); GENERATED content gets the dense reading face — scannable title in the body font, icon watermark instead of an art zone, metadata behind an expand, front limited to the decision state + the honest downside. “The title carries the idea; the user expands if not certain.” Long generated titles are a data-contract defect to fix at the prompt (claim = headline ≤ 90 chars), with a UI splitter only as the reader for old data.

## Skill improvement log

- 2026-08-27 · Next 16 refuses a second `next dev` while :3000 is held — builders must smoke via `NEXT_PUBLIC_LOCAL_MODE=1 npm run build && npx next start -p 31xx`; say so in every builder brief. Builder briefs must forbid `git stash` explicitly (one ran it). Bridge auth = header `x-personas-local-token`.
- 2026-08-30 · A UI builder's smoke server outlived its "killed" report and held next-swc, blocking worktree deletion — before `git worktree remove`, check the builder's port is dead (`Get-NetTCPConnection -LocalPort 31xx`). Also: the harness shell cwd persists across calls — a merge run while cwd is inside the worktree merges the branch into itself ("Already up to date" is the tell); cd to the main checkout explicitly. `.ai/manifest.yaml` skills-list additions can ride a concurrent session's WIP commit when that session is already appending to the same list — say so in both ledgers.
- 2026-08-30 · Parallel builders running tree-wide gates cross-attribute failures (WP2's ratchet run caught WP3's committed lint rise; WP4 was transiently blamed) — keep requiring every builder report to split “my files” vs “the tree”, it made attribution instant. Pre-committing shared-file types (stepStore) as a Director commit before the parallel fan-out prevented the only write collision. Scout rule worth asking: “what does the consumer write on MERE hydration?” — useVersions saves an empty record on open, which killed a brief's record-existence default. The active-runs `## Active` entry can be dropped by a concurrent session's rewrite — re-read it at wrap and restate completion under Recently completed rather than assuming the entry survived.
- 2026-10-05 (platform-consolidation, 6 parallel builders) · WP0 Director commit of wire types + an explicit HTTP contract (shapes, status codes, error body) let engine, UI and a third consumer build in parallel with zero contract drift; SendMessage to running builders delivered a mid-flight decision (access header) without a rework round. Every wave answer was the Recommended option — the operator delegates shape when options are scouted. A literal reading of "keep ported, delete Live" would have shipped a static iframe; the scout's naming check (which variant is the real implementation?) was the highest-value question of the run. Promoted to Gates/Repo law this run: Turbopack-in-worktree build recipe; tree-wide probes list.
- 2026-10-05 (platform-consolidation round 3) · Giving each parallel builder its OWN scratch subdir in the brief (round 2 shared one: a builder overwrote another's capture script and rm -rf'd a mangled path) produced zero collisions across three builders. A Director audit diffing the old surface (`git show <sha>^:file`) against the chosen variant turned "it seems we don't display data anymore" into an exact restore list in one scout pass — use it whenever an operator reports lost information after a redesign.
