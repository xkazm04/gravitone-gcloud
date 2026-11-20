"""Objective 'did it do harm' measures for the master experiments (spark master-experiments).

Every measure compares a candidate with the ORIGINAL after matching integrated loudness, so a louder file is
not read as a different one. Nothing here judges taste; it says how far, and in what way, a file moved.

  wobble_db   std over time of the 100 ms RMS level difference (candidate - original, dB). A pure gain
              change is 0; a compressor or limiter that moves with the music is not. This is the number
              that stands for 'pumping' / 'unstable'.
  null_db     residual energy (candidate level-matched minus original) re the original, dB. Lower is closer.
              EQ-only changes read here too, so it is read together with wobble_db.
  hf_db       change in 12-22 kHz energy, dB (what an exciter or bandwidth extender adds).
  band_db     level change per band at matched loudness (low / low-mid / mid / presence / air).
  width       mean side/mid energy ratio change, dB.
  corr_*      per-second L/R correlation mean and its std (image stability).
  tp_*        true peak of the file and of its MP3 128k and AAC 128k round trips (ffmpeg), dBTP.
  lra         EBU R128 loudness range.
"""

import os
import subprocess
import tempfile

import numpy as np
import pyloudnorm as pyln
import soundfile as sf
from scipy.signal import butter, resample_poly, sosfilt

BANDS = {"low 20-150": (20, 150), "lowmid 150-500": (150, 500), "mid 0.5-2.5k": (500, 2500), "pres 2.5-8k": (2500, 8000), "air 8-20k": (8000, 20000)}


def load(path):
    x, r = sf.read(path, dtype="float64", always_2d=True)
    return x, r


def lufs(x, r):
    return pyln.Meter(r).integrated_loudness(x)


def true_peak_db(x, r):
    up = resample_poly(x, 4, 1, axis=0)
    return 20 * np.log10(np.max(np.abs(up)) + 1e-12)


def lra(x, r):
    try:
        return float(pyln.Meter(r).loudness_range(x))
    except Exception:
        return float("nan")


def _band(x, r, lo, hi):
    sos = butter(4, [lo, min(hi, r / 2 - 200)], btype="band", fs=r, output="sos")
    return sosfilt(sos, x, axis=0)


def _rms_db(x):
    return 10 * np.log10(np.mean(np.square(x)) + 1e-20)


def _roundtrip_tp(path, codec):
    """True peak of the file after an ffmpeg lossy round trip (the clipping a streaming service's encode causes)."""
    with tempfile.TemporaryDirectory() as d:
        enc = os.path.join(d, "e." + ("mp3" if codec == "mp3" else "m4a"))
        dec = os.path.join(d, "d.wav")
        args = ["-c:a", "libmp3lame", "-b:a", "128k"] if codec == "mp3" else ["-c:a", "aac", "-b:a", "128k"]
        for cmd in (["ffmpeg", "-loglevel", "error", "-y", "-i", path, *args, enc], ["ffmpeg", "-loglevel", "error", "-y", "-i", enc, "-c:a", "pcm_f32le", dec]):
            if subprocess.run(cmd, capture_output=True).returncode != 0:
                return float("nan")
        x, r = sf.read(dec, dtype="float64", always_2d=True)
        return true_peak_db(x, r)


def compare(orig_path, cand_path, roundtrip=True):
    o, ro = load(orig_path)
    x, r = load(cand_path)
    n = min(o.shape[0], x.shape[0])
    o, x = o[:n], x[:n]
    lo, lx = lufs(o, ro), lufs(x, r)
    xm = x * 10 ** ((lo - lx) / 20)
    win = ro // 10
    k = n // win
    ro_ = np.sqrt(np.mean(np.square(o[: k * win]).reshape(k, win, -1), axis=(1, 2)))
    rx_ = np.sqrt(np.mean(np.square(xm[: k * win]).reshape(k, win, -1), axis=(1, 2)))
    live = ro_ > 10 ** (-60 / 20)
    diff = 20 * np.log10((rx_[live] + 1e-9) / (ro_[live] + 1e-9))
    res = xm - o
    mo, so = (o[:, 0] + o[:, 1]) / 2, (o[:, 0] - o[:, 1]) / 2
    mx, sx = (xm[:, 0] + xm[:, 1]) / 2, (xm[:, 0] - xm[:, 1]) / 2

    def corr(a):
        m = a.shape[0] // ro
        return np.array([np.corrcoef(a[i * ro:(i + 1) * ro, 0], a[i * ro:(i + 1) * ro, 1])[0, 1] for i in range(m)])

    co, cx = corr(o), corr(xm)
    out = {
        "lufs": round(lx, 2),
        "tp": round(true_peak_db(x, r), 2),
        "lra": round(lra(x, r), 1),
        "wobble_db": round(float(np.std(diff)), 3),
        "null_db": round(float(_rms_db(res) - _rms_db(o)), 1),
        "hf_db": round(float(_rms_db(_band(xm, r, 12000, 22000)) - _rms_db(_band(o, ro, 12000, 22000))), 2),
        "width_db": round(float((_rms_db(sx) - _rms_db(mx)) - (_rms_db(so) - _rms_db(mo))), 2),
        "corr_mean": round(float(cx.mean()), 3),
        "corr_std": round(float(cx.std()), 3),
        "bands": {name: round(float(_rms_db(_band(xm, r, a, b)) - _rms_db(_band(o, ro, a, b))), 2) for name, (a, b) in BANDS.items()},
        "gain_db": round(lx - lo, 2),
    }
    if roundtrip:
        out["tp_mp3"] = round(_roundtrip_tp(cand_path, "mp3"), 2)
        out["tp_aac"] = round(_roundtrip_tp(cand_path, "aac"), 2)
    return out


if __name__ == "__main__":
    import json
    import sys

    for p in sys.argv[2:]:
        print(os.path.basename(p), json.dumps(compare(sys.argv[1], p), indent=1))
