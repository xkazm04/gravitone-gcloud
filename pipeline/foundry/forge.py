"""Phase 1 of the foundry: reference frames in, a graded candidate grid out.

    python forge.py plans/dry-run.json
    python forge.py plans/dry-run.json --run-id 2026-08-26-dry-run --resume

A PLAN names scenes (reference frames), styles (ids from styles.json) and
mechanisms (how a candidate is made). The forge crosses them -- every scene x
every style x every mechanism x every seed -- and leaves a RUN on disk that
the /foundry page reads:

    foundry-out/runs/<run-id>/
        run.json                       manifest, rewritten after every step
        scenes/<scene>/source.jpg      the reference frame, letterbox cropped
        scenes/<scene>/annotation.json craft annotation of the source
        scenes/<scene>/candidates/<style>--<mechanism>--s<seed>.png
        scenes/<scene>/candidates/<...>.json   prompt + workflow + grade

Three stages, and the order is the one lesson this machine keeps teaching:
one 24 GB card, two engines, the turn is explicit (guard.py). Every stage
loads its engine ONCE and does all of its work before yielding.

    0. annotate   (Ollama)   craft annotation of every source frame -- reused
                             from an earlier vlm-probe run when one exists
    1. generate   (ComfyUI)  every candidate, resumable per file
    2. grade      (Ollama)   craft fidelity + style readback, per candidate

MECHANISMS. Two, deliberately, because they are the pipeline question the
dry run exists to answer:

    text       the craft annotation is compiled to words (replicate.py's
               compose_prompt) with the style recipe in place of the source's
               texture, and the generator sees NOTHING else. Style first,
               then the shot (style-first-token-ordering). The principled
               lane: what crosses over is the craft vocabulary, and the
               content is regenerated from a description, never copied.
    ref-early  the same words, plus the source frame as a Flux 2 reference
               latent that conditions ONLY the first `window` of the denoise
               and then leaves. Composition is decided early and texture late
               (measured in the consistency spike, where the inverse window
               carried identity), so this should keep the staging and drop
               the source's rendering. The empirical challenger -- and the
               registry's structure-vs-style caution applies: a lane that
               keeps a source's arrangement whole is copying, not learning,
               so the human decides in the cull whether it earns its keep.
"""

import argparse
import base64
import json
import os
import shutil
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).parent
PROBE = HERE.parent / "vlm-probe"
ROOT = HERE.parent.parent
PROBE_OUT = ROOT / "vlm-probe-out"
STYLES = HERE / "styles.json"


def runs_root():
    """Where runs live: FOUNDRY_RUNS_DIR, else <repo>/<foundry-out|fixtures-out>/runs.

    The universe rule is lib/fixtures/roots.ts `outPath("runs")`, which is what
    lib/foundry/store.ts reads, so a fixture-mode run lands where the fixture
    app looks. The override is for a test's temp universe (decision 12: temp
    stores, never foundry-out), and lib/producers/forge.ts honours the same one."""
    env = os.environ.get("FOUNDRY_RUNS_DIR", "").strip()
    if env:
        return Path(env).resolve()
    universe = "fixtures-out" if os.environ.get("NEXT_PUBLIC_GRAVITONE_DATA") == "fixtures" else "foundry-out"
    return ROOT / universe / "runs"


def frames_dir():
    """The reference frames a plan's bare `frame` names: FOUNDRY_FRAMES_DIR (a test's), else vlm-probe/frames."""
    env = os.environ.get("FOUNDRY_FRAMES_DIR", "").strip()
    return Path(env).resolve() if env else PROBE / "frames"


OUT_ROOT = runs_root()

from atomic import replace_with_retry  # noqa: E402  (before PROBE joins sys.path)

sys.path.insert(0, str(PROBE))
import guard  # noqa: E402
from consistency import COMFY_IN, generate, stage_reference  # noqa: E402
from probe import run_ollama  # noqa: E402
from replicate import compose_prompt  # noqa: E402

import grade  # noqa: E402
import frame_manifest  # noqa: E402
import refs  # noqa: E402

NL = chr(10)
ANNOTATOR = "qwen3.8:27b"
NO_TEXT = ("No text, no letters, no numbers, no logos, no captions and no watermark "
           "anywhere in the image.")


# ── manifest ────────────────────────────────────────────────────────────────

