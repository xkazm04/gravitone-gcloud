# 02 · Frames — craft rules

**State: opened 2026-08-12, n=1. This is a stub with a spine, not a settled document.**

The cross-cutting rules live in [`knowledge/VISUAL-STYLE.md`](../../../../VISUAL-STYLE.md) — the
two-block law, the reference sheet, style onboarding, block size, the truth test, refusal. **Read it
first.** This file holds only what is specific to the Frames step, and it deliberately holds little,
because one tutorial is not enough to write craft law from.

Sources so far:
- [`frmwrkd--ai-vox-motion-graphics`](sources/frmwrkd--ai-vox-motion-graphics.md) — a tutorial, ASR
  captions, sponsored. Method evidence only; no measurement.

Three sibling `/research` runs on 2026-08-12 read adjacent sources
([[2026-08-12-vox-style-ai-motion-graphics]], [[2026-08-12-claude-vox-style-motion-graphics]],
[[2026-08-12-vox-style-animation-free-tutorial]]) and their notes live in `.vault/Research/`. They
corroborate §1 and §6 below; they are not folded in here as evidence because this library cites
sources it has read in full, and those runs read different videos.

---

## 1 · A frame is generated against a locked style, never from free prose

**OBSERVED · n=1.** Every frame in a project inherits the project's style block and reference sheet;
the per-frame prompt carries **only what changes** — the action, the subject, the composition.

The anti-shape: a frame whose prompt is a complete standalone description with the style re-typed
into it. It looks harmless and it is how a project's look drifts frame by frame, because each
re-typing is a chance to say it slightly differently.

## 2 · The still is optional; the sheet is not

**OBSERVED · n=1 · [00:04:33], [00:16:15].** Reference-to-video can skip the still entirely. Force
the still only when the shot must be **inspected before it moves** — logos, faces, or any element
whose correctness a human has to sign off.

Consequence for the step's surface: "generate a still" is a **choice with a reason**, not a fixed
stage of the pipeline.

## 3 · Compose in big blocks

**OBSERVED · n=1 · [00:06:04].** Large type survives generation; micro typography does not. Frames
should be composed so the information is carried by few, large elements.

**Unmeasured, and it matters.** Nobody has established *how* large — no point size, no share of
frame, no character count. Until someone does, this rule can steer a composition but must not become
a validator. See OPEN-QUESTIONS.

## 4 · Data-bearing frames are not generated

**INFERRED** from `VISUAL-STYLE.md` §6. A frame that carries a number, a chart or an exact label is
composited: the plate may be generated, the data layer is drawn. This is a routing decision the
Frames step must be able to express, because it changes what the step even produces — a finished
image vs a plate plus a layer spec.

## 5 · Candidates are compared against the sheet, not against each other

**ASSUMED** — nobody has checked this, and it is written here because the surface already implies a
choice. `FramesLightbox` offers three candidates per scene and a pick. If §1 holds, the pick's real
criterion is *"which of these is most faithful to the locked style while doing the action"* — not
*"which is prettiest"*. If that is right, the sheet belongs on screen next to the candidates.

---

## No `params.json` yet — on purpose

The library's contract says `params.json` mirrors rules the UI consumes as defaults and ranges.
Every number this source could supply (how big is "big type", how long is a "calm" clip, how many
candidates) is either absent from it or an impression. Writing a `params.json` now would launder
those impressions into machine-readable authority, which
[`knowledge/README.md`](../../../../README.md) names as worse than a gap: *"an estimate laundered
into the library is worse than a gap, because the gap is fixable and the estimate is invisible."*

It gets written when a second source supplies real numbers.
