"""Resource preflight, so a pipeline stage refuses rather than thrashes.

    python guard.py --status
    python guard.py --free-all
    python guard.py --require-vram 20 --free comfy

This machine has one 24 GB card and 64 GB of RAM, and the media pipeline wants
both from two engines that do not know about each other. The annotator
(qwen3.8:27b) is measured at 22.3 GB resident — 93% of the card. ComfyUI holds
its own models plus pinned host memory. Nothing coordinates them.

The observed failure is not a clean out-of-memory error. It is
`HostBuffer.read_file_slice failed` under host-memory pressure, or a load that
silently spills to system RAM and turns a 7-second annotation into a
multi-minute one. Both look like hangs, and both are recoverable only by
noticing and restarting — which is exactly what a preflight can do first.

The rule this encodes: **on one GPU, two model stacks take turns, and the turn
is explicit.** Before a stage loads, it frees the other engine and confirms the
headroom actually appeared. A stage that cannot get its headroom fails loudly
instead of degrading into a hang nobody attributes correctly.
"""

import argparse
import json
import subprocess
import sys
import time
import urllib.request

OLLAMA = "http://127.0.0.1:11434"
COMFY = "http://127.0.0.1:8188"


def _post(url, payload, timeout=120):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def _get(url, timeout=10):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.loads(r.read().decode())


def vram():
    """(free_gb, total_gb) from the driver -- the only number that counts."""
    r = subprocess.run(["nvidia-smi", "--query-gpu=memory.free,memory.total",
                        "--format=csv,noheader,nounits"],
                       capture_output=True, text=True)
    free, total = (int(x) for x in r.stdout.strip().splitlines()[0].split(","))
    return free / 1024, total / 1024


def ram():
    r = subprocess.run(
        ["powershell", "-NoProfile", "-Command",
         "$o=Get-CimInstance Win32_OperatingSystem; "
         "'{0} {1}' -f $o.FreePhysicalMemory,$o.TotalVisibleMemorySize"],
        capture_output=True, text=True)
    free_kb, total_kb = (float(x) for x in r.stdout.strip().split())
    return free_kb / 1048576, total_kb / 1048576


def ollama_resident():
    try:
        return {m["name"]: round(m.get("size_vram", 0) / 1e9, 2)
                for m in _get(f"{OLLAMA}/api/ps").get("models", [])}
    except Exception:
        return {}


def comfy_up():
    try:
        _get(f"{COMFY}/system_stats", timeout=4)
        return True
    except Exception:
        return False


def free_ollama():
    """Evict every resident model. keep_alive=0 unloads immediately."""
    freed = []
    for name in ollama_resident():
        try:
            _post(f"{OLLAMA}/api/generate", {"model": name, "keep_alive": 0, "prompt": ""})
            freed.append(name)
        except Exception:
            pass
    return freed


def free_comfy():
    """Ask ComfyUI to drop models and release cached host memory."""
    if not comfy_up():
        return False
    try:
        _post(f"{COMFY}/free", {"unload_models": True, "free_memory": True}, timeout=60)
        return True
    except Exception:
        return False


COMFY_DIR = r"C:\Users\kazda\ComfyUI"

# Host RAM, not VRAM, is what actually takes this machine down. Measured
# 2026-08-25 mid-run: the card sat at 69% used while system RAM went to
# **0.0 GB free of 63** -- a single ComfyUI holding Flux 2 reached a 37.5 GB
# working set. Generation keeps fp8 weights and the text encoder in host
# memory while the card holds only the working set, so VRAM headroom says
# nothing about whether the next load is safe. Exhaustion then presents as a
# hang, never as an error, which is why it has to be refused in advance.
RAM_FLOOR_GB = 12.0


def comfy_process_ids():
    """Live ComfyUI process IDs, by command line rather than by port.

    NOTE: a running ComfyUI shows up as TWO pids -- a launcher parent and the
    server child that owns the port. That is one instance, not two. Killing
    the pid that does not hold 8188 takes the server down with it (confirmed
    twice on 2026-08-25). Treat a non-empty list as "an instance exists",
    never as "there is a duplicate to clean up".
    """
    r = subprocess.run(
        ["powershell", "-NoProfile", "-Command",
         "Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | "
         "Where-Object { $_.CommandLine -match 'main\\.py' -and "
         "$_.CommandLine -match 'ComfyUI|disable-pinned-memory' } | "
         "ForEach-Object { $_.ProcessId }"],
        capture_output=True, text=True)
    return [int(x) for x in r.stdout.split() if x.strip().isdigit()]


