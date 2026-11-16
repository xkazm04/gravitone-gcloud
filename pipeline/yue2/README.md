# pipeline/yue2 - the song lab's engine

The YuE2 song pipeline, moved from `kiro/yue2-lab` (spark yue2-song-lab, WP1). The scripts run inside WSL
and are spawned by one Node door, `lib/yue2/wsl.ts`. Each speaks the contract in `_contract.py`: the
last stdout line is one JSON object, `{"ok":true,...}` with exit 0 or `{"ok":false,"error","kind"}` with
exit 1. Every path comes from argv or env. `docs/yue2.md` is the operator's page: install, the doctor,
each op's arguments and answer, the env vars and the measured recipe.

**`gen.py`** renders ONE take of YuE2-3B per call: a style file, a lyrics file, a seed, a `cot` mode
(full, melody or off) and an optional semantic-stage `--cfg`, optionally through a LoRA adapter (both
the sv-fused and the ntc-native layouts, applied in memory; the cached weights on disk are never
written). The model loads on every call (6-12 s warm), and Node runs one call per seed and condition.
`--dry-run` checks the arguments and the inputs without loading the model. Runs in `.venv`.

**`score.py`** scores ONE take into the `SongScores` fields: lyric WER and its insertion-free twin, PER,
the five SongEval dimensions, the four Audiobox aesthetics axes, the VAE-frame buzz index and the
Qwen3-ASR transcript. Every model hears a -14 LUFS copy that the look-ahead true-peak limiter
loudness-matches exactly (cache version 2). The stages run in this order: vocal separation, Qwen3-ASR,
faster-whisper, WER/PER, SongEval, Audiobox. Each model loads alone and is freed before the next,
so the GPU peak is that of the largest single model. Runs in `.venv-eval`.

**`post.py`** makes a variant of a take: `stems` (RoFormer + htdemucs_6s, with pre-scaling to stay below
the separator's normaliser, and the 44.1 kHz separator output resampled back to 48 kHz), `buses`
(yue2-lab's vocal, drum and bass chains over the stems, each RMS-matched, then re-summed with `other`
and the separation residual; it separates first when `stems` is not in the list; `_buses.py`), `debuzz` (the
unbiased moving-average Ruach debuzz on the full mix) and `master` (Matchering to a reference when one
is given, then the -14 LUFS / -1 dBTP limiter). `--op ab-window` cuts the 25 s blind-A/B window from
the first vocal onset, with fades and the same loudness match. Runs in `.venv-eval`.

**`analyze.py`** is a dev CLI that Node never runs. It groups score records by condition, applies the
lyric gate (WER <= 0.10) and ranks the clips that pass. It reads both yue2-lab's `scores_*.jsonl` and
the moved scorer's answers.

The shared modules are `_contract.py` (the answer, the paths, the GPU helpers), `_audio.py` (the
limiter, the loudness match, the buzz metric), `_text.py` (lyrics and WER/PER), `_post_dsp.py`
(separation, debuzz, mastering, the onset finder), `_buses.py` (the stem buses, with the energy-weighted
gain-reduction measure) and `_adapter.py` (LoRA). `install-gen.sh` and
`install-eval.sh` create the two venvs; the doctor's hint names whichever one is missing.

## Venvs (inside WSL, under `YUE2_HOME`, default `~/yue2-lab`)

| Venv | Runs | Holds |
| --- | --- | --- |
| `.venv` | `gen.py` | Python 3.11, the `yue2-infer` 0.1.5 wheel, which hard-pins torch 2.10.0 (cu128), transformers 4.57.6 and numpy 2.2.6. **Never install into it**: one stray resolve breaks the pin. |
| `.venv-eval` | `score.py`, `post.py` | Python 3.11, torch 2.10.0 (cu128, pinned for CTranslate2's cuBLAS 12), qwen-asr, faster-whisper, audio-separator[gpu], muq 0.1.0 + SongEval (`ext/SongEval`), audiobox-aesthetics, jiwer, phonemizer + espeakng-loader, pyloudnorm, librosa, matchering, pedalboard, imageio-ffmpeg (linked as `.eval-bin/ffmpeg`). |

## Licences

- **YuE2 weights** (m-a-p/YuE2-3B, m-a-p/YuE2-Vae): **CC BY-NC 4.0**, non-commercial. Every take carries
  that rights record (`YUE2_RIGHTS`, warn-only policy).
- **matchering** and **pedalboard**: **GPL-3.0**. Both live only in the WSL eval venv and are reached only
  across the process boundary: Node spawns `post.py` and reads one JSON line, and nothing in the app
  imports or links them. This is the same arrangement as the audio sidecar (`pipeline/audio`).
  pedalboard runs the stem buses (`_buses.py`), and only `post.py`'s `buses` stage imports it.
- The debuzz is a re-implementation of the Ruach Studio algorithm (AGPL). It was written from that
  description, and no code was copied.
- SongEval (ASLP-lab), MuQ, Qwen3-ASR, faster-whisper, audio-separator, Demucs and Audiobox Aesthetics
  each carry their own upstream licence, and their weights download into the WSL Hugging Face cache.
