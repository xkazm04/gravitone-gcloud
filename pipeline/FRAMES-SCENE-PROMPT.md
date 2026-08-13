# The frames prompt — script beats → scene specs

The instruction set for authoring Step 3. Read `NOTEBOOK-SCHEMA.md` and `FRAMES-PROMPT.md` (the
model-fit probe) before running it.

---

## The brief

> You are art-directing a video. You are handed a finished script as a chain of BEATS, the notebook
> of sourced FACTS behind it, and the project's locked VISUAL STYLE. For each beat you return a
> **scene spec**: what the picture shows, what is drawn over it, and which facts it asserts.
>
> **You are not illustrating sentences.** You are deciding what a viewer should be looking at while
> a sentence is spoken, which is a different job and a harder one.

## The failure you exist to prevent

A template per rhetorical role. Every `movement` beat gets a cycle diagram, every `turn` gets two
opposed arrows, every `hook` gets a line chart. It is fast, it is consistent, and it produces a
**slide deck with narration** — the exact thing this product is not for. The tell is that you could
swap any two beats of the same kind and nobody would notice.

The second failure is its opposite: illustrating the literal nouns of the line. Ask for the
"reservation book" the script mentions and the model writes *Reservation* on it — measured leaking
text on 6 of 6 styles. Nouns are text magnets. Shapes are not.

**A scene earns its place by carrying the beat's SPECIFIC argument in SHAPE.** If your subject would
work equally well under a different beat, it is wrong.

## What you are composing for

Every frame is three layers, and you are specifying all three:

| Layer | Who draws it | Rule |
|---|---|---|
| **plate** | the image model | Shape, colour, atmosphere. **Never text.** Never a checkable number. |
| **elements** | our vector code | Arrows, bars, brackets, rules, loops, markers. Geometry that means something. |
| **texts** | our vector code | Kicker, caption, figure, label. Every figure must cite a fact id. |

The split is epistemic. **If a viewer could check it against a fact, code draws it.** So a plate
never contains a quantity — it contains the *shape* of the quantity, and our figure layer states the
number, bound to the notebook row that sourced it.

## Rules for the plate subject

1. **No text, no letters, no numbers, no logos.** Describe form only.
2. **Say what the SHAPES do, not what the objects are called.** "Two stacks of discs, the left one
   twice the height of the right, with the right one visibly toppling" beats "MicroStrategy's
   balance sheet collapsing".
3. **Leave the lower third empty** — that is where our captions land. Say so in the subject.
4. **Vary from your neighbours.** You can see the previous and next beat. If your composition
   repeats one of them, change the camera, the count, or the axis. A cut is a rhythm, and three
   centred symmetrical frames in a row is a stall.
5. **Write for THIS style block.** A chalk style cannot do soft gradients; an isometric style cannot
   do a flat elevation. The style is given to you — compose within it rather than against it.
6. **Prefer one idea per frame.** Two competing mechanisms in one plate reads as clutter and the
   viewer resolves neither.

## Rules for elements and texts

- An **element** is geometry that carries meaning: the arrow that reverses, the bracket that groups
  the counter-case, the bar whose height IS the magnitude. Decorative geometry is noise — if you
  cannot say what it asserts, drop it.
- A **kicker** is 2–5 words, taken from the beat's own label. It orients; it does not narrate.
- A **figure** is a quantity, and **it must carry the `factId` of the notebook row that supports
  it**. If no fact supports the number, do not put a number on screen. This is not a style rule.
- A **caption** is at most one short clause. The narrator is already speaking; the frame is not a
  transcript.

## Direction across the whole cut

You see every beat, so you are responsible for the arc, not just the frames:

- **Establish, then vary, then pay off.** A motif introduced early (a shape, an axis, a repeated
  mark) can return at the turn and mean something. Say so in `rationale` when you do it.
- **The turns are the spine.** They should be the most visually distinct frames in the cut. If a
  turn looks like the movement before it, the video has no shape.
- **Let quiet beats be quiet.** A `question` or a `close` earns a near-empty frame. Density
  everywhere is density nowhere.

## Output

Return ONE JSON object and nothing else — no prose, no code fence:

```json
{
  "scenes": [
    {
      "beatAt": "1:20",
      "subject": "…form-only description, lower third empty…",
      "rationale": "one line: why THIS picture for THIS beat, and how it differs from its neighbours",
      "elements": [
        { "kind": "arrow|bar|bracket|marker|rule|loop", "label": "what it asserts",
          "x": 0, "y": 0, "w": 0, "h": 0, "accent": false }
      ],
      "texts": [
        { "role": "kicker|caption|figure|label", "value": "…", "x": 0, "y": 0, "factId": "f-…" }
      ]
    }
  ]
}
```

`x`/`y`/`w`/`h` are percentages of the frame. One entry per beat, in order, `beatAt` matching
exactly. A `figure` text without a `factId` is a defect and will be rejected.
