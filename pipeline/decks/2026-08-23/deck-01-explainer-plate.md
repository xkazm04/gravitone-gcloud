# Deck 01 — Explainer plate (Signal Ledger house style)

**Aspect:** 16:9 (set as a parameter). **Rolls:** 2 per side. **Provider:** one, for the whole deck.

The house block below is `compileStyleBlock(Signal Ledger)` from `app/library/presets.ts`, exactly
as our compiler emits it. Every A side uses it verbatim; every B side changes ONE thing and says
which. The no-text clause is ours (`NO_TEXT_CLAUSE`). Beats are real ones from
`app/library/trials.ts` plus three new ones.

```
HOUSE BLOCK =
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams —
the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as
the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only
on the single element that carries the point, and nowhere else. matte, no gradients, generous
margins.

NO-TEXT = No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the
image.
```

---

## E01-01 · Lighting words on a flat plate
**Rule under test:** flat styles require *omitting* lighting/lens/material language (infographic C13; vendor stat: omit lighting → flat 80%).
**Beat:** HOOK · the record high, then half of it gone (`peak-and-fall`).

**A (house — no lighting words)**
```
HOUSE BLOCK

A single line rising steeply to a sharp peak near the top right, then falling away to roughly half its peak height. A small marker sits at the peak. Plain ground line beneath. Centred, large and simple, generous empty space around the curve.

NO-TEXT
```
**B (lighting added — the naive "make it nicer" move)**
```
HOUSE BLOCK Soft studio lighting from the upper left, gentle shadows under the shapes.

A single line rising steeply to a sharp peak near the top right, then falling away to roughly half its peak height. A small marker sits at the peak. Plain ground line beneath. Centred, large and simple, generous empty space around the curve.

NO-TEXT
```
*What the rule predicts:* B drifts toward rendered/3D — bevels, soft shadows, maybe gradients — and breaks "matte, no gradients". If B looks identical, the rule is model-specific and NB2 is immune.

---

## E01-02 · Caption dead space: adjacent vs generic
**Rule under test:** spatial contiguity — reserve the empty ground *next to* the focal element so the caption lands beside what it names (infographic C5, d=1.10), rather than "generous empty space" anywhere.
**Beat:** MOVEMENT 2 · the flywheel and the moment it inverts (`flywheel`).

**A (house — generic empty space)**
```
HOUSE BLOCK

A closed circular loop of three thick arrows chasing each other clockwise around a central stack of coins. One arrow, at the lower left, points the wrong way against the other two, breaking the circuit. Centred, large simple shapes, generous empty space.

NO-TEXT
```
**B (dead space placed beside the focal element)**
```
HOUSE BLOCK

A closed circular loop of three thick arrows chasing each other clockwise around a central stack of coins. One arrow, at the lower left, points the wrong way against the other two, breaking the circuit. The loop sits in the right two-thirds of the frame; the area immediately to the left of the reversed arrow is left completely empty, plain background only, so a caption can sit right beside it. Large simple shapes.

NO-TEXT
```
*What the rule predicts:* B gives a usable caption slot touching the reversed arrow; A's empty space is wherever the model felt like. Judge also whether B's off-centre composition still looks composed.

---

## E01-03 · Hex codes vs colour names only
**Rule under test:** hex colours are honoured by some models and ignored/rejected by others (cinematography 16) — do they help *our* provider hold the palette?
**Beat:** an inventory (`wish-list`): a row of unlike objects.

**A (names only — hex stripped)**
```
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy as the dominant background, paper cream for the objects, harbor cyan used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins.

Five unlike objects in one even row: a house, a car key, a graduation cap, a suitcase, a ring. Identical size, identical spacing, identical stroke weight. The ring alone carries the accent colour. Centred, generous empty space above and below the row.

NO-TEXT
```
**B (house — names + hex)**
```
HOUSE BLOCK

Five unlike objects in one even row: a house, a car key, a graduation cap, a suitcase, a ring. Identical size, identical spacing, identical stroke weight. The ring alone carries the accent colour. Centred, generous empty space above and below the row.

NO-TEXT
```
*What the rule predicts:* if hex is honoured, B's navy/cream/cyan are closer to the swatches and steadier across the two rolls. If A looks the same, hex is dead weight on this provider and can be dropped from the card.

