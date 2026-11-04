"""The post-chain DSP of post.py (moved from kiro/yue2-lab post.py, WP3 experiments 4, 6, 7):
stem separation (with its pre-scaling and the 44.1 kHz separator rate resampled back to the input rate),
the unbiased (`smooth`) Ruach debuzz, Matchering to a reference, the -14 LUFS / -1 dBTP limiter, and the
first-vocal-onset finder of the A/B window.
"""
from __future__ import annotations

import hashlib
import json
import shutil
import time
from pathlib import Path

import numpy as np
import soundfile as sf

from _audio import YUE2_SR, YUE2_VAE_HOP, buzz_metric, loudness_match
from _contract import LAB, SEP_MODEL_DIR, GpuSampler, Refused, free_gpu

POST_CACHE = LAB / ".post-cache"
SEP_MODEL = "vocals_mel_band_roformer.ckpt"   # the same checkpoint as score.py's vocal stem
DEMUCS_MODEL = "htdemucs_6s.yaml"
SEP_SR = 44100            # native rate of both separators; stems are resampled back to the input rate
SEP_PRESCALE_PEAK = 0.25  # audio-separator peak-normalises input/outputs above 0.9: stay below it, undo after
STEMS = ["vocals", "drums", "bass", "other"]


def db(p):
    return float(10 * np.log10(p + 1e-30))


def energy(x):
    return float(np.sum(np.asarray(x, dtype=np.float64) ** 2))


