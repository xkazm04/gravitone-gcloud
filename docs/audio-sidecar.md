# The audio sidecar

`pipeline/audio/sidecar.py` measures an audio file in delivery units, renders a voice-fx chain
over a take, and triages a take against its brief. It is a CLI in this box's Python, reached from Node through one door,
`lib/audio/sidecar.ts`. Nothing is sent anywhere and nothing is spent: it is local DSP.

| File | Holds |
| --- | --- |
| `pipeline/audio/sidecar.py` | the CLI: `measure`, `fx`, `triage`, `doctor`, the decode, the JSON contract. |
| `pipeline/audio/loudness.py` | integrated loudness, true peak, loudness range, clipping, edge silence. |
| `pipeline/audio/fxchain.py` | the chain's re-validation (`STAGES`) and the pedalboard render. |
| `pipeline/audio/triage.py` | the triage contract: thresholds, units, the context's re-validation, the flag rule. |
| `pipeline/audio/triage_detect.py` | the triage detectors (numpy/scipy), but for the two below. |
| `pipeline/audio/triage_edges.py` | `broken-ending` and `loop-seam`, and the corpus measurements behind their methods. |
| `lib/audio/sidecar.ts` | `measureFile()`, `applyChain()`, `triageFile()`, `sidecarDoctor()`. Server-only. |
| `lib/producers/media-facts.ts` | `sidecarLoudness()`: the sidecar as the measure pass's port. |
| `packages/domain/src/audio.fx.ts` | `fxChainSchema`, the chain's one definition. |
| `packages/domain/src/audio.accept.ts` | `AudioMeasureFull`, the profiles a measure is judged against. |
| `packages/domain/src/audio.triage.ts` | the triage checks, units, `TRIAGE_THRESHOLDS`, the context and finding schemas. |

## Installing

```bash
python -m pip install -r pipeline/requirements.txt
```

The sidecar needs `numpy`, `scipy`, `soundfile`, `pyloudnorm` and `pedalboard`; the rest of that
file is the foundry's. `ffmpeg` on PATH (or `FFMPEG`) decodes what soundfile does not read (m4a,
aac, anything in a video container). The interpreter is `PYTHON`, else `python` on Windows and
`python3` elsewhere. Measured on this box, 2026-10-24: Python 3.12.1, numpy 2.4.6, scipy 1.15.3,
soundfile 0.12.1, pyloudnorm 0.2.0, pedalboard 0.9.26.

pedalboard is GPL-3. It runs in this separate process and nothing that links it is distributed;
if the app is ever shipped to someone else, the CLI boundary is what keeps it that way.

## Doctor

```bash
python pipeline/audio/sidecar.py doctor --json
```

```json
{"ok": true, "python": "3.12.1 (...)", "modules": ["numpy", "scipy", "soundfile", "pyloudnorm", "pedalboard"],
 "missing": [], "errors": {}, "versions": {"numpy": "2.4.6", "...": "..."}, "ffmpeg": "C:\\ffmpeg\\bin\\ffmpeg.EXE"}
```

