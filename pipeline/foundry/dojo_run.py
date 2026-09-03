"""The dojo runner WRAPPER — one entry point, two pure stacks.

    python dojo_run.py foundry-out/training/<cycle-id>

Reads the cycle's gen-spec.json and dispatches on two declared fields:

    stack:  "local"  — pixels on this machine (Flux 2 stills via dojo_pairs,
                        Wan/H3 video via dojo_video), eyes = ollama. $0, and
                        NOTHING in the cycle may bill Google.
            "google" — pixels Nano Banana, eyes Gemini, both through
                        lib/imaging/router with a google steer. Billed, and
                        NOTHING in the cycle touches the local engines.
    media:  "image" | "video"   (video is local-only until a hosted lane is
                                 declared in the overlay)

The purity rule is the point (operator, 2026-09-01): a verdict is about the
stack the cycle names, so a mixed cycle would measure nothing. The wrapper
refuses a spec that names no stack rather than guessing one.
"""
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE.parent.parent

RUNNERS = {
    ("local", "image"): [sys.executable, str(HERE / "dojo_pairs.py")],
    ("local", "video"): [sys.executable, str(HERE / "dojo_video.py")],
    ("local", "video-serial-lanes"): [sys.executable, str(HERE / "dojo_video_h3.py")],
    ("google", "image"): ["npx", "tsx", str(HERE / "dojo-pairs-nb.mts")],
}


def main():
    cdir = Path(sys.argv[1])
    if not cdir.is_absolute():
        cdir = ROOT / cdir
    spec = json.loads((cdir / "gen-spec.json").read_text(encoding="utf-8"))
    stack = spec.get("stack")
    media = spec.get("media", "image")
    if media == "video" and any(a.get("engine") for pr in spec.get("pairs", []) for a in (pr.get("baseline", {}), pr.get("challenger", {}))):
        media = "video-serial-lanes"
    if stack not in ("local", "google"):
        raise SystemExit(
            f"gen-spec.json declares stack={stack!r} — a cycle names 'local' or 'google' "
            "explicitly; the wrapper never guesses which bill it is running up.")
    runner = RUNNERS.get((stack, media))
    if not runner:
        raise SystemExit(f"no runner for stack={stack} media={media} — "
                         "google video has no lane; see the overlay's video section.")
    print(f"dojo_run: {cdir.name} -> stack={stack} media={media} -> {Path(runner[-1]).name}", flush=True)
    raise SystemExit(subprocess.call(runner + [str(cdir)], shell=(runner[0] == "npx"), cwd=str(ROOT)))


if __name__ == "__main__":
    main()
