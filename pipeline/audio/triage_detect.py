"""The detectors of the audio sidecar's `triage` verb - one function per check.

triage.py's header is the method of every check, its unit and its flag rule, and the TS header
(packages/domain/src/audio.triage.ts) is the definition both implement; this file is the
numpy/scipy half, imported only inside the verb. Each detector takes a Take (the decoded samples
plus what several checks share: the mono mix, the 50 ms loud/silent windows) and the kind's
threshold row, and returns one finding through triage.finding - never raises for a property of
the signal: a file a check cannot judge is a `skip` that says why.
"""

import math

import numpy as np

import loudness
import triage as t

BANDS = 24
BAND_LO_HZ = 60.0
BAND_HI_HZ = 16000.0


def _db_power(p):
    return 10.0 * math.log10(p) if p > 0 and math.isfinite(p) else None


class Take:
    def __init__(self, x, rate):
        self.x = np.asarray(x, dtype=np.float32)
        if self.x.ndim == 1:
            self.x = self.x[:, None]
        self.rate = int(rate)
        self.n = self.x.shape[0]
        self.duration = self.n / self.rate if self.rate > 0 else 0.0
        self._mono = None
        self._loud = None

    @property
    def mono(self):
        if self._mono is None:
            self._mono = np.mean(self.x.astype(np.float64), axis=1)
        return self._mono

    @property
    def loud(self):
        """(window frames w, bool per 50 ms window) - loudness.silence_edges' windows exactly:
        mean square over every channel's samples of the window, the last window as long as it is."""
        if self._loud is None:
            w = max(1, int(round(loudness.WINDOW_S * self.rate)))
            sq = np.sum(np.square(self.x, dtype=np.float64), axis=1)
            c = np.concatenate(([0.0], np.cumsum(sq)))
            starts = np.arange(0, self.n, w)
            ends = np.minimum(starts + w, self.n)
            ms = (c[ends] - c[starts]) / ((ends - starts) * self.x.shape[1]) if self.n else np.zeros(0)
            floor = (10.0 ** (loudness.SILENCE_DBFS / 20.0)) ** 2
            self._loud = (w, ms >= floor)
        return self._loud


def _mean_square(seg):
    return float(np.mean(np.square(seg, dtype=np.float64))) if seg.size else 0.0


# ---- technical


def clipping(take, th):
    best, at = 0, None
    for ch in range(take.x.shape[1]):
        m = (np.abs(take.x[:, ch]) >= loudness.CLIP_AT).astype(np.int8)
        if not m.any():
            continue
        d = np.diff(np.concatenate(([0], m, [0])))
        starts, ends = np.flatnonzero(d == 1), np.flatnonzero(d == -1)
        i = int(np.argmax(ends - starts))
        if ends[i] - starts[i] > best:
            best, at = int(ends[i] - starts[i]), starts[i] / take.rate
    return t.finding("clipping", t.reaches(best, th["clipping"]), best, th["clipping"], at_s=at)


def true_peak_over(take, th):
    tp = loudness.true_peak_db(take.x, take.rate)
    if tp is None:
        return t.skip("true-peak-over", "no signal", th["truePeakDb"])
    return t.finding("true-peak-over", t.reaches(tp, th["truePeakDb"]), tp, th["truePeakDb"])


def loudness_range(take, th):
    lo, hi = th["lufsMin"], th["lufsMax"]
    v = loudness.integrated_lufs(take.x, take.rate)
    if v is None:
        return t.finding("loudness-range", "flag", None, lo, note="no measurable loudness (silent, or shorter than one 400 ms block)")
    if v < lo:
        return t.finding("loudness-range", "flag", v, lo)
    if v > hi:
        return t.finding("loudness-range", "flag", v, hi)
    return t.finding("loudness-range", "pass", v, lo if v - lo <= hi - v else hi)


