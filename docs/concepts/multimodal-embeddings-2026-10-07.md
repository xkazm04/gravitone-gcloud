# Multimodal embeddings as a control surface

**Status: MEASURED SPIKE + HANDOFF. The model is stood up and three experiments have run. Two of
the five approved use cases could not be measured on this machine, and one of them cannot be
measured on ANY machine from the data we have — see [The rejects are gone](#the-rejects-are-gone),
which is the finding that reframes the plan.**

Author: `/spark` session, 2026-10-07, on the laptop (CPU-only). The operator approved five use cases
by multi-select and chose a **spike-gate-first** shape: every case gets a pass/fail measurement
before any surface is built. The pass bars below were written **before** the numbers, in
`.vault/Spark/ideas/embeddinggemma2-multimodal-control.md`.

Intended consumer: **the GPU machine** (`C:/Users/kazda/kiro/gravitone-gcloud`), which holds the
forge runs, the Comfy stack and the real takes. Start at [Dispatch](#dispatch).

Spike script: `pipeline/embeddings/spike.py` — it runs the three text-side experiments and reprints
every number in this doc.

---

## The instrument

[EmbeddingGemma 2](https://huggingface.co/google/embeddinggemma-2), Google DeepMind, released
2026-10-06, Apache 2.0. Pretraining cutoff January 2025.

| Property | Value |
|---|---|
| Parameters | 740M = 270M text + 170M vision + 300M audio (encoders load selectively: text-only 270M, text+image 440M, text+audio 570M) |
| Space | one shared **768d** for text, code, image, video, audio — and for interleaved combinations of them |
| Matryoshka | 768 / 512 / 256 / 128. Near-lossless to 256d; **128d degrades image and speech to ~75%** and is text-only territory |
| Context | 8K tokens shared across modalities: ~327s audio (25 tok/s, **mono 16 kHz**), 29 images (280 tok), 58 video frames (140 tok, 1 fps) |
| Benchmarks | MTEB multilingual 61.36 · MTEB code 78.68 · MSEB audio retrieval 69.54 MRR@10 · **MAEB audio 49.39** · MIEB-lite 64.64 · MMEB v2 59.01 |
| Precision | **bfloat16 or float32 only.** float16 returns NaN or silently degraded vectors with no error |
| Runtimes | transformers, sentence-transformers, vLLM, Ollama, MLX, LiteRT |

**What it is not.** An embedding model ranks and retrieves; it generates nothing. Every use case
below is therefore a *recognition* or *control* function, never an idea generator. Its value to this
repo is that it is a **deterministic, free, local, rank-only second grader** — which is exactly the
instrument `two-grader-disagreement-rule` asks for, and exactly the budget posture the operator's
standing rule requires (free/local judges only).

**Two cautions that the measurements below confirm matter:**

1. **Semantic, not craft.** It was trained for retrieval. It reads *what a thing is about*, not
   whether the shot survived. Our open grader problem (`lib/foundry/calibration.ts`) is a *craft*
   problem, so an embedding is not obviously the fix for it.
2. **Music is not in the audio training mix.** The card lists "speech recordings across multiple
   languages, environmental sounds, and acoustic events". No music. MAEB 49.39 is the weakest
   headline number it reports. Audio-music cases must be measured, never assumed.

### Setup traps (both cost real time here)

- **`torchvision` is required and the model card's `pip install` line omits it.** The HF processor
  chain imports it (`transformers/models/gemma4/image_processing_gemma4.py` to
  `torchvision.transforms.v2`), so without it `EmbeddingGemma2Processor` fails to import with a
  message that names neither torchvision nor the real cause.
- **`torchaudio.load` now routes through TorchCodec** and raises `ImportError: TorchCodec is
  required` on a plain install. Load audio with `soundfile` and resample with
  `torchaudio.functional.resample` instead — that is what `spike.py` does.

```bash
python -m venv egv && ./egv/Scripts/python -m pip install \
  torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
./egv/Scripts/python -m pip install sentence-transformers transformers soundfile pillow numpy scikit-learn
# On the GPU box use the CUDA wheels instead, and bfloat16:
#   dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float32
```

Cold load on CPU: **16.4s**. Weights are ~1.4 GB over HTTP (set `HF_TOKEN` to avoid the
unauthenticated rate limit).

### Prompt prefixes are not optional

Text inputs are trained with task prefixes; media takes none. Asymmetric tasks use different
prefixes for query and corpus; symmetric tasks use the same one for everything being compared.

| Task | `prompt_name` | Query form | Document form |
|---|---|---|---|
| Retrieval | `SearchQuery` | `task: search result \| query: {q}` | `title: {t} \| text: {c}` |
| Similarity | `SentenceSimilarity` | `task: sentence similarity \| query: {c}` | same |
| Clustering | `Clustering` | `task: clustering \| query: {c}` | same |
| Classification | `Classification` | `task: classification \| query: {c}` | same |

`prompt_name="Document"` hardcodes `title: none`; a titled document must be formatted by hand.
Interleaving uses `<|image|>`, `<|video|>`, `<|audio|>` placeholders filled in order from the
matching key, returning **one** vector for the whole listing.

**Calibration note that governs every threshold below:** two *unrelated* texts score **0.67**
cosine here, and two related ones about 0.90. The usable range is compressed and high. Only **ranks
and relative margins** are meaningful; an absolute cutoff like "0.8 means duplicate" is meaningless.

---

## What was measured here

All on the laptop, CPU, float32, against data present in this checkout.

| # | Case | Result | Verdict |
|---|---|---|---|
| E1 | Taste predictor | not run | **blocked — see below** |
| E2 | Style/identity drift sentinel | not run | blocked (same data) |
| E3 | Hunt diversity / dedupe | sibling p50 **0.962** vs other-hunt p50 **0.883**; tempo-vs-key siblings at **0.984** | **NEGATIVE on prompt text** |
| E4 | Novelty / "already made?" | MRR **1.0**, own nodes fill top-k in 4/4 hunts | passes a weak test |
| E5 | Library search, text to audio | title hit@5 **0.13**, prompt hit@5 **0.05** vs chance 0.067; kind purity **0.81** vs 0.53 | **INCONCLUSIVE** |

### E3 · Hunt dedupe on prompts does not work, and the reason is structural

18 nodes across the 4 hunts in `fixtures-out/sound/hunts.json`. Nearest-sibling cosine
p10/p50/p90 = 0.947 / 0.962 / 0.983; nearest-node-in-another-hunt = 0.828 / 0.883 / 0.926. So the
model does separate hunts from each other — but *within* a hunt the ranking is useless, because the
most-similar pair in the whole set is:

```
0.984  [tempo] Slower, 72 BPM            <->  [key] Down a tritone to Bb minor
0.982  [brief] Baseline: single sentence  <->  [technique] Layered elements
0.970  [weight] Heavy, with a low thump   <->  [weight] Light paper-card slide
```

A hunt varies **one axis at a time**, and the axes it varies most often are numeric (tempo, key,
duration, influence weight) or structural (technique). Those edits move almost no semantic tokens,
so the embedding cannot see them — while "heavy low thump" versus "light paper-card slide", which
are *opposites*, score 0.970 because both are short sound-effect briefs about a card.

**Do not dedupe hunt leaves on prompt embeddings.** It would cull precisely the deliberate
variations the hunt exists to test, and keep pairs that differ only in wording. The honest version
of this case is dedupe on **rendered audio**, which is untested — no real renders are on this box.

### E4 · Novelty passes, but the test was too easy

Each hunt's `idea` text retrieves its own nodes at rank 1, with every own-node inside the top-k, in
all four hunts (MRR 1.0). That is real but weak evidence: the four fixture ideas are a vault
sequence, a card UI sound, a lo-fi bed and a trailer hit — mutually unrelated. The case that
matters is "is this idea already in the ledger?", which needs a corpus with **known
near-duplicates** and was not run.

### E5 · Audio retrieval is inconclusive, not failed

Over the 75 take files in `fixtures-out/sound/files/`: text-to-audio known-item retrieval sits at
chance (title hit@5 0.13 vs chance 0.067, median rank 28 of 75; prompt hit@5 0.05, median 33). But
top-5 **kind purity** — does a music query return music — is 0.81 against a 0.53 random baseline
(49 music / 30 sfx).

The reading: coarse audio semantics arrive, fine ones do not. And the corpus is the reason this is
*inconclusive*. `app/library/audio/audioSeed.ts` says of these takes: "NOTHING HERE IS A REAL
TAKE", and `lib/sound/ledger.ts` excludes fixtures from the ledger by design. They are synthetic
design samples whose audio content does not match their titles the way a real render would. **This
experiment has not been run against real audio yet.** It must be, before the case is judged — and
with the music caution above in hand.

---

## The rejects are gone

This is the finding that changes the plan, and it is worth more than the three numbers above.

`pipeline/foundry/ledger.json` holds **87 labelled rows — 24 keep, 63 reject** (runs
`2026-08-26-sweep-01` 77, `2026-08-26-dry-run` 10). That is the only human-labelled image set the
repo has, and `lib/foundry/calibration.ts` already measures against it: craft ranks keeps against
rejects **backwards (AUC 0.29)**, style sits at chance (0.58), `has_text` has never once been true.
Fixing that meter is the single best-evidenced reason to try an embedding predictor at all.

**But a commit deletes the pixels of everything rejected.**

- `lib/foundry/commitPlan.ts` — in `planForgeCommit`, the `deleteFiles` loop: every candidate whose
  verdict is `reject` has its `file` and `sidecar` pushed onto the plan's delete list.
- `lib/foundry/store.ts` — in `commitRun`, `await fs.unlink(resolveInRun(id, rel))` executes that
  list. (Indices are written first, before any file is unlinked.)

**Anchors here are symbol names, not line numbers, on purpose** — grep for `deleteFiles`,
`planForgeCommit` and `resolveInRun` rather than trusting a line. A doc whose named anchors no longer
resolve is `broken`, which outranks merely stale, and these two are the load-bearing claims of the
whole handoff.

So for 63 of the 87 rows, the image no longer exists — not on this laptop, not on the GPU box,
nowhere. `foundry-out/runs/` is empty here, but copying it would not help: **the negative class was
destroyed at commit time.**

Two consequences:

1. **E1 and E2 cannot be run on history.** No amount of data transfer fixes this. They can only be
   run **forward**, on a new run whose vectors are captured before the cull.
2. **This is a registry deviation.** `media-generation/visual-style-locking/rejections-as-negative-evidence`
   is explicit: a rejected proof is "the record of what this style is not", kept "permanently:
   never sent as references, never counted against any capacity, and **never deleted as tidying**".
   It even names the storage objection and answers it — prune oldest first, **keep their notes even
   when dropping their pixels**. The forge drops both. The ledger row survives (which is why we
   have an AUC at all), but the boundary of the style — the thing the next proofing round needs —
   is gone with the bytes.

### The fix is an embedding sidecar at grade time

The elegant part: **a 768d float32 vector is about 3 KB, and it survives the unlink.** We do not
need to keep rejected PNGs to keep their negative evidence — we need to keep their *vectors*.

The insertion point already exists and already touches every candidate exactly once, before any
human sees it and long before any delete:

```
pipeline/foundry/forge.py   def stage_grade(manifest, run_dir, model)      # grep: "def stage_grade"
    todo = [c for c in manifest["candidates"] if c["status"] in ("generated", "unmeasured")]
    ... b64 = base64.b64encode((run_dir / c["file"]).read_bytes())
```

Stage 2 is the Ollama stage: it loads one engine, walks every generated candidate, reads its bytes
and writes a grade into the candidate's `.json` sidecar. An embedding written in the same loop
inherits its resumability, its idempotence and its grader-digest discipline for free.

Candidate layout, for reference (the module docstring at the top of `pipeline/foundry/forge.py`):

```
foundry-out/runs/<run-id>/scenes/<scene>/candidates/<style>--<mechanism>--s<seed>.png
foundry-out/runs/<run-id>/scenes/<scene>/candidates/<...>.json    prompt + workflow + grade
```

**Recommended shape** (proposal, not adopted): add `embedding` to the candidate sidecar —
`{model, dim, truncate_dim, vec}` — stamped with a digest in the same spirit as
`grade.GRADER_DIGEST`, because a change of embedding model is a change of instrument and must not
pool into one series. Then extend `interface LedgerRow` (`lib/foundry/types.ts`) with the vector or a
pointer to it, so the ledger carries the negative evidence the pixels lose. Note the VRAM turn:
`forge.py` runs one engine per stage on a 24 GB card and `guard.require_model(model, vram_gb=20)`
guards stage 2 — a 740M embedder is small, but it must be loaded inside the stage that already owns
the turn, not alongside Comfy.

---

## Dispatch

Ordered. E0 is the gate for E1/E2 and should be first; E5r needs nothing but real audio and can run
in parallel.

### E0 · Capture embeddings at grade time (prerequisite)

**Why first:** without it there is no negative class, and E1/E2 stay unmeasurable forever.
**Work:** write the vector in `stage_grade`'s existing loop; stamp model, digest and dim; extend the
sidecar, then the ledger row. Keep rejects' vectors on commit — that is the whole point.
**Acceptance:** a run of at least 16 candidates leaves every candidate with a vector; a commit that
deletes rejected PNGs leaves their vectors intact and readable from the ledger; re-grading is
idempotent.
**Cost:** one forge run. Vectors are about 3 KB each, so a 500-candidate run adds about 1.5 MB.

### E1 · Taste predictor — the one that could retire a backwards meter

**Pass bar (set before measuring):** leave-one-out AUC **above 0.65** with a bootstrap CI excluding
0.5, measured by `lib/foundry/calibration.ts`'s own method — `CALIBRATION_METHOD` = AUC, floor 8
keeps *and* 8 rejects, 2000 resamples, seed 20261005, level 0.95, margin 0.1 — so the number is
directly comparable to craft's 0.29 and style's 0.58 on the same instrument.
**Method:** embed each candidate (image alone, and image interleaved with its prompt/style text —
report both). Train a kNN or logistic model on keep/reject, score leave-one-out. Per `mechanism`
too, since craft inverted inside each mechanism separately.
**Honest prior:** this is a craft question asked of a semantic instrument. **It may fail, and a
measured failure is a real result** — it would tell us the grader problem needs a craft-tuned
instrument, which is worth knowing before anyone builds a surface. Record it either way.
**Needs:** E0, then at least 8 keeps and 8 rejects from the new run.

### E2 · Drift sentinel

**Pass bar:** separates seeded-drift samples from known-good ones, by rank, with no absolute
threshold (see the 0.67 floor).
**Method:** centroid of **approved** proofs only. Rejections are negative anchors for
classification — and per the registry's two safety rules they are **never** sent as references and
**never** consume reference capacity. Flag a new candidate by its rank-distance from the approved
centroid.
**Needs:** E0 plus an approved set with real within-style variation; seed the drift arm deliberately
(a style's proofs plus candidates from a neighbouring style).

### E5r · Audio retrieval, re-run on real takes

**Pass bar:** top-5 known-item hit rate **materially above** the `5/n` chance line on a corpus of
real generated takes; report kind purity beside it against its own random baseline.
**Why re-run:** E5's corpus was synthetic and excluded-by-design. This is the *first* real
measurement, not a repeat.
**Needs:** real takes with files. `pipeline/sound/ledger.json` currently has **0 verdicts and 0
lessons**, so the GPU box (or wherever real renders live) is the only place this can run.
**Watch for:** the music caution. If retrieval works for sfx and fails for music, that split is the
finding — report the two kinds separately from the start.

### E4r · Novelty against a real corpus

**Pass bar:** finds known duplicates; the gaps it surfaces are judged by the operator, not scored.
**Method:** index ledger rows plus `knowledge/audio/PATTERNS.md` plus library items; for a new idea
return the nearest existing work. Plant known near-duplicates to make the test non-trivial.

### E3 · Closed, with a finding

Prompt-text dedupe of hunt leaves is **rejected on measurement** — it merges tempo and key
variations at 0.984. If the diversity question returns, it returns as dedupe on **rendered output**,
and it inherits E5r's music caution.

---

## Standing method rules for this experiment

1. **Rank, never score.** The 0.67 unrelated-text floor, plus the registry's finding that vision
   judges "rank reliably but score unreliably"
   (`generated-output-grading/two-grader-disagreement-rule`), mean every threshold in this work is
   relative. No absolute cosine cutoffs reach a surface.
2. **Pass bars before numbers.** Each bar above was written before its measurement and is quoted
   here so a later run cannot move the goalposts. `unmeasured` is never rounded to `pass`.
3. **A failure is a deliverable.** E3 is already one. Record it in the vault note and in this doc
   rather than retrying until something passes.
4. **Compare within a modality first.** The cross-modal gap is documented in the literature and
   visible in E5; text-to-audio is the harder direction and should not be the first thing a surface
   depends on.
5. **Store at 256d unless measured otherwise.** Near-lossless, 3x smaller. Re-normalize after any
   truncation — slicing a unit vector does not preserve unit length, and skipping that degrades
   ranking *silently*. Queries and corpus must share a dimension.
6. **No surface until a case passes.** The operator chose spike-gate-first; a passing measurement is
   the entry condition for a UI.

## Open question for the operator

The deletion of rejected candidates is a deliberate behaviour with a storage rationale, and the
registry technique that contradicts it also supplies the compromise: **keep the notes even when
dropping the pixels.** E0 implements exactly that compromise for vectors. Whether the forge should
*also* stop deleting rejected PNGs outright is a separate call, and it is the operator's — not a
thing this experiment should change on its own authority.
