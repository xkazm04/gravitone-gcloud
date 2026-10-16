"""The GPU worker: drives the foundry's kernel jobs on the card (forge, Dojo's local stacks).

    python pipeline/foundry/worker.py [--once] [--json] [--idle-s 2] [--producers forge,dojo]
    python pipeline/foundry/worker.py --job <job-id> [--json]

WHY A PYTHON WORKER. The Node worker (workers/runner.mts) drives every lane whose
producer it carries, and it carries none of these: the forge and Dojo's local
stacks are Python through and through (ComfyUI workflows, the Ollama eye, Pillow,
ffmpeg posters). So their PLAN and RECEIPT are Node's (packages/producers/src/
{forge,dojo}, lib/producers/{forge,dojo}.ts - the receipt is computed before
anything runs) and their PERFORM is here, over packages/kernel/py/job.py - the
same job record, the same slots, the same fence. A gpu.local head whose producer
is forge or dojo is left queued by the Node worker (`workLoop` names it an orphan
and never skips it), and this process claims it.

WHAT IT DOES, PER JOB: claims the job (its slot gpu.local#1 IS the card's lease -
pipeline/gpu/lease.py's v1 API is a shim over the same row, so every GPU tenant in
either language excludes every other), opens the producer's session, and walks the
plan one step at a time: `start` (from that commit a crash names the step),
perform, `book` under the fence - or count a vendor failure (the breaker trips at
three in a row) or fail the job with the step's own sentence. A heartbeat thread
renews the slot every ttl/3, never per unit: the unit that takes an hour is
exactly when the lease matters.

STOPPING IS AT A STEP BOUNDARY (admission-queue: drain-and-shutdown). SIGINT or
SIGTERM sets a flag; the step in flight finishes and is booked, then the job is
parked (back to `queued`, its slot given back) for the next worker. A SIGKILL
cannot be caught, and needs no handler: the job stays `running` under a dead pid
until whoever looks next - this worker's next claim, the Node worker's recovery
sweep - names it `interrupted`. gpu.local is a free lane, so nothing is held;
nothing resumes on its own; a retry resumes from the booked steps.

    from worker import launch, drive_job     # forge.py and dojo_run.py

EXIT 0 every job done (or nothing to do) · 1 a job failed or was refused · 2 usage.
"""
import argparse
import contextlib
import importlib
import json
import os
import shutil
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
KERNEL_PY = ROOT / "packages" / "kernel" / "py"
for p in (str(HERE), str(KERNEL_PY)):
    if p not in sys.path:
        sys.path.append(p)  # behind the caller's: `lease` on this path must stay the GPU broker

from job import (FenceConflict, JobError, Jobs, LaneHeld, LeaseLost, NotQueued, Refused,  # noqa: E402
                 SlotsBusy, Stopped)
from kernel_store import ensure_store, store_location  # noqa: E402

LANE = "gpu.local"
PRODUCERS = ("forge", "dojo")
ADAPTERS = {"forge": "forge_job", "dojo": "dojo_job"}
LAUNCHER = ROOT / "pipeline" / "foundry" / "launch.mts"


class LaunchError(RuntimeError):
    """The Node launcher refused, or could not be run."""


def gpu():
    """pipeline/gpu/lease.py - imported by its v1 name `lease`, after the foundry's
    modules have put pipeline/gpu on the path (guard does), so this is the broker."""
    gpu_dir = str(ROOT / "pipeline" / "gpu")
    if gpu_dir not in sys.path:
        sys.path.insert(0, gpu_dir)
    return importlib.import_module("lease")


# ── the launch: Node computes the receipt and enqueues ──────────────────────

def launch(producer, flags, node=None):
    """Enqueue (never drive) a job through pipeline/foundry/launch.mts and return its
    document ({"kind", "jobId", "receipt", ...}). One spawn door: an explicit argv,
    no shell, the store named by the inherited environment (subprocess-lifecycle:
    spawn-contract)."""
    node = node or shutil.which("node")
    if node is None:
        raise LaunchError("node is not on PATH: the launcher computes the receipt and enqueues the job")
    argv = [node, "--disable-warning=ExperimentalWarning", str(LAUNCHER), producer, *flags, "--json", "--detach"]
    r = subprocess.run(argv, cwd=str(ROOT), capture_output=True, text=True, encoding="utf-8", timeout=180)
    lines = [ln for ln in (r.stdout or "").splitlines() if ln.strip()]
    doc = None
    if lines:
        try:
            doc = json.loads(lines[-1])
        except ValueError:
            doc = None
    if r.returncode != 0 or not isinstance(doc, dict) or "jobId" not in doc:
        why = (doc or {}).get("error") if isinstance(doc, dict) else None
        raise LaunchError(why or f"the launcher exited {r.returncode}: {(r.stderr or r.stdout).strip()[-400:]}")
    return doc