def resample(x, sr_in, sr_out, n_out):
    """Polyphase resample (linear phase, delay compensated by scipy), then trim/pad to n_out samples."""
    from math import gcd
    from scipy.signal import resample_poly
    if sr_in != sr_out:
        g = gcd(sr_in, sr_out)
        x = resample_poly(x, sr_out // g, sr_in // g, axis=0)
    if len(x) < n_out:
        x = np.pad(x, ((0, n_out - len(x)), (0, 0)))
    return x[:n_out].astype(np.float32)


# ---------------------------------------------------------------- separation
def _run_sep(model, in_wav, out_dir, names):
    """Separate in_wav with one model; returns {stem_lower: path}. Model freed afterwards."""
    from audio_separator.separator import Separator
    SEP_MODEL_DIR.mkdir(parents=True, exist_ok=True)
    s = Separator(model_file_dir=str(SEP_MODEL_DIR), output_dir=str(out_dir), output_format="WAV",
                  use_soundfile=True, sample_rate=SEP_SR, log_level=30)
    s.load_model(model_filename=model)
    outs = s.separate(str(in_wav))
    del s
    free_gpu()
    res = {}
    for o in outs:
        p = Path(o)
        if not p.is_absolute():
            p = out_dir / p
        stem = p.stem.split("_(")[-1].rstrip(")").split(")")[0].lower() if "_(" in p.stem else p.stem.lower()
        res[stem] = p
    missing = [n for n in names if n not in res]
    if missing:
        raise RuntimeError(f"{model}: missing stems {missing}; got {list(res)}")
    return res


def _cache_dir(inp: Path, models: str) -> Path:
    st = inp.stat()
    key = hashlib.sha1(f"{inp.resolve()}|{st.st_size}|{st.st_mtime_ns}|{models}".encode()).hexdigest()[:12]
    return POST_CACHE / f"{inp.stem}_{key}"


def separate(inp: Path, x, sr):
    """RoFormer vocals + instrumental, then htdemucs_6s on the instrumental -> drums / bass / other (= guitar +
    piano + other + demucs' vocal residue). Cached per input. Returns (stems incl. residual, meta, cache dir);
    the stems plus the residual sum back to the input exactly."""
    d = _cache_dir(inp, f"{SEP_MODEL}|{DEMUCS_MODEL}")
    meta_p = d / "sep.json"
    if meta_p.exists() and all((d / f"{s}.wav").exists() for s in STEMS + ["instrumental", "residual"]):
        meta = json.loads(meta_p.read_text())
        meta["cached"] = True
        stems = {s: sf.read(str(d / f"{s}.wav"), dtype="float32", always_2d=True)[0] for s in STEMS + ["residual"]}
        return stems, meta, d
    d.mkdir(parents=True, exist_ok=True)
    tmp = d / "_tmp"
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir()
    t0 = time.time()
    pre = SEP_PRESCALE_PEAK / max(float(np.abs(x).max()), 1e-9)
    in_wav = tmp / "mix.wav"
    sf.write(str(in_wav), x * pre, sr, subtype="FLOAT")      # FLOAT in -> FLOAT out (separator copies subtype)
    with GpuSampler() as gs:
        r1 = _run_sep(SEP_MODEL, in_wav, tmp / "rof", ["vocals", "other"])
        r1["instrumental"] = r1.pop("other")    # Kim's vocals RoFormer names its complement "Other"
        r2 = _run_sep(DEMUCS_MODEL, r1["instrumental"], tmp / "dmx", ["drums", "bass", "guitar", "piano", "other", "vocals"])

    def ld(p):
        y, s_ = sf.read(str(p), dtype="float32", always_2d=True)
        return resample(y, s_, sr, len(x)) / pre

    voc, inst = ld(r1["vocals"]), ld(r1["instrumental"])
    dm = {k: ld(v) for k, v in r2.items()}
    other = dm["guitar"] + dm["piano"] + dm["other"] + dm["vocals"]
    stems = {"vocals": voc, "drums": dm["drums"], "bass": dm["bass"], "other": other}
    resid = (x - sum(stems.values())).astype(np.float32)
    stems["residual"] = resid
    ex = energy(x)
    meta = {
        "models": {"vocals": SEP_MODEL, "split": DEMUCS_MODEL}, "sep_sr": SEP_SR, "prescale": round(pre, 4),
        "residual_db": {
            "vocals+instrumental_vs_mix": round(db(energy(voc + inst - x) / ex), 2),
            "drums+bass+other_vs_instrumental": round(db(energy(dm["drums"] + dm["bass"] + other - inst) / energy(inst)), 2),
            "all_stems_vs_mix": round(db(energy(resid) / ex), 2),
        },
        "stem_energy_db_rel_mix": {k: round(db(energy(v) / ex), 2) for k, v in stems.items()},
        "timing_s": round(time.time() - t0, 1), "device_peak_used_mib": gs.peak,
    }
    for k, v in stems.items():
        sf.write(str(d / f"{k}.wav"), v, sr, subtype="FLOAT")
    sf.write(str(d / "instrumental.wav"), inst, sr, subtype="FLOAT")
    meta_p.write_text(json.dumps(meta, indent=1))
    shutil.rmtree(tmp, ignore_errors=True)
    meta["cached"] = False
    return stems, meta, d


def vocal_stem(inp: Path, x, sr):
    """The RoFormer vocal stem alone at the input rate (reuses a full separation's cache when there is one)."""
    full = _cache_dir(inp, f"{SEP_MODEL}|{DEMUCS_MODEL}") / "vocals.wav"
    if full.exists():
        return sf.read(str(full), dtype="float32", always_2d=True)[0]
    d = _cache_dir(inp, SEP_MODEL)
    out = d / "vocals.wav"
    if out.exists():
        return sf.read(str(out), dtype="float32", always_2d=True)[0]
    d.mkdir(parents=True, exist_ok=True)
    tmp = d / "_tmp"
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir()
    pre = SEP_PRESCALE_PEAK / max(float(np.abs(x).max()), 1e-9)
    sf.write(str(tmp / "mix.wav"), x * pre, sr, subtype="FLOAT")
    r = _run_sep(SEP_MODEL, tmp / "mix.wav", tmp / "rof", ["vocals"])
    y, s_ = sf.read(str(r["vocals"]), dtype="float32", always_2d=True)
    voc = resample(y, s_, sr, len(x)) / pre
    sf.write(str(out), voc, sr, subtype="FLOAT")
    shutil.rmtree(tmp, ignore_errors=True)
    return voc


def vocal_onset(voc, sr, frame_ms=50, below_peak_db=25.0, hold_frames=10, need=6):
    """First time the vocal stem is really singing: the first 50 ms frame that starts a 0.5 s run in which at
    least `need` of `hold_frames` frames sit within `below_peak_db` of the stem's loudest frame. 0.0 if none."""
    h = int(sr * frame_ms / 1000)
    m = len(voc) // h
    if m == 0:
        return 0.0
    sq = voc[: m * h].astype(np.float64) ** 2
    # A mono stem (ab_window passes the stem's channel mean) is 1-D; a stereo one is (n, ch).
    p = (sq.mean(1) if sq.ndim == 2 else sq).reshape(m, h).mean(1)
    fdb = 10 * np.log10(p + 1e-20)
    on = fdb >= fdb.max() - below_peak_db
    for i in range(max(1, m - hold_frames + 1)):
        if on[i] and on[i:i + hold_frames].sum() >= min(need, m - i):
            return round(i * h / sr, 2)
    return 0.0


# ---------------------------------------------------------------- debuzz (unbiased `smooth` normalisation)
def _band_env(mono, sr, band=(4000, 12000)):
    """|x| of the brickwall 4-12 kHz band (full-length FFT): the envelope the seam ripple is measured on."""
    n = len(mono)
    M = np.fft.rfft(mono.astype(np.float64))
    f = np.fft.rfftfreq(n, 1 / sr)
    M[(f < band[0]) | (f >= band[1])] = 0
    return np.abs(np.fft.irfft(M, n))


def _circ_smooth(p, w=48):
    """Circular moving average along the last axis (the in-frame profile wraps: seam -> next frame start)."""
    k = np.ones(w) / w
    pad = np.concatenate([p[..., -w:], p, p[..., :w]], axis=-1)
    out = np.apply_along_axis(lambda r: np.convolve(r, k, "same"), -1, pad)
    return out[..., w:-w]


def fold_smooth(x, sr, period=YUE2_VAE_HOP):
    """Peak-to-peak (%) of the moving-average-normalised 4-12 kHz envelope folded on the frame period, vs the
    max of the +/-1 % controls (the unbiased measure; a real seam ripple shows at `frame` only)."""
    from scipy.ndimage import uniform_filter1d
    env = _band_env(x.mean(1), sr)
    c = round(period / 96)
    pp = {}
    for P in (period, period - c, period + c):
        r = env / (uniform_filter1d(env, P, mode="reflect") + 1e-12)
        m = len(r) // P
        prof = _circ_smooth(r[: m * P].reshape(m, P).mean(0))
        pp[P] = float(100 * (prof.max() - prof.min()) / prof.mean())
    return {"frame": round(pp[period], 2), "control": round(max(pp[period - c], pp[period + c]), 2)}


def debuzz(x, sr, strength=0.8, cross=2000.0, win=50, limit_db=3.0, period=YUE2_VAE_HOP):
    """Re-implementation of the Ruach Studio debuzz (HF m-a-p/YuE2-3B discussion #29; algorithm as in the
    author's lab/debuzz.py, github.com/igrbible/Ruach_Studio, AGPL - re-written, not copied), with the WP3
    unbiased normalisation:
      1. split at `cross` Hz with a zero-phase raised-cosine (1/3 octave) crossover: high = x * g(f), low = x - high;
      2. envelope = |4-12 kHz band| of the mono mix divided by its 1920-sample moving average (NOT grid-locked:
         per-frame division biases the fold - transients correlate more with their own frame mean mid-frame
         than at the edges, giving a seam-peaked 25 Hz shape at ANY period that the correction then imposes);
      3. per frame i: mean in-frame profile over frames i-25..i+25 (silent frames excluded, >= 8 needed),
         circularly smoothed over 48 samples, normalised to mean 1;
      4. gain = profile ** -strength, clipped to +/- limit_db; high *= gain; y = low + high."""
    from scipy.ndimage import uniform_filter1d
    if sr != YUE2_SR:
        raise Refused(f"debuzz needs the native {YUE2_SR} Hz grid of a YuE2 take, got {sr} Hz")
    n, ch = x.shape
    k = n // period
    f = np.fft.rfftfreq(n, 1 / sr)
    lo, hi = cross / 2 ** (1 / 6), cross * 2 ** (1 / 6)
    w = np.clip((np.log2(np.maximum(f, 1)) - np.log2(lo)) / (np.log2(hi) - np.log2(lo)), 0, 1)
    w = 0.5 - 0.5 * np.cos(np.pi * w)
    xd = x.astype(np.float64)
    high = np.stack([np.fft.irfft(np.fft.rfft(xd[:, c]) * w, n) for c in range(ch)], 1)
    low = xd - high
    mono = xd.mean(1)
    env = _band_env(mono, sr)
    env = env / (uniform_filter1d(env, period, mode="reflect") + 1e-12)
    env = env[: k * period].reshape(k, period)
    quiet = np.abs(mono[: k * period]).reshape(k, period).max(1) < 1e-4
    env[quiet] = 0
    cs = np.concatenate([np.zeros((1, period)), np.cumsum(env, 0)])
    cnt = np.concatenate([[0], np.cumsum(~quiet)])
    half = win // 2
    idx = np.arange(k)
    a, b = np.maximum(0, idx - half), np.minimum(k, idx + half + 1)
    m = cnt[b] - cnt[a]
    ok = m >= 8
    prof = (cs[b] - cs[a])[ok] / m[ok, None]
    prof = _circ_smooth(prof)
    prof /= prof.mean(1, keepdims=True)
    lim = 10 ** (limit_db / 20)
    gfr = np.ones((k, period))
    gfr[ok] = np.clip(prof ** -strength, 1 / lim, lim)
    gain = np.concatenate([gfr.ravel(), np.ones(n - k * period)])
    y = low + high * gain[:, None]
    info = {"norm": "smooth", "strength": strength, "frames": int(k), "frames_corrected": int(ok.sum()),
            "gain_db_range": [round(float(20 * np.log10(gain.min())), 2), round(float(20 * np.log10(gain.max())), 2)]}
    return y.astype(np.float32), info


def debuzz_verified(x, sr, strength):
    """Debuzz + before/after: buzz index and the unbiased fold depth vs its controls (logged by post.py)."""
    y, info = debuzz(x, sr, strength=strength)
    rep = {"params": info}
    for tag, s in (("before", x), ("after", y)):
        rep[tag] = {"buzz_index_db": buzz_metric(s, sr)["buzz_index_db"], "fold_depth_pct": fold_smooth(s, sr)}
    return y, rep


# ---------------------------------------------------------------- master
def matchering(x, sr, reference: Path, tmp: Path):
    import matchering as mg
    tmp.mkdir(parents=True, exist_ok=True)
    tin, tout = tmp / "target.wav", tmp / "matched.wav"
    sf.write(str(tin), x, sr, subtype="FLOAT")
    mg.process(target=str(tin), reference=str(reference), results=[mg.pcm24(str(tout))])
    y, s2 = sf.read(str(tout), dtype="float32", always_2d=True)
    return resample(y, s2, sr, len(x)), {"reference": str(reference), "matchering_out_sr": s2}


def limit_master(x, sr):
    """score.py's limiter loop: exactly -14 LUFS integrated, true peak <= -1 dBTP."""
    import pyloudnorm as pyln
    lufs = float(pyln.Meter(sr).integrated_loudness(x.astype(np.float64)))
    y, info = loudness_match(x, sr, lufs)
    info["input_lufs"] = round(lufs, 2)
    return y, info
