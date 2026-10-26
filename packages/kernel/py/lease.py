"""kernel/lease in Python: the second implementation of packages/kernel/src/lease-core.ts
and lease.ts, over the same tables in the same SQLite store, with the standard library only.

    python lease.py status <store.sqlite> <resource>

job.py and pipeline/gpu/lease.py (v1's GPU broker, a shim over this module) load it as
`gt_kernel_lease` through kernel_store.kernel_lease(), since a GPU tenant's `lease` is that broker:
    lease = leases.acquire("gpu.local", wait_s=600)    # leases = kernel_lease().Leases(store); FIFO, LeaseTimeout
    try:
        with leases.tx() as t:                         # every write, in its own transaction:
            assert_fence(t, "gpu.local", lease.fence)  # raises FenceConflict; the transaction rolls back
        lease.heartbeat()                              # on a timer, every ttl/3 s; raises LeaseLost
    finally:
        lease.release()

A holder that sees LeaseLost or FenceConflict stops at once: another holder has the
resource, and every write it still tries is refused by the fence. The rules (one
holder, FIFO tickets, a pid probed only on its own host, a reused pid told apart by
bootId, expiry is loss, the fence never reused) are stated in lease-core.ts; this file
mirrors them decision for decision, and spec/lease.json holds both to one table
(lease_spec.py runs it here).

Every grant, reclaim, release and queue change appends its Event in the same
transaction, through the hash chain that verify_events.py re-derives; a heartbeat
and a waiter's poll are liveness pings and write none.
"""

import contextlib
import json
import os
import socket
import sqlite3
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.append(_HERE)  # behind the caller's entries: to a GPU tenant `lease` is pipeline/gpu's
from kernel_ledger import append, machine  # noqa: E402
from lease_pid import pid_alive  # noqa: E402
from verify_events import usage  # noqa: E402

DEFAULT_TTL_S = 120
BUSY_TIMEOUT_S = 10.0
# @gt/domain/lane RESOURCE_LANES: a lease on one of these carries it as the event's lane.
RESOURCE_LANES = ("gpu.local", "box.render", "box.blender", "box.chrome", "seat.text",
                  "cloud.google", "cloud.elevenlabs", "cloud.leonardo", "cloud.qwen")


def lane_of(resource):
    """@gt/domain/lane `laneOfSlot`: a lane slot (`seat.text#2`) is its lane's row on the
    Runs day-line, as the bare lane is; any other resource carries no lane."""
    hash_at = resource.rfind("#")
    lane = resource if hash_at < 0 else resource[:hash_at]
    return lane if lane in RESOURCE_LANES else None


class LeaseError(RuntimeError):
    """Base for every refusal this module makes."""


class LeaseTimeout(LeaseError):
    """A waiter ran out of time; Node answers `unavailable`."""


class LeaseLost(LeaseError):
    """The holder's lease is gone (released, taken over, or expired)."""


class FenceConflict(LeaseError):
    """A write presented a fence that no longer holds; Node answers `conflict`."""


