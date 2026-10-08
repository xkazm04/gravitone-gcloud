"""Lane record v2 schema, legacy format normalization, replay command derivation,
resume safety guard, and pixel integrity verification.

Reproducibility contract: every lane directory holds a lane.json with the exact
parameters, models, tags, zoom, seed, and per-shot checksums that made its pixels.
"""

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

CHARACTER = (
    "a woman in her early thirties with close-cropped platinum-blonde hair, "
    "a thin pale scar running from her left eyebrow down across her cheekbone, "
    "deep-set grey eyes, a scuffed charcoal flight jacket with a burnt-orange collar "
    "worn over a grey undershirt"
)

LOCATION = (
    "a derelict cargo hangar with corrugated steel walls, rust-stained concrete floor, "
    "dusty shafts of afternoon sunlight cutting through high clerestory windows, "
    "industrial shelving with forgotten wooden crates in the background"
)

FLUX_MODELS = [
    "flux2_dev_fp8mixed.safetensors",
    "mistral_3_small_flux2_fp8.safetensors",
    "flux2-vae.safetensors",
]


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def relative_to_repo(path):
    if not path:
        return ""
    p_str = str(path).replace("\\", "/")
    if "pipeline/vlm-probe/" in p_str:
        idx = p_str.index("pipeline/vlm-probe/")
        return p_str[idx:]
    if "pipeline/" in p_str:
        idx = p_str.index("pipeline/")
        return p_str[idx:]
    p = Path(path)
    try:
        return p.resolve().relative_to(ROOT.resolve()).as_posix()
    except Exception:
        return p.as_posix()


def resolve_from_repo(path_str):
    if not path_str:
        return None
    norm = str(path_str).replace("\\", "/")
    if "pipeline/" in norm:
        idx = norm.index("pipeline/")
        rel = norm[idx:]
        return (ROOT / rel).resolve()
    p = Path(path_str)
    if p.is_absolute():
        return p.resolve()
    return (ROOT / p).resolve()


def read(path):
    p = Path(path)
    if p.is_dir():
        lane_file = p / "lane.json"
        dir_path = p
    else:
        lane_file = p
        dir_path = p.parent

    if not lane_file.exists():
        raise FileNotFoundError(f"No lane.json found at {lane_file}")

    data = json.loads(lane_file.read_text(encoding="utf-8"))
    lane = data.get("lane", "")
    dirname = dir_path.name

    if "zoom" not in data:
        data["zoom"] = dirname.endswith("-zoom")

    if "tag" not in data:
        if dirname.endswith("-zoom"):
            prefix = lane + "-zoom"
            data["tag"] = dirname[len(prefix):] if dirname.startswith(prefix) else ""
        elif dirname == lane:
            data["tag"] = ""
        elif dirname.startswith(lane):
            data["tag"] = dirname[len(lane):]
        else:
            data["tag"] = ""

    if "hero" in data and data["hero"]:
        data["hero"] = str(resolve_from_repo(data["hero"]))

    data["_dir"] = str(dir_path.resolve())
    return data


def record_stills(
    out_dir,
    lane,
    seed=770425,
    steps=20,
    refs=(),
    ref_crop="full",
    late=0.0,
    zoom=False,
    tag="",
    width=1280,
    height=720,
    guidance=4.0,
    sampler="euler",
    models=None,
    character=None,
    location=None,
    shots=None,
    ref_count=None,
):
    out_path = Path(out_dir)
    out_path.mkdir(parents=True, exist_ok=True)
    rec = {
        "schema": "lane-record/2",
        "type": "stills",
        "lane": lane,
        "seed": seed,
        "steps": steps,
        "zoom": zoom,
        "tag": tag,
        "width": width,
        "height": height,
        "guidance": guidance,
        "sampler": sampler,
        "models": models or list(FLUX_MODELS),
        "references": list(refs),
        "ref_crop": ref_crop,
        "reference_joins_at": late,
        "character": character or CHARACTER,
        "location": location or LOCATION,
        "shots": shots or {},
    }
    if ref_count is not None:
        # Intent, recorded up front: `references` stays [] until the lane
        # finishes, so only this survives an interrupted run.
        rec["ref_count"] = ref_count
    lane_file = out_path / "lane.json"
    lane_file.write_text(json.dumps(rec, indent=2), encoding="utf-8")
    rec["_dir"] = str(out_path.resolve())
    return rec


