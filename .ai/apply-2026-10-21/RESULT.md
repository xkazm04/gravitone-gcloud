# Does per-slot angle seeding widen the idea round? (OPEN-QUESTIONS a2)

2026-10-21, registry technique `media-generation/narrative-craft/ad-concept-development/creativity-template-mechanisms`.

## Arms

- **B** - `pipeline/ADS-IDEAS-PROMPT.md` as shipped, compiled by `lib/ads/concepts.ts::ideasPrompt`
  for the RAINSHELL brief, ad-social-15, 15s, seeds 11 and 29 (`compile.mts`).
- **A** - the same text with ONE variable removed: the per-slot angle and the angle definitions
  (`makeA.mjs`; `diff B-11.md A-11.md`). Personas, forced connections, the long-list stages, the
  gates and the schema are unchanged. A still sees the angle enum in the schema, as a post-hoc label.
- Engine: one fresh model call per arm x seed (4 sets of 6 ideas). Answers condensed verbatim
  (title + leap + longlist) into `judge-sheet.md`; arms shuffled (`key.txt`: W=B-29, X=A-11,
  Y=B-11, Z=A-29) and labels stripped.
- Judge: a separate blind model call reading only the sheet. Its counts below. One judge, n=2
  sets per arm.

## Declared numbers

- **Target**: distinct leaps (same point through the same kind of device = one leap).
- **Floor**: ideas the judge called a category default, and the blind swap test; must not get worse.

## Result

| | B (forced) | A (unforced) |
|---|---|---|
| distinct leaps per set | 6, 6 | 4, 6 |
| distinct leaps over the arm's 12 ideas | 12 | 9 |
| distinct mechanisms per set | 6, 6 | 3, 4 |
| sincere demonstrations (no device) | 1 | 2 |
| longlist distinct leaps | 9/18, 8/15 | 6/18, 9/18 |
| floor: category default | 2 | 2 |
| floor: blind swap test passed | 0/12 | 1/12 |

A seed 11 collapsed twice inside one set (towel stack = drying rack; call-centre lobby queue =
fish-awning queue), and its six ideas used three mechanisms. A seed 29 kept six leaps but used four
mechanisms, two of them plain demonstration.

**Verdict: better, thin.** Every count moved toward B; neither floor moved. The per-set leap gap
lives in one A seed (seed spread 2 against an arm gap of 1), so on that count alone the pair does
not discriminate; mechanism spread (6,6 vs 3,4) does.

## What else the pair showed

- **The seed decides the content; the angle decides the spread.** Six cross-set leap clusters, three
  of them the same seed in both arms (the caterer seed gave a silver-cloche reveal in A and B).
- **The swap gate is self-graded and the blind read disagrees.** All 24 ideas carried
  `swap: "yes - ..."` from the generator; the blind judge passed 1. `parseIdeas` checks the gate's
  form, not its truth. This is OPEN-QUESTIONS a3's judge pass, measured from the other side.
