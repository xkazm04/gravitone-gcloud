"""Freeze the ruler: score the film anchors once and write ruler/scale-v<n>.json.

Needs the gitignored anchor stills and the rig's models; nothing else does.
    python ruler/calibrate.py            # writes the next scale-v<n>.json
"""

import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parent))
import identity as idn  # noqa: E402


def sha256_file(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def build_scale(rows, version, anchors, models, calibrated_at):
    """Pure: assemble the scale document from scored anchor rows."""
    s = idn.scale_from(rows)
    blind = idn.ruler_blindness(s)
    sep = None if s["id_ceil"] is None or s["id_floor"] is None else round(s["id_ceil"] - s["id_floor"], 4)
    return {
        "version": version,
        "anchors": anchors,
        "models": models,
        "MIN_FACE_PX": idn.MIN_FACE_PX,
        "rungs": {"within": s["id_within"], "floor": s["id_floor"],
                  "ceil": s["id_ceil"], "look_floor": s["look_floor"]},
        "separation": sep,
        "blind": blind,
        "calibratedAt": calibrated_at,
    }


def next_version(directory=HERE):
    nums = [int(m.group(1)) for p in Path(directory).glob("scale-v*.json")
            if (m := re.fullmatch(r"scale-v(\d+)\.json", p.name))]
    return max(nums, default=0) + 1


def main():
    gone = idn.missing_anchors()
    if gone:
        print(f"CANNOT CALIBRATE: {len(gone)} anchor stills missing under {idn.FRAMES}: {gone}")
        sys.exit(2)
    from ruler.backend import TorchBackend
    backend = TorchBackend()
    A = idn.vecs_for({k: str(idn.FRAMES / v) for k, v in idn.ANCHORS.items()})
    rows = idn.pair_rows(idn.ANCHOR_PAIRS, A)
    anchors = [{"name": k, "sha256": sha256_file(idn.FRAMES / v)} for k, v in idn.ANCHORS.items()]
    v = next_version()
    s = build_scale(rows, v, anchors, backend.revisions(),
                    datetime.now(timezone.utc).isoformat(timespec="seconds"))
    out = HERE / f"scale-v{v}.json"
    out.write_text(json.dumps(s, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {out}" + (f"  BLIND: {s['blind']}" if s["blind"] else ""))
    sys.exit(2 if s["blind"] else 0)


if __name__ == "__main__":
    main()
