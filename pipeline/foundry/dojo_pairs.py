"""Dojo pair runner: seed-matched A/B duos of PROMPTS, on the local stack.

    python dojo_pairs.py foundry-out/training/<cycle-id>

The forge (forge.py) crosses scenes with STYLE RECIPES and grades style
adherence -- the right instrument when a recipe is under test. A dojo cycle
about composition, lighting, lens or performance puts a PROMPT under test,
with the style held constant, and the forge has no seam for that. This runner
does: a spec of duos, each arm a full prompt (and optionally a reference
still with a denoise window), rendered with the same seed, then every image
read back by the same annotator the forge uses -- craft annotation
(vlm-probe schema) and style readback (grade.py) -- so a blind judge can be
handed words, not just pixels.

    <cycle>/gen-spec.json
        {"steps": 20, "width": 1280, "height": 720, "annotator": "qwen3.8:27b",
         "pairs": [{"id": "...", "seed": 1,
                    "baseline":   {"prompt": "...", "ref": null, "window": 0.0},
                    "challenger": {"prompt": "...", "ref": "path.jpg", "window": 0.35}}]}
    <cycle>/pairs/<id>--baseline.png, <id>--challenger.png (+ .json sidecars)
    <cycle>/readbacks.json        {"<id>--<arm>": {"craft": {...}, "style": {...}}}

Engine turn is the forge's: ComfyUI holds the card for every render, then
Ollama for every readback. Resumable -- a PNG on disk is a finished render,
a key in readbacks.json a finished readback.
"""
import base64
import json
import shutil
import sys
import time
from pathlib import Path

HERE = Path(__file__).parent
PROBE = HERE.parent / "vlm-probe"
ROOT = HERE.parent.parent
sys.path.insert(0, str(PROBE))
sys.path.insert(0, str(HERE))
import guard  # noqa: E402
from consistency import COMFY_IN, generate, stage_reference  # noqa: E402
from probe import run_ollama  # noqa: E402
from forge import flux_workflow  # noqa: E402
import grade  # noqa: E402

ARMS = ("baseline", "challenger")


def log(msg):
    print(msg, flush=True)


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

    units = [(p, arm) for p in spec["pairs"] for arm in ARMS]
    todo = [(p, arm) for p, arm in units if not (pairs_dir / f"{p['id']}--{arm}.png").exists()]
    log(f"dojo_pairs: {len(spec['pairs'])} duo(s), {len(units)} unit(s), {len(todo)} to render")

    failed = 0
    if todo:
        guard.require(ram_gb=0, free=["ollama"], verbose=False)
        if guard.comfy_process_ids():
            guard.recycle_comfy("fresh engine for dojo pairs")
        elif not guard.start_comfy():
            raise SystemExit("ComfyUI is not running and could not be started")
        guard.require(vram_gb=16, ram_gb=guard.RAM_FLOOR_GB, verbose=False)
        staged = {}
        since = 0
        for n, (p, arm) in enumerate(todo, 1):
            a = p[arm]
            ref = None
            if a.get("ref"):
                src = Path(a["ref"])
                if not src.is_absolute():
                    src = ROOT / src
                if str(src) not in staged:
                    staged[str(src)] = stage_reference(src)
                ref = staged[str(src)]
            wf = flux_workflow(a["prompt"], p["seed"], ref_name=ref, window=a.get("window", 0.0),
                               width=spec.get("width", 1280), height=spec.get("height", 720),
                               steps=spec.get("steps", 20), prefix=f"dojo-{cdir.name}")
            if since >= 6 or not guard.headroom_ok():
                guard.recycle_comfy("interval" if since >= 6 else "headroom")
                since = 0
            t0 = time.time()
            try:
                img = generate(wf)
            except Exception as e:
                failed += 1
                log(f"  [{n}/{len(todo)}] {p['id']}--{arm} FAILED: {str(e)[:80]}")
                if not guard.recycle_comfy("after failure"):
                    break
                since = 0
                continue
            out = pairs_dir / f"{p['id']}--{arm}.png"
            shutil.copy2(img, out)
            out.with_suffix(".json").write_text(json.dumps(
                {"id": p["id"], "arm": arm, "seed": p["seed"], "prompt": a["prompt"],
                 "ref": a.get("ref"), "window": a.get("window", 0.0), "workflow": wf},
                indent=2, ensure_ascii=False), encoding="utf-8")
            since += 1
            log(f"  [{n}/{len(todo)}] {p['id']}--{arm} -> {time.time()-t0:.0f}s")
        for name in staged.values():
            try:
                (COMFY_IN / name).unlink()
            except OSError:
                pass

    # -- readbacks: the annotator takes the card ------------------------------
    need = [(p, arm) for p, arm in units
            if (pairs_dir / f"{p['id']}--{arm}.png").exists() and f"{p['id']}--{arm}" not in readbacks]
    if need:
        guard.require_model(model, vram_gb=20, ram_gb=guard.RAM_FLOOR_GB, free=["comfy"], verbose=False)
        for n, (p, arm) in enumerate(need, 1):
            key = f"{p['id']}--{arm}"
            b64 = base64.b64encode((pairs_dir / f"{key}.png").read_bytes()).decode("ascii")
            t0 = time.time()
            entry = {}
            try:
                text, _ = run_ollama(model, b64, "image/png")
                entry["craft"] = grade.parse(text)
            except Exception as e:
                entry["craft_error"] = str(e)[:200]
            try:
                entry["style"] = grade.parse(grade.run_style_readback(model, b64))
            except Exception as e:
                entry["style_error"] = str(e)[:200]
            readbacks[key] = entry
            rb_path.write_text(json.dumps(readbacks, indent=1, ensure_ascii=False), encoding="utf-8")
            log(f"  readback [{n}/{len(need)}] {key} -> {time.time()-t0:.0f}s")

    rendered = sum(1 for p, arm in units if (pairs_dir / f"{p['id']}--{arm}.png").exists())
    log(f"dojo_pairs: done -- {rendered}/{len(units)} rendered, {len(readbacks)}/{len(units)} read back, "
        f"{failed} failed this pass")


if __name__ == "__main__":
    main()