def start_comfy(wait=180):
    """Bring ComfyUI up if it died, with the flags that survive memory pressure.

    Observed 2026-08-25: repeatedly freeing and reloading Flux across a
    per-frame alternation killed the server outright -- no error, just a closed
    socket and a vanished process. The durable fix is batching by stage so this
    is rare; this exists for when it happens anyway, because a dead engine
    should cost a restart rather than a lost run.

    `--disable-pinned-memory --disable-dynamic-vram` is the legacy loader path.
    It is slower to load and does not fall over when host memory is tight,
    which on a 64 GB box sharing one card is the trade worth making.
    """
    if comfy_up():
        return True
    # An HTTP probe is NOT proof that no server exists: an instance still
    # loading weights does not answer yet, and spawning a second one on top of
    # it is the worst possible move on a memory-tight box. Wait for the
    # existing process instead of racing it.
    if comfy_process_ids():
        print("  guard: a ComfyUI process exists but is not answering yet; waiting")
        deadline = time.time() + wait
        while time.time() < deadline:
            time.sleep(5)
            if comfy_up():
                return True
        return False
    exe = f"{COMFY_DIR}\\venv\\Scripts\\python.exe"
    subprocess.run(
        ["powershell", "-NoProfile", "-Command",
         f"Start-Process -FilePath '{exe}' "
         f"-ArgumentList 'main.py','--disable-pinned-memory','--disable-dynamic-vram' "
         f"-WorkingDirectory '{COMFY_DIR}' -WindowStyle Hidden"],
        capture_output=True, text=True)
    deadline = time.time() + wait
    while time.time() < deadline:
        time.sleep(5)
        if comfy_up():
            return True
    return False


def commit():
    """(used_gb, limit_gb) of the system commit charge.

    The number that actually predicts failure on this box. Free physical RAM
    can look survivable while commit sits against its limit, and it is commit
    exhaustion -- not a full working set -- that produces the allocation
    failures the generation stack reports as `HostBuffer.read_file_slice
    failed`. Measured 2026-08-25 mid-run: 167.5 GB used of a 176.8 GB limit,
    95%, with generations still nominally succeeding but crawling.
    """
    r = subprocess.run(
        ["powershell", "-NoProfile", "-Command",
         "$o=Get-CimInstance Win32_OperatingSystem; "
         "'{0} {1}' -f ($o.TotalVirtualMemorySize-$o.FreeVirtualMemory),"
         "$o.TotalVirtualMemorySize"],
        capture_output=True, text=True)
    used_kb, limit_kb = (float(x) for x in r.stdout.strip().split())
    return used_kb / 1048576, limit_kb / 1048576


# Disk is not an independent resource on this box -- it is where commit charge
# goes. Measured 2026-08-26: across six Flux 2 lanes the system pagefile grew to
# 136 GB (peak usage 107 GB) and free disk fell from 262 GB to 100 GB. Nothing
# downloaded it; Windows grew pagefile.sys in real time to absorb the commit the
# generation stack demanded, which is exactly why commit exhaustion was survived
# rather than fatal.
#
# The failure mode this creates is circular and silent: a full disk means the
# pagefile cannot grow, which means commit hits its limit, which is the
# `HostBuffer.read_file_slice failed` hang the rest of this module exists to
# prevent. So disk headroom is a generation resource and is checked as one.
#
# Do NOT "fix" a large pagefile by capping it. It is load-bearing.
DISK_FLOOR_GB = 40.0


def disk_free():
    """(free_gb, total_gb) on the system drive."""
    r = subprocess.run(
        ["powershell", "-NoProfile", "-Command",
         "$d=Get-PSDrive C; '{0} {1}' -f $d.Free,($d.Free+$d.Used)"],
        capture_output=True, text=True)
    free_b, total_b = (float(x) for x in r.stdout.strip().split())
    return free_b / 1073741824, total_b / 1073741824


