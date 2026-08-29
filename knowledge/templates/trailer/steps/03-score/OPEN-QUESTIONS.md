# Open questions — trailer score step

Opened 2026-08-29, when the Score step got a knowledge directory at all. Before this, **no template
in the library had a score, music or audio step** — every number the Score surface showed a creator
was invented, and the two builders working on that surface could not supply the truth about a cue
because this repo had never written it down.

**This step is n=0 for the craft** — no trailer cue has been torn down, timed or counted here — with
**one local measurement, n=3**, which measures this repo's own demo fixture rather than the craft
([`corpus/bar-math.mjs`](corpus/bar-math.mjs)).

---

### s1 · What integrated loudness does a trailer cue ship at? ⭐ blocking the technical gate
The acceptance subject numbers two destinations and pointedly declines the third: *"streaming
platforms normalize to the neighbourhood of −14 LUFS; broadcast delivery specs sit near −23/−24 LUFS
depending on region; **theatrical and trailer chains run their own, louder regimes with their own
compliance measures.**"* The one destination this template is named after is the one with no number.
`params.json` records it as `null` rather than guessing, and it is the most tempting single value in
this whole directory to invent: a plausible LUFS figure is four significant digits of pure authority
sitting on a delivery gate.
*Settles it:* the destination's own published spec — once this studio knows what its destination
actually is, which may be a platform (where −14 applies and this question dissolves) rather than a
trailer chain at all. **Until then the loudness row must render `unmeasured`, never green**, and the
true-peak ceiling (−1 dBTP, −2 for the lossy path this vendor delivers on) is the only number from
that family this template may state.

### s2 · There is no instrument. Nothing in this repo measures a delivered file. ⭐
`grep -rniE "lufs|dbtp|loudness" app lib components` matches three comments saying so and no code.
The acceptance subject's whole spine is *"what could be checked against the plan is checked
deterministically; the ear is reserved for what only an ear can judge"* — and this repo currently has
neither instrument wired to a gate: no duration check against the plan, no section-boundary check, no
loudness, no true peak. The registry's own application note about this repo says the same thing from
outside: *"acceptance is manual: the duration measurement above was run by hand, not by a scripted
gate."*
*Settles it:* not research — building it. The measurements are cheap and standard (the registry's
node application used `ffprobe` for duration), and the ORDER is doctrine: deterministic pass first,
and it gates the listen. Until one exists, every acceptance verdict this product shows is a listen
wearing a checklist's posture.

### s3 · One section per scene makes the bar math unreachable. Is that the right section boundary? ⭐ design
**MEASURED** ([`corpus/bar-math.mjs`](corpus/bar-math.mjs), n=3 cues / 5 sections): 0 of 3 cues and 0
of 5 sections land on a whole number of 4/4 bars at their declared tempo, so `cueToPlan` never asks
for the "hard ending on the beat" it was built to ask for. Worse than a wrong tempo: for cue-1 and
cue-2 there is **no integer tempo between 60 and 160** that lands both of their sections plus the
whole cue, because a 6-second span and a 7-second span share no bar length in that range. The
registry's remedy — *"the caller then adjusts bpm, not the picture"* — cannot apply, because no bpm
works.
So the choice is real: either section boundaries stop being one-per-scene and become musical (the
cue's own movements, which is what `cue-first-assembly` says they are), or the accent stops being the
section edge, or scene lengths are chosen with the bar grid in mind. **All three are legitimate;
drifting into "the brief always says cut to picture, not to the bar" by accident is not** — which is
what happens today, on every section, silently.
*Settles it:* a decision, not research. It is the same shape as
[`01-script/OPEN-QUESTIONS.md` r3](../01-script/OPEN-QUESTIONS.md), and probably the same decision.

### s4 · The duck: a missing number, or a missing layer?
A missing layer. *"Do not ask the generator to 'get quieter when someone talks'; it cannot hear the
narrator, and the request spends style budget on a mix problem"* — the duck is automation at the mix,
and this repo has no mix. The `−6dB` that used to ride in a cue's note was removed during this same
wave and demoted to a declared-not-performed row, which is the correct treatment. What this document
CAN supply is the brief-side substitute the source names: **brief the narrated region thinner**, on
the instrumentation and motion axes.
*Settles it:* building a mix layer, or continuing to declare it. Not a knowledge question, and it
should stop being filed as one.

### s5 · Can a trailer cue's shape be expressed as a per-scene section plan at all? ⭐
The two audio subjects are about **briefing and accepting generated music**. Neither says what a
trailer cue *is*. The only description of that in the whole registry is in the narrative-craft
bundle: *"a mood opening; an exposition section where a rhythmic device enters and establishes pace; a
response section that adds drive; a build; a peak of full energy; and a brief closing phrase, drawn
from the peak's material, that sits under the title and end cards"* — six movements, chosen for
**edit affordances** (hits, fills, breaths, a beat of silence between sections), not for how they
sound.
That shape is a property of the *cue*. This studio's section plan is a property of the *picture*, one
section per scene. Nothing establishes that the two can be the same list, and `APPROACH_STYLES =
["rising energy"]` is the place where they are currently assumed to be: an exposition section is
where a device *enters*, not where energy *rises*.
*Settles it:* a source teardown of one real trailer cue with its movements timed — which would also
be the first genuinely local evidence on this step, and would make `s3` decidable rather than
arguable.

### s6 · The recurrence rule needs a record this repo does not keep
*"A defect class that appears in consecutive takes from the same brief has stopped being generation
noise and become a property of the brief–model pair. Stop re-rolling: the same request will keep
buying the same defect."* That is the single most economically valuable rule in the acceptance
subject, and it needs takes to persist across a session with their classified failures attached. In
this repo takes live as object URLs and die with the tab.
*Settles it:* persistence plus a class on every fail. Cheap once takes are stored; impossible before.

### s7 · `MusicProvenance` is provenance, and it is not yet a rights record
It carries vendor, model id, requested ms, the plan, and a timestamp — real, and better than most
pipelines have. The four facts the rights record needs and it lacks are exactly the four the source
says evaporate: **which account** generated it, **on which plan tier**, **under which terms**, and
**referencing what material**. *"An asset without a record is not cleared, however it sounds"*, and
*"a vendor's commercial grant is routinely non-retroactive across plan changes."*
*Settles it:* four fields, written at generation time. The reason it has not been done is that it
looks like paperwork; the reason it must be is that the facts are unreconstructable later.

### s8 · What would a source teardown even be for this step?
Every other step in this library has a corpus shape: a transcript, read in full, with a `metrics.py`
beside it. A score step's equivalent is a *cue* — and a cue cannot be read, it has to be listened to
and timed, which is a different instrument and a different cost. The nearest cheap approximation is a
published trailer whose cue's section boundaries can be marked by ear against its picture, producing
movement durations and the position of the reset.
*Settles it:* deciding what this library will accept as an audio source teardown, and whether a model
listening is admissible evidence or only a human. **Until that is decided this step cannot move off
n=0**, and the honest thing is to keep saying so.

---

## Not asked

**Whether a cue is good.** The same refusal the structural checker makes, arrived at independently by
the acceptance subject: *"a piece can hit every offset and be dull, which is the conformance listen's
territory, and no meter's."* A conformance sheet establishes that a cue is what was briefed. It
cannot establish that the brief was worth writing.

**What tempo a trailer cue "should" be.** Not an open question — a malformed one. The doctrine gives
a derivation, not a number, and `params.json` refuses the field rather than leaving it blank as
though somebody might one day fill it in. See `not_encoded.defaultBpm`.
