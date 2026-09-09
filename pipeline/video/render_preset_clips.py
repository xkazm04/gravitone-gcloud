"""Render one 5-second clip per preset, on the local stack, from its own swatch.

    python pipeline/video/render_preset_clips.py
    python pipeline/video/render_preset_clips.py --only blueprint --force

IMAGE-TO-VIDEO, not text-to-video, and that is the whole design. The swatch in
public/presets/<id>.jpg is the picture the rail already shows and the user is
already comparing; a clip generated from the same PROMPT would be a second,
different picture in the same style, and the showcase would then be selling
something the rail does not show. Feeding the committed swatch in as
`start_image` means the clip literally begins on the still it replaces.

Wan 2.2 TI2V 5B, the same engine and the same native ComfyUI graph as
pipeline/foundry/dojo_video.py, with `start_image` wired into
Wan22ImageToVideoLatent -- which is what makes that graph i2v rather than t2v.
848x480x121 @ 24fps: the resolution that runner has already proven on this card.

The motion line comes from each preset's own `motion` field in
app/library/presets.ts. It is deliberately small -- a drift, a settle, one
element arriving. A style swatch that reorganises itself is no longer a swatch.

Raw renders land in pipeline/runs/preset-clips/ and are NOT committed. The
committed artefacts are what pipeline/build-preset-clips.mts makes of them.

Resumable: a .webm on disk is a finished render.
"""
import json
import re
import shutil
import sys
import time
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(ROOT / "pipeline" / "vlm-probe"))
sys.path.insert(0, str(ROOT / "pipeline" / "foundry"))
import guard  # noqa: E402
from consistency import stage_reference  # noqa: E402
from dojo_video import generate_video  # noqa: E402

# NOT dojo_video's negative prompt, and the difference is the point. That one
# opens with "static frame, frozen image, no motion" because a dojo pair is
# JUDGED on whether one readable move happened, so it pushes the model to move.
# A style swatch wants the opposite pressure: the least motion that still reads
# as motion. Measured 2026-09-09 on `blueprint` with the dojo negative and a
# motion line asking for lines to draw themselves — a white banner swept the
# frame from frame 40 on. Both halves were wrong; both are fixed here and in the
# `motion` lines in app/library/presets.ts, which are now camera-led.
# Round two, measured 2026-09-09 on the first full batch: three of six clips
# were spoiled not by the camera but by the model ADDING A SUBJECT -- a gloved
# hand entered `chalk-argument` and drew, and a foreground object rose into
# `data-neon` from below. An i2v model handed a sparse graphic frame will fill
# it unless the emptiness is defended, so the second and third lines below are
# not decoration.
NEG = ("white streaks, horizontal bars, light bars, wipe, banner, flash, strobe, glitch, "
       "hand, hands, arm, fingers, glove, person, human, figure, face, "
       "pen, marker, brush, chalk stick, tool, vehicle, object entering frame, "
       "new object, foreground object, subject appearing, "
       "morphing shapes, shapes appearing, shapes disappearing, added elements, "
       "camera shake, fast motion, zoom blur, "
       "text, letters, watermark, logo, caption, subtitles")

W, H, LEN, FPS = 848, 480, 121, 24  # 5.04 s, the proven size on this card
OUT = ROOT / "pipeline" / "runs" / "preset-clips"
PRESETS_TS = ROOT / "app" / "library" / "presets.ts"
SWATCHES = ROOT / "public" / "presets"

# Seed is FIXED across every preset for the same reason the swatches share one
# subject: the clips differ by style and motion line, and by nothing else.
SEED = 770412


def read_presets():
    """id, name and motion line, straight out of the TypeScript.

    Parsed rather than imported: this is the only Python that needs them, and a
    JSON sidecar would be a second copy of a list that already has one home.
    """
    src = PRESETS_TS.read_text(encoding="utf-8")
    out = []
    for block in re.finditer(r"\{\s*\n\s*id:\s*\"([a-z0-9-]+)\",\s*\n\s*name:\s*\"([^\"]+)\",", src):
        pid, name = block.group(1), block.group(2)
        tail = src[block.end():block.end() + 2000]
        m = re.search(r"\n    motion:\s*\n?\s*\"((?:[^\"\\]|\\.)*)\"", tail)
        if not m:
            raise SystemExit(f"preset {pid} has no `motion:` line in presets.ts")
        out.append({"id": pid, "name": name, "motion": m.group(1).replace('\\"', '"')})
    if not out:
        raise SystemExit("no presets parsed out of presets.ts")
    return out