def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def save(run_dir, manifest):
    """Atomic: the page polls this file while the forge writes it.

    The replace is retried (atomic.py has the measurement). On Windows
    os.replace raises PermissionError while any other handle to the destination
    is open, and "the page polls this file" is a description of a handle being
    open a great deal of the time. This function is called after every
    candidate, from inside main()'s try -- so one unlucky poll would abort the
    run, mark the manifest failed and throw away an evening of GPU, for a
    conflict that resolves in microseconds.

    Measured on the sibling path (acquire.py's 30 KB catalogue, a reader in a
    tight loop): a bare replace lost 32 of 40 writes; with this retry, 0 of 40.
    """
    tmp = run_dir / "run.json.tmp"
    tmp.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    replace_with_retry(tmp, run_dir / "run.json")


# Where progress lines go. stdout by default (v1); the CLI's --json moves them to
# stderr, so stdout carries one document and nothing else (agent-cli-transport).
LOG_STREAM = None


def say(msg):
    print(msg, file=LOG_STREAM or sys.stdout, flush=True)


def log(manifest, run_dir, msg):
    say(msg)
    manifest["log"].append({"at": now(), "msg": msg})
    save(run_dir, manifest)


def pct(v):
    """A score as a percentage, or `n/a` when there is no score. Never None:
    see the note in stage_grade."""
    return "  n/a" if v is None else f"{100 * v:.0f}%"


def set_stage(manifest, run_dir, stage, done=0, total=0):
    manifest["status"] = stage
    manifest["progress"] = {"stage": stage, "done": done, "total": total}
    save(run_dir, manifest)


# ── sources ─────────────────────────────────────────────────────────────────

def crop_letterbox(src, dst, threshold=18):
    """Strip black bars. A reference latent copies them otherwise, and a
    candidate with bars is wrongly penalised on every composition field."""
    from PIL import Image
    import numpy as np
    im = Image.open(src).convert("RGB")
    a = np.asarray(im).mean(axis=2)
    rows = a.mean(axis=1)
    top, bottom = 0, len(rows)
    while top < len(rows) and rows[top] < threshold:
        top += 1
    while bottom > top and rows[bottom - 1] < threshold:
        bottom -= 1
    if bottom - top < len(rows) * 0.5:
        top, bottom = 0, len(rows)
    im.crop((0, top, im.width, bottom)).save(dst, quality=92)
    return (top, bottom)


def cached_annotation(frame_name, model):
    """The vlm-probe corpus has already annotated hundreds of frames with the
    same schema and the same model; paying the GPU for that again would be
    waste. Newest run wins."""
    best = None
    for results in sorted(PROBE_OUT.glob("*/results.jsonl"), key=lambda p: p.stat().st_mtime):
        for line in results.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            r = json.loads(line)
            if r.get("frame") == frame_name and r.get("model") == model and r.get("ok") \
                    and r.get("repeat", 1) == 1 and isinstance(r.get("parsed"), dict):
                best = (results.parent.name, r["parsed"])
    return best


def resolve_source(spec):
    """`frame:<name>` / `lane:<lane>/<file>` or a bare filename under frames/.
    An absolute path raises `non-portable reference` (refs.py)."""
    return refs.resolve_spec(spec, frames_dir())


# ── prompts and workflows ───────────────────────────────────────────────────

def candidate_prompt(annotation, style):
    """Style FIRST, then the shot, then the one clause that is never optional.

    compose_prompt writes the craft as effect language; `style=` swaps the
    source's texture clause for the recipe, which is the whole trick of the
    forge -- keep the shot, change the idiom.
    """
    craft = compose_prompt(annotation, style="")  # empty: drop the texture clause, the recipe leads
    return f"{style['recipe']} {craft} {NO_TEXT}"


