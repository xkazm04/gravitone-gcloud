"""Five remaster techniques on ONE song (spark master-experiments), each judged by metrics.py and an ear page.

    <venv>/Scripts/python pipeline/audio/exp/run.py <song.wav> <album dir> <out dir> [--only 1,2,...]

The bisect (stage_bisect.py) found what hurt the old chain: minimum-phase filters rotate the bass phase 17-37
degrees on a bass-heavy song (and raise peaks 1.2 dB), and the compressors move the level 1-2 dB with the music.
The limiter never engaged. So every technique here is PHASE-SAFE (zero-phase or linear-phase filters, gain-only
dynamics) and NEVER limits: loudness is one static gain, reduced if the true-peak ceiling would be passed.

  1 gain        one linear gain to -14 LUFS. The control: it cannot be worse than the original.
  2 tonal-eq    a linear-phase FIR moving the song's long-term spectrum halfway to the album's average,
                clamped to -1.5 / +0.75 dB, nothing above 12 kHz, nothing below 30 Hz, no dynamics.
  3 matchering  Matchering 2.0.6 against the album track whose spectrum is closest to the album average.
  4 gentle-dyn  gain-riding only (no filter in the signal path): linked-stereo 1.4:1 RMS compression above the
                70th-percentile level, attack 80 ms, release 400 ms, at most 2 dB, then the static gain.
  5 apollo      Apollo (neural MP3-damage restoration, 44.1 kHz) in 6 s chunks with 1 s overlap and padding,
                resampled both ways, then the static gain.
"""

import json
import os
import shutil
import subprocess
import sys
import time

import numpy as np
import pyloudnorm as pyln
import soundfile as sf
from scipy.signal import fftconvolve, firwin2, resample_poly, welch

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import listen  # noqa: E402
import metrics  # noqa: E402

TARGET_LUFS = -14.0
CEILING_DBTP = -1.0


def lufs(x, r):
    return pyln.Meter(r).integrated_loudness(x)


def to_target(y, r, target=TARGET_LUFS, ceiling=CEILING_DBTP):
    """One static gain to the target; if the true peak would pass the ceiling the gain stops there (never a limiter)."""
    g_db = target - lufs(y, r)
    tp = metrics.true_peak_db(y, r) + g_db
    note = ""
    if tp > ceiling:
        g_db -= tp - ceiling
        note = f"gain stopped at the {ceiling} dBTP ceiling"
    return y * 10 ** (g_db / 20), g_db, note


# ---- 1 ---------------------------------------------------------------------------------------------------------
def t_gain(x, r, ctx):
    y, g, note = to_target(x, r)
    return y, f"+{g:.2f} dB, nothing else. {note}".strip()


# ---- 2 ---------------------------------------------------------------------------------------------------------
CENTRES = 25.0 * 2 ** (np.arange(0, 28) / 3.0)  # 1/3 octave, 25 Hz .. ~16 kHz


def third_octave_db(x, r):
    f, p = welch(x, fs=r, nperseg=16384, axis=0)
    p = p.mean(axis=1)
    out = []
    for c in CENTRES:
        lo, hi = c / 2 ** (1 / 6), c * 2 ** (1 / 6)
        sel = (f >= lo) & (f < hi)
        out.append(10 * np.log10(p[sel].mean() + 1e-20) if sel.any() else -200.0)
    out = np.array(out)
    ref = out[(CENTRES >= 200) & (CENTRES <= 5000)].mean()
    return out - ref  # the SHAPE, level removed


def album_curve(album_dir, r_expect):
    cache = os.path.join(album_dir, ".album-curve.npz")
    files = sorted(f for f in os.listdir(album_dir) if f.lower().endswith(".wav"))
    if os.path.exists(cache):
        z = np.load(cache, allow_pickle=True)
        if list(z["files"]) == files:
            return z["mean"], dict(zip(z["files"], z["curves"]))
    curves = {}
    for f in files:
        a, ra = sf.read(os.path.join(album_dir, f), dtype="float64", always_2d=True)
        curves[f] = third_octave_db(a, ra)
        print(f"  album spectrum {f}", file=sys.stderr)
    mean = np.mean(list(curves.values()), axis=0)
    np.savez(cache, files=np.array(files), mean=mean, curves=np.array(list(curves.values())))
    return mean, curves


