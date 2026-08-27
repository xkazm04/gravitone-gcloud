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

## Skill improvement log

- 2026-08-27 · Next 16 refuses a second `next dev` while :3000 is held — builders must smoke via `NEXT_PUBLIC_LOCAL_MODE=1 npm run build && npx next start -p 31xx`; say so in every builder brief. Builder briefs must forbid `git stash` explicitly (one ran it). Bridge auth = header `x-personas-local-token`.

