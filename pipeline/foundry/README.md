# The Foundry — mass generation, hand culling, and the loop that turns one into knowledge

**The question.** Every dimension of a game trailer can now be produced on this
machine — script and prompts (Claude CLI), stills (Flux 2 in ComfyUI), clips
(Wan / minimax), music and effects (ElevenLabs) — and a vision model that runs
locally can read a frame well enough to label its craft (see `../vlm-probe`).
The machine can therefore run for an evening and leave hundreds of candidates
behind. What it cannot do is say which of them are *good*. That is the
bottleneck now, not generation, and this directory is the instrument for it.

Two abilities are under test, and they are deliberately measured separately:

- **Art-style mastery** — can we read a look off best-in-class work, write it
  down as words a generator obeys, and get it back on *our own* subjects?
- **Beat mastery** — can the craft of a shot (size, angle, light, layers,
  composition) be lifted from a reference and re-issued as a new frame, so a
  trailer's sequence can be composed from a vocabulary rather than luck?

```
                 PHASE 1 · FORGE (unattended, hours, local GPU)
reference frame ──annotate──> craft words ──× style recipe──> candidate ──grade──> run.json
   (vlm-probe)   qwen3.8:27b   replicate.py      styles.json   Flux 2      qwen3.8:27b
                                                                              │
                 PHASE 2 · CULL (a human, minutes, /foundry)                  ▼
          keep / reject per tile ──commit──> delete rejected · ledger.json · styles.json evidence · findings.md
```

## Phase 1 — `forge.py`

A **plan** (`plans/*.json`) names scenes, styles and mechanisms; the forge
crosses them and grades every cell. The design decisions, and why:

**Two axes, held still.** The registry's trial-matrix technique: everything
not under test is constant — same annotator, same grader, same seed, same
steps — so a difference between cells is a difference in the style or the
mechanism, not in prompt luck. A style is described as *observables* (the
`style.py` vocabulary a grader can read back) plus a *recipe* (what the
generator is told); the observables are what make adherence a comparison of
enums rather than an opinion.

**Craft crosses over as words, never as pixels.** The scene's annotation is
compiled to effect language by `replicate.py` (the same lane that proved the
vocabulary carries a shot), with the source's own `texture` field dropped and
the style recipe put first. The `text` mechanism sees nothing else — so what
it reproduces is what the *vocabulary* carried. The `ref-early` mechanism
adds the source frame as a Flux 2 reference latent for the first 35% of the
denoise only: composition is decided early, texture late (measured in the
consistency spike, where the inverse window carried a face), so it keeps the
staging and sheds the source's rendering. It is the empirical challenger, and
the registry's caution applies: keeping a source's arrangement whole is
copying, not learning, so whether it earns its keep is the human's call.

**Grading is a pre-filter, never a verdict.** Two small schemas per
candidate, in the order the registry prescribes: craft fidelity (re-annotate,
score field by field against the source with partial credit for one-step
misses) and a seven-field style readback whose first field is the veto —
`has_text`. A grade records who graded it; a candidate that could not be
graded is `unmeasured`, counted separately, and never a pass.

**Resumable by construction.** A PNG on disk is a finished generation
whatever the manifest says, and `--resume` continues a run where the memory
pressure killed it. The manifest is rewritten atomically after every step so
the page can watch a live run.

**One card, two engines, the turn is explicit.** Stage 0 and 2 hold Ollama;
stage 1 holds ComfyUI; `guard.py` evicts the other before each and recycles
ComfyUI on a fixed interval, because its footprint only grows.

```bash
cd pipeline/foundry
python forge.py plans/dry-run.json                       # ~25 min for 10 candidates
python forge.py plans/sweep-01.json                      # 5 scenes x 9 styles x 2 = 90, ~4 h
python forge.py plans/sweep-01.json --run-id <id> --resume
```

Launch anything longer than ten minutes **detached** (PowerShell
`Start-Process python -ArgumentList '-u','forge.py',...`) — a shell tool's
background task is killed at its ceiling, and the forge only survives that
because generation is resumable per file.

Sources are frames already in `../vlm-probe/frames/` (any path works). If a
frame was annotated by an earlier vlm-probe run with the same model, that
annotation is reused — the corpus already holds hundreds.

## Phase 2 — `/foundry`

The page reads `foundry-out/runs/*/run.json` and shows each scene as a
**matrix**: source pinned left, styles down, mechanisms across, every tile
carrying its automatic grades as chips. Read by row and by column before
totals — a column that fails every style is a bad lane, not five bad styles.
Arrow keys move, `K` keeps, `X` rejects, `U` clears, `Enter` opens the
comparison (source beside candidate, the per-field grade under them so a
wrong-looking score can be audited against what the grader actually read).
Verdicts autosave to `verdicts.json`.

**Commit** is the training step, and it is destructive on purpose: kept
candidates stay byte-identical, everything else is deleted, and the judgement
is written to the two files that *are* versioned:

- `ledger.json` — one row per decided candidate, keyed by run, scene, style,
  mechanism and seed, with the automatic grades beside the human verdict.
  This is the durable index the trial-matrix technique asks for, and it is
  also how we learn whether the grader predicts the human (kept-vs-rejected
  mean scores are in every `findings.md`).
- `styles.json` — evidence appended per style; a style becomes `proven` when
  a human kept it on more than one scene.

`findings.md` in the run directory is a draft in the registry's shape:
distribution over totals, `n` on every row, the rule stated as something the
next run can falsify. It is evidence, not a claim — a rule reaches
`ai-registry/knowledge/media-generation` only on a second sighting, through
the normal gate.

## Extracting styles — the Extract tab and `extract.mts`

