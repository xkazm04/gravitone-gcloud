"""Selftest for the batch's lease sidecar (hold.py).

    python pipeline/gpu/hold_selftest.py

No GPU, no ComfyUI. hold.py runs as a real process against a throwaway kernel store, migrated once by
the Node worker and copied per case as pipeline/gpu/selftest.py does; the rival tenant is a Broker in
this process. The only processes stopped are the sleepers this file starts. The operator's store is
never opened: the environment is pointed at a temp directory before the lease module loads, and the
run aborts if the store still resolves anywhere else.

Exit status is the verdict (0 all green, 1 any failure).
"""

import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SCRATCH = Path(tempfile.mkdtemp(prefix="gpu-hold-"))
os.environ["GRAVITONE_STORE_PATH"] = str(SCRATCH / "unused.sqlite")
os.environ["GPU_LEASE_DIR"] = str(SCRATCH / "gpu")

sys.path.insert(0, str(HERE))
import lease  # noqa: E402
from kernel_store import ensure_store, store_location  # noqa: E402

if Path(store_location()).resolve().parent != SCRATCH.resolve():
    raise SystemExit(f"refusing to run: the store resolves to {store_location()}")

HOLD = str(HERE / "hold.py")
FAILED = []
_TEMPLATE = []
_SLEEPERS = []
_BROKERS = []


def check(name, got, want):
    ok = got == want
    print(f"{'OK  ' if ok else 'FAIL'}  {name}" + ("" if ok else f"\n        got  {got!r}\n        want {want!r}"), flush=True)
    if not ok:
        FAILED.append(name)


def case_store():
    """A migrated store of its own, in a directory of its own."""
    if not _TEMPLATE:
        tdir = SCRATCH / "template"
        tdir.mkdir()
        _TEMPLATE.append(ensure_store(str(tdir / "gravitone.sqlite")))
    d = Path(tempfile.mkdtemp(prefix="case-", dir=SCRATCH))
    path = d / "gravitone.sqlite"
    shutil.copyfile(_TEMPLATE[0], path)
    return d, str(path)


def sleeper():
    """A process to watch, and to end when the case says so."""
    p = subprocess.Popen([sys.executable, "-I", "-c", "import time; time.sleep(600)"])
    _SLEEPERS.append(p)
    return p


def rival(d, store, **kw):
    b = lease.Broker(d, store=store, **kw)
    _BROKERS.append(b)
    return b


class Sidecar:
    def __init__(self, d, store, *args, watch=None):
        self.out = Path(d) / f"hold-{time.monotonic_ns()}.log"
        self.err = Path(str(self.out) + ".err")
        self.watch = watch
        env = dict(os.environ, GRAVITONE_STORE_PATH=store, GPU_LEASE_DIR=str(d))
        with open(self.out, "wb") as o, open(self.err, "wb") as e:
            self.p = subprocess.Popen([sys.executable, "-I", "-u", HOLD, *args], stdout=o, stderr=e, env=env, cwd=str(d))

    def lines(self):
        return self.out.read_text(encoding="utf-8").splitlines()

    def stderr(self):
        return self.err.read_text(encoding="utf-8")

    def wait_for(self, word, within=30.0):
        end = time.monotonic() + within
        while time.monotonic() < end:
            if any(word in line for line in self.lines()):
                return True
            if self.p.poll() is not None:
                return any(word in line for line in self.lines())
            time.sleep(0.05)
        return False

    def exit(self, within=20.0):
        try:
            return self.p.wait(timeout=within)
        except subprocess.TimeoutExpired:
            self.p.kill()
            self.p.wait()
            return "still running"


def events(store, typ):
    db = sqlite3.connect(store)
    try:
        return [json.loads(r[0]) for r in db.execute("SELECT data FROM events WHERE subject_id = ? AND type = ? ORDER BY seq", (lease.SLOT, typ))]
    finally:
        db.close()


def start(d, store, watch, *extra, ttl="120"):
    return Sidecar(d, store, "--tenant", "test-batch", "--engine", "comfy", "--while-pid", str(watch.pid), "--ttl", ttl, *extra, watch=watch)


