"""Animate a still by MOVING A PIECE OF IT, not by asking a video model.

    python pipeline/video/compose_clip.py public/presets/blueprint.jpg
    python pipeline/video/compose_clip.py public/presets/blueprint.jpg --keep

WHY THIS EXISTS. pipeline/video/README.md carries the standing finding: ask Wan
2.2 TI2V-5B to leave flat linework alone and it moves the camera; ask it to move
an element and it deforms or deletes the drawing. Six renders, no window between
the two failures. A video model trained on filmed footage does not know how to
deform a technical drawing, and no prompt fixes that.

So this route never generates video. It generates ONE new still -- the picture
with the moving element erased -- and then does the motion itself, in numpy:

    1 READ     what is in the picture, and which element should move where
               (motion_author.py: the same two passes, plus a grounding pass
               that returns pixel boxes)
    2 PLATE    erase that element with Flux 2 inpainting, and composite the
               result back into the ORIGINAL so every pixel outside the erased
               box is bit-identical. The VAE round-trip alters the whole frame
               by ~2/255 even where the noise mask is zero; left in, that is a
               background that shimmers.
    3 SPRITE   the element is what the plate removed: alpha from the difference
               between the original and the plate, colour from the original.
    4 FRAMES   composite the sprite over the plate at eased positions, then
               play it forward and back so the loop closes on itself.

The background is then held BY CONSTRUCTION -- it is the same array in every
frame -- and the element stays exactly as sharp as it was drawn, because it is
the same pixels translated. Neither property can be asked of a video model.

WHAT THIS CANNOT DO. One element, one straight path. A motion that needs a curve,
a rotation, a scale, or two elements at once is not expressible here yet, and
faking it by lerping between two GENERATED stills does not work: Flux at full
reference strength redraws the whole scene (measured -- the bars, the corner
schematic and the curve all moved), so an interpolation between them is soft
everywhere, which is the defect this route exists to remove.
"""
import argparse
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(ROOT / "pipeline" / "vlm-probe"))
sys.path.insert(0, str(HERE))
import guard  # noqa: E402
from consistency import generate, stage_reference  # noqa: E402
from probe import post, extract_json  # noqa: E402
import motion_author  # noqa: E402

WORK = ROOT / "pipeline" / "runs" / "preset-clips"
FPS = 20
SECONDS = 5.0

# The mask is grown past the element's own box before erasing. A tight mask
# leaves a rim of the old ink that the sprite then carries with it as a halo.
MASK_GROW = 0.25
MASK_FEATHER = 8

# How opaque a pixel has to be, in difference between original and plate, to
# count as part of the element. 255 is a full-strength stroke; flat art has hard
# edges, so this only has to clear the VAE's own noise floor.
ALPHA_FLOOR = 12.0
ALPHA_FULL = 45.0

PLATE_PROMPT_TAIL = (" This area is empty: only the background continues through it, "
                     "with nothing drawn on it -- no shapes, no lines, no marks.")

GROUND_PROMPT = """Look at this picture. One element in it is going to move.

THE ELEMENT: {moving}
THE MOVE: {path}

Give two bounding boxes in NORMALISED coordinates, where 0,0 is the top-left of
the picture and 1,1 is the bottom-right.

`from` is where the element is NOW. Make it tight around the element, with only
a small margin.

`to` is where it should END UP after the move described above. It must be the
SAME WIDTH AND HEIGHT as `from` -- the element moves, it does not grow or shrink
-- and it must lie fully inside the picture. Move it far enough to be obvious,
roughly a tenth to a third of the frame, and no further."""

GROUND_SCHEMA = {
    "type": "object",
    "properties": {
        "from": {"type": "array", "minItems": 4, "maxItems": 4, "items": {"type": "number"}},
        "to": {"type": "array", "minItems": 4, "maxItems": 4, "items": {"type": "number"}},
    },
    "required": ["from", "to"],
}


def ground(image, moving, path, model=motion_author.MODEL):
    """Pixel boxes for where the element is and where it is going."""
    import base64
    b64 = base64.b64encode(Path(image).read_bytes()).decode("ascii")
    prompt = GROUND_PROMPT.format(moving=moving, path=path)
    r = post(f"{motion_author.OLLAMA}/api/chat", {
        "model": model,
        "messages": [{"role": "user", "content": prompt, "images": [b64]}],
        "format": GROUND_SCHEMA, "stream": False,
        "options": {"temperature": 0, "num_ctx": 8192}, "think": False,
    })
    g = extract_json(r["message"]["content"])
    a, b = g["from"], g["to"]
    # The model is asked for equal-sized boxes and does not always give them.
    # `to` is re-derived from its own centre so the sprite is never rescaled --
    # a rescale is the one thing this route promises not to do.
    w, h = a[2] - a[0], a[3] - a[1]
    cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
    return tuple(a), (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)


