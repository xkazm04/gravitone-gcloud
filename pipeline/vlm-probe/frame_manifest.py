"""Frame manifest schema and utilities.

Schema frame-manifest/2 records:
  - slug: source identifier
  - duration_s: runtime in seconds
  - strategy: sampling strategy ('scene', 'fixed', etc.)
  - threshold: scene change threshold
  - cuts: list of cut timestamps in seconds
  - frames: list of published frame records with {frame, source, t_seconds, ...}

Provides:
  - write(path, slug, dur, strat, thres, cuts, frames) -> schema 'frame-manifest/2'
  - read(path) -> normalizes v1 list to v2 structure with schema='frame-manifest/1', duration_s=None, cuts=[]
  - shot_index(t, cuts) -> 0-based cut interval containing t
  - beat_of(t, duration_s) -> beat bin ('setup(0-25%)', 'build(25-55%)', 'peak(55-85%)', 'tail(85-100%)')
  - upgrade(manifest_path, rhythm_path, cuts_path) -> upgrades v1 manifest to v2 with .v1.json backup
  - sha256_file / phash_file / stamp_frames -> additive identity fields (sha256, phash, source_id) on frame rows
  - build_lock(manifests_dir, corpus_path) -> corpus.lock.json content (names -> {slug, t_seconds, sha256, phash, extractor})
"""
import argparse
import bisect
import hashlib
import json
import shutil
from pathlib import Path

SCHEMA_V1 = "frame-manifest/1"
SCHEMA_V2 = "frame-manifest/2"

BEATS = ["setup(0-25%)", "build(25-55%)", "peak(55-85%)", "tail(85-100%)"]


def write(path, slug, dur, strat, thres, cuts, frames):
    """Write a v2 frame manifest."""
    data = {
        "schema": SCHEMA_V2,
        "slug": slug,
        "duration_s": round(dur, 2) if isinstance(dur, (int, float)) else dur,
        "strategy": strat,
        "threshold": round(thres, 4) if isinstance(thres, (int, float)) else thres,
        "cuts": list(cuts) if cuts else [],
        "frames": list(frames) if frames else [],
    }
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return data


def read(path):
    """Read a frame manifest; normalize v1 list to v2 structure."""
    p = Path(path)
    raw = json.loads(p.read_text(encoding="utf-8"))
    if isinstance(raw, list):
        slug = raw[0].get("source") if raw and isinstance(raw[0], dict) else None
        return {
            "schema": SCHEMA_V1,
            "slug": slug or p.stem.replace("-manifest", ""),
            "duration_s": None,
            "strategy": None,
            "threshold": None,
            "cuts": [],
            "frames": raw,
        }
    if isinstance(raw, dict):
        if "schema" not in raw:
            raw["schema"] = SCHEMA_V2
        if "cuts" not in raw:
            raw["cuts"] = []
        if "frames" not in raw:
            raw["frames"] = []
        return raw
    raise ValueError(f"Unrecognized manifest format in {path}: {type(raw)}")


def shot_index(t, cuts):
    """Return the 0-based cut interval containing timestamp t."""
    if not cuts:
        return 0
    s_cuts = sorted(cuts)
    return bisect.bisect_right(s_cuts, t)


def beat_of(t, duration_s):
    """Map t / duration_s to 4 beat bins."""
    if duration_s is None or duration_s <= 0:
        raise ValueError(f"duration_s must be positive, got {duration_s}")
    f = t / duration_s
    if f < 0.25:
        return BEATS[0]
    elif f < 0.55:
        return BEATS[1]
    elif f < 0.85:
        return BEATS[2]
    else:
        return BEATS[3]


def upgrade(manifest_path, rhythm_path=None, cuts_path=None):
    """Upgrade a v1 manifest to v2 schema while preserving a .v1.json backup copy."""
    p = Path(manifest_path)
    text = p.read_text(encoding="utf-8")
    backup_path = p.with_name(p.stem + ".v1.json")
    backup_path.write_text(text, encoding="utf-8")

    data = json.loads(text)
    frames = data if isinstance(data, list) else data.get("frames", [])
    slug = p.stem.replace("-manifest", "")

    r_path = Path(rhythm_path) if rhythm_path else p.parent.parent / ".ingest" / f"{slug}-rhythm.json"
    c_path = Path(cuts_path) if cuts_path else p.parent.parent / ".ingest" / f"{slug}-cuts.json"

    duration_s = None
    if r_path.exists():
        r_data = json.loads(r_path.read_text(encoding="utf-8"))
        duration_s = r_data.get("duration_s")

    cuts = []
    if c_path.exists():
        c_data = json.loads(c_path.read_text(encoding="utf-8"))
        if isinstance(c_data, list):
            cuts = c_data

    upgraded = write(
        p,
        slug=slug,
        dur=duration_s,
        strat="scene",
        thres=0.30,
        cuts=cuts,
        frames=frames,
    )
    return upgraded


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def phash_file(path, size=8):
    """64-bit difference hash as 16 hex chars; survives re-encoding, not a different shot."""
    import numpy as np
    from PIL import Image
    with Image.open(path) as img:
        g = np.asarray(img.convert("L").resize((size + 1, size)), dtype=np.int16)
    bits = (g[:, 1:] > g[:, :-1]).flatten()
    return format(int("".join("1" if b else "0" for b in bits), 2), "016x")


def hamming_hex(a, b):
    return bin(int(a, 16) ^ int(b, 16)).count("1")


def stamp_frames(frames, frames_dir, source_id=None):
    """Add sha256 + phash (+ source_id) to each frame row whose jpg exists. Additive on v2."""
    for row in frames:
        p = Path(frames_dir) / row["frame"]
        if p.exists():
            row["sha256"] = sha256_file(p)
            row["phash"] = phash_file(p)
        if source_id:
            row["source_id"] = source_id
    return frames


def build_lock(manifests_dir, corpus_path=None):
    """Lockfile content from the tracked manifests. Hash-addressed, no pixels."""
    ids = {}
    if corpus_path and Path(corpus_path).exists():
        for s in json.loads(Path(corpus_path).read_text(encoding="utf-8")).get("sources", []):
            ids[s["slug"]] = s.get("id")
    entries = {}
    for mf in sorted(Path(manifests_dir).glob("*-manifest.json")):
        m = read(mf)
        extractor = f"{m.get('strategy')}@{m.get('threshold')}"
        for row in m["frames"]:
            if not row.get("sha256"):
                continue
            entries[row["frame"]] = {
                "slug": m["slug"], "source_id": row.get("source_id") or ids.get(m["slug"]),
                "t_seconds": row["t_seconds"], "sha256": row["sha256"],
                "phash": row.get("phash"), "extractor": extractor,
            }
    return {"schema": "corpus-lock/1", "frames": dict(sorted(entries.items()))}


def main():
    ap = argparse.ArgumentParser(description="Frame manifest management")
    sub = ap.add_subparsers(dest="cmd")

    up = sub.add_parser("upgrade", help="Upgrade manifest to v2 schema")
    up.add_argument("manifest", help="Path to manifest JSON")
    up.add_argument("--rhythm", default=None, help="Path to rhythm JSON")
    up.add_argument("--cuts", default=None, help="Path to cuts JSON")

    args = ap.parse_args()
    if args.cmd == "upgrade":
        upgrade(args.manifest, args.rhythm, args.cuts)
        print(f"upgraded {args.manifest}")


if __name__ == "__main__":
    main()
