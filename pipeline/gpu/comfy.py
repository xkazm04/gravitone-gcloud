"""The ONE ComfyUI client: submit, poll, detect a vanished engine, enforce a timeout.

Three copies of this loop existed (consistency.generate, replicate.py,
dojo_video_h3.py) and each had learned a different subset of the rules. They are
here once now:

  1. A /history poll that FAILS while the card is busy is expected -- keep polling.
  2. A poll that fails because the PROCESS is gone is not: the job died with it.
     Raise ComfyVanished at once instead of reporting a timeout an hour or two
     later (consistency.py's behaviour, now shared).
  3. A finished job with no output of the wanted kind is an error, not a result.
  4. A timeout says "go read ComfyUI's stderr", not "retry and hope".

If this process holds a GPU lease (lease.py), every poll heartbeats it, so a
two-hour render does not outlive its ttl and get reclaimed under itself.

The host, the output directory and the liveness probe default to guard's
(resolved per call, so a machine override reaches us) and are injectable so the
selftest needs no ComfyUI.
"""

import json
import sys
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))  # lease.py is imported flat, like guard.py
POLL_S = 4.0


class ComfyError(RuntimeError):
    """The job finished badly: no output of the wanted kind."""


class ComfyVanished(ComfyError):
    """The ComfyUI process is gone; the job died with it."""


class ComfyTimeout(TimeoutError):
    """The budget ran out with the engine still alive."""


def _guard():
    # guard.py lives in vlm-probe and is imported flat everywhere in this repo.
    probe = str(HERE.parent / "vlm-probe")
    if probe not in sys.path:
        sys.path.insert(0, probe)
    import guard
    return guard


def generate(workflow, timeout=900, kinds=("images",), exts=None, host=None, out_dir=None,
             alive=None, poll_s=POLL_S, lease=None):
    """Queue `workflow`; return the saved output path.

    `kinds`/`exts` pick which output list counts (images, video, gifs) and which
    file endings qualify."""
    guard = None
    if host is None or out_dir is None or alive is None:
        guard = _guard()
    host = host or guard.COMFY
    out_dir = Path(out_dir) if out_dir is not None else Path(guard.COMFY_DIR) / "output"
    alive = alive or guard.comfy_process_ids
    if lease is None:
        import lease as lease_mod
        lease = lease_mod.current_handle()

    body = json.dumps({"prompt": workflow}).encode()
    req = urllib.request.Request(f"{host}/prompt", data=body,
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=60) as r:
        pid = json.loads(r.read())["prompt_id"]
    deadline = time.time() + timeout
    while time.time() < deadline:
        time.sleep(poll_s)
        if lease is not None:
            lease.heartbeat()
        try:
            with urllib.request.urlopen(f"{host}/history/{pid}", timeout=30) as r:
                hist = json.loads(r.read())
        except Exception:
            if not alive():
                raise ComfyVanished(
                    f"comfyui process vanished while {pid} was queued -- the job died "
                    f"with it. Read its stderr; guard.start_comfy() brings it back.") from None
            continue
        if pid not in hist:
            continue
        for node in hist[pid].get("outputs", {}).values():
            for kind in kinds:
                for img in node.get(kind, []):
                    if exts is None or str(img.get("filename", "")).endswith(exts):
                        return out_dir / img.get("subfolder", "") / img["filename"]
        raise ComfyError(f"finished with no {'image' if exts is None else 'video'}: {hist[pid].get('status')}")
    raise ComfyTimeout(f"comfyui did not finish {pid} in {timeout}s -- read its stderr")
