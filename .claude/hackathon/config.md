---
vault_subdir: Hackathon
arena: .hackathon/arena
hours: 5
build_effort: xhigh
base_port: 3300
baseline_frac: 0.35
sprint_min: 60
---

## Setup

- `npm ci --no-audit --no-fund`
- `npm run fixtures`

## Gates

- `npm run typecheck`
- `npm run typecheck:next`
- `npm run next-structure`
- `npm run check:narration`
- `npm run test:unit`

## Repo law

- Read `AGENTS.md`, `CLAUDE.md` and `.claude/patterns/README.md` before the first edit. They bind every line.
- **Never open the operator's store.** Before any test, CLI, selftest or dev server, export `GRAVITONE_STORE_PATH` to a temp sqlite path and `SOUND_STORE_DIR` / `SOUND_LEDGER_PATH` (and any other v1 `*_STORE_DIR`) to temp locations.
- **No spend.** Export `GRAVITONE_DRY_ONLY=1` and `SOUND_HUNT_ENGINE=stub` in every shell. Never run `pipeline/sound.mts generate`, a live Suno job, or anything that bills ElevenLabs.
- Dev server on your assigned port with the fixture universe: `NEXT_PUBLIC_GRAVITONE_DATA=fixtures NEXT_PUBLIC_DEV_AUTH=1 NEXT_DIST_DIR=.next-hk npx next dev -p <port>` plus the store and DRY variables above. Stop it before your session ends.
- 400 lines per file, hard. Zod only at `@gt/domain/door`. Packages never import `app/`, `lib/` or `pipeline/`. Order: `@gt/catalog < domain < kernel < producers`; `@gt/ui` sits over domain.
- Copy law: no sentence whose subject is the app; hints of 12 words or fewer; use `@gt/ui` shapes, and a new shape gets a `/kit` specimen.
- Prompts are files in `pipeline/*.md`, split by `<!-- section: x -->`.
- Never hand-edit `context-map.json`. Commit on your branch; never push.
- Local instrument and sample libraries are read by path from configuration or an env var at runtime. Never commit their files.

## Taste

## Skill improvement log
