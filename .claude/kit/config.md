---
product: Gravitone Studio
vault: []
vault_subdir: Kit
features_root: app/(studio)
entry: app/(studio)/layout.tsx
aliases: "@=."
kit_path: packages/ui/src/components
doctrine: packages/ui/src/components/INVENTORY.md
batch_builders: 3
contest_seats: ""
---

# kit overlay - gravitone-gcloud

Defaults in force: vault `<repo>/.kit`, subdir `Kit`.

## World

**Corrected 2026-10-15 (Phase 1 wave 3).** This overlay pointed at v1's Almanac kit (`components/kit`,
`/kit` as its specimen sheet, `WORLD_ALMANAC` in `components/ui/tokens.ts`). That kit retired: owner decision 5
(`docs/next/migration-plan.md` §8) replaced it at `/kit` with the rebuild's design system. `components/kit`
was deleted in Phase 6 (2026-10-17).

The world is now **the Watershed** (contest `foundry-next-design-r4`, winner A/1), extracted from the approved
prototype `docs/next/prototype/app/` (its own kit page is `kit.html` + `kit.js` + `kit.css`). It is scoped:
`[data-world="next"]` is the root element of the `(studio)` route group (`app/(studio)/layout.tsx`); outside it
only the landing (`app/page.tsx` + `app/_landing/`) keeps its own Tailwind world.

- Tokens: `packages/ui/tokens/source.json` (primitives -> roles, admission in `tokens/ADMISSION.md`) ->
  `npm run tokens:gen` -> `packages/ui/src/tokens.css` + `tokens.ts`. Never edit the generated files.
- Components: `packages/ui/src/components/<dir>/<File>.tsx` + a co-located `*.module.css` over token variables,
  imported as `@gt/ui/components/<dir>/<File>.tsx`. Inventory and the v1 signal mapping: `INVENTORY.md`.
- The specimen sheet: `/kit` (`app/(studio)/kit/`), every component in its states, the tokens read from
  `source.json`, the whole status table, the key legend of every keymap mode.

## Gates

- `npm run next-structure`
- `npm run typecheck:next`
- `npm run test:unit`
- `npm run tokens:check` (no raw colour or px in a `*.module.css`; every `var(--x)` a token)
- `npm run typecheck`
- `npm run lint:ratchet`
- `npm run check:narration`
- `npm test`
- `npm run build`

## Instruments

- Shooter: `NEXT_PUBLIC_DEV_AUTH=1 NEXT_DIST_DIR=.next-cx npx next dev -p 3007`, then
  `CX_BASE=http://localhost:3007 node pipeline/cx-capture.mjs kit out.png --width 1920`
- The kit probe: `tests/live/kit.live.spec.ts` (every component specimen rendered, nothing under 12px).
- Divergence: `node ../ai-registry/skills/kit/scripts/style-divergence.mjs --repo . --out .kit/Kit/inventory`

## Repo law

Read CLAUDE.md + AGENTS.md before building. Next.js here is not the one you know: read `node_modules/next/dist/docs/`.
Rendered text: the app does not explain itself (see CLAUDE.md "The app does not explain itself"); state rides on
tallies, marks, shapes. Real errors and destructive confirms explain in full. Design values only through tokens:
a new value is admitted in `source.json` with its role, never typed into a module. Type floor 12px.
Commit on the current branch; never push. `--no-verify` is denied.

## Visibility order

/kit, then /floor (and its calendar, `?cal=1`), /board, /projects, /projects/runs, /library, /library/style/[id],
/audio, /ledger

## Taste

- 2026-09-29 owner: "not just theming, a systematical redesign (extraction of shared components, redesigning into v2 world,
  application into new theme with possibly adjusted layout)".
- 2026-10-15 owner: extraction changes names, never pixels; the design leads (plan §3.3).

## Skill improvement log