# -- the four the brief names ---------------------------------------------------
def test_acquires():
    d, store = case_store()
    w = sleeper()
    s = start(d, store, w)
    check("acquires: it says it holds", s.wait_for("holding gpu.local#1"), True)
    st = rival(d, store).status()
    check("acquires: the holder is the batch by name", (st["holder"]["tenant"], st["holder"]["engine"], st["stale"]), ("test-batch", "comfy", None))
    check("acquires: the pid written down is the sidecar's own, not the watched one",
          st["holder"]["pid"] != w.pid, True)
    check("acquires: the grant names its tenant on the ledger", events(store, "gpu.tenant")[-1]["tenant"], "test-batch")
    w.kill()
    s.exit()


def test_renews_past_ttl():
    d, store = case_store()
    w = sleeper()
    s = start(d, store, w, ttl="2")
    s.wait_for("holding gpu.local#1")
    b = rival(d, store)
    first = b.status()["holder"]
    time.sleep(5.0)  # 2.5 ttls: an unrenewed lease has expired twice over
    now = b.status()
    check("renews: not stale past its ttl", now["stale"], None)
    check("renews: the same fence, not a re-claim", now["holder"]["fence"], first["fence"])
    check("renews: the heartbeat moved", now["holder"]["heartbeatAt"] > first["heartbeatAt"], True)
    try:
        b.acquire("rival", "comfy", 20, wait=0)
        check("renews: a rival is refused", "granted", "refused")
    except lease.LeaseTimeout as e:
        check("renews: a rival is refused, naming the batch", "test-batch holds comfy" in str(e), True)
    w.kill()
    s.exit()


def test_releases_when_pid_dies():
    d, store = case_store()
    w = sleeper()
    s = start(d, store, w)
    s.wait_for("holding gpu.local#1")
    b = rival(d, store)
    before = b.status()["reclaims"]
    w.kill()
    w.wait()
    t = time.monotonic()
    check("pid death: exits 0", s.exit(), 0)
    check("pid death: within a few polls", time.monotonic() - t < 10, True)
    st = b.status()
    check("pid death: the slot is free", st["holder"], None)
    check("pid death: released, not reclaimed", (st["reclaims"], len(events(store, "lease.released"))), (before, 1))
    check("pid death: says why on one line", s.lines()[-1].startswith("hold: released gpu.local#1: pid "), True)


def test_held_and_wait_runs_out():
    d, store = case_store()
    w = sleeper()
    b = rival(d, store)
    held = b.acquire("rival", "comfy", 20)
    t = time.monotonic()
    s = start(d, store, w, "--wait", "1")
    check("held: exits non-zero", s.exit(), 1)
    check("held: gives up near --wait", time.monotonic() - t < 15, True)
    failures = [line for line in s.lines() if line.startswith("hold: failed:")]
    check("held: exactly one failure line, and it is the last", (len(failures), s.lines()[-1] == failures[0]), (1, True))
    check("held: the line names the holder", "rival holds comfy" in failures[0], True)
    check("held: no traceback", s.stderr(), "")
    st = b.status()
    check("held: the rival still holds it, nothing queued", (st["holder"]["tenant"], st["queue"]), ("rival", []))
    held.release()
    w.kill()


# -- the contract around them ---------------------------------------------------
def test_wait_takes_it_when_freed():
    d, store = case_store()
    w = sleeper()
    b = rival(d, store)
    held = b.acquire("rival", "comfy", 20)
    s = start(d, store, w, "--wait", "60")
    time.sleep(1.5)
    check("wait: it does not queue ahead of anyone", b.status()["queue"], [])
    held.release()
    check("wait: it takes the lease once free", s.wait_for("holding gpu.local#1"), True)
    w.kill()
    s.exit()


