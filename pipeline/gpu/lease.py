"""GPU tenancy lease: v1's broker API, now a thin shim over the KERNEL lease on the card's
one slot, `gpu.local#1` (Phase 4, L27).

    python pipeline/gpu/lease.py --status

This box has ONE 24 GB card and several kinds of tenant: the consistency / motion lanes,
foundry forge and Dojo, the preset-clip renderer, the Next server's resident Ollama eye -
and, since Phase 4, kernel jobs. v1 coordinated the first four through files under
foundry-out/gpu (a lock, lease.json, a queue.jsonl replayed as the FIFO); the kernel's jobs
claim `gpu.local#1` in the store. Two leases do not exclude each other, so this module and
lib/gpu/lease.ts now speak the kernel lease (packages/kernel/py/lease.py, held to the same
spec as the Node one): every tenant, in either language, claims the same row under the same
write lock.

The rule this encodes is v1's, unchanged: **the card has one holder at a time, the holder is
written down, and only the holder may recycle an engine.** What the kernel lease adds: no
stale lock file to break (the store's lock dies with its process), a reused pid told apart
by bootId, a fence that never goes back, and every grant, reclaim and release on the ledger.
The tenant's own words (tenant, engine, vramGb, jobPrefix) ride on a `gpu.tenant` event in
the granting transaction, so a refusal still names "forge-comfy holds comfy"; a kernel JOB
holding the slot is named by its producer and id, engine "job".

The store is the kernel's (packages/kernel/py/kernel_store.py: GRAVITONE_STORE_PATH, else
<repo>/<foundry-out|fixtures-out>/gravitone.sqlite), brought up to date by the Node worker's
`--migrate` if it is not. v1's directory (GPU_LEASE_DIR, else foundry-out/gpu) holds only
history now and a MIGRATED marker, left by whichever tenant opens the store first.

A forge or Dojo JOB that holds gpu.local#1 through packages/kernel/py/job.py is a holder
already; `hold_for_job` gives it a handle here, so guard.recycle_comfy and comfy.generate
treat it as the card's tenant without a second claim.
"""

import argparse
import contextlib
import json
import os
import socket
import sqlite3
import sys
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT / "packages" / "kernel" / "py") not in sys.path:
    sys.path.append(str(ROOT / "packages" / "kernel" / "py"))  # behind: `lease` here is THIS module
from kernel_ledger import append as _append  # noqa: E402
from kernel_store import ensure_store, kernel_lease, store_location  # noqa: E402

# packages/kernel/py/lease.py, by path: this module IS `lease` to every GPU tenant, so the kernel's is loaded under its own name.
_klease = kernel_lease()

DEFAULT_TTL_S = 120.0
ENGINES = ("comfy", "ollama")
SLOT = "gpu.local#1"  # @gt/domain/lane laneSlots("gpu.local")[0]


class LeaseError(RuntimeError):
    """Base for every refusal this module makes."""


class LeaseHeld(LeaseError):
    """The engine is another tenant's right now. `.holder` is its lease record
    (None when the caller holds nothing and nobody does either)."""

    def __init__(self, message, holder=None):
        super().__init__(message)
        self.holder = holder


class LeaseTimeout(LeaseError):
    """A waiter ran out of `wait` -- raised instead of hanging."""

    def __init__(self, message, holder=None):
        super().__init__(message)
        self.holder = holder


class LeaseLost(LeaseError):
    """The handle's lease was reclaimed (or released) under it."""


def lease_dir():
    """v1's lease directory: history and the MIGRATED marker now."""
    env = os.environ.get("GPU_LEASE_DIR", "").strip()
    return Path(env).resolve() if env else ROOT / "foundry-out" / "gpu"


pid_alive = _klease.pid_alive

MIGRATED_TEXT = (
    "MIGRATED 2026-10-16 (Phase 4, L27). The GPU lease is the kernel lease on gpu.local#1 in the store\n"
    "(GRAVITONE_STORE_PATH, else <foundry-out|fixtures-out>/gravitone.sqlite): lib/gpu/lease.ts and pipeline/gpu/lease.py.\n"
    "lease.json and lock here are no longer read or written; queue.jsonl is frozen history the ledger's gpu source projects.\n")


