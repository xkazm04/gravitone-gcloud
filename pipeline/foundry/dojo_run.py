"""The dojo runner WRAPPER — one entry point, two pure stacks, one kernel job.

    python dojo_run.py foundry-out/training/<cycle-id> [--dry] [--detach] [--resume] [--json] [--budget-usd N]

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

SINCE PHASE 4 (L34) A CYCLE'S RENDERS ARE A KERNEL JOB, on the lane its stack
declares - "lane declared, never inferred" (plan §3.1) is this rule, kept:
  local   a gpu.local job, enqueued through pipeline/foundry/launch.mts (the
          receipt, confirmed here) and driven in this process by worker.py's
          drive - or left to `python pipeline/foundry/worker.py` with --detach.
  google  a cloud.google job, every Nano Banana and Gemini call metered against
          it; Node's to drive (Python books no money), so this hands the cycle to
          `npx tsx pipeline/foundry/launch.mts dojo <cycle>` and returns its exit.
Invoked, it runs LIVE as v1 did; --dry runs the plan on stand-ins. The judge
(dojo_judge.py prepare|park) stays an act on the cycle, after its job is done.

EXIT 0 done (or enqueued with --detach) · 1 failed or refused · 2 usage.
"""
import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import dojo_job  # noqa: E402


def say_to(as_json):
    def say(msg):
        print(msg, file=sys.stderr if as_json else sys.stdout, flush=True)
    return say


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("cycle", help="foundry-out/training/<cycle-id>")
    ap.add_argument("--dry", action="store_true", help="a dry job: stand-ins for every engine and vendor")
    ap.add_argument("--detach", action="store_true", help="enqueue only; the worker drives")
    ap.add_argument("--resume", action="store_true", help="retry the cycle's failed or interrupted job (booked units kept)")
    ap.add_argument("--json", action="store_true", help="one JSON document on stdout")
    ap.add_argument("--budget-usd", type=float, default=None, help="the job's ceiling (the google stack spends)")
    try:
        args = ap.parse_args(argv)
    except SystemExit as e:
        return 2 if e.code else 0
    say = say_to(args.json)

    def done(doc, code):
        if args.json:
            print(json.dumps(doc), flush=True)
        return code

    cdir = Path(args.cycle)
    if not cdir.is_absolute():
        cdir = ROOT / cdir
    cdir = cdir.resolve()
    if cdir.parent != dojo_job.training_root():
        return done({"ok": False, "error": f"a Dojo cycle lives under {dojo_job.training_root()}; {cdir} does not"}, 1)
    try:
        spec = json.loads((cdir / "gen-spec.json").read_text(encoding="utf-8"))
        stack, media = dojo_job.runner_of(spec)
    except (OSError, ValueError) as e:
        say(f"dojo_run: {e}")
        return done({"ok": False, "error": str(e)}, 1)
    except SystemExit as e:
        say(f"dojo_run: {e.code}")
        return done({"ok": False, "error": str(e.code)}, 1)
    runner = dojo_job.LOCAL.get((stack, media)) or dojo_job.GOOGLE[(stack, media)]
    say(f"dojo_run: {cdir.name} -> stack={stack} media={media} -> {runner}")

    flags = [cdir.name] + (["--dry"] if args.dry else []) + (["--resume"] if args.resume else [])
    if args.budget_usd is not None:
        flags += ["--budget-usd", str(args.budget_usd)]
    if stack == "google":
        npx = shutil.which("npx")
        if npx is None:
            return done({"ok": False, "error": "npx is not on PATH: the google stack is driven by pipeline/foundry/launch.mts"}, 1)
        # One explicit argv, no shell (v1 ran this through `shell=True`): the launcher prints its own document.
        argv = [npx, "tsx", str(HERE / "launch.mts"), "dojo", *flags] + (["--json"] if args.json else []) + (["--detach"] if args.detach else [])
        return subprocess.call(argv, cwd=str(ROOT))

    import worker  # noqa: E402
    try:
        launched = worker.launch("dojo", flags)
    except worker.LaunchError as e:
        say(f"dojo_run: {e}")
        return done({"ok": False, "cycle": cdir.name, "error": str(e)}, 1)
    job_id = launched["jobId"]
    say(f"dojo_run: job {job_id} ({launched['kind']}, {'dry' if args.dry else 'live'})")
    if args.detach:
        return done({"ok": True, "cycle": cdir.name, "jobId": job_id, "detached": True}, 0)
    import contextlib  # noqa: E402
    # The runners and guard print progress to stdout; under --json stdout is the document's alone.
    with contextlib.redirect_stdout(sys.stderr) if args.json else contextlib.nullcontext():
        report = worker.drive_job(job_id, say=say)
    doc = {"ok": report["state"] == "done", "cycle": cdir.name, "jobId": job_id, "outcome": report["outcome"], "state": report["state"]}
    if report.get("error"):
        doc["error"] = report["error"]
    return done(doc, 0 if report["state"] == "done" else 1)


if __name__ == "__main__":
    sys.exit(main())