---

## E01-04 · Negative list vs positive absence
**Rule under test:** negative prompts are dead on most 2026 models; phrase absences as positive conditions ("semantic negatives") (cinematography 15; creator rule 2).
**Beat:** an analogy (`booking-not-meal`): a reservation is not the dinner.

**A (house — the NO-TEXT negative list)**
```
HOUSE BLOCK

Split composition, left and right. Left: a small reservation card standing upright on a plain table. Right: a full plated dinner on the same table, steam rising. A thin vertical rule separates the halves. The plated dinner carries the accent colour. Large simple shapes.

No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
```
**B (positive absence — same intent, no negation words)**
```
HOUSE BLOCK

Split composition, left and right. Left: a small reservation card standing upright on a plain table — its face is a blank cream rectangle with a single folded corner, nothing written on it. Right: a full plated dinner on the same table, steam rising. A thin vertical rule separates the halves. The plated dinner carries the accent colour. Large simple shapes. Every surface is a plain silhouette: the card, the plate, the table all read as clean blank shapes.
```
*What the rule predicts:* the reservation card is the text-bait object. Count letters/scribbles on it in A vs B. If A leaks glyphs and B doesn't, semantic negatives go into the compiler; if neither leaks, NB2 honours our negative list and the clause stays.

---

## E01-05 · Subject count cap
**Rule under test:** detail fidelity collapses past ~3 figures; cap subjects per plate and imply the rest (infographic C12; I2V ≤2 subjects).
**Beat:** "most people who tried it gave up" — a crowd thinning to one.

**A (naive — the crowd drawn)**
```
HOUSE BLOCK

Nine identical standing figures in a three-by-three grid. Eight of them are fading, drawn with broken dashed strokes; the one at the centre is solid and carries the accent colour. Centred, generous empty space.

NO-TEXT
```
**B (capped — three figures, the rest implied)**
```
HOUSE BLOCK

Three identical standing figures in a row. The two outer figures are fading, drawn with broken dashed strokes; the centre figure is solid and carries the accent colour. Behind them, a faint row of plain dashes at figure height suggests many more without drawing them. Centred, generous empty space.

NO-TEXT
```
*What the rule predicts:* A's figures drift (limb count, stroke weight, sizes vary); B holds one language. Judge whether B still *says* "many gave up".

---

## E01-06 · Use-case sentence (and the five-slot form on gpt-image)
**Rule under test:** stating the USE CASE makes the model fill unspecified choices consistently (creator rule 21; Google rule 3). On gpt-image, the labelled five-slot block with a Constraints slot (creator rule 3).
**Beat:** a scale comparison — one reference object (infographic C18).

**A (house — no use case)**
```
HOUSE BLOCK

A shipping container on the left and, beside it at true relative size, a single coin. Both on one plain ground line. The coin carries the accent colour. Centred, generous empty space above.

NO-TEXT
```
**B (use case stated — prose on NB2; five-slot on gpt-image)**
NB2 form:
```
HOUSE BLOCK

This is one plate for a narrated educational explainer video; a spoken caption will be placed beside the main object by our own typesetting, so the plate itself stays wordless and leaves room for it.

A shipping container on the left and, beside it at true relative size, a single coin. Both on one plain ground line. The coin carries the accent colour. Centred, generous empty space above.

NO-TEXT
```
gpt-image form (use this instead of the prose on gpt-image):
```
Scene: one plate for a narrated educational explainer video; a caption will be typeset beside the main object later, so the image is wordless and leaves room for it.
Subject: a shipping container on the left and, beside it at true relative size, a single coin, both on one plain ground line; the coin is the only accent-coloured element.
Important details: HOUSE BLOCK
Use case: explainer video frame, 16:9, to be read at a glance.
Constraints: no text, letters, numbers, labels, logos or watermarks; no gradients; no shadows; exactly two objects; generous empty space above.
```
*What the rule predicts:* B's plating, margins and finish are more consistent across rolls and more "explainer" in feel (size, calm, legibility). On gpt-image, the Constraints slot should cut stray extras.

---