def i2v_workflow(prompt, start_image, seed, prefix):
    """dojo_video.wan_workflow, with the swatch wired into node 7.

    Node-for-node identical otherwise. Duplicated rather than parameterised in
    dojo_video because that file is a measurement runner whose graph is part of
    a recorded result -- changing its signature would put this surface's needs
    inside the dojo's evidence trail.
    """
    return {
        "1": {"class_type": "UNETLoader",
              "inputs": {"unet_name": "wan2.2_ti2v_5B_fp16.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader",
              "inputs": {"clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors", "type": "wan",
                         "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "wan2.2_vae.safetensors"}},
        "4": {"class_type": "ModelSamplingSD3", "inputs": {"model": ["1", 0], "shift": 8.0}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": prompt}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": NEG}},
        "11": {"class_type": "LoadImage", "inputs": {"image": start_image, "upload": "image"}},
        # The swatch is 16:9 and the latent is 848x480 (1.767); scaling with
        # crop=center rather than stretching keeps the style's line weights
        # honest, which is the one thing this clip exists to show.
        "12": {"class_type": "ImageScale",
               "inputs": {"image": ["11", 0], "width": W, "height": H,
                          "upscale_method": "lanczos", "crop": "center"}},
        "7": {"class_type": "Wan22ImageToVideoLatent",
              "inputs": {"vae": ["3", 0], "width": W, "height": H, "length": LEN,
                         "batch_size": 1, "start_image": ["12", 0]}},
        "8": {"class_type": "KSampler",
              "inputs": {"model": ["4", 0], "positive": ["5", 0], "negative": ["6", 0],
                         "latent_image": ["7", 0], "seed": seed, "steps": 20, "cfg": 5.0,
                         "sampler_name": "uni_pc", "scheduler": "simple", "denoise": 1.0}},
        "9": {"class_type": "VAEDecode", "inputs": {"samples": ["8", 0], "vae": ["3", 0]}},
        "10": {"class_type": "SaveWEBM",
               "inputs": {"images": ["9", 0], "filename_prefix": prefix, "codec": "vp9",
                          "fps": FPS, "crf": 20}},
    }


def main():
    argv = sys.argv[1:]
    only = argv[argv.index("--only") + 1] if "--only" in argv else None
    force = "--force" in argv

    presets = [p for p in read_presets() if not only or p["id"] == only]
    OUT.mkdir(parents=True, exist_ok=True)
    todo = [p for p in presets if force or not (OUT / f"{p['id']}.webm").exists()]
    print(f"preset clips: {len(presets)} preset(s), {len(todo)} to render "
          f"at {W}x{H}x{LEN} @ {FPS}fps", flush=True)
    if not todo:
        return

    missing = [p["id"] for p in todo if not (SWATCHES / f"{p['id']}.jpg").exists()]
    if missing:
        raise SystemExit(f"no swatch to animate for: {', '.join(missing)} "
                         f"-- run build-preset-thumbs.mts first")

    guard.require(ram_gb=0, free=["ollama"], verbose=False)
    if guard.comfy_process_ids():
        guard.recycle_comfy("fresh engine for preset clips")
    elif not guard.start_comfy():
        raise SystemExit("ComfyUI is not running and could not be started")
    guard.require(vram_gb=16, ram_gb=guard.RAM_FLOOR_GB, verbose=False)

    failed = []
    for n, p in enumerate(todo, 1):
        if not guard.headroom_ok():
            guard.recycle_comfy("headroom")
        ref = stage_reference(SWATCHES / f"{p['id']}.jpg")
        wf = i2v_workflow(p["motion"], ref, SEED, prefix=f"preset-{p['id']}")
        t0 = time.time()
        try:
            vid = generate_video(wf)
        except Exception as e:  # noqa: BLE001
            print(f"  [{n}/{len(todo)}] {p['id']} FAILED: {str(e)[:100]}", flush=True)
            failed.append(p["id"])
            if not guard.recycle_comfy("after failure"):
                break
            continue
        dest = OUT / f"{p['id']}.webm"
        shutil.copy2(vid, dest)
        dest.with_suffix(".json").write_text(json.dumps(
            {"id": p["id"], "name": p["name"], "motion": p["motion"], "seed": SEED,
             "size": [W, H, LEN], "fps": FPS, "engine": "wan2.2-ti2v-5B/i2v"},
            indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"  [{n}/{len(todo)}] {p['id']} -> {time.time() - t0:.0f}s", flush=True)

    done = sum(1 for p in presets if (OUT / f"{p['id']}.webm").exists())
    print(f"preset clips: {done}/{len(presets)} rendered into {OUT}", flush=True)
    if failed:
        raise SystemExit(f"failed: {', '.join(failed)}")


if __name__ == "__main__":
    main()
