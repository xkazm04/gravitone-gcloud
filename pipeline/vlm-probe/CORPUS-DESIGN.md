# Corpus design — from *what a shot looks like* to *when to use it*

## The gap

The probe lane extracts **craft**: shot size, angle, lens register, lighting,
layers, composition, texture. It does that well enough to be worth scaling —
a local model beats a frontier API at it, and the replication lane shows the
geometric half of the vocabulary is sufficient to rebuild a shot from words.

None of that is knowledge of **application**. We can say a shot is a low-angle
close-up lit hard from one side. We cannot say *why that shot, at that moment*
— and the why is the entire transferable part. A corpus of craft labels is a
dictionary; what a director needs is usage.

## Why the current pipeline cannot close it

Three structural reasons, not tuning problems:

1. **The unit is wrong.** We annotate *frames*. Craft decisions are made per
   **shot**, and application is only legible across a **sequence**. A frame has
   no before and no after, so the one thing that explains a choice — what it
   cuts from and to — is absent by construction. A single frame also cannot
   report camera *movement* at all, which is a large fraction of the grammar.
2. **The question is wrong.** The schema asks a perceptual question: what does
   this look like. "Why this choice" is a *functional* question about story,
   and no amount of looking at pixels answers it. Adding fields to the craft
   schema will not help; it needs a second pass with a different question.
3. **Nothing knows what is happening.** There is no channel carrying the
   dramatic situation — who has power, what just changed, what the scene is
   for. Without it, "why" has nothing to attach to.

## Four layers

| layer | unit | question | status |
|---|---|---|---|
| 1. **Craft** | frame → shot | what does it look like | built (`probe.py`) |
| 2. **Function** | shot | what job is this shot doing | new |
| 3. **Sequence** | shot in context | what does it cut from/to, at what rhythm | new, cheap |
| 4. **Narration** | timestamp span | what is said over it | new, cheap |
| 5. **Extraction** | the corpus | what RULE does this support | new, cheapest |

**Layer 1 → shot-level.** Group frames by the shot boundaries scene detection
already gives us, sample 2–3 frames per shot (head/middle/tail) instead of one.
That alone recovers movement — a push, a whip, a settle — from the difference
between head and tail, closing a limit the frame-based schema has to declare.

**Layer 2 — function.** A separate pass, separate prompt, deliberately *not*
an extension of the craft schema. It asks what the shot is *for*, in a closed
vocabulary of dramatic jobs: establish, isolate, threaten, align-with,
distance-from, reveal, withhold, disorient, punctuate, connect, escalate,
release. The craft annotation is **not** shown to it — the anchoring result
from the reconciliation lane applies here with full force: a model shown the
craft labels will confabulate a function that rationalises them.

**Layer 3 — sequence.** Nearly free, since shot timestamps and ordering are
already recorded. Gives cut rhythm, shot-length trend (shortening = escalation
is the oldest trick in the grammar), and the neighbour pair each shot sits
between. Application lives here more than anywhere else.

**Layer 4 — narration.** `yt-dlp --write-auto-subs`, then the word-level
de-overlapping VTT parser already in this repo
(`knowledge/templates/*/steps/01-script/corpus/parse_vtt.py` — YouTube's
rolling captions repeat the previous tail, and that parser already handles it).
Align cues to shots by timestamp.

## Layer 5 — extraction. The step that was missing

Layers 1–4 all *capture*. Nothing in them turns captured data into a rule a
person can act on, which is why an operator looking at the pipeline's output
sees generation prompts and measurement tables rather than anything about
filmmaking. Capture is not knowledge.

Extraction is mostly plain aggregation over the joined layers, not a model
call. Run against this repo's existing corpus it already returns usable rules:

- **Shot length is bimodal, not fast.** 198 shots: median 1.04 s, but 47 under
  0.5 s *and* 30 over 4 s. Reporting the median alone destroys the finding —
  the grammar is long holds punctuated by bursts.
- **Tightness is inversely proportional to screen time.** Extreme close-ups
  hold a median of **0.33 s** against 1.06 s for ordinary close-ups. The
  tightest shots are percussion, not dwelling — so generating a beautiful
  extreme close-up and holding it is a grammar error no frame-level quality
  score can detect.

