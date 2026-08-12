# The visual style layer

**Cross-template**, and the visual sibling of [`TONE.md`](TONE.md). `TONE.md` is the personalisation
layer for the *words*; this is the personalisation layer for the *picture* — what makes two videos
from the same studio look like they came from the same studio.

It sits above the per-step docs on purpose. A style is not a property of the Frames step or the
Motion step; it is a property of the **project**, which both steps must obey. Filing it inside
`02-frames/` would have been the mistake that makes Motion re-derive it and drift.

**n=1.** Everything here rests on a single tutorial —
[`frmwrkd--ai-vox-motion-graphics`](templates/short-educational-video/steps/02-frames/sources/frmwrkd--ai-vox-motion-graphics.md)
(FRMWRKD-EXPLAINED, 2026-08-12). Three sibling `/research` runs the same day covered adjacent ground
and are cited where they corroborate. **Nothing below is MEASURED.**

---

## 1 · The two-block law

**OBSERVED · n=1 · [00:03:33], restated [00:16:15]** — *"So, I had a style lock, replaced the action."*

A generation prompt is two blocks with **different lifetimes**:

| Block | Lifetime | Holds |
|---|---|---|
| **Style** | the whole project | palette · typography · element vocabulary · background treatment |
| **Action** | one shot | what happens in this frame or clip |

The failure this prevents is the one every practitioner reports first: generate shot by shot from
free prose and each shot invents its own look. The style block is authored once and never retyped.

**Corroborated** by the OpenArt Director run ([[2026-08-12-vox-style-ai-motion-graphics]]), which
reaches the same conclusion by a different route and adds the important upgrade: the style block is
not a string, it is **an approval gate that produces approved reference boards**. Style is a thing
the user *ratifies*, not a thing they type.

## 2 · The style block is carried by an image AND by text — never by the image alone

**OBSERVED · n=1 · [00:09:38]** — the load-bearing rule of the source, and the one with a named
failure:

> *"I tried to also leave the style block here and it was actually not working because it transformed
> style mid video."*

Attaching the approved reference image to a generation is **necessary and not sufficient**. Drop the
textual style block and the look drifts *inside a single clip*. So the style block must be restated
at every hop — including the hop from a picked still into motion.

**This is the rule with the sharpest consequence for the studio's data model**, because it means a
motion prompt is not self-contained: it inherits.

## 3 · The reference sheet

**OBSERVED · n=1 · [00:03:33]** — the style block's physical form is a **reference sheet**: one
generated image carrying the look, in the tradition of a character sheet. Authored before any shot,
attached to every generation.

Two routes run from it, chosen per shot ([00:04:33]):

- **sheet → video** (reference-to-video) — the default. *"Sometimes you don't need to generate an
  image at all."* [00:16:15]
- **sheet → still → video** — required when the shot contains **logos or faces**, because the still
  must be approved (and sometimes repaired) before it moves.

## 4 · Style onboarding: a style is captured, not composed

**OBSERVED · n=1 · [00:05:03], repeated [00:05:34]** — *"take a screenshot and ask basically AI to
enhance it with you"* / *"take a screenshot and then try to ask AI to regenerate something like this
for the specific style you are looking for."*

The workflow for acquiring a new look is:

```
find a reference (Pinterest, an existing frame, the user's own past work)
      ↓  screenshot it
vision model reads it back as a STYLE BLOCK  (colours · type · elements)
      ↓  human edits the block
generate the reference sheet from the block
      ↓  approve
the block + the sheet are now the project's locked style
```

**Why this matters more than it looks.** It makes style **describable in words the user can edit**,
which is what turns a one-off look into a reusable *theme*. The three sibling runs of 2026-08-12 all
recorded style onboarding as **"concept confirmed, mechanism absent"**; this is the mechanism.

**ASSUMED** — that a block extracted this way is stable enough to reuse across *projects* rather than
within one. The source only ever reuses it within one video. Owed an OPEN-QUESTION.

## 5 · Block size: the model's real constraint

**OBSERVED · n=1 · [00:06:04], [00:06:34], summarised [00:16:15]**

| Survives generation | Degrades |
|---|---|
| Big type, bold captions | Fine/micro typography |
| Simple, sustained movement | Fancy movement over a long clip |
| Large elements, clear silhouettes | Dense small detail |

Stated as a design rule, not a complaint: *"Try to think in big blocks."* The corollary is that
**long clips must be calm** and dynamic movement is affordable only in short bursts.

## 6 · The truth test — who draws the pixel

**INFERRED** (rests on §5 and the source's Remotion comparison at [00:13:44]–[00:16:15]).

The generative route cannot be trusted with anything a viewer could check:

> *"if numbers and accuracy is that what you're looking for, then we are still not there yet"* — [00:16:46]

So the routing rule is not stylistic, it is epistemic:

> **If a viewer could check the frame against a fact, code must draw it.
> If the frame only has to feel right, a model may.**

Charts, exact values, precise labels, anything data-bound → drawn programmatically (DOM/SVG/canvas,
composited over the plate). Atmosphere, camera moves, illustrative scenes → generated.

The practitioner's own summary refuses the either/or: *"it's not this or that ... it's really the
hybrid approach that wins"* [00:15:45]. The same conclusion is reached independently by
[[2026-08-12-vox-style-ai-motion-graphics]] on captions — *"the captions must be composited"*.

## 7 · Refusal is a state, not an error

**OBSERVED · n=1 · [00:08:36]** — Gemini refused every generation containing a recognisable public
figure. The fix was not a re-prompt; it was a **re-route across vendors plus a postprocess**: GPT
text-to-image → image-to-image to lay a black bar over the eyes → reference-to-video.

Two rules fall out:

1. A frames pipeline on one vendor has a hard policy edge, and crossing it means **a different model
   for one hop**, not a better prompt.
2. **Refusal must be a first-class state the surface can render** — with the reason and the re-route
   offered. A refusal shown as a generic failure teaches the user nothing and invites a retry that
   cannot succeed.

---

## What this layer still does not know

Tracked properly in
[`02-frames/OPEN-QUESTIONS.md`](templates/short-educational-video/steps/02-frames/OPEN-QUESTIONS.md).
The three biggest: whether a style block survives reuse across projects (§4), what the element
vocabulary of the Vox style actually is as a closed list, and whether any of §5's block-size rules
hold as measurements rather than as one practitioner's impressions.
