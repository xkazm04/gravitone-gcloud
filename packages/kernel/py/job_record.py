"""The job record and its queue, in Python: the pure-ish half of the protocol job.py drives -
the record's transitions (@gt/domain/job.machine.ts), its events (job.ts `jobEvent`), the
meter projection (spend/projection.ts `meterOf`), the lane holds and the take-over sweep's
interruption (job-queue.ts, job-run.ts `interrupt`). Split from job.py so each stays a size
a reader holds at once; job.py re-exports what a worker catches.
"""

import json
import os
import sqlite3
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    # BEHIND the caller's own entries, never in front: to a GPU tenant `lease` is pipeline/gpu's
    # broker, and a library module that put this folder first would hand it the kernel's instead.
    sys.path.append(_HERE)
from kernel_ledger import append, machine  # noqa: E402
from kernel_store import kernel_lease  # noqa: E402
from lease_pid import pid_alive  # noqa: E402
from verify_events import canonical  # noqa: E402

_lease = kernel_lease()
# Re-exported: a worker catches the kernel lease's own classes through this module, never a second copy.
DEFAULT_TTL_S, FenceConflict, LeaseError, LeaseLost, Tx = _lease.DEFAULT_TTL_S, _lease.FenceConflict, _lease.LeaseError, _lease.LeaseLost, _lease.Tx
assert_fence, claim_in, connect, fence_loss, heartbeat_in = _lease.assert_fence, _lease.claim_in, _lease.connect, _lease.fence_loss, _lease.heartbeat_in
ms, process_holder, read_row, release_in = _lease.ms, _lease.process_holder, _lease.read_row, _lease.release_in

# @gt/domain/lane LANE_CAPACITY and LANE_PAYS; these tables and lease.py's are compared whole by test/job.python.test.ts.
LANE_CAPACITY = {"gpu.local": 1, "box.render": 1, "box.blender": 1, "box.chrome": 1, "seat.text": 4,
                 "cloud.google": 3, "cloud.elevenlabs": 2, "cloud.leonardo": 2, "cloud.qwen": 1}
LANE_PAYS = {"gpu.local": False, "box.render": False, "box.blender": False, "box.chrome": True, "seat.text": True,
             "cloud.google": True, "cloud.elevenlabs": True, "cloud.leonardo": True, "cloud.qwen": True}
# @gt/domain/job.machine.ts
MACHINE = {"planned": ("queued", "cancelled"), "queued": ("running", "paused", "cancelled"),
           "running": ("done", "failed", "interrupted", "paused", "cancelled"), "paused": ("queued", "cancelled"),
           "failed": ("queued", "cancelled"), "interrupted": ("queued", "cancelled"), "done": (), "cancelled": ()}
ERROR_CODES = ("invalid", "not-found", "conflict", "unauthenticated", "refused", "unavailable", "budget", "internal")
BREAKER_LIMIT = 3
HOLD_SENTENCE = "credits may be spent - look first"


class JobError(LeaseError):
    """Base for every refusal the job protocol makes."""


class NotQueued(JobError):
    def __init__(self, job):
        super().__init__("job %s is %s; only a queued job is claimed" % (job["id"], job["state"]))
        self.state = job["state"]


class LaneHeld(JobError):
    def __init__(self, message, job_id):
        super().__init__(message)
        self.job_id = job_id


class SlotsBusy(JobError):
    """Every slot of the lane is held by someone else."""


class Refused(JobError):
    """The act is not this caller's to make (a lane mismatch, a live job under dry-only)."""


class Stopped(JobError):
    """The job left `running` under the drive (an operator's pause or cancel): the slot is given back."""

    def __init__(self, job):
        super().__init__("job %s is %s; the drive stops and gives its slot back" % (job["id"], job["state"]))
        self.state = job["state"]


def beat_once(conn, clock, slot, fence):
    """One beat of a run's heartbeat thread (job.py `start_heartbeat`), as lease-renewal has it:
    a store busy past its timeout misses this beat (False) and the next renews - the ttl/3 cadence
    is that margin; a lost slot raises LeaseLost; so does any other failure, naming it, because a
    slot that cannot be renewed is lost to the run (Node's beat carries a throw to its loop too)."""
    try:
        with Tx(conn, clock) as t:
            heartbeat_in(t, slot, fence)
    except LeaseLost:
        raise
    except Exception as e:  # noqa: BLE001 - classified here, never swallowed
        if isinstance(e, sqlite3.OperationalError) and ("locked" in str(e) or "busy" in str(e)):
            return False
        raise LeaseLost("the heartbeat on %s failed: %s" % (slot, e)) from e
    return True


def heartbeat_loop(path, clock, slot, fence, every_s, stop, lost):
    """The body of a run's heartbeat thread (job.py `start_heartbeat`): its own connection, a beat
    every `every_s` until `stop` is set. Whatever ends the renewing - a lost slot, or a connection
    the thread cannot open - is handed to `lost`, so the run's next call raises instead of writing
    on while nothing renews its slot."""
    try:
        conn = connect(path)
    except Exception as e:  # noqa: BLE001 - handed to the run, never swallowed
        lost(LeaseLost("the heartbeat on %s could not open the store: %s" % (slot, e)))
        return
    try:
        while not stop.wait(every_s):
            try:
                beat_once(conn, clock, slot, fence)  # busy misses one beat; a loss raises
            except LeaseLost as e:
                lost(e)
                return
    finally:
        conn.close()


