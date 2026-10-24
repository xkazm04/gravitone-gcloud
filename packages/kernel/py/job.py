"""kernel/job in Python: the protocol a Python worker (forge, Dojo) runs a kernel job by -
the second implementation of the driver's store side in packages/kernel/src/job-run.ts,
over the same tables in the same SQLite store, with the standard library only.

    python job.py status <store.sqlite> <job-id>

What a worker calls, and nothing else (spec/job.json holds both languages to it):

    from job import Jobs
    jobs = Jobs(store_path)                        # kernel_store.ensure_store(store_location())
    run = jobs.claim(job_id)                       # NotQueued | LaneHeld | SlotsBusy | Refused
    with run:                                      # an exception fails it; leaving early parks it
        run.start_heartbeat()                      # a thread, every ttl/3; a lost slot stops the next call
        for step in steps:
            if step in run.outputs(): continue     # the plan IS the missing outputs (v1 MV)
            run.start(step, remaining=...)         # in flight from here: a crash names this step
            run.book(step, make(step))             # fenced; a zombie's late book raises FenceConflict
        run.finish()

THE SLOT, NOT THE LANE. A job claims `<lane>#<i>` through lease.py, trying the lane's
slots in order exactly as the Node driver does, so a Python job and a Node job on
gpu.local contend for the ONE slot gpu.local#1 and cannot both hold it; on seat.text they
share four. Every write presents the slot's fence (assert_fence) inside its transaction,
so a worker that woke after a take-over writes nothing - its job was already named
interrupted by whoever took the slot.

THE RULES ARE NODE'S, decision for decision (job-run.ts, job-core.ts, job-queue.ts): a
claim refuses anything not `queued` (a `planned` job waits for `release`); a held lane
(a crash on a PAID lane, decision 6) claims nothing until an operator acknowledges it; a
live job in a dry-only process is refused before anything is claimed; the take-over
sweep interrupts the older-fenced job found running on the slot and holds the lane when
the lane pays; the step in flight is `progress.stage`, set before the work and cleared by
its booking (job-coordination: in-flight-is-a-position); the breaker trips after
BREAKER_LIMIT consecutive vendor failures; nothing resumes an interrupted job.

THE ENDING REACHES THE PRODUCER, AND THE PLAN MOVES (L41). `Jobs(..., settles={producer: fn})`:
every ending made here is told to its producer once (job_settle.py), and a part's job finished
here releases the planned jobs behind it in the finishing transaction (kernel_records.py).

A STEP BOOKS NO MONEY. A step is booked at $0 real and the record's spend re-projected from the
meter (`meter_of`), so spend reconciles for a Python job by construction; a priced call made
under a job goes through kernel_meter.py (reserve, call, settle), never through a step's book.
"""
import json
import os
import sys
import threading
import uuid

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.append(_HERE)  # behind the caller's entries: job_record.py says why
from job_record import (BREAKER_LIMIT, DEFAULT_TTL_S, ERROR_CODES, HOLD_SENTENCE, FenceConflict, JobError,  # noqa: E402,F401
                        LaneHeld, LeaseError, LeaseLost, NotQueued, Refused, SlotsBusy, Stopped, Tx, assert_fence,
                        claim_in, connect, dry_only_from, fence_loss, heartbeat_in, interrupt, job_event, lane_hold,
                        lane_slots, load, meter_of, move, ms, outputs_of, pid_alive, process_holder, put, read_row,
                        release_in, running_on, without_stage)
from verify_events import canonical, usage  # noqa: E402
from kernel_records import release_held_in  # noqa: E402
import job_settle  # noqa: E402

