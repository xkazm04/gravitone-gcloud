"""The master half of the audio sidecar: ONE universal recipe, no parameters (spark audio-distribution).

    python pipeline/audio/sidecar.py master --in <wav|mp3|...> --out <wav> --recipe uni-1 --json
      -> {"ok":true,"recipe":"uni-1","input":...,"output":...,"before":{lufs,truePeakDb,lra},
          "after":{lufs,truePeakDb,lra},"ms":n,"limitDb":l,"passes":p}

The owner's ruling (wave 2, "one click"): a track's master names a recipe, never a setting. So the
recipe's numbers live in RECIPES below, one row per recipe id, and a row is never edited once a
master was made with it - `uni-2` is a new row (packages/domain/src/release.ts MASTER_RECIPES is
the append-only list the Node side accepts).

THE CHAIN, in signal order (uni-1's numbers are in its row):
  1. resample to 48 kHz when the source is at another rate (scipy resample_poly, exact ratio);
  2. a reference gain to `refLufs` integrated - so the compressor's fixed threshold sits at the
     same place on every track, whatever level the source arrived at (measured 2026-11-16 on two
     MiSu tracks: threshold -20 dBFS against a -18 LUFS reference lowers integrated loudness by
     1.62 dB on both, i.e. a glue compressor, not a squash);
  3. pedalboard: high-pass (rumble), a low shelf and a high shelf (a small broad tilt), a 2:1
     compressor with a slow attack;
  4. a static gain to the target loudness and a lookahead true-peak limiter (below), iterated -
     limiting lowers loudness, so the gain is corrected and the ceiling lowered until the
     integrated loudness is within `tolLu` of the target AND the true peak is at or under
     `ceilingDbtp`, or `maxPasses` is spent (then the file is still written and the answer says
     what it measured: unmeasured is not pass, and neither is a quiet retry loop).
  5. 24-bit PCM WAV at 48 kHz, channels preserved. `after` is measured on the file as written.

THE LIMITER is here, not pedalboard's: JUCE's dsp::Limiter (pedalboard.Limiter) runs a fixed 4:1
first stage from -10 dBFS and has no lookahead, so it colours every peak of a -14 LUFS master and
still overshoots between samples. This one reads the 4x-oversampled peak envelope (the same
oversampling loudness.true_peak_db measures with, so the two agree), takes the gain each frame
needs to stay under the ceiling, runs a centred minimum filter `limitWindowS` wide over it and then
two box filters of half that width. Every smoothed value is an average of minima whose windows all
contain its own frame, so the gain is never above what that frame needs: the gain starts moving
half a window before a peak (lookahead) and recovers over the other half (release), with no
recursion - O(n) in scipy.ndimage, a five-minute song in well under a second.

Measurement is loudness.py's throughout (BS.1770-4 integrated, 4x true peak, Tech 3342 LRA).
"""

import math
import os
import time

import numpy as np

import loudness

OUT_RATE = 48000