def t_tonal_eq(x, r, ctx):
    mean, curves = ctx["album"]
    me = curves[ctx["name"]]
    dev = me - mean  # + = this song has more than the album at that band
    corr = np.clip(-0.5 * dev, -1.5, 0.75)
    corr[CENTRES < 30] = 0.0
    taper = np.clip((12000.0 - CENTRES) / 2000.0, 0.0, 1.0)  # fade to nothing between 10 and 12 kHz
    corr *= taper
    # a smooth curve on a fine grid (log-frequency Gaussian, 1/3 octave), then a long symmetric FIR
    fgrid = np.geomspace(20.0, r / 2 * 0.999, 2048)
    cdb = np.interp(np.log(fgrid), np.log(CENTRES), corr, left=0.0, right=0.0)
    k = np.exp(-0.5 * (np.log2(fgrid)[:, None] - np.log2(fgrid)[None, :]) ** 2 / (1 / 3.0) ** 2)
    cdb = (k @ cdb) / k.sum(axis=1)
    freq = np.concatenate([[0.0], fgrid / (r / 2), [1.0]])
    gain = np.concatenate([[1.0], 10 ** (cdb / 20), [10 ** (cdb[-1] / 20)]])
    h = firwin2(16385, freq, gain, window="hann")  # odd length, symmetric: linear phase, delay 8192 removed by 'same'
    y = np.stack([fftconvolve(x[:, c], h, mode="same") for c in range(x.shape[1])], axis=1)
    y, g, note = to_target(y, r)
    top = ", ".join(f"{int(c)} Hz {v:+.1f}" for c, v in zip(CENTRES, corr) if abs(v) >= 0.4)
    return y, f"linear-phase FIR, 16385 taps. Moves: {top or 'nothing over 0.4 dB'}. Then +{g:.2f} dB. {note}".strip()


# ---- 3 ---------------------------------------------------------------------------------------------------------
def t_matchering(x, r, ctx):
    import matchering as mg

    mean, curves = ctx["album"]
    others = {k: v for k, v in curves.items() if k != ctx["name"]}
    ref = min(others, key=lambda k: float(np.sum((others[k] - mean) ** 2)))
    out = os.path.join(ctx["out"], "_matchering.wav")
    cfg = mg.Config(internal_sample_rate=r, threshold=0.99, max_length=60 * 60)
    mg.process(target=ctx["src"], reference=os.path.join(ctx["album_dir"], ref), results=[mg.pcm24(out)], config=cfg)
    y, _ = sf.read(out, dtype="float64", always_2d=True)
    os.remove(out)
    return y, f"Matchering 2.0.6 vs '{os.path.splitext(ref)[0]}' (the album track closest to the album's average spectrum), as it delivers (its own RMS match and limiter; no further gain)"


# ---- 4 ---------------------------------------------------------------------------------------------------------
def t_gentle_dyn(x, r, ctx, ratio=1.4, atk_ms=80.0, rel_ms=400.0, max_gr=2.0):
    hop = r // 1000
    p = np.mean(x ** 2, axis=1)
    n = len(p) // hop
    pf = p[: n * hop].reshape(n, hop).mean(axis=1)
    aa, ar = np.exp(-1.0 / atk_ms), np.exp(-1.0 / rel_ms)
    env = np.empty(n)
    e = pf[0]
    for i in range(n):
        c = aa if pf[i] > e else ar
        e = c * e + (1 - c) * pf[i]
        env[i] = e
    env_db = 10 * np.log10(env + 1e-12)
    thr = float(np.percentile(env_db, 70))
    gr = np.minimum((1 - 1 / ratio) * np.maximum(0.0, env_db - thr), max_gr)
    gr = np.convolve(gr, np.ones(50) / 50, mode="same")  # 50 ms
    g = np.interp(np.arange(len(p)), (np.arange(n) + 0.5) * hop, 10 ** (-gr / 20))
    y, gm, note = to_target(x * g[:, None], r)
    return y, f"gain riding only, no filter: 1.4:1 above the 70th-percentile level, max reduction {gr.max():.2f} dB (mean {gr.mean():.2f}); then +{gm:.2f} dB. {note}".strip()


