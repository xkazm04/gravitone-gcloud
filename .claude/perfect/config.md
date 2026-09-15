---
product: "Gravitone Studio"
stack: "Next.js 16 (App Router, Turbopack) + React 19 + TypeScript + Tailwind v4. No database. Server-side vendor seams DO exist now: lib/imaging (Leonardo/OpenAI), lib/music (ElevenLabs), lib/text (reasoning chokepoint), lib/foundry (Extract engine)."
vault: ["C:/Users/mkdol/dolla/gravitone-gcloud/.vault"]
vault_subdir: Perfect
base_branch: main
wave_size: 3
lot_caps: {}
pool_target: 10
round_shape: pool
cooldown_rounds: 2
commit_format: "feat(<context>): <title>"
context_map: context-map.json
active_runs_ledger: ".vault/active-runs.md"
locale_count: 1
---

# perfect overlay - gravitone-gcloud

## Product brief

One production walked through five steps (Research - Script - Frames - Score - Cut) over a Library
that knows every asset's lineage. `lib/projects.ts`'s `PHASES` is the ONE source of that order;
`app/studio/[projectId]/` is the composition root.

- **Motion was retired as a step on 2026-08-14.** Frames owns the still and the clip made from it,
  because they are one art-direction decision against one source frame. A direction proposing "the
  motion step" is proposing a regression; a direction deepening Frames' clip half is in season.
- **`app/_studio/*` holds the mocked fixtures every surface reads** — still true, and still the
  design seam. **But the "no live model" half of this rule expired.** As of 2026-08-29 three vendor
  domains bill real money behind server-only seams: `lib/imaging` (Leonardo · OpenAI),
  `lib/music` (ElevenLabs, `e427bd1` — the Score step's cues render for real) and `lib/text` (the
  reasoning chokepoint + fallback ladder, `4d446c3`), plus `lib/foundry`'s Extract engine
  (`1e4c8e2`). So: a direction that DEEPENS one of those engines is in season and is the highest-
  value work here; a direction that wires a *new* vendor, adds auth, or introduces a database is
  still out of scope. The seam contract is the law — **no vendor import escapes `lib/<domain>/`**.
- **The craft knowledge lives in `knowledge/`** - per project template, per production step, with
  evidence labels and sample sizes (`knowledge/README.md`). A direction that touches a step's surface
  MUST be scouted against that step's `PATTERNS.md` and `params.json`. Where a step has no entry yet,
  "commission the craft research for step X" is itself a legitimate direction - an ungrounded step is
  the deeper problem.

## Gates

**Refreshed 2026-08-29.** The previous text said "there is no linter and no test suite in this repo"
and told builders not to invent `npm run lint` / `npm test`. That is now FALSE in both directions —
believing it would make a builder skip real gates. Measured against `package.json` at `bd15a19`:

- `always:` `npm run typecheck` (`tsc --noEmit`) — cheap, no shared build output, safe alongside a
  sibling session.
- `always:` `npm run lint:ratchet` — ESLint plus `pipeline/lint-ratchet.mjs`, which compares
  warning counts per rule against `lint-baseline.json`. **It fails in EITHER direction**: a drop is
  as fatal as a rise, because a drop can also mean the matcher broke. So a builder that legitimately
  removes a warning must SAY SO and leave the re-baseline to the Director — never edit
  `lint-baseline.json` itself (it is Class C, see below). Errors are held at zero unconditionally.
- `always:` `npm run check:manifest` — imaging style bundle manifests.
- `when a rendered surface or route changed:` `npm test` (Playwright, `tests/golden-path`, the
  `node` project — NOT a browser matrix, it is fast).
- `when routing/layout/server-rendered code changed:` `npm run build` — **Director only, at
  quiescence, ONCE per wave on the wave branch.** `next build` writes one `.next/` per tree, so two
  concurrent production builds in one checkout fight.
- `when the imaging bundle changed:` `npm run check:bundle` (post-build; reads `.next`).
- `when the notebook/verifier changed:` `npm run check:notebook`.
- `when the trailer structure model changed:` `npm run check:trailer-structure`.
- `when the text engine changed:` `npm run verify:text`.
- `the whole chain` is `npm run verify` — typecheck → lint:ratchet → check:manifest → test → build →
  check:bundle. That is the Director's integration gate; a builder runs the subset above.
