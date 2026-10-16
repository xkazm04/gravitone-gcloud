"""The ledger's append, in Python: packages/kernel/src/events.ts `append` for a writer that
is not Node. Standard library only.

    from kernel_ledger import append
    append(t, {"kind": "machine", "id": "box/4242"}, "job.step-done",
           {"kind": "job", "id": job_id}, lane="gpu.local", data={...})

One body, one canonical form, one chain: verify_events.py holds the byte rules and the
Node verifier re-derives every row this writes (test/lease.mixed.test.ts and
test/job.python.test.ts run Node's `verify` over a store Python appended to). It lived
inside lease.py while the lease was the only Python writer; the job protocol (job.py) is
the second, and a second copy of "how a row is hashed" is how two writers drift apart.

The caller's transaction is the outbox (events.ts says why): `t` is lease.Tx, opened with
BEGIN IMMEDIATE, so the head read here and the insert below cannot interleave with another
process's append, and the event commits with the state change it records or not at all.
The projection-only fields (occurredAt, atSrc, key) are never written from here: a
Python writer records acts as they happen, it does not import history.
"""

import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    # BEHIND the caller's own entries, never in front: to a GPU tenant `lease` is pipeline/gpu's
    # broker, and a library module that put this folder first would hand it the kernel's instead.
    sys.path.append(_HERE)
from verify_events import canonical, chain_hash, GENESIS  # noqa: E402

ACTOR_KINDS = ("operator", "agent", "machine")
COST_SOURCES = ("real", "model", "illustrative")


def append(t, actor, typ, subject, lane=None, data=None, cost=None):
    """Append one event inside `t` and return its seq. Raises ValueError for a body the
    Node door would refuse, which rolls the caller's transaction back with it."""
    if actor.get("kind") not in ACTOR_KINDS or not actor.get("id"):
        raise ValueError("ledger: actor %r is not an operator, agent or machine with an id" % (actor,))
    if not typ or not subject.get("kind") or not subject.get("id"):
        raise ValueError("ledger: an event needs a type and a subject {kind, id}")
    data = {} if data is None else data
    if not isinstance(data, dict):
        raise ValueError("ledger: event data is an object")
    if cost is not None and (cost.get("src") not in COST_SOURCES or not isinstance(cost.get("usd"), (int, float)) or cost["usd"] < 0):
        raise ValueError("ledger: cost %r is not {usd >= 0, src}" % (cost,))
    head = t.get("SELECT seq, hash FROM events ORDER BY seq DESC LIMIT 1")
    prev_seq, prev_hash = (head[0], head[1]) if head else (0, GENESIS)
    body = {"seq": prev_seq + 1, "at": t.at, "actor": {"kind": actor["kind"], "id": actor["id"]},
            "type": typ, "subject": {"kind": subject["kind"], "id": subject["id"]}, "data": data,
            "prevHash": prev_hash}
    if lane is not None:
        body["lane"] = lane
    if cost is not None:
        body["cost"] = {"usd": cost["usd"], "src": cost["src"]}
    t.run("INSERT INTO events (seq, at, actor_kind, actor_id, type, subject_kind, subject_id, lane, cost_usd, cost_src, "
          "data, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          body["seq"], body["at"], actor["kind"], actor["id"], typ, subject["kind"], subject["id"], lane,
          None if cost is None else cost["usd"], None if cost is None else cost["src"],
          canonical(data), prev_hash, chain_hash(prev_hash, body))
    return body["seq"]


def machine(holder):
    """lease.ts `actorOf`: the ledger's word for a holding process."""
    return {"kind": "machine", "id": "%s/%s" % (holder["host"], holder["pid"])}
