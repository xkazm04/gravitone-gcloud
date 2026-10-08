# Improvement waves

One branch (`claude/gracious-euler-42slgl`), one PR, the whole app covered in waves. Every wave runs
the same trio over its scope, and every scope is a directory, so parallel work inside a wave never
touches the same file.

## The trio

**a) UI: layered, not printed.** Long reads become a nested experience: the first level is the
state of the work (counts, pips, verdicts, the one action that matters); the second opens on demand
(a section, a tab, a drawer); the third is the full record. This is done with the house vocabulary
(`components/ui/signal/`: `Tally`, `PipRow`, `TabRail`, `Hint`, `StackBar` …) and under the house law
(CLAUDE.md, "The app does not explain itself"): a paragraph about the app is deleted, not folded
away; a paragraph about the work stays verbatim, one level down if it is long. `npm run
check:narration` may only fall.

**b) Performance: load what is on screen.** Route-level code splitting for heavy client views (the
tree had zero `next/dynamic` imports when this started), memoisation where a render is measurably
hot, and, wherever a list reads an unbounded store (IndexedDB `getAll`, asset shelves, run logs,
ledgers), a window: paged reads or incremental reveal, never "everything, then filter".
`npm run check:bundle` is the referee.

**c) Product: is the feature at its best?** For each surface: what does the user come here to do,
how many steps does it take now, and what would make it one fewer? Shipped where the change is
local and safe (defaults, shortcuts, empty states that lead somewhere, bulk actions, remembered
choices); anything larger is written down as a proposal in the wave ledger, not built half-way.

## Rules every wave keeps

- Scope is a directory list. Shared code (`components/ui`, `lib`) is changed only in Wave 0 or by the
  integrator; a wave that needs a shared change asks for it.
- Behaviour that tests pin stays pinned: the Playwright suite and the regression gates pass after
  every wave (`npm run verify`, plus `cx-capture` for screens whose shape changed).
- No new explanatory slots on shared components, no `title=` paragraphs, a11y names never deleted.
- New files for a studio step stay inside its step directory (the map is shaped by directories).

## The waves

| wave | scope | why this order |
|---|---|---|
| 0 · foundation | `components/ui`, `lib` hooks, `next.config.ts`, route entry points | the primitives the others need: a nested-section disclosure, a windowed-list / load-more hook, the dynamic-import pattern |
| 1 · entry & shelf | `app/_landing`, `app/projects`, `app/_projects`; `app/studio`, `app/_studio`, `app/_phases/_shared`, `app/_library` | the first five minutes of every user, and the shell every step sits in |
| 2 · research & script | `app/_phases/research`, `app/_phases/script` | the two densest, most text-heavy steps (~18k lines) |
| 3 · frames, motion, score, cut | `app/_phases/frames`, `app/_phases/motion`, `app/_phases/score`, `app/_phases/cut` | the media steps: heaviest renders, biggest lists of candidates |
| 4 · library & foundry | `app/library`, `app/foundry` | the unbounded stores: assets, audio ledgers, style extraction runs |
| 5 · workbench | `app/playground`, `app/kit`, `app/board`, `app/calendar`, `app/articles` | internal and secondary surfaces |
| 6 · integration | whole tree | full gates, screenshots, context-map gate, the PR |

## Ledger

Each wave appends what it shipped, what it measured, and what it proposes but did not build.