def mark_migrated(root):
    """lib/gpu/lease.ts `markMigrated`: once, by whichever tenant opens the store first."""
    root = Path(root)
    if not root.is_dir():
        return
    with contextlib.suppress(FileExistsError):
        with open(root / "MIGRATED", "x", encoding="utf-8", newline="\n") as f:
            f.write(MIGRATED_TEXT)


def _ms(at):
    return _klease.ms(at)


class Broker:
    """One view of the card's slot. Every argument after `root` exists so a selftest can
    play two tenants (and a dead pid, and a clock) in one process; `store` names the kernel
    store (default: store.py's location rule)."""

    def __init__(self, root=None, pid=None, host=None, alive=None, now=None,
                 sleep=None, poll_s=0.25, store=None):
        self.root = Path(root) if root else lease_dir()
        self.pid = os.getpid() if pid is None else pid
        self.host = host or socket.gethostname()
        self._alive = alive or pid_alive
        self._now = now or (lambda: int(time.time() * 1000))
        self._sleep = sleep or time.sleep
        self.poll_s = poll_s
        self.store = ensure_store(store or store_location())
        mark_migrated(self.root)
        # One connection per thread: a sqlite3 connection belongs to the thread that opened it,
        # and a tenant may wait for the card on one thread while another heartbeats.
        self._local = threading.local()
        self._conns = []
        # The process's bootId, under the pid this broker plays: brokers in one process are one holder's.
        self.holder_id = {"bootId": _klease.BOOT_ID, "pid": self.pid, "host": self.host}

    def _tx(self):
        conn = getattr(self._local, "conn", None)
        if conn is None:
            conn = self._local.conn = _klease.connect(self.store)
            self._conns.append(conn)
        return _klease.Tx(conn, lambda: datetime.fromtimestamp(self._now() / 1000, timezone.utc))

    def close(self):
        """Close this broker's connections. Each belongs to the thread that opened it, so a
        connection another thread still uses is left for that thread's exit."""
        for conn in self._conns:
            with contextlib.suppress(sqlite3.ProgrammingError):
                conn.close()
        self._conns = []

    def _event(self, t, typ, data):
        _append(t, {"kind": "machine", "id": "%s/%s" % (self.host, self.pid)}, typ,
                {"kind": "lease", "id": SLOT}, lane="gpu.local", data=data)

    def _holder_in(self, t):
        """The slot's holder as v1 named it, and v1's stale word for it."""
        st = _klease.status_in(t, SLOT, self.holder_id, self._alive)
        h = st["holder"]
        if h is None:
            return None, None, st
        row = t.get("SELECT json_extract(data, '$.tenant'), json_extract(data, '$.engine'), json_extract(data, '$.vramGb'), "
                    "json_extract(data, '$.jobPrefix') FROM events WHERE subject_id = ? AND type = 'gpu.tenant' "
                    "AND json_extract(data, '$.fence') = ? ORDER BY seq DESC LIMIT 1", SLOT, h["fence"])
        job = None if row else t.get("SELECT id, json_extract(record, '$.producer') FROM jobs WHERE state = 'running' "
                                     "AND json_extract(record, '$.slot') = ? AND json_extract(record, '$.lease.fence') = ?",
                                     SLOT, h["fence"])
        ticket = t.get("SELECT json_extract(data, '$.ticket') FROM events WHERE subject_id = ? AND type = 'lease.claimed' "
                       "AND json_extract(data, '$.fence') = ? ORDER BY seq DESC LIMIT 1", SLOT, h["fence"])
        who = h["holder"]
        if row:
            tenant, engine, vram, prefix = row
        elif job:
            tenant, engine, vram, prefix = "%s job %s" % (job[1], job[0]), "job", 0, ""
        else:
            tenant, engine, vram, prefix = "%s/%s" % (who["host"], who["pid"]), "job", 0, ""
        rec = {"tenant": tenant, "engine": engine, "vramGb": vram, "pid": who["pid"], "host": who["host"],
               "jobPrefix": prefix or "", "acquiredAt": _ms(h["acquiredAt"]), "heartbeatAt": _ms(h["heartbeatAt"]),
               "ttlS": h["ttlS"], "ticket": (ticket[0] if ticket and ticket[0] else "fence-%d" % h["fence"]), "fence": h["fence"]}
        stale = st["stale"]
        return rec, ("pid-dead" if stale == "holder-gone" else stale), st

    # -- the API -------------------------------------------------------------
    def acquire(self, tenant, engine, vram_gb, wait=0.0, ttl_s=DEFAULT_TTL_S, job_prefix=""):
        """Take the card. FIFO; `wait` seconds at most (0 = one try, never queued).

        Raises LeaseTimeout, never hangs."""
        if engine not in ENGINES:
            raise LeaseError(f"unknown engine {engine!r}; expected one of {ENGINES}")
        ticket = uuid.uuid4().hex[:12]
        ttl = int(round(ttl_s))
        deadline = self._now() + wait * 1000
        announced = False
        while True:
            try:
                with self._tx() as t:
                    o = _klease.claim_in(t, SLOT, self.holder_id, ticket, ttl, wait > 0, self._alive)
                    if o["kind"] == "granted":
                        fence = o["lease"]["fence"]
                        self._event(t, "gpu.tenant", {"fence": fence, "ticket": ticket, "tenant": tenant, "engine": engine,
                                                      "vramGb": vram_gb, "jobPrefix": job_prefix})
                        rec = {"tenant": tenant, "engine": engine, "vramGb": vram_gb, "pid": self.pid, "host": self.host,
                               "jobPrefix": job_prefix, "acquiredAt": _ms(o["lease"]["acquiredAt"]),
                               "heartbeatAt": _ms(o["lease"]["heartbeatAt"]), "ttlS": ttl, "ticket": ticket, "fence": fence}
                        return Lease(self, rec)
                    if o["kind"] == "queued" and not announced:
                        self._event(t, "gpu.waiting", {"ticket": ticket, "tenant": tenant, "engine": engine, "vramGb": vram_gb})
                    holder, _, st = self._holder_in(t)
                    waiters = len(st["queue"])
            except sqlite3.OperationalError as e:
                # Busy past the connection timeout is contention: poll again while the wait has time left.
                if ("locked" not in str(e) and "busy" not in str(e)) or self._now() >= deadline:
                    raise LeaseError(f"the gpu lease's store {self.store} is busy: {e}") from e
                self._sleep(self.poll_s)
                continue
            if o["kind"] == "queued":
                announced = True
            if wait <= 0 or self._now() >= deadline:
                if o["kind"] == "queued":
                    with self._tx() as t:
                        _klease.leave_in(t, SLOT, ticket)
                raise LeaseTimeout(self._busy_message(tenant, engine, holder, waiters), holder)
            self._sleep(self.poll_s)

    @staticmethod
    def _busy_message(tenant, engine, lease, waiters):
        who = (f"{lease['tenant']} holds {lease['engine']} (pid {lease['pid']})" if lease
               else f"{waiters} waiter(s) are ahead")
        return f"{tenant} could not get the gpu for {engine}: {who}"

    def holder(self):
        """The current lease record, or None. Does not reclaim; see status()."""
        with self._tx() as t:
            return self._holder_in(t)[0]

    def status(self):
        with self._tx() as t:
            holder, stale, st = self._holder_in(t)
            queue = []
            for w in st["queue"]:
                row = t.get("SELECT json_extract(data, '$.tenant'), json_extract(data, '$.engine') FROM events "
                            "WHERE subject_id = ? AND type = 'gpu.waiting' AND json_extract(data, '$.ticket') = ? "
                            "ORDER BY seq DESC LIMIT 1", SLOT, w["ticket"])
                queue.append({"tenant": row[0] if row else None, "engine": row[1] if row else None, "pid": w["holder"]["pid"]})
        return {"holder": holder, "stale": stale, "queue": queue, "reclaims": st["reclaims"]}

    def recycle(self, engine, holder=None, stop=None):
        """Run `stop` (the process kill / restart) ONLY if `holder` is the live lease holder
        for `engine`. Anyone else gets LeaseHeld naming who does."""
        with self._tx() as t:
            lease, stale, _ = self._holder_in(t)
        if lease is None or stale is not None:
            raise LeaseHeld(f"refusing to recycle {engine}: you hold no lease (acquire one first)", None)
        if holder is None or holder.fence != lease["fence"]:
            raise LeaseHeld(f"refusing to recycle {engine}: {lease['tenant']} holds the gpu "
                            f"({lease['engine']}, pid {lease['pid']}). Recycling would kill its work.", lease)
        if lease["engine"] != engine:
            raise LeaseHeld(f"your lease is for {lease['engine']}, not {engine}", lease)
        return stop() if stop else None


