"""A paid call made from Python, through the meter: spend/ledger.ts `book` on the JOB_USD class
(spend/meter.ts), against the job the call is for. Standard library only.

    from kernel_meter import Meter, MoneyStop, DryCall
    meter = Meter(store_path, job_id=..., who="dojo-judge")
    value = meter.call("judge:p1", estimate_usd=0.002, provider="google", model="gemini-3.6-flash",
                       call=lambda: (answer, None))          # (value, reported usd or None)

WHY (L41, decision 7: spend is the meter's). dojo_judge.py called Gemini from Python with a
key read out of .env, and nothing recorded it: a Dojo cycle's Ledger showed its renders and
never its judge. Python had no door to the meter at all ("Python books no money", job.py), so
the call could not have been booked if anyone had wanted to. This is that door, and it is the
SAME arithmetic Node's meter does for an uncapped class: no hold (JOB_USD has no period
ceiling), the call, then one booked row with the job and the step on it, `spend.booked` on the
chain, the class counters bumped, and the job's record spend re-projected from the meter so
the spend-reconciles-to-the-meter invariant holds for the job the call was booked to.

WHAT IT REFUSES, BEFORE THE CALL (fail-closed, never after):
  - a DRY job, or a process under GRAVITONE_DRY_ONLY=1: `DryCall` - the caller stands in; no
    vendor is called and nothing is booked (a dry job books no spend, decision 4);
  - a call whose estimate would carry the job past its own ceiling: `MoneyStop`, with the
    figures. A ceiling is a stop point (Director ruling): the call that would cross it is not made.
A call that raises books nothing (Node's meter books only what answered) and the error passes.
A call with no reported figure is booked at its ESTIMATE, basis "estimate" - a price nobody
read is a model figure and says so, never a fabricated "real" one.
"""
import os
import sys
from datetime import datetime, timezone

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.append(_HERE)  # behind the caller's entries: job_record.py says why
from job_record import Tx, connect, dry_only_from, load, meter_of, ms, put, usd6  # noqa: E402
from kernel_ledger import append  # noqa: E402
from verify_events import canonical  # noqa: E402

JOB_USD = "job-usd"  # spend/meter.ts JOB_USD: unit usd, a 30-day window, no ceiling


class MoneyStop(Exception):
    """The call would cross the job's ceiling; it was not made."""


class DryCall(Exception):
    """The job is dry (or the process may only run dry): no vendor is called, nothing is booked."""


def newest_job(t, base_id):
    """The newest job of a launch whose relaunches are `<base>~<k>` (records/launch.ts `runJobId`)."""
    r = t.get("SELECT id FROM jobs WHERE id = ? OR id LIKE ? ORDER BY n DESC LIMIT 1", base_id, base_id + "~%")
    return None if r is None else r[0]


class Meter:
    def __init__(self, path, job_id=None, who="python", clock=None, env=None):
        self.path, self.job_id, self.who = path, job_id, who
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.env = os.environ if env is None else env

    def check(self, estimate_usd):
        """The refusals, read now: DryCall or MoneyStop, or None when the call may be made."""
        conn = connect(self.path)
        try:
            with Tx(conn, self.clock) as t:
                job = None if self.job_id is None else load(t, self.job_id)
                if dry_only_from(self.env) or (job is not None and job["mode"]["kind"] == "dry"):
                    why = "the process may only run dry (GRAVITONE_DRY_ONLY=1)" if dry_only_from(self.env) else "job %s is dry" % job["id"]
                    return DryCall("%s: no vendor is called and nothing is booked" % why)
                ceiling = None if job is None else job.get("ceilingUsd")
                if ceiling is not None:
                    spent = meter_of(t, job["id"])["usd"]
                    if usd6(spent + estimate_usd) > ceiling:
                        return MoneyStop("job %s: this call's $%.4f would carry it past its ceiling $%.2f ($%.4f spent); "
                                         "it was not made" % (job["id"], estimate_usd, ceiling, spent))
            return None
        finally:
            conn.close()

    def call(self, step, estimate_usd, provider, model, call):
        """Refuse before, call, book after. `call()` returns (value, reported usd or None)."""
        refused = self.check(estimate_usd)
        if refused is not None:
            raise refused
        value, usd = call()
        reported = isinstance(usd, (int, float)) and usd > 0
        amount = usd6(usd if reported else estimate_usd)
        basis = "vendor" if reported else "estimate"
        conn = connect(self.path)
        try:
            with Tx(conn, self.clock) as t:
                t.run("INSERT INTO spend_rows (class, at_ms, amount, outcome, basis, axes, reservation_id, job_id, step, usd) "
                      "VALUES (?, ?, ?, 'served', ?, ?, NULL, ?, ?, ?)",
                      JOB_USD, ms(t.at), amount, basis, canonical({"model": model, "provider": provider}), self.job_id, step, amount)
                t.run("INSERT INTO spend_counters (class, name, value) VALUES (?, 'booked', 1) "
                      "ON CONFLICT (class, name) DO UPDATE SET value = value + excluded.value", JOB_USD)
                append(t, {"kind": "machine", "id": self.who}, "spend.booked", {"kind": "spend-class", "id": JOB_USD},
                       data={"class": JOB_USD, "unit": "usd", "booked": 1, "unpriced": 0, "total": amount},
                       cost={"usd": amount, "src": "real" if reported else "model"})
                if self.job_id is not None:
                    job = load(t, self.job_id)
                    job["spend"] = meter_of(t, self.job_id)
                    put(t, job)
        finally:
            conn.close()
        return value
