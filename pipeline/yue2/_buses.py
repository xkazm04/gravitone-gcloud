"""_buses.py - the stem buses of post.py's `buses` stage (spark yue2-song-lab S2 WP-C).

Ported from yue2-lab's own post.py (stages vocal, drums, bass, sum; WP3 of yue2-lab measured them on
the round-1 takes: SongEval +0.035..+0.10). Each bus is RMS-matched back to its input stem, so a bus
changes the stem's shape, never its level in the re-sum:

  vocals  HPF 80 Hz -> zero-phase band-split de-esser 5-9 kHz (4:1 on the band's peaks) -> comp 3:1 at
          -18 dB, 5/80 ms -> presence +2 dB @ 3.5 kHz -> plate send 12 % (freeverb, room size
          calibrated to RT60 ~1.2 s, wet HPF 200 Hz) -> RMS matched.
  drums   comp 4:1 10/100 ms, threshold bisected for ~3 dB gain reduction -> 20 % parallel saturation
          (tanh, drive 8 dB, RMS-matched) -> RMS matched.
  bass    L+R summed below 120 Hz (zero-phase complementary split) -> gentle comp 2:1 30/200 ms, ~1.5 dB
          gain reduction -> RMS matched.
  sum     the processed vocals, drums and bass + the untouched `other` + the separation residual.

GAIN REDUCTION is energy-weighted (the RMS drop, dominated by the loud parts where a compressor acts).
yue2-lab's first measure, the mean over the loudest 25 % of frames, read +4.3 dB on a mostly silent
bass stem (~75 % of its frames are silence), so it is not used.

pedalboard is GPL-3.0 and lives only in the WSL eval venv, reached across the process boundary (see
README.md, Licences). CPU only.
"""
from __future__ import annotations

import numpy as np

from _post_dsp import STEMS, db, energy

VOCAL_COMP = {"threshold_db": -18.0, "ratio": 3.0, "attack_ms": 5.0, "release_ms": 80.0}
DRUM_COMP = {"ratio": 4.0, "attack_ms": 10.0, "release_ms": 100.0, "target_gr_db": 3.0}
BASS_COMP = {"ratio": 2.0, "attack_ms": 30.0, "release_ms": 200.0, "target_gr_db": 1.5}
BASS_MONO_HZ = 120.0
PLATE_SEND = 0.12
DRUM_PARALLEL = 0.20


def rms_db(x):
    return db(np.mean(np.asarray(x, dtype=np.float64) ** 2))


def rms_match(y, ref):
    ey, er = energy(y), energy(ref)
    if ey <= 1e-20 or er <= 1e-20:   # a silent stem stays as it is (no infinite gain either way)
        return np.asarray(y, dtype=np.float32), 0.0
    g = np.sqrt(er / ey)
    return (y * g).astype(np.float32), round(float(20 * np.log10(g)), 2)


def gain_reduction(x, y):
    """Energy-weighted gain reduction in dB: the RMS drop from x to y."""
    return float(rms_db(x) - rms_db(y))


def _pb(board, x, sr):
    return board(np.ascontiguousarray(x.T), sr).T.astype(np.float32)


def _frame_db(x, sr, ms=10):
    h = int(sr * ms / 1000)
    m = len(x) // h
    p = (x[: m * h].astype(np.float64) ** 2).mean(1).reshape(m, h).mean(1)
    return 10 * np.log10(p + 1e-20)


def comp_for_gr(x, sr, ratio, attack_ms, release_ms, target_gr_db):
    """Bisect the compressor threshold for ~target_gr_db of energy-weighted gain reduction."""
    from pedalboard import Compressor
    lo, hi = -70.0, 0.0
    y, thr, gr = x, 0.0, 0.0
    for _ in range(14):
        thr = (lo + hi) / 2
        y = _pb(Compressor(threshold_db=thr, ratio=ratio, attack_ms=attack_ms, release_ms=release_ms), x, sr)
        gr = gain_reduction(x, y)
        if gr > target_gr_db:
            lo = thr
        else:
            hi = thr
    return y, {"thresholdDb": round(thr, 2), "ratio": ratio, "attackMs": attack_ms, "releaseMs": release_ms, "grDb": round(gr, 2)}


def _rt60(ir, sr):
    e = np.cumsum((ir.astype(np.float64) ** 2)[::-1])[::-1]
    e = 10 * np.log10(e / e[0] + 1e-30)
    i5, i25 = np.argmax(e <= -5), np.argmax(e <= -25)
    return 3 * (i25 - i5) / sr if i25 > i5 else float("nan")


_RT_CACHE: dict = {}