# ---- 5 ---------------------------------------------------------------------------------------------------------
def t_apollo(x, r, ctx):
    apollo = os.path.abspath(os.path.join(ctx["root"], "apollo"))
    a_in, a_out = os.path.join(ctx["out"], "_apollo_in.wav"), os.path.join(ctx["out"], "_apollo_out.wav")
    sf.write(a_in, resample_poly(x, 147, 160, axis=0).astype(np.float32), 44100, subtype="FLOAT")
    t0 = time.time()
    cmd = [sys.executable, "inference.py", "--in_wav", a_in, "--out_wav", a_out, "--device=auto", "--chunk-seconds=6", "--overlap-seconds=1", "--chunk-pad-seconds=1"]
    res = subprocess.run(cmd, cwd=apollo, capture_output=True, text=True)
    if res.returncode != 0 or not os.path.exists(a_out):
        raise RuntimeError("apollo failed: " + (res.stderr or res.stdout)[-600:])
    z, rz = sf.read(a_out, dtype="float64", always_2d=True)
    back = resample_poly(z, 160, 147, axis=0)[: x.shape[0]]
    if back.shape[0] < x.shape[0]:
        back = np.pad(back, ((0, x.shape[0] - back.shape[0]), (0, 0)))
    for p in (a_in, a_out):
        os.remove(p)
    y, g, note = to_target(back, r)
    return y, f"Apollo (JusperLee, MP3-damage restoration) via 44.1 kHz, 6 s chunks, {time.time() - t0:.0f} s; then +{g:.2f} dB. {note}".strip()


TECHNIQUES = {1: ("gain", t_gain), 2: ("tonal-eq", t_tonal_eq), 3: ("matchering", t_matchering), 4: ("gentle-dyn", t_gentle_dyn), 5: ("apollo", t_apollo)}


def main():
    src, album_dir, out = sys.argv[1:4]
    only = {int(v) for v in sys.argv[sys.argv.index("--only") + 1].split(",")} if "--only" in sys.argv else set(TECHNIQUES)
    out = os.path.abspath(out)
    os.makedirs(out, exist_ok=True)
    x, r = sf.read(src, dtype="float64", always_2d=True)
    name = os.path.basename(src)
    ctx = {"name": name, "src": os.path.abspath(src), "album_dir": album_dir, "out": out, "root": os.path.dirname(out)}
    ctx["album"] = album_curve(album_dir, r)
    stem = os.path.splitext(name)[0]
    bundle = "--bundle" in sys.argv  # copy the original and the old uni-1 in, so the folder plays on its own
    orig_file = os.path.join(out, f"{os.path.splitext(name)[0]}.0-original.wav") if bundle else os.path.abspath(src)
    if bundle and not os.path.exists(orig_file):
        shutil.copyfile(src, orig_file)
    items = [{"label": "original", "file": orig_file, "lufs": lufs(x, r), "tp": metrics.true_peak_db(x, r), "lra": round(metrics.lra(x, r), 1), "note": "Stay Here.wav as delivered", "m": None}]
    results = {}
    for k, (tname, fn) in TECHNIQUES.items():
        path = os.path.join(out, f"{stem}.{k}-{tname}.wav")
        if k in only:
            t0 = time.time()
            try:
                y, note = fn(x, r, ctx)
            except Exception as e:  # a failed technique is a row, not a crash
                print(f"[{k} {tname}] FAILED {e}", file=sys.stderr)
                results[tname] = {"error": str(e)}
                continue
            sf.write(path, np.clip(y, -1.0, 1.0), r, subtype="PCM_24")
            results[tname] = {"note": note, "sec": round(time.time() - t0, 1)}
            print(f"[{k} {tname}] {note} ({time.time() - t0:.0f} s)", file=sys.stderr)
        if not os.path.exists(path):
            continue
        m = metrics.compare(src, path)
        results.setdefault(tname, {})["m"] = m
        items.append({"label": f"{k} {tname}", "file": path, "lufs": m["lufs"], "tp": m["tp"], "lra": m["lra"], "note": results[tname].get("note", ""), "m": m})
    old = os.path.join(ctx["root"], "..", "master-trials", "2026-11-16-compare", f"{stem}.uni-1.wav")
    bundled_old = os.path.join(out, f"{stem}.old-uni-1.wav")
    if os.path.exists(bundled_old):
        old = bundled_old
    if os.path.exists(old):
        m = metrics.compare(src, old)
        if bundle and old != bundled_old:
            shutil.copyfile(old, bundled_old)
            old = bundled_old
        items.append({"label": "old uni-1", "file": os.path.abspath(old), "lufs": m["lufs"], "tp": m["tp"], "lra": m["lra"], "note": "the chain the owner heard as degrading", "m": m})
        results["old uni-1"] = {"m": m}
    json.dump(results, open(os.path.join(out, "results.json"), "w"), indent=1)
    listen.page(f"{stem}: five remaster techniques vs the original", items, os.path.join(out, "listen.html"))
    print(f"listen.html -> {os.path.join(out, 'listen.html')}")


if __name__ == "__main__":
    main()