class Lease:
    """A held lease. Use as a context manager; heartbeat() while working."""

    def __init__(self, broker, rec, owned=True):
        self.broker = broker
        self.rec = rec
        self.ticket = rec["ticket"]
        self.fence = rec["fence"]
        self.released = False
        self._owned = owned
        _HELD.append(self)

    def heartbeat(self):
        try:
            with self.broker._tx() as t:
                _klease.heartbeat_in(t, SLOT, self.fence)
                self.rec = dict(self.rec, heartbeatAt=_ms(t.at))
        except _klease.LeaseLost as e:
            raise LeaseLost(f"the {self.rec['engine']} lease of {self.rec['tenant']} was reclaimed ({e})") from e

    def recycle(self, engine, stop=None):
        return self.broker.recycle(engine, holder=self, stop=stop)

    def release(self):
        if self.released:
            return
        self.released = True
        with contextlib.suppress(ValueError):
            _HELD.remove(self)
        if self._owned:
            with self.broker._tx() as t:
                _klease.release_in(t, SLOT, self.fence)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.release()


_HELD = []


def current_handle():
    """The newest lease this PROCESS still holds, or None. comfy.generate
    heartbeats it each poll so a long render does not outlive its ttl."""
    return _HELD[-1] if _HELD else None


def acquire(tenant, engine, vram_gb, wait=0.0, ttl_s=DEFAULT_TTL_S, job_prefix=""):
    return Broker().acquire(tenant, engine, vram_gb, wait=wait, ttl_s=ttl_s, job_prefix=job_prefix)