def flux_workflow(prompt, seed, ref_name=None, window=0.0, width=1280, height=720, steps=20,
                  prefix="foundry", late=0.0):
    """Flux 2 text-to-image; with `ref_name`, the reference conditions the
    denoise only inside [0, window] and the text alone finishes the image.
    `late` is the opposite dial (consistency.py's `--late`, the
    reference-admitted-late technique): the text alone owns [0, late] so
    composition is the brief's, then the reference joins for [late, 1] to
    assert identity. `window` and `late` are exclusive; `late` wins.
    Node layout matches consistency.py so that the chain sits between the text
    encode and FluxGuidance -- guidance first silently drops the reference."""
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
        "7": {"class_type": "Flux2Scheduler", "inputs": {"steps": steps, "width": width, "height": height}},
        "8": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}},
        "9": {"class_type": "RandomNoise", "inputs": {"noise_seed": seed}},
    }
    cond = ["4", 0]
    if ref_name:
        w["20"] = {"class_type": "LoadImage", "inputs": {"image": ref_name}}
        w["21"] = {"class_type": "VAEEncode", "inputs": {"pixels": ["20", 0], "vae": ["3", 0]}}
        w["22"] = {"class_type": "ReferenceLatent", "inputs": {"conditioning": ["4", 0], "latent": ["21", 0]}}
        if 0.0 < late < 1.0:
            w["30"] = {"class_type": "ConditioningSetTimestepRange",
                       "inputs": {"conditioning": ["4", 0], "start": 0.0, "end": late}}
            w["31"] = {"class_type": "ConditioningSetTimestepRange",
                       "inputs": {"conditioning": ["22", 0], "start": late, "end": 1.0}}
            w["32"] = {"class_type": "ConditioningCombine",
                       "inputs": {"conditioning_1": ["30", 0], "conditioning_2": ["31", 0]}}
            cond = ["32", 0]
        elif 0.0 < window < 1.0:
            w["30"] = {"class_type": "ConditioningSetTimestepRange",
                       "inputs": {"conditioning": ["22", 0], "start": 0.0, "end": window}}
            w["31"] = {"class_type": "ConditioningSetTimestepRange",
                       "inputs": {"conditioning": ["4", 0], "start": window, "end": 1.0}}
            w["32"] = {"class_type": "ConditioningCombine",
                       "inputs": {"conditioning_1": ["30", 0], "conditioning_2": ["31", 0]}}
            cond = ["32", 0]
        else:
            cond = ["22", 0]
    w["5"] = {"class_type": "FluxGuidance", "inputs": {"conditioning": cond, "guidance": 4.0}}
    w["10"] = {"class_type": "BasicGuider", "inputs": {"model": ["1", 0], "conditioning": ["5", 0]}}
    w["11"] = {"class_type": "SamplerCustomAdvanced",
               "inputs": {"noise": ["9", 0], "guider": ["10", 0], "sampler": ["8", 0],
                          "sigmas": ["7", 0], "latent_image": ["6", 0]}}
    w["12"] = {"class_type": "VAEDecode", "inputs": {"samples": ["11", 0], "vae": ["3", 0]}}
    w["13"] = {"class_type": "SaveImage", "inputs": {"images": ["12", 0], "filename_prefix": prefix}}
    return w


# ── the run ─────────────────────────────────────────────────────────────────

def build_manifest(plan, run_id, styles):
    scenes = []
    for s in plan["scenes"]:
        scenes.append({"id": s["id"], "frame": s["frame"], "note": s.get("note", ""),
                       "source": f"scenes/{s['id']}/source.jpg",
                       "annotation": None, "annotation_from": None})
    candidates = []
    for s in plan["scenes"]:
        for sid in plan["styles"]:
            for m in plan["mechanisms"]:
                for seed in plan.get("seeds", [20260826]):
                    cid = f"{sid}--{m['id']}--s{seed}"
                    candidates.append({
                        "id": f"{s['id']}/{cid}", "scene": s["id"], "style": sid,
                        "mechanism": m["id"], "seed": seed,
                        "file": f"scenes/{s['id']}/candidates/{cid}.png",
                        "sidecar": f"scenes/{s['id']}/candidates/{cid}.json",
                        "status": "pending", "grade": None, "error": None,
                    })
    return {
        "id": run_id, "created": now(), "plan": plan,
        "styles": {sid: styles[sid] for sid in plan["styles"]},
        "status": "created", "progress": {"stage": "created", "done": 0, "total": 0},
        "scenes": scenes, "candidates": candidates, "log": [],
    }


# ── the stand-ins a DRY job runs on (Phase 4, decision 4) ───────────────────
#
# A dry job runs the whole plan with no ComfyUI and no Ollama: every vendor call
# is answered here, and what it would have sent is kept on the sidecar, so a dry
# run still shows the prompts and workflows the evening would have spent. The
# plate is a real file (a 1x1 PNG), so the disk path - the resume rule, the
# reader, the cull - runs whole. A dry run is marked `dry: true` on run.json and
# on every grade; its plates are not worth culling.

DRY_MODEL = "dry/stand-in"
DRY_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")
DRY_ANNOTATION = {"shot_size": "full shot", "camera_angle": "eye level", "note": "a dry stand-in: no annotator was called"}


def dry_pause():
    """FOUNDRY_DRY_STEP_MS: how long a stand-in takes. A kill test needs a step
    still in flight when the signal lands; nothing else sets it."""
    ms = os.environ.get("FOUNDRY_DRY_STEP_MS", "").strip()
    if ms:
        time.sleep(int(ms) / 1000.0)


# ── the three units ─────────────────────────────────────────────────────────
#
# ONE UNIT, ONE FUNCTION, so the job driver (forge_job.py) and the stage loops
# below perform the identical thing. None of them loads an engine: the turn
# (guard.require*, a ComfyUI start or recycle) is the caller's, taken once per
# stage before its first unit, because "every stage loads its engine ONCE".

