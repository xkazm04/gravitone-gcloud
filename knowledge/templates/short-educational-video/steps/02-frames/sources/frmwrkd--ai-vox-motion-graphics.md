---
source: "AI Vox Style Motion Graphics Are Finally Usable (Gemini Omni)"
channel: FRMWRKD-EXPLAINED
url: https://www.youtube.com/watch?v=_2105LHq1lI
duration: 1025s (17:05)
captured: 2026-08-12
transcript_kind: ASR (auto-generated captions — unpunctuated; NO sentence-level claim may be made from it)
corpus: corpus/frmwrkd--_2105LHq1lI.transcript.txt
step: 02-frames (and 03-motion — the method spans both)
sponsor: Artlist (disclosed at [00:07:35]) — see "What does not transfer"
---

# FRMWRKD-EXPLAINED · AI Vox Style Motion Graphics

## Read this first: what kind of source this is

**This is a tutorial, not exemplar work.** Every other teardown in this library reverse-engineers a
finished piece — its beat chain, its turns, its engine. This one cannot be read that way, and
pretending otherwise would put a method into the library dressed as a measurement.

What it *is*: a practitioner demonstrating a **production system** for generating Vox-style
infographic motion graphics, with a worked case study (a ~60s explainer on the AI-capex circle,
played in full at [00:00:00]–[00:01:00]) and a four-model bake-off. So the finding here is
**procedural craft** — how the frames get made and kept consistent — not narrative composition.
Narrative composition for this template still comes from `01-script/`.

**n=1, and one is not a law.** Nothing below is MEASURED. The strongest label this source can carry
is OBSERVED, because a single practitioner's workflow, sponsored by a platform that resells the
models he compares, is a hypothesis about craft rather than evidence about it.

---

## The system — the actual finding

The whole video reduces to one structural idea, stated at [00:03:33] and repeated as the first
summary item at [00:16:15]:

> **"So, I had a style lock, replaced the action."**

The prompt is not one blob. It is **two blocks with different lifetimes**:

```
┌─ STYLE BLOCK ────────────────────────────── locked for the whole project
│    colours · typography (e.g. all-caps) · the element vocabulary · background
│    ("we have the colors ... somehow the font ... and then you have the
│     elements we want to use here" — [00:05:34])
├─ ACTION BLOCK ───────────────────────────── swapped per shot
│    what happens in THIS clip
└──────────────────────────────────────────────────────────────────────────
```