- `builder:` a builder that changed a rendered surface must ALSO drive it —
  `npm run dev -- -p 31<lot number>`, never port 3000 (the user holds it) — and report what it
  actually saw. `NEXT_DIST_DIR=.next-31<lot> NEXT_PUBLIC_DEV_AUTH=1` sidesteps Next 16's
  one-dev-server-per-directory lock without killing anyone's server.
- **Never spend a vendor call to pass a gate.** `lib/{imaging,music,text}` all have offline paths;
  replace `globalThis.fetch` before the engine loads. A live call is a Director decision the user
  authorises, and its cost goes on the record.

## Class B

Append-only registries a builder may edit by anchored insert (re-read immediately before writing):

- the `MODULES` list in `components/ui/StudioFrame.tsx`
- the `PHASES` array in `lib/projects.ts` (historically `app/page.tsx`)
- `README.md`

## Class C

Director-only. Builders REPORT what they need; the Director applies it once.

- `components/ui/tokens.ts` and `app/globals.css` - the design system's single source of truth
- `package.json` / `package-lock.json` - dependency changes are a user call
- `context-map.json` - a Personas export, see `## Context sources`
- `lint-baseline.json` — a measurement, not a config. Re-baselining is a human diff whose commit
  message must name the cause. Builders REPORT a warning-count change; they never write this file.
- the git index

## Repo law

- **No colour literal leaves `components/ui/tokens.ts`.** Consume the `--gt-*` vars or the exported
  constants (`SURFACE`, `TEXT`, `EASE`). Needing a new token is fine - it is a Class C request, not a
  "just this once" hard-code. `README.md` section "The design language" is the short form; the long
  form is `DESIGN.md` in the parent project `gravitone/web` (read-only from here).
- **Reuse `components/ui/Primitives.tsx` and `StudioFrame.tsx`.** A new shared atom belongs in
  `components/ui/`, not inlined in a phase surface.
- **Keep the fixture seam:** surfaces read the types in `app/_studio/`, never an ad-hoc inline shape.
- **Represent absence honestly.** In this product absence is the story (an unpicked scene, a refused
  cue, a cut with gaps). A surface that can only render the happy path is a defect.
- `"use client"` only where interactivity actually needs it.
- Motion is entrance-only and reduced-motion-safe; `globals.css` disables animation under
  `prefers-reduced-motion`, so a JS-driven animation must opt out itself.
- The three font families are `font-instrument`, `font-hanken`, `font-jetbrains` and nothing else.
- **Out-of-scope wall:** "add auth", "add a database", "wire a NEW vendor" is never a direction to
  build. The mocked seam is the design. Deepening an EXISTING engine (imaging · music · text ·
  foundry) is not on this wall — see the product brief.

## Context sources

`context-map.json` at the repo root is **generated and owned by the Personas app** (project
`gravitone`, id `91d8170c-...`): its scan writes the contexts into Personas' own SQLite DB and then
EXPORTS this file, plus the managed `<!-- personas:context-map -->` block in `CLAUDE.md`. It is
**export-only - there is no import path.**

- **Never hand-edit `context-map.json`.** The next scan overwrites it from the DB, silently. To change
  the taxonomy, change it in the app (Dev Tools -> Context Ledger) and rescan, or ask the user to.
- Its shape is the Personas schema: `version: 2`, `generator: "personas-context-scan"`, a flat
  `groups[]` and a flat `contexts[]` whose entries carry `file_paths` (snake_case), `group`,
  `category`, `description`, `keywords`, `entry_points`, `cross_refs`, `tech_stack`, `pinned`,
  `last_written_at`, plus top-level `taxonomy`, `provenance` and `use_cases`.
- Personas' scan enforces a 10-30-files-per-context band, so contexts here are broad on purpose.
- The map's `contexts[].name` values ARE the matching set for the memory outbox: same machine, one
  scan. Confirm through the bridge when it is up rather than trusting a remembered name.
- Repo is Personas-managed (`.personas/` exists; project `gravitone`, id
  `91d8170c-2be4-45ac-b509-256bfa7726f1`).
