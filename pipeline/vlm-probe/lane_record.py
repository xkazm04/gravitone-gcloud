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
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# No CHARACTER / LOCATION here. The scene clauses belong to consistency.py,
# which renders them; a copy here once described a different hangar, so a
# record that defaulted to it described a scene no lane ever rendered. A record
# written without clauses now carries none rather than an invented one.

FLUX_MODELS = [
    "flux2_dev_fp8mixed.safetensors",
    "mistral_3_small_flux2_fp8.safetensors",
    "flux2-vae.safetensors",
]

SEED = 770425
DEFAULT_HERO = "pipeline/vlm-probe/shots/reference/00-hero.png"


@dataclass(frozen=True)
class LaneParam:
    """One lane knob, declared once. argparse, the record writer, the resume
    guard, replay_argv and the lane directory name are all projections of it.

    type      int | float | bool | str | "path" (stored repo-relative)
    key       the record key, when it differs from the kwarg/dest name
    aliases   older record keys still read
    flag      the CLI flag; None = recorded but fixed by the code, not the CLI
    emit      replay: "always", or "changed" (only when it differs from default)
    strict    a changed value refuses a resume
    absent_is_default
              a record without the key ran at the default (the knob predates
              the record), rather than "unknown, do not compare"
    record_default
              write the default when the caller passed nothing
    fallback  replay only: derive a value from an older record shape
    """
    name: str
    type: object
    default: object = None
    key: str = None
    aliases: tuple = ()
    flag: str = None
    choices: tuple = None
    emit: str = "always"
    strict: bool = True
    absent_is_default: bool = False
    record_default: bool = True
    required: bool = False
    fallback: object = None
    help: str = None

    @property
    def rkey(self):
        return self.key or self.name


def _legacy_ref_count(rec):
    # An older record kept only the staged list, and only once the lane finished.
    refs = rec.get("refs") or rec.get("references")
    return len(refs) if refs else None


_SCENE = (
    LaneParam("character", str, help="the character clause, verbatim in every prompt"),
    LaneParam("location", str, help="the location clause, verbatim in every prompt"),
)

# Order is replay order: the tracked lanes' argv is a snapshot nobody should
# have to re-derive.
LANE_PARAMS = {
    "stills": (
        LaneParam("lane", str, flag="--lane", choices=("baseline", "reference"), required=True),
        LaneParam("ref_crop", str, "full", flag="--ref-crop", choices=("full", "face"),
                  emit="changed", absent_is_default=True),
        LaneParam("late", float, 0.0, key="reference_joins_at", aliases=("late",), flag="--late",
                  emit="changed", absent_is_default=True,
                  help="fraction of denoising the text gets alone before the reference joins"),
        LaneParam("tag", str, "", flag="--tag", emit="changed", absent_is_default=True,
                  help="suffix for the output directory"),
        LaneParam("zoom", bool, False, flag="--zoom", emit="changed", absent_is_default=True,
                  help="the easy setups: focal length only"),
        LaneParam("steps", int, 20, flag="--steps"),
        LaneParam("seed", int, SEED, flag="--seed"),
        # Intent, recorded up front: `references` stays [] until the lane
        # finishes, so only this survives an interrupted run.
        LaneParam("ref_count", int, 1, flag="--refs", emit="changed", record_default=False,
                  fallback=_legacy_ref_count, help="how many copies of the hero to chain"),
        LaneParam("width", int, 1280),
        LaneParam("height", int, 720),
        LaneParam("guidance", float, 4.0),
        LaneParam("sampler", str, "euler"),
    ) + _SCENE,
    "clips": (
        LaneParam("lane", str, flag="--lane", choices=("ref2va", "chain"), required=True),
        LaneParam("width", int, 1344, flag="--width"),
        LaneParam("height", int, 768, flag="--height"),
        LaneParam("length", int, 73, flag="--length"),
        LaneParam("steps", int, 4, flag="--steps"),
        LaneParam("lora", bool, True, flag="--no-lora", emit="changed",
                  help="full steps, no turbo LoRA"),
        LaneParam("hero", "path", DEFAULT_HERO, flag="--hero", emit="changed",
                  help="the still every clip is held against"),
        LaneParam("seed", int, SEED),
        LaneParam("fps", int, 24),
    ) + _SCENE,
}

SCRIPT = {"stills": "consistency.py", "clips": "motion.py"}
_MISSING = object()


def param(kind, name):
    for p in LANE_PARAMS[kind]:
        if name in (p.name, p.rkey) or name in p.aliases:
            return p
    raise ValueError(f"{name!r} is not a {kind} lane param -- declare it in LANE_PARAMS")


def kind_of(rec):
    if rec.get("type") in LANE_PARAMS:
        return rec["type"]
    return "clips" if rec.get("lane") in param("clips", "lane").choices else "stills"


def _recorded(p, rec):
    for k in (p.rkey,) + p.aliases:
        if k in rec:
            return rec[k]
    return _MISSING


def _same(p, a, b):
    if p.type == "path":
        return resolve_from_repo(str(a)) == resolve_from_repo(str(b))
    return a == b


def lane_dir(kind, lane, zoom=False, tag=""):
    """The directory name a lane renders into. params_from_dir is its inverse."""
    if kind == "clips":
        return lane
    return lane + ("-zoom" if zoom else "") + tag


