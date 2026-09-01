"""Dojo video pair runner: seed-matched A/B duos of 5s CLIPS on the local stack.

    python dojo_video.py foundry-out/training/<cycle-id>

Wan 2.2 TI2V 5B (t2v; the standard native ComfyUI graph: UNETLoader +
umt5 CLIPLoader(type wan) + wan VAE + Wan22ImageToVideoLatent with no start
image + ModelSamplingSD3 shift + KSampler + VAEDecode + SaveWEBM). Same
gen-spec.json shape as dojo_pairs.py plus per-spec {"length": 121, "fps": 24}.

Judging reads STILLS (the skill's rule): every clip gets three posters cut by
ffmpeg at 0% / 50% / 100%, each read back by the forge's annotator, so a blind
judge sees start, middle and end in words — enough to judge staging, light,
and whether ONE readable move happened. No Gemini on this dimension (operator:
spare the cost); the chokepoint judge is the only machine judge.

Resumable: a .webm on disk is a finished render; a key in readbacks.json a
finished readback triptych.
"""
import base64
import json
import shutil
import sys
import time
import subprocess
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent
PROBE = HERE.parent / "vlm-probe"
ROOT = HERE.parent.parent
sys.path.insert(0, str(PROBE))
sys.path.insert(0, str(HERE))
import guard  # noqa: E402
from consistency import COMFY_OUT  # noqa: E402
from probe import run_ollama  # noqa: E402
import grade  # noqa: E402

ARMS = ("baseline", "challenger")
NEG = ("static frame, frozen image, no motion, jitter, flicker, morphing anatomy, extra limbs, "
       "text, letters, watermark, logo, caption, subtitles")


def wan_workflow(prompt, seed, width, height, length, steps=20, cfg=5.0, prefix="dojo-video"):
    return {
        "1": {"class_type": "UNETLoader",
              "inputs": {"unet_name": "wan2.2_ti2v_5B_fp16.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader",
              "inputs": {"clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors", "type": "wan", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "wan2.2_vae.safetensors"}},
        "4": {"class_type": "ModelSamplingSD3", "inputs": {"model": ["1", 0], "shift": 8.0}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": prompt}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": NEG}},
        "7": {"class_type": "Wan22ImageToVideoLatent",
              "inputs": {"vae": ["3", 0], "width": width, "height": height, "length": length, "batch_size": 1}},
        "8": {"class_type": "KSampler",
              "inputs": {"model": ["4", 0], "positive": ["5", 0], "negative": ["6", 0], "latent_image": ["7", 0],
                         "seed": seed, "steps": steps, "cfg": cfg, "sampler_name": "uni_pc",
                         "scheduler": "simple", "denoise": 1.0}},
        "9": {"class_type": "VAEDecode", "inputs": {"samples": ["8", 0], "vae": ["3", 0]}},
        "10": {"class_type": "SaveWEBM",
               "inputs": {"images": ["9", 0], "filename_prefix": prefix, "codec": "vp9", "fps": 24, "crf": 20}},
    }


def generate_video(workflow, timeout=1800):
    """Queue and wait; returns the saved video path. Longer ceiling than a
    still — a 121-frame decode is minutes on its own."""
    body = json.dumps({"prompt": workflow}).encode()
    req = urllib.request.Request("http://127.0.0.1:8188/prompt", data=body,
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=60) as r:
        pid = json.loads(r.read())["prompt_id"]
    deadline = time.time() + timeout
    while time.time() < deadline:
        time.sleep(6)
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:8188/history/{pid}", timeout=30) as r:
                hist = json.loads(r.read())
        except Exception:  # noqa: BLE001
            continue
        if pid not in hist:
            continue
        for node in hist[pid].get("outputs", {}).values():
            for key in ("images", "video", "gifs"):
                for item in node.get(key, []):
                    if str(item.get("filename", "")).endswith((".webm", ".mp4")):
                        return COMFY_OUT / item.get("subfolder", "") / item["filename"]
        raise RuntimeError(f"finished with no video: {hist[pid].get('status')}")
    raise RuntimeError(f"comfyui did not finish {pid} in {timeout}s")


def posters(video, outdir, stem):
    """Three stills: first frame, midpoint, last frame."""
    outdir.mkdir(parents=True, exist_ok=True)
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                "-of", "csv=p=0", str(video)], capture_output=True, text=True).stdout.strip() or "5")
    out = []
    for tag, t in (("t0", 0.05), ("t1", dur / 2), ("t2", max(dur - 0.15, 0.1))):
        p = outdir / f"{stem}--{tag}.png"
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", f"{t:.2f}",
                        "-i", str(video), "-frames:v", "1", "-y", str(p)], check=True)
        out.append(p)
    return out


