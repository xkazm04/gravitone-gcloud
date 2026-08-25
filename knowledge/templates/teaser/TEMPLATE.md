# Template — teaser (≤60s, target ~60s)

The short rung of a promotional family. It carries **the premise and one set-piece** and
deliberately does not tell the story.

This is the first of three templates whose product is an **unpaid debt** — see
[`trailer`](../trailer/TEMPLATE.md) and [`cinematic`](../cinematic/TEMPLATE.md), and the shared note
on why they are three ids rather than one in [`trailer/TEMPLATE.md` § Three contracts](../trailer/TEMPLATE.md#three-contracts-not-three-lengths).

## ⚠ Two gaps in the evidence, stated up front

**1 · The corpus for this template is n=0.** Nothing has been torn down, timed, or counted here. The
three educational templates in this library each rest on transcripts that were read in full and
scripts that produced numbers; this one rests on **doctrine written elsewhere** — the AI registry's
`media-generation/narrative-craft/trailer-structure` subject and a `.vault/` research dossier. Both are
cited line by line below and neither is a measurement made in this repo. Until a teaser is torn down
here, every figure on this page is a **norm stated by a source**, not a count.

**2 · The registry does not have one "teaser" rung — it has three below the long cut**, and this
template collapses them. Its `length-ladder` technique names *the teaser* (a context
section and one set-piece), *the spot* (three parts: a state, a consequence, a payoff; "opens within
the first few seconds because its audience is exceptionally impatient") and *the platform cut*
("hook-first, frequently silent-by-default"). One id covers all three here. That is a deliberate
simplification of the studio's taxonomy, not a finding, and it is `t1` in
[`steps/01-script/OPEN-QUESTIONS.md`](steps/01-script/OPEN-QUESTIONS.md).

## What a teaser is not

It is not a short trailer, and the difference is mechanical rather than stylistic. Shortening a
promotional cut **removes whole parts in a known order**; it does not scale them. The registry's
`length-ladder` states the failure the technique exists to prevent:

> "**uniform trimming**: shortening every part proportionally, which produces a cut where the setup is
> too short to establish anything, the escalation is too compressed to close a single rung, and the
> peak arrives before the viewer has stakes. Halving a cut does not halve its parts. It **removes**
> parts, in a known order."

So a teaser is not the trailer with less of everything. It is a **different part count** — two — and
the drop order in [`steps/01-script/PATTERNS.md`](steps/01-script/PATTERNS.md) §2 is what decides
which two.

## The format

| Property | Value | Source |
|---|---|---|
| Duration | **≤60s**; the studio default is 60 | OBSERVED · vault C7 (S30: teaser "only has to have one hook", ~1 min) · **n=0**, no cut timed here |
| Parts | **two** — a context section, and one set-piece | OBSERVED · registry `length-ladder`, "The teaser — effectively two" |
| Content | premise + one or two of the strongest moments; **not** the story | OBSERVED · registry `length-ladder`, same line |
| Register | "light on story, but heavy on imagery and tone" | OBSERVED · vault C7 quoting S3, a working game-trailer editor |
| Withholding default | hold the turn · hold the resolution · **imply** the reveal | OBSERVED · registry `withholding-budget` |
| Dynamic reset | **absent** at this length | OBSERVED · registry `length-ladder` drop order #4 |
| Opening | first few seconds, visual-first | OBSERVED · registry `length-ladder`; vault C2 |
| Frame density | **nothing measured** | — · no `params.json`, on purpose |

The one figure in this table that is a hard external constraint rather than a norm is the ceiling: a
teaser that runs longer than a minute is not a long teaser, it is a short trailer, and it should be
directed as one.

## Sources

**None in this repo.** There is no `sources/` directory and no `corpus/` directory under this
template, and that absence is the honest state rather than an oversight. The two documents this
template is derived from live outside it:

| | What it is | Grade |
|---|---|---|
| AI registry · `media-generation/narrative-craft/trailer-structure` | golden path + six techniques, `status: forged`. The authority for structure. | doctrine, forged |
| `.vault/Research/2026-08-23-trailer-cinematic-grammar.md` | 31-source research dossier, ~25 searches. **`.vault/` is gitignored and the repo calls it disposable** — claims are cited with their own confidence grade and source class, never imported wholesale. | research dossier |

Both are cited inline throughout, with the claim id (`C7`, `C2`) or the technique name, so a reader
who disagrees can go and read the original.

## The steps

| # | Step | Studio phase | Knowledge |
|---|---|---|---|
| 01 | **Script** | Script | [`steps/01-script/`](steps/01-script/) — **n=0**, doctrine only |
| 02–05 | Frames · Motion · Score · Cut | — | not started |

## What makes this template hard

1. **Every rule from the educational templates runs backwards.** Those formats answer the question
   they raise; a withheld answer in one of them "reads as not having one". Here withholding is the
   product. A director carrying habits over from `short-form-clip` will compose the plate that
   resolves the thing this piece exists to withhold, and it will look like good work.
2. **The parts you drop are not the parts that feel droppable.** The drop order puts *exposition and
   the setup act* first and the *title, call-to-action and button* last — which is counter-intuitive,
   because the button is the part that most looks like garnish. The registry's reason: the first two
   "are contractual and are the only thing the cut is actually buying", and the button "carries the
   highest quote-to-a-friend value per second of any part."
3. **The cue survives and the picture does not.** For a short cut the standard construction keeps the
   music's opening and its climax and custom-edits the middle to connect them. So the picture's
   structure is the thing being sacrificed, which is a strong statement about which layer this format
   treats as load-bearing — and it inverts the dependency order most video tooling assumes.
4. **There is no way to check whether it worked.** The registry is explicit: "A structural checker can
   establish that a cut is malformed; it cannot establish that a cut works." The instrument
   practitioners use is a survey, and this studio has no survey.