def stage_source(run_dir, s, dry=False):
    """The scene's reference frame, letterbox cropped into the run. Records which
    pixels were read (`source_sha256`)."""
    src = resolve_source(s["frame"])
    if not src.exists():
        raise SystemExit(f"scene {s['id']}: frame not found at {src}")
    if not s.get("source_sha256"):
        s["source_sha256"] = frame_manifest.sha256_file(src)
    sdir = run_dir / "scenes" / s["id"]
    (sdir / "candidates").mkdir(parents=True, exist_ok=True)
    if dry:
        # No Pillow in a dry job: the frame is copied whole, and no crop is claimed.
        shutil.copyfile(src, sdir / "source.jpg")
        s["letterbox"] = None
    else:
        top, bottom = crop_letterbox(src, sdir / "source.jpg")
        s["letterbox"] = [top, bottom]
    return src


def write_annotation(run_dir, s):
    (run_dir / "scenes" / s["id"] / "annotation.json").write_text(
        json.dumps(s["annotation"], indent=2, ensure_ascii=False), encoding="utf-8")


def annotate_scene(manifest, run_dir, s, model, dry=False, ready=None):
    """Annotate one scene: reused from the vlm-probe corpus when it has the frame
    (paying the GPU for that again would be waste), else read by the annotator,
    `ready()` first - the caller's engine turn. Raises when the annotator fails;
    the scene then stays unannotated."""
    src = stage_source(run_dir, s, dry)
    hit = cached_annotation(src.name, model)
    if hit:
        s["annotation"], s["annotation_from"] = hit[1], f"vlm-probe-out/{hit[0]}"
        log(manifest, run_dir, f"  {s['id']}: annotation reused from {hit[0]}")
    elif dry:
        dry_pause()
        s["annotation"], s["annotation_from"] = dict(DRY_ANNOTATION), DRY_MODEL
        log(manifest, run_dir, f"  {s['id']}: annotated by the dry stand-in (would call {model})")
    else:
        if ready:
            ready()
        b64 = base64.b64encode((run_dir / "scenes" / s["id"] / "source.jpg").read_bytes()).decode("ascii")
        t0 = time.time()
        text, _ = run_ollama(model, b64, "image/jpeg")
        s["annotation"], s["annotation_from"] = grade.parse(text), f"{model} @ {now()}"
        log(manifest, run_dir, f"  {s['id']}: annotated in {time.time()-t0:.0f}s")
    write_annotation(run_dir, s)
    save(run_dir, manifest)
    return {"scene": s["id"], "from": s["annotation_from"]}


def stage_annotate(manifest, run_dir, model):
    todo = [s for s in manifest["scenes"] if not s["annotation"]]
    set_stage(manifest, run_dir, "annotating", 0, len(todo))
    for s in manifest["scenes"]:  # which pixels were read -- also for scenes resumed with an annotation
        if not s.get("source_sha256"):
            src = resolve_source(s["frame"])
            if src.exists():
                s["source_sha256"] = frame_manifest.sha256_file(src)
    loaded = []

    def ready():
        if not loaded:
            guard.require_model(model, vram_gb=20, ram_gb=guard.RAM_FLOOR_GB, free=["comfy"], verbose=False)
            loaded.append(model)

    for n, s in enumerate(todo, 1):
        annotate_scene(manifest, run_dir, s, model, ready=ready)
        manifest["progress"]["done"] = n
    for s in manifest["scenes"]:
        write_annotation(run_dir, s)
    save(run_dir, manifest)


def adopt_plate(manifest, run_dir, c, mech, scenes):
    """Give a plate adopted on resume the provenance a generated one carries.

    The PNG is a finished generation, but the sidecar and `prompt` are written
    only by the generation branch -- so every candidate that survived a crash
    was the one with no record of its recipe. The prompt is a pure function of
    the manifest (annotation + style), so it is rebuilt, not guessed. What was
    never measured stays absent: no `generate_s` (nobody timed it) and no
    `workflow` (its reference filename was staged by the dead process).
    `adopted: true` says the record was reconstructed, not captured."""
    prompt = candidate_prompt(scenes[c["scene"]]["annotation"], manifest["styles"][c["style"]])
    c["prompt"] = prompt
    sidecar = run_dir / c["sidecar"]
    if not sidecar.exists():
        sidecar.parent.mkdir(parents=True, exist_ok=True)
        sidecar.write_text(json.dumps(
            {"id": c["id"], "prompt": prompt, "mechanism": mech[c["mechanism"]], "seed": c["seed"],
             "style": c["style"], "workflow": None, "adopted": True},
            indent=2, ensure_ascii=False), encoding="utf-8")


