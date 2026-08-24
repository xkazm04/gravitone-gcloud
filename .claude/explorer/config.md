# explorer overlay - gravitone-gcloud

Project specifics for the lane skill `/explorer`. The lane body is generic; everything here is this
repo's. Read at the start of a run; the sweep works without it, on the lane's defaults.

## Product

Gravitone Studio - a UI-first Next.js 16 / React 19 / Tailwind v4 prototype of a content-production
studio, running entirely on mocked fixtures in `app/_studio/`. Pairs with `/research` (external
sources) and `/perfect` (the directional build loop).

## Vault

```
VAULT="C:/Users/mkdol/dolla/gravitone-gcloud/.vault"   # in-repo and gitignored; create on first run
```

Not a hard-fail if absent. `Lessons/` and `Patterns/` are shared with the other adopted skills;
everything under `Explorer/` is this sweep's alone.

## Area taxonomy

`context-map.json` at the repo root, not `.claude/codebase-context.md`. Today it holds 4 groups /
4 contexts / 28 files:

| menu | context | group |
|---|---|---|
| phases | `production-phases` | Production Lifecycle |
| library | `asset-library` | Asset Management |
| design | `studio-design-system` | Design System |
| infrastructure | `app-infrastructure` | Application Infrastructure |

A context here is **broad** (Personas' scan targets 10-30 files each), so a full sweep of
`production-phases` covers all five phases at once; when the user names one phase, scope to it inside
that context and say you did.

**`context-map.json` is generated and owned by the Personas app** (project `gravitone`, id
`91d8170c-...`) - export-only, no import path.

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
3. `components/ui/tokens.ts` - the design system itself; every `ui`/`design` item is judged against it.
4. `AGENTS.md` - this is Next 16; the docs in `node_modules/next/dist/docs/` outrank training data.

## Categories

`quality | dx | ui | design | fixture | perf | bug | a11y`

- `design` - a design-language violation: a colour literal outside `components/ui/tokens.ts`, a
  re-rolled Primitive, a `--gt-*` var read that `tokens.ts` does not define, motion that is not
  entrance-only or that ignores `prefers-reduced-motion`, a font outside `font-instrument` /
  `font-hanken` / `font-jetbrains`.
- `fixture` - the mocked data misrepresents, contradicts itself, or is shaped so a real backend
  could not produce it. Also: a fixture that flatters (every generation succeeds, no cost, no wait),
  or ids derived from array position.
- **No `i18n`** - this repo ships English only. **No `sec`** - no server, no routes, no auth, no
  secrets. Two security items still qualify as `bug` at `critical`: a secret committed to the repo,
  and `dangerouslySetInnerHTML` fed anything but the token stylesheet `GravitoneTokens.tsx` generates.

## What "worth fixing" means here

There is no backend, no test suite and no user in production, so the usual severity ladder skews.

- **Rank up:** design-language violations, fixtures that lie about what the product can do, a surface
  that cannot represent absence or failure, dead props/state, accessibility.
- **Rank down:** hardening against inputs no code path can produce yet; performance work on a fixture
  array of 20 items. Be sceptical of `perf` generally - most "perf" here is really `quality`. Real
  perf items: work that scales with a *real* library, `useEffect` cascades, animations that never
  pause (`usePauseOffscreen` in `Equalizer.tsx` exists for this), client components that could be
  server components.
- **Hard exclusion - "wire it to a backend".** Never surface "call a real API here", "persist this",
  "add auth". The seam is the design, and changing it is a `/perfect` direction the user gates. Items
  about the *shape* of that seam (a component reaching into a fixture instead of taking props, a type
  a server could never satisfy) are in scope and are usually the most valuable things a sweep finds.

## Item schema deltas

Replace the lane's `i18n_impact` field with:

```yaml
design_impact: "<none | consumes an existing token | NEEDS A NEW TOKEN (tokens.ts is owner-only - say which and why)>"
```

Clustering: same fixture file -> one commit (two hand-merges of a fixture array is how entries get
dropped). Execution order for 2+ items: `bug` before `fixture` before `design` before `perf` before
`quality`.

## Gates

This repo has exactly one gate, so run it every time:

- `npx tsc --noEmit` - fast; no shared build output, safe alongside another session.
- `npm run build` when the item touched routing, layout, or anything server-rendered - the only check
  that catches an App Router mistake a typecheck cannot see.
- **There is no linter and no test suite.** Do not invent `npm run lint` / `npm test`; a run that
  "passes" a command this repo does not have is reporting fabricated evidence.

## Frontend rules (non-negotiable when touching `app/**/*.tsx` or `components/**/*.tsx`)

- No colour literal leaves `components/ui/tokens.ts`. Consume the `--gt-*` vars or the exported
  constants (`SURFACE`, `TEXT`, `EASE`). Adding a token is fine - do it in `tokens.ts` in the same
  commit and say so.
- Reuse `Primitives.tsx` and `StudioFrame.tsx`; a new shared atom belongs in `components/ui/`.
- New data goes through the types in `app/_studio/`, never an ad-hoc inline shape.
- Represent absence honestly. `"use client"` only where interactivity actually needs it.

## Visual verification

Either start the dev server on a free port (`npm run dev -p 3177` - **never 3000**, which the user or
a sibling session may hold) and exercise the affected surface, or state explicitly that you have NOT
visually verified. Kill the server when done, and never kill one you did not start.

## Memory outbox

This repo is Personas-managed (`.personas/` exists), so the outbox contract applies and the
`context-map.json` `contexts[].name` values are the matching set. The `.vault/` tree is the sweep's
own coverage record; both, not either.
