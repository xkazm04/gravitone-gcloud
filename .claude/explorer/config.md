# explorer overlay - gravitone-gcloud

Project specifics for the lane skill `/explorer`. The lane body is generic; everything here is this
repo's. Read at the start of a run; the sweep works without it, on the lane's defaults.

## Product

Gravitone Studio - a Next.js 16 / React 19 content-production studio: libraries in
`packages/{catalog,domain,kernel,producers,ui}`, a SQLite kernel store, screens in `app/(studio)/`
each reading a `_port` that is fixture or real by `GRAVITONE_PRODUCE_SIDE`. Pairs with `/research`
(external sources) and `/perfect` (the directional build loop).

## Vault

```
VAULT=".vault"   # repo-relative, gitignored; create on first run (one checkout per machine)
```

Not a hard-fail if absent. `Lessons/` and `Patterns/` are shared with the other adopted skills;
everything under `Explorer/` is this sweep's alone.

## Area taxonomy

`context-map.json` at the repo root, not `.claude/codebase-context.md`. Read its groups and contexts
from the file (31 contexts / 8 groups on 2026-10-17, mapped before the Phase 6 deletions; it lags the
rebuild until the owning machine rescans - `docs/context-map.md`). Build the menu from it.

A context here is **broad** (Personas' scan targets 10-30 files each); when the user names one
route or step, scope to it inside its context and say you did.

**`context-map.json` is generated and owned by the Personas app** (project `gravitone`; the owning project id is `project.id` in the file -
`d57f858b`, the kazda checkout, since 2026-10-18) - export-only, no import path.

- **Never hand-edit it.** The next scan overwrites it from the DB, silently. To change the taxonomy,
  change it in the app (Dev Tools -> Context Ledger) and rescan, or ask the user to.
- Its shape is the Personas schema: `version: 2`, `generator: "personas-context-scan"`, a flat
  `groups[]` and a flat `contexts[]` carrying `file_paths` (snake_case), `group`, `category`,
  `description`, `keywords`, `entry_points`, `cross_refs`, `tech_stack`, `pinned`, `last_written_at`.
  The `keywords` and `entry_points` arrays are the scan's own summary of each context and the fastest
  way in - resolve a hint against them first.
- If it is missing, do not guess a taxonomy and do not write one. Stop and ask for a scan.
- **Known stale baseline:** five files are unmapped by design or omission (`README.md`, `AGENTS.md`,
  `CLAUDE.md`, `package.json`, `tsconfig.json`). Report drift, never patch it.

## Reference files (always loaded)

1. `context-map.json` - the area taxonomy. Small enough to read whole.
2. `README.md` - what the product is, what is deliberately mocked, and the design language's rules.
3. `packages/ui/tokens/source.json` (+ `tokens/ADMISSION.md`, `src/components/INVENTORY.md`) - the
   design system itself; every `ui`/`design` item is judged against it.
4. `AGENTS.md` - this is Next 16; the docs in `node_modules/next/dist/docs/` outrank training data.

## Categories

`quality | dx | ui | design | fixture | perf | bug | a11y`

- `design` - a design-language violation: a raw colour or px in a `*.module.css`, a re-rolled
  `@gt/ui` component, a `var(--x)` that `source.json` does not define, motion that is not
  entrance-only or that ignores `prefers-reduced-motion`, a font outside `--sans` (Inter) / `--mono`
  (JetBrains Mono).
- `fixture` - the mocked data misrepresents, contradicts itself, or is shaped so a real backend
  could not produce it. Also: a fixture that flatters (every generation succeeds, no cost, no wait),
  or ids derived from array position.
- **No `i18n`** - this repo ships English only. Security items file as `bug`: the server seam
  (`app/_server/`, the API routes and file doors, the CLI tokens) is real now. At `critical`: a secret
  committed to the repo, a route that skips `app/_server/route.ts`'s guard, and
  `dangerouslySetInnerHTML` fed anything but a generated token stylesheet.

## What "worth fixing" means here

There is no user in production and real data lives on one operator's machine, so the usual
severity ladder skews.

- **Rank up:** design-language violations, fixtures that lie about what the product can do, a surface
  that cannot represent absence or failure, dead props/state, accessibility.
- **Rank down:** hardening against inputs no code path can produce yet; performance work on a fixture
  array of 20 items. Be sceptical of `perf` generally - most "perf" here is really `quality`. Real
  perf items: work that scales with a *real* library, `useEffect` cascades, animations that never
  pause, client components that could be server components.
- **Hard exclusion - a new backend.** Never surface "add a second store", "add auth", "wire a new
  vendor". The port seam is the design, and changing it is a `/perfect` direction the user gates.
  Items about the *shape* of that seam (a component reaching into a fixture instead of its `_port`, a
  fixture side the real side could never satisfy) are in scope and are usually the most valuable
  things a sweep finds.

## Item schema deltas

Replace the lane's `i18n_impact` field with:

```yaml
design_impact: "<none | consumes an existing token | NEEDS A NEW TOKEN (source.json is owner-only - say which and why)>"
```

Clustering: same fixture file -> one commit (two hand-merges of a fixture array is how entries get
dropped). Execution order for 2+ items: `bug` before `fixture` before `design` before `perf` before
`quality`.

## Gates

The full set is `npm run verify` (declared once in `pipeline/gates.mts`). Per item:

- `npm run typecheck` (and `npm run typecheck:next` when `packages/` changed) - fast, safe alongside
  another session.
- `npm run lint:ratchet` - fails in EITHER direction; a fall is reported, never re-baselined by you.
- `npm run tokens:check` when a `*.module.css` or `source.json` changed.
- `npm test` when a rendered surface changed; `npm run test:unit` when `packages/` changed.
- `npm run build` when the item touched routing, layout, or anything server-rendered.
- A test, selftest or dev server sets `GRAVITONE_STORE_PATH` to a temp file; never open
  `foundry-out/gravitone.sqlite`.

## Frontend rules (non-negotiable when touching `app/(studio)/**` or `packages/ui/**`)

- Design values only through tokens: `packages/ui/tokens/source.json` -> `npm run tokens:gen`; the
  generated `tokens.css` / `tokens.ts` are never hand-edited. Adding a token is fine - admit it in
  `source.json` with its role in the same commit and say so.
- Reuse `@gt/ui` (`packages/ui/src/components/<dir>/`); a new shared component belongs there.
- New data goes through the route's `_port` contract and `@gt/domain` types, never an ad-hoc inline shape.
- Represent absence honestly. `"use client"` only where interactivity actually needs it.

## Visual verification

Either start the dev server on a free port (`GRAVITONE_PRODUCE_SIDE=fixture NEXT_PUBLIC_DEV_AUTH=1
GRAVITONE_STORE_PATH=<temp file> npx next dev -p 3177` - **never 3000**, which the user or a sibling
session may hold) and exercise the affected surface, or state explicitly that you have NOT
visually verified. Kill the server when done, and never kill one you did not start.

## Memory outbox

This repo is Personas-managed (`.personas/` exists), so the outbox contract applies and the
`context-map.json` `contexts[].name` values are the matching set. The `.vault/` tree is the sweep's
own coverage record; both, not either.
