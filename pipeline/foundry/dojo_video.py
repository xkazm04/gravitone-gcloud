"""Dojo video pair runner: seed-matched A/B duos of 5s CLIPS on the local stack.

    python dojo_video.py foundry-out/training/<cycle-id>      (= dojo_run.py: a kernel job)

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

SINCE PHASE 4 (L34) THIS MODULE IS A UNIT PASS driven by dojo_job.py as a kernel
job. The card: v1 took `gpu_lease.acquire` around each phase (one holder at a
time, the recycles this holder's own). The job's slot on gpu.local#1 IS that
lease now, and dojo_job names the tenant through `hold_for_job` before the pass
starts, so the recycles below are still the holder's and nobody else's.
"""
import base64
import json
import shutil
import sys
import subprocess
from pathlib import Path

HERE = Path(__file__).parent
PROBE = HERE.parent / "vlm-probe"
ROOT = HERE.parent.parent
sys.path.insert(0, str(PROBE))
sys.path.insert(0, str(HERE))
import guard  # noqa: E402
import consistency  # noqa: E402
from probe import run_ollama  # noqa: E402
import grade  # noqa: E402

ARMS = ("baseline", "challenger")
EXTS = (".webm",)
MEDIA = "video"
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
    still -- a 121-frame decode is minutes on its own. The poll loop is
    consistency.generate's (guard.COMFY host, a failed poll tolerated while the
    card is busy, a vanished process named)."""
    return consistency.generate(workflow, timeout=timeout,
                                kinds=("images", "video", "gifs"), exts=(".webm", ".mp4"))


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


def order(spec):
    return [(p, arm) for p in spec["pairs"] for arm in ARMS]


def rendered(pairs_dir, p, arm):
    f = pairs_dir / f"{p['id']}--{arm}.webm"
    return f if f.exists() else None


def size_of(spec):
    return spec.get("width", 848), spec.get("height", 480), spec.get("length", 121)


class RenderPass:
    def __init__(self, cdir, spec):
        self.cdir, self.spec = cdir, spec
        self.pairs_dir = cdir / "pairs"
        self.pairs_dir.mkdir(parents=True, exist_ok=True)

    def ready(self):
        guard.require(ram_gb=0, free=["ollama"], verbose=False)
        if guard.comfy_process_ids():
            guard.recycle_comfy("fresh engine for dojo video")
        elif not guard.start_comfy():
            raise SystemExit("ComfyUI is not running and could not be started")
        guard.require(vram_gb=16, ram_gb=guard.RAM_FLOOR_GB, verbose=False)

    def workflow(self, p, arm):
        W, H, L = size_of(self.spec)
        return wan_workflow(p[arm]["prompt"], p["seed"], W, H, L, steps=self.spec.get("steps", 20),
                            prefix=f"dojo-{self.cdir.name}")

    def render(self, p, arm):
        if not guard.headroom_ok():
            guard.recycle_comfy("headroom")
        vid = generate_video(self.workflow(p, arm))
        out = self.pairs_dir / f"{p['id']}--{arm}.webm"
        shutil.copy2(vid, out)
        out.with_suffix(".json").write_text(json.dumps(
            {"id": p["id"], "arm": arm, "seed": p["seed"], "prompt": p[arm]["prompt"],
             "size": list(size_of(self.spec))}, indent=2, ensure_ascii=False), encoding="utf-8")
        posters(out, self.pairs_dir, f"{p['id']}--{arm}")
        return {"file": f"pairs/{out.name}"}

    def after_failure(self):
        return guard.recycle_comfy("after failure")

    def close(self):
        pass


def ready_readback(model):
    # The annotator is the other engine on the card; it takes its own turn.
    guard.require_model(model, vram_gb=20, ram_gb=guard.RAM_FLOOR_GB, free=["comfy"], verbose=False)


def readback(pairs_dir, p, arm, model, video=None):
    """Three stills per clip, craft each. Returns the triptych, or None when no
    still read at all.

    An entry that produced no craft at all is NOT a readback, and caching it is
    worse than failing: `key not in readbacks` is the resume guard, so an error
    entry satisfies it forever and the clip is never read again. Observed
    2026-09-20 with the annotator down -- all three tags of all four clips held
    only `craft_error`, the file was written, and the run still printed
    "4/4 read back". Persist only what actually read; leave the rest for the
    next run. `failure-not-empty-success`."""
    key = f"{p['id']}--{arm}"
    src = video or rendered(pairs_dir, p, arm)
    if src is not None and not (pairs_dir / f"{key}--t0.png").exists():
        posters(src, pairs_dir, key)
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
    return entry if any("craft" in one for one in entry.values()) else None


def main():
    import dojo_run
    raise SystemExit(dojo_run.main(sys.argv[1:]))


if __name__ == "__main__":
    main()
