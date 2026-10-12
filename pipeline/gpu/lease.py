"""GPU tenancy lease: one cross-process turn broker for the one card.

    python pipeline/gpu/lease.py --status

This box has ONE 24 GB card and at least four kinds of tenant: the
consistency / motion lanes, foundry forge and dojo, the preset-clip renderer,
and the Next server's resident Ollama eye. Until this module they coordinated
by guessing tenancy from output filename prefixes (guard.MY_PREFIXES) and by
`Stop-Process -Force` -- see CONSISTENCY-FINDINGS.md "This box is not ours
alone". A look-then-kill cannot be correct: the job it did not see, or the one
that started between the look and the kill, dies silently.

The rule this encodes: **the card has one holder at a time, the holder is
written on disk, and only the holder may recycle an engine.**

THE PROTOCOL is shared with lib/gpu/lease.ts, because the Next server and the
pipeline are different processes in different languages:

    <root>/lock        exclusive-create file {pid, at}; ms-long; a lock older
                       than LOCK_STALE_S has no living owner (lib/sound/store.ts
                       acquireLock, the same idiom)
    <root>/lease.json  the current holder, or absent
                       {tenant, engine, vramGb, pid, host, jobPrefix,
                        acquiredAt, heartbeatAt, ttlS, ticket}   (times: epoch ms)
    <root>/queue.jsonl append-only event log; the FIFO queue is its replay:
                       a `wait` event is a waiter until a `grant` or `leave`
                       for the same ticket; `reclaim` events carry a running
                       `reclaims` count

<root> is foundry-out/gpu (gitignored); GPU_LEASE_DIR moves it.

A lease is STALE -- reclaimable, and the reclaim is logged -- when its pid is
dead (judged only for a pid on THIS host) or its heartbeat is older than ttlS.
A waiter whose pid is dead is skipped, so a crashed waiter cannot wedge the
queue head.
"""

import argparse
import contextlib
import json
import os
import socket
import sys
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_TTL_S = 120.0
LOCK_STALE_S = 30.0
LOCK_WAIT_S = 10.0
ENGINES = ("comfy", "ollama")


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
    env = os.environ.get("GPU_LEASE_DIR", "").strip()
    return Path(env).resolve() if env else ROOT / "foundry-out" / "gpu"


def pid_alive(pid):
    """Is `pid` a live process on this host?

    NOT os.kill(pid, 0): on Windows os.kill with any other signal calls
    TerminateProcess, so the "probe" would end the process it asks about.
    """
    if not isinstance(pid, int) or pid <= 0:
        return False
    if os.name == "nt":
        import ctypes
        k32 = ctypes.WinDLL("kernel32", use_last_error=True)
        k32.OpenProcess.restype = ctypes.c_void_p
        handle = k32.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
        if not handle:
            return ctypes.get_last_error() == 5  # access denied: it exists
        try:
            code = ctypes.c_ulong()
            if not k32.GetExitCodeProcess(ctypes.c_void_p(handle), ctypes.byref(code)):
                return True
            return code.value == 259  # STILL_ACTIVE
        finally:
            k32.CloseHandle(ctypes.c_void_p(handle))
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


