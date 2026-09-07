"""Measured pre-filters for dojo pairs -- numbers the readback cannot give.

    python dojo_measure.py lower-third foundry-out/training/<cycle-id>
        edge density (fraction of Sobel-edge pixels above a fixed threshold) in
        the lower third of every arm, and the challenger-minus-baseline delta
        per pair. For text-zone claims: less edge = emptier zone.
    python dojo_measure.py identity foundry-out/training/<cycle-id> <hero.png>
        FaceNet distance of every arm's face to the hero, on the calibrated
        ruler from pipeline/vlm-probe/identity.py (floor / ceiling printed so
        the number has a scale under it). A face the detector cannot find is
        reported as such, never as a distance.
    python dojo_measure.py motion foundry-out/training/<cycle-id>
        motion energy of every arm's CLIP (mean consecutive-frame luma
        delta, see motion_energy.py) and the challenger-minus-baseline delta
        per pair, with a frozen verdict against a measured floor. For
        stillness claims: a directed near-still and a dead render look the
        same across three posters and differ here by two orders of magnitude.

All write <cycle>/measures.json and print a per-pair table. They are
PRE-FILTERS: the judge reads them beside the readbacks, the human's pick is
still the verdict.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).parent
ROOT = HERE.parent.parent
ARMS = ("baseline", "challenger")


def _pairs(cdir):
    spec = json.loads((cdir / "gen-spec.json").read_text(encoding="utf-8"))
    return [p["id"] for p in spec["pairs"]]


def edge_density(path, band=(2 / 3, 1.0), thresh=24.0):
    im = np.asarray(Image.open(path).convert("L"), dtype=np.float32)
    h = im.shape[0]
    zone = im[int(h * band[0]):int(h * band[1]), :]
    gx = np.abs(np.diff(zone, axis=1))[:-1, :]
    gy = np.abs(np.diff(zone, axis=0))[:, :-1]
    mag = np.hypot(gx, gy)
    return float((mag > thresh).mean())


def lower_third(cdir):
    out = {}
    print(f"{'pair':30s} {'baseline':>9s} {'challenger':>11s} {'delta':>8s}")
    for pid in _pairs(cdir):
        row = {}
        for arm in ARMS:
            f = cdir / "pairs" / f"{pid}--{arm}.png"
            row[arm] = edge_density(f) if f.exists() else None
        if None in row.values():
            print(f"{pid:30s} incomplete duo")
            continue
        row["delta"] = row["challenger"] - row["baseline"]
        out[pid] = row
        print(f"{pid:30s} {row['baseline']:9.4f} {row['challenger']:11.4f} {row['delta']:+8.4f}")
    return {"measure": "lower-third-edge-density", "pairs": out}


def identity(cdir, hero):
    sys.path.insert(0, str(ROOT / "pipeline" / "vlm-probe"))
    import identity as idn  # noqa: E402
    gone = idn.missing_anchors()
    if gone:
        raise SystemExit(f"ruler cannot calibrate: {len(gone)} anchors missing")
    A = idn.vecs_for({k: str(idn.FRAMES / v) for k, v in idn.ANCHORS.items()})
    s = idn.scale_from(idn.pair_rows(idn.ANCHOR_PAIRS, A))
    blind = idn.ruler_blindness(s)
    if blind:
        raise SystemExit(f"ruler is blind: {blind}")
    print(f"ruler: within {s['id_within']}  floor {s['id_floor']}  ceiling {s['id_ceil']}")
    hv, _ = idn.face_vec(str(hero))
    if hv is None:
        raise SystemExit("no face in the hero reference")
    out = {"ruler": s}
    print(f"{'pair':30s} {'baseline':>9s} {'challenger':>11s} {'delta':>8s}")
    for pid in _pairs(cdir):
        row = {}
        for arm in ARMS:
            f = cdir / "pairs" / f"{pid}--{arm}.png"
            if not f.exists():
                row[arm] = None
                continue
            fv, conf = idn.face_vec(str(f))
            row[arm] = None if fv is None else float(idn.cos(hv, fv))
            row[arm + "_face_conf"] = conf
            row[arm + "_verdict"] = idn.verdict(row[arm], 0.0, {**s, "look_floor": None})
        out[pid] = row
        b, c = row["baseline"], row["challenger"]
        if b is None or c is None:
            print(f"{pid:30s} {'no face' if b is None else f'{b:9.4f}':>9s} {'no face' if c is None else f'{c:11.4f}':>11s}")
        else:
            row["delta"] = c - b
            print(f"{pid:30s} {b:9.4f} {c:11.4f} {c - b:+8.4f}")
    return {"measure": "identity-to-hero", **out}


def motion(cdir):
    """Frozen is a number, not a poster impression. The judge reads three
    stills; this reads every frame. See motion_energy.py for the calibration
    (the 2026-08-31 v1-reset-still clip the judge called frozen sat at 0.21
    against a 0.000 floor)."""
    sys.path.insert(0, str(HERE))
    import motion_energy as me  # noqa: E402
    out = {}
    print(f"{'pair':30s} {'baseline':>9s} {'challenger':>11s} {'delta':>8s}   (frozen at <= {me.FROZEN_MAX})")
    for pid in _pairs(cdir):
        row = {}
        for arm in ARMS:
            f = cdir / "pairs" / f"{pid}--{arm}.webm"
            row[arm] = me.summarize(me.yavg_series(f)) if f.exists() else None
        if None in row.values():
            print(f"{pid:30s} incomplete duo")
            continue
        b, c = row["baseline"]["mean"], row["challenger"]["mean"]
        row["delta"] = c - b
        out[pid] = row
        flags = " ".join(f"{arm}=FROZEN" for arm in ARMS if row[arm]["frozen"])
        print(f"{pid:30s} {b:9.3f} {c:11.3f} {c - b:+8.3f}   {flags}")
    return {"measure": "motion-energy", "frozen_max": me.FROZEN_MAX, "pairs": out}


if __name__ == "__main__":
    cmd, cdir = sys.argv[1], Path(sys.argv[2])
    if not cdir.is_absolute():
        cdir = ROOT / cdir
    if cmd == "lower-third":
        res = lower_third(cdir)
    elif cmd == "identity":
        res = identity(cdir, Path(sys.argv[3]))
    elif cmd == "motion":
        res = motion(cdir)
    else:
        raise SystemExit("usage: dojo_measure.py lower-third|identity|motion <cycle-dir> [hero]")
    (cdir / "measures.json").write_text(json.dumps(res, indent=1), encoding="utf-8")
