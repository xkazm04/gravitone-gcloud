"""The measure half of the audio sidecar: what a decoded file IS, in delivery units.

Called by sidecar.py `measure`; every function takes float samples shaped (frames, channels)
and the sample rate, so it is exercised on generated signals without a file.

- Integrated loudness: pyloudnorm, ITU-R BS.1770-4 (K-weighting, 400 ms blocks, 75 % overlap,
  -70 LUFS absolute gate, -10 LU relative gate). Silence measures -inf there; it is reported as
  None (JSON null) - a silent file has no loudness, and a fake floor number would pass a
  "quiet enough" check it never earned. A file shorter than one 400 ms block is None too.
- True peak: 4x oversampling (scipy.signal.resample_poly, its default Kaiser FIR), the largest
  absolute value of the oversampled signal or the original samples, in dBTP. Computed in
  chunks with a guard band so a long song does not allocate four copies of itself.
- Loudness range: EBU Tech 3342, IMPLEMENTED HERE rather than parsed from ffmpeg `ebur128`, so
  a wav measures with no ffmpeg on the box. Short-term loudness over 3 s windows hopped every
  100 ms (Tech 3342 asks for at least 10 Hz), on the same K-weighted channel sum BS.1770 uses;
  -70 LUFS absolute gate, then a relative gate 20 LU below the energy mean of what passed;
  LRA = 95th minus 10th percentile of what is left. Under 3 s there is no short-term window
  and LRA is None. ffmpeg bins its distribution at 0.1 LU where this interpolates, so the two
  differ by up to about 0.1 LU on the same file.
- Clipped samples: frames where ANY channel reaches |x| >= 0.999 (a full-scale 16-bit square
  decodes to 0.99997 and counts).
- Lead / tail silence: 50 ms windows, a window is silent when its RMS over all channels is
  below -50 dBFS. Lead is the start of the first loud window, tail the time after the end of
  the last; an all-silent file has both equal to its length.
"""

import math

import numpy as np

SILENCE_DBFS = -50.0
WINDOW_S = 0.05
CLIP_AT = 0.999
OVERSAMPLE = 4

# BS.1770 channel weights, in pyloudnorm's channel order (L, R, C, Ls, Rs).
CHANNEL_GAINS = (1.0, 1.0, 1.0, 1.41, 1.41)

_CHUNK = 1 << 18
_GUARD = 256


def _db(power_or_amp, power=False):
    if power_or_amp <= 0 or not math.isfinite(power_or_amp):
        return None
    return (10.0 if power else 20.0) * math.log10(power_or_amp)


def _r(x, places):
    return None if x is None else round(float(x), places)


def integrated_lufs(x, rate):
    """BS.1770 integrated loudness, or None for silence / a file shorter than one block."""
    import pyloudnorm

    meter = pyloudnorm.Meter(rate)
    if x.shape[0] <= meter.block_size * rate:
        return None
    value = meter.integrated_loudness(x.astype(np.float64))
    return float(value) if math.isfinite(value) else None


def true_peak_db(x, rate):
    """4x-oversampled true peak in dBTP, or None when every sample is zero."""
    from scipy.signal import resample_poly

    del rate  # the oversampling factor is a ratio; the rate does not enter it
    if x.size == 0:
        return None
    peak = float(np.max(np.abs(x)))
    n = x.shape[0]
    for start in range(0, n, _CHUNK):
        lo = max(0, start - _GUARD)
        hi = min(n, start + _CHUNK + _GUARD)
        up = resample_poly(x[lo:hi].astype(np.float64), OVERSAMPLE, 1, axis=0)
        # Keep only the oversampled span of [start, start + _CHUNK): the guard bands absorb the
        # FIR's edge transient, which would otherwise read as a peak at every chunk seam.
        a = (start - lo) * OVERSAMPLE
        b = a + (min(n, start + _CHUNK) - start) * OVERSAMPLE
        if b > a:
            peak = max(peak, float(np.max(np.abs(up[a:b]))))
    return _db(peak)


def _k_weighted_power(x, rate):
    """The per-frame weighted channel sum of K-weighted squares (BS.1770 eq. 1-2 before averaging)."""
    from pyloudnorm.iirfilter import IIRfilter

    stages = (IIRfilter(4.0, 1 / np.sqrt(2), 1500.0, rate, "high_shelf"), IIRfilter(0.0, 0.5, 38.0, rate, "high_pass"))
    power = np.zeros(x.shape[0], dtype=np.float64)
    for ch in range(x.shape[1]):
        y = x[:, ch].astype(np.float64)
        for st in stages:
            y = st.apply_filter(y)
        power += CHANNEL_GAINS[min(ch, len(CHANNEL_GAINS) - 1)] * np.square(y)
    return power


def loudness_range(x, rate):
    """EBU Tech 3342 LRA in LU, or None under 3 s or when nothing passes the gates."""
    win = int(round(3.0 * rate))
    hop = max(1, int(round(0.1 * rate)))
    if x.shape[0] < win:
        return None
    power = _k_weighted_power(x, rate)
    c = np.concatenate(([0.0], np.cumsum(power)))
    starts = np.arange(0, x.shape[0] - win + 1, hop)
    mean = (c[starts + win] - c[starts]) / win
    with np.errstate(divide="ignore"):
        st = -0.691 + 10.0 * np.log10(mean)
    kept = st[st > -70.0]
    if kept.size == 0:
        return None
    rel = -0.691 + 10.0 * math.log10(float(np.mean(np.power(10.0, (kept + 0.691) / 10.0)))) - 20.0
    kept = kept[kept > rel]
    if kept.size == 0:
        return None
    return float(np.percentile(kept, 95) - np.percentile(kept, 10))


def clipped_samples(x):
    if x.size == 0:
        return 0
    return int(np.count_nonzero(np.any(np.abs(x) >= CLIP_AT, axis=1)))


def silence_edges(x, rate):
    """(lead seconds, tail seconds) of sub -50 dBFS RMS in 50 ms windows."""
    n = x.shape[0]
    if n == 0:
        return 0.0, 0.0
    w = max(1, int(round(WINDOW_S * rate)))
    floor = 10.0 ** (SILENCE_DBFS / 20.0)
    loud = []
    for start in range(0, n, w):
        seg = x[start:start + w]
        loud.append(math.sqrt(float(np.mean(np.square(seg, dtype=np.float64)))) >= floor)
    if not any(loud):
        return n / rate, n / rate
    first = loud.index(True)
    last = len(loud) - 1 - loud[::-1].index(True)
    return first * w / rate, max(0, n - min(n, (last + 1) * w)) / rate


def measure(x, rate):
    """The sidecar's `measure` object (lib/audio/sidecar.ts AudioMeasureFull, by key)."""
    lead, tail = silence_edges(x, rate)
    return {
        "integratedLufs": _r(integrated_lufs(x, rate), 2),
        "truePeakDb": _r(true_peak_db(x, rate), 2),
        "lra": _r(loudness_range(x, rate), 2),
        "clippedSamples": clipped_samples(x),
        "leadSilenceS": round(lead, 3),
        "tailSilenceS": round(tail, 3),
        "durationS": round(x.shape[0] / rate, 4),
    }
