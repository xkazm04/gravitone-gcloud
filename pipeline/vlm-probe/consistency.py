"""Three shots, one character, one location -- does anything hold them together?

    python consistency.py --lane baseline
    python consistency.py --lane reference
    python consistency.py --lane reference --refs 3

The bar, from CONSISTENCY-SPIKE.md: a wide, a medium and a close of one
character in one place that a viewer accepts as the same scene. Three, because
two can match by luck and twenty is not needed to learn whether the technique
holds.

The lanes run cheapest-first and each has to beat the one before it:

  baseline    Fixed seed, one character clause and one location clause reused
              **verbatim**, varying only the camera and the action. Costs
              nothing, is expected to be insufficient, and is the only thing
              that makes a later improvement claimable.

  reference   The same three prompts, plus a hero still of the character fed to
              every shot through Flux 2's own reference conditioning
              (`ReferenceLatent`). This is the approach that should scale to a
              trailer, because it does not need shots to be adjacent -- shot 18
              references the same hero as shot 7.

              The brief expected this lane to need MiniMax H3 Ref2VA and a ~20
              GB download. It does not: `ReferenceLatent` is already installed
              and Flux 2 dev accepts chained references, so approach 3 for
              stills costs nothing but GPU minutes. The download is only needed
              to carry a reference into *motion*, which is the next question,
              not this one.

Scoring is not here. `identity.py` owns the ruler, it was calibrated against
real film before this file generated anything, and it is deliberately a
separate program so that a disappointing number cannot quietly become a
different measurement.

Ops: Flux 2 is the only engine this stage loads, so there is no alternation
with H3 to sequence -- but the footprint still climbs across a batch, so
headroom is checked between shots and the engine is recycled when it drops.
"""

import argparse
import json
import shutil
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import guard  # noqa: E402

HERE = Path(__file__).parent
SHOTS = HERE / "shots"
COMFY = "http://127.0.0.1:8188"
COMFY_DIR = Path(r"C:\Users\kazda\ComfyUI")
COMFY_OUT = COMFY_DIR / "output"
COMFY_IN = COMFY_DIR / "input"

SEED = 770425

# One clause, reused byte-for-byte in every shot of every lane. If it is ever
# paraphrased between shots the lane stops measuring what it claims to.
CHARACTER = (
    "a woman in her early thirties with close-cropped platinum-blonde hair, a thin pale "
    "scar running from her left eyebrow down across her cheekbone, deep-set grey eyes, "
    "a scuffed charcoal flight jacket with a burnt-orange collar worn over a grey undershirt"
)

LOCATION = (
    "a derelict cargo hangar with corrugated steel walls streaked in rust, one hard shaft of "
    "daylight falling through a torn hole in the roof, dust suspended in the beam, stacked "
    "shipping crates receding into shadow"
)

# Camera and action are the only things allowed to vary -- and they must vary
# by more than focal length. The first run of this spike used three eye-level
# framings and got three *zoom levels of one setup*: same background layout,
# same light shaft, same body position, because a fixed seed locks composition
# hard. Those three matched easily and the match meant almost nothing. A
# trailer cuts between camera *positions*, so each setup below moves the camera
# to somewhere the others cannot see from.
SHOTS_SPEC = [
    ("01-wide", "Extreme wide shot from the far end of the hangar, the figure small and "
                "off-centre in the lower third of the frame, dwarfed by the roof structure, "
                "seen from behind a foreground crate. Low camera near the floor. Deep focus."),
    ("02-medium", "Medium shot from her right side, profile to three-quarter, cut at the waist, "
                  "the rusted wall close behind her and the light shaft out of frame. "
                  "Camera slightly above eye level looking down."),
    ("03-close", "Tight close-up from her left, low angle looking up at her face against the "
                 "torn roof and open sky, the shaft of light blown out behind her head. "
                 "Shallow focus."),
]

# Kept from the first run, where the three setups differed only in focal length.
# Reported separately: it is the easy version of the same question.
ZOOM_SPEC = [
    ("01-wide", "Wide shot. She stands small against the height of the hangar, full body visible, "
                "the shaft of light behind her. Camera at eye level, deep focus."),
    ("02-medium", "Medium shot, cut at the waist. She turns her head toward the light, "
                  "one hand resting on a crate. Camera at eye level."),
    ("03-close", "Close-up of her face filling the frame, three-quarter angle, "
                 "the shaft of light raking one cheek. Shallow focus."),
]

HERO = ("Neutral three-quarter portrait, plain mid-grey studio background, flat even light, "
        "sharp focus, the full head and shoulders in frame, looking slightly off camera.")

NEGATIVE_STYLE = ("Photographic, 35mm cinema still, natural skin texture, no text, no watermark, "
                  "no border.")


def prompt_for(shot_clause):
    """Character, then location, then camera. Same order every time, on purpose."""
    return f"{shot_clause} The subject is {CHARACTER}. The setting is {LOCATION}. {NEGATIVE_STYLE}"


