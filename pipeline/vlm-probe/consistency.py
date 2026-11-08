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
import shutil
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import craft_spec  # noqa: E402
import guard  # noqa: E402
import lane_record  # noqa: E402
import comfy as comfy_client  # noqa: E402  (pipeline/gpu, put on sys.path by guard)
import lease as gpu_lease  # noqa: E402

HERE = Path(__file__).parent
SHOTS = HERE / "shots"
COMFY = guard.COMFY
COMFY_DIR = Path(guard.COMFY_DIR)
COMFY_OUT = COMFY_DIR / "output"
COMFY_IN = COMFY_DIR / "input"

SEED = lane_record.SEED
# How long a lane waits for the card before giving up with LeaseTimeout (s).
LEASE_WAIT_S = 3600

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
#
# Each entry is (name, clause, labels). The labels (craft_spec.LABELS) name the
# schema value each phrase of the clause dictates; the clause is never rebuilt
# from them, because a reworded clause moves the pixels under the fixed seed.
SHOTS_SPEC = [
    ("01-wide", "Extreme wide shot from the far end of the hangar, the figure small and "
                "off-centre in the lower third of the frame, dwarfed by the roof structure, "
                "seen from behind a foreground crate. Low camera near the floor. Deep focus.",
     craft_spec.LABELS["shots"]["01-wide"]),
    ("02-medium", "Medium shot from her right side, profile to three-quarter, cut at the waist, "
                  "the rusted wall close behind her and the light shaft out of frame. "
                  "Camera slightly above eye level looking down.",
     craft_spec.LABELS["shots"]["02-medium"]),
    ("03-close", "Tight close-up from her left, low angle looking up at her face against the "
                 "torn roof and open sky, the shaft of light blown out behind her head. "
                 "Shallow focus.",
     craft_spec.LABELS["shots"]["03-close"]),
]

# Kept from the first run, where the three setups differed only in focal length.
# Reported separately: it is the easy version of the same question.
ZOOM_SPEC = [
    ("01-wide", "Wide shot. She stands small against the height of the hangar, full body visible, "
                "the shaft of light behind her. Camera at eye level, deep focus.",
     craft_spec.LABELS["zoom"]["01-wide"]),
    ("02-medium", "Medium shot, cut at the waist. She turns her head toward the light, "
                  "one hand resting on a crate. Camera at eye level.",
     craft_spec.LABELS["zoom"]["02-medium"]),
    ("03-close", "Close-up of her face filling the frame, three-quarter angle, "
                 "the shaft of light raking one cheek. Shallow focus.",
     craft_spec.LABELS["zoom"]["03-close"]),
]

HERO = ("Neutral three-quarter portrait, plain mid-grey studio background, flat even light, "
        "sharp focus, the full head and shoulders in frame, looking slightly off camera.")

NEGATIVE_STYLE = ("Photographic, 35mm cinema still, natural skin texture, no text, no watermark, "
                  "no border.")


def prompt_for(shot_clause):
    """Character, then location, then camera. Same order every time, on purpose."""
    return f"{shot_clause} The subject is {CHARACTER}. The setting is {LOCATION}. {NEGATIVE_STYLE}"


def flux_workflow(*_args, **_kwargs):
    """Flux 2 was this module's still engine; removed 2026-11-08, so the stills lane refuses here."""
    guard.refuse_flux2("the consistency stills lane")


def generate(workflow, timeout=900, kinds=("images",), exts=None):
    """Queue a workflow and return the saved image path (or, with kinds/exts,
    the first saved output of those kinds whose name ends in one of exts).

    The loop is pipeline/gpu/comfy.py's, shared by every tenant; this is the
    seam that points it at THIS module's ComfyUI host, output tree and process
    probe, each read at call time. Every failure in this stack presents as
    silence -- a stalled queue, a closed socket, a vanished process -- so a
    timeout means "go read ComfyUI's stderr", not "retry and hope", and a
    vanished process raises comfy.ComfyVanished at the first failed poll.
    """
    return comfy_client.generate(workflow, timeout=timeout, kinds=kinds, exts=exts,
                                 host=guard.COMFY, out_dir=COMFY_OUT,
                                 alive=lambda: guard.comfy_process_ids())


def face_reference(hero_path, out_path, margin=1.9, size=512):
    """Crop the hero to the head alone, on a neutral field.

    The full hero still carries a background, a body pose and a framing, and
    the model copies all three. A head on grey carries identity and nothing
    else worth copying, which is the whole point of a reference.
    """
    import identity
    from PIL import Image
    mt, _ = identity._load("face")
    im = Image.open(hero_path).convert("RGB")
    boxes, _ = mt.detect(im)
    if boxes is None:
        raise RuntimeError(f"no face in the hero still {hero_path} -- cannot build a face reference")
    x1, y1, x2, y2 = boxes[0]
    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
    half = max(x2 - x1, y2 - y1) * margin / 2
    left, top = int(cx - half), int(cy - half)
    side = int(cx + half) - left
    # Crop only what the frame holds: im.crop past an edge fills BLACK, and a
    # resized crop pasted over the canvas would leave no neutral field at all.
    cl, ct = max(left, 0), max(top, 0)
    cr, cb = min(left + side, im.width), min(top + side, im.height)
    square = Image.new("RGB", (side, side), (118, 118, 118))
    square.paste(im.crop((cl, ct, cr, cb)), (cl - left, ct - top))
    canvas = square.resize((size, size))
    canvas.save(out_path)
    return out_path