def lane_slots(lane):
    return ["%s#%d" % (lane, i + 1) for i in range(LANE_CAPACITY[lane])]


def usd6(x):
    return round(x * 1e6) / 1e6


# -- the record (job.ts / job-core.ts) -----------------------------------------
def load(t, job_id):
    row = t.get("SELECT record FROM jobs WHERE id = ?", job_id)
    if row is None:
        raise JobError("no job %s" % job_id)
    return json.loads(row[0])


def put(t, job):
    changed = t.run("UPDATE jobs SET state = ?, record = ?, ceiling_usd = ? WHERE id = ?",
                    job["state"], canonical(job), job.get("ceilingUsd"), job["id"]).rowcount
    if changed != 1:
        raise JobError("no job %s" % job["id"])


def move(job, to):
    """job-core `move`: through the machine, dropping what only other states carry."""
    if to not in MACHINE[job["state"]]:
        raise Refused("job %s: %s -> %s is not a transition" % (job["id"], job["state"], to))
    out = {k: v for k, v in job.items() if k not in ("lease", "slot", "error", "stop", "interruption")}
    out["state"] = to
    return out


def without_stage(progress):
    return {k: v for k, v in progress.items() if k != "stage"}


def correlation_data(job):
    c = job.get("correlation") or {}
    run = c.get("runId") or (job["of"]["id"] if job["of"]["kind"] == "run" else None)
    out = {}
    if c.get("projectId") is not None:
        out["projectId"] = c["projectId"]
    if run is not None:
        out["runId"] = run
    return out


def job_event(t, by, job, typ, data=None, cost=None):
    """job.ts `jobEvent`: the record's state and attempt, its correlation, then the act's data."""
    body = dict({"state": job["state"], "attempt": job["attempt"]}, **correlation_data(job))
    body.update(data or {})
    append(t, machine(by), typ, {"kind": "job", "id": job["id"]}, lane=job["lane"], data=body, cost=cost)


def meter_of(t, job_id):
    """spend/projection.ts `meterOf`: the job's spend as the meter has it."""
    usd = usd6(t.get("SELECT total(usd) FROM spend_rows WHERE job_id = ?", job_id)[0] or 0)
    no_usd = t.get("SELECT count(*) FROM spend_rows WHERE job_id = ? AND usd IS NULL", job_id)[0]
    unpriced = no_usd + t.get("SELECT count(*) FROM spend_unpriced WHERE job_id = ?", job_id)[0]
    estimated = t.get("SELECT count(*) FROM spend_rows WHERE job_id = ? AND basis = 'estimate'", job_id)[0] > 0
    return {"usd": usd, "unpriced": unpriced, "basis": "estimate" if estimated or unpriced > 0 else "reported"}


def outputs_of(t, job_id):
    rows = t.conn.execute("SELECT step, output FROM job_outputs WHERE job_id = ? ORDER BY at, step", (job_id,)).fetchall()
    return {step: json.loads(out) for step, out in rows}


# -- the queue (job-queue.ts) ---------------------------------------------------
def lane_hold(t, lane):
    r = t.get("SELECT job_id, stage, at FROM lane_holds WHERE lane = ? ORDER BY at, job_id LIMIT 1", lane)
    return None if r is None else {"jobId": r[0], "stage": r[1], "at": r[2]}


def hold_lane_in(t, job, by):
    if not LANE_PAYS[job["lane"]]:
        return False
    stage = (job.get("interruption") or {}).get("stage")
    t.run("INSERT OR IGNORE INTO lane_holds (lane, job_id, stage, at) VALUES (?, ?, ?, ?)", job["lane"], job["id"], stage, t.at)
    data = {"jobId": job["id"], "sentence": HOLD_SENTENCE}
    if stage is not None:
        data["stage"] = stage
    append(t, machine(by), "lane.held", {"kind": "lane", "id": job["lane"]}, lane=job["lane"], data=data)
    return True


def interrupt(t, job, by, why):
    """job-run.ts `interrupt`: the holder and the step in flight named, the spend re-projected, a paid lane held."""
    holder = (job.get("lease") or {}).get("holder") or by
    stage = job["progress"].get("stage")
    out = move(job, "interrupted")
    out["interruption"] = dict({"at": t.at, "holder": holder}, **({} if stage is None else {"stage": stage}))
    out["spend"] = meter_of(t, job["id"])
    put(t, out)
    data = {"why": why, "holder": {"bootId": holder["bootId"], "pid": holder["pid"], "host": holder["host"]}}
    if stage is not None:
        data["stage"] = stage
    job_event(t, by, out, "job.interrupted", data)
    hold_lane_in(t, out, by)
    return out


def running_on(t, lane, slot):
    ids = [r[0] for r in t.conn.execute("SELECT id FROM jobs WHERE state = 'running' AND lane = ? ORDER BY n", (lane,)).fetchall()]
    return [j for j in (load(t, i) for i in ids) if j.get("slot") == slot]


def dry_only_from(env=None):
    return (os.environ if env is None else env).get("GRAVITONE_DRY_ONLY") == "1"