def adopt_plates(manifest, run_dir):
    """Resume: a PNG on disk is a finished generation, whatever the manifest says.
    Returns the candidates still to generate."""
    mech = {m["id"]: m for m in manifest["plan"]["mechanisms"]}
    scenes = {s["id"]: s for s in manifest["scenes"]}
    todo = [c for c in manifest["candidates"] if c["status"] in ("pending", "failed")]
    for c in todo:
        if (run_dir / c["file"]).exists():
            c["status"] = "generated"
            adopt_plate(manifest, run_dir, c, mech, scenes)
    return [c for c in todo if c["status"] != "generated"]


def generate_candidate(manifest, run_dir, c, staged, dry=False):
    """Generate one plate on the running ComfyUI (the caller's turn) and write its
    sidecar. Raises when the engine refuses; the candidate is then the caller's to
    mark failed. `staged` caches each scene's uploaded reference for the pass."""
    plan = manifest["plan"]
    m = {x["id"]: x for x in plan["mechanisms"]}[c["mechanism"]]
    s = {x["id"]: x for x in manifest["scenes"]}[c["scene"]]
    prompt = candidate_prompt(s["annotation"], manifest["styles"][c["style"]])
    ref = None
    if m.get("reference"):
        if c["scene"] not in staged:
            staged[c["scene"]] = "dry-reference.jpg" if dry else stage_reference(run_dir / s["source"])
        ref = staged[c["scene"]]
    wf = flux_workflow(prompt, c["seed"], ref_name=ref, window=m.get("window", 0.0),
                       steps=plan.get("steps", 20), prefix=f"foundry-{manifest['id']}")
    t0 = time.time()
    if dry:
        dry_pause()
        (run_dir / c["file"]).parent.mkdir(parents=True, exist_ok=True)
        (run_dir / c["file"]).write_bytes(DRY_PNG)
    else:
        img = generate(wf)
        shutil.copy2(img, run_dir / c["file"])
    c["status"], c["error"] = "generated", None
    c["prompt"] = prompt
    c["timings"] = {"generate_s": round(time.time() - t0, 1)}
    side = {"id": c["id"], "prompt": prompt, "mechanism": m, "seed": c["seed"], "style": c["style"], "workflow": wf}
    if dry:
        side["dry"] = True
    (run_dir / c["sidecar"]).write_text(json.dumps(side, indent=2, ensure_ascii=False), encoding="utf-8")
    return c


def stage_generate(manifest, run_dir, recycle_every):
    todo = adopt_plates(manifest, run_dir)
    set_stage(manifest, run_dir, "generating", 0, len(todo))
    if not todo:
        return

    guard.require(ram_gb=0, free=["ollama"], verbose=False)
    if guard.comfy_process_ids():
        guard.recycle_comfy("fresh engine for the forge")
    elif not guard.start_comfy():
        raise SystemExit("ComfyUI is not running and could not be started")
    guard.require(vram_gb=16, ram_gb=guard.RAM_FLOOR_GB, verbose=False)

    staged = {}
    since = 0
    for n, c in enumerate(todo, 1):
        if since >= recycle_every or not guard.headroom_ok():
            guard.recycle_comfy("interval" if since >= recycle_every else "headroom")
            since = 0
        t0 = time.time()
        try:
            generate_candidate(manifest, run_dir, c, staged)
        except Exception as e:
            c["status"], c["error"] = "failed", str(e)[:200]
            log(manifest, run_dir, f"  [{n}/{len(todo)}] {c['id']} FAILED: {str(e)[:80]}")
            if not guard.recycle_comfy("after failure"):
                break
            since = 0
            continue
        since += 1
        log(manifest, run_dir, f"  [{n}/{len(todo)}] {c['id']} -> {time.time()-t0:.0f}s")
        manifest["progress"]["done"] = n
        save(run_dir, manifest)
    unstage(staged)


def unstage(staged):
    for name in staged.values():
        try:
            (COMFY_IN / name).unlink()
        except OSError:
            pass


# `unmeasured` IS A RESUMABLE STATE, and it was the one status no stage
# would take back. stage_generate re-adopts a plate for `pending` and
# `failed`; grading took `generated` only -- so a candidate whose grade
# failed transiently (one Ollama hiccup, one eviction mid-pass) landed in
# `unmeasured` and fell out of both todo lists permanently. Its PNG is on
# disk and paid for, and no re-run could ever score it: --resume walked
# past it every time, and the ledger kept counting it as ungraded.
#
# That contradicts the README's "Resumable by construction. A PNG on disk
# is a finished generation whatever the manifest says." A plate on disk
# with no grade is exactly what stage 2 is for. Re-grading one is cheap
# and idempotent -- the grade is overwritten, not appended.
GRADABLE = ("generated", "unmeasured")


