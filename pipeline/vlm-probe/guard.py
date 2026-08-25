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


def status():
    vf, vt = vram()
    rf, rt = ram()
    res = ollama_resident()
    print(f"VRAM  {vf:5.1f} free / {vt:.0f} GB   ({100 * (1 - vf / vt):.0f}% used)")
    print(f"RAM   {rf:5.1f} free / {rt:.0f} GB   ({100 * (1 - rf / rt):.0f}% used)")
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