def stage_reference(path):
    """Put a still where LoadImage can see it, and return the name it wants."""
    COMFY_IN.mkdir(parents=True, exist_ok=True)
    dest = COMFY_IN / f"ref_{Path(path).name}"
    shutil.copyfile(path, dest)
    return dest.name


def run_lane(lane, **overrides):
    """`overrides` are LANE_PARAMS["stills"] names (ref_count, steps, seed, zoom,
    ref_crop, late, tag); everything else comes from the table's defaults."""
    if lane != "reference":
        # Only a reference lane chains copies of the hero; a baseline lane
        # resumed with a different --refs renders the same pixels.
        overrides.pop("ref_count", None)
    params = lane_record.fill("stills", lane=lane, character=CHARACTER, location=LOCATION,
                              **overrides)
    if lane == "reference":
        params["ref_count"] = max(1, params.get("ref_count", 1))
    steps, seed, late = params["steps"], params["seed"], params["late"]
    width, height = params["width"], params["height"]
    out = SHOTS / lane_record.lane_dir("stills", lane=lane, zoom=params["zoom"], tag=params["tag"])
    out.mkdir(parents=True, exist_ok=True)
    lane_json_path = out / "lane.json"
    if lane_json_path.exists():
        lane_record.check_resume(lane_json_path, params)
    else:
        lane_record.record_stills(out_dir=out, refs=[], **params)

    # The card is ours for the lane: one holder, written on disk, so a recycle
    # below is the holder's own and a foreign tenant is named, not guessed at.
    # Waits (FIFO) behind another tenant rather than racing it.
    # ttl covers the longest gap between polls (an engine restart is minutes);
    # a crashed lane is reclaimed at once by its dead pid, not by the ttl.
    with gpu_lease.acquire(f"consistency/{lane}", "comfy", 20, wait=LEASE_WAIT_S, ttl_s=900,
                           job_prefix=",".join(guard.MY_PREFIXES)):
        if not guard.start_comfy():
            raise RuntimeError("comfyui would not come up")

        refs = []
        if lane == "reference":
            hero_path = out / "00-hero.png"
            if not hero_path.exists() and (SHOTS / "reference" / "00-hero.png").exists():
                # Reuse the hero across reference lanes: the variable under test is
                # how the reference is applied, not which face it happens to show.
                shutil.copyfile(SHOTS / "reference" / "00-hero.png", hero_path)
                print("  hero still reused from the first reference lane")
            if not hero_path.exists():
                print("  hero still (the thing every shot will reference)")
                src = generate(flux_workflow(prompt_for(HERO), seed, prefix="hero", steps=steps,
                                             width=width, height=height))
                shutil.copyfile(src, hero_path)
                print(f"    -> {hero_path}")
            if params["ref_crop"] == "face":
                hero_path = face_reference(hero_path, out / "00b-hero-face.png")
                print(f"    face-only reference -> {hero_path}")
            refs = [stage_reference(hero_path)] * params["ref_count"]
            print(f"  referencing {len(refs)} copy/copies of the hero still")

        spec_set = "zoom" if params["zoom"] else "shots"
        spec = ZOOM_SPEC if params["zoom"] else SHOTS_SPEC
        for name, clause, labels in spec:
            dest = out / f"{name}.png"
            prompt = prompt_for(clause)
            if dest.exists():
                print(f"  {name}: already generated, skipping")
                continue
            if not guard.headroom_ok():
                guard.recycle_comfy("headroom dropped mid-lane")
            t = time.time()
            src = generate(flux_workflow(prompt, seed, refs=refs, width=width, height=height,
                                         steps=steps, prefix=f"{lane}-{name}", late=late))
            shutil.copyfile(src, dest)
            lane_record.write_shot(out, name, dest, prompt,
                                   steps=steps, seed=seed, late=late, prefix=f"{lane}-{name}",
                                   spec_digest=craft_spec.digest(labels))
            # Beside the shot, named for the lane, so probe.py's "<lane>--<shot>"
            # row finds it and three lanes' 01-wide never share one truth.
            craft_spec.write_sidecar(out, name, spec_set, seed=seed)
            print(f"  {name}: {time.time() - t:.0f}s -> {dest}")

        rec = lane_record.read(out) if lane_json_path.exists() else {}
        lane_record.record_stills(out_dir=out, refs=refs, shots=rec.get("shots", {}), **params)
        print(f"\n  lane written to {out}\n  now score it:  python identity.py --set shots/{lane}")


def build_arg_parser():
    # The lane flags are LANE_PARAMS["stills"]; declaring one here instead is
    # how a knob ends up recorded but never replayed.
    return lane_record.add_lane_args(argparse.ArgumentParser(), "stills")


def main():
    run_lane(**vars(build_arg_parser().parse_args()))


if __name__ == "__main__":
    main()
