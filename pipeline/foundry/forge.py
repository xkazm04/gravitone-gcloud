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
OUT_ROOT = ROOT / "foundry-out" / "runs"
PROBE_OUT = ROOT / "vlm-probe-out"
STYLES = HERE / "styles.json"

sys.path.insert(0, str(PROBE))
import guard  # noqa: E402
from consistency import COMFY_IN, generate, stage_reference  # noqa: E402
from probe import run_ollama  # noqa: E402
from replicate import compose_prompt  # noqa: E402

import grade  # noqa: E402

NL = chr(10)
ANNOTATOR = "qwen3.8:27b"
NO_TEXT = ("No text, no letters, no numbers, no logos, no captions and no watermark "
           "anywhere in the image.")


# ── manifest ────────────────────────────────────────────────────────────────

def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def save(run_dir, manifest):
    """Atomic: the page polls this file while the forge writes it."""
    tmp = run_dir / "run.json.tmp"
    tmp.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, run_dir / "run.json")


def log(manifest, run_dir, msg):
    print(msg, flush=True)
    manifest["log"].append({"at": now(), "msg": msg})
    save(run_dir, manifest)


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
    p = Path(spec)
    if not p.is_absolute():
        p = PROBE / "frames" / spec
    return p


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
                  prefix="foundry"):
    """Flux 2 text-to-image; with `ref_name`, the reference conditions the
    denoise only inside [0, window] and the text alone finishes the image.
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
        if 0.0 < window < 1.0:
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


def stage_annotate(manifest, run_dir, model):
    todo = [s for s in manifest["scenes"] if not s["annotation"]]
    set_stage(manifest, run_dir, "annotating", 0, len(todo))
    need_gpu = []
    for s in todo:
        src = resolve_source(s["frame"])
        if not src.exists():
            raise SystemExit(f"scene {s['id']}: frame not found at {src}")
        sdir = run_dir / "scenes" / s["id"]
        (sdir / "candidates").mkdir(parents=True, exist_ok=True)
        top, bottom = crop_letterbox(src, sdir / "source.jpg")
        s["letterbox"] = [top, bottom]
        hit = cached_annotation(src.name, model)
        if hit:
            s["annotation"], s["annotation_from"] = hit[1], f"vlm-probe-out/{hit[0]}"
            log(manifest, run_dir, f"  {s['id']}: annotation reused from {hit[0]}")
        else:
            need_gpu.append(s)
    if need_gpu:
        guard.require_model(model, vram_gb=20, ram_gb=guard.RAM_FLOOR_GB, free=["comfy"], verbose=False)
        for n, s in enumerate(need_gpu, 1):
            b64 = base64.b64encode((run_dir / "scenes" / s["id"] / "source.jpg").read_bytes()).decode("ascii")
            t0 = time.time()
            text, _ = run_ollama(model, b64, "image/jpeg")
            s["annotation"], s["annotation_from"] = grade.parse(text), f"{model} @ {now()}"
            log(manifest, run_dir, f"  {s['id']}: annotated in {time.time()-t0:.0f}s")
            manifest["progress"]["done"] = n
    for s in manifest["scenes"]:
        (run_dir / "scenes" / s["id"] / "annotation.json").write_text(
            json.dumps(s["annotation"], indent=2, ensure_ascii=False), encoding="utf-8")
    save(run_dir, manifest)


def stage_generate(manifest, run_dir, recycle_every):
    plan = manifest["plan"]
    mech = {m["id"]: m for m in plan["mechanisms"]}
    scenes = {s["id"]: s for s in manifest["scenes"]}
    todo = [c for c in manifest["candidates"] if c["status"] in ("pending", "failed")]
    # Resume: a PNG on disk is a finished generation, whatever the manifest says.
    for c in todo:
        if (run_dir / c["file"]).exists():
            c["status"] = "generated"
    todo = [c for c in todo if c["status"] != "generated"]
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
        s = scenes[c["scene"]]
        style = manifest["styles"][c["style"]]
        m = mech[c["mechanism"]]
        prompt = candidate_prompt(s["annotation"], style)
        ref = None
        if m.get("reference"):
            if c["scene"] not in staged:
                staged[c["scene"]] = stage_reference(run_dir / s["source"])
            ref = staged[c["scene"]]
        wf = flux_workflow(prompt, c["seed"], ref_name=ref, window=m.get("window", 0.0),
                           steps=plan.get("steps", 20), prefix=f"foundry-{manifest['id']}")
        if since >= recycle_every or not guard.headroom_ok():
            guard.recycle_comfy("interval" if since >= recycle_every else "headroom")
            since = 0
        t0 = time.time()
        try:
            img = generate(wf)
        except Exception as e:
            c["status"], c["error"] = "failed", str(e)[:200]
            log(manifest, run_dir, f"  [{n}/{len(todo)}] {c['id']} FAILED: {str(e)[:80]}")
            if not guard.recycle_comfy("after failure"):
                break
            since = 0
            continue
        shutil.copy2(img, run_dir / c["file"])
        c["status"], c["error"] = "generated", None
        c["prompt"] = prompt
        c["timings"] = {"generate_s": round(time.time() - t0, 1)}
        (run_dir / c["sidecar"]).write_text(json.dumps(
            {"id": c["id"], "prompt": prompt, "mechanism": m, "seed": c["seed"],
             "style": c["style"], "workflow": wf}, indent=2, ensure_ascii=False), encoding="utf-8")
        since += 1
        log(manifest, run_dir, f"  [{n}/{len(todo)}] {c['id']} -> {time.time()-t0:.0f}s")
        manifest["progress"]["done"] = n
        save(run_dir, manifest)
    for name in staged.values():
        try:
            (COMFY_IN / name).unlink()
        except OSError:
            pass


def stage_grade(manifest, run_dir, model):
    scenes = {s["id"]: s for s in manifest["scenes"]}
    todo = [c for c in manifest["candidates"] if c["status"] == "generated"]
    set_stage(manifest, run_dir, "grading", 0, len(todo))
    if not todo:
        return
    guard.require_model(model, vram_gb=20, ram_gb=guard.RAM_FLOOR_GB, free=["comfy"], verbose=False)
    for n, c in enumerate(todo, 1):
        t0 = time.time()
        b64 = base64.b64encode((run_dir / c["file"]).read_bytes()).decode("ascii")
        g = {"grader": model, "at": now(), "craft": None, "style": None,
             "veto": None, "unmeasured": []}
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
        log(manifest, run_dir,
            f"  [{n}/{len(todo)}] {c['id']:48s} craft {craft if craft is None else f'{100*craft:.0f}%':>5} "
            f"style {sty if sty is None else f'{100*sty:.0f}%':>5} "
            f"{'TEXT!' if g['veto'] and g['veto']['has_text'] else ''}")
        manifest["progress"]["done"] = n
        save(run_dir, manifest)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("plan")
    ap.add_argument("--run-id", default=None)
    ap.add_argument("--resume", action="store_true", help="continue a run with this id")
    ap.add_argument("--annotator", default=ANNOTATOR)
    ap.add_argument("--recycle-every", type=int, default=6)
    ap.add_argument("--skip-grade", action="store_true")
    args = ap.parse_args()

    plan = json.loads(Path(args.plan).read_text(encoding="utf-8"))
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

    run_id = args.run_id or f"{datetime.now().strftime('%Y-%m-%d')}-{plan['id']}"
    run_dir = OUT_ROOT / run_id
    if run_dir.exists() and not args.resume:
        raise SystemExit(f"{run_dir} exists -- pass --resume to continue it, or a new --run-id")
    run_dir.mkdir(parents=True, exist_ok=True)
    if args.resume and (run_dir / "run.json").exists():
        manifest = json.loads((run_dir / "run.json").read_text(encoding="utf-8"))
        manifest["log"].append({"at": now(), "msg": "resumed"})
    else:
        manifest = build_manifest(plan, run_id, styles)
    save(run_dir, manifest)
    print(f"forge: run {run_id} -- {len(manifest['scenes'])} scene(s) x {len(plan['styles'])} style(s) "
          f"x {len(plan['mechanisms'])} mechanism(s) x {len(plan.get('seeds', [1]))} seed(s) "
          f"= {len(manifest['candidates'])} candidates\n")

    try:
        log(manifest, run_dir, "stage 0: annotate sources")
        stage_annotate(manifest, run_dir, args.annotator)
        log(manifest, run_dir, "stage 1: generate candidates (ComfyUI holds the card)")
        stage_generate(manifest, run_dir, args.recycle_every)
        if not args.skip_grade:
            log(manifest, run_dir, "stage 2: grade candidates (annotator holds the card)")
            stage_grade(manifest, run_dir, args.annotator)
        manifest["status"] = "done"
        manifest["finished"] = now()
        manifest["progress"] = {"stage": "done", "done": 0, "total": 0}
        save(run_dir, manifest)
        n_ok = sum(1 for c in manifest["candidates"] if c["status"] == "graded")
        print(f"\nforge: done -- {n_ok}/{len(manifest['candidates'])} candidates graded. "
              f"Open /foundry to cull.")
    except BaseException as e:
        manifest["status"] = "failed"
        manifest["error"] = f"{type(e).__name__}: {str(e)[:300]}"
        save(run_dir, manifest)
        raise


if __name__ == "__main__":
    main()