Both came from timestamps and craft labels already on disk, with no new
capture and no reasoning model. That is the point: the cheapest layer was the
missing one.

What extraction must respect: report **distribution shape, not just central
tendency** (the bimodality is the whole lesson); state **n per bucket**,
because a craft/duration table looks authoritative while resting on eight
samples; and keep rules **falsifiable** — "extreme close-ups run under half a
second in fast-cut action" can be checked against the next source, where "the
editing is kinetic" cannot.

## The insight that makes this affordable: two source classes, two label kinds

This is the part worth getting right, because it decides whether the "why"
layer is inferred (expensive, unverifiable) or **supervised** (cheap, checkable).

**Narrative clips** — an action sequence, a scene. Rich in craft *instances*.
But the transcript is dialogue: it tells you the dramatic beat, never the
reasoning. The "why" has to be inferred, and we have no way to check the
inference. This is what we have been collecting.

**Cinematography video essays** — a breakdown of how a scene was shot. The
narrator *states the technique and the reason out loud*, over the very frames
being discussed, timestamp-aligned. That is a labelled example of application,
produced by a human expert, for free.

So the corpus is a **join, not one pipeline**:

- essays supply the **rules** — "a low angle here because the character has
  just taken control of the room"
- narrative clips supply the **instances** — thousands of shots exhibiting
  those rules without commentary
- layer 3 supplies the **context** that lets an instance be matched to a rule

The current pipeline mines only the second class, which is the one that cannot
teach application. Adding essay ingestion is the highest-leverage next move,
and it costs almost nothing: same downloader, same scene detection, plus a
transcript parser that already exists.

A caution worth carrying: an essayist is an interpreter, not a witness. They
are reconstructing intent they usually did not have access to, and the
confident ones are not always the accurate ones. Treat essay claims as a
**second sighting** to corroborate, never as ground truth on their own — the
registry's own two-sighting rule applies unchanged.

## The measurable target: a prescription lane

Replication asked: *given a description, can we rebuild the shot?* That tests
comprehension. Application needs the symmetric test, run backwards:

> **Given the dramatic situation and what the previous shot was, specify the
> craft. Compare to what the filmmaker actually did.**

Hold out a shot. Provide only its function, its neighbours and the narration —
never its craft annotation. Ask for shot size, angle, lens, lighting.
Score against the real values with the same partial-credit scale the
replication lane uses.

The baseline matters more than the score: compare against **"always predict the
most common craft for this genre"**. Beating that baseline is the only evidence
that the corpus has learned *when*, rather than learned *what is frequent*.
Failing to beat it is a real and publishable result — it would say application
does not survive this representation, and we should find out cheaply.

## Build order

1. **Layer 5 first, against what already exists.** It needs no new capture and
   it is the only layer that produces something a person can read. Doing it
   last is how a corpus pipeline runs for months without stating a single rule.
2. **Shot-level regrouping** of the existing corpus — timestamps already
   stored. Recovers camera movement. Small.
3. **Layer 3** from the same timestamps. Nearly free.
4. **Essay ingestion** — download, scene-detect, transcript-align. Reuses
   `ingest.py` plus the existing VTT parser.
5. **Layer 2 function pass**, blind to craft.
6. **Prescription lane** against the frequency baseline.

## Open questions

- **Shot vs beat.** Application may be a property of the beat (several shots)
  rather than the shot. If layer 2 keeps returning the same function for whole
  runs of shots, the unit is wrong again and should move up.
- **Alignment slack.** A narrator usually explains a technique *just before or
  after* the clip runs, not over it. Cue-to-shot alignment will need a window,
  and the width of that window is an empirical question.
- **Who arbitrates function?** The reconciliation lane established that a
  frontier reasoning model is *not* automatically a better perceiver — it
  scored 75% against hand-labelled truth where the local vision model scored
  94%. Function is a reasoning question rather than a perceptual one, so that
  result may well invert. It must be **re-measured for this task**, not
  assumed either way.
- **Animation vs live action.** The genre vocabulary is written for live action
  and scatters on stylised animation. A corpus mixing both needs either a
  per-medium vocabulary or an explicit medium field.