def dead_air(take, th):
    w, loud = take.loud
    idx = np.flatnonzero(loud)
    if idx.size == 0:
        return t.skip("dead-air", "no signal", th["deadAirS"])
    inner = ~loud[idx[0]:idx[-1] + 1]
    best, at = 0, None
    if inner.any():
        d = np.diff(np.concatenate(([0], inner.astype(np.int8), [0])))
        starts, ends = np.flatnonzero(d == 1), np.flatnonzero(d == -1)
        i = int(np.argmax(ends - starts))
        best, at = int(ends[i] - starts[i]), (idx[0] + starts[i]) * w / take.rate
    gap = best * w / take.rate
    return t.finding("dead-air", t.reaches(gap, th["deadAirS"]), gap, th["deadAirS"], at_s=at)


def duration(take, th, ctx):
    asked = ctx.get("durationS")
    if asked is None:
        return t.skip("duration", "no asked length", th["durationRatio"])
    r = abs(take.duration - asked) / asked
    return t.finding("duration", t.reaches(r, th["durationRatio"]), r, th["durationRatio"],
                     note=f"{take.duration:.2f} s against {asked:g} s asked")


# ---- structural (broken-ending and loop-seam are in triage_edges.py)


_ONSET_RATE = 11025
_ONSET_FRAME = 512
_ONSET_HOP = 64
# Magnitudes are dB, floored 70 dB under a full-scale sine's bin (frame/4 with a Hann window), so
# 16-bit quantisation noise (about -84 dB there) never moves the envelope: under log1p(1000|X|) a
# steady 440 Hz sine's noise bins summed to a flux median of 2 and a periodic envelope that
# autocorrelated like a beat ("150 bpm"). A span has a pulse only when it has onsets: its
# 99th-percentile flux at least _ONSET_FLOOR dB summed over the bins. Measured 2026-10-24: a click
# track 2012, four kept Suno takes 708..1340, a steady three-note pad 20.8 - whose partials beat
# against each other in a pattern that truly repeats every 0.49 s and read "122 bpm, clarity 0.87"
# under a floor of 10. The ratio p99/median does not separate them (pad 2.8, takes 2.7..15.5).
_MAG_FLOOR = (_ONSET_FRAME / 4) * 10 ** (-70 / 20)
_ONSET_FLOOR = 100.0
_CLARITY_FLOOR = 0.1


