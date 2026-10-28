"""The two triage checks about a take's EDGES - how it ends, and how its end joins its start.

Split from triage_detect.py (the 400-line rule) when both were redesigned against measured false
positives (Director, 2026-10-24, on WP2's seed-7 corpus `C:\\t\\tw2\\A`):

broken-ending, first cut: "the last 50 ms against the 2 s before it". 5 of 8 clean VOICE takes
flagged (-11.3 .. -3.7 dB against a -12 bar). A spoken final syllable decays over 40-60 ms, so a
50 ms window still holds its loud half, and the 2 s before is pulled down by the pauses between
words. Now the end is read at 10 ms: the audible end is the last 10 ms frame above the take's
OWN floor (its 95th-percentile frame level minus 45 dB, so a quiet sfx at -50 dBFS still has a
body and is not all "tail"), and the value is that final frame's level against the body: the
median level of the active frames in the 2 s before it. A natural end has decayed to near the
floor by its last audible frame. A cut is still at body level there. A take whose envelope is
FALLING over its last 300 ms (a least-squares slope of at least 30 dB/s, frame levels in dB) has
ended, not been cut - a decaying hit or a final syllable that is still loud when the file stops -
and passes whatever its value, saying so in its note. The silent tail is the time after the
audible end, and it flags at `tailS`.

loop-seam, first cut: "last 100 ms against first 100 ms". 8 of 8 clean MUSIC loops flagged
(10.1 .. 13.2 dB): a loop that starts on a downbeat has a transient in its first 100 ms and a
decayed bar-end in its last. The seam is the JOIN, judged against what the take does elsewhere.
What was measured on the way (corpus rows, 2026-10-24):
  - the wrap's 100 ms step minus the take's own 95th-percentile step: no false positive, but a
    drum loop's onsets step 12-13 dB, so an 8 dB drift read 2.8 - recall gone;
  - the 100 ms before where the start recurs inside (cross-correlation): even at true bar lines
    a 100 ms spectrum of hat noise and velocities differs by 1.5-6.7 dB, so clean loops read 3-5;
  - repeats taken at a bar: the corpus loops repeat at FOUR bars (a chord cycle: bars 0/4, 1/5,
    2/6, 3/7 match, 0/1 differ by 10-17 dB in the 240-1300 Hz bands), which a drum-dominated level
    envelope cannot see; and comparing the first span with the last reads (1 - 1/k) of a drift.
So, for a loop with a RHYTHM (its 10 ms level envelope autocorrelates >= 0.8 at lags L/k and 2L/k
- a drum loop's bar multiples score ~0.9, everything between them below zero), the rhythm proposes
the repetition and the spectrum disposes: the largest proposed k whose k power-averaged spans
(level, four band groups) lie on one line within 1 dB. The line's slope across the whole length is
the drift between repeats - the step the loop's end makes into its start; a seamless loop has
none. A TEXTURE (no rhythm: a bed, rain, a drone) has no repeats but is locally continuous: the
step its wrap makes, against the same step at every boundary inside it. (Its own slow swells are
why a trend is wrong there: one clean sfx loop wanders 2.5 dB between 1 s spans and read 3.1 dB
of "drift".) Then a hard waveform discontinuity: the jump from the last sample to the first over
the take's 99.9th-percentile sample-to-sample change, dB. The value is the largest of the three.

The texture step, second cut (2026-10-24, same corpus). The first cut was the mean of the last
0.5 s against the first, minus the median such step inside: every high (8 dB) sfx defect flagged
and no medium (4 dB) one did (0 of 4: 0.9..2.6 dB). Two things hid a 4 dB step, measured per
band on those files:
  - the bed's own swell. A clean bed's level slopes by up to 2.0..7.6 dB a second (the
    steepest 1 s line fit of each of the 8 clean beds), and a mean-against-mean step reads that
    slope as a step - with either sign, so a swell falling into the wrap cancelled most of a
    rising seam (sfx-loop-1, 4 dB: level read 0.7). Now the step is FITTED: per band,
    a + b t + c t^2 + a jump at the boundary, by least squares over the ten 100 ms windows
    wholly on each side (0.5 s; the one straddling it is left out). A slope and a curvature
    are absorbed; a jump is not. (0.75, 1, 1.5 and 2 s a side were
    measured with everything below unchanged: clean beds stay under 1.4 dB at every length, but
    the weakest 4 dB step reads 2.9, 2.6, 2.2, 0.9 dB - over a longer span the bed's swell is no
    longer a parabola, and its odd part trades against the jump. 0.5 s flags all four.)
  - the low bands' own noise. A 100 ms window holds a dozen bins under 250 Hz; a band's fitted
    step there wanders 3-5 dB at random between boundaries, against 0.4-1 dB above 2 kHz, and
    the level - a power sum the low bands dominate - inherits it. Now each band is weighted by
    the inverse of its own fitted-step variance inside the take (RMS over every boundary whose
    fit does not reach the wrap, floored at 0.25 dB). The common step is the weighted MEDIAN of
    the bands' steps - every band steps together when a bed's level drifts, and a median is not
    moved by the few that did not - and each of the four band groups' weighted mean minus that
    common step is the spectrum's. A spectral drift above 2 kHz moves the steady high bands, so
    the median follows them and the low groups read the step against it: the note says "median
    band", never "level", for that reason.
Each of the five statistics is then taken at the wrap minus its median at every boundary inside
- the take's own wander, as before; same unit, same 3 dB bar. On the corpus: clean sfx loops
0.14..1.42 dB (0 of 8 flag); the four former misses read level-medium 3.89 and 4.26,
spectral-medium 3.87 and 3.65; every sfx high defect 7.28..8.04; 2 dB (low) defects 1.3..2.4
still pass. The rhythm regime is untouched (every music row reads as it did), and one music
loop whose rhythm test fails (music-loop-2, 8 dB) reads 8.01 here, against 5.67 before. On this
file's own drum loop a 6 dB drift reads 6.05 and an 8 dB hat drift 8.04; the clean loop 0.52.
"""

