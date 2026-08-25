# Open questions — teaser script step

Opened 2026-08-25, when the three promotional templates were added to the catalogue. **This template
is n=0 and was written entirely from doctrine authored elsewhere**, so almost everything here is
open — the list below is the subset that would change what the studio builds.

---

### t1 · Is one `teaser` id right, or are there three rungs down here? ⭐
The registry's `length-ladder` names **three** cuts below the long one and gives each a different part
count: *the teaser* (two parts — a context section and one set-piece), *the spot* (three — "a state, a
consequence, a payoff"), and *the platform cut* ("hook-first, frequently silent-by-default, with the
opening seconds doing the whole job"). This template collapses all three into one id with a
`range` of 15–60s — which is the uniform-trimming model the same technique names as the defect, one
level up.
*Settles it:* whether a Gravitone user ever ships more than one short cut of the same project. If a
project only ever produces one, the collapse costs nothing. If it produces a family, the collapse is
exactly the thing that makes the family inconsistent. **This is a product question, not a craft one**,
and it should be asked of a user before another id is added.

### t2 · What would a `params.json` need, and why there isn't one ⭐
Per [`knowledge/README.md`](../../../../README.md), `params.json` is "the source of truth for ranges
and defaults a surface shows", and per
[`short-educational-video/steps/02-frames/PATTERNS.md`](../../../short-educational-video/steps/02-frames/PATTERNS.md)
shipping one over impressions is the defect: *"an estimate laundered into the library is worse than a
gap, because the gap is fixable and the estimate is invisible."* **Nothing in this template has been
measured in this repo**, so there is none.

For the record, a real one would need at minimum:

| Field | What it would hold | What it needs first |
|---|---|---|
| `partCount` | `2`, as a fixed value rather than a range | already stated by the registry — this one is the only field that could be written today |
| `duration.{min,default,max}` | the band | a corpus of teasers, timed. The ≤60s figure is a norm, not a count |
| `dropOrder` | the five-step ordering, as an ordered enum | already stated; but no counts exist behind the ordering, so a `confidence` field would have to say so |
| `wordBudget.{min,max}` | narration length | **nothing.** The `short-form-clip` template measured 110–235 words at 40–60s from n=3; nobody has checked whether a promotional cut at the same length behaves at all like an explanatory one, and the wordless case (see `cinematic` C29) suggests it does not |
| `rungCount` | escalation rungs | zero to one at this length, by the drop order — but the boundary between "one rung" and "one set-piece" is undefined |
| `floorS` | below which the output is one image + CTA | the registry says "a fifteen-second cut", which is a practitioner's round number, not a measurement |

*Settles the file as a whole:* a corpus. Three to five teasers with known parent cuts, timed, with
their parts identified. Until then the honest artifact is this table.

### t3 · There is no campaign object, so the budget cannot bind ⭐
`withholding-budget` says the mechanism that prevents the form's most common breach is binding one
budget **to the campaign, not to the cut** — "This is the step that does the actual work, because
single cuts rarely breach; series do." And `length-ladder`'s own *when not to use it* excludes "a
single-deliverable piece": "a cut with no siblings has no ladder, and the consistency machinery is
overhead."
A Gravitone project is one cut. **So the entity the doctrine binds to does not exist in the product**,
and the ladder is being applied slightly outside its stated condition.
*Settles it:* a decision about whether a project can own several cuts. If it can, the budget is a
project-level record and the ladder is real; if it cannot, both should be documented as adapted rather
than applied.

### t4 · Does the drop order hold when the parent is a script rather than footage?
The drop order assumes there is a long cut to remove parts *from*. In this studio a teaser may be the
first and only thing made, with no parent — so "derive downward" (`length-ladder` procedure §1: "A
ladder built upward from a spot produces a long cut that is a padded spot") has nothing to derive
from.
*Settles it:* comparing a teaser written directly against one derived from a full script of the same
project, judged for whether the direct one reads as a padded spot.

### t5 · Does the hook-shape set transfer from `short-form-clip`?
`PATTERNS.md` §5 claims contradiction / scenario / stake transfers unchanged, on the reasoning that the
constraint it solves is identical. That is an INFERRED claim spanning two formats with opposite
contracts, from a corpus (n=3) that contains no promotional cuts.
*Settles it:* three teasers, their opening shapes classified against the same three-way set, and a
note on anything that does not fit.

### t6 · Is the cue-shape rule usable without a cue?
`PATTERNS.md` §3 records that a short cut keeps the music's opening and climax and edits the middle.
The studio's Score step runs **after** Frames, so at Script time there is no cue and no boundaries to
plan against.
*Settles it:* the same question as `r3` in the trailer template — whether Score can move ahead of
Frames, or whether a temp-cue selection belongs in Script.

---

## Not asked

**Whether a teaser "works".** The registry is explicit that a structural check cannot establish it and
that the practitioner instrument is a survey. This studio has no survey and encoding a proxy for one
would be exactly the laundering this library exists to prevent.