def hold_for_job(run, tenant, engine, vram_gb, job_prefix="", broker=None):
    """A handle over the slot a kernel job (packages/kernel/py/job.py JobRun on gpu.local)
    already holds: names the tenant on the ledger under the run's fence, and lets guard and
    comfy treat the job as the card's holder. Releasing it gives nothing back - the job's
    finish or park releases the slot."""
    if run.slot != SLOT:
        raise LeaseError(f"job {run.job_id} holds {run.slot}, not the card's {SLOT}")
    b = broker or Broker()
    with b._tx() as t:
        _klease.assert_fence(t, SLOT, run.fence)
        b._event(t, "gpu.tenant", {"fence": run.fence, "ticket": "job:%s" % run.job_id, "tenant": tenant,
                                   "engine": engine, "vramGb": vram_gb, "jobPrefix": job_prefix})
        lease, _, _ = b._holder_in(t)
    return Lease(b, lease, owned=False)


def holder_elsewhere():
    """The live lease record held by ANOTHER process, or None (for guard)."""
    b = Broker()
    try:
        rec, stale = b.holder(), None
        if rec:
            with b._tx() as t:
                stale = b._holder_in(t)[1]
        mine = current_handle()
        if rec and not stale and not (mine is not None and mine.fence == rec["fence"]) \
                and not (rec["pid"] == b.pid and rec["host"] == b.host):
            return rec
        return None
    finally:
        b.close()


def format_status(st):
    h = st["holder"]
    lines = []
    if h:
        age = (int(time.time() * 1000) - h.get("heartbeatAt", 0)) / 1000
        stale = f", STALE: {st['stale']}" if st["stale"] else ""
        lines.append(f"gpu lease: {h['tenant']} holds {h['engine']} ({h['vramGb']} GB, pid {h['pid']}, "
                     f"heartbeat {age:.0f}s ago / ttl {h['ttlS']:.0f}s{stale})")
    else:
        lines.append("gpu lease: free")
    lines.append("gpu queue: " + (", ".join(f"{w['tenant']}({w['engine']})" for w in st["queue"]) or "empty"))
    lines.append(f"gpu reclaims: {st['reclaims']}")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    st = Broker().status()
    print(json.dumps(st) if a.json else format_status(st))


if __name__ == "__main__":
    main()
