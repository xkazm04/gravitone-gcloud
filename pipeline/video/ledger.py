"""The clip take ledger: every render kept, every verdict stored, adoption explicit.

    python pipeline/video/ledger.py show <id>
    python pipeline/video/ledger.py adopt <id> <take-file> [--waiver "reason"]

Before this, the pipeline kept ONE raw per preset and overwrote it on a re-render,
and the quality verdict clip_check.py computes was printed and thrown away -- the
build never read it, so a clip its own checker fails could ship silently. This is
the durable record that closes that:

    pipeline/runs/preset-clips/<id>/takes/<engine>-<seed>.webm   (+ .json sidecar)
    pipeline/runs/preset-clips/<id>/ledger.json

    { "takes":   [{ file, engine, seed, prompt, route, check: {..., checker} }],
      "adopted": { "take": <file>, "waiver": <reason> } }

A take is never overwritten. A verdict is stored with the checker version that
produced it, so `clip_check.py --regrade <id>` can re-judge the same bytes without
re-rendering. ADOPTION is the only door to the build: a take whose check failed,
or was never run, is adoptable only with a non-empty waiver -- a reviewed claim
that the checker is wrong HERE, written down where the manifest carries it.

STDLIB ONLY, deliberately: pipeline/video/selftest.py exercises this with no GPU,
numpy or PIL. Anything that needs them (grading, rendering) lives in the callers.
pipeline/build-preset-clips.mts re-implements verdict_problem in TypeScript; keep
the two in step.
"""
import json
import os
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE.parent.parent
RUNS = ROOT / "pipeline" / "runs" / "preset-clips"


class LedgerError(ValueError):
    """An adoption or edit the ledger refuses; the message names the take."""


def preset_dir(pid, runs=None):
    return Path(runs or RUNS) / pid


def takes_dir(pid, runs=None):
    return preset_dir(pid, runs) / "takes"


def take_name(engine, seed, suffix=".webm"):
    return f"{engine}-{seed}{suffix}"


def _path(pid, runs=None):
    return preset_dir(pid, runs) / "ledger.json"


def load(pid, runs=None):
    p = _path(pid, runs)
    if not p.exists():
        return {"takes": [], "adopted": None}
    data = json.loads(p.read_text(encoding="utf-8"))
    data.setdefault("takes", [])
    data.setdefault("adopted", None)
    return data


def save(pid, ledger, runs=None):
    """Atomic: a kill mid-write must not leave half a ledger."""
    p = _path(pid, runs)
    p.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=p.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(ledger, f, indent=2, ensure_ascii=False)
            f.write("\n")
        os.replace(tmp, p)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def find(ledger, file):
    for t in ledger["takes"]:
        if t["file"] == file:
            return t
    return None


def add_take(pid, row, runs=None):
    """Record a take. An existing row for the same file is replaced IN PLACE
    (a re-render of the same seed is the same take), never duplicated."""
    for key in ("file", "engine", "seed", "prompt", "route"):
        if key not in row:
            raise LedgerError(f"take row is missing {key!r}")
    ledger = load(pid, runs)
    old = find(ledger, row["file"])
    if old is not None:
        ledger["takes"][ledger["takes"].index(old)] = row
    else:
        ledger["takes"].append(row)
    save(pid, ledger, runs)
    return ledger


def set_check(pid, file, check, runs=None):
    """Store a verdict on an existing take (regrade). Raises if the take is unknown."""
    ledger = load(pid, runs)
    t = find(ledger, file)
    if t is None:
        raise LedgerError(f"{pid}: no take {file!r} in the ledger")
    t["check"] = check
    save(pid, ledger, runs)
    return t


def verdict_problem(take, waiver=None):
    """Why this take may not ship, or None. THE rule, in one place.

    A take ships when its check passed, or when a reviewed waiver says why a
    failing (or never-run) check is wrong for it. A waiver on a passing take is
    harmless and ignored.
    """
    check = take.get("check")
    if check is not None and check.get("ok") is True:
        return None
    if isinstance(waiver, str) and waiver.strip():
        return None
    if check is None:
        return f"{take['file']} was never judged (no check) and carries no waiver"
    why = "; ".join(check.get("reasons") or []) or "check.ok is false"
    return f"{take['file']} failed its check ({why}) and carries no waiver"


def adopt(pid, file, waiver=None, runs=None):
    """Make `file` the take the build squeezes. Refuses an unjudged/failed take
    without a waiver, and a take the ledger does not know."""
    ledger = load(pid, runs)
    t = find(ledger, file)
    if t is None:
        raise LedgerError(f"{pid}: no take {file!r} in the ledger")
    problem = verdict_problem(t, waiver)
    if problem:
        raise LedgerError(f"{pid}: cannot adopt -- {problem}")
    adopted = {"take": file}
    if isinstance(waiver, str) and waiver.strip():
        adopted["waiver"] = waiver.strip()
    ledger["adopted"] = adopted
    save(pid, ledger, runs)
    return adopted


def adopted_take(pid, runs=None):
    """(take row, waiver, problem). `problem` is set when the build must refuse:
    nothing adopted, the adopted take vanished from the ledger, or its verdict
    no longer permits shipping (e.g. after a regrade turned it red)."""
    ledger = load(pid, runs)
    a = ledger.get("adopted")
    if not a:
        return None, None, f"{pid}: ledger exists but no take is adopted"
    t = find(ledger, a["take"])
    if t is None:
        return None, None, f"{pid}: adopted take {a['take']!r} is not in the ledger"
    waiver = a.get("waiver")
    return t, waiver, verdict_problem(t, waiver)


def main(argv):
    if len(argv) >= 2 and argv[0] == "show":
        print(json.dumps(load(argv[1]), indent=2, ensure_ascii=False))
        return 0
    if len(argv) >= 3 and argv[0] == "adopt":
        waiver = argv[argv.index("--waiver") + 1] if "--waiver" in argv else None
        try:
            print(json.dumps(adopt(argv[1], argv[2], waiver), ensure_ascii=False))
        except LedgerError as e:
            print(f"ledger: {e}", file=sys.stderr)
            return 1
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
