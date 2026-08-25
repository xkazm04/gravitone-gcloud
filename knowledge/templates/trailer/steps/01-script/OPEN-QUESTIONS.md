# Open questions — trailer script step

Opened 2026-08-25, when the three promotional templates were added to the catalogue. **This template
is n=0**: it carries the fullest doctrine of the three and the least local evidence of any template in
the library, because the doctrine was written elsewhere and nothing here has been counted.

---

### r1 · Do the two MEASURED figures transfer to AI-composed cuts? ⭐ blocking any checker
The only counted things on this template are a published analysis of **n=130 releases over sixty
years** (average shot length *and its variance* both decline; the reset shows as a shot-length spike
before the peak) and a nine-decade centre of gravity "just above two minutes" whose n is not given.
Both are counts of **theatrical film trailers**. This studio composes generated plates, at a plate
count nobody has measured, for works that are often not films.
*Settles it:* computing the same two statistics over any set of cuts this studio actually produces —
which is cheap once there is a Cut step that knows shot boundaries, and impossible before it. **Until
then, no downstream check may compare a cut against either figure**; they belong on the page as
context, not as thresholds.

### r2 · What would a `params.json` need? ⭐
Not written, per [`knowledge/README.md`](../../../../README.md)'s contract and the refusal precedent in
[`short-educational-video/steps/02-frames/PATTERNS.md`](../../../short-educational-video/steps/02-frames/PATTERNS.md):
*"an estimate laundered into the library is worse than a gap, because the gap is fixable and the
estimate is invisible."* What one would hold, and what each field is missing:

| Field | What it would hold | What it needs first |
|---|---|---|
| `parts` | the four + optional button, as a closed enum | **writable today** — the registry states it, and the vault's C1 converges on it from four sources |
| `raisedVariables` | scale · threat · speed · intimacy · cost, as a closed enum | **writable today** — same |
| `rung.minS` | "below roughly ten seconds per rung the closure disappears" | the word *roughly* is the source's own. It is a practitioner's threshold with no n behind it, and encoding `10` would drop that qualifier |
| `rungCount.{min,max}` | 2–3 for a short cut; 3–5 plausible at this length | the 3–5 figure is **inferred here from the rung floor and the duration**, which is arithmetic, not evidence |
| `duration.{min,default,max}` | 90 / 120 / 150 | a timed corpus. C7's band is a norm; the 2:30 ceiling is a real external rule and could be encoded as a hard `max` separately from the craft band |
| `resetCount` | exactly `1` | **writable today** — "when there are three or more, remove all but one" |
| `shotLength.curve` | the falling curve + pre-peak spike | `r1`. This is the one field that would be a genuine measurement, and it would be a measurement of something else until `r1` is answered |
| `withholding.assets` | turn · reveal · resolution · best moment · novum, × {spend, imply, hold} | **writable today as a vocabulary**, but the defaults ("hold the turn, hold the resolution, imply the reveal") are described by the registry as "the craft consensus, **where one exists**" — a `params.json` would erase that hedge |

The pattern: about half the fields are enumerations the doctrine states outright and could be written
now; every field that is a **number** is missing its evidence. That split is the argument for waiting
— a half-real `params.json` is read as wholly real.

### r3 · The studio's phase order encodes the inverted cue dependency ⭐ product-level
`cue-first-assembly`: "In a tool, model the cue as the timeline's parent, not as a track. A system
where beats carry timings and music is attached afterwards has encoded the inverted dependency, and
**every structural check it runs will be measured against positions the music does not mark.**"
`PHASES` is `research → script → frames → score → cut`. Score is fourth. So the picture is planned,
and the plates generated, before anything decides where the acts can fall.
*Settles it:* not research — a decision. Either (a) Score moves ahead of Frames for the promotional
templates, (b) Script gains a temp-cue selection step, or (c) the studio documents that it inverts the
form's dependency deliberately and that its structural checks are therefore advisory. **All three are
legitimate; drifting into (c) by accident is not.** Same question as `t6`.

### r4 · Can the promise ledger be run at all in a single-operator studio?
The ledger's pass has a hard precondition: "Do not consult the work while doing this — the whole value
of the pass is that it is done from ignorance, and **anyone who knows the work cannot perform it.**"
In this studio the person who wrote the script, directed the frames and cut the piece is the only
person who will ever see it before it ships.
*Settles it:* whether a model that has been shown only the cut — and never the script — can produce a
usable promise list. That is a testable question with the tooling already here, and it would be the
first genuinely local evidence on this template.

### r5 · Is the spine the right default for what this studio makes?
The registry says the four-part spine "is the grammar of **wide-release promotion**", and that
abandoning it is "the signature of the specialty lane" — mood-mapped cuts, held wides, no plot. The
vault's counter-evidence points the same way for a specific reason: C14's centre-framing rule "flips
when shots are >3 s", and mood-piece trailers "rely on held wides and off-center negative space".
An AI-composed cut with a small number of expensive plates has long shots by construction, which puts
it structurally closer to the specialty lane than to wide-release promotion.
*Settles it:* directing the same script both ways and comparing. Cheap, and it would tell the studio
which default it should ship.

### r6 · Which withholding position should the studio default to?
The registry refuses to resolve this and says so: the craft position holds the turn and the
resolution; "**the counter-practice is real, deliberate, and driven by measurement**", because viewers
consistently report the cut did not show them enough. "Nobody in the practitioner literature claims to
have solved it."
*Settles it:* nothing available here. The correct product move is to make the trade **visible and
recorded** rather than to pick a side in a default — which is what `r2`'s `withholding.assets` field
would be for.

### r7 · Is the button worth modelling separately?
It is optional, it has exactly one hard rule (smaller than the climax), and it is among the *last*
things dropped down the ladder because it "carries the highest quote-to-a-friend value per second of
any part." A part that survives to the shortest rungs and is optional at the longest is an odd shape
for a UI.
*Settles it:* observation, once any cuts exist.

---

## Not asked

**Whether a trailer "works".** The registry's own closing section: "A structural checker can establish
that a cut is malformed; **it cannot establish that a cut works**", and the instrument practitioners
use is a survey whose questions are almost never about the artifact. Encoding a proxy would be the
laundering this library exists to prevent, and the registry cites a law
(`unmeasured-is-not-pass`) requiring the gap be reported rather than covered.
