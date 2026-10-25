"""Seeds a store with N ended forge jobs (all but OWED already settled) and prints what
Jobs.recover costs: the transactions it opened and the ids it settled.

    python recover_cost.py <store.sqlite> <N> <OWED>
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "py"))
import kernel_store  # noqa: E402
from job import Jobs  # noqa: E402
from kernel_ledger import append  # noqa: E402

store, n, owed = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
kernel_store.ensure_store(store)
jobs = Jobs(store, settles={"forge": lambda job, ending: None})
actor = {"kind": "machine", "id": "host/1"}
with jobs.tx() as t:
    for i in range(n + owed):
        jid = "job:forge:%d" % i
        state = ("done", "failed", "interrupted")[i % 3]
        rec = {"id": jid, "producer": "forge", "lane": "seat.text", "state": state, "attempt": 1, "of": {"kind": "run", "id": "r%d" % i}}
        t.run("INSERT INTO jobs (id, lane, state, record) VALUES (?, ?, ?, ?)", jid, "seat.text", state, json.dumps(rec))
        append(t, actor, "job." + state, {"kind": "job", "id": jid}, lane="seat.text", data={})
        if i < n:
            append(t, actor, "job.settled", {"kind": "job", "id": jid}, lane="seat.text", data={})
opened = [0]
real = jobs.tx


def counted():
    opened[0] += 1
    return real()


jobs.tx = counted
settled = jobs.recover(["forge"])
print(json.dumps({"settled": len(settled), "tx": opened[0]}))
jobs.close()