def pagefile():
    """(allocated_gb, peak_used_gb) -- how much disk commit has already eaten."""
    r = subprocess.run(
        ["powershell", "-NoProfile", "-Command",
         "$p=Get-CimInstance Win32_PageFileUsage | Select-Object -First 1; "
         "'{0} {1}' -f $p.AllocatedBaseSize,$p.PeakUsage"],
        capture_output=True, text=True)
    try:
        alloc_mb, peak_mb = (float(x) for x in r.stdout.strip().split())
    except ValueError:
        return 0.0, 0.0
    return alloc_mb / 1024, peak_mb / 1024


def stop_comfy(wait=30):
    """Kill ComfyUI outright and wait for the memory to come back.

    `/free` unloads models but does not return the process's accumulated
    footprint; across a long batch that footprint only grows. A restart is the
    only reliable way to give it back.
    """
    pids = comfy_process_ids()
    if not pids:
        return True
    subprocess.run(
        ["powershell", "-NoProfile", "-Command",
         "Stop-Process -Id " + ",".join(str(p) for p in pids) +
         " -Force -ErrorAction SilentlyContinue"],
        capture_output=True, text=True)
    deadline = time.time() + wait
    while time.time() < deadline:
        time.sleep(2)
        if not comfy_process_ids():
            return True
    return False


MY_PREFIXES = ("baseline", "reference", "hero", "chain-", "ref2va-", "shot")


def foreign_job():
    """A running ComfyUI job that this pipeline did not submit, or None.

    **This box is not ours alone.** Discovered 2026-08-26 the expensive way: a
    second workload (`forge.py plans/sweep-01.json`, writing `foundry-*`) was
    driving the same ComfyUI for the whole session, and `recycle_comfy()` does
    `Stop-Process -Force`. Every recycle -- nine across the stills lanes, one
    before each motion clip -- would have killed whatever that pipeline had in
    flight, silently, from its point of view for no reason at all.

    ComfyUI is a shared singleton with no notion of tenancy, so the only
    available courtesy is to look before killing. Identify jobs by the
    filename_prefix they will write: ours start with MY_PREFIXES.
    """
    try:
        q = _get(f"{COMFY}/queue", timeout=10)
    except Exception:
        return None
    for item in q.get("queue_running", []):
        wf = item[2] if len(item) > 2 else {}
        if not isinstance(wf, dict):
            continue
        for node in wf.values():
            if not isinstance(node, dict):
                continue
            pre = (node.get("inputs") or {}).get("filename_prefix")
            if isinstance(pre, str) and not pre.startswith(MY_PREFIXES):
                return pre
    return None


def recycle_comfy(reason="", force=False):
    """Hard-restart ComfyUI to reclaim what a long batch has accumulated.

    Refuses while someone else's job is running, because the restart would
    destroy it. Pass force=True only when you know the other job is expendable.
    """
    other = foreign_job()
    if other and not force:
        raise RuntimeError(
            f"refusing to recycle ComfyUI: another pipeline's job is running "
            f"({other!r}). A recycle is Stop-Process -Force and would kill it. "
            f"Wait for it, or pass force=True if it is expendable.")
    used, limit = commit()
    rf, _ = ram()
    print(f"  guard: recycling ComfyUI{' (' + reason + ')' if reason else ''} "
          f"-- RAM {rf:.1f} free, commit {used:.0f}/{limit:.0f} GB")
    stop_comfy()
    time.sleep(3)
    ok = start_comfy()
    used, limit = commit()
    rf, _ = ram()
    print(f"  guard: back up -- RAM {rf:.1f} free, commit {used:.0f}/{limit:.0f} GB")
    return ok


def headroom_ok(ram_floor=None, commit_frac=0.90, disk_floor=None):
    """Is it safe to keep going? False means recycle before the next load.

    Recycling reclaims RAM and commit. It does NOT reclaim disk -- a pagefile
    that has grown stays grown -- so `disk_ok()` is reported separately by
    callers that need to stop rather than restart.
    """
    ram_floor = RAM_FLOOR_GB if ram_floor is None else ram_floor
    rf, _ = ram()
    used, limit = commit()
    return rf >= ram_floor and (used / limit) < commit_frac


# VRAM is the constraint host-memory checks cannot see, and it is the one that
# binds for video. Measured 2026-08-26 on the H3 chain lane at 832x480x73: clip
# 1 succeeded, clip 2 died with "Allocation on device 0 would exceed allowed
# memory -- currently allocated 20.23 GiB" while RAM and commit both looked
# healthy. A finished clip does not give its VRAM back, so a lane that runs
# several must start each one on an engine that has.
VRAM_FLOOR_GB = 8.0


