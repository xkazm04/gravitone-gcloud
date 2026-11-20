"""The `tone` master chain (spark master-experiments): recipe tone-1, the owner's default remaster.

Picked 2026-11-17 from five techniques tried on one song (docs/concepts/distribution/mastering-research.md).
It replaced uni-1/2/3, which the owner heard as degrading on another device; the stage-by-stage bisect showed why:
minimum-phase filters rotate the phase of a bass-heavy song's whole bass region (a 30 Hz high-pass: 11-37 degrees
up to 250 Hz, +1.2 dB peak), and compressors move the level with the music (1-2 dB). So this chain has NO
minimum-phase filter, NO compressor and NO limiter:

  1. measure the song's long-term 1/3-octave spectral SHAPE (level removed);
  2. a correction toward a target curve (targets/<name>.json): `strength` of the distance, clamped to
     -`maxCutDb` / +`maxBoostDb`, nothing below `floorHz`, tapering to nothing by `ceilHz` (the codec band of a
     generated song is left alone), smoothed over 1/3 octave;
  3. applied as a LINEAR-PHASE FIR (symmetric, `taps` long, the same filter on every channel), so no frequency is
     delayed against another and the stereo image cannot move;
  4. ONE static gain to the target loudness, stopped at the true-peak ceiling if it would be passed (the song is
     then reported quieter than the target, never limited).

The target is a taste reference, not a standard: it is the average shape of the album being released, so a
song is nudged toward its siblings and never toward anything it is not.
"""

import json
import os

import numpy as np

import loudness

CENTRES = 25.0 * 2 ** (np.arange(0, 28) / 3.0)  # 1/3 octave, 25 Hz .. ~16 kHz
_TARGETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "targets")


def target_shape(name):
    """The target curve's 1/3-octave shape (dB, level removed), checked against this module's band centres."""
    with open(os.path.join(_TARGETS, f"{name}.json"), encoding="utf-8") as f:
        doc = json.load(f)
    c = np.array(doc["centresHz"], dtype=np.float64)
    if c.shape != CENTRES.shape or not np.allclose(c, CENTRES, rtol=1e-3):
        raise ValueError(f"target {name!r} was measured on other band centres than this chain uses")
    return np.array(doc["meanDb"], dtype=np.float64)


def third_octave_shape(x, rate):
    """A song's long-term spectrum in 1/3-octave bands (dB), the 200 Hz-5 kHz mean removed."""
    from scipy.signal import welch

    f, p = welch(x, fs=rate, nperseg=16384, axis=0)
    p = p.mean(axis=1)
    out = []
    for c in CENTRES:
        sel = (f >= c / 2 ** (1 / 6)) & (f < c * 2 ** (1 / 6))
        out.append(10 * np.log10(p[sel].mean() + 1e-20) if sel.any() else -200.0)
    out = np.array(out)
    return out - out[(CENTRES >= 200) & (CENTRES <= 5000)].mean()


def correction_db(shape, target, row):
    """Per band: `strength` of the way to the target, clamped, floored, tapered (nothing above `ceilHz`)."""
    corr = np.clip(-row["strength"] * (shape - target), -row["maxCutDb"], row["maxBoostDb"])
    corr[CENTRES < row["floorHz"]] = 0.0
    corr *= np.clip((row["ceilHz"] - CENTRES) / row["taperHz"], 0.0, 1.0)
    return corr


def design_fir(corr, rate, taps):
    """A symmetric (linear-phase) FIR for the per-band correction, smoothed over 1/3 octave."""
    from scipy.signal import firwin2

    fgrid = np.geomspace(20.0, rate / 2 * 0.999, 2048)
    cdb = np.interp(np.log(fgrid), np.log(CENTRES), corr, left=0.0, right=0.0)
    k = np.exp(-0.5 * (np.log2(fgrid)[:, None] - np.log2(fgrid)[None, :]) ** 2 / (1 / 3.0) ** 2)
    cdb = (k @ cdb) / k.sum(axis=1)
    freq = np.concatenate([[0.0], fgrid / (rate / 2), [1.0]])
    gain = np.concatenate([[1.0], 10 ** (cdb / 20), [10 ** (cdb[-1] / 20)]])
    return firwin2(taps, freq, gain, window="hann")


def apply(x, rate, row):
    """Steps 1-4. x (frames, channels); returns (float64 master, correction dB per band, static gain dB, ceiling-stopped)."""
    from scipy.signal import fftconvolve

    x = x.astype(np.float64)
    corr = correction_db(third_octave_shape(x, rate), target_shape(row["target"]), row)
    h = design_fir(corr, rate, row["taps"])
    y = np.stack([fftconvolve(x[:, c], h, mode="same") for c in range(x.shape[1])], axis=1)
    start = loudness.integrated_lufs(y, rate)
    if start is None:
        raise ValueError("the source has no measurable loudness (silent, or shorter than 400 ms); nothing to master")
    g_db = row["targetLufs"] - start
    stopped = False
    tp = loudness.true_peak_db(y, rate)
    if tp is not None and tp + g_db > row["ceilingDbtp"]:
        g_db = row["ceilingDbtp"] - tp
        stopped = True
    if not np.all(np.isfinite(y)):
        raise ValueError("the master chain produced non-finite samples")
    return y * 10 ** (g_db / 20), corr, g_db, stopped