- A wave that added or moved files leaves the map stale by design - say so and ask for a rescan;
  never patch it.

## Smoke

- `npm run build` (a green production build is the floor, and it typechecks), then
  `npx next start -p 3177` and walk every phase and the library - clicking, not reading.
- **Never port 3000** - the user or a sibling session may hold it. Kill the server you started;
  never kill one you did not start.
- Because everything is fixture-driven, **the diagnostic is the fixture**: when a surface looks
  wrong, read the fixture it renders before touching the component. A wrong number is usually mocked
  data, not a bug.
- Run after every ~2 waves.

## Vetoes

- "Add auth / a database / a NEW third-party vendor" - a deliberate deferral, not a gap.
  (Superseded 2026-08-29: "a model call" is no longer a veto — imaging, music and text all make
  real ones. Deepening those is in season; a fourth vendor is not.)
- "Bring back the Motion step" - retired 2026-08-14 (see the product brief).
- Localization - this repo ships English only, and `locale_count: 1` is deliberate.

## Skill improvement log

### 2026-08-29 — pass 2, wave 1 (8 directions, 4 lots, all shipped)

- **THE BIG ONE: `.vault/active-runs.md` is not evidence, and I treated it as evidence.** It showed
  `/explorer` and `/architect` as *Recently completed*, so I put the wave in the MAIN checkout and
  told the user the tree was free. It was not. Three other sessions were live and committing there,
  and `git switch -c perfect/2026-08-29` silently rerouted **15 of their commits onto my wave
  branch** (10 `/explorer` on shared-notebook, 3 `foundry-api`, 2 `/conform`). Nothing was lost —
  they reached `main` when I merged — but the wave branch was never purely the wave, and one of
  those commits (`a7be959`) had already done half of an accepted direction before its builder
  started. **Fix for the next round: before choosing the tree, run
  `git log --since="30 minutes ago" --format='%h %ad %an %s'` and check `git worktree list`. A
  ledger entry is a courtesy; commits in the last half hour are the fact.** Consider always using a
  dedicated worktree when ANY other session has run today, since the ledger cannot be trusted to be
  current.
- **A builder that verifies still beats a Director that specifies — three times this wave.** Lot C
  was told `STANDING_EXCLUDES` was invented; it checked and found two of three items are verbatim
  doctrine. Lot B was told there is no CI; `.github/workflows/gates.yml` exists. Lot B was told to
  wire three orphaned gates; one had been wired 40 minutes earlier. **Every wrong premise came from
  the Director's own scouting, and every one was caught by a builder grepping before editing.** Keep
  the "search before building" clause; it is load-bearing.
- **The write-set partition worked, and its one gap was predictable.** Zero collisions across four
  concurrent lots. The single `DECISION NEEDED` was a builder correctly refusing to reach into
  `FramesStep.tsx` to finish its own acceptance criterion. **Lesson: when a direction's criterion
  names a user-visible outcome, walk the render path and include every file between the change and
  the screen in the write set** — the seam was in `useFrames.ts` but the empty ledger was two files
  downstream.
- **Scratch files are a shared resource nobody declared.** A builder's `.tmp-drive-b1.mjs` at the
  repo root carried an error-severity lint finding that **blocked `lint:ratchet` for all four lots**
  for most of the wave. Add to the brief: *temp/drive files go in the scratchpad directory, never the
  repo root, and are deleted before you report.*
- **`lint:ratchet` fails in either direction and that surprised every builder.** Warning it in the
  brief worked — all four reported the fall instead of re-baselining — but two of them spent real
  time proving it was not theirs. **Add to the brief: if a bucket falls, name the file you think
  carried it and move on; the Director will attribute it.** Lot A did exactly that (checked out the
  HEAD copy, reproduced the warning, restored) and it made the re-baseline commit trivially honest.
- **Rejections held, and the one live bug inside a rejected direction was landed separately.** The
  `maxDuration` fix went in as its own commit (`2af21d6`) with the rejection stated in its message,
  rather than folded into an accepted direction. That shape is worth keeping: it lets the Director
  act on a real defect without quietly overturning the user's gate.
