"""The Node <-> Python contract every yue2 script speaks (lib/yue2/wsl.ts is the one caller).

stdout's LAST line is one JSON object: {"ok": true, ...op fields} with exit 0, or
{"ok": false, "error": "<sentence>", "kind": "missing-module"|"refused"|"failed"} with exit 1.
Earlier stdout lines are free-form logs (Node keeps a bounded tail of them for errors).

`refused` = the arguments (a bad flag, a missing input file); `missing-module` = an import failed (the
error is Python's own ImportError sentence); `failed` = everything else (decode, CUDA, a model).

Paths: every path comes from argv or env. YUE2_HOME (default ~/yue2-lab) is the WSL lab dir that holds
the venvs, ext/SongEval, models/ and the caches; nothing else is hard-coded.

Only the standard library is imported here, so a broken venv still answers in JSON.
"""
from __future__ import annotations

import argparse
import gc
import json
import os
import shutil
import subprocess
import sys
import threading
import time
import traceback
from pathlib import Path

LAB = Path(os.environ.get("YUE2_HOME") or (Path.home() / "yue2-lab")).expanduser()
EVAL_BIN = LAB / ".eval-bin"          # ffmpeg symlink (imageio-ffmpeg) + the zig cc wrapper of the eval install
SONGEVAL_DIR = LAB / "ext" / "SongEval"
SEP_MODEL_DIR = LAB / "models" / "audio-separator"
NVSMI = shutil.which("nvidia-smi") or "/usr/lib/wsl/lib/nvidia-smi"


class Refused(Exception):
    """The caller's arguments are wrong: Node maps it to `invalid`."""


class Failed(Exception):
    """The work itself failed (a render that OOMed, a decoder that said no)."""


class Parser(argparse.ArgumentParser):
    """argparse whose usage errors become a `refused` answer instead of exit 2 with text on stderr."""

    def error(self, message):
        raise Refused(f"{self.prog}: {message}")


def log(*a):
    print(time.strftime("[%H:%M:%S]"), *a, flush=True)


def need_file(path: str, what: str) -> Path:
    p = Path(path).expanduser()
    if not p.is_file():
        raise Refused(f"{what}: no such file: {path}")
    return p


def emit(obj: dict, code: int):
    sys.stdout.flush()
    print(json.dumps(obj, ensure_ascii=True, separators=(",", ":"), default=str), flush=True)
    raise SystemExit(code)


def run(main):
    """Call main() -> dict of op fields and answer the contract's last line, whatever happened."""
    try:
        fields = main()
    except Refused as e:
        emit({"ok": False, "error": str(e), "kind": "refused"}, 1)
    except ImportError as e:
        traceback.print_exc()
        emit({"ok": False, "error": str(e), "kind": "missing-module"}, 1)
    except SystemExit:
        raise
    except BaseException as e:  # noqa: BLE001 - the contract answers every failure, KeyboardInterrupt included
        traceback.print_exc()
        emit({"ok": False, "error": f"{type(e).__name__}: {e}", "kind": "failed"}, 1)
    emit({"ok": True, **fields}, 0)


# ---------------------------------------------------------------- GPU helpers (torch imported lazily)
class GpuSampler:
    """Polls device-wide used memory (nvidia-smi) - includes other processes on the GPU."""

    def __init__(self, interval=0.5):
        self.interval, self.peak, self._run = interval, 0, False

    def _poll(self):
        while self._run:
            try:
                out = subprocess.check_output([NVSMI, "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
                                              text=True, timeout=5)
                self.peak = max(self.peak, int(out.strip().splitlines()[0]))
            except Exception:  # noqa: BLE001 - a missing nvidia-smi only loses the device peak
                pass
            time.sleep(self.interval)

    def __enter__(self):
        self._run = True
        self.t = threading.Thread(target=self._poll, daemon=True)
        self.t.start()
        return self

    def __exit__(self, *a):
        self._run = False
        self.t.join(timeout=6)


def gpu_used_mib():
    try:
        out = subprocess.run([NVSMI, "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
                             capture_output=True, text=True, timeout=5).stdout
        return int(out.strip().splitlines()[0])
    except Exception:  # noqa: BLE001
        return None


def free_gpu():
    gc.collect()
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.synchronize()
            torch.cuda.empty_cache()
    except Exception:  # noqa: BLE001
        pass


def torch_peak_reset():
    import torch
    if torch.cuda.is_available():
        torch.cuda.reset_peak_memory_stats()


def torch_peak_gib():
    import torch
    return round(torch.cuda.max_memory_reserved() / 2**30, 2) if torch.cuda.is_available() else None
