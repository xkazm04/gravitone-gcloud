"""Selftest for the GPU lease broker and the shared ComfyUI client.

    python pipeline/gpu/selftest.py

No GPU, no ComfyUI, no real process is stopped: tenancy is played by Brokers with
injected pids and clocks, process control is a recording stub, and ComfyUI is a
fake urlopen. Since Phase 4 (L27) the broker is a shim over the kernel lease on
gpu.local#1, so every case runs on a kernel store of its own: one is migrated by
the Node worker (`node workers/runner.mts --migrate`) and copied per case. Case 4
(Node <-> Python interop) spawns `tsx pipeline/gpu/interop.mts` against the same
store file and is skipped with a loud line, not silently, where tsx is not installed.

Exit status is the verdict (0 all green, 1 any failure).
"""

import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
import comfy  # noqa: E402
import lease  # noqa: E402
from kernel_store import ensure_store  # noqa: E402  (on sys.path through lease)

FAILED = []
_TEMPLATE = []


def store_in(d):
    """A migrated kernel store inside `d`: the template, migrated once by Node, copied."""
    if not _TEMPLATE:
        tdir = Path(tempfile.mkdtemp(prefix="gpu-lease-tpl-"))
        _TEMPLATE.append(ensure_store(str(tdir / "gravitone.sqlite")))
    path = str(Path(d) / "gravitone.sqlite")
    shutil.copyfile(_TEMPLATE[0], path)
    return path


def broker(d, **kw):
    return lease.Broker(d, store=store_in(d) if not (Path(d) / "gravitone.sqlite").exists() else str(Path(d) / "gravitone.sqlite"), **kw)


def check(name, got, want):
    ok = got == want
    print(f"{'OK  ' if ok else 'FAIL'}  {name}" + ("" if ok else f"\n        got  {got!r}\n        want {want!r}"))
    if not ok:
        FAILED.append(name)


def tmpdir():
    return Path(tempfile.mkdtemp(prefix="gpu-lease-"))


def alive_set(*pids):
    return lambda pid: pid in pids


# -- case 1: only the holder may recycle ------------------------------------
def test_recycle_is_the_holders_alone():
    d = tmpdir()
    stopped = []
    stub = lambda: stopped.append("Stop-Process") or True  # noqa: E731
    a = broker(d, pid=1001, host="h", alive=alive_set(1001, 1002))
    b = broker(d, pid=1002, host="h", alive=alive_set(1001, 1002))
    held = a.acquire("tenant-a", "comfy", 20, job_prefix="aaa-")
    try:
        b.recycle("comfy", holder=None, stop=stub)
        got = "recycled"
    except lease.LeaseHeld as e:
        got = (e.holder or {}).get("tenant"), "tenant-a" in str(e)
    check("1. a non-holder's recycle raises LeaseHeld naming the holder", got, ("tenant-a", True))
    check("1. ...and no process is stopped", stopped, [])
    check("1. the holder's recycle runs the stop", held.recycle("comfy", stub), True)
    check("1. ...exactly once", stopped, ["Stop-Process"])
    held.release()
    try:
        a.recycle("comfy", holder=held, stop=stub)
        got = "recycled"
    except lease.LeaseHeld as e:
        got = e.holder
    check("1. a released lease recycles nothing (nobody holds)", got, None)
    shutil.rmtree(d, ignore_errors=True)


# -- case 2: a dead holder is reclaimed, and counted ------------------------
def test_stale_lease_is_reclaimed():
    d = tmpdir()
    clock = [1_000_000]
    now = lambda: clock[0]  # noqa: E731
    a = broker(d, pid=2001, host="h", alive=alive_set(2002), now=now)  # 2001 is dead
    b = broker(d, pid=2002, host="h", alive=alive_set(2002), now=now)
    a.acquire("tenant-a", "comfy", 20, ttl_s=60)
    clock[0] += 61_000  # past ttl as well as dead
    got = b.acquire("tenant-b", "comfy", 20)
    check("2. a dead, expired holder is reclaimed by the next acquire", got.rec["tenant"], "tenant-b")
    check("2. the reclaim is counted on the slot", b.status()["reclaims"], 1)
    db = sqlite3.connect(str(d / "gravitone.sqlite"))
    try:
        events = db.execute("SELECT json_extract(data, '$.holder.pid'), json_extract(data, '$.reason') FROM events "
                            "WHERE type = 'lease.reclaimed' ORDER BY seq").fetchall()
    finally:
        db.close()
    check("2. ...as a ledger event naming the old holder", events, [(2001, "holder-gone")])
    got.release()

    # heartbeat expiry alone (pid alive) reclaims too; a fresh heartbeat does not
    c = broker(d, pid=2002, host="h", alive=alive_set(2002), now=now)
    held = c.acquire("tenant-c", "comfy", 20, ttl_s=60)
    clock[0] += 30_000
    held.heartbeat()
    clock[0] += 45_000  # 75 s since acquire, 45 s since heartbeat
    try:
        b.acquire("tenant-b", "comfy", 20)
        got = "granted"
    except lease.LeaseTimeout as e:
        got = e.holder["tenant"]
    check("2. a live holder with a fresh heartbeat is not reclaimed", got, "tenant-c")
    clock[0] += 30_000
    check("2. an expired heartbeat is reclaimed", b.acquire("tenant-b", "comfy", 20).rec["tenant"], "tenant-b")
    check("2. ...and counted again", b.status()["reclaims"], 2)
    shutil.rmtree(d, ignore_errors=True)


