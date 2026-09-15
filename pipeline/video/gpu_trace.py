"""Sample what the machine is actually doing while a render runs.

    python pipeline/video/gpu_trace.py --out trace.csv -- python some_render.py
    python pipeline/video/gpu_trace.py --summarise trace.csv

WHY. "It used to be faster" is not a measurement, and neither is a wall-clock
number on its own: a render that takes forty minutes because the card is pinned
at its power limit is healthy, and one that takes forty minutes at 30% GPU with
the host swapping is broken. Those two need completely different fixes and look
identical from outside.

So this samples, twice a second, the six numbers that separate them:

    GPU UTILISATION   near 100 means the card is the bottleneck, which is the
                      good case. Sustained low utilisation during a render means
                      the card is WAITING -- for host memory, for the disk, or
                      for weights being shuffled in and out.
    SM CLOCK          against the card's maximum. A card sitting far below its
                      own ceiling while busy is being held back by something.
    POWER             against the limit. The honest measure of whether real work
                      is happening; a card doing tensor maths pulls near its cap.
    THROTTLE REASONS  the driver's own answer to "why am I slow", as a bitmask.
                      Thermal, power and reliability slowdowns each have a bit,
                      and one of them being lit ends the argument.
    VRAM USED         approaching the total means the loader is about to start
                      spilling, which is the slow path.
    HOST RAM + COMMIT the failure this box actually has. pipeline/vlm-probe/
                      guard.py spends a paragraph on it: exhaustion presents as
                      a hang, never as an error, and commit charge predicts it
                      better than free physical memory does.

The summary prints medians and the worst moment of each, plus the share of
samples where the GPU was under 50% -- the single number that says "the card was
not the problem".

Stdlib only. Needs nvidia-smi on PATH; without it, says so and runs the command
anyway rather than refusing.
"""
import argparse
import csv
import subprocess
import sys
import threading
import time
from pathlib import Path

SAMPLE_SECONDS = 0.5

FIELDS = ("utilization.gpu", "memory.used", "memory.total", "clocks.sm", "clocks.max.sm",
          "power.draw", "power.limit", "temperature.gpu", "clocks_throttle_reasons.active")

# The driver's bitmask, in the order the bits sit. Bit 0 is idle, which is not a
# fault; every other bit lit during a render is a finding.
THROTTLE_BITS = [
    (0x0000000000000001, "idle"),
    (0x0000000000000002, "application clocks setting"),
    (0x0000000000000004, "sw power cap"),
    (0x0000000000000008, "hw slowdown"),
    (0x0000000000000010, "sync boost"),
    (0x0000000000000020, "sw thermal slowdown"),
    (0x0000000000000040, "hw thermal slowdown"),
    (0x0000000000000080, "hw power brake slowdown"),
    (0x0000000000000100, "display clock setting"),
]


def decode_throttle(mask):
    if not mask:
        return ""
    return "+".join(name for bit, name in THROTTLE_BITS if mask & bit) or hex(mask)


def gpu_sample():
    r = subprocess.run(
        ["nvidia-smi", f"--query-gpu={','.join(FIELDS)}", "--format=csv,noheader,nounits"],
        capture_output=True, text=True)
    line = (r.stdout or "").strip().splitlines()
    if not line:
        return None
    parts = [p.strip() for p in line[0].split(",")]
    if len(parts) != len(FIELDS):
        return None
    out = {}
    for k, v in zip(FIELDS, parts):
        if k == "clocks_throttle_reasons.active":
            out[k] = int(v, 16) if v.startswith("0x") else int(v or 0)
        else:
            try:
                out[k] = float(v)
            except ValueError:
                out[k] = 0.0
    return out


def host_sample():
    """Free physical RAM and the commit charge, both in GB."""
    r = subprocess.run(
        ["powershell", "-NoProfile", "-Command",
         "$o=Get-CimInstance Win32_OperatingSystem; "
         "'{0} {1} {2} {3}' -f $o.FreePhysicalMemory,$o.TotalVisibleMemorySize,"
         "($o.TotalVirtualMemorySize-$o.FreeVirtualMemory),$o.TotalVirtualMemorySize"],
        capture_output=True, text=True)
    try:
        free_kb, total_kb, cused_kb, ctotal_kb = (float(x) for x in r.stdout.split())
    except ValueError:
        return {"ram_free_gb": 0.0, "ram_total_gb": 0.0, "commit_gb": 0.0, "commit_total_gb": 0.0}
    return {"ram_free_gb": free_kb / 1048576, "ram_total_gb": total_kb / 1048576,
            "commit_gb": cused_kb / 1048576, "commit_total_gb": ctotal_kb / 1048576}