def inpaint_workflow(image_name, mask_name, prompt, seed, width, height, steps, prefix):
    """consistency.flux_workflow's chain with the empty latent swapped for the
    real image plus a noise mask, which is what turns it into an eraser."""
    return {
        "1": {"class_type": "UNETLoader",
              "inputs": {"unet_name": "flux2_dev_fp8mixed.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader",
              "inputs": {"clip_name": "mistral_3_small_flux2_fp8.safetensors",
                         "type": "flux2", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "flux2-vae.safetensors"}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": prompt}},
        "10": {"class_type": "LoadImage", "inputs": {"image": image_name}},
        "11": {"class_type": "VAEEncode", "inputs": {"pixels": ["10", 0], "vae": ["3", 0]}},
        "12": {"class_type": "LoadImage", "inputs": {"image": mask_name}},
        "13": {"class_type": "ImageToMask", "inputs": {"image": ["12", 0], "channel": "red"}},
        "14": {"class_type": "SetLatentNoiseMask", "inputs": {"samples": ["11", 0], "mask": ["13", 0]}},
        "7": {"class_type": "Flux2Scheduler", "inputs": {"steps": steps, "width": width, "height": height}},
        "8": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}},
        "9": {"class_type": "RandomNoise", "inputs": {"noise_seed": seed}},
        "15": {"class_type": "FluxGuidance", "inputs": {"conditioning": ["4", 0], "guidance": 3.5}},
        "16": {"class_type": "BasicGuider", "inputs": {"model": ["1", 0], "conditioning": ["15", 0]}},
        "17": {"class_type": "SamplerCustomAdvanced",
               "inputs": {"noise": ["9", 0], "guider": ["16", 0], "sampler": ["8", 0],
                          "sigmas": ["7", 0], "latent_image": ["14", 0]}},
        "18": {"class_type": "VAEDecode", "inputs": {"samples": ["17", 0], "vae": ["3", 0]}},
        "19": {"class_type": "SaveImage", "inputs": {"images": ["18", 0], "filename_prefix": prefix}},
    }


def grow(box, size, frac=MASK_GROW):
    x0, y0, x1, y1 = box
    dx, dy = (x1 - x0) * frac, (y1 - y0) * frac
    return (max(0.0, x0 - dx), max(0.0, y0 - dy), min(1.0, x1 + dx), min(1.0, y1 + dy))


def to_px(box, w, h):
    return (int(box[0] * w), int(box[1] * h), int(box[2] * w), int(box[3] * h))