# -- case 3: FIFO, bounded wait ---------------------------------------------
def test_fifo_and_bounded_wait():
    d = tmpdir()
    pids = (3001, 3002, 3003, 3004)
    mk = lambda pid: broker(d, pid=pid, host="h", alive=alive_set(*pids), poll_s=0.02)  # noqa: E731
    a, b, c, late = (mk(p) for p in pids)
    held = a.acquire("tenant-a", "comfy", 20)
    order = []
    handles = {}

    def waiter(name, broker):
        h = broker.acquire(name, "comfy", 20, wait=20)
        order.append(name)
        handles[name] = h
        h.release()

    def queued(n):
        deadline = time.time() + 10
        while time.time() < deadline:
            if len(a.status()["queue"]) >= n:
                return True
            time.sleep(0.01)
        return False

    tb = threading.Thread(target=waiter, args=("tenant-b", b))
    tb.start()
    check("3. first waiter is queued", queued(1), True)
    tc = threading.Thread(target=waiter, args=("tenant-c", c))
    tc.start()
    check("3. second waiter is queued behind it", queued(2), True)
    check("3. the queue reads in arrival order", [w["tenant"] for w in a.status()["queue"]], ["tenant-b", "tenant-c"])
    t0 = time.time()
    try:
        late.acquire("tenant-d", "comfy", 20, wait=0.3)
        got = "granted"
    except lease.LeaseTimeout:
        got = "timeout"
    check("3. a waiter past its wait gets LeaseTimeout, not a hang", (got, time.time() - t0 < 5), ("timeout", True))
    check("3. ...and leaves the queue", [w["tenant"] for w in a.status()["queue"]], ["tenant-b", "tenant-c"])
    held.release()
    tb.join(15)
    tc.join(15)
    check("3. waiters are granted in arrival order", order, ["tenant-b", "tenant-c"])
    try:
        mk(3001).acquire("tenant-e", "comfy", 20, wait=0)
        got = "granted"
    except lease.LeaseTimeout:
        got = "timeout"
    check("3. with wait=0 a free card is granted", got, "granted")
    shutil.rmtree(d, ignore_errors=True)


# -- case 4: Node <-> Python on one directory --------------------------------
def tsx_cmd():
    """`npx tsx`, as every .mts in this repo is run (package.json); None where npx is absent."""
    npx = shutil.which("npx")
    return [npx, "tsx"] if npx else None