def plate_room_size(sr, target_rt60=1.2, damping=0.3):
    """Freeverb has no RT60 knob: measure T20 (x3) of its impulse response and pick the closest room size."""
    if sr in _RT_CACHE:
        return _RT_CACHE[sr]
    from pedalboard import Reverb
    imp = np.zeros((int(sr * 6), 1), np.float32)
    imp[0] = 1
    best = None
    for rs in np.round(np.arange(0.05, 1.0, 0.025), 3):
        ir = _pb(Reverb(room_size=float(rs), damping=damping, wet_level=1.0, dry_level=0.0, width=1.0), imp, sr)[:, 0]
        t = _rt60(ir, sr)
        if best is None or abs(t - target_rt60) < abs(best[1] - target_rt60):
            best = (float(rs), float(t))
    _RT_CACHE[sr] = best
    return best


def vocal_bus(x, sr):
    from pedalboard import Compressor, HighpassFilter, PeakFilter, Reverb
    from scipy.signal import butter, sosfiltfilt
    y = _pb(HighpassFilter(cutoff_frequency_hz=80), x, sr)
    # de-esser: zero-phase 5-9 kHz band, rest = y - band (exact complement); compress only the band's peaks
    sos = butter(2, [5000, 9000], btype="bandpass", fs=sr, output="sos")
    band = sosfiltfilt(sos, y, axis=0).astype(np.float32)
    rest = y - band
    fdb = _frame_db(band, sr)
    thr = float(np.quantile(fdb[fdb > fdb.max() - 60], 0.90))
    band_c = _pb(Compressor(threshold_db=thr, ratio=4, attack_ms=1, release_ms=40), band, sr)
    deess_gr = gain_reduction(band, band_c)
    y = rest + band_c
    pre = y
    y = _pb(Compressor(**VOCAL_COMP), y, sr)
    comp_gr = gain_reduction(pre, y)
    y = _pb(PeakFilter(cutoff_frequency_hz=3500, gain_db=2.0, q=1.0), y, sr)
    rs, rt = plate_room_size(sr)
    wet = _pb(Reverb(room_size=rs, damping=0.3, wet_level=1.0, dry_level=0.0, width=1.0), y, sr)
    wet = _pb(HighpassFilter(cutoff_frequency_hz=200), wet, sr)   # keep the plate out of the low end
    wet, _ = rms_match(wet, y)
    y = y + PLATE_SEND * wet
    y, g = rms_match(y, x)
    return y, {"grDb": round(comp_gr, 2), "deessGrDb": round(deess_gr, 2), "deessThresholdDb": round(thr, 2),
               "plateRoomSize": rs, "plateRt60S": round(rt, 2), "outputGainDb": g}


def drum_bus(x, sr):
    from pedalboard import Distortion
    y, comp = comp_for_gr(x, sr, DRUM_COMP["ratio"], DRUM_COMP["attack_ms"], DRUM_COMP["release_ms"], DRUM_COMP["target_gr_db"])
    sat = _pb(Distortion(drive_db=8), y, sr)
    sat, _ = rms_match(sat, y)
    y = (1 - DRUM_PARALLEL) * y + DRUM_PARALLEL * sat
    y, g = rms_match(y, x)
    return y, {**comp, "parallelSaturation": DRUM_PARALLEL, "outputGainDb": g}


def bass_bus(x, sr):
    from scipy.signal import butter, sosfiltfilt
    sos = butter(2, BASS_MONO_HZ, btype="lowpass", fs=sr, output="sos")
    low = sosfiltfilt(sos, x, axis=0)            # zero-phase 2nd-order Butterworth, run forward and back
    high = x - low                               # exact complement: no phase smear at the crossover
    lowm = np.repeat(low.mean(1, keepdims=True), x.shape[1], 1)
    y = (high + lowm).astype(np.float32)
    y, comp = comp_for_gr(y, sr, BASS_COMP["ratio"], BASS_COMP["attack_ms"], BASS_COMP["release_ms"], BASS_COMP["target_gr_db"])
    y, g = rms_match(y, x)
    return y, {**comp, "monoBelowHz": BASS_MONO_HZ, "outputGainDb": g}


def buses(stems, x, sr):
    """Run the three buses over separated stems and re-sum. `stems` holds STEMS + "residual", summing back
    to x. Returns (the re-summed mix, report). The report's resumResidualDb is the energy of (untouched
    stems + residual - x) relative to x: how exactly the stems re-sum before any bus touches them."""
    parts = STEMS + ["residual"]
    resum = sum(stems[k] for k in parts)
    report = {"resumResidualDb": round(db(energy(resum - x) / max(energy(x), 1e-30)), 2)}
    out = dict(stems)
    for key, fn in (("vocals", vocal_bus), ("drums", drum_bus), ("bass", bass_bus)):
        out[key], report[key] = fn(stems[key], sr)
    y = sum(out[k] for k in parts).astype(np.float32)
    report["sumPeakDbfs"] = round(float(20 * np.log10(np.abs(y).max() + 1e-12)), 2)
    return y, report
