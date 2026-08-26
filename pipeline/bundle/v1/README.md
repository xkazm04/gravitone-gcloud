# Prompt bundle v1 — Situation Atlas test (2026-08-23)

Two files, one style each, 25 situations × 2 recipes = 50 prompts per file, run on two Leonardo
models each → 200 (prompt × model) cells, 4 images per cell, you score the best of 4 from 1 to 10
against the stated **Goal**. Source knowledge: `.vault/Research/atlas/atlas-*-v1.md` and the seven
`2026-08-23-atlas-*.md` dossiers.

| File | Style (constant) | Models | World |
| --- | --- | --- | --- |
| `style-01-flat-editorial/situations.md` | Signal Ledger flat vector editorial (our house block, verbatim) | Phoenix 1.0 (primary), Lucid Origin | the real "Why Bitcoin's price won't rise" script |
| `style-04-photoreal-film-still/situations.md` | photoreal film still (one LOOK block, lighting varies per situation) | Lucid Realism (primary), Lucid Origin | "Halo of Salt" sci-fi concept |

Why these models: Leonardo's own model guide names **Phoenix** for flat illustration / vector /
element placement (Lucid Origin is "too detail-heavy" for it) and **Lucid Realism** for film-look
frames built for image-to-video. Lucid Origin is the second arm on both so the two files share one
model for cross-style comparison. Nano Banana 2 / gpt-image arms can be added later — they cost
tokens on every image; the Leonardo 1P models are unlimited in Relaxed mode on Premium.

## Settings to freeze (so a score is the prompt's, not a toggle's)

Do these once per model and don't touch them for the whole file:

| Setting | Phoenix 1.0 | Lucid Origin | Lucid Realism |
| --- | --- | --- | --- |
| Mode | **Quality** (not Fast) | **Fast** | **Fast** |
| Style preset | **None** (default is *Dynamic* — change it) | **None** | **None** |
| Prompt Enhance | **OFF** (default AUTO rewrites your prompt) | OFF | OFF |
| Contrast | Medium | Medium | — |
| Aspect / size | 16:9 (1472×832) | 16:9 (~1456×816) | 16:9 |
| Images per generation | 4 | 4 | 4 |
| Negative prompt | `text, watermark, signature, blurry` (identical on every prompt) | none (no field) | none |
| References / Elements | none | none | none |
| Seed | random (score the batch) | random | random |
| Model selector | the named model — never **Auto** | | |

Also: don't press "Improve Prompt"; paste the prompt text exactly as written (the prompt is the
experiment). If Leonardo shows a Relaxed-queue notice, fine — note it. Check the model names on
day 1 and write them exactly as shown into the score sheet's `model` column (Leonardo renames /
retires models often).

## Scoring — 1 to 10 against the Goal, best of 4

| Score | Meaning (read against the block's **Goal** + **Implied motion**) |
| --- | --- |
| 1–2 | wrong: not this situation, or unusable (text leak, broken anatomy, wrong subject count) |
| 3–4 | recognisable but fails the goal (scale not felt, dread not there, mechanism unreadable) |
| 5–6 | achieves the goal weakly; needs an edit or a re-roll |
| 7–8 | achieves the goal; I'd start the scene from this frame after small fixes |
| 9–10 | I'd ship it as the scene's first frame as-is, and I can see the move working |

Columns in `score-sheet-style-0X.csv`: `best_of_4` (1–4, which image you scored),
`score_1_10`, `fail_tag` — one of `text · anatomy · count · style-drift · composition · lighting ·
no-motion-affordance · other` — and an optional one-word `note`. Score what you see; don't read the
"What the move needs" line first if you'd rather not be primed.

Budget: 200 cells × 4 images = 800 images; on Premium the Phoenix/Lucid arms run in Relaxed mode
after the token pool, so the cost is mostly your time — roughly 10–15 s per cell to score ≈ 45–60
minutes per file at a steady pace. Do one file per sitting.

## What happens with the scores

Per situation: which recipe wins per model (that's the mapping we're learning). Per style: which
situations it carries. Per model: which recipes it honours. Winners (8–10) and their low-scoring
siblings go to the explanation pass (free checks, then Qwen) to describe the visible difference;
the atlas's evidence column gets filled; bundle v2 targets the gaps and adds styles 02/03/05.