# ── the drive: one claimed job, step by step ────────────────────────────────

def adapter(producer):
    name = ADAPTERS.get(producer)
    if name is None:
        raise Refused(f"no Python producer {producer!r} here ({', '.join(ADAPTERS)})")
    return importlib.import_module(name)


def _report(jobs, job_id, outcome, error=None):
    job = jobs.get(job_id)
    doc = {"jobId": job_id, "lane": job["lane"], "producer": job["producer"], "outcome": outcome, "state": job["state"]}
    err = error or (job.get("error") or {}).get("message")
    if err and job["state"] != "done":
        doc["error"] = err
    return doc


def drive(jobs, run, stop, say=print):
    """Walk a claimed job's plan to its end, a stop, or a failure. Returns the report."""
    job = jobs.get(run.job_id)
    dry = job["mode"]["kind"] == "dry"
    try:
        session = adapter(job["producer"]).open_session(job, run, dry, gpu())
    except LookupError as e:  # the run's manifest is not where the job says
        run.fail("not-found", str(e))
        return _report(jobs, run.job_id, "failed")
    except ValueError as e:  # the artefact contradicts the job (a cycle whose stack moved off the card)
        run.fail("conflict", str(e))
        return _report(jobs, run.job_id, "failed")
    failed_here = set()
    try:
        while True:
            if stop.is_set():
                run.park()
                return _report(jobs, run.job_id, "yielded")
            booked = set(run.outputs())
            # A step that failed THIS drive is not taken again in it: v1 moved on to
            # the next plate; three failures in a row trip the breaker regardless.
            steps = [s for s in session.plan(booked) if s not in failed_here]
            if not steps:
                break
            step = steps[0]
            try:
                run.start(step, remaining=len(steps))
            except Stopped:
                return _report(jobs, run.job_id, "stopped")
            say(f"  {run.job_id}: {step}")
            outcome = session.perform(step)
            if outcome[0] == "produced":
                run.book(step, outcome[1])
            elif outcome[0] == "vendor-failure":
                failed_here.add(step)
                run.fail_step(step, outcome[1])
                if run.ended:
                    session.failed(f"{outcome[1]} (the breaker tripped)")
                    return _report(jobs, run.job_id, "failed")
            else:
                _, code, message = outcome
                run.fail(code, message)
                session.failed(message)
                return _report(jobs, run.job_id, "failed")
        ending = session.finish()
        if ending is None:
            try:
                run.finish()
            except Stopped:
                return _report(jobs, run.job_id, "stopped")
            return _report(jobs, run.job_id, "done")
        run.fail(*ending)
        return _report(jobs, run.job_id, "failed")
    except (FenceConflict, LeaseLost):
        raise  # the run's exit settles it: interrupted when the fence is gone, never failed over someone else's slot
    except Exception as e:  # noqa: BLE001 - a defect in a step: the job fails with it, run.json says so
        message = f"{type(e).__name__}: {str(e)[:300]}"
        session.failed(message)
        if not run.ended:
            run.fail("internal", message)
        return _report(jobs, run.job_id, "failed", message)
    finally:
        session.close()


class StopFlag:
    """SIGINT/SIGTERM (and Windows' SIGBREAK) set it; the drive checks it at each step boundary."""

    def __init__(self):
        self.event = threading.Event()

    def is_set(self):
        return self.event.is_set()

    def install(self):
        def on(signum, _frame):
            self.event.set()
        for name in ("SIGINT", "SIGTERM", "SIGBREAK"):
            sig = getattr(signal, name, None)
            if sig is not None:
                with contextlib.suppress(ValueError, OSError):
                    signal.signal(sig, on)
        return self


