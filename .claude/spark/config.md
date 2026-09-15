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

- `always:` `npm run typecheck` (`tsc --noEmit`) and `npm run lint` (eslint - ratcheted, see
  `npm run lint:ratchet`).
- `when app/_phases/script/** or the notebook schema changed:` `npm run check:notebook`,
  `npm run check:trailer-structure`.
- `when routing/layout/server code changed:` `npm run build` - once per spark, on the spark branch.
- `test:` `npm test` (Playwright golden-path probes; offline, no vendor billed). `npm run test:live`
  starts its own `next dev` on 3187 - never port 3000.
- `builder:` `npm run typecheck`; a builder that changed a rendered surface must also drive it on a
  dev server of its own (`next dev -p 31xx`) and report what it saw. Builders NEVER stage and NEVER stash - only the
  Director touches the index. Smoke via a prod build on 31xx (a second `next dev` is refused while :3000 is held).

## Rituals

- Phase 0: read `.vault/active-runs.md`, add an entry under `## Active` with declared paths, in the
  same bash invocation (never edit-then-commit across sessions). Always `git status` first.
- Phase 5: if files under `app/` or `components/` were added/moved/deleted, refresh the context map
  per CLAUDE.md (bridge probe 17400..17410; else append to `.vault/map-drift.md`).
- Phase 6: move the ledger entry to `## Recently completed` with the SHA and declared/not-touched
  paths.

## Repo law

See `.claude/perfect/config.md` `## Repo law` verbatim, plus:
- A step surface MUST be scouted against `knowledge/templates/<template>/steps/<step>/PATTERNS.md`
  and `params.json` before it is designed. "Commission the craft research" is a valid answer.
- `lib/projects.ts` `PHASES` and `TEMPLATES` are append-only registries (positional fallback).
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