`doctor` imports only the standard library itself, so it answers on a Python with nothing
installed: every module that does not import is in `missing`, and `errors` holds Python's own
sentence for it (`No module named 'pedalboard'`, or a native library's OSError). `ffmpeg` is the
resolved path, or `null`. `sidecarDoctor()` turns a non-empty `missing` into an `unavailable`
error naming each module with that sentence.

## The contract

stdout's LAST line is one JSON object, whatever happened. A failure is
`{"ok": false, "error": "<the tool's own sentence>", "kind": "..."}` and exit code 1:

| `kind` | When | Node code |
| --- | --- | --- |
| `missing-module` | an import failed; `error` is Python's ImportError sentence | `unavailable` |
| `refused` | the chain, the triage context, a bound, a missing file, a bad argument | `invalid` |
| `failed` | a decode, a render or a write; `error` is soundfile's, ffmpeg's or pedalboard's words | `unavailable` |

A run that printed no JSON (a crash before the contract could answer, a timeout) is reported by
the Node door with its exit code and the last three lines of its stderr. Every call is bounded:
60 s by default (`{ timeoutMs }`), 30 s for doctor. When `canSpawnLocalBinaries()`
(`lib/deployment.ts`) is false, every verb is refused with the posture's own sentence and nothing
spawns.

### measure

```bash
python pipeline/audio/sidecar.py measure --in take.wav --json
```

```json
{"ok": true, "measure": {"integratedLufs": -20.03, "truePeakDb": -19.99, "lra": 0.0, "clippedSamples": 0,
 "leadSilenceS": 0.0, "tailSilenceS": 0.0, "durationS": 10.0}}
```

| Key | What |
| --- | --- |
| `integratedLufs` | ITU-R BS.1770-4 via pyloudnorm. `null` for silence and for a file shorter than one 400 ms block - never a floor number. |
| `truePeakDb` | dBTP, 4x oversampled (`scipy.signal.resample_poly`), chunked. `null` when every sample is zero. |
| `lra` | EBU Tech 3342, computed in `loudness.py`: 3 s short-term windows every 100 ms, -70 LUFS absolute and -20 LU relative gates, 95th minus 10th percentile. `null` under 3 s. |
| `clippedSamples` | frames where any channel reaches abs 0.999. |
| `leadSilenceS`, `tailSilenceS` | 50 ms windows, silent below -50 dBFS RMS. An all-silent file has both equal to its length. |
| `durationS` | decoded frames over the rate. |

The file is decoded at its own rate and channel count: soundfile first, then ffmpeg to a temp
float wav. Blob files carry no extension, so the format is never guessed from a name.

Checked against ffmpeg `ebur128=peak=true` on the same files (2026-10-24): a 1 kHz sine at
-20 dBFS reads -20.03 LUFS against -20.0, LRA 0.0 against 0.0, true peak -19.99 against -20.0; a
20 s tone stepping 20 dB every 4 s reads -8.24 LUFS / LRA 20.0 / -6.02 dBTP against -8.2 / 20.0 /
-6.0, the same as mp3 and -8.25 / 20.0 / -2.46 as AAC (ffmpeg -8.2 / 20.0 / -2.5). ffmpeg bins the
range at 0.1 LU where `loudness.py` interpolates, so the two can differ by about 0.1 LU.

### fx

```bash
python pipeline/audio/sidecar.py fx --in take.wav --chain chain.json --out take-fx.wav --json
```

```json
{"ok": true, "durationS": 2.0, "gainDb": -2.64, "truePeakDb": -1.1, "rate": 48000, "channels": 1, "notes": []}
```

`--chain` is a file (what `applyChain()` writes) or the JSON inline. The chain is validated again
in Python, against `STAGES` in `fxchain.py`, which mirrors `fxChainSchema`: an unknown kind or
key, a missing key, a number outside its bound, `v` other than 1, or a stage count outside 1..8 is
refused with its path (`stages.0.semitones: 14 is outside -12..12`). Nothing is clamped. The
vitest lane renders every stage at both ends of its schema bounds, so the two tables cannot drift
apart without a red test.

The output is 16-bit PCM WAV at the input's rate and channel count, as long as the input: a
delay's or a reverb's tail past the end is cut, not appended, because the line's timing on the
strip and the acceptance length check were planned against the take's length. When the rendered
true peak is above -1 dBTP, a final gain sets it to -1.1 dBTP (the 0.1 dB is room for the
16-bit write); `gainDb` is that gain, 0 when none was needed, and `truePeakDb` is measured on the
file as written. A lowpass above Nyquist is set just under it and `notes` says so.

### triage

```bash
python pipeline/audio/sidecar.py triage --in take.wav --context context.json --json
```

```json
{"ok": true, "triage": {"version": 1, "flagged": 2, "findings": [
  {"check": "clipping", "verdict": "flag", "value": 12, "threshold": 3, "unit": "samples", "atS": 3.0},
  {"check": "duration", "verdict": "skip", "value": null, "threshold": 0.1, "unit": "ratio", "note": "no asked length"},
  {"check": "broken-ending", "defect": "broken-ending", "verdict": "flag", "value": 0.0, "threshold": -12, "unit": "dB", "atS": 10.0},
  "..."]}}
```

`--context` is the brief the take was made from, as a file (what `triageFile()` writes):
`{kind: "music"|"sfx"|"voice", durationS?, tempoBpm?, loop?, sections?: [{name, startMs, endMs}]}`,
validated again in `triage.py` with `triageContextSchema`'s rules (`@gt/domain/audio.triage`). An
unknown key or a bad value is refused with its path (`context (root): unrecognized key 'loopy'`). A
key that is absent was never committed, and every check that needs it comes back `skip` with a
`note` and a null `value`; nothing is guessed. One finding per check, always in the same order;
`flagged` counts the `flag`s. A structural check carries the `DEFECTS` code it evidences
(`lib/sound/types.ts`). The decode is `measure`'s.

A value AT its threshold flags: the threshold is where the defect begins. `loudness-range` is the
one exception, a band where the bounds themselves pass. The thresholds are per kind and live in
`TRIAGE_THRESHOLDS`; `triage.py` holds a copy (the CLI takes none and the context is strict), and
`tests/next-server/audio-triage.test.ts` fails when the two differ.

| Check | Method | Unit | music / sfx / voice |
| --- | --- | --- | --- |
| `clipping` | longest run of consecutive samples at abs 0.999 or more, in one channel; `atS` its start | samples | 3 |
| `true-peak-over` | `measure`'s 4x-oversampled true peak; skips a file with no signal | dBTP | 0 |
| `loudness-range` | `measure`'s integrated loudness outside the band; null (silent, under 400 ms) flags | LUFS | -30..-6 / -40..-6 / -30..-10 |
| `dead-air` | longest run of silent 50 ms windows (under -50 dBFS) between the first and last loud one | s | 2 / 1.5 / 1.5 |
| `duration` | abs(decoded - `durationS`) / `durationS`; skips without `durationS` | ratio | 0.1 / 0.1 / 0.35 |
| `broken-ending` | the last 10 ms frame above the take's own floor (95th-percentile frame minus 45 dB) against the median active level of the 2 s before; an envelope falling 30 dB/s or more over the last 300 ms passes; a silent tail flags at 3 / 2 / 2 s, with a note; skips a loop | dB | -12 |
| `tempo-instability` | dB spectral flux per channel, autocorrelation comb over 60..200 bpm; first third against last third, each within 10 % of the whole file's tempo; music only; skips with no steady pulse | bpm | 3 |
| `section-boundary` | novelty = RMS over 24 log bands of the mean band level 3 s before against 3 s after; largest distance from a planned boundary to its nearest peak; skips without two `sections` | s | 2 |
| `loop-seam` | the step the end makes into the start, against the take itself: with a rhythm, the drift of its repeats across its length (level, four band groups); a texture, its last 0.5 s into its first over the median such step inside; or the waveform jump at the wrap over the 99.9th-percentile sample step; only when `loop: true` | dB | 3 |
| `mono-fold` | LUFS(L, R) - LUFS(M, M), M = (L+R)/2; a fold to silence flags with a null value; skips mono | dB | 3 |

`triage.py`'s header gives the method in full, and the reason behind each constant is in a
comment beside it in `triage_detect.py` and `triage_edges.py`. One example is the onset floor
that keeps a steady pad from reading as a beat. `triage_edges.py` also records what WP2's seeded
corpus measured against the first cuts of `broken-ending` and `loop-seam`. Measured on this box
(2026-10-24, the box loaded by other jobs), a 5-minute mp3 triages in 7.8 to 8.9 s against
5.9 s for `measure`. Most of that time is the decode and the loudness.

### audition and sketch

`python pipeline/audio/sidecar.py audition --spec <spec.json> --out <wav> --json` plays ONE fixed
four-bar phrase (I-V-vi-IV in a major key, i-VI-III-VII in a minor one) on one sampled instrument
at a tempo and key, and answers `{ok, durationS, lufs, notes, range, measured}`. `sketch` plays
the same phrase for several instruments over a painted shape, one level per four bars, the
voices thickening with the level, and answers `{ok, durationS, lufs, voices, columns}`. Both set
the integrated loudness to the spec's `lufs` (the composer asks for -20), so a comparison is
about timbre and not about level. Node reaches them through `lib/audio/sidecar.ts`
`renderAudition` / `renderSketch`, and `lib/audio/atlas.ts` feeds them from the sample roots in
`GRAVITONE_SAMPLE_ROOTS` and caches what they render in `GRAVITONE_AUDITION_DIR`.

- **Pitches are measured, not read off names** (`audition.py`, YIN): FL Studio numbers its
  multisamples and Ableton names notes with its own octave rule, so a file's note name is used
  only when it has one, and a measured pitch is kept to the cent so a sharp sample is resampled
  back into tune. The map is cached per file list.
- **FL Studio's packs are Ogg Vorbis in a RIFF** (format tag 0x674F). libsndfile refuses them as
  WAV, so their `data` chunk is decoded as Ogg, to a bound (the stream reports no length).
- **A kit plays a groove, not the phrase** (`drums.py`): pieces are named from file names, and
  every kit plays the same four bars, thinning with the level.
- Measured 2026-10-28 on this box: 25 instruments at 96 bpm, D minor, each rendered at
  -20.0 LUFS (one kit at -20.6), 11.22 s long, and byte-identical when rendered a second time. A
  first render is 2 to 7 s; a cached one is a file read.

## The stage map

| `kind` | Params (bounds) | Rendered by |
| --- | --- | --- |
| `gain` | `db` -24..12 | `pedalboard.Gain(gain_db)` |
| `highpass` | `hz` 20..2000 | `pedalboard.HighpassFilter(cutoff_frequency_hz)` |
| `lowpass` | `hz` 500..20000 | `pedalboard.LowpassFilter(cutoff_frequency_hz)` |
| `pitch` | `semitones` -12..12 | `pedalboard.PitchShift(semitones)` |
| `delay` | `delayS` 0.02..2, `feedback` 0..0.9, `mix` 0..1 | `pedalboard.Delay(delay_seconds, feedback, mix)` |
| `reverb` | `roomSize`, `damping`, `wet`, `dry`, `width`, each 0..1 | `pedalboard.Reverb(room_size, damping, wet_level, dry_level, width)` |
| `chorus` | `rateHz` 0.05..10, `depth` 0..1, `mix` 0..1 | `pedalboard.Chorus(rate_hz, depth, mix)` |
| `phaser` | `rateHz` 0.05..10, `depth` 0..1, `mix` 0..1 | `pedalboard.Phaser(rate_hz, depth, mix)` |
| `distortion` | `driveDb` 0..40 | `pedalboard.Distortion(drive_db)` |
| `bitcrush` | `bitDepth` 2..16 | `pedalboard.Bitcrush(bit_depth)` |
| `compressor` | `thresholdDb` -60..0, `ratio` 1..20 | `pedalboard.Compressor(threshold_db, ratio)` |
| `gsm` | none | `pedalboard.GSMFullRateCompressor()` |
| `ringmod` | `hz` 10..2000, `mix` 0..1 | numpy: `y = x*(1-mix) + x*sin(2*pi*hz*t)*mix` |

Stages run in signal order. Consecutive pedalboard stages are one `Pedalboard`; a `ringmod`
splits the board where it sits.

## Where the measure lands

The media-facts job's measure pass (`lib/sound/measureRun.ts`) asks the sidecar for each audio blob
it measures and writes five figures beside the waveform in kernel `audio_measures` (library v4):
`lufs`, `true_peak_db`, `lra`, `clipped_samples`, `tail_silence_s`. The Library detail
(`withMeasure`) prefers them over the loudness a take carried. NULL means the sidecar has not
measured those bytes; `clipped_samples` is the marker, because a measured silent file has a count
and no loudness. A box without the sidecar still lands every waveform and length, with the five
NULL and the doctor's sentence once in the step's `loudnessFailed`; the next run after
`pip install` backfills them (`loudnessMissing`). Rows from before v4 are backfilled the same way.