def vram_ok(floor=None):
    """Is there room on the card for another clip? False means recycle."""
    floor = VRAM_FLOOR_GB if floor is None else floor
    vf, _ = vram()
    return vf >= floor


def disk_ok(floor=None):
    """Is there room left for the pagefile to grow into? Recycling will not help."""
    floor = DISK_FLOOR_GB if floor is None else floor
    free, _ = disk_free()
    return free >= floor


def require_disk(floor=None):
    """Refuse to start a heavy load that could wedge the box by filling the disk."""
    floor = DISK_FLOOR_GB if floor is None else floor
    free, total = disk_free()
    alloc, peak = pagefile()
    if free < floor:
        raise RuntimeError(
            f"only {free:.1f} GB free of {total:.0f} on C: (floor {floor:.0f}). "
            f"pagefile is {alloc:.0f} GB allocated, {peak:.0f} GB peak. A full disk "
            f"stops the pagefile growing, which turns commit pressure back into a "
            f"silent hang. Free space before running this stage.")
    return free


def status():
    vf, vt = vram()
    rf, rt = ram()
    res = ollama_resident()
    print(f"VRAM  {vf:5.1f} free / {vt:.0f} GB   ({100 * (1 - vf / vt):.0f}% used)")
    print(f"RAM   {rf:5.1f} free / {rt:.0f} GB   ({100 * (1 - rf / rt):.0f}% used)")
    df, dt = disk_free()
    alloc, peak = pagefile()
    print(f"DISK  {df:5.1f} free / {dt:.0f} GB   (pagefile {alloc:.0f} GB alloc, {peak:.0f} GB peak)")
    print(f"ollama resident: {res or 'nothing'}")
    print(f"comfyui: {'running' if comfy_up() else 'not running'}")
    return vf, rf


def require(vram_gb=0.0, ram_gb=0.0, free=(), wait=60, verbose=True):
    """Free what was asked for, then confirm the headroom exists.

    Returns True when the budget is met. Raises RuntimeError when it is not --
    a caller that ignores this would be starting exactly the load that hangs.
    """
    for engine in free:
        if engine == "ollama":
            got = free_ollama()
            if verbose and got:
                print(f"  guard: unloaded ollama {got}")
        elif engine == "comfy":
            ok = free_comfy()
            if verbose and ok:
                print("  guard: asked comfyui to free models")

    deadline = time.time() + wait
    while True:
        vf, _ = vram()
        rf, _ = ram()
        if vf >= vram_gb and rf >= ram_gb:
            if verbose:
                print(f"  guard: ok - {vf:.1f} GB VRAM, {rf:.1f} GB RAM free")
            return True
        if time.time() > deadline:
            raise RuntimeError(
                f"insufficient resources: need {vram_gb:.1f} GB VRAM / {ram_gb:.1f} GB RAM, "
                f"have {vf:.1f} / {rf:.1f} after freeing {list(free) or 'nothing'}. "
                f"Refusing to start a load that would spill to host memory or crash.")
        time.sleep(3)


def require_model(model, vram_gb=0.0, ram_gb=0.0, free=(), **kw):
    """Headroom for a specific ollama model -- already-resident counts as met.

    The naive check asks for N GB free before loading an N GB model, which can
    never pass once that very model is loaded: it IS the memory in use. That
    reads as a resource failure and stops a run that was fine. Residency is the
    goal; free space is only the means.
    """
    if model in ollama_resident():
        return True
    return require(vram_gb=vram_gb, ram_gb=ram_gb, free=free, **kw)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--free-all", action="store_true")
    ap.add_argument("--free", nargs="*", default=[], choices=["ollama", "comfy"])
    ap.add_argument("--require-vram", type=float, default=0.0)
    ap.add_argument("--require-ram", type=float, default=0.0)
    args = ap.parse_args()

    if args.free_all:
        print("freeing ollama:", free_ollama() or "nothing resident")
        print("freeing comfyui:", "ok" if free_comfy() else "not running")
        time.sleep(2)

    if args.require_vram or args.require_ram:
        try:
            require(args.require_vram, args.require_ram, free=args.free)
        except RuntimeError as e:
            print(f"GUARD FAILED: {e}")
            sys.exit(1)
        return

    status()


if __name__ == "__main__":
    main()
