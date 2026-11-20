"""The `wide` master chain (spark audio-distribution): recipe uni-2's steps 2-3, before master.py's shared
loudness-and-limit stage.

Why it exists: the owner heard uni-1 (a gentle tilt and a glue compressor) as barely different from the
source, "far from" the clarity and the depth "on both ears" Mixea gives. DistroKid's own description of
Mixea is "bass, compression, stereo enhancement, EQ, limiting and loudness"; this chain does each of those
deliberately, in mid/side where it is about the image:

  1. a reference gain to `refLufs`, so every fixed threshold below sits at the same place on every track;
  2. high-pass at `highpassHz` (sub rumble);
  3. MID/SIDE (stereo sources only):
       side - a Linkwitz-Riley high-pass at `monoBelowHz` (the low end in the middle, where depth reads as
              weight rather than smear), then a high shelf of `sideAirDb` at `sideAirHz` (the width "on
              both ears" lives in the side channel's highs);
       mid  - a cut of `mudDb` at `mudHz` (the low-mid congestion generated mixes carry) and a lift of
              `presenceDb` at `presenceHz` (vocal and lead clarity);
  4. tone - a low shelf of `depthDb` at `depthHz` and a high shelf of `airDb` at `airHz`;
  5. three-band compression split at `xoverLowHz` / `xoverHighHz` (Linkwitz-Riley 4th order for the outer
     bands, the mid band the exact remainder, so the bands sum back to the input bit for bit before
     compression); each band compressed with its own row, then given back its pre-compression RMS, so the
     compression changes the dynamics and not the tone step 3-4 set;
  6. an exciter: the band above `exciteHz`, soft-saturated (tanh at `exciteDrive`) and added back at
     `exciteMix` - harmonics where clarity is heard;
  7. a gentle glue compressor over the whole.

Filters are pedalboard (the sidecar's DSP) and scipy (Linkwitz-Riley crossovers); no new dependency.
"""

import numpy as np

import loudness


def _lr4(x, hz, rate, kind):
    """A Linkwitz-Riley 4th-order filter (two cascaded 2nd-order Butterworths), along axis 0."""
    from scipy.signal import butter, sosfilt

    sos = butter(2, hz, btype=kind, fs=rate, output="sos")
    return sosfilt(sos, sosfilt(sos, x, axis=0), axis=0).astype(np.float32)


def _board(x, rate, plugins):
    """Run a pedalboard chain over (frames, channels) float32."""
    import pedalboard as pb

    out = pb.Pedalboard(plugins)(np.ascontiguousarray(x.T), rate).T
    return np.ascontiguousarray(out, dtype=np.float32)


def _rms(x):
    return float(np.sqrt(np.mean(np.square(x, dtype=np.float64)))) or 1e-12


def _mid_side(x, rate, row):
    import pedalboard as pb

    mid = (x[:, 0] + x[:, 1]) * np.float32(0.5)
    side = (x[:, 0] - x[:, 1]) * np.float32(0.5)
    side = _lr4(side[:, None], row["monoBelowHz"], rate, "highpass")
    side = _board(side, rate, [pb.HighShelfFilter(cutoff_frequency_hz=row["sideAirHz"], gain_db=row["sideAirDb"], q=0.707)])
    mid = _board(mid[:, None], rate, [
        pb.PeakFilter(cutoff_frequency_hz=row["mudHz"], gain_db=row["mudDb"], q=row["mudQ"]),
        pb.PeakFilter(cutoff_frequency_hz=row["presenceHz"], gain_db=row["presenceDb"], q=row["presenceQ"]),
    ])
    return np.concatenate([mid + side, mid - side], axis=1)


def _multiband(x, rate, row):
    import pedalboard as pb

    low = _lr4(x, row["xoverLowHz"], rate, "lowpass")
    high = _lr4(x, row["xoverHighHz"], rate, "highpass")
    mid = x - low - high
    out = np.zeros_like(x)
    for band, b in ((low, row["bandLow"]), (mid, row["bandMid"]), (high, row["bandHigh"])):
        before = _rms(band)
        y = _board(band, rate, [pb.Compressor(threshold_db=b[0], ratio=b[1], attack_ms=b[2], release_ms=b[3])])
        out += y * np.float32(before / _rms(y))
    return out


def _excite(x, rate, row):
    hi = _lr4(x, row["exciteHz"], rate, "highpass")
    d = np.float32(row["exciteDrive"])
    return x + np.float32(row["exciteMix"]) * (np.tanh(hi * d) / d)


def pre_chain(x, rate, row, db_to_lin):
    """Steps 1-7. x (frames, channels) float32 at `rate`; returns the same shape, before loudness/limit."""
    import pedalboard as pb

    ref = loudness.integrated_lufs(x, rate)
    if ref is None:
        raise ValueError("the source has no measurable loudness (silent, or shorter than 400 ms); nothing to master")
    y = x * np.float32(db_to_lin(row["refLufs"] - ref))
    y = _board(y, rate, [pb.HighpassFilter(cutoff_frequency_hz=row["highpassHz"])])
    if y.shape[1] == 2:
        y = _mid_side(y, rate, row)
    y = _board(y, rate, [
        pb.LowShelfFilter(cutoff_frequency_hz=row["depthHz"], gain_db=row["depthDb"], q=0.707),
        pb.HighShelfFilter(cutoff_frequency_hz=row["airHz"], gain_db=row["airDb"], q=0.707),
    ])
    y = _multiband(y, rate, row)
    y = _excite(y, rate, row)
    g = row["glue"]
    y = _board(y, rate, [pb.Compressor(threshold_db=g[0], ratio=g[1], attack_ms=g[2], release_ms=g[3])])
    if not np.all(np.isfinite(y)):
        raise ValueError("the master chain produced non-finite samples")
    return np.ascontiguousarray(y, dtype=np.float32)
