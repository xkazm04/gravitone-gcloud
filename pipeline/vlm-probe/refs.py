"""Logical references: name a frame or a lane file, never a machine's path.

    frame:lotr-scene-008          -> frames/lotr-scene-008.jpg
    frame:lotr-scene-008.jpg      -> the same
    lane:reference/00-hero.png    -> shots/reference/00-hero.png  (or clips/ if only there)

An absolute path (drive letter, UNC, leading slash) is somebody's clone, not a
reference: it raises ``non-portable reference`` instead of silently resolving on
the one machine that has it.
"""
import re
from pathlib import Path

HERE = Path(__file__).parent
FRAMES = HERE / "frames"
LANE_ROOTS = (HERE / "shots", HERE / "clips")

_DRIVE = re.compile(r"^[A-Za-z]:[\/]")


class NonPortableReference(ValueError):
    pass


def is_absolute_like(spec):
    s = str(spec)
    return bool(_DRIVE.match(s)) or s.startswith(("\\\\", "/")) or Path(s).is_absolute()


def resolve(ref, frames_dir=None, lane_roots=None):
    ref = str(ref)
    if is_absolute_like(ref):
        raise NonPortableReference(f"non-portable reference: {ref!r} (use frame:<name> or lane:<lane>/<file>)")
    if ref.startswith("frame:"):
        name = ref[len("frame:"):]
        if not name or "/" in name or "\\" in name or name.startswith("."):
            raise ValueError(f"bad frame reference: {ref!r}")
        if "." not in name:
            name += ".jpg"
        return Path(frames_dir or FRAMES) / name
    if ref.startswith("lane:"):
        rest = ref[len("lane:"):]
        parts = rest.replace("\\", "/").split("/")
        if len(parts) < 2 or any(p in ("", "..", ".") for p in parts):
            raise ValueError(f"bad lane reference: {ref!r}")
        roots = lane_roots or LANE_ROOTS
        for root in roots:
            cand = Path(root).joinpath(*parts)
            if cand.exists():
                return cand
        return Path(roots[0]).joinpath(*parts)
    raise ValueError(f"unknown reference scheme: {ref!r} (want frame: or lane:)")


def resolve_spec(spec, frames_dir=None):
    """A plan's `frame` field: a logical ref, or a bare filename under frames/."""
    s = str(spec)
    if s.startswith(("frame:", "lane:")) or is_absolute_like(s):
        return resolve(s, frames_dir=frames_dir)
    return Path(frames_dir or FRAMES) / s
