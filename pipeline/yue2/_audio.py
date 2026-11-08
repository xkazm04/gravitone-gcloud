"""Shared numpy/scipy audio measures of the yue2 scripts (score.py and post.py), moved verbatim from
kiro/yue2-lab score.py: raw stats, the look-ahead true-peak limiter, the exact -14 LUFS loudness match
(score cache version 2) and the VAE-frame buzz metric. Heavy modules are imported inside functions.
"""
from __future__ import annotations

from pathlib import Path

YUE2_VAE_HOP = 1920                               # m-a-p/YuE2-Vae config.json downsampling_ratio
YUE2_SR = 48000                                   # -> latent frame rate 25.0 Hz
TARGET_LUFS = -14.0
TP_CEILING_DBTP = -1.0    # true-peak ceiling of the analysis copy (limiter, see loudness_match)


def load_audio(path: Path):
    import soundfile as sf
    x, sr = sf.read(str(path), dtype="float32", always_2d=True)   # [T, C]
    return x, sr


def raw_stats(x, sr):
    import numpy as np
    import pyloudnorm as pyln
    from scipy.signal import resample_poly, welch
    meter = pyln.Meter(sr)
    lufs = float(meter.integrated_loudness(x.astype(np.float64)))
    tp = 0.0
    for c in range(x.shape[1]):
        tp = max(tp, float(np.max(np.abs(resample_poly(x[:, c], 4, 1)))))
    peak = float(np.max(np.abs(x)))
    rms = float(np.sqrt(np.mean(x.astype(np.float64) ** 2)))
    mono = x.mean(axis=1)
    f, pxx = welch(mono, fs=sr, nperseg=8192)
    cum = np.cumsum(pxx)
    total = cum[-1]
    roll99 = float(f[np.searchsorted(cum, 0.99 * total)])
    hf16 = float(pxx[f >= 16000].sum() / total)
    ref = pxx[(f >= 1000) & (f < 4000)].mean()
    bands = {}
    for lo in range(10000, int(sr / 2), 2000):
        sel = (f >= lo) & (f < lo + 2000)
        if sel.any():
            bands[f"{lo // 1000}-{(lo + 2000) // 1000}k"] = round(float(10 * np.log10(pxx[sel].mean() / ref + 1e-30)), 1)
    return {
        "sr": sr, "channels": int(x.shape[1]), "duration_s": round(len(x) / sr, 2),
        "lufs_i": round(lufs, 2), "true_peak_dbtp": round(20 * np.log10(tp + 1e-12), 2),
        "sample_peak_dbfs": round(20 * np.log10(peak + 1e-12), 2),
        "crest_db": round(20 * np.log10(peak / (rms + 1e-12) + 1e-12), 2),
        "clipped_samples": int(np.sum(np.abs(x) >= 0.999)),
        "rolloff99_hz": round(roll99, 0), "energy_above_16k": round(hf16, 6),
        "band_db_rel_1_4k": bands,
    }


def true_peak_limit(x, sr, ceiling_dbtp=TP_CEILING_DBTP, lookahead_ms=5.0, os=4):
    """Look-ahead true-peak limiter (numpy/scipy; pedalboard needs libatomic which WSL lacks without sudo).
    Gain curve = box-average (width L) of a min-filter (radius L) of the instantaneous gain, so every smoothed
    sample is <= the instantaneous gain it covers: no overshoot by construction (at the 4x-oversampled envelope)."""
    import numpy as np
    from scipy.signal import resample_poly
    from scipy.ndimage import minimum_filter1d, uniform_filter1d
    xx = x if x.ndim == 2 else x[:, None]
    up = resample_poly(xx, os, 1, axis=0)
    env = np.abs(up).max(axis=1)
    n = xx.shape[0]
    env = np.pad(env, (0, max(0, n * os - env.size)))[: n * os].reshape(n, os).max(axis=1)
    ceil = 10 ** (ceiling_dbtp / 20)
    g = np.minimum(1.0, ceil / np.maximum(env, 1e-12))
    L = max(1, int(sr * lookahead_ms / 1000))
    g = uniform_filter1d(minimum_filter1d(g, size=2 * L + 1), size=L)
    y = xx * g[:, None]
    return (y if x.ndim == 2 else y[:, 0]), float(20 * np.log10(g.min() + 1e-12))


