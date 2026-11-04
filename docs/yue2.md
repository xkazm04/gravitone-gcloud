# The song lab engine (YuE2 in WSL)

The song lab renders songs with YuE2-3B (m-a-p, open weights) on this box's GPU, scores every take,
and makes post variants. The Python lives in `pipeline/yue2/` (moved from `kiro/yue2-lab`) and runs
inside WSL in two venvs. Node reaches it through one door, `lib/yue2/wsl.ts`, from kernel producers
on the `gpu.local` lane.

| File | Holds |
| --- | --- |
| `pipeline/yue2/gen.py` | one take per call (style, lyrics, seed, cot, cfg, optional LoRA). |
| `pipeline/yue2/score.py` | one take's `SongScores`: WER, PER, SongEval, Audiobox, buzz, transcript. |
| `pipeline/yue2/post.py` | stems, buses, debuzz, master (optionally to a reference), and the A/B window. |
| `pipeline/yue2/_buses.py` | the stem buses of the `buses` stage (vocals, drums, bass, then the re-sum). |
| `pipeline/yue2/analyze.py` | a dev CLI: per-condition summary and the gated ranking. Node does not run it. |
| `pipeline/yue2/_contract.py` | the last-line JSON answer, `YUE2_HOME`, the GPU helpers. |
| `pipeline/yue2/install-{gen,eval}.sh` | create the two venvs. These are what the doctor's hint runs. |
| `lib/yue2/wsl.ts` | `runYue2()`, `yue2Doctor()`, `toWslPath()`. Server-only. |
| `lib/yue2/wslSpawn.ts` | the bounded spawn, the stream tails, and the two-sided kill. |
| `pipeline/yue2/README.md` | one paragraph per script, the venv contents, and the licences. |

## Installing

WSL2 with an Ubuntu distro and the Windows NVIDIA driver are required. Inside WSL nothing needs sudo:
there is no apt step, uv provides Python 3.11, and ffmpeg is imageio-ffmpeg's static binary.

```bash
wsl.exe -d Ubuntu --exec bash /mnt/c/<repo>/pipeline/yue2/install-gen.sh    # YUE2_HOME/.venv
wsl.exe -d Ubuntu --exec bash /mnt/c/<repo>/pipeline/yue2/install-eval.sh   # YUE2_HOME/.venv-eval
```

- **`.venv` (generation).** The `yue2-infer` 0.1.5 wheel hard-pins torch 2.10.0 (cu128), transformers
  4.57.6 and numpy 2.2.6. `install-gen.sh` only creates this venv and never installs into an
  existing one, and nothing else should either. The weights (6.8 GB + 507 MB) download into
  `~/.cache/huggingface` on the first render (about 10 min). After that a load takes 6-12 s and a
  render about 9.5 GB of VRAM.
- **`.venv-eval` (scoring and post).** It holds Qwen3-ASR-1.7B, faster-whisper large-v3, the
  Mel-Band RoFormer and htdemucs_6s separators, SongEval (`YUE2_HOME/ext/SongEval`) with
  MuQ-large-msd-iter, Audiobox Aesthetics, jiwer, phonemizer + espeak-ng, pyloudnorm, librosa,
  matchering and imageio-ffmpeg (linked as `YUE2_HOME/.eval-bin/ffmpeg`). torch is pinned to 2.10.0
  cu128 because an unpinned resolve picks CUDA 13, and CTranslate2 needs cuBLAS 12. There is no C
  compiler on a stock box, so diffq builds with zig as `cc`.
- **Measured on this box, 2026-11-04.** WSL2 Ubuntu 24.04.1, an RTX 4090 with driver 610, uv 0.12.5,
  audio-separator 0.48.0, faster-whisper 1.2.1, qwen-asr 0.0.6, muq 0.1.0, matchering 2.0.6 and
  pedalboard 0.9.26.

## The doctor