def test_lost_lease():
    d, store = case_store()
    w = sleeper()
    s = start(d, store, w, ttl="3")
    s.wait_for("holding gpu.local#1")
    # A tenant an hour ahead sees the lease expired and reclaims it, moving the fence under the sidecar.
    late = rival(d, store, now=lambda: int(time.time() * 1000) + 3600_000)
    took = late.acquire("thief", "comfy", 20, ttl_s=7200)
    check("lost: exits non-zero", s.exit(), 1)
    check("lost: its one line says so", "failed: lost the lease" in s.lines()[-1], True)
    check("lost: no traceback", s.stderr(), "")
    check("lost: the thief keeps it", took.released, False)
    w.kill()


def test_stop_file():
    d, store = case_store()
    w = sleeper()
    stop = Path(d) / "stop"
    s = start(d, store, w, "--stop-file", str(stop))
    s.wait_for("holding gpu.local#1")
    stop.write_text("stop", encoding="utf-8")
    check("stop file: exits 0 while the pid still lives", (s.exit(), w.poll()), (0, None))
    check("stop file: the slot is free", rival(d, store).status()["holder"], None)
    w.kill()


def test_sigterm():
    d, store = case_store()
    w = sleeper()
    # hold.py's own main, with the signal raised at it from a timer: Popen.terminate on Windows is
    # TerminateProcess, which reaches no handler.
    src = ("import signal, sys, threading; sys.path.insert(0, %r); import hold; "
           "threading.Timer(2.0, lambda: signal.raise_signal(signal.SIGTERM)).start(); "
           "sys.exit(hold.main(['--tenant', 'test-batch', '--engine', 'comfy', '--while-pid', '%d']))" % (str(HERE), w.pid))
    env = dict(os.environ, GRAVITONE_STORE_PATH=store, GPU_LEASE_DIR=str(d))
    r = subprocess.run([sys.executable, "-I", "-u", "-c", src], capture_output=True, text=True, env=env, timeout=30)
    check("SIGTERM: exits 0", r.returncode, 0)
    check("SIGTERM: says it was told to stop", r.stdout.splitlines()[-1], "hold: released gpu.local#1: told to stop")
    check("SIGTERM: the slot is free", rival(d, store).status()["holder"], None)
    w.kill()


def test_dead_pid_at_start():
    d, store = case_store()
    w = sleeper()
    w.kill()
    w.wait()
    s = start(d, store, w)
    check("dead pid: exits non-zero", s.exit(), 1)
    check("dead pid: one line", len(s.lines()), 1)
    check("dead pid: claimed nothing", rival(d, store).status()["holder"], None)


def test_broken_store():
    d, _ = case_store()
    w = sleeper()
    bad = Path(d) / "broken.sqlite"
    bad.write_bytes(b"this is not a database, and it is long enough to be read as one" * 100)
    s = Sidecar(d, str(bad), "--tenant", "t", "--engine", "comfy", "--while-pid", str(w.pid))
    check("broken store: exits non-zero", s.exit(), 1)
    check("broken store: one line, no traceback", (len(s.lines()), s.stderr()), (1, ""))
    w.kill()


def test_bad_usage():
    d, store = case_store()
    s = Sidecar(d, store, "--tenant", "t", "--engine", "voodoo", "--while-pid", "1")
    check("usage: exits 2", s.exit(), 2)
    check("usage: one line", len(s.lines()), 1)


def main():
    try:
        for fn in (test_acquires, test_renews_past_ttl, test_releases_when_pid_dies, test_held_and_wait_runs_out,
                   test_wait_takes_it_when_freed, test_lost_lease, test_stop_file, test_sigterm,
                   test_dead_pid_at_start, test_broken_store, test_bad_usage):
            fn()
    finally:
        for p in _SLEEPERS:
            if p.poll() is None:
                p.kill()
            p.wait()
        for b in _BROKERS:
            b.close()
        shutil.rmtree(SCRATCH, ignore_errors=True)
    print(f"\n{'ALL GREEN' if not FAILED else 'FAILED: ' + ', '.join(FAILED)}", flush=True)
    return 1 if FAILED else 0


if __name__ == "__main__":
    sys.exit(main())
