"""The analyze half of the audio sidecar: a finished song's tempo, its octave neighbours and its key.

Called by sidecar.py `analyze` (spark suno-advisor: an uploaded Suno take's facts). Takes float
samples shaped (frames, channels) and the rate, so it is exercised on generated signals without a
file. librosa is imported inside the functions, like every other sidecar dependency, so `doctor`
still answers on a Python without it.

- Tempo: librosa.beat.beat_track on the mono mix resampled to 22050 Hz (hop 512). Its global tempo
  is quantised to the onset envelope's frame lag (at 120 bpm the two nearest lags read 117.5 and
  123.0, both 2 % off), so when it found at least 8 beats the tempo is REFINED from the beats
  themselves: the least-squares slope of beat time over beat index, which averages the frame
  quantisation away on a steady song. The refinement is kept only within 8 % of the tracker's own
  tempo (a drifting or half-found beat grid falls back to the tracker). This repo's FFT estimator
  (lib/sound/measure.ts) made octave errors on Suno mixes where librosa was within 1-2 %
  (docs/concepts/suno/README.md), which is why the tempo is librosa's.
- Octave neighbours (`alt`): half and double the tempo, each kept when it lies in 60..200 bpm - a
  beat tracker's usual error is exactly one octave, so the page shows what else it could be.
- Key: Krumhansl-Schmuckler. The mean chroma_cqt over the song (12 pitch classes) is correlated
  (Pearson) with the Krumhansl-Kessler major and minor profiles rotated to all 12 tonics; the best
  of the 24 is the key.
- Key strength, 0..1: (r_best - r_second) / (1 - r_second), clipped to 0..1 - the share of the
  correlation headroom the runner-up left that the winner took. 0 is a tie (two keys fit equally),
  1 a winner that correlates perfectly. The runner-up is often the relative major/minor, which
  shares every note of the scale, so a clear tonal song reads ~0.05..0.3 here; near 0 is a coin
  toss and a page should say so. A silent or pitch-less file (no chroma energy) has no key.
"""

import numpy as np

ANALYSIS_RATE = 22050
HOP = 512
ALT_MIN_BPM = 60.0
ALT_MAX_BPM = 200.0
REFINE_MIN_BEATS = 8
REFINE_MAX_DRIFT = 0.08

NOTES = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")
# Krumhansl & Kessler (1982) probe-tone profiles, tonic first.
MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


def _mono(x, rate):
    import librosa

    y = np.asarray(x, dtype=np.float32)
    y = y.mean(axis=1) if y.ndim == 2 else y
    if rate != ANALYSIS_RATE:
        y = librosa.resample(y, orig_sr=rate, target_sr=ANALYSIS_RATE)
    return np.ascontiguousarray(y, dtype=np.float32)


def tempo(y):
    """{bpm, alt, beats, method} or None when no beat was found."""
    import librosa

    est, beats = librosa.beat.beat_track(y=y, sr=ANALYSIS_RATE, hop_length=HOP)
    est = float(np.atleast_1d(est)[0])
    if not np.isfinite(est) or est <= 0:
        return None
    bpm, method = est, "librosa.beat.beat_track"
    times = librosa.frames_to_time(beats, sr=ANALYSIS_RATE, hop_length=HOP)
    if len(times) >= REFINE_MIN_BEATS:
        slope = float(np.polyfit(np.arange(len(times)), times, 1)[0])
        if slope > 0:
            refined = 60.0 / slope
            if abs(refined - est) / est <= REFINE_MAX_DRIFT:
                bpm, method = refined, "librosa.beat.beat_track, refined by the beat-interval regression"
    alt = [round(b, 1) for b in (bpm / 2.0, bpm * 2.0) if ALT_MIN_BPM <= b <= ALT_MAX_BPM]
    return {"bpm": round(bpm, 1), "trackerBpm": round(est, 1), "alt": alt, "beats": int(len(times)), "method": method}


def key(y):
    """{name, strength, correlation, runnerUp, method} or None for a file with no pitch content."""
    import librosa

    chroma = librosa.feature.chroma_cqt(y=y, sr=ANALYSIS_RATE, hop_length=HOP)
    profile = chroma.mean(axis=1)
    if not np.all(np.isfinite(profile)) or float(profile.sum()) <= 1e-6 or float(np.std(profile)) <= 1e-9:
        return None
    scored = []
    for tonic in range(12):
        for mode, ref in (("major", MAJOR), ("minor", MINOR)):
            r = float(np.corrcoef(profile, np.roll(ref, tonic))[0, 1])
            scored.append((r if np.isfinite(r) else -1.0, f"{NOTES[tonic]} {mode}"))
    scored.sort(key=lambda s: s[0], reverse=True)
    (r1, name), (r2, second) = scored[0], scored[1]
    strength = 0.0 if r2 >= 1.0 else max(0.0, min(1.0, (r1 - r2) / (1.0 - r2)))
    return {"name": name, "strength": round(strength, 3), "correlation": round(r1, 3),
            "runnerUp": {"name": second, "correlation": round(r2, 3)},
            "method": "Krumhansl-Schmuckler over mean chroma_cqt; strength = (r1 - r2) / (1 - r2)"}


def analyze(x, rate):
    """The song's tempo and key; the loudness is loudness.measure's, added by the caller."""
    y = _mono(x, rate)
    return {"durationS": round(x.shape[0] / float(rate), 3), "analysisRate": ANALYSIS_RATE,
            "tempo": tempo(y), "key": key(y)}