class Tracer(threading.Thread):
    """Host sampling is a PowerShell round-trip and costs ~200ms, so it is taken
    every eighth GPU sample rather than every one; the GPU numbers are the ones
    that need resolution."""

    def __init__(self, path, interval=SAMPLE_SECONDS):
        super().__init__(daemon=True)
        self.path, self.interval, self.stop = Path(path), interval, threading.Event()
        self.rows = []

    def run(self):
        t0 = time.time()
        host = host_sample()
        n = 0
        while not self.stop.is_set():
            g = gpu_sample()
            if g:
                if n % 8 == 0:
                    host = host_sample()
                self.rows.append({"t": round(time.time() - t0, 2), **g, **host})
            n += 1
            self.stop.wait(self.interval)
        if self.rows:
            with open(self.path, "w", newline="", encoding="utf-8") as f:
                w = csv.DictWriter(f, fieldnames=list(self.rows[0].keys()))
                w.writeheader()
                w.writerows(self.rows)


def pct(vals, p):
    if not vals:
        return 0.0
    s = sorted(vals)
    return s[min(len(s) - 1, int(len(s) * p))]


def summarise(rows):
    if not rows:
        print("no samples")
        return
    util = [r["utilization.gpu"] for r in rows]
    clk = [r["clocks.sm"] for r in rows]
    pw = [r["power.draw"] for r in rows]
    vram = [r["memory.used"] for r in rows]
    ramf = [r["ram_free_gb"] for r in rows]
    commit = [r["commit_gb"] for r in rows]
    maxclk = max(r["clocks.max.sm"] for r in rows) or 1
    lim = max(r["power.limit"] for r in rows) or 1
    total_vram = max(r["memory.total"] for r in rows) or 1
    ctotal = max(r["commit_total_gb"] for r in rows) or 1
    dur = rows[-1]["t"]
    # Bit 0 is "idle", which during a render means the card had nothing to do --
    # itself a finding, but not a throttle. Everything else is.
    faults = {}
    for r in rows:
        m = int(r["clocks_throttle_reasons.active"]) & ~0x1
        if m:
            faults[decode_throttle(m)] = faults.get(decode_throttle(m), 0) + 1
    starved = sum(1 for u in util if u < 50) / len(util) * 100

    print(f"\n  samples {len(rows)} over {dur:.0f}s")
    print(f"  gpu util      median {pct(util, .5):5.0f}%   p10 {pct(util, .1):5.0f}%   "
          f"under 50% for {starved:.0f}% of the run")
    print(f"  sm clock      median {pct(clk, .5):5.0f}MHz of {maxclk:.0f}  "
          f"({pct(clk, .5) / maxclk * 100:.0f}% of ceiling)")
    print(f"  power         median {pct(pw, .5):5.0f}W of {lim:.0f}  "
          f"({pct(pw, .5) / lim * 100:.0f}% of cap)")
    print(f"  vram          peak   {max(vram):5.0f}MiB of {total_vram:.0f}  "
          f"({max(vram) / total_vram * 100:.0f}%)")
    print(f"  host ram free min    {min(ramf):5.1f}GB")
    print(f"  commit charge peak   {max(commit):5.1f}GB of {ctotal:.0f}  "
          f"({max(commit) / ctotal * 100:.0f}%)")
    if faults:
        print("  THROTTLED:", ", ".join(f"{k} ({n} samples)" for k, n in faults.items()))
    else:
        print("  throttling    none reported by the driver")

    # The verdict, stated rather than left to be inferred.
    if starved > 40:
        print("\n  READ: the card was idle for much of the run. The bottleneck is NOT the GPU —\n"
              "        look at host memory, disk, or weights being loaded and unloaded.")
    elif pct(pw, .5) / lim > 0.7:
        print("\n  READ: the card ran near its power cap. This is a healthy render; it is\n"
              "        simply expensive. Make it cheaper by shrinking the job, not the setup.")
    else:
        print("\n  READ: the card was busy but well under its power cap — work is happening\n"
              "        but not dense tensor work. Typical of loading, VAE decode, or a\n"
              "        memory-bound path.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="gpu-trace.csv")
    ap.add_argument("--interval", type=float, default=SAMPLE_SECONDS)
    ap.add_argument("--summarise", default=None, help="read a CSV back instead of running anything")
    ap.add_argument("cmd", nargs=argparse.REMAINDER)
    a = ap.parse_args()

    if a.summarise:
        with open(a.summarise, encoding="utf-8") as f:
            rows = [{k: float(v) for k, v in r.items()} for r in csv.DictReader(f)]
        summarise(rows)
        return

    cmd = a.cmd[1:] if a.cmd and a.cmd[0] == "--" else a.cmd
    if not cmd:
        ap.error("give a command after --")
    if gpu_sample() is None:
        print("nvidia-smi answered nothing usable; running the command untraced")
        sys.exit(subprocess.run(cmd).returncode)

    tr = Tracer(a.out, a.interval)
    tr.start()
    t0 = time.time()
    rc = subprocess.run(cmd).returncode
    tr.stop.set()
    tr.join(timeout=10)
    print(f"\ntraced {time.time() - t0:.0f}s -> {a.out}")
    summarise(tr.rows)
    sys.exit(rc)


if __name__ == "__main__":
    main()