import math

import numpy as np

import triage as t
from triage_detect import _band_db, _band_edges

FRAME_S = 0.01
FLOOR_UNDER_P95_DB = 45.0
FLOOR_MIN_DBFS = -100.0
BODY_S = 2.0
DECAY_S = 0.3
DECAY_DB_PER_S = 30.0

SEAM_S = 0.1
SEAM_HOP_S = 0.05
SEAM_GROUPS = 4
SEAM_SPAN_MIN_S = 0.5
SEAM_K_MAX = 32
SEAM_REPEAT_DB = 1.0
SEAM_REPEAT_R = 0.8
SEAM_TEXTURE_S = 0.5
SEAM_SIGMA_FLOOR_DB = 0.25
SEAM_FLOOR_DB = 60.0
JUMP_PERCENTILE = 99.9
_LEVEL_FLOOR_DB = -120.0


def frame_levels(take):
    """(10 ms frame length in samples, dB per whole frame: mean square over every channel)."""
    w = max(1, int(round(FRAME_S * take.rate)))
    n = take.n // w
    sq = np.mean(np.square(take.x[: n * w], dtype=np.float64), axis=1)
    ms = sq.reshape(n, w).mean(axis=1) if n else np.zeros(0)
    return w, 10.0 * np.log10(np.maximum(ms, 10 ** (_LEVEL_FLOOR_DB / 10)))


def broken_ending(take, th, ctx):
    bar = th["endingDb"]
    if ctx.get("loop") is True:
        return t.skip("broken-ending", "briefed as a loop: its end is its seam", bar)
    w, lv = frame_levels(take)
    sounding = lv[lv > FLOOR_MIN_DBFS]
    if sounding.size == 0:
        return t.skip("broken-ending", "no signal", bar)
    floor = max(FLOOR_MIN_DBFS, float(np.percentile(sounding, 95)) - FLOOR_UNDER_P95_DB)
    active = lv > floor
    e = int(np.flatnonzero(active)[-1])
    body_from = max(0, e + 1 - int(round(BODY_S / FRAME_S)))
    body = lv[body_from:e + 1][active[body_from:e + 1]]
    if body.size < int(round(0.5 / FRAME_S)):
        return t.skip("broken-ending", "audible part too short to have an ending", bar)
    v = float(lv[e]) - float(np.median(body))
    end_s = (e + 1) * w / take.rate
    tail = (take.n - (e + 1) * w) / take.rate
    if tail >= th["tailS"]:
        return t.finding("broken-ending", "flag", v, bar, at_s=end_s, note=f"silent tail {tail:.1f} s")
    k = np.arange(max(0, e + 1 - int(round(DECAY_S / FRAME_S))), e + 1)
    k = k[active[k]]
    slope = float(np.polyfit(k * FRAME_S, lv[k], 1)[0]) if k.size >= 3 else 0.0
    if v >= bar and slope <= -DECAY_DB_PER_S:
        return t.finding("broken-ending", "pass", v, bar, at_s=end_s, note=f"falling {-slope:.0f} dB/s over its last 300 ms")
    return t.finding("broken-ending", t.reaches(v, bar), v, bar, at_s=end_s)


