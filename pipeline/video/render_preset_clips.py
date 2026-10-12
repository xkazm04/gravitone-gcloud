"""Render one 5-second clip per preset, on the local stack, from its own swatch.

    python pipeline/video/render_preset_clips.py
    python pipeline/video/render_preset_clips.py --only blueprint --takes 4

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

TAKES, NOT A RAW. Every render is kept as a take under
pipeline/runs/preset-clips/<id>/takes/<engine>-<seed>.webm and recorded in
<id>/ledger.json (pipeline/video/ledger.py) with its clip_check verdict. Nothing
is overwritten; `--takes N` renders the first N seeds of SEEDS; adopt one with
`ledger.py adopt <id> <take> [--waiver ...]` and the build squeezes only that.

Raw renders land in pipeline/runs/preset-clips/ and are NOT committed. The
committed artefacts are what pipeline/build-preset-clips.mts makes of them.

Resumable: a .webm on disk is a finished render.
"""
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(ROOT / "pipeline" / "vlm-probe"))
sys.path.insert(0, str(ROOT / "pipeline" / "foundry"))
sys.path.insert(0, str(HERE))
import guard  # noqa: E402
import ledger  # noqa: E402
import motion  # noqa: E402
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

# TWO ENGINES, and h3 is the default because it is the one that works. Wan
# renders the camera and leaves flat linework alone; MiniMax H3 fl2va animates
# the drawing in its own idiom. pipeline/video/README.md carries the evidence.
#
# H3 is 640x384 because its dimensions must divide by 32, and 73 frames because
# its length must be 5 mod 17 -- 124 is the next one up and it wanders off the
# style there. It ARRIVES about 40% of the way through, so every h3 clip is
# retimed afterwards; the sidecar carries the request and
# pipeline/build-preset-clips.mts performs it.
ENGINES = {
    "h3": {"w": 640, "h": 384, "len": 73, "fps": 24, "steps": 8, "retime": 3.0},
    "wan": {"w": 848, "h": 480, "len": 121, "fps": 24, "steps": 20, "retime": None},
}
W, H, LEN, FPS = 848, 480, 121, 24  # wan's proven size on this card
OUT = ROOT / "pipeline" / "runs" / "preset-clips"
SWATCHES = ROOT / "public" / "presets"

# Seed is FIXED across every preset for the same reason the swatches share one
# subject: the clips differ by style and motion line, and by nothing else.
SEED = 770412
# `--takes N` renders the first N of these. A fixed list, not random draws: a
# take is reproducible, and "seed 3" means the same thing on every machine.
SEEDS = [SEED, 770413, 770414, 770415, 770416, 770417, 770418, 770419]


def read_presets():
    """id, name and motion line, from the real module via `npx tsx`.

    Evaluated, not regexed: the old regex model of the TypeScript string syntax
    mis-read any motion line with an escaped quote or a newline. The emitter is
    pipeline/emit-presets.mts, so the list still has exactly one home.
    """
    npx = shutil.which("npx") or shutil.which("npx.cmd") or "npx"
    r = subprocess.run([npx, "tsx", str(ROOT / "pipeline" / "emit-presets.mts")],
                       capture_output=True, text=True, cwd=ROOT, encoding="utf-8")
    if r.returncode != 0:
        raise SystemExit(f"could not read presets via tsx: {(r.stderr or r.stdout).strip()[:300]}")
    out = json.loads(r.stdout)
    if not out:
        raise SystemExit("no presets emitted by pipeline/emit-presets.mts")
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


