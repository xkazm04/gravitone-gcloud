# The frames prompt — beat → infographic plate

A model-fit probe for Step 3. Paste it into Leonardo unchanged, once per model, and score the
results against the rubric below. The subject is a real beat from the repo's own run
(`runs/2026-08-11-why-bitcoin-price-does-not-rise/script--derived-short.md`, the treasury flywheel
reversing) so the test measures the work we actually do, not a showcase.

**This is a full-frame probe.** It asks for one complete composed explainer frame — panels, rules,
several unlike objects and their spatial relationships — not a single element to be assembled
later. A model that draws one clean icon tells you almost nothing: icons are the easy case, and
every model passes. What separates them is holding *one visual language across five unlike things
inside a single image*, which is also the closest single-image proxy we have for the real
requirement (holding that language across forty images). An earlier element-level version of this
probe is in git history at `bd3d0aa` if you ever want the easy baseline.

---

## What this is testing, and why it is shaped this way

Three axes, deliberately separated so a result can be diagnosed rather than just liked:

**Precision.** Most of the prompt is binary-checkable: three unequal panels in a stated order,
exactly three arrows, exactly one of them reversed and cyan, four descending steps each wider than
the last, a bottom fifth left empty. None of that is a matter of taste. It is there because Step 3
will constantly ask for *a specific arrangement that carries a claim* — an infographic is a
sentence, and a model that renders four arrows when told three cannot be trusted with one.

**Creativity.** One element deliberately says *what it must communicate* and not *what to draw* —
the invented emblem for a promise made and not kept. This is where you judge taste. A model can be
obedient and dead; the emblem is the slot where it gets to be good.

**Style.** The frame contains a building, a balance, arrows, a step chart and an invented emblem —
five unlike things. Holding one flat vector language across all five, at one stroke weight and one
colour assignment, is the property that makes a project look like a publication instead of a
folder of images.

Underneath all three: the frame is a **plate**. Captions, numbers and callouts are our vector
layer, drawn from the notebook's `facts[]` — so the model draws no text, and leaves dead space for
that layer to land in. Text leakage is the one unconditional fail.

---

## The prompt — paste as one block

> Flat vector editorial infographic, one complete explainer frame — a full composition, not an
> icon. Wide 16:9. Deep ink navy (#0B1B2B) ground; warm paper cream (#F5EFE0) for every object and
> rule; bright cyan (#67E8F9) used only on the single element that breaks. Matte finish, hairline
> strokes of even weight throughout, hard geometric shapes, generous empty space. No gradients, no
> shading, no photographic texture, no 3D rendering.
>
> Two thin cream hairlines divide the frame into three vertical panels of unequal width: the left
> panel widest, the right panel narrowest.
>
> Left panel: a tall corporate office tower seen straight on, flat and windowless except for a
> regular grid of small square openings. It stands on the left pan of a simple two-pan balance
> scale; a single oversized plain coin sits on the right pan; the tower's pan rides visibly higher
> than the coin's.
>
> Centre panel: a closed circular loop of exactly three thick arrows chasing each other clockwise.
> Two are cream. The third, at the lower left, is cyan and points the wrong way, against the other
> two, breaking the circuit.
>
> Right panel: a line descending from top left to bottom right in exactly four flat steps, each
> step wider than the one above it, drawn in cream on bare ground.
>
> Somewhere in the upper area of the left panel, place one small emblem of your own invention that
> stands for a promise that was made and then not kept. Keep it geometric, simple, and in the same
> flat vector language as everything else.
>
> The bottom fifth of the frame is completely empty navy ground with nothing in it. The top-right
> corner is left clear.
>
> No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.

**Negative prompt** (for models that take one):

> text, letters, numbers, words, typography, labels, captions, watermark, signature, logo,
> photorealistic, photograph, 3D render, gradient, glow, bevel, drop shadow, noise texture,
> clutter, busy background, tiny details, ornate

**Settings:** 16:9 explicitly (e.g. 1472×832) — never left to the model's default; a Step-3 render
that silently comes back 9:16 is a whole batch lost. Four generations per model before judging:
one sample measures luck, not fit.

---

## The rubric

Score each generation. The spread across four is the finding, not the best of four.

### Precision — count it, do not eyeball it

| # | Check |
|---|---|
| 1 | Three panels, divided by two hairlines, **left widest and right narrowest** |
| 2 | Tower on the left pan, coin on the right, **tower's pan higher** |
| 3 | **Exactly three** arrows in the loop |
| 4 | **Exactly one** arrow cyan, at the lower left, **pointing against** the other two |
| 5 | **Exactly four** descending steps, each **wider** than the one above |
| 6 | Bottom fifth genuinely empty; top-right corner clear |
| 7 | Three colours only, with cyan **nowhere except** the reversed arrow |

A model landing 5+ of these is a serious candidate. Below 3 it is a mood board generator, whatever
it looks like.

### Creativity — judge it

8. **The emblem.** Did it invent something, and is it *legible as an idea* — does a broken promise
   read? A model that skipped the emblem failed an instruction; one that drew a generic padlock
   obeyed without thinking; one that found something apt and simple is the one you want. This is
   the only check where your taste is the instrument, and it is the check most likely to decide the
   pick between two models that tie on precision.

### Style — the consistency that matters

9. **One language across five unlike things.** Do the tower, balance, arrows, steps and emblem
   share a stroke weight and a construction logic, or does the frame read as five clip-art pieces
   pasted together? This is the single-image proxy for cross-frame consistency.
10. **Flatness held under load.** Gradients, glows and fake depth tend to creep in as a scene gets
    busier — a model clean on a simple icon can break here. That is the point of a full frame.
11. **Text leakage.** Any glyph, rune or letter-like mark. *Unconditional fail* — our captions are
    vectors precisely because models hallucinate letters, and a model that cannot stay silent
    cannot hold the plate layer at any level of quality elsewhere.

---

## Two caveats before you compare scores

**Prompt length is not neutral across architectures.** CLIP-conditioned models (the older
SD-family ones) see roughly the first 77 tokens and silently drop the rest — which here means they
get the style block and the panel division, and never see the emblem or the reserved space. If a
model misses everything after the centre panel, suspect truncation before you conclude
incompetence; re-run it with only the style block plus the left panel to confirm. The style block
is deliberately first for this reason.

**Style-lock fidelity is model-specific.** A block tuned on Leonardo is evidence about Leonardo,
not about what Nano Banana Pro honours in production. This probe discovers whether the *method*
holds — locked style block, no text, reserved margins, assigned palette, countable composition —
not the production style block itself. Re-run it against the production model before any of these
numbers are quoted.
