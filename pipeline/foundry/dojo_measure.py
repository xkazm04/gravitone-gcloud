"""Measured pre-filters for dojo pairs -- numbers the readback cannot give.

    python dojo_measure.py lower-third foundry-out/training/<cycle-id>
        edge density (fraction of Sobel-edge pixels above a fixed threshold) in
        the lower third of every arm, and the challenger-minus-baseline delta
        per pair. For text-zone claims: less edge = emptier zone.
    python dojo_measure.py face-state foundry-out/training/<cycle-id>
        what the subject's FACE is doing, per arm -- the one question the craft
        enum schema (camera/lighting/composition) and DEEP-READ-PROMPT.md
        (medium/palette/black/light/edges) both lack, and the question
        `reference-shows-only-invariants` says no identity embedding will ever
        raise. Each pair in gen-spec.json carries a pre-registered
        `state_expect` naming the values that COUNT as the briefed state
        landing; the measure reports per arm whether it landed, so the
        coupling probe's three branches (briefed state appears / only the
        non-extremes appear / the reference's state comes back every time)
        are read off a table instead of an impression.
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


# -- face-state: the performer channel -------------------------------------
# The craft schema describes the FRAME (camera, lighting, composition) and the
# deep read describes the STYLE (medium, palette, black, light, edges). Neither
# has a field for the performer, so a state freeze walks straight through both
# -- exactly the blindness `reference-shows-only-invariants` predicts. Closed
# enums, not prose: the probe's outcome is a count of landings, and prose
# cannot be counted without a second judge in the loop.
FACE_FIELDS = {
    "mouth": ["wide-open-smile", "closed-smile", "neutral-closed", "pressed-flat",
              "open-slack", "open-shouting", "not-visible"],
    "eyes": ["wide-whites-showing", "narrowed-creased", "neutral-open", "lids-low",
             "closed", "in-shadow", "not-visible"],
    "brows": ["raised-together", "raised-apart", "neutral", "lowered-level", "not-visible"],
    "gaze": ["to-camera", "off-camera-left", "off-camera-right", "down", "up", "not-visible"],
    "face_light": ["front-lit", "side-lit", "rim-only-face-in-shadow", "flat", "not-visible"],
}

FACE_PROMPT = (
    "Look only at the SUBJECT'S FACE in this image and report what it is doing. "
    "Do not describe the camera, the setting, the palette or the mood. "
    "If the face is too small, turned away or too dark to judge a field, answer "
    "'not-visible' for that field rather than guessing. "
    "Then give `read`: at most five plain words naming the expression as a person "
    "would say it (for example 'grinning', 'startled', 'jaw set, furious', "
    "'blank, looking away')."
)


def face_schema():
    props = {k: {"type": "string", "enum": v} for k, v in FACE_FIELDS.items()}
    props["read"] = {"type": "string"}
    return {"type": "object", "properties": props,
            "required": list(props), "additionalProperties": False}


def read_face(model, b64):
    sys.path.insert(0, str(ROOT / "pipeline" / "vlm-probe"))
    from probe import post, OLLAMA  # noqa: E402
    body = {"model": model,
            "messages": [{"role": "user", "content": FACE_PROMPT, "images": [b64]}],
            "format": face_schema(), "stream": False,
            "options": {"temperature": 0, "num_ctx": 8192}}
    try:
        r = post(f"{OLLAMA}/api/chat", dict(body, think=False))
    except Exception:
        r = post(f"{OLLAMA}/api/chat", body)
    return json.loads(r["message"]["content"])


def _landed(obs, expect):
    """The briefed state landed iff EVERY pre-registered field matches one of
    its allowed values. A field the grader could not see is not a match --
    `unmeasured-is-not-pass` applies to the instrument too."""
    return all(obs.get(f) in vals for f, vals in expect.items())


def face_state(cdir):
    import base64
    spec = json.loads((cdir / "gen-spec.json").read_text(encoding="utf-8"))
    model = spec.get("annotator", "qwen3.8:27b")
    sys.path.insert(0, str(ROOT / "pipeline" / "vlm-probe"))
    import guard  # noqa: E402
    guard.require_model(model, vram_gb=20, ram_gb=guard.RAM_FLOOR_GB, free=["comfy"], verbose=False)
    out, tally = {}, {arm: [0, 0] for arm in ARMS}
    print(f"{'pair':26s} {'arm':11s} {'landed':>7s}  read")
    for p in spec["pairs"]:
        pid, expect = p["id"], p.get("state_expect") or {}
        row = {"expect": expect}
        for arm in ARMS:
            f = cdir / "pairs" / f"{pid}--{arm}.png"
            if not f.exists():
                row[arm] = None
                continue
            b64 = base64.b64encode(f.read_bytes()).decode("ascii")
            try:
                obs = read_face(model, b64)
            except Exception as e:
                row[arm] = {"error": str(e)[:200]}
                print(f"{pid:26s} {arm:11s} {'ERR':>7s}  {str(e)[:60]}")
                continue
            ok = _landed(obs, expect) if expect else None
            obs["landed"] = ok
            row[arm] = obs
            if ok is not None:
                tally[arm][1] += 1
                tally[arm][0] += bool(ok)
            print(f"{pid:26s} {arm:11s} {str(ok):>7s}  {obs.get('read','')[:44]}")
        out[pid] = row
    print()
    for arm in ARMS:
        hit, n = tally[arm]
        if n:
            print(f"  {arm:11s} briefed state landed {hit}/{n}")
    return {"measure": "face-state", "fields": FACE_FIELDS,
            "landings": {a: {"hit": tally[a][0], "of": tally[a][1]} for a in ARMS},
            "pairs": out}


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
    elif cmd == "face-state":
        res = face_state(cdir)
    elif cmd == "identity":
        res = identity(cdir, Path(sys.argv[3]))
    elif cmd == "motion":
        res = motion(cdir)
    else:
        raise SystemExit("usage: dojo_measure.py lower-third|face-state|identity|motion <cycle-dir> [hero]")
    # Keyed by measure name, not overwritten: a cycle may need more than one
    # (state-coupling reads face-state AND identity -- what the state cost).
    mpath = cdir / "measures.json"
    prev = json.loads(mpath.read_text(encoding="utf-8")) if mpath.exists() else {}
    if "measure" in prev:                       # pre-merge single-measure file
        prev = {prev["measure"]: prev}
    prev[res["measure"]] = res
    mpath.write_text(json.dumps(prev, indent=1), encoding="utf-8")