# One row per recipe. NEVER edit a row a master was made with: add `uni-2`.
RECIPES = {
    "uni-1": {
        "refLufs": -18.0,          # level the compressor sees (step 2)
        "highpassHz": 30.0,        # rumble only; the kick's fundamental sits above it
        "lowShelfHz": 100.0, "lowShelfDb": 0.5, "lowShelfQ": 0.707,
        "highShelfHz": 10000.0, "highShelfDb": 0.75, "highShelfQ": 0.707,
        "compThresholdDb": -20.0, "compRatio": 2.0, "compAttackMs": 30.0, "compReleaseMs": 250.0,
        "targetLufs": -14.0,       # Spotify's published normalisation (MASTER_TARGET)
        "ceilingDbtp": -1.0,       # the acceptance ceiling (MASTER_TARGET)
        "limitStartDbtp": -1.3,    # where the limiter aims first; lowered per pass if a peak gets through
        "limitWindowS": 0.05,      # lookahead + release span of the limiter
        "tolLu": 0.1,              # how close to the target a pass must land
        "maxPasses": 8,
    },
    # 2026-11-16, after the owner's listen: uni-1 is "minimal", far from Mixea's clarity and depth "on both
    # ears". uni-2 runs master_wide.py's chain (mid/side width + mono low end, mud cut, presence and air,
    # 3-band compression that keeps the tone, an exciter) into the same loudness-and-limit stage.
    "uni-2": {
        "chain": "wide",
        "refLufs": -18.0,
        "highpassHz": 25.0,
        "monoBelowHz": 120.0,                       # side high-passed: the low end sits in the middle
        "sideAirHz": 2500.0, "sideAirDb": 3.0,      # width on both ears: the side channel's highs
        "mudHz": 300.0, "mudDb": -2.0, "mudQ": 1.0,  # low-mid congestion (mid only)
        "presenceHz": 3000.0, "presenceDb": 1.5, "presenceQ": 0.9,
        "depthHz": 70.0, "depthDb": 2.0,             # low shelf: weight
        "airHz": 12000.0, "airDb": 2.0,              # high shelf: air
        "xoverLowHz": 150.0, "xoverHighHz": 5000.0,
        # per band: threshold dB, ratio, attack ms, release ms (each band keeps its pre-compression RMS)
        "bandLow": [-24.0, 3.0, 30.0, 200.0],
        "bandMid": [-22.0, 2.0, 15.0, 150.0],
        "bandHigh": [-26.0, 2.5, 5.0, 80.0],
        "exciteHz": 3500.0, "exciteDrive": 8.0, "exciteMix": 0.12,
        "glue": [-16.0, 1.5, 30.0, 300.0],
        "targetLufs": -14.0,
        "ceilingDbtp": -1.0,
        "limitStartDbtp": -1.3,
        "limitWindowS": 0.05,
        "tolLu": 0.1,
        "maxPasses": 8,
    },
    # The same chain pushed ~1.5-2x on every move, so the owner's ear has a ladder (uni-1 < uni-2 < uni-3)
    # instead of one guess. Measured on Dancing in the Static at matched loudness, uni-2 moved the side/mid
    # ratio above 2.5 kHz by +1.1..+2.6 dB and the low end to mono; uni-3 goes past it.
    "uni-3": {
        "chain": "wide",
        "refLufs": -18.0,
        "highpassHz": 25.0,
        "monoBelowHz": 140.0,
        "sideAirHz": 2000.0, "sideAirDb": 5.0,
        "mudHz": 300.0, "mudDb": -3.0, "mudQ": 0.9,
        "presenceHz": 3000.0, "presenceDb": 2.5, "presenceQ": 0.8,
        "depthHz": 65.0, "depthDb": 3.0,
        "airHz": 11000.0, "airDb": 3.5,
        "xoverLowHz": 150.0, "xoverHighHz": 5000.0,
        "bandLow": [-26.0, 4.0, 25.0, 180.0],
        "bandMid": [-24.0, 2.5, 12.0, 140.0],
        "bandHigh": [-28.0, 3.0, 4.0, 70.0],
        "exciteHz": 3000.0, "exciteDrive": 10.0, "exciteMix": 0.2,
        "glue": [-18.0, 2.0, 25.0, 250.0],
        "targetLufs": -14.0,
        "ceilingDbtp": -1.0,
        "limitStartDbtp": -1.3,
        "limitWindowS": 0.05,
        "tolLu": 0.1,
        "maxPasses": 8,
    },
}

_CHUNK = 1 << 18
_GUARD = 256


class RecipeRefused(ValueError):
    """An unknown recipe id; the message names the ones this sidecar knows."""


def recipe(rid):
    row = RECIPES.get(rid)
    if row is None:
        raise RecipeRefused(f"unknown master recipe {rid!r} (one of {', '.join(sorted(RECIPES))})")
    return row


def _db_to_lin(db):
    return 10.0 ** (db / 20.0)