def grade_candidate(manifest, run_dir, c, model, dry=False, label=""):
    """Grade one plate on the loaded annotator (the caller's turn). Never raises
    for a failed pass: a pass that could not be made is named in `unmeasured`,
    and the candidate is `unmeasured` -- counted separately, never a pass."""
    scenes = {s["id"]: s for s in manifest["scenes"]}
    t0 = time.time()
    # `grader_digest`: the model alone does not name the instrument -- a
    # change to grade.py's prompts or schemas is a new grader, and the
    # calibration (lib/foundry/calibration.ts) keeps each its own series.
    g = {"grader": DRY_MODEL if dry else model, "grader_digest": grade.GRADER_DIGEST, "at": now(),
         "craft": None, "style": None, "veto": None, "unmeasured": []}
    if dry:
        dry_pause()
        g["veto"] = {"has_text": False}
        g["dry"] = True
    else:
        b64 = base64.b64encode((run_dir / c["file"]).read_bytes()).decode("ascii")
        try:
            text, _ = run_ollama(model, b64, "image/png")
            redo = grade.parse(text)
            score, per = grade.craft_score(scenes[c["scene"]]["annotation"], redo)
            g["craft"] = {"score": score, "per_field": per,
                          "annotation": {f: redo.get(f) for f in grade.CRAFT_FIELDS}}
        except Exception as e:
            g["unmeasured"].append(f"craft: {str(e)[:120]}")
        try:
            rb = grade.parse(grade.run_style_readback(model, b64))
            score, per = grade.style_score(manifest["styles"][c["style"]]["observables"], rb)
            g["style"] = {"score": score, "per_field": per, "readback": rb}
            g["veto"] = {"has_text": bool(rb.get("has_text"))}
        except Exception as e:
            g["unmeasured"].append(f"style: {str(e)[:120]}")
    c["grade"] = g
    c["status"] = "graded" if not g["unmeasured"] else "unmeasured"
    c.setdefault("timings", {})["grade_s"] = round(time.time() - t0, 1)
    craft = g["craft"]["score"] if g["craft"] else None
    sty = g["style"]["score"] if g["style"] else None
    # THE PROGRESS LINE MUST SURVIVE AN ABSENT SCORE, because an absent
    # score is the case this whole function is built to survive.
    #
    # `f"{None:>5}"` is a TypeError -- format specs do not apply to None --
    # so the previous form, `{craft if craft is None else f'{100*craft:.0f}%':>5}`,
    # raised on exactly the two paths the code above had just handled
    # correctly: the craft or style pass threw and was recorded in
    # `unmeasured` (the README's "a candidate that could not be graded is
    # `unmeasured`, counted separately, and never a pass"), or craft_score
    # returned None because the SOURCE annotation carries no scoreable
    # field. One ungradable candidate then ended the run -- at stage 2, with
    # every plate already generated and an evening of GPU behind it.
    # Format the string first; the spec then always has a string to pad.
    log(manifest, run_dir,
        f"  {label}{c['id']:48s} craft {pct(craft):>5} "
        f"style {pct(sty):>5} "
        f"{'TEXT!' if g['veto'] and g['veto']['has_text'] else ''}")
    save(run_dir, manifest)
    return c


def stage_grade(manifest, run_dir, model):
    todo = [c for c in manifest["candidates"] if c["status"] in GRADABLE]
    set_stage(manifest, run_dir, "grading", 0, len(todo))
    if not todo:
        return
    guard.require_model(model, vram_gb=20, ram_gb=guard.RAM_FLOOR_GB, free=["comfy"], verbose=False)
    for n, c in enumerate(todo, 1):
        grade_candidate(manifest, run_dir, c, model, label=f"[{n}/{len(todo)}] ")
        manifest["progress"]["done"] = n
        save(run_dir, manifest)


def final_status(manifest):
    """`done` means the forge got through the plan; `incomplete` means it gave up.

    stage_generate BREAKS out of the candidate loop when ComfyUI cannot be
    recycled after a failure -- the run then grades what exists and returns
    normally, and main() used to write "done" over it unconditionally. A run
    that abandoned 80 of 90 candidates was, in the one field the API reads as a
    lifecycle state, indistinguishable from one that finished; the shortfall was
    reconstructable only from a candidate count that does not add up and a log
    the operator has to open.

    A candidate still `pending` was never attempted; a `failed` one was attempted
    and produced nothing. Either means the run did not deliver its plan, so it
    does not get to say it finished. `incomplete` is terminal and committable --
    the plates it DID produce are on disk and worth culling (lib/foundry/types.ts
    holds the union, app/foundry/parts.tsx the word and the commit set).
    """
    left = [c for c in manifest["candidates"] if c["status"] in ("pending", "failed")]
    return "incomplete" if left else "done"


