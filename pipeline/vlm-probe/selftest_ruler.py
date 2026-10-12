"""Stdlib-only pins for the ruler package: fixture embeddings, no torch, no GPU.
    python pipeline/vlm-probe/selftest_ruler.py
"""

import io
import json
import math
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from ruler import api, serve as serve_mod  # noqa: E402
from ruler.calibrate import build_scale  # noqa: E402

fails = []


def check(name, got, want):
    if got != want:
        fails.append(name)
        print(f"FAIL {name}: got {got!r}, want {want!r}")
    else:
        print(f"ok   {name}")


REVS = {"facenet": "vggface2@2.6", "dinov2": "dinov2-base@aaa", "detr": "detr-resnet-50@bbb"}
SCALE = {"version": 3, "anchors": [], "models": REVS, "MIN_FACE_PX": 80,
         "rungs": {"within": 0.2, "floor": 0.4, "ceil": 0.7, "look_floor": 0.5},
         "separation": 0.3, "blind": None, "calibratedAt": "2026-10-11T00:00:00+00:00"}


class Fake:
    """Embeddings are angles; distance = 1 - cos(delta)."""
    def __init__(self, table, revs=REVS):
        self.table, self.revs, self.loads, self._ready = table, revs, 0, False

    def revisions(self):
        return dict(self.revs)

    def embed(self, path):
        if not self._ready:
            self.loads += 1
            self._ready = True
        face_angle, size, look = self.table[path]
        return {"face": face_angle, "faceSizePx": size, "look": look}

    def distance(self, a, b):
        return 1 - math.cos(a - b)


def ang(d):
    return math.acos(1 - d)  # angle whose cosine distance from 0 is d


def write(s):
    d = Path(tempfile.mkdtemp()) / "scale-v3.json"
    d.write_text(json.dumps(s), encoding="utf-8")
    return d


# 1. model revision mismatch names both revisions
try:
    api.load_scale(write(SCALE), backend=Fake({}, {**REVS, "facenet": "vggface2@9.9"}))
    check("mismatch raises", "no raise", "RulerMismatch")
except api.RulerMismatch as e:
    check("mismatch names both revisions", "vggface2@2.6" in str(e) and "vggface2@9.9" in str(e), True)
check("matching revisions load", api.load_scale(write(SCALE), backend=Fake({}))["version"], 3)

# 2. inverted / blind scale is refused
inv = {**SCALE, "rungs": {**SCALE["rungs"], "ceil": 0.3, "floor": 0.4}}
try:
    api.load_scale(write(inv))
    check("inverted raises", "no raise", "RulerBlind")
except api.RulerBlind as e:
    check("inversion reason", "inverted" in str(e), True)
try:
    api.load_scale(write({**SCALE, "blind": "no face"}))
    check("blind raises", "no raise", "RulerBlind")
except api.RulerBlind:
    check("blind marker refused", True, True)

# 3. small face is unscored, never a number; rungs for the rest
T = {"a": (0.0, 200, 0.0), "tiny": (0.1, 40, 0.0), "near": (ang(0.1), 200, 0.0),
     "mid": (ang(0.3), 200, 0.0), "far": (ang(0.5), 200, 0.0), "diff": (ang(0.9), 200, 0.0),
     "none": (None, None, 0.0)}
f = Fake(T)


def one(b):
    return api.score_pairs(["a", b], scale=SCALE, backend=f)[0]


v = one("tiny")
check("40px face unscored", (v.rung, v.reason, v.identity, v.faceSizePx),
      ("unscored", "face below MIN_FACE_PX", None, 40))
check("no face unscored", (one("none").rung, one("none").reason), ("unscored", "no face detected"))
check("rungs", [one(n).rung for n in ("near", "mid", "far", "diff")],
      ["within", "floor", "looser", "different"])
check("scaleVersion stamped", one("near").scaleVersion, 3)
vs = api.score_pairs(["a", "near", "diff", "tiny"], scale=SCALE, backend=f)
check("worst pair", (api.worst_pair(vs).a, api.worst_pair(vs).b), ("a", "diff"))
check("worst pair none", api.worst_pair(api.score_pairs(["a", "tiny"], scale=SCALE, backend=f)), None)

# 4. resident worker loads models once
g = Fake(T)
out = io.StringIO()
reqs = '{"id":1,"paths":["a","near"]}\nnot json\n{"id":2,"paths":["a","diff"]}\n'
serve_mod.serve(io.StringIO(reqs), out, scale=SCALE, backend=g)
resp = [json.loads(x) for x in out.getvalue().splitlines()]
check("worker answered all lines", [r.get("id") for r in resp], [1, None, 2])
check("worker survives bad line", "error" in resp[1], True)
check("worker rungs", [resp[0]["verdicts"][0]["rung"], resp[2]["verdicts"][0]["rung"]],
      ["within", "different"])
check("models loaded once across requests", g.loads, 1)

# calibrate.build_scale is pure and records blindness instead of hiding it
rows = [("within", "x", "y", 0.1, 0.1, ""), ("floor", "x", "y", 0.3, 0.4, ""),
        ("hard-ceil", "x", "y", 0.6, 0.2, "")]
sc = build_scale(rows, 1, [], REVS, "t")
check("build_scale rungs", sc["rungs"], {"within": 0.1, "floor": 0.3, "ceil": 0.6, "look_floor": 0.4})
check("build_scale separation", (sc["separation"], sc["blind"]), (0.3, None))
bad = build_scale([("floor", "x", "y", 0.5, 0.1, ""), ("hard-ceil", "x", "y", 0.4, 0.1, "")], 1, [], REVS, "t")
check("build_scale records blindness", bad["blind"] is not None, True)

print("FAILED: " + ", ".join(fails) if fails else "all ruler checks passed")
sys.exit(1 if fails else 0)
