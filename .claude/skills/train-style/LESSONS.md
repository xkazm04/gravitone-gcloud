# train-style — lessons

One dated block per run. A lesson names the file it argues a change in; "the model was weird" is not a lesson.

## 2026-08-27 · `C:/Users/kazda/Downloads/chars/Artstyle train` · run `2026-08-27-artstyle-train`

**Gallery.** 35 images: game fan art and wallpapers (Arcane, Witcher, God of War, Cyberpunk, Star Wars), three
2.6 MB AI "remix" PNGs, one graphite concept sketch, two small samples. Mixed on purpose — the question was whether
grouping would find the seams.

**Reads.** 35/35 read back (Gemini 3.6 Flash, ~12 s each; Qwen skipped, no key). Vocabulary held: fan art of
photoreal game renders read `photoreal-cg`, the Arcane pieces `stylised-realistic`, the sketch
`stylised-realistic/monochrome`, the oil piece `painterly/lifted-milky`.

**Grouping.** The `style-synthesis` turn went through rung 1 — `claude-cli/claude-opus-5` — and its answer covered all
35 sources first time (`grouped_by: engine` on every row). 10 styles: three photoreal-cg looks split by LIGHT
(ember/warm-cool emissive · neon wet noir · grounded naturalistic), two stylised-realistic (painted glow · smooth
Arcane-like), and five singletons (bokeh photo, oil canvas, brushed rim painting, crimson-flare photo, graphite).
The split of photoreal-cg by palette/atmosphere rather than one "game render" blob is the right call and the
deterministic partition would NOT have made it — the partition seeds, the engine decides. Recipes are 60–110 words of
look, no subject, no franchise, and the `negative` lists carry the veto.

**Failure 1 — every generate 400'd in ~100 ms.** `google returned 400 … Unknown parameter 'seed'`. The Interactions
API has no `seed`; `lib/imaging/providers/google.ts` spliced one in whenever a caller passed it and no caller ever
had. Fixed at the adapter (seed dropped, dated comment). Google renders are therefore NOT reproducible by seed today;
the manifest still records the intended seed per round.

**Failure 2 — the engine finished "done" with zero images.** A per-element error was recorded and the loop moved on,
50 times, in six seconds. That is the right behaviour for one refused frame and the wrong one for a wall. Added
`BREAKER_LIMIT = 3` consecutive vendor failures → status `failed` with the cause; `pruneFailures` + `--retry` /
`--resume` / the page's **retry failed** take the pruned units again. Pinned in
`tests/golden-path/style-extract.probe.spec.ts`. (`lib/foundry/extract/engine.ts`)

**Process.** Two drivers on one manifest is a real hazard — the CLI and the app are different processes. Added the
driver lease (`lease` on the manifest, 6 min TTL, `foreignLease`); the page shows "driven by the cli" instead of
Resume, the CLI refuses over the app's stamp unless `--force`. The run above was started before the lease existed, so
its first half carried no stamp.

**Costs.** 35 reads unpriced (per-token); generations $0.045 each at 1K. Retry pass: 25 units pruned → ~25–40
generations ≈ $1.1–1.8, inside the $5/hour window.

**Retry pass.** 28 generations, $1.26, ~15 min. Replicas: 10/10 styles reached 100% within two rounds; the critique
loop earned its place three times (`soft-backlit-bokeh` 0.375 → 1.0, `smooth-stylised-render` 0.75 → 0.875,
`grounded` s07 0.75 → 1.0). Transfers (one neutral scene, the lighthouse stair) are the honest measure and land
lower: 100 · 100 · 88 · 75 · 75 · 75 · 63 · 50 · 38 · 38.

**Eye vs score — where they disagree, and what each disagreement argues.**

| style | score | eye | what happened | argues |
|---|---|---|---|---|
| graphite-pencil-study | transfer 38% | **100%** — a flawless pencil study on paper | the seven-field vocabulary has no value for a drawing; the style's declared observables never fit it | the `medium` observable (added today, `line-drawing`); a singleton drawing's score is noise until a run carries it |
| smooth-stylised-render | replica 88% | **~60%** — source is a smooth 2D painting, replica is a polished 3D render | `stylised-realistic / plausible / soft` describes both; the recipe itself said "3D illustration" | `medium` again (`2d-digital-painting` vs `3d-render`, weight 2), and the synthesis rule that the recipe's first clause names the medium |
| painted-glow-epic | transfer 38% | **~65%** — warm-cool emissive, embers and wet stone held; drifted toward photoreal | grader read `photoreal-cg`; `bloom-heavy` edges did not survive | direction right, magnitude harsh; a second transfer scene would separate "recipe weak" from "one bad draw" |
| ember-lit-realism | transfer 88% | **90%** — ember key, physically-convincing leather and iron, particulate | agrees | — |
| neon-wet-noir | replica 100% | **95%** — wet asphalt, opposing neons, bloom; staging matched the source | agrees; the TEXT veto was lettered signage the source world carries | `depiction` must not ask for writing (patched in prompts.ts) |
| soft-backlit-bokeh | replica r2 100% | agrees on look; the depiction carried the source's pin-up subject faithfully | the module does not filter subject matter — a gallery is the operator's | say so in the skill |

**Reads of the gallery for the cull.** From my eyes: keep `ember-lit-realism`, `neon-wet-noir`,
`grounded-cinematic-realism`, `smooth-stylised-render` (with the medium caveat — re-extract after today's patch and
the recipe will say "2D painting"), `graphite-pencil-study`, `crimson-flare-photography`, `brushed-rim-painting`;
weigh `painted-glow-epic` (held but drifted) and `muted-oil-canvas` (63%, one source); `soft-backlit-bokeh` is a
look, but a single suggestive source is thin evidence for a catalogue entry. The verdicts are the operator's — this
table is the read, not the cull.

**Changes this run made to the module** (`lib/foundry/extract/`): breaker + prune/retry (engine.ts); driver lease
(types.ts, store.ts, ExtractView); `medium` as the eighth observable, weight 2, partition requires it
(vocabulary.ts, types.ts); depiction-without-writing and recipe-names-the-medium (prompts.ts); Google adapter drops
`seed` (lib/imaging/providers/google.ts). The run above was made BEFORE the `medium` and prompt changes; its rows
carry no medium chip. A re-run of the same folder is the next measurement.