class Broker:
    """One view of the lease directory. Every argument after `root` exists so a
    selftest can play two tenants (and a dead pid, and a clock) in one process."""

    def __init__(self, root=None, pid=None, host=None, alive=None, now=None,
                 sleep=None, poll_s=0.25):
        self.root = Path(root) if root else lease_dir()
        self.pid = os.getpid() if pid is None else pid
        self.host = host or socket.gethostname()
        self._alive = alive or pid_alive
        self._now = now or (lambda: int(time.time() * 1000))
        self._sleep = sleep or time.sleep
        self.poll_s = poll_s

    # -- files ---------------------------------------------------------------
    @property
    def _lease_file(self):
        return self.root / "lease.json"

    @property
    def _queue_file(self):
        return self.root / "queue.jsonl"

    @contextlib.contextmanager
    def _locked(self):
        self.root.mkdir(parents=True, exist_ok=True)
        lock = self.root / "lock"
        started = time.time()
        while True:
            try:
                fd = os.open(str(lock), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            except (FileExistsError, PermissionError):
                # Windows answers a create that races the holder's DELETE with
                # PermissionError (a pending-delete file), not FileExistsError.
                try:
                    age = time.time() - lock.stat().st_mtime
                except OSError:
                    age = 0.0  # released between the failed create and the stat
                if age > LOCK_STALE_S:
                    with contextlib.suppress(OSError):
                        lock.unlink()
                    continue
                if time.time() - started > LOCK_WAIT_S:
                    raise LeaseError(f"the gpu lease lock {lock} is held and did not release in {LOCK_WAIT_S:.0f}s")
                time.sleep(0.02)
                continue
            try:
                os.write(fd, json.dumps({"pid": self.pid, "at": self._now()}).encode())
            finally:
                os.close(fd)
            break
        try:
            yield
        finally:
            with contextlib.suppress(OSError):
                lock.unlink()

    def _read_lease(self):
        try:
            return json.loads(self._lease_file.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return None
        except (ValueError, OSError):
            return None  # writes are atomic, so a half-visible file is a race, not corruption

    def _write_lease(self, rec):
        tmp = self.root / f"lease.json.{self.pid}.tmp"
        tmp.write_text(json.dumps(rec), encoding="utf-8")
        os.replace(tmp, self._lease_file)

    def _drop_lease(self):
        with contextlib.suppress(FileNotFoundError):
            self._lease_file.unlink()

    def _events(self):
        try:
            text = self._queue_file.read_text(encoding="utf-8")
        except FileNotFoundError:
            return []
        out = []
        for line in text.splitlines():
            try:
                out.append(json.loads(line))
            except ValueError:
                continue  # a torn final line is skipped, never fatal
        return out

    def _append(self, ev):
        ev = {"at": self._now(), **ev}
        with open(self._queue_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(ev) + "\n")

    # -- judgement -----------------------------------------------------------
    def _pid_dead(self, rec):
        # A pid from another host says nothing about this host's process table.
        return rec.get("host") == self.host and not self._alive(rec.get("pid"))

    def _stale_reason(self, lease):
        if self._pid_dead(lease):
            return "pid-dead"
        if self._now() - lease.get("heartbeatAt", 0) > lease.get("ttlS", DEFAULT_TTL_S) * 1000:
            return "heartbeat-expired"
        return None

    def _live_waiters(self, events):
        waiting = {}
        for e in events:
            if e.get("ev") == "wait":
                waiting[e["ticket"]] = e
            elif e.get("ev") in ("grant", "leave"):
                waiting.pop(e.get("ticket"), None)
        return [w for w in waiting.values() if not self._pid_dead(w)]

    @staticmethod
    def _reclaims(events):
        n = 0
        for e in events:
            if e.get("ev") == "reclaim":
                n = e.get("reclaims", n + 1)
        return n

    def _reclaim_if_stale(self):
        """Under the lock. Returns the live lease (None once a stale one is gone)."""
        lease = self._read_lease()
        if not lease:
            return None
        why = self._stale_reason(lease)
        if not why:
            return lease
        n = self._reclaims(self._events()) + 1
        self._append({"ev": "reclaim", "reclaims": n, "reason": why, "by": self.pid,
                      "tenant": lease.get("tenant"), "engine": lease.get("engine"),
                      "pid": lease.get("pid"), "ticket": lease.get("ticket")})
        self._drop_lease()
        print(f"  lease: reclaimed {lease.get('engine')} from {lease.get('tenant')} "
              f"(pid {lease.get('pid')}, {why}); reclaims={n}", file=sys.stderr)
        return None

    # -- the API -------------------------------------------------------------
    def acquire(self, tenant, engine, vram_gb, wait=0.0, ttl_s=DEFAULT_TTL_S, job_prefix=""):
        """Take the card. FIFO; `wait` seconds at most (0 = one try, never queued).

        Raises LeaseTimeout, never hangs."""
        if engine not in ENGINES:
            raise LeaseError(f"unknown engine {engine!r}; expected one of {ENGINES}")
        ticket = uuid.uuid4().hex[:12]
        enqueued = False
        deadline = self._now() + wait * 1000
        while True:
            with self._locked():
                lease = self._reclaim_if_stale()
                waiters = self._live_waiters(self._events())
                head = (bool(waiters) and waiters[0]["ticket"] == ticket) if enqueued else not waiters
                if lease is None and head:
                    now = self._now()
                    rec = {"tenant": tenant, "engine": engine, "vramGb": vram_gb, "pid": self.pid,
                           "host": self.host, "jobPrefix": job_prefix, "acquiredAt": now,
                           "heartbeatAt": now, "ttlS": ttl_s, "ticket": ticket}
                    self._write_lease(rec)
                    self._append({"ev": "grant", "ticket": ticket, "tenant": tenant, "engine": engine,
                                  "pid": self.pid, "host": self.host})
                    return Lease(self, rec)
                if wait <= 0:
                    raise LeaseTimeout(self._busy_message(tenant, engine, lease, waiters), lease)
                if not enqueued:
                    self._append({"ev": "wait", "ticket": ticket, "tenant": tenant, "engine": engine,
                                  "vramGb": vram_gb, "pid": self.pid, "host": self.host})
                    enqueued = True
                if self._now() >= deadline:
                    self._append({"ev": "leave", "ticket": ticket, "tenant": tenant, "reason": "timeout"})
                    raise LeaseTimeout(self._busy_message(tenant, engine, lease, waiters), lease)
            self._sleep(self.poll_s)

    @staticmethod
    def _busy_message(tenant, engine, lease, waiters):
        who = (f"{lease['tenant']} holds {lease['engine']} (pid {lease['pid']})" if lease
               else f"{len(waiters)} waiter(s) are ahead")
        return f"{tenant} could not get the gpu for {engine}: {who}"

    def holder(self):
        """The current lease record, or None. Does not reclaim; see status()."""
        return self._read_lease()

    def status(self):
        lease = self._read_lease()
        events = self._events()
        return {"holder": lease,
                "stale": self._stale_reason(lease) if lease else None,
                "queue": [{"tenant": w.get("tenant"), "engine": w.get("engine"), "pid": w.get("pid")}
                          for w in self._live_waiters(events)],
                "reclaims": self._reclaims(events)}

    def recycle(self, engine, holder=None, stop=None):
        """Run `stop` (the process kill / restart) ONLY if `holder` is the live
        lease holder for `engine`. Anyone else gets LeaseHeld naming who does."""
        with self._locked():
            lease = self._reclaim_if_stale()
            if lease is None:
                raise LeaseHeld(f"refusing to recycle {engine}: you hold no lease (acquire one first)", None)
            if holder is None or holder.ticket != lease.get("ticket"):
                raise LeaseHeld(f"refusing to recycle {engine}: {lease['tenant']} holds the gpu "
                                f"({lease['engine']}, pid {lease['pid']}). Recycling would kill its work.",
                                lease)
            if lease["engine"] != engine:
                raise LeaseHeld(f"your lease is for {lease['engine']}, not {engine}", lease)
        return stop() if stop else None


class Lease:
    """A held lease. Use as a context manager; heartbeat() while working."""

    def __init__(self, broker, rec):
        self.broker = broker
        self.rec = rec
        self.ticket = rec["ticket"]
        self.released = False
        _HELD.append(self)

    def heartbeat(self):
        b = self.broker
        with b._locked():
            cur = b._read_lease()
            if not cur or cur.get("ticket") != self.ticket:
                raise LeaseLost(f"the {self.rec['engine']} lease of {self.rec['tenant']} was reclaimed")
            cur["heartbeatAt"] = b._now()
            b._write_lease(cur)
            self.rec = cur

    def recycle(self, engine, stop=None):
        return self.broker.recycle(engine, holder=self, stop=stop)

    def release(self):
        if self.released:
            return
        self.released = True
        with contextlib.suppress(ValueError):
            _HELD.remove(self)
        b = self.broker
        with b._locked():
            cur = b._read_lease()
            if cur and cur.get("ticket") == self.ticket:
                b._drop_lease()
                b._append({"ev": "release", "ticket": self.ticket, "tenant": self.rec["tenant"]})

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


def holder_elsewhere():
    """The live lease record held by ANOTHER process, or None (for guard)."""
    b = Broker()
    rec = b.holder()
    if rec and not b._stale_reason(rec) and not (rec.get("pid") == b.pid and rec.get("host") == b.host):
        return rec
    return None


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
    ap.parse_args()
    print(format_status(Broker().status()))


if __name__ == "__main__":
    main()