The inverse of the forge. The forge takes a style the catalogue already
names and asks whether it survives on a scene; **extraction takes a GALLERY
nobody has named** — screenshots, downloads, a folder of one artist's work —
and asks what styles are in it, whether each can be written down as a recipe
a generator obeys, and whether that recipe holds on a scene the gallery never
showed. One logical layer, `lib/foundry/extract/`, serves both postures:

```
gallery ──read back each image──> observables + look + depiction     (vision: Gemini / Qwen)
        ──partition + one reasoning turn──> styles: name, observables, recipe, negative   (claude-cli locally, Gemini hosted)
        ──replicate from WORDS ONLY (recipe + depiction), critique, fix, regenerate──> replica rounds, scored
        ──transfer the recipe onto a neutral scene──> transfer, scored
        ──a human keeps or throws each ROW──> kept styles → styles.json as `candidate`, with exemplars
```

**Words cross over, never pixels.** A replica is generated from the recipe
plus the source's `depiction` and never sees the source as a reference — a
reference would let the generator copy the look off the pixels and prove
nothing about the RECIPE, which is the thing being extracted.

**The critique loop is measured, not trusted.** Each round is read back with
the same observables, scored against the style's declared observables
(render_mode counts double), and the critic proposes a rewritten recipe. The
recipe IN FORCE is whichever round scored best; a fix that did not improve
the score stays in `recipe_history` and is not adopted.

**Grouping is deterministic first.** Sources that agree on render_mode and on
most observables are partitioned together; the reasoning engine is asked to
name and describe the groups and may merge or split them, but its answer is
accepted only when every source lands in exactly one style. Otherwise the
partition stands and the row says `grouped by partition`.

**It runs as a step machine**, one bounded unit per call, because a hosted
handler has a duration ceiling: the browser (`/foundry` → Extract) loops
`/api/foundry/extract/<id>/step` until done, the CLI loops in-process. Same
code, same order, same files under `foundry-out/extract/<id>/`; a run killed
halfway resumes at its next unit.

```bash
# local: a folder in, a run on disk, a summary out. Needs GOOGLE_AI_API_KEY
# (pixels + eyes); words go through the text ladder (claude-cli, then Gemini).
npx tsx pipeline/foundry/extract.mts "C:/path/to/gallery" --slug my-gallery
npx tsx pipeline/foundry/extract.mts "C:/path/to/gallery" --slug my-gallery --dry   # count + cost, no spend
npx tsx pipeline/foundry/extract.mts --resume <run-id>                               # continue a paused run
npx tsx pipeline/foundry/extract.mts --status <run-id>                               # the summary table
npx tsx pipeline/foundry/extract.mts --commit <run-id> --keep a,b --reject c        # headless cull
```

Or `/train-style <folder>` in Claude Code, which runs the same driver and
reads the results back with its own eyes before the cull. Cull in the app
at `/foundry` → Extract: ↑↓ rows, K keep, X throw, U clear, then **Learn the
kept styles**.

## Acquiring styles — `acquire.py`

`python acquire.py --list` shows every source `../vlm-probe/style.py` has read
back; `python acquire.py --source lotr-scene --id epic-film-naturalistic
--name "Epic Film Naturalistic"` turns one readback into a `candidate` entry.
The readback smuggles subject matter into the recipe ("weathered armour",
"concrete rooftops") — **edit it down to the look before forging**; the
technique's hand-edit step is the part that makes the style transferable to
subjects the source never contained. `acquire.py` refuses to overwrite a
style that already carries evidence.

## Intaking screenshots — `intake.py`

The repeatable loop for a new production: drop ~10 screenshots in a folder and

```bash
python intake.py "C:/shots/mygame" --slug mygame-reveal        --acquire --name "MyGame Reveal" --plan
python forge.py plans/mygame-reveal.json     # detached if long
```

publishes them as frames, reads the style back **as a set** (Gemini over
HTTP by default, so it works while ComfyUI holds the card), adds it to the
catalogue as a `candidate`, and writes a plan crossing the screenshots as
scenes against the whole catalogue — both directions of the fit question at
once: which existing styles fit this scenario, and does the extracted style
survive on its own scenes. Edit the acquired recipe before forging.

## Culling — the interactions

Verdicts are immediate and idempotent: K keeps, X rejects, U clears, pressed
on a tile, in the lightbox, or on a whole style row (`row K` / `row X`). The
stamp and border change before the debounced save leaves. A committed run is
read-only — the rejected files are gone and its rows are in the ledger — so
its controls are removed, not left to fail quietly.

## What is not versioned

`foundry-out/` — the cropped reference frames (third-party, held locally for
evaluation), the candidates and their sidecars. Regenerable from a plan and a
seed. The catalogue, the ledger and the findings are the finding.

## Scaling up, in order

1. **More scenes per plan** before more styles: a style's characteristic
   failure only appears across *different* craft problems (a wide, a
   close-up, a two-shot, a landscape), and one scene cannot show it.
2. **Seeds ≥ 2 per cell** once a plan is settled — one sample measures luck;
   the spread is the reading.
3. **Acquire styles by readback** (`../vlm-probe/style.py --only <source>`)
   from each new best-in-class source, hand-edit the recipe, add it as
   `candidate`. The forge then tests whether the acquisition transferred.
4. **A beat lane**: the same forge over a *sequence* of frames from one
   trailer (shot list in, shot list out) with the cull judging the cut
   rhythm as well as the frame — the sequence layer `../vlm-probe/CORPUS-DESIGN.md`
   describes. Not built; the matrix and the ledger are shaped to receive it.
5. **Promote a kept candidate to the Library** as a theme proof, so a proven
   style becomes a lockable identity for a project. A route, not a redesign.