def flux_workflow(prompt, seed, refs=(), width=1280, height=720, steps=20, prefix="shot"):
    """Flux 2 text-to-image, optionally conditioned on reference stills.

    Each reference is VAE-encoded and chained through its own `ReferenceLatent`,
    which is how Flux 2 takes more than one -- the node's own description says
    "chain multiple to set multiple reference images". The chain sits between
    the text encode and `FluxGuidance`, matching the order the Kontext template
    uses; putting guidance first silently drops the references.
    """
    w = {
        "1": {"class_type": "UNETLoader",
              "inputs": {"unet_name": "flux2_dev_fp8mixed.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader",
              "inputs": {"clip_name": "mistral_3_small_flux2_fp8.safetensors",
                         "type": "flux2", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "flux2-vae.safetensors"}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": prompt}},
        "6": {"class_type": "EmptyFlux2LatentImage",
              "inputs": {"width": width, "height": height, "batch_size": 1}},
        "7": {"class_type": "Flux2Scheduler",
              "inputs": {"steps": steps, "width": width, "height": height}},
        "8": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}},
        "9": {"class_type": "RandomNoise", "inputs": {"noise_seed": seed}},
    }
    cond = ["4", 0]
    for i, name in enumerate(refs):
        load, enc, ref = f"20{i}", f"21{i}", f"22{i}"
        w[load] = {"class_type": "LoadImage", "inputs": {"image": name}}
        w[enc] = {"class_type": "VAEEncode", "inputs": {"pixels": [load, 0], "vae": ["3", 0]}}
        w[ref] = {"class_type": "ReferenceLatent",
                  "inputs": {"conditioning": cond, "latent": [enc, 0]}}
        cond = [ref, 0]
    w["5"] = {"class_type": "FluxGuidance", "inputs": {"conditioning": cond, "guidance": 4.0}}
    w["10"] = {"class_type": "BasicGuider", "inputs": {"model": ["1", 0], "conditioning": ["5", 0]}}
    w["11"] = {"class_type": "SamplerCustomAdvanced",
               "inputs": {"noise": ["9", 0], "guider": ["10", 0], "sampler": ["8", 0],
                          "sigmas": ["7", 0], "latent_image": ["6", 0]}}
    w["12"] = {"class_type": "VAEDecode", "inputs": {"samples": ["11", 0], "vae": ["3", 0]}}
    w["13"] = {"class_type": "SaveImage",
               "inputs": {"images": ["12", 0], "filename_prefix": prefix}}
    return w


def generate(workflow, timeout=900):
    """Queue a workflow and return the saved image path.

    Every failure in this stack presents as silence -- a stalled queue, a closed
    socket, a vanished process -- so a timeout here means "go read ComfyUI's
    stderr", not "retry and hope".
    """
    body = json.dumps({"prompt": workflow}).encode()
    req = urllib.request.Request(f"{COMFY}/prompt", data=body,
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=60) as r:
        pid = json.loads(r.read())["prompt_id"]
    deadline = time.time() + timeout
    while time.time() < deadline:
        time.sleep(4)
        try:
            with urllib.request.urlopen(f"{COMFY}/history/{pid}", timeout=30) as r:
                hist = json.loads(r.read())
        except Exception:
            continue
        if pid not in hist:
            continue
        for node in hist[pid].get("outputs", {}).values():
            for img in node.get("images", []):
                return COMFY_OUT / img.get("subfolder", "") / img["filename"]
        raise RuntimeError(f"finished with no image: {hist[pid].get('status')}")
    raise TimeoutError(f"comfyui did not finish {pid} in {timeout}s -- read its stderr")


def stage_reference(path):
    """Put a still where LoadImage can see it, and return the name it wants."""
    COMFY_IN.mkdir(parents=True, exist_ok=True)
    dest = COMFY_IN / f"ref_{Path(path).name}"
    shutil.copyfile(path, dest)
    return dest.name


def run_lane(lane, ref_count=1, steps=20, seed=SEED, zoom=False):
    out = SHOTS / (lane + ("-zoom" if zoom else ""))
    out.mkdir(parents=True, exist_ok=True)
    if not guard.start_comfy():
        raise RuntimeError("comfyui would not come up")

    refs = []
    if lane == "reference":
        hero_path = out / "00-hero.png"
        if not hero_path.exists():
            print("  hero still (the thing every shot will reference)")
            src = generate(flux_workflow(prompt_for(HERO), seed, prefix="hero", steps=steps))
            shutil.copyfile(src, hero_path)
            print(f"    -> {hero_path}")
        refs = [stage_reference(hero_path)] * max(1, ref_count)
        print(f"  referencing {len(refs)} copy/copies of the hero still")

    for name, clause in (ZOOM_SPEC if zoom else SHOTS_SPEC):
        dest = out / f"{name}.png"
        if dest.exists():
            print(f"  {name}: already generated, skipping")
            continue
        if not guard.headroom_ok():
            guard.recycle_comfy("headroom dropped mid-lane")
        t = time.time()
        src = generate(flux_workflow(prompt_for(clause), seed, refs=refs,
                                     steps=steps, prefix=f"{lane}-{name}"))
        shutil.copyfile(src, dest)
        print(f"  {name}: {time.time() - t:.0f}s -> {dest}")

    (out / "lane.json").write_text(json.dumps({
        "lane": lane, "seed": seed, "steps": steps, "references": refs,
        "character": CHARACTER, "location": LOCATION,
        "shots": {n: prompt_for(c) for n, c in (ZOOM_SPEC if zoom else SHOTS_SPEC)},
    }, indent=2), encoding="utf-8")
    print(f"\n  lane written to {out}\n  now score it:  python identity.py --set shots/{lane}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lane", required=True, choices=["baseline", "reference"])
    ap.add_argument("--refs", type=int, default=1, help="how many copies of the hero to chain")
    ap.add_argument("--steps", type=int, default=20)
    ap.add_argument("--seed", type=int, default=SEED)
    ap.add_argument("--zoom", action="store_true", help="the easy setups: focal length only")
    args = ap.parse_args()
    run_lane(args.lane, ref_count=args.refs, steps=args.steps, seed=args.seed, zoom=args.zoom)


if __name__ == "__main__":
    main()
