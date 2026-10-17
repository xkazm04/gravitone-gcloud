# ship-loop overlay - gravitone-gcloud

## Stack

Next.js 16 (App Router, Turbopack) + React 19 + TypeScript; libraries in
`packages/{catalog,domain,kernel,producers,ui}`, a SQLite kernel store (`GRAVITONE_STORE_PATH`;
never open the operator's `foundry-out/gravitone.sqlite`), vendor seams under `lib/<domain>/` run as
kernel producers, dry by default. Each `app/(studio)/` screen reads a `_port`, fixture or real by
`GRAVITONE_PRODUCE_SIDE`. **One operator's machine, no deploy target**: not a hosted SaaS, so
billing has no referent here. Playwright (`tests/golden-path`, `tests/live`), Vitest
(`packages/*/test`) and a lint ratchet are configured.

## Cadence

milestone

## Ship bar (default answer at CP0 - force the question, do not assume)

This repo runs on one operator's machine, so the bar is NOT "production SaaS" by default. The
realistic bars, in order of ambition:

1. **Shareable prototype** - deployed somewhere the user can send a link, honest that it is a
   prototype, fast and correct on a phone and a laptop.
2. **Design-partner demo** - the above + every state a real production reaches is representable and
   legible, plus a `/uat` roster that passes L2.
3. **Product v1** - the above, hosted for users other than the operator. **This is a different
   project**, not a milestone: it needs its own architecture decision, and the loop should say so
   rather than accumulating backlog items toward it.

The repo name says `gcloud`, so bar 1 most likely means Google Cloud. **Do not assume it** - ask at
CP0 and record it, because the ops dimension is meaningless until the target is named.

## Gates (ordered - run top to bottom, sequentially)

| step | command | ratchet | when / notes |
|---|---|---|---|
| verify | `npm run verify` | every gate green | the ordered set declared once in `pipeline/gates.mts` (`node pipeline/run-gates.mts --list`): typecheck, lint ratchet, manifest, narration, the packages' structure/typecheck/unit/tokens gates, probes (`npm test`), build, bundle and the content gates |
| audit | `npm audit` | record, escalate real advisories | Boot and periodically; scored under dim 1 |
| browser | `GRAVITONE_PRODUCE_SIDE=fixture NEXT_PUBLIC_DEV_AUTH=1 GRAVITONE_STORE_PATH=<temp file> npx next dev -p 3177`, walk /floor, /board, /projects, /library, /audio, /ledger | no blockers | UI touched; LAST |

**Never invent a gate command.** Run what `pipeline/gates.mts` declares. A journal line claiming a
command the registry does not hold is fabricated evidence, and it is the easiest lie in this loop.

Browser pass: **never port 3000** - the user or a sibling session may hold it. Check the three
conditions that are cheap and always break - a 768px viewport, keyboard traversal with a visible
focus ring, and `prefers-reduced-motion: reduce`. Screenshot what you assert. Kill the server you
started; never kill one you did not start.

## Dimensions (overrides of the defaults)

| # | name | what it means in this product |
|---|---|---|
| 3 | Tests | **Stays honest.** "Gates green" means `npm run verify` green plus a driven browser, and every journal line names which gates ran. A gate that could not run (exit 2 on a `012` gate) is not a pass. |
| 5 | Design-language fidelity | Replaces the engine's packaging/security dimension. Scores: every design value from `packages/ui/tokens/source.json` (`tokens:check` green, generated files untouched); `@gt/ui` components reused rather than re-rolled; motion entrance-only and reduced-motion-safe; every surface able to render the states its types admit. The thing most likely to rot silently while the product looks fine. |
| 7 | Ops (hosting/CI/deploy) | Meaningless until the deploy target is named at CP0. Today: no target at all. |

Security is *narrow*: no secrets in the repo, every API route through `app/_server/route.ts`'s guard,
no `dangerouslySetInnerHTML` beyond a generated token stylesheet, and dependency advisories (`npm audit`). Score those under dimension 1 and
escalate anything real to a blocker immediately.

## Conventions

- **Single-owner files** - `packages/ui/tokens/source.json`, `lint-baseline.json` and `package.json`.
  Never hand two parallel agents write access to them. The generated `tokens.css` / `tokens.ts` are
  written only by `npm run tokens:gen`.
- **Port seam is repo law.** A screen reads its route's `_port` contract and `@gt/domain` types; no
  ad-hoc inline shapes. Reuse `@gt/ui` (`packages/ui/src/components/<dir>/`).
- **Premise-check before executing, with the local twist:** is the thing you are about to fix a
  product defect or a fixture value? Rewriting a component to fix a number that lives in a route's
  `_port/fixtureData.ts` is the characteristic wasted milestone here.
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

- **design-language fidelity** -> dim 5: `npm run tokens:check`, then grep for hex / `rgb(` / px in
  `app/(studio)` and `packages/ui` outside the generated files, hand-rolled components, JS-driven
  motion that escapes the reduced-motion rule.
- **functionality honesty** -> dim 2: does `README.md` claim anything the app does not do? Does any
  surface imply capability the fixtures cannot back? Dimension 2 scores what the *interface* can do -
  it goes green when a Character can complete the journey through the studio's screens, not when a
  fixture happens to contain a finished film.
- **ops/deploy path** -> dim 7: is there ANY deploy target? (Today: no.) What would the smallest be?
- scope: the contexts in `context-map.json` (it lags the Phase 6 deletions until rescanned); use it to target files.

## Feed the loop

A backlog item that turns out to be product design rather than repair belongs in
`.vault/Perfect/directions/` with the user's acceptance - `/perfect` builds those; `/ship-loop`
hardens what exists.