`yue2Doctor()` runs in Node and needs no Python. It asks `wsl.exe -l -q` whether the distro exists,
then runs one probe inside WSL that checks four things: that both venv pythons are executable, the
first line of `nvidia-smi -L`, and ffmpeg (`.eval-bin/ffmpeg`, else imageio-ffmpeg's binary). It
answers `{wsl, distro, genVenv, evalVenv, gpu?, ffmpeg, hint?}`. `hint` is the single command that
fixes the FIRST missing piece:

| Missing | Hint |
| --- | --- |
| wsl.exe | `wsl --install` |
| the distro | `wsl --install -d <distro>` |
| `.venv` | `wsl.exe -d <distro> --exec bash <repo>/pipeline/yue2/install-gen.sh` |
| `.venv-eval` or ffmpeg | `wsl.exe -d <distro> --exec bash <repo>/pipeline/yue2/install-eval.sh` |
| the GPU | `wsl --update` (WSL's GPU passthrough uses the Windows driver) |

A run that ends without a JSON answer, such as a missing venv or a missing `wsl.exe`, comes back as
`unavailable`. The message holds its stderr tail, the doctor's missing piece and the fix. It never
throws. The doctor has to run where the worker runs (a scheduled-task context sees its own user's
WSL).

## How Node runs a script

```
wsl.exe -d <distro> --exec setsid -w sh -c 'echo "yue2-pid $$"; exec "$@"' yue2 [env YUE2_HOME=<h>] <python> <repo>/pipeline/yue2/<op>.py <args...>
```

- **`--exec`, never `--`.** With `--`, wsl.exe passes the command line to the distro's login shell.
  On 2026-11-04 the argument `q"x y` failed there with bash's "unexpected EOF". With `--exec`, every
  array element arrives as one argv element: spaces, quotes, `$HOME`, `;|&`, `*` and the empty
  string all pass through. wsl.exe still drops a backslash from an unquoted argument (`back\slash`
  arrives as `backslash`), so the door refuses any argument with a backslash as `invalid`. Paths go
  through `toWslPath()`, and text such as lyrics and style travels in files.
- **No shell on the Windows side.** Node spawns with an argument array, `windowsHide`, and `shell:
  false`. The `sh -c` script inside WSL is a constant, and the real command arrives as its
  positional arguments.
- **Stopping kills both sides.** `setsid` makes the script a process-group leader, and the launcher
  prints its pid first (Node strips that line). A timeout or an abort sends `wsl.exe --exec kill
  -KILL -- -<pid>`, which reaches the whole Linux group (python and its ffmpeg and nvidia-smi
  children), and `taskkill /T /F` on the relay. On this box the relay kill alone already ended the
  Linux tree, even a group that ignored HUP and TERM. The pid kill is the guarantee that does not
  depend on how WSL behaves. A stop before the pid line arrives waits up to 2 s for it, then kills
  the relay alone.
- **Posture.** When `canSpawnLocalBinaries()` is false (a managed platform, or `LOCAL_BINARIES=off`),
  nothing is spawned and the answer is `unavailable` with that posture's own sentence.

## The contract

The **last stdout line** is one JSON object. Earlier lines are logs, of which Node keeps a 64 KB tail.

- Success: `{"ok": true, ...op fields}`, exit 0.
- Failure: `{"ok": false, "error": "<sentence>", "kind": "missing-module" | "refused" | "failed"}`,
  exit 1. Node maps `refused` (bad arguments, a missing input file) to `invalid`. It maps the other
  two to `unavailable`, as `lib/audio/sidecar.ts` does.

### gen

`--style-file F --lyrics F --seed N --cot full|melody|off [--cfg X] [--lora P --lora-strength S]
[--lora-trigger W] --out F.flac [--artifacts DIR] [--abc F] [--dry-run]`

Renders exactly one seed per call. `--cfg` scales the semantic stage only. Without it, each mode
uses its own default: 1.0 for full and melody, 1.01 for off. The answer is
`{ok, out, durationS, seconds, peakVramGiB, cot, cfg?, seed, lora?}`. `seconds` is the render's wall
time with the model already loaded, and `peakVramGiB` is torch's peak reserved memory. A CUDA
out-of-memory error answers `failed` and names the shared GPU. `--dry-run` validates the inputs
and checks that the `yue2` package imports, without loading the model. It answers
`{ok, dryRun: true, ...}`.

### score

`--in F --lyrics F [--cache-dir DIR] [--skip m1,m2]`. The stages, in order: `sep`, `qwen`, `whisper`,
`per`, `songeval`, `aesthetics` and `buzz`.

The answer is `{ok, scores}`, and the fields of `scores` are exactly the `SongScores` names. Node
adds `sha`, `scorerVersion` and `scoredAt`. A metric that could not be computed is omitted, and the
log says why.

| Field | From |
| --- | --- |
| `wer` | the lowest standard WER over {Qwen3-ASR, Whisper} x {mix, vocal stem}, repeated choruses included. The lyric gate reads this field. |
| `werSd` | the same, insertion-free: (S+D)/N |
| `per` | the phoneme error rate (espeak-ng), lowest of the four |
| `songEval` | coherence, musicality, memorability, clarity and naturalness. The mean is not included. |
| `aesthetics` | Audiobox `ce`, `cu`, `pc` and `pq` |
| `buzzIdx` | the mix's buzz index, dB: 4-12 kHz envelope periodicity at the 25 Hz VAE frame rate, over a null distribution |
| `transcript` | Qwen3-ASR on the mix |

Every model hears a -14 LUFS copy that is loudness-matched exactly: gain, then the look-ahead
true-peak limiter at -1 dBTP, with the make-up gain repeated until the copy is within 0.05 LU
(cache version 2). Results are cached under `--cache-dir` (default `YUE2_HOME/.score-cache`), keyed
by the path, its mtime and the cache version.

### post

`--in F --out F --stages stems,buses,debuzz,master [--reference F] [--debuzz-strength 0.8]`. The stages
run in that order (`YUE2_POST_STAGES`), whatever order they are given in. The answer is
`{ok, out, stages, lufs, truePeakDb, stems?, buses?}`.

- `stems` writes vocals, drums, bass, other and the separation residual to `<out>_stems/*.wav` (float).
  The mix passes through unchanged, because the stems sum back to it exactly.
- `buses` processes the separated stems and re-sums them. These are yue2-lab's own chains, with its
  measured settings:
  - vocals: HPF 80 Hz, a 5-9 kHz band-split de-esser, comp 3:1 at -18 dB (5 ms / 80 ms), presence
    +2 dB at 3.5 kHz, and a plate send at 12 % (room size calibrated to RT60 1.2 s);
  - drums: comp 4:1 (10 ms / 100 ms) with the threshold searched for 3 dB of gain reduction, then 20 %
    parallel saturation;
  - bass: mono below 120 Hz, then a gentle 2:1 comp for 1.5 dB of gain reduction.

  Each bus is RMS-matched back to its stem. The buses are then summed with `other` and the
  separation residual. Gain reduction is energy-weighted: it is the RMS drop. yue2-lab's earlier
  "loudest 25 % of frames" measure read +4.3 dB on a mostly silent bass stem. Without `stems` in the
  list, `buses` separates first (the same cached separation) and writes no stem files. The `buses`
  answer field holds `sepResidualDb` (the separation residual, which is summed back in) and
  `resumResidualDb` (untouched stems plus residual against the input; float rounding only). It also
  holds, per bus (`vocals`, `drums`, `bass`), `grDb` and `outputGainDb`, plus each bus's own settings.
- `debuzz` is the unbiased (`smooth`) debuzz on the full mix, for 48 kHz takes only.
- `master` with `--reference` runs Matchering to the reference, then the limiter to -14 LUFS / -1
  dBTP. Without a reference it runs the limiter only.

A live run of `buses,master` on yue2-lab `outputs/hiphop_s3_cotfull.flac` (2026-11-04, separation
cached) gave -14.0 LUFS and -1.0 dBTP. The separation residual was -22.77 dB and the re-sum residual
-188.7 dB. The gain reduction was 2.16 dB on vocals (6.83 dB on the de-ess band), 3.0 dB on drums
and 1.5 dB on bass. The chain took 6.7 s.

A take's sha (`lib/yue2/sha.ts` `takeSha`) is the sha256 of its stored bytes. It is computed once,
when `lib/yue2/facts.ts` `fileYue2Take` files the take, and is stored as `facts.sha`. The backfill
sets it too. `takeSha` answers from the facts, so pairing never re-reads audio. It hashes the
stored file only for facts filed before S2, which carry no sha.

`--op ab-window --in F --out F --window-s 25 [--start S]` answers `{ok, out, windowS: [start, end],
vocalOnsetS}`. The window starts at the first vocal onset, read from the RoFormer vocal stem, which
is cached in `YUE2_HOME/.post-cache`. It is clamped to the take and given 50 ms fades, then
loudness-matched to -14 LUFS / -1 dBTP.

## Env

These are read on the Windows side by `lib/yue2/wsl.ts`. `YUE2_HOME` is passed into WSL with `env`
when it is set.

| Var | Default | Meaning |
| --- | --- | --- |
| `YUE2_WSL_DISTRO` | `Ubuntu` | the distro to run in |
| `YUE2_HOME` | `<WSL $HOME>/yue2-lab` | a WSL path: the venvs, `ext/SongEval`, `models/`, the caches |
| `YUE2_PY_GEN` | `<home>/.venv/bin/python` | the generation python |
| `YUE2_PY_EVAL` | `<home>/.venv-eval/bin/python` | the scoring and post python |

Inside WSL, `gen.py` also reads `YUE2_MODEL` and `YUE2_VAE` (default `m-a-p/YuE2-3B` and `m-a-p/YuE2-Vae`).

## The measured recipe

The launch form defaults to `YUE2_RECIPE`: **cot=off, cfg 1.5, no adapter, best-of-8, lyric gate
WER <= 0.10**. The source is yue2-lab `outputs/ANALYSIS-gen2.md` (2026-11-04). The hip-hop sheet was
rendered over eight seeds. With cot=off and cfg 1.5, 5 of 8 takes passed the gate: mean WER 0.106,
insertion-free WER 0.012, SongEval 3.76, CE 7.13, PQ 8.11. With a slider LoRA at strength 0.5, 4 of
8 passed. The failures come from a looping chorus (the insertions), not from diction, which is why
the gate reads standard WER and the ranking reads SongEval + CE/2.

## Licences

The YuE2 weights are **CC BY-NC 4.0**. Every take carries that rights record, and the policy only
warns. matchering and pedalboard are **GPL-3.0**. They stay in the WSL eval venv behind the
process boundary, like the audio sidecar, and nothing in the app imports them. The debuzz
re-implements Ruach Studio's algorithm (AGPL) from its description. `pipeline/yue2/README.md`
lists the rest.
