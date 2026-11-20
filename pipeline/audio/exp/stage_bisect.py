"""Bisect the old uni chain on ONE song: which stage moves the level, adds HF, or changes the image?

Each row applies ONE stage of master.py's uni-1 / master_wide.py's uni-3 chain to the original, level-matches,
and reports wobble_db (0 = a pure gain change), null_db and hf_db from metrics.py. Nothing is written but a
JSON and the stage WAVs (so the suspect can be listened to alone).

    python pipeline/audio/exp/stage_bisect.py <song.wav> <out dir>
"""

import json
import os
import sys

import numpy as np
import pedalboard as pb
import soundfile as sf

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import loudness  # noqa: E402
import master  # noqa: E402
import master_wide  # noqa: E402
import metrics  # noqa: E402

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
x, rate = sf.read(src, dtype="float32", always_2d=True)
u1 = master.RECIPES["uni-1"]
u3 = master.RECIPES["uni-3"]


def board(plugins):
    def f(y):
        return np.ascontiguousarray(pb.Pedalboard(plugins)(np.ascontiguousarray(y.T), rate).T, dtype=np.float32)

    return f


def limit_to(y, target=-14.0):
    row = dict(u1)
    row["targetLufs"] = target
    z, _g, deep, _p = master.loudness_and_limit(y, rate, row)
    return z


def gain_only(y, target=-14.0):
    return y * np.float32(10 ** ((target - loudness.integrated_lufs(y, rate)) / 20))


stages = {
    "01 linear gain only": lambda y: gain_only(y),
    "02 uni-1 high-pass 30 Hz": lambda y: gain_only(board([pb.HighpassFilter(30.0)])(y)),
    "03 uni-1 tilt shelves": lambda y: gain_only(board([pb.LowShelfFilter(100.0, 0.5, 0.707), pb.HighShelfFilter(10000.0, 0.75, 0.707)])(y)),
    "04 uni-1 glue compressor (-20 dB 2:1 at -18 LUFS ref)": lambda y: gain_only(board([pb.Compressor(-20.0, 2.0, 30.0, 250.0)])(y * np.float32(10 ** ((-18 - loudness.integrated_lufs(y, rate)) / 20)))),
    "05 limiter only (custom 50 ms, to -14 LUFS)": lambda y: limit_to(y),
    "06 uni-1 whole chain": lambda y: master.loudness_and_limit(master.pre_chain(y, rate, u1), rate, u1)[0],
    "07 uni-3 mid/side only": lambda y: gain_only(master_wide._mid_side(y, rate, u3)),
    "08 uni-3 multiband only": lambda y: gain_only(master_wide._multiband(y * np.float32(10 ** ((-18 - loudness.integrated_lufs(y, rate)) / 20)), rate, u3)),
    "09 uni-3 exciter only": lambda y: gain_only(master_wide._excite(y, rate, u3)),
}

res = {}
for name, fn in stages.items():
    y = fn(x)
    p = os.path.join(out, name.split(" ")[0] + ".wav")
    sf.write(p, np.clip(y, -1.0, 1.0), rate, subtype="PCM_24")
    m = metrics.compare(src, p, roundtrip=False)
    res[name] = {k: m[k] for k in ("lufs", "tp", "wobble_db", "null_db", "hf_db", "width_db", "corr_std")}
    r = res[name]
    print(f"{name:58s} wobble {r['wobble_db']:6.3f} dB | null {r['null_db']:6.1f} dB | 12-22k {r['hf_db']:+6.2f} | width {r['width_db']:+5.2f} | TP {r['tp']:+.2f}")
json.dump(res, open(os.path.join(out, "bisect.json"), "w"), indent=1)