def make_plate(swatch, box, scene, work, seed=991, steps=20):
    """The picture with the element gone, bit-identical everywhere else."""
    im = Image.open(swatch).convert("RGB")
    w, h = im.size
    mbox = to_px(grow(box, (w, h)), w, h)
    mask = Image.new("RGB", (w, h), (0, 0, 0))
    ImageDraw.Draw(mask).rectangle(list(mbox), fill=(255, 255, 255))
    mask = mask.filter(ImageFilter.GaussianBlur(MASK_FEATHER))
    mpath = work / "mask.png"
    mask.save(mpath)

    if not guard.start_comfy():
        raise SystemExit("ComfyUI is not running and could not be started")
    wf = inpaint_workflow(stage_reference(swatch), stage_reference(mpath),
                          scene + PLATE_PROMPT_TAIL, seed, w, h, steps, "compose-plate")
    raw = Image.open(generate(wf, timeout=1800)).convert("RGB").resize((w, h))

    # THE COMPOSITE BACK. Outside the erased box the plate must be the original,
    # to the byte: a VAE round-trip moves every pixel by ~2/255 even where the
    # noise mask is zero, and a background that shimmers is the defect this whole
    # route exists to avoid.
    plate = im.copy()
    keep = Image.new("L", (w, h), 0)
    ImageDraw.Draw(keep).rectangle(list(mbox), fill=255)
    plate.paste(raw, (0, 0), keep.filter(ImageFilter.GaussianBlur(MASK_FEATHER // 2)))
    plate.save(work / "plate.png")
    return plate, mbox


def make_sprite(original, plate, mbox):
    """The element, as what the plate removed. RGBA, cropped to the erased box."""
    o = np.asarray(original, dtype=np.float64)
    p = np.asarray(plate, dtype=np.float64)
    d = np.abs(o - p).max(axis=2)
    alpha = np.clip((d - ALPHA_FLOOR) / (ALPHA_FULL - ALPHA_FLOOR), 0.0, 1.0)
    x0, y0, x1, y1 = mbox
    rgba = np.dstack([o, alpha * 255.0]).astype(np.uint8)[y0:y1, x0:x1]
    return Image.fromarray(rgba, "RGBA")


def ease(t):
    """Ease in and out. A linear slide starts and stops with a jolt."""
    return t * t * (3.0 - 2.0 * t)


def compose(plate, sprite, mbox, dest_box_px, frames, out_dir):
    """Half the loop: the element travelling from where it is to where it goes."""
    out_dir.mkdir(parents=True, exist_ok=True)
    x0, y0 = mbox[0], mbox[1]
    dx, dy = dest_box_px[0] - x0, dest_box_px[1] - y0
    paths = []
    for i in range(frames):
        t = ease(i / max(1, frames - 1))
        f = plate.copy()
        f.paste(sprite, (int(round(x0 + dx * t)), int(round(y0 + dy * t))), sprite)
        p = out_dir / f"{i:04d}.png"
        f.save(p)
        paths.append(p)
    return paths


def encode(frame_dir, dest, fps=FPS):
    """Forward then back, so the loop closes on itself with no snap."""
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-framerate", str(fps), "-i", str(frame_dir / "%04d.png"),
        "-filter_complex", "[0:v]split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1[o]",
        "-map", "[o]", "-c:v", "libvpx-vp9", "-crf", "20", "-b:v", "0",
        "-pix_fmt", "yuv420p", str(dest),
    ], check=True)
    return dest


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("--out", default=None)
    ap.add_argument("--keep", action="store_true", help="leave the PNG frames on disk")
    a = ap.parse_args()

    swatch = Path(a.image)
    slug = swatch.stem
    work = WORK / f"{slug}-compose"
    work.mkdir(parents=True, exist_ok=True)
    dest = Path(a.out) if a.out else WORK / f"{slug}.webm"

    print(f"compose {slug}")
    rec_path = work / "author.json"
    if rec_path.exists():
        rec = json.loads(rec_path.read_text(encoding="utf-8"))
        print("  1 read     · cached")
    else:
        # The annotator and ComfyUI cannot co-reside; every question is asked
        # before any pixel is rendered.
        guard.require(ram_gb=0, free=["comfy"], verbose=False)
        t0 = time.time()
        rec = motion_author.author(swatch)
        k = rec["keyframe"]
        rec["boxes"] = dict(zip(("from", "to"), ground(swatch, k["moving"], k["path"])))
        rec_path.write_text(json.dumps(rec, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"  1 read     · {time.time()-t0:.0f}s · {k['moving']} — {k['path']}")

    box = tuple(rec["boxes"]["from"])
    dest_box = tuple(rec["boxes"]["to"])

    original = Image.open(swatch).convert("RGB")
    w, h = original.size
    plate_path = work / "plate.png"
    if plate_path.exists():
        plate = Image.open(plate_path).convert("RGB")
        mbox = to_px(grow(box, (w, h)), w, h)
        print("  2 plate    · cached")
    else:
        guard.require(ram_gb=0, free=["ollama"], verbose=False)
        t0 = time.time()
        plate, mbox = make_plate(swatch, box, rec["read"]["scene"], work)
        print(f"  2 plate    · {time.time()-t0:.0f}s")

    sprite = make_sprite(original, plate, mbox)
    sprite.save(work / "sprite.png")
    ink = float(np.asarray(sprite)[..., 3].mean())
    print(f"  3 sprite   · {sprite.width}x{sprite.height}, mean alpha {ink:.1f}")

    frames = int(round(FPS * SECONDS / 2))  # half the loop; the reverse is the rest
    dbox = to_px(grow(dest_box, (w, h)), w, h)
    fdir = work / "frames"
    if fdir.exists():
        shutil.rmtree(fdir)
    compose(plate, sprite, mbox, dbox, frames, fdir)
    encode(fdir, dest)
    if not a.keep:
        shutil.rmtree(fdir)
    print(f"  4 frames   · {frames} forward + {frames} back @ {FPS}fps")
    print(f"  -> {dest}")


if __name__ == "__main__":
    main()
