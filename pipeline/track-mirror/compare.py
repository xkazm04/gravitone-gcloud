"""One take against the reference: the figures the page shows beside each listen.

    python -I pipeline/track-mirror/compare.py <reference.json> <take audio> <take.json> [--audio-ref <reference audio>]

Every figure says how far a take sits from the reference, and none says it is good. Ears decide; these
keep the ear honest on what ears are bad at (registry: brief-conformance-listen, "properties the brief
committed to numbers are measured"), and rank the three seeds of a prompt so the page leads with one.

Pacing is judged over the source's own length. A longer take is compared on its opening stretch, and
its full length is reported separately, because neither generator is told how long to run.
"""

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

import librosa
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from analyze import HOP, NOTES, SR, analyze  # noqa: E402


def key_pitch(name):
    root, mode = name.split()
    return NOTES.index(root), mode


def key_gap(a, b):
    """Semitones on the circle, with a same-notes relative key counted as near, not as a miss."""
    if not a or not b:
        return None
    (ra, ma), (rb, mb) = key_pitch(a), key_pitch(b)
    if ma != mb and (ra + (3 if ma == "minor" else -3)) % 12 == rb:
        return 0.5
    gap = abs(ra - rb) % 12
    return float(min(gap, 12 - gap))


def tempo_gap_pct(reference, take):
    """Smallest gap across the octave, since a half-time read of the same grid is the same pace."""
    return round(min(abs(take * f - reference) / reference * 100 for f in (0.5, 1.0, 2.0)), 1)


def curve_figures(ref_curve, take_curve):
    n = min(len(ref_curve), len(take_curve))
    a, b = np.array(ref_curve[:n]), np.array(take_curve[:n])
    b_level = b - (b.mean() - a.mean())
    corr = float(np.corrcoef(a, b)[0, 1]) if a.std() > 0 and b.std() > 0 else 0.0
    return round(corr, 3), round(float(np.sqrt(np.mean((a - b_level) ** 2))), 2)


def entry_time(path, seconds):
    """When the band arrives: the first sustained jump of low-end energy, in the compared stretch."""
    y, _ = librosa.load(str(path), sr=SR, mono=True, duration=seconds)
    power = np.abs(librosa.stft(y, n_fft=2048, hop_length=HOP)) ** 2
    freqs = librosa.fft_frequencies(sr=SR, n_fft=2048)
    low = power[(freqs >= 20) & (freqs < 150)].sum(axis=0)
    step = max(1, librosa.time_to_frames(1.0, sr=SR, hop_length=HOP))
    blocks = np.array([low[i : i + step].mean() for i in range(0, len(low), step)])
    db = 10 * np.log10(np.maximum(blocks, 1e-9))
    if len(db) < 6:
        return None
    floor, ceiling = np.percentile(db, 10), np.percentile(db, 90)
    if ceiling - floor < 6:
        return None  # no step at all: the band is there from the start, or never arrives
    middle = (floor + ceiling) / 2
    for i in range(len(db) - 3):
        if (db[i : i + 3] > middle).all():
            return float(i)
    return None


def texture(path, seconds):
    y, _ = librosa.load(str(path), sr=SR, mono=True, duration=seconds)
    mfcc = librosa.feature.mfcc(y=y, sr=SR, hop_length=HOP, n_mfcc=20)[1:]
    return mfcc.mean(axis=1), np.cov(mfcc)


def timbre_gap(ref_path, take_path, seconds):
    """Symmetrised KL between MFCC Gaussians, per dimension: the classic 'same palette?' distance."""
    ma, ca = texture(ref_path, seconds)
    mb, cb = texture(take_path, seconds)
    ia, ib = np.linalg.pinv(ca), np.linalg.pinv(cb)
    delta = ma - mb
    value = np.trace(ia @ cb) + np.trace(ib @ ca) + delta @ (ia + ib) @ delta - 2 * len(ma)
    return round(float(value) / (2 * len(ma)), 2)


def chord_hits(ref_bars, take_bars):
    """Share of the reference's bars whose chord the take also plays then, at any transposition-free read."""
    n = min(len(ref_bars), len(take_bars))
    if not n:
        return 0.0
    return round(sum(ref_bars[i]["chord"] == take_bars[i]["chord"] for i in range(n)) / n, 2)


def band_gap(a, b):
    return round(sum(abs(a[k] - b[k]) for k in a) / 2, 3)


def score(figures):
    """A rank for picking among one prompt's seeds, weighted to the brief: pacing, palette, then notes."""
    tempo = min(figures["tempo_gap_pct"] / 8, 1)
    length = min(abs(figures["duration_s"] - figures["reference_duration_s"]) / figures["reference_duration_s"], 1)
    arc = 1 - max(figures["energy_corr"], 0)
    entry = 1.0 if figures["entry_s"] is None else min(abs(figures["entry_s"] - figures["reference_entry_s"]) / 20, 1)
    palette = min(figures["timbre_gap"] / 12, 1)
    bands = min(figures["band_gap"] / 0.4, 1)
    notes = 1 - figures["chord_hits"]
    key = min((figures["key_gap"] if figures["key_gap"] is not None else 6) / 6, 1)
    distance = 0.15 * tempo + 0.05 * length + 0.2 * arc + 0.1 * entry + 0.2 * palette + 0.1 * bands + 0.15 * notes + 0.05 * key
    return round(100 * (1 - distance), 1)


def lufs(path):
    """Integrated loudness, so the page can level-match: the louder of two takes reads as the better."""
    done = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-map", "0:a", "-af", "ebur128=framelog=quiet", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    found = re.findall(r"I:\s+(-?[\d.]+) LUFS", done.stderr)
    return float(found[-1]) if found else None


def compare(reference, ref_audio, take_audio):
    seconds = reference["duration_s"]
    measured = analyze(take_audio)
    ref_entry = entry_time(ref_audio, seconds)
    figures = {
        "lufs": lufs(take_audio),
        "reference_lufs": lufs(ref_audio),
        "bands": measured["bands"],
        "duration_s": measured["duration_s"],
        "reference_duration_s": seconds,
        "bpm": measured["tempo"]["bpm"],
        "tempo_gap_pct": tempo_gap_pct(reference["tempo"]["bpm"], measured["tempo"]["bpm"]),
        "key": measured["key"]["key"],
        "key_gap": key_gap(reference["key"]["key"], measured["key"]["key"]),
        "chord_top": [chord for chord, _ in measured["chords"]["top"][:4]],
        "chord_hits": chord_hits(reference["chords"]["bars"], measured["chords"]["bars"]),
        "entry_s": entry_time(take_audio, seconds),
        "reference_entry_s": ref_entry,
        "timbre_gap": timbre_gap(ref_audio, take_audio, seconds),
        "band_gap": band_gap(reference["bands"], measured["bands"]),
        "energy_curve_2s_db": measured["energy_curve_2s_db"],
    }
    figures["energy_corr"], figures["energy_rmse_db"] = curve_figures(
        reference["energy_curve_2s_db"], measured["energy_curve_2s_db"]
    )
    figures["closeness"] = score(figures)
    return figures


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("reference")
    parser.add_argument("take")
    parser.add_argument("out")
    parser.add_argument("--audio-ref", required=True)
    args = parser.parse_args()
    reference = json.loads(Path(args.reference).read_text(encoding="utf-8"))
    figures = compare(reference, args.audio_ref, args.take)
    Path(args.out).write_text(json.dumps(figures, indent=1), encoding="utf-8")
    print(json.dumps({k: v for k, v in figures.items() if k != "energy_curve_2s_db"}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
