"""A project's held parts, released, in Python: records/write.ts `releaseHeldIn` over
records/read.ts `projectModel` and @gt/domain/plan.ts `partStatesOf`, as far as a release reads
them - which parts are RATIFIED - and nothing more (no options, no prices, no schedule).

WHY PYTHON HAS IT. A Node driver books a part's job done and, in that SAME transaction, moves
every planned job whose upstream is now ratified to queued (job-run.ts `finish`), so no crash
can leave a finished part with its dependants parked. A Python worker finishing a part's job
(a forge sweep, a Dojo cycle on the card) wrote `done` and released nothing: the plan's next
part sat `planned` until some Node write happened to walk the project. job.py `finish` now
calls `release_held_in` inside its own finishing transaction, with Node's rules, and
spec/job.json holds the two languages to the same releases.

The rules, from partStatesOf: an unlaunched project releases nothing (every part is `draft`); a
work part with a job is ratified exactly when its job is `done`; a gate part is ratified when
its upstream is all ratified and its packet (`pkt:step:<gate>`, parts/gates.ts
`gatePacketFact`) is committed; a slot part never is from here (`gateContext` gives no slot
fact). A part with no record behind its job id is not ratified.
"""
import json

from job_record import JobError, job_event, load, move, put


def _project(t, project_id):
    r = t.get("SELECT record FROM projects WHERE id = ?", project_id)
    if r is None:
        raise JobError("no project %s" % project_id)
    p = json.loads(r[0])
    if p.get("discardedAt") is not None:
        raise JobError("project %s was discarded at %s" % (project_id, p["discardedAt"]))
    return p


def _job_state(t, job_id):
    r = t.get("SELECT record FROM jobs WHERE id = ?", job_id)
    return None if r is None else json.loads(r[0])["state"]


def gate_packet_fact(t, gate_part_id):
    """parts/gates.ts `gatePacketFact`: committed | rejected | open, or None while no packet is open."""
    r = t.get("SELECT state FROM packets WHERE id = ?", "pkt:step:%s" % gate_part_id)
    if r is None:
        return None
    return "committed" if r[0] == "committed" else "rejected" if r[0] == "returned" else "open"


def ratified_parts(t, project_id):
    """The ids of the project's ratified parts, by partStatesOf's walk; and its rows."""
    project = _project(t, project_id)
    rows = []
    for _ord, job_id, record in t.conn.execute(
            "SELECT ord, job_id, record FROM parts WHERE project_id = ? ORDER BY ord", (project_id,)).fetchall():
        rows.append({"part": json.loads(record)["part"], "jobId": job_id})
    if project.get("launchedAt") is None:
        return set(), rows
    by_id = {r["part"]["id"]: r for r in rows}
    memo = {}

    def ratified(pid):
        if pid in memo:
            return memo[pid]
        memo[pid] = False  # a cycle (refused at the door) reads unratified instead of recursing
        row = by_id.get(pid)
        if row is None:
            return False
        part = row["part"]
        ups = all([ratified(u) for u in part.get("after", [])])
        if part["kind"] == "gate":
            out = ups and row["jobId"] is None and gate_packet_fact(t, pid) == "committed"
        elif part["kind"] == "slot":
            out = False
        else:
            out = row["jobId"] is not None and _job_state(t, row["jobId"]) == "done"
        memo[pid] = out
        return out

    return {pid for pid in by_id if ratified(pid)}, rows


def release_held_in(t, project_id, by):
    """records/write.ts `releaseHeldIn`: every planned job whose upstream is ratified joins its line."""
    done, rows = ratified_parts(t, project_id)
    released = []
    for row in rows:
        if row["jobId"] is None or _job_state(t, row["jobId"]) != "planned":
            continue
        if not all(dep in done for dep in row["part"].get("after", [])):
            continue
        out = move(load(t, row["jobId"]), "queued")
        put(t, out)
        job_event(t, by, out, "job.released", {"from": "planned"})
        released.append(row["jobId"])
    return released
