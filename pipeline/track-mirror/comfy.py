"""ComfyUI's queue and the card's lease, for the track-mirror renders.

Tenancy is hold.py beside this process (docs/concepts/yue2-audio-experiments-2026-11-06.md): the lease
names this batch to every other tenant between renders, when ComfyUI's queue reads empty. A lost or
refused lease is said out loud and stops the batch, because a render beside another tenant's H3 clip
fails both.
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
import uuid
from pathlib import Path

COMFY = "http://127.0.0.1:8188"
COMFY_ROOT = Path("C:/Users/kazda/ai/ComfyUI/ComfyUI")
REPO = Path(__file__).resolve().parents[2]
CHECKPOINT = "yue2_3b_int8_convrot.safetensors"
ENCODER = "sheetsage2_bf16.safetensors"


def post(path, payload):
    request = urllib.request.Request(
        COMFY + path, data=json.dumps(payload).encode(), headers={"content-type": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def get(path):
    with urllib.request.urlopen(COMFY + path, timeout=30) as response:
        return json.load(response)


def run_graph(graph, timeout_s=900):
    """Submit one graph and wait. Returns its history entry; raises on a node error, with its message."""
    prompt_id = post("/prompt", {"prompt": graph, "client_id": uuid.uuid4().hex})["prompt_id"]
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        history = get(f"/history/{prompt_id}")
        if prompt_id in history:
            entry = history[prompt_id]
            status = entry.get("status", {})
            if status.get("status_str") == "error":
                messages = [m[1] for m in status.get("messages", []) if m[0] == "execution_error"]
                detail = messages[0].get("exception_message", "?") if messages else "?"
                raise RuntimeError(f"ComfyUI: {detail.strip()}")
            return entry
        time.sleep(1.0)
    raise TimeoutError(f"{prompt_id} did not finish in {timeout_s} s")


def stage_input(path):
    """Copy a file into ComfyUI's input folder once. LoadAudio only reads names from there."""
    target = COMFY_ROOT / "input" / f"track-mirror-{Path(path).name}"
    if not target.exists() or target.stat().st_size != Path(path).stat().st_size:
        shutil.copyfile(path, target)
    return target.name


class Tenancy:
    """The card's lease for this process's lifetime: hold.py watches our pid, a stop file releases it."""

    def __init__(self, tenant, wait_s=6 * 3600):
        self.stop = Path(tempfile.gettempdir()) / f"track-mirror-{uuid.uuid4().hex}.stop"
        self.tenant = tenant
        self.wait_s = wait_s
        self.process = None

    def __enter__(self):
        self.process = subprocess.Popen(
            [sys.executable, "-I", str(REPO / "pipeline/gpu/hold.py"), "--tenant", self.tenant, "--engine", "comfy",
             "--while-pid", str(os.getpid()), "--wait", str(self.wait_s), "--stop-file", str(self.stop), "--vram", "8"],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, cwd=REPO,
        )
        # hold.py says "waiting" while another tenant has the card, then "holding" or why it gave up.
        while True:
            line = self.process.stdout.readline().strip()
            print(line, flush=True)
            if "holding" in line:
                return self
            if "waiting" not in line:
                raise RuntimeError(f"no lease: {line}")

    def __exit__(self, *_):
        self.stop.write_text("done")
        try:
            print(self.process.communicate(timeout=30)[0].strip(), flush=True)
        except subprocess.TimeoutExpired:
            print("hold: did not exit in 30 s", flush=True)
        self.stop.unlink(missing_ok=True)
        return False


def transcribe_graph(input_name, mode):
    return {
        "1": {"class_type": "LoadAudio", "inputs": {"audio": input_name}},
        "2": {"class_type": "AudioEncoderLoader", "inputs": {"audio_encoder_name": ENCODER}},
        "3": {"class_type": "SheetSage2AudioToABC", "inputs": {"audio_encoder": ["2", 0], "audio": ["1", 0], "mode": mode}},
        "4": {"class_type": "PreviewAny", "inputs": {"source": ["3", 0]}},
    }


def transcribe(audio, mode):
    entry = run_graph(transcribe_graph(stage_input(audio), mode))
    text = entry["outputs"]["4"]["text"]
    return text[0] if isinstance(text, list) else text


def render_graph(take):
    """One cover take. Knobs match the blueprint unless the take sets them; see prompts.py."""
    music = {
        "clip": ["1", 1], "style": take["style"], "lyrics": take["lyrics"], "abc": take["abc"],
        "seed": take["seed"], "mode": take["mode"], "max_duration": take.get("max_duration", 120.0),
        "temperature": take.get("temperature", 1.0), "top_p": take.get("top_p", 0.95),
        "top_k": take.get("top_k", 100), "repetition_penalty": take.get("repetition_penalty", 1.2),
    }
    music.update(take.get("music_extra", {}))
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CHECKPOINT}},
        "2": {"class_type": "YuE2GenerateMusic", "inputs": music},
        "3": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["2", 0]}},
        "4": {"class_type": "EmptyYuE2LatentAudio", "inputs": {"seconds": ["2", 1], "batch_size": 1}},
        "5": {"class_type": "KSampler", "inputs": {
            "model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0],
            "seed": take["seed"], "steps": take.get("steps", 32), "cfg": 1, "sampler_name": "dpm_2",
            "scheduler": "sgm_uniform", "denoise": 1}},
        "6": {"class_type": "VAEDecodeAudio", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        "7": {"class_type": "SaveAudio", "inputs": {"audio": ["6", 0], "filename_prefix": f"audio/track-mirror/{take['name']}"}},
    }


def render(take, out_path):
    """Render, then move the file out of ComfyUI's output folder to where the page reads it."""
    started = time.time()
    entry = run_graph(render_graph(take))
    saved = entry["outputs"]["7"]["audio"][0]
    source = COMFY_ROOT / "output" / saved.get("subfolder", "") / saved["filename"]
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(source), out_path)
    return round(time.time() - started, 1)
