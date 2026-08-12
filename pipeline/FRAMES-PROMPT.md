# The frames prompt — beat → infographic plate

A model-fit probe for Step 3. Paste it into Leonardo unchanged, once per model, and score the
results against the rubric below. The subject is a real beat from the repo's own run
(`runs/2026-08-11-why-bitcoin-price-does-not-rise/script--derived-short.md`, the treasury flywheel
reversing) so the test measures the work we actually do, not a showcase.

---

## What this is testing, and why it is shaped this way

The Step 3 architecture bets that a frame is **two layers**: a generated *plate* (the illustration)
and a *data layer* we draw ourselves as vectors from the notebook's `facts[]` — every caption,
number and callout. The model never draws a fact. That bet only holds if a model can do five
things, and each clause of the prompt exists to test one of them:

| The bet | The clause that probes it |
|---|---|
| The model draws **no text** — glyphs are ours | the `No text…` line + the negative prompt |
| It leaves **dead space** for our layer to land in | the reserved bottom quarter and top-left corner |
| It holds a **strict three-colour palette** with a *semantic* assignment | navy ground / cream objects / **cyan only on the arrows** |
| It renders a **mechanism**, not just an object | the balance *and* the closed loop of arrows in one frame |
| It stays **legible at thumbnail size** | large simple shapes, no ornament |

The colour rule is deliberately assignment-based rather than a mood ("cyan only for the three
arrows"). A palette instruction a model half-honours looks fine in isolation and shreds consistency
across forty frames; an assignment either held or it did not.

---

## The prompt — paste as one block

> Flat vector editorial infographic illustration. Objects drawn as clean diagrams — the thing and
> the mechanism it belongs to share one frame. Strict three-colour palette: deep ink navy (#0B1B2B)
> as the dominant background, warm paper cream (#F5EFE0) for the objects, bright cyan (#67E8F9)
> used only for the arrows and nothing else. Matte finish, hairline rules, generous empty margins.
> No gradients, no photographic texture, no 3D rendering, no thick outlines.
>
> Subject: a simple two-pan balance scale, centred. On the left pan a tall corporate office tower;
> on the right pan a single oversized coin. The tower's pan rides clearly higher than the coin's.
> Around the scale, three bold flat arrows form a closed circular loop, suggesting a cycle that
> feeds itself. Large simple shapes, readable at thumbnail size. Wide 16:9 frame. The bottom
> quarter of the image is empty background with nothing in it; the top-left corner is left clear.
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

## The rubric — same six checks per model

Score each generation, not each model — the spread across four is the finding.

1. **Text leakage.** Any glyph, rune or letter-like mark? *Instant fail.* This is the load-bearing
   check: our captions are vectors precisely because models hallucinate letters, and a model that
   cannot stay silent cannot hold the plate layer.
2. **Palette obedience.** Three colours only? Are the arrows — and only the arrows — cyan? Did any
   fourth colour get invented?
3. **Flatness.** Gradients, glows, bevels or fake 3D smuggled in against instruction?
4. **Margin discipline.** Is the bottom quarter genuinely empty, and the top-left clear? Measure it
   rather than eyeballing — this is where the caption layer lands.
5. **Mechanism obedience.** Tower pan higher than the coin pan? Exactly three arrows, forming a
   closed loop? This is the proxy for whether the model can hold a *fact-shaped* instruction, which
   is what separates an infographic from an illustration.
6. **Thumbnail read.** Squint at it at 200px: is the mechanism still legible, or did detail creep in?

A model that passes 1 and 4 but fails 5 is still usable — mechanism can be moved into our vector
layer. A model that fails 1 is unusable at any price.

---

## The second pass — the style-lock test

One image cannot test the thing the library page exists for: whether a style block **survives a
change of subject**. Run the prompt again with the style paragraph byte-identical and only the
subject paragraph swapped:

> Subject: three ascending podium steps, centred, each step higher than the last, with a small flag
> planted on the top step. A single bold arrow begins above the flag and curves steeply downward,
> past the podium, to the bottom right. Large simple shapes, readable at thumbnail size. Wide 16:9
> frame. The bottom quarter of the image is empty background with nothing in it; the top-left
> corner is left clear.

Put the two side by side. If they do not read as the same publication — same weight of line, same
cream, same cyan — the model cannot hold a project style, whatever a single image looked like.
That is the finding the `/library` lock gate depends on.

---

## Caveat

**Style-lock fidelity is model-specific.** A block tuned on Leonardo is evidence about Leonardo,
not about what Nano Banana Pro honours in production. This probe discovers whether the *method*
holds — two-block prompt, no text, reserved margins, assigned palette — not the production style
block itself. Re-run it against the production model before any of these numbers are quoted.