def finish(manifest, run_dir):
    """Write the run's ending (final_status) and return it."""
    manifest["status"] = final_status(manifest)
    manifest["finished"] = now()
    manifest["progress"] = {"stage": manifest["status"], "done": 0, "total": 0}
    save(run_dir, manifest)
    return manifest["status"]


# ── preparing a run: the manifest, before any job exists ────────────────────

def prepare(plan_path, run_id=None, resume=False, annotator=ANNOTATOR, recycle_every=6, skip_grade=False):
    """Validate a plan and write its run.json -- everything forge.py did before
    its first stage, and nothing after. Returns (run_id, run_dir, manifest).
    Raises SystemExit with v1's sentence for every refusal.

    The run's own knobs (annotator, recycle interval, skip-grade) are written onto
    the manifest under `forge`, because the job that performs the run may be
    claimed by the worker in another process, which never saw this argv."""
    plan = json.loads(Path(plan_path).read_text(encoding="utf-8"))
    styles = {s["id"]: s for s in json.loads(STYLES.read_text(encoding="utf-8"))["styles"]}
    missing = [s for s in plan["styles"] if s not in styles]
    if missing:
        raise SystemExit(f"unknown style ids: {missing}")
    # A STYLE THIS RUN CANNOT SCORE IS WORSE THAN A STYLE IT CANNOT FIND.
    #
    # The check above catches a style id that does not exist, and it fails
    # loudly. An observable typed one character wrong does not: style_score
    # compares enum-for-enum with ==, so that field scores 0.0 against every
    # candidate for the whole run -- and 0.0 is exactly what a style the
    # generator genuinely missed looks like. The evening is spent, the plates
    # are on disk, and the ledger row says the style does not work.
    #
    # styles.json is hand-edited on purpose: acquire.py lands a style as a
    # hypothesis and prints "edit the recipe in styles.json before forging".
    # So a typo here is the ordinary path, not an exotic one. Refuse before the
    # first frame is annotated; the fix is one word in one file.
    unscoreable = {sid: grade.unscoreable(styles[sid].get("observables") or {})
                   for sid in plan["styles"]}
    unscoreable = {sid: bad for sid, bad in unscoreable.items() if bad}
    if unscoreable:
        lines = [
            f"  {sid}: " + ", ".join(
                f"{f}={v!r} (allowed: {', '.join(grade.allowed_values(f))})"
                for f, v in bad.items())
            for sid, bad in unscoreable.items()
        ]
        raise SystemExit(
            "styles.json holds observables the grader cannot score:" + NL + NL.join(lines))
    # And a style with NO gradable observable at all leaves every candidate
    # style-unmeasured -- the same evening, for no style signal.
    blind = [sid for sid in plan["styles"]
             if not any((styles[sid].get("observables") or {}).get(f) is not None
                        for f in grade.STYLE_ENUMS)]
    if blind:
        raise SystemExit(
            f"styles with no gradable observable ({', '.join(grade.STYLE_ENUMS)}): {blind}")

    run_id = run_id or f"{datetime.now().strftime('%Y-%m-%d')}-{plan['id']}"
    run_dir = runs_root() / run_id
    if run_dir.exists() and not resume:
        raise SystemExit(f"{run_dir} exists -- pass --resume to continue it, or a new --run-id")
    run_dir.mkdir(parents=True, exist_ok=True)
    if resume and (run_dir / "run.json").exists():
        manifest = json.loads((run_dir / "run.json").read_text(encoding="utf-8"))
        manifest["log"].append({"at": now(), "msg": "resumed"})
    else:
        manifest = build_manifest(plan, run_id, styles)
    manifest["forge"] = {"annotator": annotator, "recycle_every": recycle_every, "skip_grade": bool(skip_grade)}
    save(run_dir, manifest)
    return run_id, run_dir, manifest


# ── the CLI ─────────────────────────────────────────────────────────────────
#
# SINCE PHASE 4 (L34) A RUN IS A KERNEL JOB on gpu.local - the same job the
# worker (worker.py) claims and the app launches. This CLI prepares run.json,
# enqueues the job through the Node launcher (pipeline/foundry/launch.mts: the
# receipt, confirmed by the CLI itself) and drives it here, unless --detach
# leaves it to `python pipeline/foundry/worker.py`. The job's slot IS the GPU
# lease (pipeline/gpu/lease.py hold_for_job): v1's forge took no lease at all,
# so it was the one GPU tenant the others could not see. Invoked, it runs LIVE
# as v1 did; --dry runs the whole plan on stand-ins (no ComfyUI, no Ollama,
# placeholder plates).
#
# EXIT 0 done (or enqueued with --detach) · 1 failed, incomplete or refused · 2 usage.

