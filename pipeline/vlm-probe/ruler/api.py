"""Public scoring API of the identity ruler.

The calibration lives in a committed `scale-v<n>.json` (numbers and digests, no
pixels), so scoring needs neither the gitignored film stills nor a recalibration.
Import is stdlib-only: torch / PIL / facenet are reached only through a Backend,
and the real one loads them lazily, so the decisions here are pinned by
selftest_ruler.py without a GPU.

A Backend provides:
    revisions() -> {"facenet": str, "dinov2": str, "detr": str}
    embed(path) -> {"face": vec|None, "faceSizePx": int|None, "look": vec}
    distance(a, b) -> float          (cosine distance)
"""

import itertools
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Optional

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parent))
import identity as _idn  # noqa: E402  (stdlib-only at import time)

MIN_FACE_PX = _idn.MIN_FACE_PX
RUNGS = ("within", "floor", "looser", "different", "unscored")


class RulerError(Exception):
    pass


class RulerMismatch(RulerError):
    """The installed model weights are not the ones the scale was calibrated on."""


class RulerBlind(RulerError):
    """The scale cannot back a verdict (inverted, or no usable floor/ceiling)."""


@dataclass
class Verdict:
    a: str
    b: str
    identity: Optional[float]
    look: float
    rung: str
    reason: str
    faceSizePx: Optional[int]
    scaleVersion: int

    def to_dict(self):
        return asdict(self)


def latest_scale_path(directory=None):
    d = Path(directory) if directory else HERE
    found = []
    for p in d.glob("scale-v*.json"):
        m = re.fullmatch(r"scale-v(\d+)\.json", p.name)
        if m:
            found.append((int(m.group(1)), p))
    if not found:
        raise RulerError(f"no scale-v<n>.json under {d} -- run calibrate.py on the rig")
    return max(found)[1]


def load_scale(path=None, backend=None):
    """Read and validate a scale. Refuses when blind, inverted, or when `backend`
    reports model revisions that differ from the ones it was calibrated on."""
    p = Path(path) if path else latest_scale_path()
    s = json.loads(p.read_text(encoding="utf-8"))
    rungs = s["rungs"]
    if s.get("blind"):
        raise RulerBlind(f"scale v{s['version']} is marked blind: {s['blind']}")
    why = _idn.ruler_blindness({"id_floor": rungs.get("floor"), "id_ceil": rungs.get("ceil")})
    if why:
        raise RulerBlind(why)
    if backend is not None:
        have = backend.revisions()
        for k, want in s["models"].items():
            if have.get(k) != want:
                raise RulerMismatch(
                    f"{k}: scale v{s['version']} was calibrated on {want!r}, installed is {have.get(k)!r}")
    return s


def rung_for(idn, s):
    """(rung, reason) for an identity distance against a scale's rungs."""
    r = s["rungs"]
    if idn >= r["ceil"]:
        return "different", "reads as a different person"
    if r.get("within") is not None and idn <= r["within"]:
        return "within", "as tight as one continuous take"
    if idn <= r["floor"]:
        return "floor", "same person, as tight as real film"
    return "looser", "same person, looser than real film"


def score_pair(a, b, ea, eb, s, backend):
    look = round(backend.distance(ea["look"], eb["look"]), 4)
    sizes = [x["faceSizePx"] for x in (ea, eb) if x.get("faceSizePx") is not None]
    size = min(sizes) if sizes else None
    floor_px = s.get("MIN_FACE_PX", MIN_FACE_PX)
    if ea["face"] is None or eb["face"] is None or any(x < floor_px for x in sizes):
        small = size is not None and size < floor_px
        return Verdict(a, b, None, look, "unscored",
                       "face below MIN_FACE_PX" if small else "no face detected",
                       size, s["version"])
    idn = round(backend.distance(ea["face"], eb["face"]), 4)
    rung, reason = rung_for(idn, s)
    return Verdict(a, b, idn, look, rung, reason, size, s["version"])


def score_pairs(paths, scale=None, backend=None):
    """Every pair of `paths` (in order), as Verdicts. Each path is embedded once."""
    backend = backend or default_backend()
    s = scale or load_scale(backend=backend)
    names = [str(p) for p in paths]
    emb = {n: backend.embed(n) for n in names}
    return [score_pair(a, b, emb[a], emb[b], s, backend)
            for a, b in itertools.combinations(names, 2)]


def worst_pair(verdicts):
    """The scored verdict with the largest identity distance, or None."""
    scored = [v for v in verdicts if v.identity is not None]
    return max(scored, key=lambda v: v.identity) if scored else None


def default_backend():
    from ruler.backend import TorchBackend
    return TorchBackend()