## E01-07 · Style as a SYSTEM vs style as a picture
**Rule under test:** define a system (shape logic, line discipline, forbidden textures), not a picture, because a system transfers to new subjects (creator rule 6; Recraft "define systems, not objects").
**Beat:** flow — two streams meeting (`the-exit`): sellers pouring out, few buyers.

**A (house)**
```
HOUSE BLOCK

A wide funnel seen side-on. Many small squares pour in from the top; a thin trickle of squares leaves at the narrow bottom. The trickle at the bottom carries the accent colour. Centred, large simple shapes, generous empty space.

NO-TEXT
```
**B (house + shape system)**
```
HOUSE BLOCK Shape system: every object is built only from circles, rounded rectangles and straight lines; one stroke weight throughout; all corners share the same radius; fills are flat; no texture, no pattern, no hatching.

A wide funnel seen side-on. Many small squares pour in from the top; a thin trickle of squares leaves at the narrow bottom. The trickle at the bottom carries the accent colour. Centred, large simple shapes, generous empty space.

NO-TEXT
```
*What the rule predicts:* B's many small squares are uniform and the funnel reads as one language; A invents texture or mixed stroke weights. This is the clause most likely to graduate into the house block if it wins.

---

## E01-08 · Order: style first vs subject first
**Rule under test:** our house order (style first, because CLIP-era models truncate) vs the creators' order (type of image → subject → … → style last, because earlier tokens win and NB2/gpt-image don't truncate) (cinematography 13; creator rule 5).
**Beat:** a timeline — three moments on one line.

**A (house — style block first)**
```
HOUSE BLOCK

Three circles evenly spaced on one horizontal line, left to right, each a little larger than the last; the third carries the accent colour. Generous empty space above and below.

NO-TEXT
```
**B (subject first, style last)**
```
A flat vector editorial illustration of three circles evenly spaced on one horizontal line, left to right, each a little larger than the last; the third carries the accent colour. Generous empty space above and below.

Style: hairline strokes of even weight; objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins.

NO-TEXT
```
*What the rule predicts:* on a non-truncating model, B may hold the *subject* (exactly three, sizes ascending) more precisely while the style holds either way. If A and B tie, keep the house order (it is safer on truncating vendors).

---

## E01-09 · Accent spent once, named
**Rule under test:** spend the accent colour exactly once per plate, on a named element (infographic C3 + our assigned-colour-roles technique). The house block says "the single element that carries the point" — does *naming* the element in the subject line matter?
**Beat:** mechanism — a lever.

**A (house role phrase only — the element left to the model)**
```
HOUSE BLOCK

A long lever resting on a small triangular fulcrum set far to the right. A large heavy block sits on the short right end; a small hand presses down on the long left end. Side view, centred, generous empty space.

NO-TEXT
```
**B (accent element named)**
```
HOUSE BLOCK

A long lever resting on a small triangular fulcrum set far to the right. A large heavy block sits on the short right end; a small hand presses down on the long left end. The fulcrum alone is the accent colour; every other shape is paper cream. Side view, centred, generous empty space.

NO-TEXT
```
*What the rule predicts:* A puts cyan on two or three things or on the wrong one; B puts it on the fulcrum only. If A already behaves, the role phrase is doing the work and the compiler doesn't need the extra clause.

---

## E01-10 · Deliberate imperfection
**Rule under test:** a little texture/irregularity separates "explainer" from "ad" and from AI-flat (infographic C10, counter-evidence on Corporate-Memphis flatness).
**Beat:** the hook again (`peak-and-fall`) so you can compare with E01-01 A.

**A (house — matte flat)**
```
HOUSE BLOCK

A single line rising steeply to a sharp peak near the top right, then falling away to roughly half its peak height. A small marker sits at the peak. Plain ground line beneath. Centred, large and simple, generous empty space around the curve.

NO-TEXT
```
**B (house finish swapped for imperfection)**
```
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins; strokes very slightly uneven as if drawn by hand, a faint even paper grain across the whole ground.

A single line rising steeply to a sharp peak near the top right, then falling away to roughly half its peak height. A small marker sits at the peak. Plain ground line beneath. Centred, large and simple, generous empty space around the curve.

NO-TEXT
```
*What the rule predicts:* B reads warmer/more authored; risk is the grain becoming noise or the model over-doing "hand-drawn". This one is pure taste — your call decides whether imperfection enters the house finish.
