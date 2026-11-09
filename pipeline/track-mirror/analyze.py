"""Measure a reference track: the numbers a mirror brief is written from, and judged against.

    python -I pipeline/track-mirror/analyze.py <audio> <out.json> [--stems <dir with stem wavs>]

What it holds and what it refuses to hold. It measures tempo, its drift, key, a beat-synchronous chord
guess, section boundaries, the energy curve and the spectral shape. It writes no pitch line: a mirror
brief may carry palette, energy, production and motion, never melody (registry:
music-prompt-composition/reference-track-anchoring), so the melody is not extracted at all.

The chord guess is template matching on chroma, which reads a dense mix roughly. It is a harmonic
colour for a brief (minor-leaning, four-chord loop), not a transcription.

The same call measures a generated take, so compare.py reads both sides through one instrument.
"""

import argparse
import json
import sys
from pathlib import Path

import librosa
import numpy as np

SR = 22050
HOP = 512
NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
# Krumhansl & Kessler (1982), tonic first, same profiles as pipeline/audio/analyze.py.
MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
BANDS = {"sub": (20, 60), "bass": (60, 250), "low_mid": (250, 1000), "high_mid": (1000, 4000), "air": (4000, 11000)}
STEMS = ("vocals", "drums", "bass", "other")


def round_list(values, digits=2):
    return [round(float(v), digits) for v in values]


def tempo_facts(y, onset_env):
    tempo, beats = librosa.beat.beat_track(onset_envelope=onset_env, sr=SR, hop_length=HOP)
    beat_times = librosa.frames_to_time(beats, sr=SR, hop_length=HOP)
    bpm = float(np.atleast_1d(tempo)[0])
    if len(beat_times) >= 8:
        # The tracker's tempo is quantised to a frame lag; the beats' own slope averages that away
        # (same refinement and same 8 % guard as pipeline/audio/analyze.py).
        slope = np.polyfit(np.arange(len(beat_times)), beat_times, 1)[0]
        refined = 60.0 / slope if slope > 0 else bpm
        if abs(refined - bpm) / bpm <= 0.08:
            bpm = float(refined)
    drift = []
    if len(beat_times) >= 17:
        for start in range(0, len(beat_times) - 16, 8):
            span = beat_times[start + 16] - beat_times[start]
            drift.append({"t": round(float(beat_times[start]), 1), "bpm": round(960.0 / span, 1)})
    tempogram = librosa.feature.tempogram(onset_envelope=onset_env, sr=SR, hop_length=HOP)
    lags = librosa.tempo_frequencies(tempogram.shape[0], sr=SR, hop_length=HOP)
    mean = tempogram.mean(axis=1)
    candidates = []
    for index in np.argsort(mean)[::-1]:
        value = lags[index]
        if not 50 <= value <= 220:
            continue
        if all(abs(value - c) / c > 0.04 for c in candidates):
            candidates.append(float(value))
        if len(candidates) == 4:
            break
    return {
        "bpm": round(bpm, 2),
        "half": round(bpm / 2, 2),
        "double": round(bpm * 2, 2),
        "tempogram_peaks": round_list(candidates, 1),
        "beats": len(beat_times),
        "first_beat_s": round(float(beat_times[0]), 2) if len(beat_times) else None,
        "drift_16_beat_windows": drift,
    }, beats, beat_times


def key_facts(chroma):
    mean = chroma.mean(axis=1)
    if mean.sum() <= 0:
        return {"key": None, "strength": 0.0, "runner_up": None}
    scored = []
    for root in range(12):
        for mode, profile in (("major", MAJOR), ("minor", MINOR)):
            scored.append((float(np.corrcoef(mean, np.roll(profile, root))[0, 1]), f"{NOTES[root]} {mode}"))
    scored.sort(reverse=True)
    best, second = scored[0], scored[1]
    return {
        "key": best[1],
        "strength": round(max(0.0, min(1.0, (best[0] - second[0]) / (1 - second[0]))), 3),
        "runner_up": second[1],
    }


def chord_guess(chroma, beats, beat_times, duration):
    """Bar-level triad template match. Colour for a brief, not a transcription."""
    synced = librosa.util.sync(chroma, beats, aggregate=np.median)
    templates, names = [], []
    for root in range(12):
        for name, intervals in (("", (0, 4, 7)), ("m", (0, 3, 7))):
            vector = np.zeros(12)
            vector[[(root + i) % 12 for i in intervals]] = 1
            templates.append(vector / np.linalg.norm(vector))
            names.append(NOTES[root] + name)
    bars = []
    for start in range(0, synced.shape[1], 4):
        block = synced[:, start : start + 4].mean(axis=1)
        norm = np.linalg.norm(block)
        if norm == 0:
            continue
        scores = np.array(templates) @ (block / norm)
        time = float(beat_times[start]) if start < len(beat_times) else float(duration)
        bars.append({"t": round(time, 1), "chord": names[int(np.argmax(scores))], "fit": round(float(scores.max()), 2)})
    counts = {}
    for bar in bars:
        counts[bar["chord"]] = counts.get(bar["chord"], 0) + 1
    return {"bars": bars, "top": sorted(counts.items(), key=lambda kv: -kv[1])[:6]}


