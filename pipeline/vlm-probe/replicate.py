"""The self-proof lane: prove the vocabulary carries meaning by rebuilding from it.

    python replicate.py --run arcane-prompt-channel --frames arcane-fights-004.jpg
    python replicate.py --run arcane-prompt-channel --limit 6

Reading a frame and emitting labels proves nothing on its own. A model can
produce a fluent annotation that means nothing, and with no ground truth
nobody notices. The honest test is whether the annotation is *sufficient* --
whether a generator handed only those words rebuilds a frame with the same
craft properties.

So: annotation -> generation prompt -> new image -> annotate the new image ->
compare the two annotations field by field. Agreement is the score. If the
replica comes back with the same lighting key, the same angle, the same lens
register and the same layer structure, the vocabulary carried the shot. Where
it does not, either the schema is missing a field the look depends on, or the
word we chose does not mean to a generator what it means to us. Both are
findings, and neither is reachable by reading annotations.

**Craft, not content.** Only the craft fields cross over, plus the generic
subject descriptors the annotation schema already produces -- it forbids naming
titles, characters or franchises, so what arrives is "two figures in dark
clothing", never an identity. A 1:1 content copy is neither the goal nor
wanted; a replica that matches on light, camera, lens and layers while showing
entirely different people is a *pass*, because craft is what was under test.

Both engines want the same 24 GB card, so every stage is preflighted through
guard.py and the other engine is evicted first.
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
from probe import run_ollama  # noqa: E402
from schema import ORDINAL  # noqa: E402

HERE = Path(__file__).parent
FRAMES_DIR = HERE / "frames"
REPLICA_DIR = HERE / "replicas"
OUT_ROOT = HERE.parent.parent / "vlm-probe-out"
COMFY = "http://127.0.0.1:8188"
COMFY_OUT = Path(r"C:\Users\kazda\ComfyUI\output")

ANNOTATOR = "qwen3.8:27b"

# The fields that must survive the round trip. Deliberately excludes
# `subjects`/`surrounding_objects` scoring -- those are content, and content is
# not what this lane measures.
CRAFT_FIELDS = [
    "shot_size", "camera_angle", "lens_impression", "depth_of_field",
    "composition", "exposure", "lighting_key", "lighting_direction",
    "lighting_quality", "contrast", "texture",
]


def compose_prompt(a):
    """Turn an annotation back into a generation brief.

    Written as effect language rather than jargon: a generator responds to
    "shadows falling to true black" far more reliably than to "low-key", which
    is the same lesson the registry's cinematic-language subject records about
    numeric optics. The craft terms are translated; they are not quoted.
    """
    key = a.get("lighting_key")
    light_clause = ("shadows filled in and soft, no true blacks anywhere, gentle falloff"
                    if key == "high-key" else
                    "shadows left unfilled and falling to true black, only the lit areas readable"
                    if key == "low-key" else "even, unremarkable light")
    contrast_clause = {
        "extreme": "extreme separation between the brightest and darkest areas",
        "high": "strong separation between highlight and shadow",
        "moderate": "moderate tonal separation",
        "low": "compressed, flat tonal range",
    }.get(a.get("contrast"), "")
    dof = {"shallow": "shallow focus, background dissolving into blur",
           "moderate": "moderate depth of field",
           "deep": "deep focus, near and far both sharp"}.get(a.get("depth_of_field"), "")
    lens = {"ultra-wide": "sweeping ultra-wide perspective with stretched edges",
            "wide-angle": "wide perspective, foreground exaggerated against a deep background",
            "normal": "natural perspective, no distortion",
            "telephoto": "compressed perspective, background stacked close behind the subject",
            "macro": "extreme macro proximity",
            "indeterminate": ""}.get(a.get("lens_impression"), "")
    angle = {"eye-level": "camera at the subject's eye level",
             "low-angle": "camera low, looking up at the subject",
             "extreme-low-angle": "camera at ground level looking steeply up",
             "high-angle": "camera high, looking down at the subject",
             "extreme-high-angle": "camera far above, looking steeply down",
             "overhead": "camera directly overhead looking straight down",
             "dutch": "camera rolled off-axis, horizon tilted"}.get(a.get("camera_angle"), "")
    shot = {"extreme-wide": "extreme wide shot, the figure small in a vast space",
            "wide": "wide shot, full figures with much of the location visible",
            "full": "full shot, the figure head to toe filling most of the height",
            "medium-full": "medium-full shot, cut around the knees",
            "medium": "medium shot, cut at the waist",
            "medium-close": "medium close-up, chest and head",
            "close-up": "close-up of the face",
            "extreme-close-up": "extreme close-up, a single feature filling the frame",
            }.get(a.get("shot_size"), "")
    comp = {"centered": "subject centered in frame",
            "symmetrical": "symmetrical composition, balanced left and right",
            "rule-of-thirds": "subject placed on a third, off center",
            "diagonal": "strong diagonal composition",
            "frame-within-frame": "subject framed inside an opening in the foreground",
            "off-center-negative-space": "subject pushed to one edge against open negative space",
            }.get(a.get("composition"), "")
    direction = {"front": "keyed from the front", "side": "keyed hard from one side",
                 "back-rim": "backlit, a rim of light separating the subject from the dark",
                 "top": "lit from above", "under": "lit from below",
                 "mixed": "lit from several directions at once"}.get(a.get("lighting_direction"), "")
    quality = {"hard": "hard-edged shadows", "soft": "soft, diffused shadow edges",
               "mixed": "both hard and soft shadow edges"}.get(a.get("lighting_quality"), "")
    tex = {"film-grain": "fine film grain", "digital-clean": "clean digital rendering",
           "painterly": "painterly rendered surfaces, visible brushwork in the textures",
           "cel-animated": "flat cel-animated shading", "3d-rendered": "stylised 3D rendering",
           "glossy-cg": "glossy high-gloss CG surfaces"}.get(a.get("texture"), "")

    subjects = "; ".join(a.get("subjects") or [])[:220]
    objects = ", ".join(a.get("surrounding_objects") or [])[:180]

    parts = [
        f"{shot}. {angle}. {comp}.",
        f"Foreground: {a.get('foreground','')}. Midground: {a.get('midground','')}. "
        f"Background: {a.get('background','')}.",
        f"Subjects: {subjects}." if subjects else "",
        f"Surrounding detail: {objects}." if objects else "",
        f"Lighting: {light_clause}, {direction}, {quality}. {contrast_clause}.",
        f"Light sources in frame: {', '.join(a.get('light_sources') or []) or 'unspecified'}.",
        f"Palette: {a.get('palette','')}.",
        f"{lens}. {dof}.",
        f"Rendered with {tex}.",
    ]
    return " ".join(p for p in parts if p and p.strip(" ."))


def flux_workflow(prompt, seed, width=1280, height=720, steps=20):
    return {
        "1": {"class_type": "UNETLoader",
              "inputs": {"unet_name": "flux2_dev_fp8mixed.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader",
              "inputs": {"clip_name": "mistral_3_small_flux2_fp8.safetensors",
                         "type": "flux2", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "flux2-vae.safetensors"}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": prompt}},
        "5": {"class_type": "FluxGuidance", "inputs": {"conditioning": ["4", 0], "guidance": 4.0}},
        "6": {"class_type": "EmptyFlux2LatentImage",
              "inputs": {"width": width, "height": height, "batch_size": 1}},
        "7": {"class_type": "Flux2Scheduler",
              "inputs": {"steps": steps, "width": width, "height": height}},
        "8": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}},
        "9": {"class_type": "RandomNoise", "inputs": {"noise_seed": seed}},
        "10": {"class_type": "BasicGuider", "inputs": {"model": ["1", 0], "conditioning": ["5", 0]}},
        "11": {"class_type": "SamplerCustomAdvanced",
               "inputs": {"noise": ["9", 0], "guider": ["10", 0], "sampler": ["8", 0],
                          "sigmas": ["7", 0], "latent_image": ["6", 0]}},
        "12": {"class_type": "VAEDecode", "inputs": {"samples": ["11", 0], "vae": ["3", 0]}},
        "13": {"class_type": "SaveImage",
               "inputs": {"images": ["12", 0], "filename_prefix": "replica"}},
    }


def comfy_generate(prompt, seed, timeout=600):
    body = json.dumps({"prompt": flux_workflow(prompt, seed)}).encode()
    req = urllib.request.Request(f"{COMFY}/prompt", data=body,
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=60) as r:
        pid = json.loads(r.read())["prompt_id"]
    deadline = time.time() + timeout
    while time.time() < deadline:
        time.sleep(5)
        with urllib.request.urlopen(f"{COMFY}/history/{pid}", timeout=30) as r:
            hist = json.loads(r.read())
        if pid in hist:
            outs = hist[pid].get("outputs", {})
            for node in outs.values():
                for img in node.get("images", []):
                    return COMFY_OUT / img.get("subfolder", "") / img["filename"]
            raise RuntimeError(f"finished with no image: {hist[pid].get('status')}")
    raise TimeoutError("comfyui did not finish in time")


def credit(field, got, want):
    if got == want:
        return 1.0
    scale = ORDINAL.get(field)
    if scale and got in scale and want in scale and abs(scale.index(got) - scale.index(want)) == 1:
        return 0.5
    return 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True)
    ap.add_argument("--frames", nargs="*", default=None)
    ap.add_argument("--limit", type=int, default=4)
    ap.add_argument("--seed", type=int, default=20260825)
    ap.add_argument("--annotator", default=ANNOTATOR)
    ap.add_argument("--recycle-every", type=int, default=6,
                    help="hard-restart ComfyUI after N generations. Its footprint only "
                         "grows across a batch (28 GB observed), and a preflight cannot "
                         "bound growth -- only a restart reclaims it.")
    ap.add_argument("--reuse-replicas", action="store_true",
                    help="skip generation and score replicas already on disk")
    args = ap.parse_args()

    rows = [json.loads(l) for l in
            (OUT_ROOT / args.run / "results.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    rows = [r for r in rows if r["model"] == args.annotator and r.get("ok") and r.get("repeat", 1) == 1]
    if args.frames:
        rows = [r for r in rows if r["frame"] in args.frames]
    else:
        rows = [r for r in rows if r["frame"].startswith("arcane-fights")][:args.limit]
    if not rows:
        sys.exit("no annotations selected")

    REPLICA_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_ROOT / args.run / "replication.jsonl"
    print(f"self-proof: {len(rows)} frame(s), craft fields only\n")

    # Two phases, not an alternation. Swapping engines per frame means N
    # load/unload cycles on one card, and that is what killed ComfyUI outright
    # on the first attempt -- a closed socket and a vanished process, no error.
    # Each engine now loads once and does all of its work before yielding.

    # --- phase 1: generate every replica, ComfyUI resident throughout --------
    made = []
    if args.reuse_replicas:
        # Generation is the expensive half and it is idempotent per seed, so a
        # run interrupted in phase 2 should not pay for it twice.
        print("phase 1: skipped, reusing replicas already on disk")
        for r in rows:
            replica = REPLICA_DIR / f"replica-{Path(r['frame']).stem}.png"
            if replica.exists():
                made.append((r, replica, compose_prompt(r["parsed"])))
        print(f"  found {len(made)} replica(s)")
    else:
        print("phase 1: generating replicas (ComfyUI holds the card)")
        # Start from a FRESH engine, always. A ComfyUI left up by a previous
        # run carries its whole accumulated footprint (32.9 GB observed), so a
        # relaunch would begin already starved and the preflight below would
        # refuse a run that is perfectly viable once the stale process is
        # reclaimed. Recycle first, measure second -- the other order just
        # fails on memory the previous run should have given back.
        guard.require(ram_gb=0, free=["ollama"], verbose=False)
        if guard.comfy_process_ids():
            guard.recycle_comfy("stale engine from a previous run")
        elif not guard.start_comfy():
            sys.exit("ComfyUI is not running and could not be started")

        try:
            guard.require(vram_gb=16, ram_gb=guard.RAM_FLOOR_GB, verbose=False)
        except RuntimeError as e:
            sys.exit(f"GUARD: {e}")
        since_recycle = 0
        for n, r in enumerate(rows, 1):
            replica = REPLICA_DIR / f"replica-{Path(r['frame']).stem}.png"
            prompt = compose_prompt(r["parsed"])

            # Resume: generation is deterministic per seed, and three runs have
            # now been interrupted by memory pressure. Never pay for a replica
            # that already exists.
            if replica.exists():
                made.append((r, replica, prompt))
                print(f"  [{n}/{len(rows)}] {r['frame']:24s} -> have it")
                continue

            # ComfyUI's footprint only grows across a batch -- `/free` unloads
            # models but does not hand back the process's accumulated memory.
            # A preflight cannot bound that; only a restart does. Recycle on a
            # fixed interval, and early whenever headroom is already gone.
            if since_recycle >= args.recycle_every or not guard.headroom_ok():
                guard.recycle_comfy("interval" if since_recycle >= args.recycle_every
                                    else "headroom")
                since_recycle = 0

            try:
                img = comfy_generate(prompt, args.seed + n)
            except Exception as e:
                print(f"  [{n}/{len(rows)}] {r['frame']:24s} FAILED: {str(e)[:70]}")
                if not guard.recycle_comfy("after failure"):
                    break
                since_recycle = 0
                continue
            shutil.copy2(img, replica)
            made.append((r, replica, prompt))
            since_recycle += 1
            print(f"  [{n}/{len(rows)}] {r['frame']:24s} -> {replica.name}")

    if not made:
        sys.exit("no replicas generated")

    # --- phase 2: annotate every replica, annotator resident throughout -----
    print(f"\nphase 2: re-annotating {len(made)} replica(s) (annotator holds the card)")
    guard.require_model(args.annotator, vram_gb=20, ram_gb=guard.RAM_FLOOR_GB,
                        free=["comfy"], verbose=False)

    import base64
    scores = []
    for r, replica, prompt in made:
        original = r["parsed"]
        b64 = base64.b64encode(replica.read_bytes()).decode("ascii")
        text, _ = run_ollama(args.annotator, b64, "image/png")
        redo = json.loads(text)

        per = {f: credit(f, redo.get(f), original.get(f)) for f in CRAFT_FIELDS
               if original.get(f) is not None}
        score = sum(per.values()) / len(per)
        scores.append((r["frame"], score, per))
        misses = [f"{f}({original.get(f)}->{redo.get(f)})" for f, v in per.items() if v == 0]
        print(f"  {r['frame']:24s} craft fidelity {100*score:.0f}%"
              f"   misses: {', '.join(misses) or 'none'}")

        with out_path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps({"frame": r["frame"], "replica": replica.name,
                                 "prompt": prompt, "original": {f: original.get(f) for f in CRAFT_FIELDS},
                                 "replica_annotation": {f: redo.get(f) for f in CRAFT_FIELDS},
                                 "per_field": per, "score": round(score, 3)},
                                ensure_ascii=False) + "\n")

    # --- which fields survive the round trip, and which never do ------------
    print(f"\nmean craft fidelity {100*sum(s for _, s, _ in scores)/len(scores):.0f}% "
          f"over {len(scores)} frame(s)\n")
    print("per-field transfer rate (does this word survive the round trip?):")
    for f in CRAFT_FIELDS:
        vals = [per[f] for _, _, per in scores if f in per]
        if vals:
            print(f"  {f:20s} {100*sum(vals)/len(vals):3.0f}%")
    print(f"\nwritten -> {out_path}")


if __name__ == "__main__":
    main()
