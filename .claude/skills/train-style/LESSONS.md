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


## 2026-08-27 · second pass — the grouping critique, and what each model's eye is worth

**The operator's read of run 1:** groups mixed different fidelity and approach; several extracted styles converged
to near-identical output. Confirmed. Root cause: the vocabulary had no axes for grit, airborne debris or lens
behaviour, so "clean studio render" and "ember-swept battle key art" were indistinguishable rows.

**The Gemini consultation** (multi-image `generateContent`, 11 wrongly-grouped sources + our schema + the failure
description; `gemini-3.7-flash` 503'd — still not stable under load, exactly as `lib/text/providers/google.ts`
records — `gemini-3.6-flash` answered). Its expert regrouping matched my eye, and it named the missing axes:
particle debris ≠ haze, lens focus, surface finish. Its fourth suggestion (shading pipeline) was already
expressible as `medium` × `render_mode`. Adopted as three new observables — `finish`, `particle_fx`, `focus` —
plus its anti-merge rules.

**A/B of the improved readback, same 11 sources, same schema:**
- `gemini-3.6-flash`: 11/11 valid; the separating signal is THERE (`particle_fx` splits gritty from clean,
  `finish` splits pristine from weathered) — deterministic partition alone still 67% vs expert (transitive
  chaining), which is why the reasoner stays the decider.
- local `qwen3.8:27b` (Ollama): 11/11 valid, 55% — reads `finish=clean-smooth` on nearly everything (no grit
  sensitivity), but `particle_fx` works and its `medium` axis is good (read the Arcane piece as
  `2d-digital-painting`, better than Gemini). **Verdict: prompt adjustments do help the local eye, but it cannot
  carry fidelity grouping; keep the cloud eye for extraction, use qwen at most as a free pre-filter.**

**The pendulum, measured on the pre-flight** (real readbacks → real `style-synthesis` turn, three rule sets):
1. Strict fidelity rules ("never merge different particle/focus"): 8 styles from 11 — over-fragmented, because
   **particles and focus are per-SHOT properties, not style properties**; one production shoots ember frames and
   clean frames in the same style. The consultation's advice was wrong on this point and the pre-flight caught it.
2. Softened (particles/focus half-weight for grouping, full weight for replica scoring): 4 styles — over-merged,
   8 weathered sources in one row.
3. Plus the BIG-GROUPS-EARN-A-SECOND-LOOK rule (>5 sources → split by coherent sub-looks with ≥2 sources each):
   **5 styles, split by lighting regime** (ember-bloom vs crisp-weathered), fidelity guarded, no fragmentation.
   Shipped: `GROUPING_WEIGHTS` in vocabulary.ts, the three rules in prompts.ts, `nearDuplicates` warning +
   `similar_to` chip at finish.

**Method note:** the pre-flight harness (11 sources, reused readbacks, one cheap local reasoning turn per rule
change) is how grouping rules should be tuned — three iterations cost two minutes each instead of three full runs.

**Run 2 results** (`2026-08-27-artstyle-train-2`, 35 sources, ~$2.2, ~34 min): **13 styles, all grouped by the
engine, and the mixups are gone.** The three Jinx/Arcane clusters split by how they were made (3D fan-art vs smooth
2D paint vs the one-artist "ai_exclusive" illustrations); photographic-look sources left the CG groups; clean vs
gritty vs neon-wet CG are separate rows; singletons only where the medium is alone. `medium` HELD end to end —
every transfer read back its own medium (paintings as 2d-digital-painting, photos as photograph, graphite as
line-drawing); run 1's 2D→3D slip did not recur. One twin-warning fired (fire-lit ≈ neon-wet, identical enums) and
the transfers show they DO render apart — the recipes' words carry what the enums cannot; the amber chip is a
human question, not a verdict.

Transfer scores: photo/graphite rows 92–100%; CG rows 69–85%; paint rows 54–69% — the grader marks shot-level
fields (atmospherics, focus, palette) that a neutral scene legitimately changes, so mid-50s on a transfer is
"style held, scene differs", not failure. One real caveat seen: a palette-dependent style (neon-wet) loses its
palette on a scene with no such light sources — a transfer scene roster with one "lit by whatever the style wants"
scene would measure palette carry better.