def main():
    cdir = Path(sys.argv[1])
    if not cdir.is_absolute():
        cdir = ROOT / cdir
    spec = json.loads((cdir / "gen-spec.json").read_text(encoding="utf-8"))
    pairs_dir = cdir / "pairs"
    pairs_dir.mkdir(parents=True, exist_ok=True)
    rb_path = cdir / "readbacks.json"
    readbacks = json.loads(rb_path.read_text(encoding="utf-8")) if rb_path.exists() else {}
    model = spec.get("annotator", "qwen3.8:27b")
    W, H, L = spec.get("width", 848), spec.get("height", 480), spec.get("length", 121)

    units = [(p, arm) for p in spec["pairs"] for arm in ARMS]
    todo = [(p, arm) for p, arm in units if not (pairs_dir / f"{p['id']}--{arm}.webm").exists()]
    print(f"dojo_video: {len(spec['pairs'])} duo(s), {len(units)} clip(s), {len(todo)} to render "
          f"at {W}x{H}x{L}", flush=True)

    if todo:
        guard.require(ram_gb=0, free=["ollama"], verbose=False)
        if guard.comfy_process_ids():
            guard.recycle_comfy("fresh engine for dojo video")
        elif not guard.start_comfy():
            raise SystemExit("ComfyUI is not running and could not be started")
        guard.require(vram_gb=16, ram_gb=guard.RAM_FLOOR_GB, verbose=False)
        for n, (p, arm) in enumerate(todo, 1):
            if not guard.headroom_ok():
                guard.recycle_comfy("headroom")
            wf = wan_workflow(p[arm]["prompt"], p["seed"], W, H, L, steps=spec.get("steps", 20),
                              prefix=f"dojo-{cdir.name}")
            t0 = time.time()
            try:
                vid = generate_video(wf)
            except Exception as e:  # noqa: BLE001
                print(f"  [{n}/{len(todo)}] {p['id']}--{arm} FAILED: {str(e)[:90]}", flush=True)
                if not guard.recycle_comfy("after failure"):
                    break
                continue
            out = pairs_dir / f"{p['id']}--{arm}.webm"
            shutil.copy2(vid, out)
            out.with_suffix(".json").write_text(json.dumps(
                {"id": p["id"], "arm": arm, "seed": p["seed"], "prompt": p[arm]["prompt"],
                 "size": [W, H, L]}, indent=2, ensure_ascii=False), encoding="utf-8")
            posters(out, pairs_dir, f"{p['id']}--{arm}")
            print(f"  [{n}/{len(todo)}] {p['id']}--{arm} -> {time.time()-t0:.0f}s", flush=True)

    # readbacks: three stills per clip, craft + style
    need = []
    for p, arm in units:
        key = f"{p['id']}--{arm}"
        if (pairs_dir / f"{key}.webm").exists():
            if not (pairs_dir / f"{key}--t0.png").exists():
                posters(pairs_dir / f"{key}.webm", pairs_dir, key)
            if key not in readbacks:
                need.append((p, arm))
    if need:
        guard.require_model(model, vram_gb=20, ram_gb=guard.RAM_FLOOR_GB, free=["comfy"], verbose=False)
        for n, (p, arm) in enumerate(need, 1):
            key = f"{p['id']}--{arm}"
            entry = {}
            for tag in ("t0", "t1", "t2"):
                b64 = base64.b64encode((pairs_dir / f"{key}--{tag}.png").read_bytes()).decode("ascii")
                one = {}
                try:
                    text, _ = run_ollama(model, b64, "image/png")
                    one["craft"] = grade.parse(text)
                except Exception as e:  # noqa: BLE001
                    one["craft_error"] = str(e)[:200]
                entry[tag] = one
            readbacks[key] = entry
            rb_path.write_text(json.dumps(readbacks, indent=1, ensure_ascii=False), encoding="utf-8")
            print(f"  readback [{n}/{len(need)}] {key}", flush=True)

    rendered = sum(1 for p, arm in units if (pairs_dir / f"{p['id']}--{arm}.webm").exists())
    print(f"dojo_video: done -- {rendered}/{len(units)} clip(s), {len(readbacks)}/{len(units)} read back", flush=True)


if __name__ == "__main__":
    main()