def _seam_frames(x, rate, starts, s):
    """Per window (rows): level dB and 24-band dB (Hann; mean power over channels)."""
    levels, specs = [], []
    win = np.hanning(s)[None, :, None]
    for b in range(0, len(starts), 128):  # blocks: a long loop never holds every window at once
        seg = x[starts[b:b + 128, None] + np.arange(s)[None, :]]  # (frames, s, channels)
        levels.append(np.mean(np.square(seg), axis=(1, 2)))
        specs.append(np.mean(np.abs(np.fft.rfft(seg * win, axis=1)) ** 2, axis=2))
    level = 10.0 * np.log10(np.maximum(np.concatenate(levels), 10 ** (_LEVEL_FLOOR_DB / 10)))
    bands = _band_db(np.vstack(specs), _band_edges(rate, s), floor_db=_LEVEL_FLOOR_DB)
    return level, bands[:, ~np.isnan(bands).any(axis=0)]


def _features(level, bands, floor, active=None):
    """Per row: level dB, then the four band-group means (each band floored at `floor`; a band at
    the floor in every row - or outside `active`, when the caller fixes the set for the take - is
    left out, so every row of one take has the same columns)."""
    b = np.maximum(bands, floor)
    if active is None:
        active = np.any(b > floor, axis=0)
    cols = [level]
    for g in np.array_split(np.arange(b.shape[1]), SEAM_GROUPS):
        g = g[active[g]]
        if g.size:
            cols.append(b[:, g].mean(axis=1))
    return np.column_stack(cols)


def _energy_mean(level, bands, rows):
    """The (level dB, bands dB) of a run of 50 ms frames, averaged as power."""
    return (10 * np.log10(np.mean(10 ** (level[rows] / 10))),
            10 * np.log10(np.mean(10 ** (bands[rows] / 10), axis=0)))


def _spans(level, bands, k, floor, grid):
    """(span centres as fractions of the length, features of k equal spans, power-averaged). A
    span is [iL/k, (i+1)L/k) and holds only the windows wholly inside it: a window straddling the
    wrap holds the head's downbeat, and lifted the last span of a 6 dB drift by 1.8 dB."""
    starts, n, s = grid
    rows = []
    for i in range(k):
        lo, hi = i * n / k, (i + 1) * n / k
        inside = np.flatnonzero((starts >= lo) & (starts + s <= hi))
        rows.append(_energy_mean(level, bands, inside))
    return (np.arange(k) + 0.5) / k, _features(np.array([r[0] for r in rows]), np.array([r[1] for r in rows]), floor)


def _trend(tc, feats):
    """Per feature: (slope across the whole length in dB, RMS residual about the line in dB)."""
    a = np.column_stack((tc, np.ones_like(tc)))
    coef, *_ = np.linalg.lstsq(a, feats, rcond=None)
    res = feats - a @ coef
    return coef[0], np.sqrt(np.mean(res * res, axis=0))


def _rhythmic(take, spans):
    """The k whose lags L/k and 2L/k both autocorrelate at >= SEAM_REPEAT_R on the circular 10 ms
    level envelope: the bar multiples of a drum loop (~0.9 there, below zero between them)."""
    _, lv = frame_levels(take)
    env = lv - np.mean(lv)
    energy = float(np.sum(env * env))
    if energy <= 0:
        return []
    n = len(env)
    r = lambda lag: float(np.sum(env * np.roll(env, -lag)) / energy)  # noqa: E731
    return [k for k in spans if r(int(round(n / k))) >= SEAM_REPEAT_R and r(int(round(2 * n / k))) >= SEAM_REPEAT_R]


def _rhythmic_drift(level, bands, proposed, floor, grid):
    """A loop with a rhythm: the drift (dB per feature, across the whole length) of its repeats.
    The rhythm proposes the repetition (bar multiples) and the spectrum disposes: the largest
    proposed k whose spans lie on one line within SEAM_REPEAT_DB - 8 identical bars repeat at a
    bar, over a 4-bar chord cycle at 4 bars; k = 2 always lies on a line."""
    fits = [k for k in proposed if float(np.max(_trend(*_spans(level, bands, k, floor, grid))[1])) <= SEAM_REPEAT_DB]
    k = max(fits) if fits else min(proposed)
    return k, np.abs(_trend(*_spans(level, bands, k, floor, grid))[0])


def _step_kernel(m):
    """(frame offsets, weights): the least-squares STEP at a boundary, from the m windows wholly
    before it and the m wholly after (the one straddling it is left out). Model: a + b t + c t^2
    + (d/2) sign(t), t the window centre's distance from the boundary - a swell (the slope and
    curvature a bed wanders with) is absorbed, a jump is not. The two sides are symmetric, so the
    step is the odd part's sign term alone: a higher even term would not change it."""
    off = np.concatenate((np.arange(-m - 1, -1), np.arange(0, m)))
    t = (off + 1) / m
    a = np.column_stack((np.ones_like(t), np.sign(t), t, t * t))
    return off, 2 * np.linalg.pinv(a)[1]


