"""The ending of a job, told to its producer: Node's job-settle.ts for the Python driver (L41).

job.py calls `settle` after every transaction that ends a job here (finish, fail, the breaker,
a drive that died in an error, the take-over sweep's interruption), and `recover` is the sweep a
worker runs before it looks. A worker passes `settles={producer: fn(job, ending)}` to `Jobs`;
the function copies the ending onto the producer's own v1 artefact (forge's run.json), which
otherwise kept reading its live stage after a SIGKILL until somebody drove the job again.

ONCE PER ENDING. A settle records `job.settled` (or, when it raises, Node's
`job.settle-failed` with the sentence - never a change to the ending), and an ending is owed a
settle exactly while no such event follows it. That is what lets `recover` settle the endings a
NODE recovery made (it interrupts a dead Python holder's job and has no Python settle to call)
without telling any ending twice: a retried job that ends again is owed again.
"""
import sqlite3
import sys

from job_record import fence_loss, interrupt, job_event, load, ms, read_row
from kernel_store import kernel_lease

ENDINGS = ("done", "failed", "interrupted")
_gone = kernel_lease().gone


def settle(jobs, job_id):
    """Tell the job's producer how it ended, once per ending, if this worker carries a settle
    for it. Called after the ending's transaction committed: a settle copies a fact onto the
    producer's own files and can never undo it. Returns the ending settled, or None."""
    with jobs.tx() as t:
        job = load(t, job_id)
    fn = jobs.settles.get(job["producer"])
    if fn is None or job["state"] not in ENDINGS or not owed(jobs, job_id):
        return None
    try:
        fn(job, job["state"])
        typ, data = "job.settled", {"ending": job["state"]}
    except Exception as e:  # noqa: BLE001 - recorded on the job, Node's job.settle-failed; the ending stands
        typ, data = "job.settle-failed", {"ending": job["state"], "message": str(e) or type(e).__name__}
    try:
        with jobs.tx() as t:
            job_event(t, jobs.holder, load(t, job_id), typ, data)
    except sqlite3.Error as e:
        # Node's settleAfter: the ending stands, and so does the call that made it (a finish, a
        # claim holding a granted run). Unrecorded, the ending is still owed: recover tells it again.
        print("job %s: %s was not recorded: %s" % (job_id, typ, e), file=sys.stderr)
    return job["state"]


def owed(jobs, job_id):
    """Whether the job's newest ending has no settle (or settle failure) recorded after it."""
    with jobs.tx() as t:
        ended = t.get("SELECT max(seq) FROM events WHERE subject_id = ? AND type IN ('job.done', 'job.failed', 'job.interrupted')", job_id)[0]
        told = t.get("SELECT max(seq) FROM events WHERE subject_id = ? AND type IN ('job.settled', 'job.settle-failed')", job_id)[0]
    return ended is not None and (told is None or told < ended)


def recover(jobs, producers):
    """job-run.ts `recover` for this worker's producers: a running job whose holder is gone or
    whose slot's fence moved is named interrupted (a paid lane holds); then every ending of
    those producers nobody settled is settled - whoever ended it. Returns the settled ids."""
    names = tuple(producers)
    if not names:
        return []
    marks = ",".join("?" * len(names))
    with jobs.tx() as t:
        for (jid,) in t.conn.execute("SELECT id FROM jobs WHERE state = 'running' AND json_extract(record, '$.producer') IN (%s) ORDER BY n" % marks, names).fetchall():
            job = load(t, jid)
            lease = job.get("lease") or {}
            loss = fence_loss(read_row(t, job["slot"]), lease.get("fence"), ms(t.at))
            why = loss or ("holder-gone" if _gone(lease["holder"], jobs.holder, jobs.alive) else None)
            if why is not None:
                interrupt(t, job, jobs.holder, why)
        ended = [r[0] for r in t.conn.execute(
            "SELECT id FROM jobs WHERE state IN ('done', 'failed', 'interrupted') AND json_extract(record, '$.producer') IN (%s) ORDER BY n" % marks, names).fetchall()]
    return [jid for jid in ended if settle(jobs, jid) is not None]
