"""Hold the card's lease for a batch that never takes it itself.

    python pipeline/gpu/hold.py --tenant <name> --engine comfy --while-pid <pid> [--wait <s>] [--stop-file <path>]

No reading of the card can prove it idle: pipeline/music-clip/clips-h3.py submits one clip at a
time, so ComfyUI's queue reads 0 with 18 clips left, and the gaps between clips run from 1 s to 4 h.
The batch's owner (pipeline/trailer/day-run.ps1) knows the batch is live, so it runs this beside the
clips: the card's one slot, gpu.local#1, then names the batch to everyone who asks the lease.

It is a claim through lease.py's public API, and it is the sidecar's own: the holder written down is
THIS process, so nothing the batch does depends on it. clips-h3.py reads no lease, so losing this
process, or never getting the lease, costs the batch nothing. Hence the shape of every failure: one
line, a non-zero exit, and the parent carries on.

Exit status: 0 the batch ended or this was told to stop (lease released); 1 refused, lost or broken;
2 a bad command line.

--wait polls with single tries rather than lease.py's FIFO wait. acquire(wait=N) cannot watch a pid
or a stop while it blocks, and a queued ticket would stand ahead of every tenant behind it; a single
try leaves whoever is queued their turn (kernel lease: a free slot with live waiters is not granted
to a newcomer), and leaves no ticket behind when the wait runs out.

--stop-file exists because Windows has no SIGTERM to send. Stop-Process is TerminateProcess: no
handler runs, nothing is released, and the slot reads `holder-gone` until the next claim reclaims it.
The parent writes the file and this releases cleanly. SIGTERM, SIGINT and SIGBREAK are honoured too.

A missed heartbeat because the store is busy is not a lost lease: the beat runs at ttl/3 so that one
miss forfeits nothing (lease.py's rule, and Node's), and the next poll tries again. Only LeaseLost ends
the hold. The watched pid is polled every 2 s at most, so a reused pid has that long to appear.
"""

import argparse
import signal
import sqlite3
import sys
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))  # lease.py is imported flat; `python -I` adds no script directory

OK, FAILED, USAGE = 0, 1, 2
POLL_S = 2.0
VRAM_GB = 20  # an H3 clip at 832x480 (pipeline/vlm-probe/guard.py VRAM_FLOOR_GB's measurement)


def say(line):
    """One line, flushed: the parent reads this file while this process runs."""
    print("hold: " + " ".join(str(line).split()), flush=True)


class Args(argparse.ArgumentParser):
    def error(self, message):
        say(f"failed: {message}")
        raise SystemExit(USAGE)


def parse(argv):
    ap = Args(add_help=True, description="hold gpu.local#1 while a pid lives")
    ap.add_argument("--tenant", required=True)
    ap.add_argument("--engine", required=True, choices=("comfy", "ollama"))
    ap.add_argument("--while-pid", type=int, required=True, dest="pid")
    ap.add_argument("--wait", type=float, default=0.0, help="seconds to keep trying for a held lease")
    ap.add_argument("--stop-file", default=None, help="release and exit once this path exists")
    ap.add_argument("--vram", type=float, default=VRAM_GB)
    ap.add_argument("--ttl", type=float, default=None, help="lease ttl in seconds (default: lease.py's)")
    return ap.parse_args(argv)


def claim(gpu, broker, a, ttl, poll, stopping):
    """The lease, or None when the batch ended or a stop came first. Raises when --wait runs out."""
    deadline = time.monotonic() + a.wait
    told = False
    while True:
        try:
            return broker.acquire(a.tenant, a.engine, a.vram, wait=0, ttl_s=ttl)
        except gpu.LeaseError as e:  # LeaseTimeout (held) and a store busy past its timeout: both pass with time
            if time.monotonic() >= deadline:
                raise
            if not told:
                say(f"waiting up to {a.wait:g}s: {e}")
                told = True
        if stopping.wait(poll):
            return None
        if not gpu.pid_alive(a.pid):
            return None


def keep(gpu, handle, a, ttl, poll, stopping):
    """Renew until the pid dies or a stop comes; the reason, for the log. Raises LeaseLost."""
    beat_at = time.monotonic() + ttl / 3
    while True:
        if stopping.is_set():
            return "told to stop"
        if not gpu.pid_alive(a.pid):
            return f"pid {a.pid} ended"
        if time.monotonic() >= beat_at:
            try:
                handle.heartbeat()
                beat_at = time.monotonic() + ttl / 3
            except sqlite3.OperationalError as e:
                if "locked" not in str(e) and "busy" not in str(e):
                    raise
                say(f"missed a heartbeat, store busy: {e}")
        stopping.wait(poll)


class Stopping:
    """A signal or the stop file. A signal handler runs between bytecodes, so an Event wakes the poll."""

    def __init__(self, stop_file):
        self.flag = threading.Event()
        self.file = Path(stop_file) if stop_file else None
        for name in ("SIGINT", "SIGTERM", "SIGBREAK"):
            sig = getattr(signal, name, None)
            if sig is not None:
                try:
                    signal.signal(sig, lambda *_: self.flag.set())
                except (ValueError, OSError):
                    pass  # not the main thread, or not a console: the file and the pid still end this

    def is_set(self):
        return self.flag.is_set() or (self.file is not None and self.file.exists())

    def wait(self, s):
        self.flag.wait(s)
        return self.is_set()


def main(argv=None):
    a = parse(sys.argv[1:] if argv is None else argv)
    broker = None
    try:
        import lease as gpu  # here, so a broken import is this process's one line and not a traceback

        if not gpu.pid_alive(a.pid):
            say(f"failed: pid {a.pid} is not alive, nothing to hold for")
            return FAILED
        ttl = gpu.DEFAULT_TTL_S if a.ttl is None else a.ttl
        poll = min(POLL_S, ttl / 3)
        stopping = Stopping(a.stop_file)
        broker = gpu.Broker()
        handle = claim(gpu, broker, a, ttl, poll, stopping)
        if handle is None:
            say("ended before the lease was granted")
            return OK
        say(f"holding {gpu.SLOT} as {a.tenant} ({a.engine}, pid {broker.pid} while pid {a.pid}, fence {handle.fence}, ttl {ttl:g}s)")
        try:
            why = keep(gpu, handle, a, ttl, poll, stopping)
        except gpu.LeaseLost as e:
            say(f"failed: lost the lease: {e}")
            return FAILED
        finally:
            handle.release()
        say(f"released {gpu.SLOT}: {why}")
        return OK
    except Exception as e:  # noqa: BLE001 - the contract: every failure is one line, and it never blocks the parent
        say(f"failed: {e}")
        return FAILED
    finally:
        if broker is not None:
            broker.close()


if __name__ == "__main__":
    sys.exit(main())
