# Bundle v1 · style-01 · flat editorial — situations × recipes

Date: 2026-08-23 · Atlas: `.vault/Research/atlas/atlas-explainer-v1.md` · Score sheet: `pipeline/bundle/v1/score-sheet-style-01.csv` · Approach: `.vault/Research/2026-08-23-situation-atlas-approach.md`

## Style block (verbatim — `compileStyleBlock(Signal Ledger)` from `lib/stylePrompt.ts` + `app/library/presets.ts`)

```
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins.
```

## No-text clause (verbatim — `NO_TEXT_CLAUSE`, always appended)

```
No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
```

Every prompt below is exactly: `<style block> <scene sentences> <no-text clause>`, joined by single spaces. The style block is restated in full every time (it is never shortened — see the compiler's note 1). `59` words of style block + `17` words of clause are fixed; the **scene sentences are 55–110 words** (the 60–110 rule is applied to the variable part — the fixed part alone is 76 words), so a full prompt is ≈130–185 words / ≈850–1 200 characters, under the vendor's 1 500-character ceiling (`PROMPT_CHAR_LIMIT`).

## Model arms (frozen for the whole bundle — field guide § Test hygiene)

| arm | model | mode | style preset | prompt enhance | contrast | aspect / size | images | negative prompt | seed |
|---|---|---|---|---|---|---|---|---|---|
| **primary** | Phoenix 1.0 | Quality | None | OFF | Medium | 16:9 · 1472×832 | 4 | `text, watermark, signature, blurry` | random (record) |
| **secondary** | Lucid Origin | Fast | None | OFF | Medium (default) | 16:9 · 1456×816 | 4 | — (not supported; absences are phrased positively in the prose) | random (record) |

Same prompt text on both arms — the dialect is prose for both (field guide § Per-model dialect: Phoenix "long & literal", Lucid Origin "natural-language prose"). Never "Auto". Do not press Improve Prompt. No style/content/character references, no Elements in this bundle. Record the model name exactly as shown in the UI on the day.

Expectations going in (not results): Phoenix is the vendor's own pick for "stylized illustrations, vector-style, layouts requiring specific element placement"; Lucid Origin "adds intricate textures where you might want a cleaner look" and Fast mode is the vendor's mitigation. A Lucid plate that comes back textured is scored as it is (fail tag `style-drift`), not re-rolled.

## Scoring (anchored 1–10, copied from the approach doc)

| Score | Meaning (read against the stated Goal + Implied motion) |
| --- | --- |
| 1–2 | wrong: not the situation, or unusable (text leak, broken anatomy, wrong subject count) |
| 3–4 | recognisable but fails the goal (scale not felt, dread not there, mechanism unreadable) |
| 5–6 | achieves the goal weakly; would need an edit or a re-roll |
| 7–8 | achieves the goal; I'd start the scene from this frame after small fixes |
| 9–10 | I'd ship it as the scene's first frame as-is, and I can see the move working |

Score the **best of 4** (record which one, 1–4). One score per (prompt × model) row.

**Fail-tag list (fixed):** `text` · `anatomy` · `count` · `style-drift` · `composition` · `lighting` · `no-motion-affordance` · `caption-space` · `other`. (`caption-space` added for this bundle: the reserved dead-space came back filled/textured. `lighting` here means the model added shadows/gradients/3D shading to a flat plate.) One tag max; one word of note only when something surprised you.

## Prompt-writing rules applied (so a score is the recipe's, not the wording's)

- Scene sentences 55–110 words; no lighting, lens or material words (craft C13 — flat is enforced by absence); hex appears only inside the style block; ≤3 figures; absences phrased positively ("empty ink-navy ground", never "no X" — except the fixed clause); no product or company names; every scene is a beat from `pipeline/runs/2026-08-11-why-bitcoin-price-does-not-rise/script--reversal-chain.md`.
- R1 and R2 differ in the **recipe** (view / zoom / placement / device), never in style.
- The coin is always "a plain round disc"; the company is "a tall slab"; a share is "a blank certificate"; the fund is "a sealed vessel"; the machine is "a wheel".

---

## The 25 situations × 2 recipes

### X01-R1 · Cold open — the surprising fact — R1 side-on medium-wide, subject on the right third
Goal: one arresting thing at its extreme state; the viewer wants to know what happened next.  |  Implied motion: slow push on the disc (reliable; Ken Burns 1.0→1.25).  |  Risk: safe.
Recipe: side-on · medium-wide, subject ≈40 % · 1 subject right third · caption: left two-thirds + top band · accent: the disc · flat, no vignette in prompt
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Side-on view. A single plain round disc rests on the summit of a tall narrow plinth that rises from the bottom edge on the right third of the frame, the disc about a third of the frame height. The left two-thirds and the whole upper band are empty ink-navy ground, kept clear for a caption. The disc is the only cyan element; the plinth is cream. Every surface is a flat fill with hairline edges. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: 25 % breathing room around the disc; the disc sharp at full resolution (the push ends on it); empty ground truly empty so the crop stays clean.

### X01-R2 · Cold open — the surprising fact — R2 close, dead centre
Goal: same.  |  Implied motion: hold with idle (reliable) → match-cut to the question plate.  |  Risk: safe.
Recipe: side-on · close, subject ≈55 % · 1 subject dead centre · caption: bottom band · accent: the disc · flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Side-on view, close. One plain round disc sits dead centre, filling just over half the frame height, resting on a short cream plinth whose base touches the bottom margin. Equal empty ink-navy margins on the left and right, and an empty band along the bottom reserved for a caption. The disc carries the cyan; the plinth and the thin ground line are cream. Flat fills, hairline edges, nothing else in the frame. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: symmetrical margins so the same disc can be re-used centred in X02; one idle-capable element (the disc can bob) — if it comes back perfectly static, tag `no-motion-affordance`.

### X03-R1 · Define a term (mNAV) — R1 flat side-on specimen, close
Goal: an abstract ratio becomes one specimen object re-usable as an icon.  |  Implied motion: hold (reliable).  |  Risk: safe.
Recipe: flat side-on · close, 50–60 % · 1 object dead centre · caption: all margins, bottom widest · accent: the gap between the two heights · flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Side-on view, close. One emblem dead centre, filling about half the frame: a tall cream rectangular slab standing beside a shorter stack of cream discs on a shared ground line, both enclosed by a single thin cream outline so they read as one object. The gap between the top of the slab and the top of the stack is the only cyan element, drawn as a thin vertical bracket. All four margins are empty ink-navy ground; the bottom margin is the widest, reserved for the caption. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: nothing but stillness; the emblem must be clean enough to shrink into a corner icon later (continuity rule 3).

### X03-R2 · Define a term (mNAV) — R2 top-down specimen on a bed
Goal: same.  |  Implied motion: hold (reliable).  |  Risk: safe.
Recipe: top-down · close · 1 object centred · caption: all margins · accent: the defining part · flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Top-down plan view, close. One emblem centred on an empty ink-navy bed: a tall rectangular slab and a round stack of discs lying side by side, each drawn as a flat cream footprint with hairline edges, joined by a thin cream ring so they read as one specimen. The footprint of the discs is the only cyan element. Wide, equal empty margins on every side, the bottom margin widest for the caption. Nothing else on the bed. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: a readable footprint — if the plan view makes the ratio unreadable, that is the result (R1 wins for height-like terms).

### X04-R1 · Show the thing itself (the fund pipe) — R1 three-quarter eye-level
Goal: evidence that it exists and looks like this; no metaphor.  |  Implied motion: slow push on the inlet (reliable).  |  Risk: safe.
Recipe: 3/4 eye-level · medium · 1 subject centred, at rest · caption: bottom band · accent: the inlet · flat, locked
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Three-quarter eye-level view. A wide cream pipe enters from the left edge and feeds into a sealed, rounded cream vessel standing at rest in the centre of the frame, the vessel about half the frame height with room around it. The mouth of the pipe where it meets the vessel is the only cyan element. The bottom band of the frame is empty ink-navy ground for the caption; the rest of the background is plain ground. Flat fills, hairline edges, every part visible. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: the inlet sharp and on a third; the vessel's silhouette complete (it is re-used closed → open in Q4).

### X04-R2 · Show the thing itself (the fund pipe) — R2 isometric closed device
Goal: same, composed so the cutaway (X11) can open the same silhouette.  |  Implied motion: push on the inlet (reliable); the opening is the next plate's morph.  |  Risk: safe.
Recipe: isometric 30° grid · medium · 1 device centred · caption: upper-left triangle · accent: the inlet · flat faces
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Isometric view on a thirty-degree grid. A sealed rounded cream vessel sits centred, fed by a cream pipe that comes in from the lower-left along the grid, the whole device drawn closed with its silhouette intact. The inlet of the pipe is the only cyan element. The upper-left triangle of the frame is empty ink-navy ground for the caption. Flat faces, hairline edges, nothing decorative around the device. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: true parallel projection (a vanishing point means the isometric read failed → `composition`); the same section plane must be available for X11-R1.

### X05-R1 · Show scale (32 discs from a treasury of billions) — R1 side-by-side on one ground line
Goal: the ratio is felt; the point is "this is nothing".  |  Implied motion: hold, or pull-back revealing the big one (conditional from one still).  |  Risk: safe.
Recipe: side-on · wide · 2 subjects, small bottom-left / big right · caption: upper third above the small one · accent: the small stack · flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Side-on view, wide. On one shared ground line: a tiny stack of three small cream discs at the bottom-left corner, and a huge cream block, a vault-like mass, filling the right two-thirds from the ground to near the top edge. The tiny stack is the only cyan element. The upper third above the small stack is empty ink-navy ground for the caption. Flat fills, hairline edges, both objects at rest. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: both on the same baseline; for the pull-back the still must show ground at the edges; if the small stack is lost at this ratio, R2 wins.

### X05-R2 · Show scale — R2 containment (the small inside the outline of the big)
Goal: same; the ratio beyond ≈100:1 stays readable.  |  Implied motion: hold (reliable).  |  Risk: safe.
Recipe: side-on · medium-wide · 2 subjects nested, centred · caption: the empty interior · accent: the small disc · flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Side-on view, medium-wide. The thin cream outline of a huge vault-like vessel fills most of the frame, its interior empty ink-navy ground. At the very bottom of that interior sits one tiny round disc, the only cyan element. The empty interior above the disc is the caption space, and the margins outside the outline stay clear. Hairline outline, flat fill, nothing else inside or outside the vessel. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: the interior must come back empty (not filled cream) — a filled vessel kills both the caption space and the ratio.

### X07-R1 · Compare two (the booking vs the meal) — R1 split screen, hard seam
Goal: same camera, same scale, one difference.  |  Implied motion: hold; both halves can animate in sync.  |  Risk: safe.
Recipe: identical side-on both halves · medium · 2 subjects, one per half, hard vertical seam, mirrored · caption: bottom band · accent: the empty chair only · identical flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Two identical side-on views divided by a hard vertical seam down the exact centre. Left half: a cream reservation board on a small table, every slot of the board occupied by a blank cream tag. Right half: the same table drawn at the same size and height, bare, with one empty cream chair beside it. Both halves share one baseline and one framing. The empty chair is the only cyan element. A narrow empty band along the bottom of both halves is caption space. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: the seam crisp and central; equal object sizes (any size difference reads as a verdict).

### X07-R2 · Compare two — R2 two-shot on one ground line, no seam
Goal: same; the clip can pan from A to B.  |  Implied motion: slow pan left→right ending on the chair (reliable when slow with a named end).  |  Risk: safe.
Recipe: side-on · medium-wide · 2 subjects on opposite thirds, gutter between · caption: the gutter + band above · accent: the empty chair · flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Side-on view, medium-wide. Two objects stand on one cream ground line on opposite thirds of the frame with an empty gutter between them: on the left a reservation board with every slot occupied by a blank cream tag; on the right a dining table with one empty chair, drawn at the same scale on the same baseline. The empty chair is the only cyan element. The gutter between them and the band above are empty ink-navy ground for captions. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: lead room and a named landing (the chair) for the pan; the gutter must be empty ground, not texture.

### X08-R1 · Before / after (the value halved) — R1 locked pair, "before" frame
Goal: only the changed attribute differs; change detected instantly.  |  Implied motion: morph to the "after" (conditional — needs the pair).  |  Risk: safe (pair).
Recipe: locked side-on · medium-wide · same subject same placement both plates · caption: same band · before = objects tone, after = accent appears on the changed element · flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Side-on view, medium-wide, locked framing. A tall cream column stands on the left-centre third, rising from the ground line to about eighty percent of the frame height, with a plain round cream disc resting on its top. This is the first of two identical plates and everything in it is cream, the accent held back for the second plate. The right two-thirds and the top band are empty ink-navy ground for the caption. Flat fills, hairline edges. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: the "after" is this exact prompt with "column to about forty percent" and "the disc is the only cyan element" — generate it with the same seed; score the before on its affordance (same placement, clean band).

### X08-R2 · Before / after — R2 both states in one frame
Goal: a single still tells both states.  |  Implied motion: hold (reliable).  |  Risk: safe.
Recipe: side-on · medium · 2 states side by side on one baseline, same hue family differing by value · caption: band above · accent: the shorter pair · flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Side-on view, medium. Two cream columns stand on one ground line at the centre of the frame with a narrow gap between them: the left column tall, the right column exactly half its height, each with a plain round disc on top. The shorter column and its disc are the only cyan elements; the taller pair stays cream. The band above both columns and the outer margins are empty ink-navy ground for the caption. Flat fills, hairline edges. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: exact half-height; both discs identical in size (only height changes).

### X09-R1 · Cause → effect chain (more demand, fixed supply, higher price) — R1 three nodes on a baseline
Goal: "because of this, that" reads left-to-right before any words.  |  Implied motion: nodes appear left→right (object anim, drawn); hold.  |  Risk: safe.
Recipe: flat side-on, planar · wide · 3 objects evenly spaced, empty gaps for arrows · caption: below each node · accent: the cause (first node) · flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Side-on view, wide, strictly planar. Three cream objects stand evenly spaced from left to right on one thin ground line with wide empty gaps between them: a cluster of three small upright pegs on the left, a sealed box in the middle, a round disc on a short plinth on the right. The left cluster of pegs is the only cyan element. The gaps between the objects and the band beneath each one are empty ink-navy ground for arrows and captions. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: gaps wider than the objects (the arrows are ours); the accent on the first node so the eye lands there first.

### X09-R2 · Cause → effect chain — R2 tipping tiles
Goal: same, with mechanical motion affordance.  |  Implied motion: tiles fall left→right (object anim; ballistic verbs are reliable).  |  Risk: safe. (Trap: implies inevitability — keep for the "obvious model" beat only.)
Recipe: side-on · medium-wide · 3 tiles on a baseline, the first already leaning · caption: band above · accent: the leaning tile · flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Side-on view, medium-wide. Three cream upright tiles stand in a row on one ground line across the centre of the frame, evenly spaced; the leftmost tile already leans toward the second, about to touch it, while the other two stand straight. The leaning tile is the only cyan element. The band above the tiles and the margins are empty ink-navy ground for the caption. Flat fills, hairline edges, nothing else on the ground line. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: the pre-tension pose (the lean) must be visible; nothing in the landing zone.

### X10-R1 · A process, step 2 of 4 (participants create shares) — R1 side-on bench
Goal: one step happens; the viewer knows where in the sequence they are.  |  Implied motion: the step happens (object anim); camera static (reliable).  |  Risk: safe.
Recipe: side-on · medium · 1–2 objects + tool at a fixed anchor · caption: bottom band, same every step · active step in accent, idle steps cream · flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Side-on view, medium. A simple cream workbench runs across the lower half of the frame. On it, the second of four steps: a small cream press with a stack of blank cream certificates emerging from its right side; at the left end of the bench sits a sealed cream vessel, closed and idle. The emerging certificates are the only cyan element. The bottom band beneath the bench is empty ink-navy ground for the caption, the same band on every step. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: the press and vessel at fixed anchor positions so steps 1, 3, 4 are the same prompt with one clause changed; the certificates blank (any marks → `text`).

### X10-R2 · A process, step 2 of 4 — R2 isometric stations
Goal: same, for a process with spatial stations.  |  Implied motion: the active station animates; camera static.  |  Risk: safe.
Recipe: isometric 30° · medium · 4 stations on a diagonal bench · caption: upper-left triangle · accent: the active station · flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Isometric view on a thirty-degree grid, medium. Four small cream stations sit along a diagonal cream bench running from lower-left to upper-right: an inlet funnel, a press, a short conduit, a closed round vessel. The second station, the press with blank certificates emerging from it, is the only cyan element; the other three stations are cream and idle. The upper-left triangle of the frame is empty ink-navy ground for the caption. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: all four stations present and idle except one — the count is the test (`count` if the model drops a station).

### X11-R1 · Mechanism / inner workings (the treasury machine) — R1 isometric cutaway
Goal: how it works inside, parts legible in operation order.  |  Implied motion: push on the wheel (reliable); casing opening is a pair morph (conditional).  |  Risk: conditional (invented interiors).
Recipe: cutaway 3/4 isometric · close · 1 device, parts sectioned, casing as frame · caption: outside the casing · accent: the wheel · flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Isometric three-quarter cutaway, close. A cream machine casing fills the centre of the frame with its near faces removed, showing the inside: blank cream certificates feeding in from the left, a single large wheel in the middle, round cream discs collecting in a tray on the right, the parts arranged left to right in working order. The wheel is the only cyan element. The frame edges outside the casing are empty ink-navy ground for captions. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: the cut faces read as a section, not as a broken object; the wheel centred and sharp.

### X11-R2 · Mechanism / inner workings — R2 flat cross-section
Goal: same, planar, lower risk.  |  Implied motion: the wheel turns (object anim); hold.  |  Risk: safe.
Recipe: flat side-on section · close · 1 device on one plane, parts L→R · caption: band above · accent: the wheel · flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Flat side-on cross-section, close. One cream machine sliced open on a single plane across the centre of the frame: on the left a slot where blank certificates enter, in the middle one wheel, on the right a tray where round discs collect, all parts on one level in working order. The wheel is the only cyan element. The band above the machine and the margins are empty ink-navy ground for the caption. Flat fills, hairline edges. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: the wheel's axis centred (rotation symmetric); parts in reading order.

### X12-R1 · A system with feedback (the premium loop) — R1 top-down ring of icons
Goal: loop, not line — the topology before any node is named.  |  Implied motion: one node lights at a time (drawn); hold.  |  Risk: safe.
Recipe: top-down schematic · medium-wide · 4 icons on a ring, centre empty, no arrows · caption: the centre · accent: one node · flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Top-down schematic, medium-wide. Four small cream icons sit at equal spacing on an invisible ring around the centre of the frame: a tall slab at the top, a blank certificate on the right, a round disc at the bottom, a small stack of discs on the left. The centre of the ring is empty ink-navy ground for the caption, and the gaps between the icons are empty for arrows. The blank certificate is the only cyan element. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: the centre empty; equal spacing (a drawn ring can be overlaid only if the icons sit on a true circle).

### X12-R2 · A system with feedback — R2 literal wheel with four stations
Goal: same; sets up the catch (X21) on the same object.  |  Implied motion: the wheel turns slowly (object anim); hold.  |  Risk: safe.
Recipe: side-on · medium · 1 wheel centred, 4 stations on the rim · caption: band above · accent: the certificate station · flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Side-on view, medium. One large cream wheel stands centred on a short ground line, with four small stations fixed around its rim at equal spacing: a tall slab at the top, a blank certificate on the right, a round disc at the bottom, a small stack of discs on the left. The rim and spokes are cream hairlines; the certificate station is the only cyan element. The band above the wheel and the margins are empty ink-navy ground for the caption. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: the wheel re-usable verbatim in X21 (same prompt + one clause); the axis centred for rotation.

### X13-R1 · Zoom to detail (the portfolio → the one position) — R1 whole with the part accented
Goal: nested scale; the cut reads as a zoom.  |  Implied motion: push on the accented box (reliable, ≤1.3×).  |  Risk: safe.
Recipe: 3/4 · medium-wide · 1 whole + 1 highlighted part on a third with 25 % margin · caption: opposite corner · accent: the part · flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Three-quarter view, medium-wide. A cream shelf unit with three rows of identical closed cream boxes fills the lower-right two-thirds of the frame; one box on the middle row, on the right third, is the only cyan element and is drawn slightly larger and fully sharp. The upper-left corner and the margin around the shelf are empty ink-navy ground for the caption. Every other box is plain cream. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: the accented box sharp and on a third with margin; the detail plate (the box full-frame) must keep the cyan as its landmark.

### X13-R2 · Zoom to detail — R2 concentric, one plate
Goal: same in one plate.  |  Implied motion: hold (reliable).  |  Risk: safe.
Recipe: flat front-on · medium · 2 nested elements centred · caption: outer margins · accent: the inner part · flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Flat front-on view, medium. The thin cream outline of a shelf unit fills most of the frame, its interior empty ink-navy ground; nested inside it, centred, one single closed box drawn large, about a third of the frame, the only cyan element. The outer margins around the outline are empty ground for the caption. Hairline outline, flat fills, nothing else inside the outline. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: the outer outline must stay an outline (a filled shelf loses the nesting).

### X14-R1 · Timeline (order → peak → low → the sale) — R1 one era in focus
Goal: order and duration visible; one era in focus.  |  Implied motion: hold on the in-focus era; cut between eras.  |  Risk: safe.
Recipe: side-on wide, horizontal · 4 vignettes on one ground line, one enlarged at centre · caption: band above the line · accent: the in-focus marker · flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Side-on view, wide, strictly horizontal. Four small cream objects stand on one thin cream ground line across the middle of the frame at even spacing: a domed building on the left, a round disc on a plinth, a short broken column, a small stack of three discs on the right. The short broken column, third from the left, is drawn twice the size of the others and is the only cyan element. The band above the line is empty ink-navy ground for captions. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: a constant horizon; the four objects countable (the dates and the line are drawn by us).

### X14-R2 · Timeline — R2 built for the pan (edge-to-edge, landing on the last item)
Goal: same; the clip pans.  |  Implied motion: slow pan left→right ending on the last item (reliable when slow with a named end; programmatic beats I2V).  |  Risk: safe.
Recipe: side-on · wide · 4 items edge-to-edge, gutters wider than items, last item the landing · caption: upper half · accent: the landing item · flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Side-on view, wide. Four small cream objects stand on one ground line spread from the left edge to the right edge with gutters wider than the objects themselves: a domed building, a round disc on a plinth, a short broken column, and at the far right a small stack of three discs, which is the only cyan element. The whole upper half of the frame is empty ink-navy ground for captions. Flat fills, hairline edges, nothing between the objects. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: a landing object at the far right; continuable ground line; gutters empty.

### X15-R1 · Map / where (the capital) — R1 stylised top-down "where" bed
Goal: place the story; one region filled, everything else muted. (Production maps are DRAWN; this tests the stylised bed only.)  |  Implied motion: zoom in with fill (map-descent); hold here.  |  Risk: avoid for literal geography; conditional as a stylised bed.
Recipe: top-down · wide · 1 landmass outline, 1 filled region · caption: the calmest empty area (the ocean) · accent: the filled region · flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Top-down plan view, wide. A plain cream outline of a single generic landmass fills the centre of an empty ink-navy bed, drawn without internal borders or markings; one small region on its eastern edge is filled solid and is the only cyan element. The ocean around the landmass is empty ground, the largest calm area, reserved for the caption. Hairline outline, flat fill, nothing else on the map. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: the region fill clean-edged (the zoom keeps it as the landmark); if the model draws a recognisable real coastline, note it — it will be wrong.

### X15-R2 · Map / where → on the ground — R2 eye-level civic building
Goal: the institution, not the place.  |  Implied motion: hold / gentle push (reliable).  |  Risk: safe.
Recipe: 3/4 eye-level · medium-wide · 1 establishing object centred · caption: upper band · accent: the dome · flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Three-quarter eye-level view, medium-wide. One cream civic building with a central dome and a flat colonnade stands on a thin ground line in the lower two-thirds of the frame, centred, drawn as a generic emblem. The dome is the only cyan element. The upper band is empty ink-navy ground for the caption. Flat fills, hairline edges, nothing else in the frame. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: the dome as the landmark carried back to the map for the toggle; generic (a recognisable real building → `other`).

### X16-R1 · A number that matters (3.89 → below one) — R1 emblem + empty quadrant for the drawn number
Goal: quantity with consequence; the plate is only the bed.  |  Implied motion: the drawn mark grows (ours); hold.  |  Risk: safe.
Recipe: flat front-on · close · 1 emblem on the right half, left half reserved · caption: the left half · accent: the short stack · flat, no vignette
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Flat front-on view, close. One emblem on the right half of the frame: a tall cream slab beside a short stack of cream discs on a shared ground line, enclosed by one thin cream outline. The short stack of discs is the only cyan element. The entire left half of the frame is empty ink-navy ground, clean and flat, reserved for a large number. Hairline edges, flat fills, nothing else in the frame. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: the left half must be clean ground (tag `caption-space` if not).

### X16-R2 · A number that matters — R2 unit-pictogram field
Goal: a count or a share felt as a fraction of identical units.  |  Implied motion: units fill in (drawn); hold.  |  Risk: conditional — crowds of units collapse (C12); this is a grid-adherence test.
Recipe: top-down · wide · many identical units, a subset accented · caption: corners · accent: the first three · flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Top-down view, wide. A regular grid of identical small cream round discs, ten across and five down, fills the centre of the frame with even gaps between them; the first three discs of the top row are the only cyan elements. The corners and outer margins are empty ink-navy ground for the caption. Flat fills, hairline edges, every disc identical in size. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: a true regular grid; a wrong count is expected and is the finding (tag `count`), in which case the production path is the single unit glyph tiled by us.

### X17-R1 · Counterintuitive reveal (everything delivered → value halved) — R1 locked pair, expected state
Goal: flip the expectation in the same frame.  |  Implied motion: morph to the true state (conditional — pair).  |  Risk: safe (pair).
Recipe: locked side-on · medium · same subject both plates · caption: same top band · accent: the element that flips · flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Side-on view, medium, locked framing. A cream checklist board stands on the left third with five cream boxes down its side, each box filled solid; on the right third a plain round disc sits on top of a tall cream column rising from the ground line. This is the expected state. The disc is the only cyan element. The band across the top is empty ink-navy ground for the caption. Flat fills, hairline edges. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: the true state is this prompt with the column at half height, same seed; the expected state must look *right* (no tell).

### X17-R2 · Counterintuitive reveal — R2 the true state hidden inside (a closed lid)
Goal: same; the reveal is an object animation.  |  Implied motion: the lid opens (object anim, conditional — interior is invented).  |  Risk: conditional.
Recipe: side-on · medium · 1 board + 1 closed chest · caption: top band · accent: the lid seam · flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Side-on view, medium. A cream checklist board with five filled boxes stands on the left third; on the right third a closed cream chest with a hinged lid sits on the ground line, the lid shut and its interior out of view. The seam of the chest's lid is the only cyan element. The top band is empty ink-navy ground for the caption. Flat fills, hairline edges, nothing else on the ground line. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: the lid seam visible and the hinge side clear so the opening direction is unambiguous.

### X18-R1 · Common misconception (demand + fixed supply = higher price) — R1 proxy with a dashed thought bubble
Goal: the viewer sees their own wrong model depicted.  |  Implied motion: the wrong model collapses (object anim, conditional).  |  Risk: conditional (one figure).
Recipe: flat side-on · medium · 1 featureless figure + 1 wrong model in reduced (dashed) state · caption: beside the bubble · accent: the rising column inside the bubble · flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Side-on view, medium. A small featureless cream figure seen from behind stands on the left third; above it a large round thought bubble outlined in a dashed cream hairline holds the wrong model: three small pegs, a sealed box and a round disc on a rising column, all drawn in dashed outline. The rising column is the only cyan element. The right third beside the bubble is empty ink-navy ground for the caption. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: the dashed state must read as a ghost, not a second style; the figure back-view only.

### X18-R2 · Common misconception — R2 correct model over a ghost of the wrong one
Goal: same; the correction is a transform of the same structure.  |  Implied motion: the ghost fades, the solid holds (drawn); hold.  |  Risk: safe.
Recipe: flat side-on · medium · 1 model + its ghost in the same place · caption: right third + top band · accent: the corrected disc · flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Flat side-on view, medium. Two versions of one diagram occupy the same place in the centre: a faint dashed-outline ghost of three small pegs beside a box with a disc on a tall column, and drawn over it in solid cream the corrected version where the column is half the height. The corrected disc on the shorter column is the only cyan element. The right third and the top band are empty ink-navy ground for the caption. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: ghost and solid in register (same baseline); the ghost clearly lower in value.

### X19-R1 · Analogy (the booking, not the meal) — R1 flat emblem, side-on
Goal: the abstract graspable through one metaphor object; only the mapped attribute moves.  |  Implied motion: the mapped attribute animates (the chair); hold.  |  Risk: safe.
Recipe: flat side-on · medium · 1 metaphor object + 1 mapped detail · caption: right third · accent: the empty chair · flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Side-on view, medium. One open cream reservation book stands upright on the left-centre, every slot occupied by a blank cream tag; beside it, to its right, one small cream dining table with a single empty chair, drawn at the same scale on the same ground line. The empty chair is the only cyan element. The right third is empty ink-navy ground for the caption. Flat fills, hairline edges, nothing else on the ground line. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: the chair isolated enough to animate alone; the book's tags blank (`text` if marks appear).

### X19-R2 · Analogy — R2 staged as a small room, three-quarter view (soul version)
Goal: the metaphor is *experienced*; the clip pushes in.  |  Implied motion: slow push on the host stand (reliable).  |  Risk: safe.
Recipe: 3/4 eye-level · medium-wide · 1 metaphor scene · caption: upper band · accent: the book · flat (vignette deferred to our layer)
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Three-quarter eye-level view, medium-wide. A small cream dining room drawn as a simple stage: a back wall with one door, four cream tables set and empty, one empty cream chair pulled out at the nearest table; at the front-left edge of the stage a host stand holding an open reservation book. The book is the only cyan element. The upper band is empty ink-navy ground for the caption. Flat fills, hairline edges. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: depth bands (stand → tables → wall) for a push; the book sharp and on a third.

### X20-R1 · A character experiencing it (the holder watching the fall) — R1 over-the-shoulder from behind
Goal: empathy; we look WITH a small featureless figure.  |  Implied motion: the figure reacts (small object anim, conditional); camera holds.  |  Risk: conditional (one figure, back view).
Recipe: OTS / 3/4 from behind · medium-wide, figure small · 1 figure + the environment · caption: above the figure · accent: what is looked at · flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Over-the-shoulder view from behind, medium-wide. One small featureless cream figure stands in the lower-left of the frame with its back to us, looking up at a huge cream board on the right two-thirds, where a single tall column has dropped to half the height of a faint cream reference line. The dropped column is the only cyan element. The band above the figure is empty ink-navy ground for the caption. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: the figure back-view only, hands unseen; one idle affordance (a head turn); the board flat.

### X20-R2 · A character experiencing it — R2 figure on a third, gazing at the subject
Goal: the figure cues attention; gaze = caption line.  |  Implied motion: head turn (reliable within the head/eyes budget); hold.  |  Risk: conditional (hands → hidden).
Recipe: side-on · medium · 1 figure left third + 1 subject right third · caption: along the line of sight · accent: the disc · flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Side-on view, medium. One featureless cream figure stands on the left third facing right, its head tilted toward a plain round disc on a short cream plinth on the right third; the figure's arms rest at its sides with the hands hidden behind its body. The disc is the only cyan element. The space along the line of sight between them and the band above are empty ink-navy ground for the caption. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: an unbroken gaze line across empty ground; featureless head (any face → `anatomy` risk rises).

### X21-R1 · "But here's the catch" (the machine only turns one way) — R1 a wedge in the wheel
Goal: the clean system with one element breaking, against a held background.  |  Implied motion: the wedge enters (object anim); rest freezes.  |  Risk: conditional (added object can restage the plate).
Recipe: same camera as X12-R2 · close-medium · same wheel + 1 disruptor · caption: near the disruptor · accent moves to the wedge · flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Side-on view, close-medium. One large cream wheel with four small stations around its rim stands centred on a short ground line; wedged against its lower-right rim is one small cream block that jams the wheel. The block is the only cyan element; the four stations are cream. The band above the wheel and the margins are empty ink-navy ground for the caption. Flat fills, hairline edges. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: the wheel identical to X12-R2 (score continuity too); the wedge small and touching the rim.

### X21-R2 · "But here's the catch" — R2 one station emptied (absence as the disruptor)
Goal: the catch is a reversal, not an intrusion.  |  Implied motion: hold; the socket can blink (drawn).  |  Risk: safe.
Recipe: same camera · close-medium · same wheel, one station missing · caption: near the gap · accent: the empty socket · flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Side-on view, close-medium. One large cream wheel with stations around its rim stands centred on a short ground line, but the station at the top, where a blank certificate sat, is now an empty cream socket; the other three stations remain. The empty socket is the only cyan element. The band above the wheel and the margins are empty ink-navy ground for the caption. Flat fills, hairline edges. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: exactly one missing station (count three present); otherwise identical to X12-R2.

### X22-R1 · Evidence (the on-chain figures; the quarterly report) — R1 top-down desk, blank ruled sheet
Goal: ground the claim; plainer than any soul plate.  |  Implied motion: hold; annotations draw on (ours).  |  Risk: safe.
Recipe: flat top-down · close · 1 artefact · caption: desk margins · accent: one field · flat, locked, no tilt
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Top-down view, close. One cream sheet lies squarely in the centre of an empty ink-navy desk, its face ruled into empty rectangular fields by hairline cream lines; the desk margins around the sheet are wide and empty for captions. The single field at the sheet's upper-right is the only cyan element. Hairline rulings, flat fills, nothing else on the desk. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: fields empty (any marks → `text`); the sheet square to the frame.

### X22-R2 · Evidence — R2 bound report standing on a bench, eye-level
Goal: the evidence recognised as an object.  |  Implied motion: hold (reliable).  |  Risk: safe.
Recipe: 3/4 eye-level · close · 1 artefact · caption: right third + band above · accent: one rectangle on the cover · flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Three-quarter eye-level view, close. One bound cream report stands upright on a plain cream bench in the centre-left of the frame, its cover blank except for one small solid rectangle near the top. That rectangle is the only cyan element. The right third and the band above the report are empty ink-navy ground for captions. Flat fills, hairline edges, nothing else on the bench. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: a blank cover (the title is ours); the report's silhouette simple.

### X24-R1 · The stakes (retirement accounts) — R1 wide, one home
Goal: why it matters at human scale; soft register.  |  Implied motion: slow push on the letter-box (reliable).  |  Risk: safe.
Recipe: wide establishing · 1–2 subjects · caption: sky / top band · accent: the one consequence object · flat (vignette deferred)
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Side-on view, wide. One small cream house with a single window and a door stands on the left third on a long thin cream ground line; in front of it, close to the door, a small cream letter-box on a post. The letter-box is the only cyan element. The large sky above and the right two-thirds are empty ink-navy ground for the caption. Flat fills, hairline edges, nothing else on the ground line. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: the letter-box sharp and small (the push lands on it); world cues along the ground line.

### X24-R2 · The stakes — R2 close on one consequence (a statement on a kitchen table)
Goal: intimacy after a wide plate.  |  Implied motion: hold (reliable).  |  Risk: safe.
Recipe: side-on · close · 1 object (+1 prop) · caption: margins above the table · accent: the envelope · flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Side-on view, close. A plain cream kitchen table fills the lower third of the frame; on it lies a single cream envelope, closed, and beside the envelope stands one cream cup. The envelope is the only cyan element. The margins above the table are empty ink-navy ground for the caption. Flat fills, hairline edges, the table edge running straight across the frame. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: the envelope closed and blank; the cup as the idle-capable element.

### X27-R1 · A threshold (mNAV = 1) — R1 subject just above a horizontal line
Goal: a line that, once crossed, changes everything.  |  Implied motion: the emblem sinks below the line (object anim / pair, conditional).  |  Risk: safe.
Recipe: side-on · medium · 1 subject + 1 line at one third · caption: opposite side of the line · accent: the emblem · flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Side-on view, medium. A thin cream horizontal line crosses the whole frame at one third up from the bottom; just above it, on the right third, floats a cream emblem of a tall slab beside a short stack of discs inside one outline, its base a little above the line. The emblem is the only cyan element. The left two-thirds of the frame and the band beneath the line are empty ink-navy ground for the caption. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: the emblem clearly above, not touching, the line; the line edge to edge; the "at" and "below" plates re-use this prompt with one clause changed.

### X27-R2 · A threshold — R2 the line as a ledge (physical version)
Goal: crossing feels physical. (Trap: implies inevitability; mNAV is reversible.)  |  Implied motion: the disc tips over the edge (ballistic, reliable).  |  Risk: safe.
Recipe: side-on · medium · 1 subject on the edge of a drop · caption: right half + band above · accent: the disc · flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Side-on view, medium. A cream ledge runs from the left edge to the centre of the frame and ends in a sheer drop; a single plain round cream disc rests exactly on the edge of the drop, half of it over the void. The disc is the only cyan element. The right half of the frame beyond the drop and the band above are empty ink-navy ground for the caption. Flat fills, hairline edges. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: the disc's pre-tension (overhang) visible; nothing below the drop.

### X30-R1 · Recap — R1 a row of four small frames (grid-adherence test)
Goal: consolidate the earlier key plates in order. (Production recap is a composite of our plates.)  |  Implied motion: thumbnails pop in order (drawn).  |  Risk: conditional (a row of frames is a count/grid test).
Recipe: flat front-on · wide · 4 mini-plates in a row · caption: band below · accent: the last mini-plate's object · flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Flat front-on view, wide. Four small identical cream-outlined frames stand in a row across the centre, evenly spaced, each holding one small cream object: a round disc on a plinth, a pipe entering a vessel, a wheel, a domed building. The frames and objects are cream; the object in the fourth frame is the only cyan element. The band below the row and the margins are empty ink-navy ground for the caption. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: four frames, four objects, in order — a miscount is the finding.

### X30-R2 · Recap — R2 the anchor re-shown, re-dressed
Goal: repeat the anchor: the opening emblem carrying its final state.  |  Implied motion: hold; the ring can pulse (drawn).  |  Risk: safe.
Recipe: side-on · medium · 1 subject right third (as X01-R1) · caption: left two-thirds · accent: the disc · flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Side-on view, medium. The plain round disc on its tall narrow plinth stands on the right third exactly as at the start, but the plinth is now half its original height and a thin cream ring lies around the plinth's base on the ground line. The disc is the only cyan element. The left two-thirds and the top band are empty ink-navy ground for the caption. Flat fills, hairline edges, nothing else in the frame. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: same placement as X01-R1 so the two can be cut together; the ring small.

### X31-R1 · Conclusion / zoom out (absorbed into the thing it was escaping) — R1 high-angle field
Goal: one small subject in a big ordered world.  |  Implied motion: slow pull-back (conditional from one still; supply a last frame or use programmatic zoom-out).  |  Risk: conditional.
Recipe: wide, high angle · 1 small subject inside a vast regular field · caption: empty upper third · accent: the disc · flat (vignette deferred)
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. High-angle wide view. A vast regular field of identical closed cream boxes fills the lower two-thirds of the frame in even rows receding toward a straight horizon; among them, on the right third, one single round disc, the only cyan element, sits in a slot like any other box. The upper third above the field is empty ink-navy ground for the caption. Flat fills, hairline edges, the field continuing to the left and right edges. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: the field continuable at all edges; the disc findable but small; rows regular (a warped grid → `composition`).

### X31-R2 · Conclusion / zoom out — R2 horizon version, side-on
Goal: same, for a programmatic zoom-out.  |  Implied motion: Ken Burns out (reliable).  |  Risk: safe.
Recipe: side-on · wide · 1 tiny subject on a long baseline at the bottom · caption: the whole sky · accent: the disc · flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Side-on view, wide. A long thin cream ground line runs across the bottom of the frame from edge to edge; on it, far to the right, stands one tiny plain round disc, the only cyan element, small enough to be nearly lost, and nothing else interrupts the line. The entire frame above the line is empty ink-navy ground for the caption. Flat fill, hairline edge. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: render at ≥1.5× delivery size so the zoom-out from the disc keeps resolution; the line must be a single hairline.

### X32-R1 · Call to action / ending — R1 the proxy from behind facing the horizon
Goal: point forward.  |  Implied motion: hold, gentle push toward the doorway (reliable).  |  Risk: conditional (single figure, back view).
Recipe: 3/4 from behind · medium-wide · 1 figure on a third facing the horizon · caption: top band · accent: the doorway faced · flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Three-quarter view from behind, medium-wide. One small featureless cream figure stands on the left third with its back to us, facing a thin cream horizon line drawn across the lower third of the frame; on the horizon, straight ahead of the figure, stands a single small cream doorway. The doorway is the only cyan element. The top band is empty ink-navy ground for the caption. Flat fills, hairline edges, nothing else on the horizon. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: back view only; destination visible and small; lead room between figure and doorway.

### X32-R2 · Call to action / ending — R2 figure small inside a doorway frame (centre caption)
Goal: an end card with a central caption.  |  Implied motion: hold (reliable).  |  Risk: conditional (single figure).
Recipe: side-on · medium-wide · 1 doorway frame centred + 1 tiny figure · caption: the opening above the figure · accent: the frame · flat
Prompt (Phoenix / Lucid — prose):
flat vector editorial illustration, hairline strokes of even weight. objects drawn as diagrams — the thing and its mechanism share one frame. Strict three-colour palette: ink navy (#0B1B2B) as the dominant background, paper cream (#F5EFE0) for the objects, harbor cyan (#67E8F9) used only on the single element that carries the point, and nowhere else. matte, no gradients, generous margins. Side-on view, medium-wide. A large cream rectangular doorway frame stands centred in the frame, its opening filled with the same empty ink-navy ground as the surround; at the bottom of the opening stands one tiny featureless cream figure seen from behind. The doorway frame is the only cyan element. The wide empty ground inside the opening above the figure is the caption space. Flat fills, hairline edges, nothing else in the frame. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.
What the move needs from this still: the opening empty (the caption lives there); the figure tiny so the frame dominates.
