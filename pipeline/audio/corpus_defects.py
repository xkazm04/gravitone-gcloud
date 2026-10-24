"""Defect injections for the triage corpus (pipeline/audio/corpus.py) - one function per defect.

Each takes a CLEAN base (float samples shaped (frames, channels)) and returns the defective take;
none of them touches the base in place. What each does, and why it is the defect the check names
(@gt/domain/audio.triage, the per-check definitions):

  clip            gain until the sample peak sits `db` over full scale, then a hard clip at +-1.0:
                  runs of flat-topped samples whose length grows with the gain. It also lifts the
                  true peak and the loudness - the label says so (don't-care), not a false positive.
  true_peak       inter-sample overs WITHOUT a clipped sample: three 30 ms Hann bursts of a
                  quarter-rate sine at 45 degrees of phase, whose samples all sit at 0.707 of the
                  crest - so the samples stay under 0.999 while the waveform between them reaches
                  `dbtp`. The bed is ducked to zero under each burst so it cannot add to the crest.
  to_lufs         plain gain to an integrated loudness far under the kind's floor.
  dead_air        digital silence of `secs` replacing the body at 45 % of the take (5 ms ramps):
                  the length is unchanged, so only the gap is new.
  trim            the take ends `ratio` short of the asked length, with a clean ending (a fade and
                  the base's own tail): too short, not cut.
  stretch         varispeed (linear interpolation) to `ratio` longer: too long, ending intact.
  open_cut        an OPEN base (body to the last sample) whose last 0.5 s ramps to `depth_db`:
                  0 dB is a hard cut at body level; -14 dB is a cut after a token fade.
  long_tail       digital silence appended until the silent tail is `secs` long.
  tempo_warp      a progressive speed-up, s(u) = 1 + W u over the output, whose first-third and
                  last-third mean tempi differ by `drift` (W = 1.5 drift): the measure the check
                  takes. Pitch rises with it (varispeed); a drifting generator does the same.
  loop_level      a gain ramp from 0 to -`db` across a seamless loop: the wrap steps `db` up.
  loop_spectral   the band above 2 kHz ramped from 0 to -`db` (zero-phase split, so low + high is
                  the signal exactly): the wrap steps in timbre more than in level.
  mono_fold       the right channel rotated away from the left by an angle - part polarity
                  inversion, part a 23 ms delayed (decorrelated) copy, level kept - so the mono
                  fold loses (1 + cos theta) / 2 of the coherent signal: graded, where a plain
                  delay is ~3 dB whatever its length and a plain inversion is all or nothing.
"""

import numpy as np
from scipy import signal


def clip(a, db):
    peak = float(np.max(np.abs(a)))
    return np.clip(a * (10 ** (db / 20) / peak), -1.0, 1.0)


def true_peak(a, rate, dbtp, body_frames):
    a = a.copy()
    crest = 10 ** (dbtp / 20)
    n = int(0.03 * rate)
    ramp = int(0.003 * rate)
    k = np.arange(n)
    burst = crest * np.hanning(n) * np.sin(2 * np.pi * k / 4 + np.pi / 4)
    for frac in (0.3, 0.5, 0.7):
        at = int(body_frames * frac)
        duck = np.ones(len(a))
        duck[at - ramp : at] = np.linspace(1, 0, ramp)
        duck[at : at + n] = 0
        duck[at + n : at + n + ramp] = np.linspace(0, 1, ramp)
        a *= duck[:, None]
        a[at : at + n] += burst[:, None]
    return a


def to_lufs(a, rate, target):
    import pyloudnorm

    now = pyloudnorm.Meter(rate).integrated_loudness(a if a.shape[1] > 1 else a[:, 0])
    return a * 10 ** ((target - now) / 20)


def dead_air(a, rate, secs, body_frames):
    a = a.copy()
    n = int(round(secs * rate))
    at = int(body_frames * 0.45) - n // 2
    ramp = int(0.005 * rate)
    a[at - ramp : at] *= np.linspace(1, 0, ramp)[:, None]
    a[at : at + n] = 0
    a[at + n : at + n + ramp] *= np.linspace(0, 1, ramp)[:, None]
    return a


def trim(a, rate, ratio, tail_s, fade_s):
    tail = int(round(tail_s * rate))
    keep = int(round(len(a) * (1 - ratio))) - tail
    body = a[:keep].copy()
    f = min(len(body), int(round(fade_s * rate)))
    body[len(body) - f :] *= (0.5 + 0.5 * np.cos(np.linspace(0, np.pi, f)))[:, None]
    return np.vstack([body, np.zeros((tail, a.shape[1]))])


def _interp(a, at):
    src = np.arange(len(a))
    return np.stack([np.interp(at, src, a[:, c]) for c in range(a.shape[1])], axis=1)


def stretch(a, ratio):
    return _interp(a, np.linspace(0, len(a) - 1, int(round(len(a) * (1 + ratio)))))


def open_cut(a, rate, depth_db):
    a = a.copy()
    n = int(0.5 * rate)
    a[len(a) - n :] *= (10 ** (np.linspace(0, depth_db, n) / 20))[:, None]
    return a


def long_tail(a, rate, secs, tail_s):
    return np.vstack([a, np.zeros((int(round((secs - tail_s) * rate)), a.shape[1]))])


def tempo_warp(a, drift):
    w = 1.5 * drift
    n_out = int(round(len(a) / (1 + w / 2)))
    u = np.arange(n_out) / n_out
    return _interp(a, np.minimum(n_out * (u + w * u * u / 2), len(a) - 1))


def loop_level(a, db):
    return a * (10 ** (-db * np.linspace(0, 1, len(a)) / 20))[:, None]


def _split(a, rate, fc):
    low = signal.sosfiltfilt(signal.butter(4, fc, "lowpass", fs=rate, output="sos"), a, axis=0)
    return low, a - low


def loop_spectral(a, rate, db):
    low, high = _split(a, rate, 2000)
    return low + high * (10 ** (-db * np.linspace(0, 1, len(a)) / 20))[:, None]


def mono_fold(a, rate, degrees):
    """R' = cos(theta) R + sin(theta) R(t - 23 ms): the right channel turned `degrees` away from
    the left - level kept (the delayed copy is decorrelated from the body), the coherent part of
    the mono fold scaled by (1 + cos theta) / 2. 75 deg loses ~2 dB of a coherent pair, 120 deg
    ~6 dB, 180 deg is a plain polarity inversion that cancels it."""
    a = a.copy()
    th = np.radians(degrees)
    lag = int(round(0.023 * rate))
    r = a[:, 1].copy()
    delayed = np.concatenate([np.zeros(lag), r[:-lag]])
    a[:, 1] = np.cos(th) * r + np.sin(th) * delayed
    return a
