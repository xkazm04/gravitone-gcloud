# English style: Gravitone

The delta over the registry's `english` subject (rule IDs `EN-*`). This file cites rules and
never restates them. Declared values live in [`copy-contract.json`](copy-contract.json) and
are checked by `npm run copy:check`.

## Declared mechanics

| Mechanic | Declared | Rule | Since |
|---|---|---|---|
| Spelling variant | US | EN-SPELLING | 2026-09-14 (operator, fleet-wide) |
| Em dash | banned in product copy | EN-DASH | 2026-09-14 (operator, fleet-wide) |
| Case, headings and buttons | sentence case | EN-CASE, EN-END-PUNCT | 2026-09-14 |
| Quotes, ellipsis | undeclared (no occurrences to count) | EN-QUOTES, EN-ELLIPSIS | 2026-09-14 |

## House rulings

- **The door is wordless** (landing brief, `app/_landing/parts.tsx`). The only visible
  string is the verb on the button; the art carries the rest. New landing copy is a change
  to that brief, not an addition to it. Buttons name what happens next ("Sign in with
  Google", not "Enter", for a signed-out visitor; see EN-LINK and the subject's microcopy
  technique).
- **US English** (2026-09-14, operator). The extracted copy had no variant-marked word, so
  nothing needs migrating.
- **No em dash** (2026-09-14, operator). At adoption 5 em dashes sat in gated strings, all
  baselined; the layout description still carries its 3 as debt. The standalone no-data glyph
  and code comments are out of scope.
- **"Gravitone" is the official product name** (2026-09-14, operator) and stays in every
  title. Page titles are `Page | Gravitone` (the separator is `|`, never a dash); the site
  title and its verbatim sr-only `<h1>` read `Gravitone: a content studio`. Converted the same
  day from `Page — Gravitone` on six pages and `Gravitone — a content studio`.
- **Sentence case.** The button's capitals come from CSS `uppercase`; the string itself
  stays sentence case.

## Scope

Gated: page metadata (`app/**/page.tsx`, `app/layout.tsx`) and the landing
(`app/_landing/*.tsx`). Not gated: the signed-in studio (`app/_phases`, `app/_studio`,
`app/_library`, `components/`), the development inspector, `pipeline/`, `docs/`.

## The gate and its escape hatch

- `npm run copy:check` runs the whole scope against `.ai/copy-baseline.json` and fails only
  on NEW error findings; warnings print. `.githooks/pre-push` runs it on pushes to main,
  before `npm run verify` (hooks are wired by `prepare`: `git config core.hooksPath
  .githooks`). `GRAVITONE_SKIP_GATE=1` skips the whole gate, as the hook documents.
- It is **not** part of `npm run verify` or CI: the checker is the registry's gitignored
  `native-copy` link, absent from CI and fresh clones, and the hook says so loudly.
- A deliberate exception is made visible, never bypassed: an intentional string goes into
  the baseline (`npm run copy:check -- --baseline write`) in its own commit whose message
  says why. A rule wrong for this copy is set to `off` under `rules` in the contract, with
  the reason recorded here. Never `--no-verify`.