def drive_job(job_id, say=print, wait_s=None, poll_s=5.0, stop=None):
    """Claim THIS job and drive it here (forge.py / dojo_run.py without --detach).

    A card held by another tenant is waited for, as v1's lease waiters did, saying
    who holds it; `wait_s` bounds the wait (None: until the job is claimed or the
    process is told to stop - the job then stays queued for the worker)."""
    stop = stop or StopFlag().install()
    jobs = Jobs(ensure_store(store_location()))
    try:
        deadline = None if wait_s is None else time.time() + wait_s
        told = False
        while True:
            try:
                run = jobs.claim(job_id)
                break
            except NotQueued:
                return _report(jobs, job_id, "not-queued")
            except (SlotsBusy, LaneHeld) as e:
                if stop.is_set() or (deadline is not None and time.time() >= deadline):
                    return _report(jobs, job_id, "busy", str(e))
                if not told:
                    say(f"  waiting for the card: {e}")
                    told = True
                time.sleep(poll_s)
            except Refused as e:
                return _report(jobs, job_id, "refused", str(e))
        with run:
            run.start_heartbeat()
            return drive(jobs, run, stop, say)
    finally:
        jobs.close()


# ── the loop ────────────────────────────────────────────────────────────────

def work(producers, once, idle_s, emit, say, stop):
    """Claim the lane's head while it is ours, drive it, repeat. Returns the exit code."""
    jobs = Jobs(ensure_store(store_location()))
    code = 0
    refused = set()
    try:
        while not stop.is_set():
            try:
                run = jobs.claim_next(LANE, producers)
            except (SlotsBusy, LaneHeld, NotQueued):
                run = None
            except Refused as e:
                # A live job under GRAVITONE_DRY_ONLY: named once, left queued (its order is the operator's).
                head = jobs.head(LANE)
                hid = head["id"] if head else "?"
                if hid not in refused:
                    refused.add(hid)
                    emit({"jobId": hid, "lane": LANE, "producer": head["producer"] if head else "?",
                          "outcome": "refused", "state": head["state"] if head else "?", "error": str(e)})
                code = 1
                run = None
            if run is None:
                if once:
                    break
                stop.event.wait(idle_s)
                continue
            with run:
                run.start_heartbeat()
                report = drive(jobs, run, stop, say)
            emit(report)
            if report["state"] not in ("done", "queued"):
                code = 1
    finally:
        jobs.close()
    return code


def main(argv=None):
    ap = argparse.ArgumentParser(description="drive the foundry's gpu.local jobs (forge, dojo)")
    ap.add_argument("--once", action="store_true", help="drain what is claimable now, then exit")
    ap.add_argument("--json", action="store_true", help="one JSON line per job outcome on stdout")
    ap.add_argument("--idle-s", type=float, default=2.0)
    ap.add_argument("--producers", default=",".join(PRODUCERS))
    ap.add_argument("--job", default=None, help="drive this one job and exit")
    try:
        args = ap.parse_args(argv)
    except SystemExit as e:
        return 2 if e.code else 0
    producers = tuple(p for p in args.producers.split(",") if p)
    unknown = [p for p in producers if p not in ADAPTERS]
    if unknown:
        print(f"worker: no Python producer {unknown} (have {', '.join(ADAPTERS)})", file=sys.stderr)
        return 2
    out = sys.stdout

    def emit(doc):
        if args.json:
            print(json.dumps(doc), file=out, flush=True)
        else:
            print(f"worker: {doc['jobId']} {doc['outcome']} -> {doc['state']}"
                  + (f": {doc['error']}" if doc.get("error") else ""), file=out, flush=True)

    def say(msg):
        print(msg, file=sys.stderr if args.json else out, flush=True)

    stop = StopFlag().install()
    # Progress lines (forge's log, guard's recycles) are stdout's in v1; under --json
    # stdout carries one document per job and nothing else.
    with contextlib.redirect_stdout(sys.stderr) if args.json else contextlib.nullcontext():
        import forge  # noqa: F401 - its LOG_STREAM, before any session opens
        if args.json:
            forge.LOG_STREAM = sys.stderr
        if args.job:
            report = drive_job(args.job, say=say, stop=stop)
            emit(report)
            return 0 if report["state"] in ("done", "queued") and report["outcome"] in ("done", "yielded") else 1
        return work(producers, args.once, args.idle_s, emit, say, stop)


if __name__ == "__main__":
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    sys.exit(main())