def params_from_dir(kind, lane, dirname):
    """Recover zoom and tag from a lane directory name (legacy records only)."""
    if kind == "clips" or not dirname.startswith(lane):
        return {"zoom": False, "tag": ""}
    rest = dirname[len(lane):]
    if rest.startswith("-zoom"):
        return {"zoom": True, "tag": rest[len("-zoom"):]}
    return {"zoom": False, "tag": rest}


def _path_arg(value):
    p = Path(value)
    return p.resolve() if p.exists() else resolve_from_repo(value)


def add_lane_args(ap, kind):
    """The CLI projection of LANE_PARAMS[kind]: every flagged param, dest = name."""
    for p in LANE_PARAMS[kind]:
        if not p.flag:
            continue
        kw = {"dest": p.name, "help": p.help}
        if p.type is bool:
            kw["action"] = "store_false" if p.default else "store_true"
        else:
            kw["type"] = _path_arg if p.type == "path" else p.type
            kw["metavar"] = p.flag.lstrip("-").upper()
            if p.choices:
                kw["choices"] = list(p.choices)
            if p.required:
                kw["required"] = True
            else:
                kw["default"] = p.default
        ap.add_argument(p.flag, **kw)
    return ap


def build_arg_parser(kind):
    return add_lane_args(argparse.ArgumentParser(prog=SCRIPT[kind]), kind)


def fill(kind, **given):
    """Every param with a value for this run: what was given, else its default."""
    out = {}
    given = {param(kind, k).name: v for k, v in given.items()}
    for p in LANE_PARAMS[kind]:
        v = given.get(p.name)
        if v is None and p.record_default:
            v = p.default
        if v is not None:
            out[p.name] = v
    return out


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
    if "zoom" not in data or "tag" not in data:
        inferred = params_from_dir(kind_of(data), data.get("lane", ""), dir_path.name)
        for k, v in inferred.items():
            data.setdefault(k, v)

    if "hero" in data and data["hero"]:
        data["hero"] = str(resolve_from_repo(data["hero"]))

    data["_dir"] = str(dir_path.resolve())
    return data


def _write_record(kind, out_dir, lane, params, fixed):
    out_path = Path(out_dir)
    out_path.mkdir(parents=True, exist_ok=True)
    values = fill(kind, lane=lane, **params)
    rec = {"schema": "lane-record/2", "type": kind}
    for p in LANE_PARAMS[kind]:
        if p.name in values:
            v = values[p.name]
            rec[p.rkey] = relative_to_repo(v) if p.type == "path" else v
    rec.update(fixed)
    lane_file = out_path / "lane.json"
    lane_file.write_text(json.dumps(rec, indent=2), encoding="utf-8")
    rec["_dir"] = str(out_path.resolve())
    return rec


def record_stills(out_dir, lane, refs=(), models=None, shots=None, **params):
    """Write a stills lane record. `params` are LANE_PARAMS["stills"] names;
    anything else is refused, so an undeclared knob cannot be recorded."""
    return _write_record("stills", out_dir, lane, params, {
        "models": models or list(FLUX_MODELS),
        "references": list(refs),
        "shots": shots or {},
    })


def record_clip(out_dir, lane, shots=None, beats=None, **params):
    """Write a clip lane record. Per-clip checksums live under `shots` (where
    write_shot puts them); `beats` is only the legacy v1 shape, kept if given."""
    fixed = {"shots": shots or {}}
    if beats:
        fixed["beats"] = beats
    return _write_record("clips", out_dir, lane, params, fixed)


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
    """Refuse to resume a lane over pixels made with different parameters.

    Every strict LANE_PARAMS entry is compared. A key the record does not carry
    is skipped (unknown), unless the knob predates the record, in which case
    the record ran at its default."""
    if isinstance(record_or_path, (str, Path)):
        rec = read(record_or_path)
    else:
        rec = record_or_path
    kind = kind_of(rec)

    for key, val in current_kwargs.items():
        p = param(kind, key)
        if not p.strict:
            continue
        old = _recorded(p, rec)
        if old is _MISSING:
            if not p.absent_is_default:
                continue
            old = p.default
        if p.type == "path":
            changed = bool(old and val) and not _same(p, old, val)
        else:
            changed = old is not None and old != val
        if changed:
            raise SystemExit(
                f"Refusing to resume lane with changed parameters: {p.name} {old} -> {val}"
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
    """The command that would re-render this lane, derived from LANE_PARAMS."""
    kind = kind_of(record)
    argv = [SCRIPT[kind]]
    for p in LANE_PARAMS[kind]:
        if not p.flag:
            continue
        v = _recorded(p, record)
        if v is _MISSING and p.fallback:
            v = p.fallback(record)
            v = _MISSING if v is None else v
        if v is _MISSING:
            continue
        if p.emit == "changed" and _same(p, v, p.default):
            continue
        if p.type is bool:
            argv.append(p.flag)
            continue
        text = relative_to_repo(v) if p.type == "path" else str(v)
        if text.startswith("-"):
            argv.append(f"{p.flag}={text}")
        else:
            argv.extend([p.flag, text])
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
