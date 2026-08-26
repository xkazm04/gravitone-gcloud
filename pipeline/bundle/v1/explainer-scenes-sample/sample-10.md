# Explainer scenes — redesign sample (10 prompts) · 2026-08-26

Replaces the thinking behind `style-01-flat-editorial`. That file applied one design system to every
scene and produced website illustrations. This sample is built on five different rules:

1. **Narration first.** Every prompt starts from the sentence that is spoken while the frame is on
   screen. The image is the *visual half of that sentence* — same claim, made concrete — not a
   decoration beside it. Each block names the one thing the picture adds that the words cannot say.
2. **A style set, not a style.** An explainer uses 3–4 styles inside one video, chosen by the
   scene's *job*. Below: four styles and the rule for which job gets which. Consistency comes from
   recurring **anchor objects** (the bright coin-disc, the vault, the figure in the grey coat, the
   mill-wheel) described identically in every style, and from one palette temperature per video.
3. **Rich scenes.** Setting, actors with roles, props that embody the fact, atmosphere, time of day,
   what is happening at this instant. Not an icon on a ground.
4. **Still a plate.** No text; we typeset captions and numbers. But caption room is now "a quiet
   region" of a full scene, not empty ground.
5. **Built to move.** Each block ends with the implied move; the scene is composed for it.

## The four explainer styles (style blocks, verbatim in the prompt)

| id | job it serves | Style block | Leonardo model |
| --- | --- | --- | --- |
| **S-A World** | hooks, settings, scale, crowds — "where this happens" | *Richly detailed flat illustration with layered depth: rounded, simplified figures and objects, soft gradients and a faint paper grain, saturated jewel colours on a deep ink-blue ground, atmospheric haze between foreground, middle and background planes, small secondary details that reward a second look.* | Lucid Origin (Phoenix if it over-details) |
| **S-B Archive** | institutions, evidence, the real world, "this actually happened" | *Editorial paper collage: cut-out photographic elements with torn edges laid on textured off-white paper, halftone print grain, hand-drawn ink arrows and circles, one flat colour block as the accent, shallow drop shadows under every cut-out, muted archival tones.* | Lucid Origin |
| **S-C Diorama** | mechanisms, systems, processes — "how the machine works" | *Miniature clay diorama photographed with a tilt-shift lens: soft matte clay materials, every part a tangible physical piece, isometric three-quarter view, one soft studio light from the upper left, gentle shadows, a restrained palette of warm greys with one saturated accent.* | Lucid Origin |
| **S-D Moment** | emotion, stakes, a person experiencing it, the close | *Digital gouache painting with visible brush texture and painterly edges: a single figure in an environment, atmospheric light with one warm source against cool shadow, restrained palette, quiet and cinematic.* | Lucid Origin / Lucid Realism |