def to_rate(x, rate, out_rate=OUT_RATE):
    if rate == out_rate:
        return x
    from scipy.signal import resample_poly

    g = math.gcd(int(rate), int(out_rate))
    return resample_poly(x.astype(np.float64), out_rate // g, rate // g, axis=0).astype(np.float32)


def peak_envelope(x):
    """Per frame, the largest |sample| of the 4x-oversampled signal over all channels (linear)."""
    from scipy.signal import resample_poly

    n = x.shape[0]
    env = np.max(np.abs(x), axis=1).astype(np.float32)
    k = loudness.OVERSAMPLE
    for start in range(0, n, _CHUNK):
        lo = max(0, start - _GUARD)
        hi = min(n, start + _CHUNK + _GUARD)
        up = np.abs(resample_poly(x[lo:hi].astype(np.float64), k, 1, axis=0)).max(axis=1)
        a = (start - lo) * k
        end = min(n, start + _CHUNK)
        seg = up[a:a + (end - start) * k].reshape(end - start, k).max(axis=1)
        env[start:end] = np.maximum(env[start:end], seg.astype(np.float32))
    return env


def limiter_gain(env, ceiling_lin, rate, window_s):
    """The smoothed per-frame gain (<= 1) that holds `env` at or under `ceiling_lin`."""
    from scipy.ndimage import minimum_filter1d, uniform_filter1d

    need = np.ones_like(env, dtype=np.float64)
    over = env > ceiling_lin
    if not np.any(over):
        return None
    need[over] = ceiling_lin / env[over].astype(np.float64)
    half = max(1, int(round(window_s * rate / 2)))
    held = minimum_filter1d(need, size=2 * half + 1, mode="nearest")
    smooth = uniform_filter1d(uniform_filter1d(held, size=half, mode="nearest"), size=half, mode="nearest")
    return np.minimum(smooth, 1.0)


def _measure3(x, rate):
    m = loudness.measure(x, rate)
    return {"lufs": m["integratedLufs"], "truePeakDb": m["truePeakDb"], "lra": m["lra"]}


def pre_chain(x, rate, row):
    """Steps 2-3: reference gain, then the pedalboard chain. x (frames, channels) float32."""
    if row.get("chain") == "wide":
        import master_wide

        return master_wide.pre_chain(x, rate, row, _db_to_lin)
    import pedalboard as pb

    ref = loudness.integrated_lufs(x, rate)
    if ref is None:
        raise ValueError("the source has no measurable loudness (silent, or shorter than 400 ms); nothing to master")
    y = x * np.float32(_db_to_lin(row["refLufs"] - ref))
    board = pb.Pedalboard([
        pb.HighpassFilter(cutoff_frequency_hz=row["highpassHz"]),
        pb.LowShelfFilter(cutoff_frequency_hz=row["lowShelfHz"], gain_db=row["lowShelfDb"], q=row["lowShelfQ"]),
        pb.HighShelfFilter(cutoff_frequency_hz=row["highShelfHz"], gain_db=row["highShelfDb"], q=row["highShelfQ"]),
        pb.Compressor(threshold_db=row["compThresholdDb"], ratio=row["compRatio"],
                      attack_ms=row["compAttackMs"], release_ms=row["compReleaseMs"]),
    ])
    out = board(np.ascontiguousarray(y.T), rate).T
    if not np.all(np.isfinite(out)):
        raise ValueError("the master chain produced non-finite samples")
    return np.ascontiguousarray(out, dtype=np.float32)


def loudness_and_limit(x, rate, row):
    """Step 4: (mastered float32, total gain dB applied after the chain, deepest limiting dB, passes)."""
    target = row["targetLufs"]
    start = loudness.integrated_lufs(x, rate)
    gain_db = target - start
    ceiling = row["limitStartDbtp"]
    env = peak_envelope(x)
    y, deepest, passes = x, 0.0, 0
    for passes in range(1, row["maxPasses"] + 1):
        g = _db_to_lin(gain_db)
        curve = limiter_gain(env * np.float32(g), _db_to_lin(ceiling), rate, row["limitWindowS"])
        y = x * np.float32(g)
        deepest = 0.0
        if curve is not None:
            y = (y * curve[:, np.newaxis]).astype(np.float32)
            deepest = -20.0 * math.log10(float(np.min(curve)))
        lufs = loudness.integrated_lufs(y, rate)
        tp = loudness.true_peak_db(y, rate)
        hit_lufs = abs(lufs - target) <= row["tolLu"]
        hit_tp = tp is None or tp <= row["ceilingDbtp"]
        if hit_lufs and hit_tp:
            break
        if not hit_tp:
            ceiling -= (tp - row["ceilingDbtp"]) + 0.05
        if not hit_lufs:
            gain_db += target - lufs
    return y, gain_db, deepest, passes


def master_file(inp, out, rid, read_audio):
    """The verb's whole answer (minus `ok`). `read_audio` is the sidecar's decoder (soundfile, then ffmpeg)."""
    import soundfile as sf

    t0 = time.perf_counter()
    row = recipe(rid)
    if os.path.abspath(inp) == os.path.abspath(out):
        raise RecipeRefused("the master would overwrite its source; name another --out")
    data, rate = read_audio(inp)
    before = _measure3(data, rate)
    if before["lufs"] is None or before["lra"] is None:
        raise RecipeRefused(f"{inp} has no integrated loudness or loudness range (silent, or under 3 s); nothing to master")
    x = to_rate(data, rate)
    del data
    x = pre_chain(x, OUT_RATE, row)
    y, _gain, deepest, passes = loudness_and_limit(x, OUT_RATE, row)
    del x
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    part = f"{out}.{os.getpid()}.part.wav"
    sf.write(part, y, OUT_RATE, subtype="PCM_24", format="WAV")
    os.replace(part, out)
    del y
    written, wrate = sf.read(out, dtype="float32", always_2d=True)
    after = _measure3(written, wrate)
    return {
        "recipe": rid,
        "input": os.path.abspath(inp),
        "output": os.path.abspath(out),
        "before": before,
        "after": after,
        "ms": int(round((time.perf_counter() - t0) * 1000)),
        # The limiter's deepest gain reduction (0 when no frame reached the ceiling) and the passes it took.
        "limitDb": round(deepest, 2),
        "passes": passes,
    }


def cmd_master(a, emit, failure, read_audio):
    try:
        doc = master_file(a.input, a.out, a.recipe, read_audio)
    except RecipeRefused as e:
        raise failure(str(e), "refused") from None
    emit({"ok": True, **doc})
