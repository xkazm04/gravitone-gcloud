---
product: Gravitone Studio
vault: []
vault_subdir: Kit
features_root: app
entry: app/layout.tsx
aliases: "@=."
kit_path: components/kit
doctrine: components/kit/README.md
batch_builders: 3
contest_seats: ""
---

# kit overlay - gravitone-gcloud

Defaults in force: vault `<repo>/.kit`, subdir `Kit`. Pilot: `/foundry` first (2026-09-29); the long-running
full-coverage sessions start only after the owner gates the foundry pilot.

## World

The v2 world is **Almanac**, chosen 2026-09-29 by the owner from contest `landing-nextgen-brand-r2` (variant A/2).
Source of truth for the look: `.contest/arena/landing-nextgen-brand-r2/entries/claude-claude-opus-5-5_xhigh-v2/variant-2/`
(`index.html` door + brand sheet, `foundry.html` working surface, `NOTES.md` philosophy). It is scoped:
`[data-world="almanac"]` on a route root switches a surface into v2; un-migrated surfaces keep Obsidian untouched.
Colour literals for the world live in `components/ui/tokens.ts` (`WORLD_ALMANAC`) and nowhere else.

## Gates

- `npm run typecheck`
- `npm run lint:ratchet`
- `npm run check:type` (12px floor)
- `npm run check:narration`
- `npm test`
- `npm run build`

## Instruments

- Shooter: `NEXT_PUBLIC_DEV_AUTH=1 NEXT_DIST_DIR=.next-cx npx next dev -p 3007`, then
  `CX_BASE=http://localhost:3007 node pipeline/cx-capture.mjs <screen-id> out.png --width 1920`
- Divergence: `node ../ai-registry/skills/kit/scripts/style-divergence.mjs --repo . --out .kit/Kit/inventory`

## Repo law

Read CLAUDE.md + AGENTS.md before building. Next.js here is not the one you know: read `node_modules/next/dist/docs/`.
Rendered text: the app does not explain itself (see CLAUDE.md "The app does not explain itself"); state rides on
tallies, marks, shapes. Real errors and destructive confirms explain in full. Colour literals only in tokens.ts.
Type floor 12px. Commit on the current branch; never push. `--no-verify` is denied.

## Visibility order

/ (door), /foundry, /projects, /studio, /library

## Taste

- 2026-09-29 owner: "not just theming, a systematical redesign (extraction of shared components, redesigning into v2 world,
  application into new theme with possibly adjusted layout)". Exercise on /foundry first, then hand over to long sessions.

## Skill improvement log