Assignment rule: *hook/world → A · institution/evidence → B · mechanism → C · feeling/stakes → D.*
An "evidence plate" (Harris's term) is plain and faithful; a "soul plate" carries the style.

**Anchors** (say them the same way every time): *the bright coin-disc* (a plain bright gold disc, no
markings) · *the vault* (a round steel vault door) · *the figure in the grey coat* (an adult seen mostly
from behind or in profile, grey overcoat) · *the mill-wheel* (a large wooden wheel with paddles).

Settings for the test: model as listed, preset **None**, Prompt Enhance **OFF**, 16:9, 4 images.
No-text clause is appended to every prompt (it is the same clause on every line below).

---

### E01 · Hook — the record high · S-A World · 0:00
**Narration:** "On the 6th of October 2025, Bitcoin hit one hundred and twenty-six thousand dollars. The highest price in its history."
**What the image adds:** the *height* — a summit above everything, reached at last, at first light.
**Recipe:** extreme wide · slightly low angle · summit on the upper-right third · caption room: the open sky, upper left · move: slow push toward the summit.
**Prompt:**
Richly detailed flat illustration with layered depth: rounded, simplified figures and objects, soft gradients and a faint paper grain, saturated jewel colours on a deep ink-blue ground, atmospheric haze between foreground, middle and background planes, small secondary details that reward a second look. An extreme wide shot of a mountain built from stacked, staggered slabs rising through a sea of cloud at dawn; the summit sits on the upper-right third, and set into its very peak is the bright coin-disc, a plain bright gold disc catching the first sunlight. A tiny figure in a grey coat stands on the last ledge beside it, seen from behind. Lower slopes fade into blue haze; the upper-left sky is clear and open. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.

### E02 · The wish list, delivered · S-B Archive · 0:10
**Narration:** "The United States government created a Strategic Bitcoin Reserve. Congress passed the crypto industry's flagship legislation. The regulators who spent a decade suing this industry were replaced. Spot ETFs put Bitcoin inside ordinary brokerage accounts. Every single item on the wish list. Delivered."
**What the image adds:** the four real-world objects of the four promises, laid out like a checklist that we will tick with our own layer.
**Recipe:** top-down · four cut-outs in a vertical column on the left two-thirds · caption room: an empty column of paper on the right where ticks/labels go · move: hold; our ticks animate in.
**Prompt:**
Editorial paper collage: cut-out photographic elements with torn edges laid on textured off-white paper, halftone print grain, hand-drawn ink arrows and circles, one flat colour block as the accent, shallow drop shadows under every cut-out, muted archival tones. Seen straight from above, four photographic cut-outs stacked in a vertical column on the left two-thirds of the sheet: a neoclassical government building with columns, a wooden gavel, a wall of steel filing cabinets with one drawer pulled open and emptied, and a tidy household savings jar of coins. To the right of each cut-out a small hand-inked empty circle waits, and the whole right third of the paper is clear. A single flat amber block sits behind the savings jar. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.

### E03 · Half its value gone · S-D Moment · 0:30
**Narration:** "And in that same ten months, Bitcoin lost roughly half its value."
**What the image adds:** the feeling of watching it sink — not a chart, a person and the half-drowned disc.
**Recipe:** wide · eye level from behind the figure · figure on the left third, the disc on the right third · caption room: the dark water, lower right · move: hold, water moves; or very slow push.
**Prompt:**
Digital gouache painting with visible brush texture and painterly edges: a single figure in an environment, atmospheric light with one warm source against cool shadow, restrained palette, quiet and cinematic. A wide shot at dusk from a wooden pier: the figure in a grey coat stands at the pier's end on the left third, back to us, hands in pockets. Out on the right third the bright coin-disc, a plain bright gold disc as tall as a house, sits exactly half-submerged in dark, still water, its lower half a dim shape beneath the surface and its upper half catching the last warm light from a low sun behind cloud. Cool blue-grey shadow everywhere else; the water in the lower right is calm and empty. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.

### E04 · Turn 1 — an inflow is not a purchase · S-C Diorama · 1:20
**Narration:** "When money arrives at a spot Bitcoin ETF, the fund does not sprint out and buy coins that afternoon. The work is done by authorised participants … The purchase is lagged, and partly hedged."
**What the image adds:** the *gap* — money going in one end, a waiting room in the middle, the vault still shut at the far end.
**Recipe:** isometric three-quarter · one long room read left→right · three stations · caption room: the plain floor in front · move: slow lateral track left→right along the room.
**Prompt:**
Miniature clay diorama photographed with a tilt-shift lens: soft matte clay materials, every part a tangible physical piece, isometric three-quarter view, one soft studio light from the upper left, gentle shadows, a restrained palette of warm greys with one saturated accent. A long narrow clay office seen from the front-left corner: at the left end a brass mail slot in the wall with a stream of small clay banknotes sliding in onto a conveyor; in the middle, four clay clerks at a long counter stamping tickets and stacking them, unhurried; at the right end the vault, a round steel vault door, firmly closed, with a single bright coin-disc, a plain bright gold disc, resting on a shelf beside it untouched. The floor in front of the counter is bare and open. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.

### E05 · The booking, not the meal · S-D Moment · 1:30
**Narration:** "The inflow is a booking, not a meal. A restaurant can have a full reservation book and an empty dining room at the same hour, and both facts are true."
**What the image adds:** both facts in one frame — the full book at the host stand, the empty set tables behind.
**Recipe:** medium-wide · eye level at the host stand · the book in the lower-left foreground, the dining room receding to the right · caption room: the dark ceiling / upper left · move: slow pull-back revealing more empty tables.
**Prompt:**
Digital gouache painting with visible brush texture and painterly edges: a single figure in an environment, atmospheric light with one warm source against cool shadow, restrained palette, quiet and cinematic. A medium-wide shot inside a restaurant at night, from just behind the host stand: in the lower-left foreground an open reservation book, every line of both pages filled with dense pencil scribble that is clearly writing but unreadable, lit by a small warm lamp. Beyond it, receding to the right, a dining room of a dozen tables fully set with white cloths, glasses and folded napkins, every chair empty, lit only by cool blue light from the street windows. A lone host in a grey coat stands at the stand, seen from behind. The ceiling is dark and plain. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.

### E06 · The ETF was an exit · S-A World · 1:45
**Narration:** "The people who held longest sold most, and they sold into precisely the demand that was supposed to lift the price. The ETF was not a wave lifting the boat. It was an exit."
**What the image adds:** two doors in one wall — a crowd pushing in, the old holders walking out with the discs.
**Recipe:** wide · straight-on · two doors symmetrical left/right · caption room: the plain wall above the doors · move: hold; or slow push on the exit door.
**Prompt:**
Richly detailed flat illustration with layered depth: rounded, simplified figures and objects, soft gradients and a faint paper grain, saturated jewel colours on a deep ink-blue ground, atmospheric haze between foreground, middle and background planes, small secondary details that reward a second look. A wide, straight-on view of a tall stone wall with two doorways. Through the left doorway a dense crowd of small rounded figures presses inward, faces forward, carrying nothing. Through the right doorway a short line of older figures walks calmly out toward us, each carrying a bright coin-disc, a plain bright gold disc, under one arm; the last of them is halfway through. Warm light spills from the right doorway onto the cobbles; the left doorway glows cold blue. The wall above both doors is plain and unbroken. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.

### E07 · The treasury machine (mNAV) · S-C Diorama · 2:20
**Narration:** "If the market values your company at more than the Bitcoin sitting on your balance sheet — a ratio called mNAV — then you can issue new shares, spend the proceeds on Bitcoin, and every existing shareholder ends up owning more Bitcoin per share."
**What the image adds:** the machine as a physical loop — the balance, the wheel, the two chutes — so the reversal in E08 can be shown on the same set.
**Recipe:** isometric three-quarter · one closed loop · the balance tipped toward the shares side · caption room: the plain floor, lower right · move: hold, the wheel turns.
**Prompt:**
Miniature clay diorama photographed with a tilt-shift lens: soft matte clay materials, every part a tangible physical piece, isometric three-quarter view, one soft studio light from the upper left, gentle shadows, a restrained palette of warm greys with one saturated accent. A clay machine on a workshop floor: at its centre the mill-wheel, a large wooden wheel with paddles, turning clockwise. On the left a tall balance scale — a heap of paper share certificates on one pan sits higher than a modest stack of bright coin-discs on the other, tipping the beam toward the paper. A wooden chute carries fresh paper certificates from the machine out to the left edge; a second chute brings bright coin-discs, plain bright gold discs, back in from the right edge and drops them into a growing stack. The floor in the lower right is bare. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.

### E08 · The machine only turns one way · S-C Diorama · 2:50
**Narration:** "The moment your share price falls below the value of the Bitcoin you hold — the moment mNAV drops under one — issuing shares destroys value instead of creating it. So the buying stops. Because the arithmetic inverted."
**What the image adds:** the same set as E07 with the balance flipped, the wheel jammed, the disc chute empty — a viewer sees the *change*, not a new picture.
**Recipe:** identical framing to E07 · one wedge is the accent · caption room: same bare floor · move: hold (the pair E07→E08 is a morph/cut).
**Prompt:**
Miniature clay diorama photographed with a tilt-shift lens: soft matte clay materials, every part a tangible physical piece, isometric three-quarter view, one soft studio light from the upper left, gentle shadows, a restrained palette of warm greys with one saturated accent. The same clay machine on the same workshop floor: the mill-wheel, a large wooden wheel with paddles, now stopped, a single saturated red wedge jammed between two paddles and the frame. The balance scale on the left has tipped the other way — the pan of paper certificates hangs low and the pan of bright coin-discs sits high. The chute to the left edge is empty; the chute from the right edge is empty too, and the stack of gold discs beneath it has not grown. The lower-right floor is bare. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.

### E09 · The reserve that isn't built · S-B Archive · 4:00
**Narration:** "Except sixteen months later, the reserve still is not built. The White House concedes the process is being worked out. Federal agencies cannot agree on how much Bitcoin the government actually owns."
**What the image adds:** a monument that exists only as scaffolding and an empty plinth — the promise as a construction site.
**Recipe:** three-quarter · eye level · the plinth on the centre-right, scaffolding behind · caption room: the plain paper sky, upper left · move: hold; or slow push on the empty plinth.
**Prompt:**
Editorial paper collage: cut-out photographic elements with torn edges laid on textured off-white paper, halftone print grain, hand-drawn ink arrows and circles, one flat colour block as the accent, shallow drop shadows under every cut-out, muted archival tones. A three-quarter view assembled from cut-outs: a photographic neoclassical treasury building wrapped in scaffolding and green construction netting, in front of it a bare stone plinth on the centre-right with nothing on top, a photographic chain-link construction fence across the foreground, and a rolled architectural blueprint lying on the ground. A hand-drawn ink circle rings the empty top of the plinth; a single flat dark-blue block sits behind the building. The paper sky in the upper left is clear. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.

### E10 · The thesis — a conviction becomes a position · S-A World · 4:20
**Narration:** "When institutions buy an asset, it goes into portfolios governed by risk models. It gets sized. It gets hedged. It gets rebalanced. It stops being a conviction and starts being a position."
**What the image adds:** the disc being filed into one grey box among thousands of identical grey boxes — absorbed.
**Recipe:** wide · slightly high angle · a wall of shelves filling the frame · one gloved hand and the disc on the centre-right third · caption room: the shelves themselves are quiet; the lower-left aisle floor · move: slow push on the hand and the box.
**Prompt:**
Richly detailed flat illustration with layered depth: rounded, simplified figures and objects, soft gradients and a faint paper grain, saturated jewel colours on a deep ink-blue ground, atmospheric haze between foreground, middle and background planes, small secondary details that reward a second look. A wide, slightly high-angle view of an endless archive: floor-to-ceiling steel shelving filling the frame, every shelf packed with identical plain grey boxes, rows fading into haze at the back. On the centre-right third a gloved hand reaches from the edge of frame and slides the bright coin-disc, a plain bright gold disc, into one open grey box exactly like all the others; it is the only colour in the room. Cool even light; the aisle floor in the lower left is empty. No text, no letters, no numbers, no labels, no logos and no watermarks anywhere in the image.

---

## What to look at in these 10

- Do the pictures *say the sentence*? (E04, E05, E06, E08 are the real test — a mechanism made physical.)
- Does switching style by job (A/B/C/D) feel like one video or like four? The anchors (disc, vault, grey coat, wheel) are what should hold it together.
- Does the S-C pair E07→E08 survive as "the same set, changed"? That is the continuity property production needs most.
- Where a model over-renders (Lucid Origin adds detail): note it; Phoenix is the fallback for S-A.

If this is the direction: the full set is the same script at ~35 scenes (every narration beat), in the four styles by job, plus a second script from another domain (science or history) to prove the style set isn't a finance trick. If not: the screenshot route — collect 30–60 frames from Vox/Kurzgesagt/Harris/Abram/TED-Ed videos, we tag each with narration line + job + style + recipe, and that becomes the pre-training set the prompts are written against.

---

## Verdict (user test in Leonardo, 2026-08-26)

| Prompts | Style | Verdict |
| --- | --- | --- |
| E02, E09 | **S-B Archive** (paper/photo collage) | **Perfect.** Keep. The approach that works: layered 2D cut-outs arranged so information can be revealed sequentially, in step with the narration. |
| E04, E07, E08 | S-C Diorama (clay 3D) | Solid, but **avoid as a default**. Usable as a deliberate per-video art style only; the majority of frames must be layers of 2D. |
| E01, E03, E05, E06, E10 | S-A World, S-D Moment | **Too artistic** — read as illustration, not as a functional image that carries the narration. Drop. |

Two lessons to keep: (1) *content*: build the frame as separable 2D layers whose parts map to the
narration's items, so reveal order = speaking order; (2) *art style*: the archival paper collage
(cut-out photographic elements, torn edges, textured paper, halftone, hand-inked marks, one flat
accent block) is the first style that scored as functional. Success rate 2/10 — not yet on the right
path; next round is pre-trained on screenshots from real explainer videos, tagged with narration
line + job + recipe, before any prompts are written.
