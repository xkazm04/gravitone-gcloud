# VLM frame-annotation probe

**The question.** Can a vision model that runs *on this machine* annotate a film frame
well enough to build a cinematography corpus from — shot size, angle, lens register,
lighting, layers, objects — or does that job have to be rented from a frontier API?

The answer decides whether "extract a frame every N seconds from a hundred hours of
film and label it" is a weekend of local GPU time or a metered bill that scales with
ambition. At corpus scale that is the whole difference between doing it and not.

```
video ──extract_frames.py──> frames/*.jpg ──probe.py──> results.jsonl ──score.py──> report.md
                                    ▲                       │
                          frames/truth/*.json ──────────────┘   (where the answer is known)
```

## The design decision

**One schema, one prompt, every model.** `schema.py` holds a single annotation
contract and a single instruction, and both backends — Ollama locally and Gemini
over HTTP — are constrained to it: Ollama through its `format` JSON-schema field,
Gemini through `responseSchema`. Neither is asked a friendlier question than the
other, so a gap in the results is a gap in the model rather than a gap in the
prompt. Without that, every comparison of this kind measures prompt luck.

The vocabularies are not invented here. They are lifted from the ai-registry
`media-generation / visual-generation / cinematic-language` subject — the shot
ladder, the angle attitudes, the lens *effect* language, the lighting dials, the
thirteen genre contracts. An annotation that validates against this schema is
already in the vocabulary the rest of the studio thinks in, which is the point:
the corpus has to be queryable by the same words the prompts are written in.

One deliberate prohibition, straight out of the registry's evidence: the schema
**forbids focal lengths in millimetres** and asks for a lens *register* instead.
Generation models measurably ignore numeric optics, so a corpus full of "35mm"
labels would be recording a number nothing downstream can act on. `lens_evidence`
makes the model show the cue it read — perspective stretch, edge behaviour — which
is what actually transfers.

## Scoring, in disqualifying order

`score.py` asks four questions, each capable of ending the evaluation on its own:

1. **Does it answer at all** — valid JSON, all fields, every enum inside its
   vocabulary, free text inside its word limit. A labeller that fails here is
   unusable however good its prose.
2. **Is it right** — scored only on frames with a `frames/truth/<stem>.json`
   sidecar. Those are frames *we generated ourselves*, where the camera and
   lighting were specified in the generating prompt, so the correct answer is
   known rather than voted on. This is the only part of the report that measures
   truth; everything else measures agreement.
3. **Does it agree with the yardstick** — per-field agreement with the reference
   model. Agreement is a cheap proxy that points at where to look, never a verdict:
   `--show-disagreements` prints every split so a human adjudicates.
4. **What does it cost** — median seconds per frame and resident VRAM.

Ordinal fields (shot size, lens, contrast, depth of field) get half credit for a
one-step miss. Calling a wide shot "full" is a different failure from calling it a
close-up, and a scorer that flattens the two teaches nothing.

## Running it

```bash
# 1. get frames — either cut them from a video…
python extract_frames.py "C:/clips/scene.mp4" --every 4 --prefix scene

#    …or drop stills straight into frames/ by hand.

# 2. annotate
python probe.py                                     # every frame, every model
python probe.py --models gemma4:12b gemini-3.7-flash
python probe.py --repeat 3                          # also measure self-consistency

# 3. judge
python score.py --run <run-id> --show-disagreements
```

Local models are pulled with `ollama pull <tag>` and must be vision-capable.
`GEMINI_API_KEY` is read from `personas/.env`; nothing here writes a key anywhere.

## What is *not* versioned

`frames/` and `vlm-probe-out/` are both gitignored. Frames are third-party film
content held locally for evaluation only, and the result rows are regenerable
evidence. What earns a commit is the **finding** — which model can do this, at what
cost, and where it fails — landed in the ai-registry, not the rows behind it.

## Known limits

- A still cannot report camera *movement*, so the schema does not ask. Movement
  needs either a clip or a frame pair, and that is a later probe.
- Fixed-interval sampling is cut-blind: it will sample one locked-off shot four
  times and miss an insert entirely. A shot-boundary detector is what a real
  corpus wants; `--every` is the first approximation.
- Agreement with the yardstick is not accuracy. Two models can share a wrong
  answer, and on stylised animation they measurably do.