def h3_workflow(prompt, start_image, cfg, prefix):
    """MiniMax H3 fl2va — first frame in, video out, turbo LoRA at its 8 steps.

    Built here rather than calling motion.chain_workflow so the LoRA and the
    sampler tail stay visible beside the Wan graph they are the alternative to.
    """
    w = {
        "1": {"class_type": "UNETLoader",
              "inputs": {"unet_name": motion.FL2VA, "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader",
              "inputs": {"clip_name": motion.TEXT_ENC, "type": "minimax", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": motion.VIDEO_VAE}},
        "10": {"class_type": "LoadImage", "inputs": {"image": start_image}},
        "11": {"class_type": "MiniMaxH3ImageToVideo",
               "inputs": {"clip": ["2", 0], "vae": ["3", 0], "prompt": prompt,
                          "width": cfg["w"], "height": cfg["h"], "length": cfg["len"],
                          "first_frame": ["10", 0]}},
        "12": {"class_type": "LoraLoaderModelOnly",
               "inputs": {"model": ["1", 0], "lora_name": motion.FL_LORA, "strength_model": 1.0}},
    }
    return motion._tail(w, ["12", 0], ["11", 0], ["11", 1], cfg["steps"],
                        "res_multistep", prefix, cfg["len"])


def main():
    argv = sys.argv[1:]
    only = argv[argv.index("--only") + 1] if "--only" in argv else None
    takes_n = int(argv[argv.index("--takes") + 1]) if "--takes" in argv else 1
    if not 1 <= takes_n <= len(SEEDS):
        raise SystemExit(f"--takes must be 1..{len(SEEDS)}")
    engine = argv[argv.index("--engine") + 1] if "--engine" in argv else "h3"
    # H3's noise seed lives at module scope in motion.py, so it is set rather
    # than passed. It is the ONLY lever left for a clip that comes out wrong:
    # the node takes no negative prompt, the prompt is already as short as it
    # can be, and every other setting was measured worse. A bad draw is redrawn.
    seeds = SEEDS[:takes_n]
    if "--seed" in argv:
        seeds = [int(argv[argv.index("--seed") + 1])]
    if engine not in ENGINES:
        raise SystemExit(f"--engine must be one of {', '.join(ENGINES)}")
    cfg = ENGINES[engine]

    presets = [p for p in read_presets() if not only or p["id"] == only]
    OUT.mkdir(parents=True, exist_ok=True)
    # One unit of work is (preset, seed). A take already on disk is a finished
    # render and is skipped, never redone: takes are not overwritten.
    todo = [(p, sd) for p in presets for sd in seeds
            if not (ledger.takes_dir(p["id"]) / ledger.take_name(engine, sd)).exists()]
    print(f"preset clips: {engine} · {len(presets)} preset(s) x {len(seeds)} seed(s), "
          f"{len(todo)} take(s) to render at {cfg['w']}x{cfg['h']}x{cfg['len']} @ {cfg['fps']}fps",
          flush=True)
    if not todo:
        return

    missing = [p["id"] for p, _ in todo if not (SWATCHES / f"{p['id']}.jpg").exists()]
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
    for n, (p, seed) in enumerate(todo, 1):
        if not guard.headroom_ok():
            guard.recycle_comfy("headroom")
        ref = stage_reference(SWATCHES / f"{p['id']}.jpg")
        motion.SEED = seed  # h3's noise seed lives at module scope
        if engine == "h3":
            # "Animate the image" and nothing more. The authored motion line was
            # measured WORSE on every hosted and local engine tried: a long
            # instruction is mostly a list of things not to do, and a model that
            # cannot ground "the circle with arrow" reads the rest as a
            # description of stillness. See the README.
            wf = h3_workflow("Animate the image", ref, cfg, prefix=f"preset-{p['id']}")
        else:
            wf = i2v_workflow(p["motion"], ref, seed, prefix=f"preset-{p['id']}")
        t0 = time.time()
        try:
            vid = generate_video(wf)
        except Exception as e:  # noqa: BLE001
            print(f"  [{n}/{len(todo)}] {p['id']}@{seed} FAILED: {str(e)[:100]}", flush=True)
            failed.append(f"{p['id']}@{seed}")
            if not guard.recycle_comfy("after failure"):
                break
            continue
        name = ledger.take_name(engine, seed, Path(vid).suffix)
        tdir = ledger.takes_dir(p["id"])
        tdir.mkdir(parents=True, exist_ok=True)
        dest = tdir / name
        shutil.copy2(vid, dest)
        row = {"file": name, "id": p["id"], "name": p["name"],
               "route": engine if engine == "h3" else "wan",
               "engine": "minimax-h3-fl2va" if engine == "h3" else "wan2.2-ti2v-5B/i2v",
               "size": [cfg["w"], cfg["h"], cfg["len"]], "fps": cfg["fps"],
               "steps": cfg["steps"], "trim": 0 if engine == "h3" else 0.35,
               "seed": seed,
               "prompt": "Animate the image" if engine == "h3" else p["motion"]}
        if cfg["retime"]:
            row["retime"] = cfg["retime"]
        # Grade ONCE, here, and keep the verdict: the number used to be printed
        # by clip_check.py and never stored. Needs numpy/PIL/ffmpeg, which this
        # renderer's environment already has; a failure to grade leaves the take
        # ungraded (adoption then demands a waiver) rather than losing the render.
        try:
            import clip_check  # noqa: E402
            r = clip_check.inspect(dest, SWATCHES / f"{p['id']}.jpg")
            row["check"] = {k: r[k] for k in ("ok", "reasons", "energy", "concentration",
                                              "retention", "palette", "sharpness")}
            row["check"]["checker"] = clip_check.CHECKER_VERSION
        except Exception as e:  # noqa: BLE001
            print(f"      could not grade {name}: {str(e)[:100]}", flush=True)
        ledger.add_take(p["id"], row)
        verdict = "ungraded" if "check" not in row else ("ok" if row["check"]["ok"] else "FAIL")
        print(f"  [{n}/{len(todo)}] {p['id']}@{seed} -> {time.time() - t0:.0f}s · {verdict}", flush=True)

    done = sum(1 for p in presets if ledger.load(p["id"])["takes"])
    print(f"preset clips: {done}/{len(presets)} preset(s) have takes in {OUT}", flush=True)
    print("adopt one per preset: python pipeline/video/ledger.py adopt <id> <take-file> "
          '[--waiver "reason"]', flush=True)
    if failed:
        raise SystemExit(f"failed: {', '.join(failed)}")


if __name__ == "__main__":
    main()
