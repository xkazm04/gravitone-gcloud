"""Labelled shot clauses, and the truth sidecars they mint.

The consistency lanes dictate shot size, angle and focus for every render in
prose. This module keeps those dictations as LABELS: for each shot, the schema
value and the exact phrase of the clause that asked for it. The clause itself
is never compiled from the labels. The same value is written differently in
different clauses ("Low camera near the floor", "low angle looking up"), and a
recompiled clause moves the pixels under the fixed seed.

A phrase that sits between two schema values is CONTESTED: it is kept with its
candidates and lands under `_ungraded` in the sidecar instead of being guessed.
A human settles it before anything is scored against it.

A sidecar is a request, not a truth. It is written with basis "dictated";
score.py grades only "dictated+confirmed" (a blind pass confirmed the render
obeyed), and counts "dictated-disputed" as generator disobedience, not as
annotator error. Its `spec_digest` pins the labels it was written under, so a
later relabel cannot silently re-grade an old render.

Stdlib only: score.py reads the current labels from here without importing the
render module (guard, urllib).
"""

import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from schema import ENUM_FIELDS, FIELDS  # noqa: E402

SEP = "--"  # truth_id = <lane-dir>--<shot>; a shot frame is named truth_id + ".png"


def graded(value, phrase):
    return {"value": value, "phrase": phrase}


def contested(phrase, *candidates):
    return {"value": None, "phrase": phrase, "candidates": list(candidates)}


def _check(field, value):
    if field not in ENUM_FIELDS:
        raise ValueError(f"{field!r} is not an enum field of schema.FIELDS")
    if value not in FIELDS[field]["enum"]:
        raise ValueError(f"{field}={value!r} is not in schema vocabulary {FIELDS[field]['enum']}")


def validate(spec):
    """Every label must be a schema enum value. Takes plain {field: value} or a
    labelled spec ({field: graded(...) | contested(...)})."""
    for field, entry in spec.items():
        if isinstance(entry, dict):
            if entry.get("value") is None:
                cands = entry.get("candidates") or []
                if len(cands) < 2:
                    raise ValueError(f"{field}: a contested label needs two candidates")
                for c in cands:
                    _check(field, c)
            else:
                _check(field, entry["value"])
        else:
            _check(field, entry)
    return spec


def digest(spec):
    return hashlib.sha256(json.dumps(spec, sort_keys=True, ensure_ascii=False)
                          .encode("utf-8")).hexdigest()


def truth_id(lane_dir, shot):
    if SEP in shot:
        raise ValueError(f"shot name {shot!r} contains {SEP!r}")
    return f"{lane_dir}{SEP}{shot}"


def split_truth_id(tid):
    """(lane_dir, shot), or None for a name that is not lane-qualified."""
    if SEP not in tid:
        return None
    lane, shot = tid.rsplit(SEP, 1)
    return (lane, shot) if lane and shot else None


# The labels, keyed by spec set and shot name. consistency.SHOTS_SPEC and
# ZOOM_SPEC pair each with its clause; every phrase must be a substring of it.
LABELS = {
    "shots": {
        "01-wide": {
            "shot_size": graded("extreme-wide", "Extreme wide shot"),
            "camera_angle": graded("low-angle", "Low camera near the floor"),
            "depth_of_field": graded("deep", "Deep focus"),
        },
        "02-medium": {
            "shot_size": graded("medium", "Medium shot"),
            "camera_angle": contested("slightly above eye level", "eye-level", "high-angle"),
        },
        "03-close": {
            "shot_size": contested("Tight close-up", "close-up", "extreme-close-up"),
            "camera_angle": graded("low-angle", "low angle looking up"),
            "depth_of_field": graded("shallow", "Shallow focus"),
        },
    },
    "zoom": {
        "01-wide": {
            "shot_size": graded("wide", "Wide shot"),
            "camera_angle": graded("eye-level", "Camera at eye level"),
            "depth_of_field": graded("deep", "deep focus"),
        },
        "02-medium": {
            "shot_size": graded("medium", "Medium shot"),
            "camera_angle": graded("eye-level", "Camera at eye level"),
        },
        "03-close": {
            "shot_size": graded("close-up", "Close-up of her face"),
            "depth_of_field": graded("shallow", "Shallow focus"),
        },
    },
}

for _set in LABELS.values():
    for _spec in _set.values():
        validate(_spec)


def sidecar(lane_dir, shot, spec_set, seed):
    """The frames/truth house shape (graded fields + _ungraded with reasons),
    plus where the label came from. No path in it: it sits beside its shot."""
    spec = LABELS[spec_set][shot]
    out = {
        "_source": f"Dictated by the {spec_set} clause of {shot}; a request, not yet a label.",
        "truth_id": truth_id(lane_dir, shot),
        "basis": "dictated",
        "spec_set": spec_set,
        "shot": shot,
        "seed": seed,
        "spec_digest": digest(spec),
        "_dictated": {f: e["phrase"] for f, e in spec.items()},
        "_ungraded": {},
    }
    for field, entry in spec.items():
        if entry["value"] is None:
            out["_ungraded"][field] = (f"dictated as '{entry['phrase']}', which reads as "
                                       f"{' or '.join(entry['candidates'])}; a human settles it.")
        else:
            out[field] = entry["value"]
    return out


def write_sidecar(out_dir, shot, spec_set, seed):
    out_dir = Path(out_dir)
    path = out_dir / f"{shot}.truth.json"
    path.write_text(json.dumps(sidecar(out_dir.name, shot, spec_set, seed), indent=2) + "\n",
                    encoding="utf-8")
    return path


def current_digest(t):
    """The digest of the labels a sidecar's shot carries NOW, or None."""
    spec = LABELS.get(t.get("spec_set"), {}).get(t.get("shot"))
    return digest(spec) if spec is not None else None
