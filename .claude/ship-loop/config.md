# ship-loop overlay - gravitone-gcloud

## Stack

Next.js 16 (App Router, Turbopack) + React 19 + TypeScript + Tailwind v4. **No backend, no
persistence, no auth, no third-party service and no deploy target** - every surface renders mocked
fixtures from `app/_studio/`. Not a hosted SaaS: auth and billing dimensions have no referent here.
No test runner and no linter are configured.

## Cadence

milestone

## Ship bar (default answer at CP0 - force the question, do not assume)

This repo renders mocked fixtures on purpose, so the bar is NOT "production SaaS" by default. The
realistic bars, in order of ambition:

1. **Shareable prototype** - deployed somewhere the user can send a link, honest that it is a
   prototype, fast and correct on a phone and a laptop.
2. **Design-partner demo** - the above + every state a real production reaches is representable and
   legible, plus a `/uat` roster that passes L2.
3. **Product v1** - the above + a real backend behind the fixture seam. **This is a different
   project**, not a milestone: it needs its own architecture decision, and the loop should say so
   rather than accumulating backlog items toward it.

The repo name says `gcloud`, so bar 1 most likely means Google Cloud. **Do not assume it** - ask at
CP0 and record it, because the ops dimension is meaningless until the target is named.

## Gates (ordered - run top to bottom, sequentially)

| step | command | ratchet | when / notes |
|---|---|---|---|
| typecheck | `npx tsc --noEmit` | 0 errors | always; cheap, no shared build output |
| build | `npm run build` | exits 0 | always; runs TS again and is the only check that catches an App Router mistake |
| audit | `npm audit` | record, escalate real advisories | Boot and periodically; scored under dim 1 |
| browser | `npm run dev -p 3177`, walk every phase and the library | no blockers | UI touched; LAST |
| unit | `npm run test -- --run` | 0 failed | **only once a suite exists**; serialize before the browser pass |

**Never invent a gate command.** There is no `npm run lint` and no `npm test` in this repo today. A
journal line claiming one is fabricated evidence, and it is the easiest lie in this loop.

Browser pass: **never port 3000** - the user or a sibling session may hold it. Check the three
conditions that are cheap and always break - a 768px viewport, keyboard traversal with a visible
focus ring, and `prefers-reduced-motion: reduce`. Screenshot what you assert. Kill the server you
started; never kill one you did not start.

## Dimensions (overrides of the defaults)

| # | name | what it means in this product |
|---|---|---|
| 3 | Tests | **Starts red and stays honest.** No suite, no linter. The first test is a real decision (Vitest + Testing Library, matching the parent project) and belongs in a milestone, not in a gate that pretends it already exists. Until then "gates green" means types + build + a driven browser, and every journal line says exactly that. |
| 5 | Design-language fidelity | Replaces the engine's packaging/security dimension, which has no referent here. Scores: no colour literal outside `components/ui/tokens.ts`; primitives reused rather than re-rolled; motion entrance-only and reduced-motion-safe; every surface able to render the states its types admit. The thing most likely to rot silently while the product looks fine. |
| 7 | Ops (hosting/CI/deploy) | Meaningless until the deploy target is named at CP0. Today: no target at all. |

Security is not absent, it is *narrow*: no secrets in the repo, no `dangerouslySetInnerHTML` beyond
the token stylesheet, and dependency advisories (`npm audit`). Score those under dimension 1 and
escalate anything real to a blocker immediately.

## Conventions

- **Single-owner files** - `components/ui/tokens.ts`, `app/globals.css` and `package.json`. Never
  hand two parallel agents write access to them.
- **Fixture seam is repo law.** Surfaces read the types in `app/_studio/`; no ad-hoc inline shapes.
  Reuse `components/ui/Primitives.tsx` and `StudioFrame.tsx`.
- **Premise-check before executing, with the local twist:** is the thing you are about to fix a
  product defect or a fixture value? Rewriting a component to fix a number that lives in
  `app/_studio/scenes.ts` is the characteristic wasted milestone here.
- **Parallel-session ledger:** `.vault/active-runs.md` (create if absent). Register on resume and name
  any dev-server port you take.
- **State dir:** the loop's state lives under `.vault/ShipLoop/`, which is gitignored (`/.vault/`).
  Backlog numbering is append-only.
- **`context-map.json` is a Personas export** - never hand-edit it; ask for a rescan.
- **Next 16 docs** in `node_modules/next/dist/docs/` outrank training data (see `AGENTS.md`).
- **Push policy:** the user pushes.
- **Product calls (CP questions, never auto-decided):** the ship bar, the deploy target, adding a
  dependency, scope narrowing, and anything touching the fixture seam's contract.

## Lenses (extra / re-pointed)

- **design-language fidelity** -> dim 5: grep for hex / `rgb(` outside `tokens.ts`, hand-rolled
  primitives, JS-driven motion that escapes the reduced-motion rule.
- **functionality honesty** -> dim 2: does `README.md` claim anything the app does not do? Does any
  surface imply capability the fixtures cannot back? Dimension 2 scores what the *interface* can do -
  it goes green when a Character can complete the journey through the studio's screens, not when a
  fixture happens to contain a finished film.
- **ops/deploy path** -> dim 7: is there ANY deploy target? (Today: no.) What would the smallest be?
- scope: 4 contexts in `context-map.json`; use it to target files.

## Feed the loop

A backlog item that turns out to be product design rather than repair belongs in
`.vault/Perfect/directions/` with the user's acceptance - `/perfect` builds those; `/ship-loop`
hardens what exists.