def loudness_match(x, sr, input_lufs):
    """-14 LUFS integrated, EXACTLY: gain to target, then the look-ahead true-peak limiter at TP_CEILING_DBTP;
    the make-up gain is repeated a few times because limiting lowers loudness slightly.
    Returns (float32 audio, info). (v1 pulled the whole gain down instead, leaving hot clips under -14 LUFS.)"""
    import numpy as np
    import pyloudnorm as pyln
    from scipy.signal import resample_poly
    meter = pyln.Meter(sr)
    gain_db = TARGET_LUFS - input_lufs
    total_gain = gain_db
    y, max_gr, lufs = x, 0.0, input_lufs
    for _ in range(4):
        y, gr = true_peak_limit(x * 10 ** (total_gain / 20), sr)
        max_gr = gr
        lufs = float(meter.integrated_loudness(np.asarray(y, dtype=np.float64)))
        if abs(lufs - TARGET_LUFS) < 0.05:
            break
        total_gain += TARGET_LUFS - lufs
    y = np.asarray(y, dtype=np.float32)
    tp = float(np.abs(resample_poly(y if y.ndim == 2 else y[:, None], 4, 1, axis=0)).max())
    return y, {"gain_db": round(gain_db, 2), "makeup_gain_db": round(total_gain, 2),
               "limiter_max_gr_db": round(max_gr, 2), "lufs_i": round(lufs, 2),
               "sample_peak_dbfs": round(float(20 * np.log10(np.abs(y).max() + 1e-12)), 2),
               "true_peak_dbtp": round(float(20 * np.log10(tp + 1e-12)), 2)}


def make_norm_copy(x, sr, raw, out_path: Path):
    """The -14 LUFS analysis copy (float32 WAV) every model scores: loudness_match, written to out_path."""
    import soundfile as sf
    y, info = loudness_match(x, sr, raw["lufs_i"])
    sf.write(str(out_path), y, sr, subtype="FLOAT")
    info["path"] = str(out_path)
    return info


def loudness_of(x, sr):
    """(integrated LUFS, true peak dBTP at 4x) of a [T, C] float array."""
    import numpy as np
    import pyloudnorm as pyln
    from scipy.signal import resample_poly
    lufs = float(pyln.Meter(sr).integrated_loudness(np.asarray(x, dtype=np.float64)))
    tp = float(np.abs(resample_poly(x if x.ndim == 2 else x[:, None], 4, 1, axis=0)).max())
    return round(lufs, 2), round(float(20 * np.log10(tp + 1e-12)), 2)