def sections(y, chroma, beats, duration, count=6):
    """Boundaries from timbre plus harmony, snapped to beats. Each row carries the section's own shape."""
    mfcc = librosa.feature.mfcc(y=y, sr=SR, hop_length=HOP, n_mfcc=13)
    width = min(mfcc.shape[1], chroma.shape[1])
    stacked = np.vstack(
        [librosa.util.normalize(mfcc[:, :width], axis=1), librosa.util.normalize(chroma[:, :width], axis=1)]
    )
    synced = librosa.util.sync(stacked, beats[beats < width], aggregate=np.median)
    columns = synced.shape[1]
    count = max(2, min(count, columns // 8)) if columns >= 16 else 1
    if count > 1:
        bounds = librosa.segment.agglomerative(synced, count)
        kept = [int(b) for b in bounds if int(b) < len(beats)]
        times = librosa.frames_to_time(np.array([beats[b] for b in kept]), sr=SR, hop_length=HOP).tolist()
    else:
        times = [0.0]
    times = sorted({0.0, *[round(float(t), 2) for t in times]})
    return [(t, times[i + 1] if i + 1 < len(times) else float(duration)) for i, t in enumerate(times)]


def band_share(power, freqs, start, stop, sr_frames):
    """Share of the section's spectral power in each band: the palette's rough silhouette."""
    block = power[:, start:stop]
    total = float(block.sum()) or 1.0
    return {
        name: round(float(block[(freqs >= low) & (freqs < high)].sum()) / total, 3)
        for name, (low, high) in BANDS.items()
    }


def stem_rms(stem_dir, duration):
    """Per-stem audio at the analysis rate, or nothing when no stems were given."""
    out = {}
    if not stem_dir:
        return out
    for name in STEMS:
        path = Path(stem_dir) / f"{name}.wav"
        if path.exists():
            audio, _ = librosa.load(str(path), sr=SR, mono=True, duration=duration)
            out[name] = librosa.feature.rms(y=audio, frame_length=2048, hop_length=HOP)[0]
    return out


def to_db(value):
    return round(float(20 * np.log10(max(float(value), 1e-6))), 1)


def analyze(path, stem_dir=None):
    y, _ = librosa.load(str(path), sr=SR, mono=True)
    duration = len(y) / SR
    onset_env = librosa.onset.onset_strength(y=y, sr=SR, hop_length=HOP)
    tempo, beats, beat_times = tempo_facts(y, onset_env)
    harmonic = librosa.effects.harmonic(y)
    chroma = librosa.feature.chroma_cqt(y=harmonic, sr=SR, hop_length=HOP)
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=HOP)[0]
    stft = np.abs(librosa.stft(y, n_fft=2048, hop_length=HOP)) ** 2
    freqs = librosa.fft_frequencies(sr=SR, n_fft=2048)
    centroid = librosa.feature.spectral_centroid(y=y, sr=SR, hop_length=HOP)[0]
    flatness = librosa.feature.spectral_flatness(y=y, hop_length=HOP)[0]
    onsets = librosa.onset.onset_detect(onset_envelope=onset_env, sr=SR, hop_length=HOP, units="time")
    stems = stem_rms(stem_dir, duration)

    rows = []
    for start_s, stop_s in sections(y, chroma, beats, duration):
        start = librosa.time_to_frames(start_s, sr=SR, hop_length=HOP)
        stop = max(start + 1, librosa.time_to_frames(stop_s, sr=SR, hop_length=HOP))
        row = {
            "start": round(start_s, 1),
            "end": round(stop_s, 1),
            "rms_db": to_db(rms[start:stop].mean()),
            "centroid_hz": int(centroid[start:stop].mean()),
            "flatness": round(float(flatness[start:stop].mean()), 4),
            "onsets_per_s": round(float(((onsets >= start_s) & (onsets < stop_s)).sum()) / max(stop_s - start_s, 0.1), 2),
            "bands": band_share(stft, freqs, start, stop, None),
        }
        if stems:
            row["stems_db"] = {name: to_db(values[start:stop].mean()) for name, values in stems.items()}
        rows.append(row)

    # A 2 s energy curve: the pacing figure, compared directly between source and take.
    step = librosa.time_to_frames(2.0, sr=SR, hop_length=HOP)
    curve = [to_db(rms[i : i + step].mean()) for i in range(0, len(rms), step)]
    report = {
        "file": Path(path).name,
        "duration_s": round(duration, 2),
        "tempo": tempo,
        "key": key_facts(chroma),
        "chords": chord_guess(chroma, beats, beat_times, duration),
        "sections": rows,
        "energy_curve_2s_db": curve,
        "centroid_hz_mean": int(centroid.mean()),
        "rolloff_hz": int(np.median(librosa.feature.spectral_rolloff(y=y, sr=SR, hop_length=HOP, roll_percent=0.95)[0])),
        "onsets_per_s": round(len(onsets) / duration, 2),
        "bands": band_share(stft, freqs, 0, stft.shape[1], None),
    }
    if stems:
        report["stems_curve_4s_db"] = {
            name: [to_db(values[i : i + 2 * step].mean()) for i in range(0, len(values), 2 * step)]
            for name, values in stems.items()
        }
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("audio")
    parser.add_argument("out")
    parser.add_argument("--stems")
    args = parser.parse_args()
    report = analyze(args.audio, args.stems)
    Path(args.out).write_text(json.dumps(report, indent=1), encoding="utf-8")
    print(json.dumps({k: report[k] for k in ("duration_s", "tempo", "key")}, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