The style block is authored **once**, as a **reference sheet** — a single generated image that
carries the look, in the same tradition as a character sheet or a style sheet ([00:03:33]: *"you are
probably familiar of those character sheets, style sheets ... I was trying this actually now with
motion graphics as well"*). Every later generation attaches it.

**OBSERVED · n=1 · The style block must be repeated in the VIDEO prompt even when the reference image
is attached.** This is the least obvious rule in the source and the one with a stated failure mode:

> *"Even though you are attaching this image here, you have to specify in a style section here that
> you want to have the style. I tried to also leave the style block here and it was actually not
> working because it transformed style mid video."* — [00:09:38]

Attaching a reference image is necessary and **not sufficient**. Drop the textual style block from
the motion prompt and the style drifts *within a single clip*.

### Two routes from sheet to clip

Both are in use, chosen per shot ([00:04:33]):

1. **sheet → image → video** — generate the still first, then animate it.
2. **sheet → video** (reference-to-video) — skip the still entirely.

Route 2 is the default when it works, and the summary makes skipping an explicit goal: *"Sometimes
you don't need to generate an image at all because the reference image is fine enough. So you can
skip the step entirely now."* [00:16:15]

Route 1 is required when **logos or faces** are involved ([00:04:33], [00:09:38]) — the still gets
approved, and only then animated.

### The refusal workaround, and why it changed the look

**OBSERVED · n=1.** Gemini refused to render clips containing recognisable public figures:

> *"Every time I wanted to bring in some known people, that's where Gemini blocked me basically."*
> — [00:08:36]

The workaround was a **three-hop chain**: GPT text-to-image → image-to-image to lay a black bar over
the eyes → reference-to-video. The bars were a compliance artefact that the creator then kept on
aesthetic grounds (*"that was actually by accident. Overall, I think I like it"* — [00:08:36]).

Worth recording for two reasons. First, it is the concrete shape of **postprocessing as a policy
tool**, not just a look tool. Second, it is evidence that a single-vendor frames pipeline has a hard
edge, and that the edge is crossed by **routing one hop to a different vendor**, not by re-prompting.

---

## Rules of thumb the source states

All **OBSERVED · n=1**, all from the practitioner's own testing rather than a measured trial:

| Rule | Anchor | Note |
|---|---|---|
| **Big blocks beat micro detail.** Large type survives; fine typography degrades. | [00:06:04] *"If you have big fonts then AI is struggling less than ... those micro tiny fonts"* | The single most repeated rule; restated in the summary as *"Try to think in big blocks."* |
| **Simple movement for long clips; wild movement only for short beats.** | [00:06:34] *"The less fancy the movement the less the AI is also struggling"* | Frames the motion prompt as a budget, not a wish. |
| **Numbers and exact data are still out of reach.** | [00:16:46] *"if numbers and accuracy is that what you're looking for, then we are still not there yet"* | The hard boundary of the generative route — see the split below. |
| **Style references are found, not invented.** | [00:05:03] Pinterest and similar named as the source of style references | Styles demonstrated: blueprint, clay, Vox. |
| **A style can be onboarded by screenshotting it.** | [00:05:03] *"take a screenshot and ask basically AI to enhance it with you"*; repeated [00:05:34] | Reverse-engineering a reference image INTO a style block is treated as routine. |

---

## The generative-vs-code split — the source's most transferable judgement

The last third ([00:13:44]–[00:16:15]) sets the generative route against **Remotion** (React
components rendered frame-by-frame to video). The creator refuses the either/or: *"it's not this or
that ... it's really the hybrid approach that wins at the end of the day"* [00:15:45].

| Choose **code** (Remotion) when | Choose **generation** (Omni) when |
|---|---|
| The number must be right — charts, data, exact values ([00:14:15]) | The shot needs dynamics and camera movement ([00:15:15]) |
| Typography is fine-grained | Speed and simplicity matter more than precision |
| You need to render at scale, programmatically — *"a thousand videos ... for literally nothing"* [00:14:45] | The shot is one-off and expressive |
| Cost matters | — |

**INFERRED** (rests on the two lists above): the split is not stylistic, it is about **who owns the
truth of the pixel**. Where a viewer could check the frame against a fact, code must draw it. Where
the frame only has to feel right, a model may.

The source also notes that parallax over stills is a *Remotion* capability, not a generative one:
*"for simple parallax effects and in specific now with the new re-motion effects here, you can really
do all kind of controls there as well and change images, backgrounds"* [00:15:15].

---

## The model bake-off

**OBSERVED · n=1 · not a fair test, and the source says so** ([00:11:11]: *"I know it's not a fair
comparison"*). Kling was run without a reference mode at all — start-frame only — which is the
capability being compared. Read the ordering, not the margins.

| Model | Verdict at [00:11:41]–[00:13:44] |
|---|---|
| **Gemini Omni Flash** | Best reference understanding, best typography survival, best physics; *"by far the cheapest model from those like top-tier models"* |
| **SeaArt 2** | Good on the surface, degrades on inspection (*"the numbers are really not great at all"*); still preferred for cinematic stills |
| **Happy Horse** | Poor |
| **Kling 3.0** | *"not usable in any way"* — but had no reference mode in the harness |

Weakness named for the winner: *"where it still could be better are the details and sometimes the
motion ... the understanding [is there], it's just the execution could be a tiny bit better."*

---

## What transfers to this studio

1. **The two-block prompt with different lifetimes** — a project-scoped style block, a shot-scoped
   action block. This is the structural idea, and it is the one worth building against.
2. **The reference sheet as a first-class project asset**, authored before any shot and attached to
   every generation.
3. **Restating style in the motion prompt** — carrying the style block forward from frames into
   motion, because the reference image alone does not hold it.
4. **The truth test for routing a shot** — checkable content goes to code, expressive content goes to
   a model.
5. **Refusal as an expected state with a re-route**, not an error to retry.

## What does not transfer

- **Every number in the bake-off.** One practitioner, one harness, one afternoon, an unfair test he
  labels as unfair, and a sponsor ([00:07:35], Artlist) that resells the models being ranked. The
  *ordering* is a hypothesis; the margins are not evidence.
- **"80 to 90% there"** ([00:01:00]) — a vibe, stated as one, and stated about the creator's own
  tolerance for artefacts after he cut the bad frames out (*"I was cutting out those mistakes"*
  [00:03:03]).
- **Any wpm/pacing/delivery reading.** The captions are ASR and the audio is largely a screen-share
  monologue; the corpus supports method claims, not measurement.
- **The narrative composition of the case-study clip.** It is played but never analysed. If its beat
  chain is wanted, it needs its own teardown under `01-script/`.