def _steps(y, m):
    """The fitted step (dB, per column of y) at every boundary of the circular frame series: row p
    is the boundary at the start of frame p, so row 0 is the wrap."""
    off, w = _step_kernel(m)
    return sum(wk * np.roll(y, -o, axis=0) for o, wk in zip(off, w))


def _weighted_median(v, w):
    """Per row of v, the median of its columns weighted by w."""
    o = np.argsort(v, axis=1)
    cw = np.cumsum(w[o], axis=1)
    k = np.argmax(cw >= cw[:, -1:] / 2, axis=1)
    return np.take_along_axis(v, o, axis=1)[np.arange(len(v)), k]


def _texture_step(bands, m, floor):
    """A take with no rhythm: (common step, largest band-group step against it) at the wrap, each
    minus the median of the same statistic at every boundary inside it, dB. Per band, the fitted
    step over m windows each side; each band weighted by the inverse of its own step variance
    inside the take (a low band holds few bins and wanders 3-5 dB between 0.5 s spans, a high
    band under 1 dB); the common step is the weighted median across bands - every band steps
    together when the level drifts - and a group's step is its weighted mean minus that."""
    b = np.maximum(bands, floor)
    b = b[:, np.any(b > floor, axis=0)]  # a band at the floor throughout is no evidence (a tone has one band)
    n = len(b)
    d = _steps(b, m)
    inside = np.ones(n, bool)
    inside[np.r_[0:m + 2, n - m - 2:n]] = False  # boundaries whose fit reaches the wrap
    w = 1.0 / np.maximum(np.sqrt(np.mean(d[inside] ** 2, axis=0)), SEAM_SIGMA_FLOOR_DB) ** 2
    common = _weighted_median(d, w)
    groups = [d[:, g] @ w[g] / w[g].sum() - common for g in np.array_split(np.arange(b.shape[1]), SEAM_GROUPS) if g.size]
    stat = np.abs(np.column_stack([common] + groups))
    return stat[0] - np.median(stat[inside], axis=0)


def loop_seam(take, th, ctx):
    bar = th["seamDb"]
    if ctx.get("loop") is not True:
        return t.skip("loop-seam", "not briefed as a loop", bar)
    s, h = int(round(SEAM_S * take.rate)), int(round(SEAM_HOP_S * take.rate))
    spans = [k for k in range(2, SEAM_K_MAX + 1) if take.duration / k >= SEAM_SPAN_MIN_S]
    if len(spans) == 0 or take.duration < 4 * SEAM_TEXTURE_S:
        return t.skip("loop-seam", "too short to hold two repetitions", bar)
    x = take.x.astype(np.float64)
    ring = np.vstack((x, x[:s]))  # the loop played into itself: a window may straddle the wrap
    proposed = _rhythmic(take, spans)
    if proposed:
        starts = np.arange(0, take.n, h)
        level, bands = _seam_frames(ring, take.rate, starts, s)
        k, drift = _rhythmic_drift(level, bands, proposed, float(np.max(bands)) - SEAM_FLOOR_DB, (starts, take.n, s))
        how, tag = f"drift across {k} repeats of {take.duration / k:.2f} s", "level"
    else:
        # Windows on a grid that divides the length exactly, so the frame series is circular and
        # the windows before the wrap end at it (an 8.03 s loop at a whole 50 ms hop would put a
        # window holding the start among them). The hop is then 50 ms to within half a hop over
        # the frame count - 49.88 ms for 8.03 s, whose last window before the wrap reaches 12 of
        # its 4800 samples past it.
        frames = max(1, int(round(take.n / h)))
        _, bands = _seam_frames(ring, take.rate, np.round(np.arange(frames) * take.n / frames).astype(int), s)
        m = int(round(SEAM_TEXTURE_S / SEAM_HOP_S))
        drift = _texture_step(bands, m, float(np.max(bands)) - SEAM_FLOOR_DB)
        how, tag = f"step at the wrap ({SEAM_TEXTURE_S:g} s a side) over the median step inside", "median band"
    lstep, sstep = float(drift[0]), float(np.max(drift[1:])) if len(drift) > 1 else 0.0
    d = np.abs(np.diff(x, axis=0))
    ref_j = float(np.percentile(d, JUMP_PERCENTILE))
    j = float(np.max(np.abs(x[0] - x[-1])))
    jump = 20.0 * math.log10(j / ref_j) if j > 0 and ref_j > 0 else None
    v = max(lstep, sstep) if jump is None else max(lstep, sstep, jump)
    note = f"{how}: {tag} {lstep:.1f} dB, spectrum {sstep:.1f} dB"
    note += "" if jump is None else f"; waveform jump {jump:+.1f} dB"
    return t.finding("loop-seam", t.reaches(v, bar), v, bar, at_s=take.duration, note=note)