def record_clip(
    out_dir,
    lane,
    seed=770425,
    steps=4,
    lora=True,
    width=832,
    height=480,
    length=73,
    fps=24,
    hero=None,
    character=None,
    location=None,
    beats=None,
):
    out_path = Path(out_dir)
    out_path.mkdir(parents=True, exist_ok=True)
    hero_rel = relative_to_repo(hero) if hero else ""
    rec = {
        "schema": "lane-record/2",
        "type": "clips",
        "lane": lane,
        "seed": seed,
        "steps": steps,
        "lora": lora,
        "width": width,
        "height": height,
        "length": length,
        "fps": fps,
        "hero": hero_rel,
        "character": character or CHARACTER,
        "location": location or LOCATION,
        "beats": beats or {},
    }
    lane_file = out_path / "lane.json"
    lane_file.write_text(json.dumps(rec, indent=2), encoding="utf-8")
    rec["_dir"] = str(out_path.resolve())
    return rec


def write_shot(out_dir, shot_name, shot_file, prompt, **extra):
    out_path = Path(out_dir)
    lane_file = out_path / "lane.json"
    if lane_file.exists():
        rec = json.loads(lane_file.read_text(encoding="utf-8"))
    else:
        rec = {"schema": "lane-record/2", "shots": {}}

    if "shots" not in rec or not isinstance(rec["shots"], dict):
        rec["shots"] = {}

    p_file = Path(shot_file)
    sha = sha256_file(p_file) if p_file.exists() else None
    params = extra.get("params", extra)

    rec["shots"][shot_name] = {
        "prompt": prompt,
        "sha256": sha,
        "params": params,
    }

    tmp = out_path / f"lane.json.{os.getpid()}.tmp"
    tmp.write_text(json.dumps(rec, indent=2), encoding="utf-8")
    tmp.replace(lane_file)
    return rec


def check_resume(record_or_path, current_kwargs):
    if isinstance(record_or_path, (str, Path)):
        rec = read(record_or_path)
    else:
        rec = record_or_path

    for key, val in current_kwargs.items():
        if key == "steps":
            old = rec.get("steps")
            if old is not None and old != val:
                raise SystemExit(
                    f"Refusing to resume lane with changed parameters: steps {old} -> {val}"
                )
        elif key == "seed":
            old = rec.get("seed")
            if old is not None and old != val:
                raise SystemExit(
                    f"Refusing to resume lane with changed parameters: seed {old} -> {val}"
                )
        elif key == "ref_crop":
            old = rec.get("ref_crop", "full")
            if old != val:
                raise SystemExit(
                    f"Refusing to resume lane with changed parameters: ref_crop {old} -> {val}"
                )
        elif key in ("late", "reference_joins_at"):
            old = rec.get("reference_joins_at", rec.get("late", 0.0))
            if old != val:
                raise SystemExit(
                    f"Refusing to resume lane with changed parameters: late {old} -> {val}"
                )
        elif key == "zoom":
            old = rec.get("zoom", False)
            if old != val:
                raise SystemExit(
                    f"Refusing to resume lane with changed parameters: zoom {old} -> {val}"
                )
        elif key == "tag":
            old = rec.get("tag", "")
            if old != val:
                raise SystemExit(
                    f"Refusing to resume lane with changed parameters: tag {old} -> {val}"
                )
        elif key == "width":
            old = rec.get("width")
            if old is not None and old != val:
                raise SystemExit(
                    f"Refusing to resume lane with changed parameters: width {old} -> {val}"
                )
        elif key == "height":
            old = rec.get("height")
            if old is not None and old != val:
                raise SystemExit(
                    f"Refusing to resume lane with changed parameters: height {old} -> {val}"
                )
        elif key == "length":
            old = rec.get("length")
            if old is not None and old != val:
                raise SystemExit(
                    f"Refusing to resume lane with changed parameters: length {old} -> {val}"
                )
        elif key == "hero":
            old = rec.get("hero")
            if old and val and resolve_from_repo(old) != resolve_from_repo(val):
                raise SystemExit(
                    f"Refusing to resume lane with changed parameters: hero {old} -> {val}"
                )
        elif key == "ref_count":
            old = rec.get("ref_count")
            if old is not None and old != val:
                raise SystemExit(
                    f"Refusing to resume lane with changed parameters: ref_count {old} -> {val}"
                )
        elif key == "lora":
            old = rec.get("lora")
            if old is not None and old != val:
                raise SystemExit(
                    f"Refusing to resume lane with changed parameters: lora {old} -> {val}"
                )