def buzz_metric(x, sr, f0=None, n_fft=512, hop=64, band=(4000, 12000)):
    """Periodicity of the 4-12 kHz STFT band-energy envelope at the YuE2 VAE frame rate."""
    import numpy as np
    from numpy.lib.stride_tricks import sliding_window_view
    from scipy.ndimage import uniform_filter1d
    f0 = f0 or YUE2_SR / YUE2_VAE_HOP   # 25.0 Hz: one latent frame = 1920 samples @ 48 kHz = 40 ms
    mono = x.mean(axis=1) if x.ndim == 2 else x
    win = np.hanning(n_fft).astype(np.float32)
    freqs = np.fft.rfftfreq(n_fft, 1 / sr)
    sel = (freqs >= band[0]) & (freqs < band[1])
    n_frames = 1 + (len(mono) - n_fft) // hop
    env = np.empty(n_frames, dtype=np.float64)
    frames_all = sliding_window_view(mono, n_fft)[::hop]
    for s in range(0, n_frames, 8192):
        fr = frames_all[s:s + 8192] * win
        env[s:s + len(fr)] = (np.abs(np.fft.rfft(fr, axis=1)[:, sel]) ** 2).sum(axis=1)
    fs_env = sr / hop
    e = np.log10(env + 1e-12)
    e = e - uniform_filter1d(e, size=int(0.25 * fs_env) | 1)       # remove slow (<~4 Hz) dynamics
    e = e * np.hanning(len(e))
    nfft = 1 << int(np.ceil(np.log2(len(e) * 2)))
    mag = np.abs(np.fft.rfft(e, nfft))
    fq = np.fft.rfftfreq(nfft, 1 / fs_env)

    def strength(fc):
        pk = mag[(fq >= fc - 0.15) & (fq <= fc + 0.15)].max()
        nb = mag[((fq >= fc - 3) & (fq <= fc - 0.5)) | ((fq >= fc + 0.5) & (fq <= fc + 3))]
        return float(20 * np.log10(pk / (np.median(nb) + 1e-12)))

    harm = {f"{k * f0:g}Hz": round(strength(k * f0), 2) for k in range(1, 7) if k * f0 < fs_env / 2 - 4}
    # Beat grid from the envelope itself: strongest periodicity in 1-8 Hz (e.g. 3.0 Hz = 8th notes at 90 BPM).
    # Half of it is used as the grid step (covers swing/half-time). Music puts energy on every multiple.
    lo8 = (fq >= 1.0) & (fq <= 8.0)
    grid = float(fq[lo8][np.argmax(mag[lo8])]) / 2
    off_grid = lambda f: np.abs(f - np.round(f / grid) * grid)  # noqa: E731
    confounded = [h for h in harm if off_grid(float(h[:-2])) < 0.25]
    # Null distribution: same statistic at up to 240 frequencies in 15-180 Hz that are >=1 Hz from any multiple
    # of f0 AND as far from the beat grid as the clean harmonics are (>=0.25 Hz), so the comparison is fair.
    rng = np.random.default_rng(0)
    cand = rng.uniform(15, min(180, fs_env / 2 - 4), 20000)
    cand = cand[(np.abs(cand - np.round(cand / f0) * f0) >= 1.0) & (off_grid(cand) >= 0.25)][:240]
    null = np.array([strength(c) for c in cand])
    clean = [v for h, v in harm.items() if h not in confounded]
    pct = lambda v: round(float((null < v).mean() * 100), 1)  # noqa: E731
    # top periodicities 2..fs/2 by local prominence
    lo_i, hi_i = np.searchsorted(fq, 2.0), np.searchsorted(fq, fs_env / 2 - 4)
    med = uniform_filter1d(mag, size=max(3, int(4 / (fq[1] - fq[0]))))
    prom = 20 * np.log10(mag / (med + 1e-12) + 1e-12)
    idx = np.argsort(prom[lo_i:hi_i])[::-1] + lo_i
    tops = []
    for i in idx:
        if all(abs(fq[i] - t[0]) > 0.5 for t in tops):
            tops.append((round(float(fq[i]), 2), round(float(prom[i]), 1)))
        if len(tops) == 5:
            break
    return {"vae_frame_rate_hz": f0, "band_hz": list(band), "env_rate_hz": fs_env, "beat_grid_hz": round(grid, 3),
            "buzz_db": harm.get(f"{f0:g}Hz"), "buzz_pctl": pct(harm.get(f"{f0:g}Hz")),
            "harmonics_db": harm, "harmonics_pctl": {h: pct(v) for h, v in harm.items()},
            "beat_confounded": confounded,
            "clean_harm_mean_db": round(float(np.mean(clean)), 2) if clean else None,
            "null_median_db": round(float(np.median(null)), 2), "null_p95_db": round(float(np.percentile(null, 95)), 2),
            "buzz_index_db": round(float(np.mean(clean) - np.median(null)), 2) if clean else None,
            "top_periodicities_hz_db": tops}
