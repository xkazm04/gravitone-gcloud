# The audio sidecar

`pipeline/audio/sidecar.py` measures an audio file in delivery units and renders a voice-fx chain
over a take. It is a CLI in this box's Python, reached from Node through one door,
`lib/audio/sidecar.ts`. Nothing is sent anywhere and nothing is spent: it is local DSP.

| File | Holds |
| --- | --- |
| `pipeline/audio/sidecar.py` | the CLI: `measure`, `fx`, `doctor`, the decode, the JSON contract. |
| `pipeline/audio/loudness.py` | integrated loudness, true peak, loudness range, clipping, edge silence. |
| `pipeline/audio/fxchain.py` | the chain's re-validation (`STAGES`) and the pedalboard render. |
| `lib/audio/sidecar.ts` | `measureFile()`, `applyChain()`, `sidecarDoctor()`. Server-only. |
| `lib/producers/media-facts.ts` | `sidecarLoudness()`: the sidecar as the measure pass's port. |
| `packages/domain/src/audio.fx.ts` | `fxChainSchema`, the chain's one definition. |
| `packages/domain/src/audio.accept.ts` | `AudioMeasureFull`, the profiles a measure is judged against. |

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
| `refused` | the chain, a bound, a missing file, a bad argument | `invalid` |
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