def emit(doc, as_json):
    if as_json:
        print(json.dumps(doc), flush=True)


def main(argv=None):
    global LOG_STREAM
    ap = argparse.ArgumentParser()
    ap.add_argument("plan")
    ap.add_argument("--run-id", default=None)
    ap.add_argument("--resume", action="store_true", help="continue a run with this id (retries its job)")
    ap.add_argument("--annotator", default=ANNOTATOR)
    ap.add_argument("--recycle-every", type=int, default=6)
    ap.add_argument("--skip-grade", action="store_true")
    ap.add_argument("--dry", action="store_true", help="a dry job: stand-ins for ComfyUI and Ollama")
    ap.add_argument("--detach", action="store_true", help="enqueue only; the worker drives")
    ap.add_argument("--json", action="store_true", help="one JSON document on stdout")
    ap.add_argument("--budget-usd", type=float, default=None, help="the job's ceiling (a local run spends $0)")
    ap.add_argument("--prepare", action="store_true", help="write run.json and stop (the Node launcher's call)")
    args = ap.parse_args(argv)
    if args.json:
        LOG_STREAM = sys.stderr

    import worker  # noqa: E402  (the job driver; it imports this module)

    try:
        run_id, run_dir, manifest = prepare(args.plan, args.run_id, args.resume, args.annotator,
                                            args.recycle_every, args.skip_grade)
    except SystemExit as e:
        if not isinstance(e.code, str):
            raise
        say(f"forge: {e.code}")
        emit({"ok": False, "error": e.code}, args.json)
        return 1
    if args.prepare:
        emit({"ok": True, "runId": run_id, "candidates": len(manifest["candidates"])}, args.json)
        return 0
    plan = manifest["plan"]
    say(f"forge: run {run_id} -- {len(manifest['scenes'])} scene(s) x {len(plan['styles'])} style(s) "
        f"x {len(plan['mechanisms'])} mechanism(s) x {len(plan.get('seeds', [1]))} seed(s) "
        f"= {len(manifest['candidates'])} candidates\n")

    flags = ["--run-id", run_id] + (["--dry"] if args.dry else []) + (["--resume"] if args.resume else [])
    if args.budget_usd is not None:
        flags += ["--budget-usd", str(args.budget_usd)]
    try:
        launched = worker.launch("forge", flags)
    except worker.LaunchError as e:
        say(f"forge: {e}")
        emit({"ok": False, "runId": run_id, "error": str(e)}, args.json)
        return 1
    job_id = launched["jobId"]
    say(f"forge: job {job_id} ({launched['kind']}, {'dry' if args.dry else 'live'})")
    if args.detach:
        emit({"ok": True, "runId": run_id, "jobId": job_id, "detached": True}, args.json)
        return 0

    import contextlib  # noqa: E402
    # guard's recycle lines print to stdout; under --json stdout is the document's alone.
    with contextlib.redirect_stdout(sys.stderr) if args.json else contextlib.nullcontext():
        report = worker.drive_job(job_id, say=say)
    final = json.loads((run_dir / "run.json").read_text(encoding="utf-8"))
    n_ok = sum(1 for c in final["candidates"] if c["status"] == "graded")
    left = sum(1 for c in final["candidates"] if c["status"] in ("pending", "failed"))
    if report["state"] == "done":
        say(f"\nforge: done -- {n_ok}/{len(final['candidates'])} candidates graded. Open /foundry to cull.")
    elif final.get("status") == "incomplete":
        say(f"\nforge: INCOMPLETE -- gave up with {left}/{len(final['candidates'])} candidates "
            f"never produced; {n_ok} graded. Open /foundry to cull what there is; "
            f"--resume retries the job without regenerating a booked plate.")
    else:
        say(f"\nforge: job {job_id} ended {report['state']}: {report.get('error') or report['outcome']}")
    doc = {"ok": report["state"] == "done", "runId": run_id, "jobId": job_id, "outcome": report["outcome"],
           "state": report["state"], "status": final.get("status"), "graded": n_ok, "left": left}
    if report.get("error"):
        doc["error"] = report["error"]
    emit(doc, args.json)
    return 0 if report["state"] == "done" else 1


if __name__ == "__main__":
    sys.exit(main())