def test_node_python_interop():
    cmd = tsx_cmd()
    if not cmd:
        print("SKIP  4. npx is not on PATH; the node half of the interop was not exercised")
        return
    d = tmpdir()
    store = store_in(d)
    env = {**os.environ, "GPU_LEASE_DIR": str(d), "GRAVITONE_STORE_PATH": store}
    script = str(HERE / "interop.mts")

    # a Node holder blocks a Python acquire
    node = subprocess.Popen(cmd + [script, "hold", "node-tenant", "comfy"], cwd=ROOT, env=env,
                            stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
    line = node.stdout.readline().strip()
    check("4. the node holder reports it holds", line, "held")
    py = lease.Broker(d, store=store)
    try:
        py.acquire("py-tenant", "comfy", 20)
        got = "granted"
    except lease.LeaseTimeout as e:
        got = (e.holder or {}).get("tenant")
    check("4. a node holder blocks a python acquire", got, "node-tenant")
    node.stdin.write("release\n")
    node.stdin.flush()
    node.wait(timeout=30)
    held = py.acquire("py-tenant", "comfy", 20)
    check("4. ...and python gets it once node releases", held.rec["tenant"], "py-tenant")

    # a Python holder blocks a Node acquire
    r = subprocess.run(cmd + [script, "try", "node-tenant", "comfy"], cwd=ROOT, env=env,
                       capture_output=True, text=True, timeout=60)
    check("4. a python holder blocks a node acquire", r.stdout.strip(), "blocked py-tenant")
    held.release()

    # a node-held lease whose process dies is reclaimed by python
    node = subprocess.Popen(cmd + [script, "crash", "node-tenant", "comfy"], cwd=ROOT, env=env,
                            stdout=subprocess.PIPE, text=True)
    node.stdout.readline()
    node.wait(timeout=60)
    check("4. a dead node holder is reclaimed by python", py.acquire("py-tenant", "comfy", 20).rec["tenant"],
          "py-tenant")
    check("4. ...and counted", py.status()["reclaims"], 1)
    shutil.rmtree(d, ignore_errors=True)


# -- case 6: ComfyVanished within one poll ---------------------------------
def _bytes(obj):
    import io
    return io.BytesIO(json.dumps(obj).encode())


def test_comfy_vanishes_mid_poll():
    lease._HELD.clear()  # earlier cases leave handles; the ambient heartbeat must see none
    polls, sleeps = [], []

    def fake_urlopen(req, timeout=None):
        url = req if isinstance(req, str) else req.full_url
        if url.endswith("/prompt"):
            return _bytes({"prompt_id": "p1"})
        polls.append(url)
        raise urllib.error.URLError("connection refused")

    saved = (urllib.request.urlopen, time.sleep)
    urllib.request.urlopen, time.sleep = fake_urlopen, sleeps.append
    try:
        try:
            comfy.generate({}, timeout=600, host="http://fake", out_dir="/out", alive=lambda: False, poll_s=4)
            got = "returned"
        except comfy.ComfyVanished:
            got = "ComfyVanished"
        check("6. a process that vanishes mid-poll raises ComfyVanished", got, "ComfyVanished")
        check("6. ...within one poll interval", (len(polls), sleeps), (1, [4]))

        polls.clear()
        done = {"p1": {"outputs": {"13": {"images": [{"filename": "x_00001_.png", "subfolder": ""}]}}}}

        def busy_once(req, timeout=None):
            url = req if isinstance(req, str) else req.full_url
            if url.endswith("/prompt"):
                return _bytes({"prompt_id": "p1"})
            polls.append(url)
            if len(polls) == 1:
                raise urllib.error.URLError("timed out while the card was busy")
            return _bytes(done)
        urllib.request.urlopen = busy_once
        got = comfy.generate({}, host="http://fake", out_dir=Path("/out"), alive=lambda: True, poll_s=0)
        check("6. a failed poll on a LIVE engine is tolerated", got.name, "x_00001_.png")

        def never(req, timeout=None):
            url = req if isinstance(req, str) else req.full_url
            if url.endswith("/prompt"):
                return _bytes({"prompt_id": "p1"})
            return _bytes({})
        urllib.request.urlopen = never
        try:
            comfy.generate({}, timeout=0.05, host="http://fake", out_dir="/out", alive=lambda: True, poll_s=0.01)
            got = "returned"
        except comfy.ComfyTimeout:
            got = "ComfyTimeout"
        check("6. a live engine that never finishes times out", got, "ComfyTimeout")
    finally:
        urllib.request.urlopen, time.sleep = saved


def test_poll_heartbeats_the_held_lease():
    d = tmpdir()
    clock = [5_000_000]
    b = broker(d, pid=9001, host="h", alive=alive_set(9001), now=lambda: clock[0])
    held = b.acquire("tenant-h", "comfy", 20, ttl_s=60)
    done = {"p1": {"outputs": {"13": {"images": [{"filename": "y.png", "subfolder": ""}]}}}}

    def fake(req, timeout=None):
        url = req if isinstance(req, str) else req.full_url
        return _bytes({"prompt_id": "p1"} if url.endswith("/prompt") else done)

    saved = (urllib.request.urlopen, time.sleep)
    urllib.request.urlopen = fake
    time.sleep = lambda s: clock.__setitem__(0, clock[0] + 40_000)
    try:
        comfy.generate({}, host="http://fake", out_dir="/o", alive=lambda: True, poll_s=1, lease=held)
    finally:
        urllib.request.urlopen, time.sleep = saved
    check("6. each poll heartbeats the lease (40 s later, still held)", b.holder()["heartbeatAt"], 5_040_000)
    held.release()
    shutil.rmtree(d, ignore_errors=True)


def main():
    for t in (test_recycle_is_the_holders_alone, test_stale_lease_is_reclaimed, test_fifo_and_bounded_wait,
              test_node_python_interop, test_comfy_vanishes_mid_poll, test_poll_heartbeats_the_held_lease):
        t()
    print(f"\n{len(FAILED)} FAILURE(S)" if FAILED else "\nall gpu lease cases behave correctly")
    sys.exit(1 if FAILED else 0)


if __name__ == "__main__":
    main()