Cull read (my eyes, verdicts are the operator's): strongest rows — fire-lit-gritty-cg, neon-wet-night-cg,
clean-key-light-cg, painted-warm-cool-illustration, cinematic-lens-photo, graphite-hatched-drawing,
muted-oil-canvas; solid — weathered-daylight-cg, smooth-shaded-painting, brush-textured-3d; thin evidence —
the three singletons (moonlit, volumetric, crushed-black-photo). Note the catalogue already holds run 1's kept
styles; near-duplicates across runs (e.g. run 1 ember-lit vs run 2 fire-lit) are a cull decision, not a code one.


## 2026-08-27 · third pass — singleton mode, and the gemini-3.7-flash verdict

**The operator's read of run 2:** small groups improved and replicate precisely; large groups still mix and their
outputs still average. Decision: run once with NO grouping — every image its own style — with the style entry
written by the vision model while looking at the image (`grouping: "none"` in ExtractOptions, `--singletons` on the
CLI, a checkbox in the tab). No reasoning turn at all in this mode; the ≈ twin-chips then show which singletons
were one style all along, which turns grouping from an up-front bet into a cull-time decision over evidence.

**gemini-3.7-flash: measurably unservable today, on both endpoints.** Asked for explicitly ("apply it and lets see
if it helps"): applied via GOOGLE_VISION_MODEL for run 3. Result — `generateContent` multi-image: 503 (morning);
Interactions single-image: 500 × 3 in a row at 72–122 s each (breaker tripped exactly as designed, run stopped
`failed`, resumable); Interactions with a small JPEG probe: 500 again, so it is the model on the endpoint, not our
payload. Resumed the same run on `gemini-3.6-flash` with `--resume` (3 pruned units retaken) — zero work lost.
`lib/text/providers/google.ts`'s caution about 3.7 stands verified from a second seam; re-probe before promoting it
anywhere.

**Run 3 results** (`2026-08-27-artstyle-train-3`, 35 singletons, rounds=1, transfers=1, 70 generations ≈ $3.15):

| run | mode | styles | best-replica mean | transfer mean | transfer median |
|---|---|---|---|---|---|
| 1 | grouped, 7 observables | 10 | 1.00 | 0.70 | 0.75 |
| 2 | grouped, 11 observables + rules | 13 | 1.00 | 0.77 | 0.77 |
| 3 | singletons, eye-written recipes | 35 | 0.95 | 0.75 | **0.85** |

**What singleton mode buys and costs.** Replication is the tightest of the three (mean 0.95, 29/35 ≥ 0.85) —
no averaging across sources that never matched, which was the operator's complaint about large groups. Transfers
have the best median but a long low tail (0.31–0.61): an n=1 recipe encodes scene-bound properties of its one
image, so on a neutral scene it drifts — the exact thing a grouped recipe averages away (run 2's steadier 0.77).
Eyeballing the tail shows part of it is GRADER noise on hybrid looks, not recipe failure: the 0.31
(`stylized-painterly-render`) transfer is visibly a faithful Arcane-family painterly render that the readback
called a different medium. Mid-tail transfer scores on boundary media are pointers, not verdicts.

**Zero ≈ twin-flags across 35 singletons** — per-image enum noise pushes every pair ≥2 minor fields apart, so the
chip is useless in this mode. The useful instrument is SOFT similarity (grouping weights, ≥0.9), computed post-run:
6 merge-candidate clusters covering 20 of 35 (the 6-strong cinematic-CG cluster, the 5-strong ember/neon cluster,
the 3 painterly illustrations, and three pairs). That list is the cull's merge menu — grouping became a cull-time
decision over evidence instead of an up-front bet. Follow-up worth building: surface soft-similar clusters in the
Extract tab for singleton runs (the ≈ chip's threshold is tuned for grouped runs).

**Naming drift:** 35 eye-written names collapse into a narrow lexicon ("cinematic-…" everywhere); names need the
subject vocabulary the recipes deliberately exclude. Cosmetic, cull renames.

**Verdict across the three runs:** extract with singletons when fidelity per source matters or grouping keeps
failing; extract grouped when the catalogue needs recipes that generalise; either way the cull decides merges —
run 3's clusters + run 2's rows are complementary evidence over the same gallery.
