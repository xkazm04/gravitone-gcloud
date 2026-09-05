# Concept · the clock as an input, not a caption

**From:** uat drain 2026-09-05-compose (C-002; LE-L1-1/2/3, HA-L1-1, KW-L1-3, DA-L1-10, MA-L1-5,
SO-L1-2/3/4, YU-L1-4/5, AM-L1-9). **Status:** open.

## Where we are after 2ad36a7
The runtime the creator owns reaches the header pill and is now **stated** on both Script halves
("your clock is not read here yet"). It is read by nothing below the wizard: the explainer renders
carry their own durations (45/250/300 s), and `composeCut` hard-codes `rung: long-cut · lane:
wide-release` over the same eight Glass Harbor slots for teaser, trailer and cinematic. Sofia's
verdict: "two sentences on one page that disagree" — the ladder passes a long cut above a note
saying the clock was never read.

## Explainer half — a rule, then the arithmetic
- Lena's subtraction (B-004) is the floor: `0:45 · +5 s over your 40 s at 150 wpm`. The operands
  are on the step.
- The rule to decide: which wpm (the render's image-led 150, or a per-project narration-led 180–190
  the creator declares), and whether the word meter's band derives from the project clock or stays
  the render's budget. Proposal: the project declares a delivery mode on the name stage (image-led /
  talking head), the wpm follows it, the band is derived from `targetS`, and the render's own
  budget is shown as "as written".
- The catalogue has no 8–15 min educational band (DA-L1-10). Adding one is a knowledge/templates
  decision (a measured corpus), not a UI change; until then the template stage should say "past six
  minutes nothing is measured" before the pick, not after.

## Trailer half — a seam, then the fixture
- `slotsFor(discipline)` becomes `slotsFor(discipline, template, targetS)`: the teaser deals the
  parts the drop order keeps ("two parts, not four" already lives in `lib/formatBrief.ts`), the
  cinematic keeps the trailer's parts, and the cut's `rung` is set from the template rather than
  hard-coded. The ladder rule then judges a declaration the creator actually made.
- Lane: a control on the trailer Script (wide-release / specialty) — `types.ts` already names the
  specialty lane as a recognised shape; a festival teaser is one (SO-L1-4).
- Allowances: a one-line gloss per allowance and a template default (teaser: hold the turn, hold the
  resolution, imply the reveal) — SO-L1-5.
- Carry `rationale` and `risk` from the picked variants onto the cut so the structure panel can list
  them as declared/unmeasured (MA-L1-8, declined until this seam exists).
- The fixture: a model run from `pipeline/BEATS-PROMPT.md` reading logline + template + targetS is
  what replaces `GLASS_HARBOR_SLOTS`; the seam above is what it needs to write into.

## Constraints
- Keep every disclosure that landed on 2026-09-05 until the value it discloses is actually read.
- Fixtures may grow richer, never happier: a teaser fixture must include a dropped-part declaration
  so the ladder's "not-engaged" state is reachable.
