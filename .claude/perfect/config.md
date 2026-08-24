---
product: "Gravitone Studio"
stack: "Next.js 16 (App Router, Turbopack) + React 19 + TypeScript + Tailwind v4. No backend, no database, no third-party service."
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
- **`app/_studio/*` holds the mocked fixtures every surface reads.** The stage this repo is in is UI
  prototyping *before* any backend. Directions that deepen the flow, the fixtures' honesty, or the
  design are in season; directions that assume a live model, an API or auth are premature - propose
  them as the seam to design against, not as work to do.
- **The craft knowledge lives in `knowledge/`** - per project template, per production step, with
  evidence labels and sample sizes (`knowledge/README.md`). A direction that touches a step's surface
  MUST be scouted against that step's `PATTERNS.md` and `params.json`. Where a step has no entry yet,
  "commission the craft research for step X" is itself a legitimate direction - an ungrounded step is
  the deeper problem.

## Gates

- `always:` `npx tsc --noEmit` (cheap, no shared build output, safe alongside a sibling session)
- `when routing/layout/server-rendered code changed:` `npm run build` - the only check that catches
  an App Router mistake a typecheck cannot see. Run it ONCE per wave on the wave branch, not per lot.
- `builder:` `npx tsc --noEmit`. A builder that changed a rendered surface must ALSO drive it:
  `npm run dev -p 31<lot number>` and report what it actually saw.
- **There is no linter and no test suite in this repo.** Do not invent `npm run lint` / `npm test`.
  A run that "passes" a command this repo does not have is reporting fabricated evidence.

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
- **Out-of-scope wall:** "wire it to a backend" / "persist this" / "add auth" is never a direction to
  build. The mocked seam is the design.

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

- "Add a backend / a model call / auth / persistence" - a deliberate deferral, not a gap.
- "Bring back the Motion step" - retired 2026-08-14 (see the product brief).
- Localization - this repo ships English only, and `locale_count: 1` is deliberate.