# -- time: one ISO form, the one Node's Date#toISOString writes ---------------
def iso(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + "%03dZ" % (dt.microsecond // 1000)


EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)


def ms(at):
    """Date.parse, in integer milliseconds (a float timestamp * 1000 can land one short)."""
    return (datetime.strptime(at, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=timezone.utc) - EPOCH) // timedelta(milliseconds=1)


# -- the pure rules (lease-core.ts) --------------------------------------------
def gone(holder, me, alive):
    if holder["host"] != me["host"]:
        return False
    if holder["pid"] == me["pid"]:
        return holder["bootId"] != me["bootId"]
    return not alive(holder["pid"])


def expired(beat_at, ttl_s, now_ms):
    return now_ms - ms(beat_at) > ttl_s * 1000


def stale_reason(held, me, now_ms, alive):
    if gone(held["holder"], me, alive):
        return "holder-gone"
    if expired(held["heartbeatAt"], held["ttlS"], now_ms):
        return "heartbeat-expired"
    return None


def sweep_waiters(waiters, me, now_ms, alive, asking=None):
    live, writes = [], []
    for w in sorted(waiters, key=lambda x: x["n"]):
        why = None
        if w["ticket"] != asking:
            if gone(w["holder"], me, alive):
                why = "holder-gone"
            elif expired(w["seenAt"], w["ttlS"], now_ms):
                why = "unseen"
        if why is None:
            live.append(w)
        else:
            writes.append({"op": "leave", "waiter": w, "reason": why})
    return live, writes


def decide_claim(row, waiters, req, at, alive):
    now_ms = ms(at)
    writes = []
    held = row["held"] if row else None
    reclaims = row["reclaims"] if row else 0
    if held is not None:
        why = stale_reason(held, req["holder"], now_ms, alive)
        if why is not None:
            reclaims += 1
            writes.append({"op": "reclaim", "from": held, "reason": why, "reclaims": reclaims})
            held = None
    live, dropped = sweep_waiters(waiters, req["holder"], now_ms, alive, req["ticket"])
    writes.extend(dropped)
    mine = next((w for w in live if w["ticket"] == req["ticket"]), None)
    ahead = len(live) if mine is None else len([w for w in live if w["n"] < mine["n"]])
    if held is None and ahead == 0:
        lease = {"holder": req["holder"], "fence": (row["fence"] if row else 0) + 1,
                 "acquiredAt": at, "heartbeatAt": at, "ttlS": req["ttlS"]}
        writes.append({"op": "grant", "lease": lease, "ticket": req["ticket"]})
        return {"kind": "granted", "lease": lease}, writes
    holder = held["holder"] if held else None
    if not req["wait"]:
        return {"kind": "busy", "holder": holder, "ahead": ahead}, writes
    if mine is None:
        writes.append({"op": "enqueue", "position": ahead + 1, "waiter": {
            "ticket": req["ticket"], "holder": req["holder"], "enqueuedAt": at, "seenAt": at, "ttlS": req["ttlS"]}})
    else:
        writes.append({"op": "seen", "ticket": req["ticket"], "at": at})
    return {"kind": "queued", "position": ahead + 1, "holder": holder}, writes


def fence_loss(row, fence, now_ms):
    held = row["held"] if row else None
    if held is None:
        return "taken-over" if (row["fence"] if row else 0) > fence else "released"
    if held["fence"] != fence:
        return "taken-over"
    if expired(held["heartbeatAt"], held["ttlS"], now_ms):
        return "expired"
    return None


# -- the store ------------------------------------------------------------------
def connect(path):
    conn = sqlite3.connect(path, timeout=BUSY_TIMEOUT_S, isolation_level=None)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA synchronous = FULL")
    mode = conn.execute("PRAGMA journal_mode = WAL").fetchone()[0]
    if mode != "wal":
        conn.close()
        raise LeaseError("store %s refused WAL (journal_mode=%s)" % (path, mode))
    return conn


class Tx:
    """BEGIN IMMEDIATE, as Node's store.tx: the write lock is taken before the first
    read, so a read-modify-write never interleaves with another process's."""

    def __init__(self, conn, clock):
        self.conn, self.clock = conn, clock

    def __enter__(self):
        self.conn.execute("BEGIN IMMEDIATE")
        self.at = iso(self.clock())
        return self

    def __exit__(self, kind, value, tb):
        self.conn.execute("COMMIT" if kind is None else "ROLLBACK")
        return False

    def get(self, sql, *params):
        return self.conn.execute(sql, params).fetchone()

    def run(self, sql, *params):
        return self.conn.execute(sql, params)


def read_row(t, resource):
    r = t.get("SELECT fence, holder_boot, holder_pid, holder_host, acquired_at, heartbeat_at, ttl_s, reclaims "
              "FROM leases WHERE resource = ?", resource)
    if r is None:
        return None
    fence, boot, pid, host, acquired, beat, ttl, reclaims = r
    held = None if boot is None else {"holder": {"bootId": boot, "pid": pid, "host": host}, "fence": fence,
                                      "acquiredAt": acquired, "heartbeatAt": beat, "ttlS": ttl}
    return {"fence": fence, "held": held, "reclaims": reclaims}


def read_waiters(t, resource):
    rows = t.conn.execute("SELECT n, ticket, holder_boot, holder_pid, holder_host, enqueued_at, seen_at, ttl_s "
                          "FROM lease_waiters WHERE resource = ? ORDER BY n", (resource,)).fetchall()
    return [{"n": n, "ticket": ticket, "holder": {"bootId": b, "pid": p, "host": h},
             "enqueuedAt": enq, "seenAt": seen, "ttlS": ttl} for n, ticket, b, p, h, enq, seen, ttl in rows]


def append_event(t, by, resource, typ, data):
    """lease.ts `event`: the lease's acts on the ledger, through the one Python append."""
    append(t, machine(by), typ, {"kind": "lease", "id": resource}, lane=lane_of(resource),
           data=dict({"resource": resource}, **data))


def holder_data(h):
    return {"bootId": h["bootId"], "pid": h["pid"], "host": h["host"]}


NULL_HOLDER = ("holder_boot = NULL, holder_pid = NULL, holder_host = NULL, acquired_at = NULL, "
               "heartbeat_at = NULL, ttl_s = NULL")


def apply(t, resource, by, w):
    op = w["op"]
    if op == "reclaim":
        t.run("UPDATE leases SET " + NULL_HOLDER + ", reclaims = ? WHERE resource = ?", w["reclaims"], resource)
        append_event(t, by, resource, "lease.reclaimed", {"fence": w["from"]["fence"], "reason": w["reason"],
                                                          "holder": holder_data(w["from"]["holder"]), "reclaims": w["reclaims"]})
    elif op == "leave":
        t.run("DELETE FROM lease_waiters WHERE resource = ? AND ticket = ?", resource, w["waiter"]["ticket"])
        append_event(t, by, resource, "lease.left", {"ticket": w["waiter"]["ticket"], "reason": w["reason"],
                                                     "holder": holder_data(w["waiter"]["holder"])})
    elif op == "grant":
        lease, h = w["lease"], w["lease"]["holder"]
        t.run("INSERT INTO leases (resource, fence, holder_boot, holder_pid, holder_host, acquired_at, heartbeat_at, ttl_s) "
              "VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (resource) DO UPDATE SET fence = excluded.fence, "
              "holder_boot = excluded.holder_boot, holder_pid = excluded.holder_pid, holder_host = excluded.holder_host, "
              "acquired_at = excluded.acquired_at, heartbeat_at = excluded.heartbeat_at, ttl_s = excluded.ttl_s",
              resource, lease["fence"], h["bootId"], h["pid"], h["host"], lease["acquiredAt"], lease["heartbeatAt"], lease["ttlS"])
        t.run("DELETE FROM lease_waiters WHERE resource = ? AND ticket = ?", resource, w["ticket"])
        append_event(t, by, resource, "lease.claimed", {"fence": lease["fence"], "ticket": w["ticket"],
                                                        "holder": holder_data(h), "ttlS": lease["ttlS"]})
    elif op == "enqueue":
        q, h = w["waiter"], w["waiter"]["holder"]
        t.run("INSERT INTO lease_waiters (resource, ticket, holder_boot, holder_pid, holder_host, enqueued_at, seen_at, ttl_s) "
              "VALUES (?, ?, ?, ?, ?, ?, ?, ?)", resource, q["ticket"], h["bootId"], h["pid"], h["host"],
              q["enqueuedAt"], q["seenAt"], q["ttlS"])
        append_event(t, by, resource, "lease.queued", {"ticket": q["ticket"], "holder": holder_data(h), "position": w["position"]})
    elif op == "seen":
        t.run("UPDATE lease_waiters SET seen_at = ? WHERE resource = ? AND ticket = ?", w["at"], resource, w["ticket"])
    else:
        raise LeaseError("unknown write %r" % op)


# -- the transaction-level API (lease.ts claimIn / assertFence / ...) ----------
def claim_in(t, resource, holder, ticket, ttl_s, wait, alive):
    req = {"holder": holder, "ticket": ticket, "ttlS": ttl_s, "wait": wait}
    outcome, writes = decide_claim(read_row(t, resource), read_waiters(t, resource), req, t.at, alive)
    for w in writes:
        apply(t, resource, holder, w)
    return outcome


def assert_fence(t, resource, fence):
    """Inside the WRITER's transaction. Raises FenceConflict unless `fence` holds now."""
    lost = fence_loss(read_row(t, resource), fence, ms(t.at))
    if lost is not None:
        raise FenceConflict("lease %s: fence %d no longer holds (%s); the write is refused" % (resource, fence, lost))


def heartbeat_in(t, resource, fence):
    lost = fence_loss(read_row(t, resource), fence, ms(t.at))
    if lost is not None:
        raise LeaseLost(lost)
    t.run("UPDATE leases SET heartbeat_at = ? WHERE resource = ? AND fence = ?", t.at, resource, fence)


def release_in(t, resource, fence):
    row = read_row(t, resource)
    held = row["held"] if row else None
    if held is None or held["fence"] != fence:
        return False
    t.run("UPDATE leases SET " + NULL_HOLDER + " WHERE resource = ?", resource)
    append_event(t, held["holder"], resource, "lease.released", {"fence": fence})
    return True


def leave_in(t, resource, ticket):
    w = next((x for x in read_waiters(t, resource) if x["ticket"] == ticket), None)
    if w is None:
        return False
    apply(t, resource, w["holder"], {"op": "leave", "waiter": w, "reason": "gave-up"})
    return True


def status_in(t, resource, me, alive):
    row, now_ms = read_row(t, resource), ms(t.at)
    live, _ = sweep_waiters(read_waiters(t, resource), me, now_ms, alive)
    held = row["held"] if row else None
    return {"resource": resource, "fence": row["fence"] if row else 0, "holder": held,
            "stale": stale_reason(held, me, now_ms, alive) if held else None,
            "queue": live, "reclaims": row["reclaims"] if row else 0}


# -- a process holding a lease -----------------------------------------------
BOOT_ID = str(uuid.uuid4())


def process_holder():
    return {"bootId": BOOT_ID, "pid": os.getpid(), "host": socket.gethostname()}


class Lease:
    def __init__(self, leases, resource, fence, ttl_s):
        self.leases, self.resource, self.fence, self.ttl_s = leases, resource, fence, ttl_s

    def heartbeat(self):
        with self.leases.tx() as t:
            heartbeat_in(t, self.resource, self.fence)

    def release(self):
        with self.leases.tx() as t:
            return release_in(t, self.resource, self.fence)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.release()
        return False


class Leases:
    def __init__(self, path, holder=None, alive=None, clock=None):
        self.conn = connect(path)
        self.holder = holder or process_holder()
        self.alive = alive or pid_alive
        self.clock = clock or (lambda: datetime.now(timezone.utc))

    def tx(self):
        return Tx(self.conn, self.clock)

    def acquire(self, resource, wait_s=0.0, ttl_s=DEFAULT_TTL_S, poll_s=0.25):
        ticket = uuid.uuid4().hex
        deadline = time.monotonic() + wait_s
        while True:
            try:
                with self.tx() as t:
                    o = claim_in(t, resource, self.holder, ticket, ttl_s, wait_s > 0, self.alive)
            except sqlite3.OperationalError as e:
                # Busy past the connection timeout is contention, not a fault (the
                # Node acquire says why); poll again while the wait has time left.
                if ("locked" not in str(e) and "busy" not in str(e)) or time.monotonic() >= deadline:
                    with contextlib.suppress(sqlite3.Error), self.tx() as t:  # lease.ts `acquire`: an error gives up the place too, best effort
                        leave_in(t, resource, ticket)  # a queued ticket is a live waiter ahead of every newcomer until its TTL
                    raise
                time.sleep(poll_s)
                continue
            if o["kind"] == "granted":
                return Lease(self, resource, o["lease"]["fence"], ttl_s)
            if o["kind"] == "busy" or time.monotonic() >= deadline:
                if o["kind"] == "queued":
                    with self.tx() as t:
                        leave_in(t, resource, ticket)
                h = o.get("holder")
                who = "%s/%s holds it" % (h["host"], h["pid"]) if h else "waiters are ahead"
                raise LeaseTimeout("lease %s: not granted within %.1f s; %s" % (resource, wait_s, who))
            time.sleep(poll_s)

    def close(self):
        self.conn.close()


def main(argv):
    if len(argv) == 4 and argv[1] == "status":
        leases = Leases(argv[2])
        try:
            with leases.tx() as t:
                print(json.dumps(status_in(t, argv[3], leases.holder, leases.alive)))
        finally:
            leases.close()
        return 0
    print(usage(__doc__), file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