# -- the drive ------------------------------------------------------------------
class Jobs:
    def __init__(self, path, holder=None, alive=None, clock=None, settles=None):
        from datetime import datetime, timezone
        self.path = path
        self.settles = dict(settles or {})
        self.conn = connect(path)
        self.holder = holder or process_holder()
        self.alive = alive or pid_alive
        self.clock = clock or (lambda: datetime.now(timezone.utc))

    def tx(self):
        return Tx(self.conn, self.clock)

    def get(self, job_id):
        with self.tx() as t:
            return load(t, job_id)

    def head(self, lane):
        """job-queue.ts `nextClaimable`: the head of the lane's line, or None while it is held or empty."""
        with self.tx() as t:
            if lane_hold(t, lane) is not None:
                return None
            r = t.get("SELECT record FROM jobs WHERE lane = ? AND state = 'queued' ORDER BY ord, n LIMIT 1", lane)
            return None if r is None else json.loads(r[0])

    def claim_next(self, lane, producers, **kw):
        """Claim the lane's head when this worker makes it; None when there is none or it is
        another producer's (the head is never skipped: order is the operator's)."""
        job = self.head(lane)
        if job is None or job["producer"] not in producers:
            return None
        return self.claim(job["id"], lane=lane, **kw)

    def claim(self, job_id, lane=None, ttl_s=DEFAULT_TTL_S, ticket=None, dry_only=None):
        dry_only = dry_only_from() if dry_only is None else dry_only
        ticket = ticket or uuid.uuid4().hex
        taken = []
        with self.tx() as t:
            outcome = self._claim_in(t, job_id, lane, ttl_s, ticket, dry_only, taken)
        for orphan in taken:
            self.settle(orphan)
        if isinstance(outcome, JobError):
            raise outcome
        return outcome

    def _claim_in(self, t, job_id, lane, ttl_s, ticket, dry_only, taken):
        job = load(t, job_id)
        if lane is not None and job["lane"] != lane:
            raise Refused("job %s is declared on %s; a %s worker may not run it" % (job_id, job["lane"], lane))
        if job["state"] != "queued":
            return NotQueued(job)
        if job["mode"]["kind"] == "live" and dry_only:
            raise Refused("job %s is armed live and this process may only run dry (GRAVITONE_DRY_ONLY=1); nothing was claimed" % job_id)
        held = lane_hold(t, job["lane"])
        if held is not None:
            at = "" if held["stage"] is None else " at %s" % held["stage"]
            return LaneHeld("%s is held by job %s%s: %s" % (job["lane"], held["jobId"], at, HOLD_SENTENCE), held["jobId"])
        holders = []
        for slot in lane_slots(job["lane"]):
            c = claim_in(t, slot, self.holder, ticket, ttl_s, False, self.alive)
            if c["kind"] != "granted":
                if c.get("holder"):
                    holders.append("%s/%s" % (c["holder"]["host"], c["holder"]["pid"]))
                continue
            fence = c["lease"]["fence"]
            held_now = None
            for orphan in running_on(t, job["lane"], slot):
                if orphan["lease"]["fence"] < fence:
                    out = interrupt(t, orphan, self.holder, "lane-taken-over")
                    taken.append(out["id"])
                    if out["state"] == "interrupted" and lane_hold(t, job["lane"]) is not None:
                        held_now = out["id"]
            if held_now is not None:
                # The take-over found a paid step that died unbooked: the lane holds, and the slot goes back.
                release_in(t, slot, fence)
                return LaneHeld("%s is held: a job on %s was found interrupted - look first" % (job["lane"], slot), held_now)
            run = move(dict(job, progress=without_stage(job["progress"])), "running")
            run["lease"], run["slot"] = c["lease"], slot
            put(t, run)
            job_event(t, self.holder, run, "job.claimed", {"fence": fence, "slot": slot})
            return JobRun(self, job_id, job["lane"], slot, fence, ttl_s)
        why = "every %s slot is held (%s)" % (job["lane"], ", ".join(holders)) if holders else "every %s slot is held" % job["lane"]
        return SlotsBusy(why)

    # -- the ending, settled (job_settle.py) ----------------------------------------

    def settle(self, job_id):
        return job_settle.settle(self, job_id)

    def recover(self, producers):
        return job_settle.recover(self, producers)

    def close(self):
        self.conn.close()