def _onset_envelope(mono, rate):
    """(half-wave-rectified dB-spectral flux per hop, frames per second)."""
    from scipy.signal import resample_poly

    q = max(1, rate // _ONSET_RATE)
    y = resample_poly(mono, 1, q) if q > 1 else mono
    r = rate / q
    frames = 1 + (len(y) - _ONSET_FRAME) // _ONSET_HOP if len(y) >= _ONSET_FRAME else 0
    env = np.zeros(max(0, frames), dtype=np.float64)
    win = np.hanning(_ONSET_FRAME)
    prev = None
    for s in range(0, frames, 4096):  # blocks of frames: a long song never holds its whole spectrogram
        k = min(frames, s + 4096)
        idx = (np.arange(s, k) * _ONSET_HOP)[:, None] + np.arange(_ONSET_FRAME)[None, :]
        mag = 20.0 * np.log10(np.maximum(np.abs(np.fft.rfft(y[idx] * win, axis=1)), _MAG_FLOOR))
        before = mag[:1] if prev is None else prev[None, :]  # the first frame has no rise
        env[s:k] = np.sum(np.maximum(0.0, np.diff(np.vstack((before, mag)), axis=0)), axis=1)
        prev = mag[-1]
    return env, r / _ONSET_HOP


def _span_tempo(env, fps, lo, hi, prior):
    """(bpm, pulse clarity) of an onset span: the candidate whose lag and multiples score highest on
    the span's unbiased, normalised autocorrelation; (None, 0) when the span is flat."""
    e = env - np.mean(env)
    n = len(e)
    if n < 8 or not np.any(e) or np.percentile(env, 99) < _ONSET_FLOOR:
        return None, 0.0
    f = np.fft.rfft(e, 2 * n)
    ac = np.fft.irfft(f * np.conj(f))[:n]
    if ac[0] <= 0:
        return None, 0.0
    ac = ac / ac[0] * (n / np.maximum(1, n - np.arange(n)))
    bpms = np.arange(lo, hi + 1e-9, 0.05)
    lags = 60.0 * fps / bpms
    score = np.zeros_like(bpms)
    count = np.zeros_like(bpms)
    for k in range(1, 5):
        ok = k * lags <= n / 2
        score[ok] += np.interp(k * lags[ok], np.arange(n), ac)
        count[ok] += 1
    valid = count >= 2
    if not valid.any():
        return None, 0.0
    score = np.where(valid, score / np.maximum(count, 1), -np.inf)
    weighted = score * (np.exp(-0.5 * np.log2(bpms / prior) ** 2 / 0.8) if prior else 1.0)
    i = int(np.argmax(weighted))
    return float(bpms[i]), float(score[i])


def tempo_instability(take, th, ctx):
    bar = th["tempoDriftBpm"]
    if ctx["kind"] != "music":
        return t.skip("tempo-instability", f"{ctx['kind']}, not music", bar)
    # per channel, then averaged: (L+R)/2 of a take whose right channel is turned in phase cancels,
    # and an onset in either channel is an onset (WP2 corpus: 3 phase-turned takes read "no pulse")
    chans = [_onset_envelope(take.x[:, c].astype(np.float64), take.rate) for c in range(min(2, take.x.shape[1]))]
    env, fps = np.mean([c[0] for c in chans], axis=0), chans[0][1]
    whole, clarity = _span_tempo(env, fps, 60.0, 200.0, ctx.get("tempoBpm") or 120.0)
    if whole is None or clarity < _CLARITY_FLOOR:
        return t.skip("tempo-instability", "no steady pulse", bar)
    third = len(env) // 3
    if third / fps < max(3.0, 4 * 60.0 / whole):
        return t.skip("tempo-instability", "too short for thirds of 4 beats", bar)
    a, ca = _span_tempo(env[:third], fps, whole * 0.9, whole * 1.1, None)
    z, cz = _span_tempo(env[len(env) - third:], fps, whole * 0.9, whole * 1.1, None)
    if a is None or z is None or min(ca, cz) < _CLARITY_FLOOR:
        return t.skip("tempo-instability", f"no steady pulse in the {'first' if a is None or ca < _CLARITY_FLOOR else 'last'} third", bar)
    v = abs(z - a)
    return t.finding("tempo-instability", t.reaches(v, bar), v, bar, at_s=(len(env) - third) / fps,
                     note=f"first third {a:.1f} bpm, last third {z:.1f} bpm")


def _band_edges(rate, n_fft):
    hi = min(BAND_HI_HZ, 0.95 * rate / 2)
    edges_hz = np.geomspace(BAND_LO_HZ, hi, BANDS + 1)
    return np.round(edges_hz * n_fft / rate).astype(int)


def _band_db(power, edges, floor_db=-120.0):
    """Mean power per band in dB (rows = frames); a band with no bin is NaN."""
    out = np.full((power.shape[0], BANDS), np.nan)
    for b in range(BANDS):
        lo, hi = int(edges[b]), min(int(edges[b + 1]), power.shape[1])
        if hi > lo:
            out[:, b] = 10.0 * np.log10(np.maximum(np.mean(power[:, lo:hi], axis=1), 10 ** (floor_db / 10)))
    return out


_NOVELTY_HALF = 30  # frames of 0.1 s: the 3 s compared on each side of a candidate boundary
_NOVELTY_EDGE = 10  # near either end, at least 1 s on the short side
_PEAK_REACH = 15  # a peak is the largest novelty within +-1.5 s
_PEAK_DB = 1.0  # ... and at least 1 dB (RMS over the bands) and 30 % of the file's largest


def _novelty(take):
    """(novelty per 0.1 s frame in dB, frame step s, frame centre offset s)."""
    hop = int(round(0.1 * take.rate))
    n_fft = 1 << int(round(math.log2(max(2, 0.2 * take.rate))))
    y = take.x[:, : min(2, take.x.shape[1])].astype(np.float64)  # power per channel, averaged: no fold
    frames = 1 + (len(y) - n_fft) // hop if len(y) >= n_fft else 0
    if frames < 1:
        return np.zeros(0), hop / take.rate, 0.0
    edges = _band_edges(take.rate, n_fft)
    win = np.hanning(n_fft)
    feats = []
    for s in range(0, frames, 512):
        idx = (np.arange(s, min(frames, s + 512)) * hop)[:, None] + np.arange(n_fft)[None, :]
        power = np.mean(np.abs(np.fft.rfft(y[idx] * win[None, :, None], axis=1)) ** 2, axis=2)
        feats.append(_band_db(power, edges))
    f = np.vstack(feats)
    f = f[:, ~np.isnan(f).any(axis=0)]
    f = np.maximum(f, np.max(f) - 80.0)
    c = np.vstack((np.zeros((1, f.shape[1])), np.cumsum(f, axis=0)))
    half, edge = _NOVELTY_HALF, _NOVELTY_EDGE
    nov = np.zeros(frames)
    for i in range(edge, frames - edge):
        a, b = max(0, i - half), min(frames, i + half)
        left = (c[i] - c[a]) / (i - a)
        right = (c[b] - c[i]) / (b - i)
        nov[i] = math.sqrt(float(np.mean(np.square(left - right))))
    # the contrast at i is the boundary between frames i-1 and i: half a hop before frame i's centre
    return nov, hop / take.rate, (n_fft / 2) / take.rate


def section_boundary(take, th, ctx):
    bar = th["sectionS"]
    secs = ctx.get("sections") or []
    planned = [s["startMs"] / 1000.0 for s in secs[1:]]
    if not planned:
        return t.skip("section-boundary", "no section boundaries planned", bar)
    if not take.loud[1].any():
        return t.skip("section-boundary", "no signal", bar)
    nov, step, offset = _novelty(take)
    if nov.size < 2 * _NOVELTY_EDGE + 1:
        return t.skip("section-boundary", "too short to hold a section change", bar)
    floor = max(_PEAK_DB, 0.3 * float(np.max(nov)))
    reach = _PEAK_REACH
    at = np.arange(len(nov)) * step + offset - step / 2
    peaks = [float(at[i]) for i in range(len(nov))
             if nov[i] >= floor and nov[i] == np.max(nov[max(0, i - reach):i + reach + 1])
             and 1.0 <= at[i] <= take.duration - 1.0]
    if not peaks:
        return t.finding("section-boundary", "flag", None, bar, at_s=planned[0], note="no section change found")
    dist = [min(abs(p - q) for q in peaks) for p in planned]
    worst = int(np.argmax(dist))
    return t.finding("section-boundary", t.reaches(dist[worst], bar), dist[worst], bar, at_s=planned[worst],
                     note="changes at " + ", ".join(f"{p:.1f}" for p in peaks) + " s")


def mono_fold(take, th):
    bar = th["monoLossDb"]
    if take.x.shape[1] < 2:
        return t.skip("mono-fold", "mono file", bar)
    lr = take.x[:, :2].astype(np.float64)
    st = loudness.integrated_lufs(lr, take.rate)
    if st is None:
        return t.skip("mono-fold", "no measurable loudness", bar)
    m = (lr[:, 0] + lr[:, 1]) / 2.0
    folded = loudness.integrated_lufs(np.stack((m, m), axis=1), take.rate)
    note = None if take.x.shape[1] == 2 else f"first two of {take.x.shape[1]} channels"
    if folded is None:
        return t.finding("mono-fold", "flag", None, bar, note="L+R cancels to no loudness in mono")
    v = st - folded
    return t.finding("mono-fold", t.reaches(v, bar), v, bar, note=note)