def check(dir_path):
    p = Path(dir_path)
    d = p if p.is_dir() else p.parent
    rec = read(d)
    findings = []

    shots = rec.get("shots", {})
    if isinstance(shots, dict):
        for name, item in shots.items():
            if isinstance(item, dict) and item.get("sha256"):
                png = d / f"{name}.png"
                if not png.exists():
                    findings.append((name, "missing file"))
                else:
                    actual = sha256_file(png)
                    if actual != item["sha256"]:
                        findings.append((name, "pixels changed since record"))

    beats = rec.get("beats", {})
    if isinstance(beats, dict):
        for name, item in beats.items():
            if isinstance(item, dict) and item.get("sha256"):
                png = d / f"{name}_c-last.png"
                if not png.exists():
                    findings.append((name, "missing file"))
                else:
                    actual = sha256_file(png)
                    if actual != item["sha256"]:
                        findings.append((name, "pixels changed since record"))

    return findings


def replay_argv(record):
    lane = record.get("lane", "")
    if lane in ("chain", "ref2va"):
        argv = ["motion.py", "--lane", lane]
        if "width" in record:
            argv.extend(["--width", str(record["width"])])
        if "height" in record:
            argv.extend(["--height", str(record["height"])])
        if "length" in record:
            argv.extend(["--length", str(record["length"])])
        if "steps" in record:
            argv.extend(["--steps", str(record["steps"])])
        if "lora" in record and not record["lora"]:
            argv.append("--no-lora")
        return argv

    argv = ["consistency.py", "--lane", lane]
    ref_crop = record.get("ref_crop", "full")
    if ref_crop and ref_crop != "full":
        argv.extend(["--ref-crop", str(ref_crop)])

    late = record.get("reference_joins_at", record.get("late", 0.0))
    if late and float(late) != 0.0:
        argv.extend(["--late", str(late)])

    tag = record.get("tag", "")
    if tag:
        argv.append(f"--tag={tag}")

    if record.get("zoom"):
        argv.append("--zoom")

    if "steps" in record:
        argv.extend(["--steps", str(record["steps"])])
    if "seed" in record:
        argv.extend(["--seed", str(record["seed"])])

    refs = record.get("refs") or record.get("references")
    if refs and len(refs) > 1:
        argv.extend(["--refs", str(len(refs))])

    return argv


def main():
    ap = argparse.ArgumentParser(description="VLM probe lane record replay and integrity check")
    sub = ap.add_subparsers(dest="cmd")

    rp = sub.add_parser("replay", help="print replay command for a lane directory")
    rp.add_argument("lane_dir", help="path to lane directory or lane.json")

    cp = sub.add_parser("check", help="verify pixel checksums against lane.json")
    cp.add_argument("lane_dir", help="path to lane directory or lane.json")

    args = ap.parse_args()
    if args.cmd == "replay":
        rec = read(args.lane_dir)
        argv = replay_argv(rec)
        print(" ".join(argv))
    elif args.cmd == "check":
        findings = check(args.lane_dir)
        if findings:
            for name, reason in findings:
                print(f"  MISMATCH {name}: {reason}")
            sys.exit(1)
        else:
            print("  OK: all recorded pixels match checksums")
    else:
        ap.print_help()


if __name__ == "__main__":
    main()