class JobRun:
    """One claimed job on one slot under one fence. Every write is fenced."""

    def __init__(self, jobs, job_id, lane, slot, fence, ttl_s):
        self.jobs, self.job_id, self.lane, self.slot, self.fence, self.ttl_s = jobs, job_id, lane, slot, fence, ttl_s
        self.ended = False
        self._lost = None
        self._beat = None

    def _alive_or_raise(self):
        if self._lost is not None:
            raise self._lost

    def outputs(self):
        with self.jobs.tx() as t:
            return outputs_of(t, self.job_id)

    def heartbeat(self):
        with self.jobs.tx() as t:
            heartbeat_in(t, self.slot, self.fence)

    def start_heartbeat(self, every_s=None):
        """Renew the slot on a timer (lease-renewal: every ttl/3), never per unit of work: the
        unit that takes an hour is exactly when the lease matters. Its own connection, since a
        sqlite3 connection belongs to its thread; a loss is carried to the next call."""
        every = every_s if every_s is not None else max(1.0, self.ttl_s / 3.0)
        stop = threading.Event()

        def beat():
            conn = connect(self.jobs.path)
            try:
                while not stop.wait(every):
                    try:
                        with Tx(conn, self.jobs.clock) as t:
                            heartbeat_in(t, self.slot, self.fence)
                    except LeaseLost as e:
                        self._lost = LeaseLost("job %s lost %s: %s" % (self.job_id, self.slot, e))
                        return
            finally:
                conn.close()

        th = threading.Thread(target=beat, name="job-heartbeat-%s" % self.job_id, daemon=True)
        th.start()
        self._beat = (stop, th)

    def _stop_heartbeat(self):
        if self._beat is not None:
            stop, th = self._beat
            stop.set()
            th.join(5)
            self._beat = None

    def _end(self, t, job, typ, data):
        put(t, job)
        job_event(t, self.jobs.holder, job, typ, data)
        release_in(t, self.slot, self.fence)
        self.ended = True

    def start(self, step, remaining=1):
        """Dispatch: from this commit on, a crash names `step` as the one that may have spent."""
        self._alive_or_raise()
        with self.jobs.tx() as t:
            assert_fence(t, self.slot, self.fence)
            job = load(t, self.job_id)
            if job["state"] != "running":
                release_in(t, self.slot, self.fence)
                self.ended = True
                stopped = Stopped(job)
            else:
                stopped = None
                if job["failStreak"] >= BREAKER_LIMIT:
                    msg = "%d consecutive vendor failures" % BREAKER_LIMIT
                    out = move(job, "failed")
                    out["error"] = {"code": "unavailable", "message": msg}
                    self._end(t, out, "job.failed", {"code": "unavailable", "message": msg})
                    stopped = Stopped(out)
                else:
                    done = t.get("SELECT count(*) FROM job_outputs WHERE job_id = ?", self.job_id)[0]
                    if t.get("SELECT 1 FROM job_outputs WHERE job_id = ? AND step = ?", self.job_id, step) is not None:
                        raise Refused("job %s: step %s is booked already; the plan is the missing outputs" % (self.job_id, step))
                    heartbeat_in(t, self.slot, self.fence)
                    flying = dict(job, lease=dict(job["lease"], heartbeatAt=t.at),
                                  progress={"done": done, "total": done + max(1, remaining), "stage": step})
                    put(t, flying)
                    job_event(t, self.jobs.holder, flying, "job.step-started", {"step": step, "estimateUsd": 0})
        if stopped is not None:
            self._stop_heartbeat()
            self._told()
            raise stopped

    def book(self, step, output):
        """Book what `step` made, under the fence. A run that lost its slot raises FenceConflict and writes nothing."""
        self._alive_or_raise()
        if not isinstance(output, dict):
            raise Refused("job %s: a step output is a JSON object" % self.job_id)
        with self.jobs.tx() as t:
            assert_fence(t, self.slot, self.fence)
            cur = load(t, self.job_id)
            progress = without_stage(cur["progress"])
            done = progress["done"] + 1
            booked = dict(cur, failStreak=0, progress=dict(progress, done=done, total=max(progress["total"], done)))
            booked["spend"] = meter_of(t, self.job_id)
            t.run("INSERT INTO job_outputs (job_id, step, output, fence, at) VALUES (?, ?, ?, ?, ?)",
                  self.job_id, step, canonical(output), self.fence, t.at)
            put(t, booked)
            job_event(t, self.jobs.holder, booked, "job.step-done", {"step": step})

    def fail_step(self, step, message, breaker_limit=BREAKER_LIMIT):
        """A vendor failure (ComfyUI refused, Ollama timed out): counted; the breaker fails the job at its limit."""
        self._alive_or_raise()
        with self.jobs.tx() as t:
            assert_fence(t, self.slot, self.fence)
            cur = load(t, self.job_id)
            streak = cur["failStreak"] + 1
            counted = dict(cur, failStreak=streak, progress=without_stage(cur["progress"]))
            data = {"step": step, "kind": "vendor-failure", "message": message, "failStreak": streak}
            if cur["state"] == "running" and streak >= breaker_limit:
                msg = "%d consecutive vendor failures; the last: %s. Fix the cause, then retry." % (breaker_limit, message)
                out = move(counted, "failed")
                out["error"] = {"code": "unavailable", "message": msg}
                put(t, out)
                job_event(t, self.jobs.holder, out, "job.step-failed", data)
                self._end(t, out, "job.failed", {"code": "unavailable", "message": msg})
            else:
                put(t, counted)
                job_event(t, self.jobs.holder, counted, "job.step-failed", data)
        if self.ended:
            self._stop_heartbeat()
            self._told()

    def fail(self, code, message):
        """The job fails with this sentence verbatim (v1 MV). A step in flight is booked as fatal first."""
        if code not in ERROR_CODES:
            raise Refused("%r is not an error code (%s)" % (code, ", ".join(ERROR_CODES)))
        with self.jobs.tx() as t:
            assert_fence(t, self.slot, self.fence)
            cur = load(t, self.job_id)
            stage = cur["progress"].get("stage")
            base = dict(cur, progress=without_stage(cur["progress"]))
            if cur["state"] != "running":
                put(t, base)
                release_in(t, self.slot, self.fence)
                self.ended = True
            else:
                out = move(base, "failed")
                out["error"] = {"code": code, "message": message}
                if stage is not None:
                    put(t, out)
                    job_event(t, self.jobs.holder, out, "job.step-failed",
                              {"step": stage, "kind": "fatal", "message": message, "failStreak": out["failStreak"]})
                self._end(t, out, "job.failed", {"code": code, "message": message})
        self._stop_heartbeat()
        self._told()

    def finish(self):
        self._alive_or_raise()
        with self.jobs.tx() as t:
            assert_fence(t, self.slot, self.fence)
            job = load(t, self.job_id)
            if job["state"] != "running":
                release_in(t, self.slot, self.fence)
                self.ended = True
                stopped = Stopped(job)
            else:
                if job["progress"].get("stage") is not None:
                    raise Refused("job %s: step %s is in flight; book or fail it before finishing" % (self.job_id, job["progress"]["stage"]))
                done = move(job, "done")
                self._end(t, done, "job.done", {"spendUsd": job["spend"]["usd"]})
                # job-run.ts `finish`: a part's job done is its part ratified - what waited for it
                # is released in THIS transaction, so no crash can leave it parked.
                project_id = (done.get("correlation") or {}).get("projectId")
                if done["of"]["kind"] == "part" and project_id is not None:
                    release_held_in(t, project_id, self.jobs.holder)
                stopped = None
        self._stop_heartbeat()
        self._told()
        if stopped is not None:
            raise stopped

    def park(self):
        """job-run.ts `yield`: back to the queue (running -> paused -> queued), the slot given back."""
        with self.jobs.tx() as t:
            assert_fence(t, self.slot, self.fence)
            job = load(t, self.job_id)
            release_in(t, self.slot, self.fence)
            self.ended = True
            if job["state"] == "running":
                back = move(move(dict(job, progress=without_stage(job["progress"])), "paused"), "queued")
                put(t, back)
                job_event(t, self.jobs.holder, back, "job.yielded", {"fence": self.fence})
        self._stop_heartbeat()

    def _settle_error(self, code, message):
        """job-run.ts `settleError`: a drive that ends in an error never leaves its job running."""
        with self.jobs.tx() as t:
            job = load(t, self.job_id)
            if job["state"] != "running" or (job.get("lease") or {}).get("fence") != self.fence or job.get("slot") != self.slot:
                return
            loss = fence_loss(read_row(t, self.slot), self.fence, ms(t.at))
            if loss is not None:
                interrupt(t, job, self.jobs.holder, "fence-lost: %s" % loss)
            else:
                out = move(job, "failed")
                out["error"] = {"code": code, "message": message}
                self._end(t, out, "job.failed", {"code": code, "message": message})
        self.jobs.settle(self.job_id)

    def _told(self):
        """After a transaction that may have ended the job: its producer's settle, if it did."""
        if self.ended:
            self.jobs.settle(self.job_id)

    def __enter__(self):
        return self

    def __exit__(self, kind, value, tb):
        self._stop_heartbeat()
        if self.ended:
            return False
        if kind is None:
            self.park()
        elif isinstance(value, (FenceConflict, LeaseLost)):
            self._settle_error("conflict", str(value))
        elif isinstance(value, Exception):
            self._settle_error("internal", str(value) or kind.__name__)
        return False


def main(argv):
    if len(argv) == 4 and argv[1] == "status":
        jobs = Jobs(argv[2])
        try:
            print(json.dumps(jobs.get(argv[3])))
        finally:
            jobs.close()
        return 0
    print(usage(__doc__), file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
