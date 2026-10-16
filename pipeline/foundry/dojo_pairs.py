"""Dojo pair runner: seed-matched A/B duos of PROMPTS, on the local stack.

    python dojo_pairs.py foundry-out/training/<cycle-id>      (= dojo_run.py: a kernel job)

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
        an arm may carry "late": 0.25 instead of "window" -- the text owns the
        denoise until `late`, then the reference joins (reference-admitted-late)
    <cycle>/pairs/<id>--baseline.png, <id>--challenger.png (+ .json sidecars)
    <cycle>/readbacks.json        {"<id>--<arm>": {"craft": {...}, "style": {...}}}

Engine turn is the forge's: ComfyUI holds the card for every render, then
Ollama for every readback. Resumable -- a PNG on disk is a finished render,
a key in readbacks.json a finished readback.

SINCE PHASE 4 (L34) THIS MODULE IS A UNIT PASS, not a driver: dojo_job.py walks
the cycle as a kernel job (render:<pair>--<arm>, then readback:<pair>--<arm>)
and calls `RenderPass.render` / `readback` one unit at a time. Running this file
runs dojo_run.py, so a direct call is the same job and keeps stack purity.
"""
import base64
import json
import shutil
import sys
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
EXTS = (".png",)
MEDIA = "image"


def order(spec):
    """The render order: every duo's two arms, in spec order."""
    return [(p, arm) for p in spec["pairs"] for arm in ARMS]


def rendered(pairs_dir, p, arm):
    f = pairs_dir / f"{p['id']}--{arm}.png"
    return f if f.exists() else None


class RenderPass:
    """One drive's render turn: ComfyUI started or recycled once, references staged
    once per source, a recycle every six renders or when headroom runs out."""

    def __init__(self, cdir, spec):
        self.cdir, self.spec = cdir, spec
        self.pairs_dir = cdir / "pairs"
        self.pairs_dir.mkdir(parents=True, exist_ok=True)
        self.staged, self.since = {}, 0

    def ready(self):
        guard.require(ram_gb=0, free=["ollama"], verbose=False)
        if guard.comfy_process_ids():
            guard.recycle_comfy("fresh engine for dojo pairs")
        elif not guard.start_comfy():
            raise SystemExit("ComfyUI is not running and could not be started")
        guard.require(vram_gb=16, ram_gb=guard.RAM_FLOOR_GB, verbose=False)

    def workflow(self, p, arm, ref):
        a, spec = p[arm], self.spec
        return flux_workflow(a["prompt"], p["seed"], ref_name=ref, window=a.get("window", 0.0),
                             late=a.get("late", 0.0),
                             width=spec.get("width", 1280), height=spec.get("height", 720),
                             steps=spec.get("steps", 20), prefix=f"dojo-{self.cdir.name}")

    def render(self, p, arm):
        """One arm on the card. Raises when the engine refuses."""
        a = p[arm]
        ref = None
        if a.get("ref"):
            src = Path(a["ref"])
            if not src.is_absolute():
                src = ROOT / src
            if str(src) not in self.staged:
                self.staged[str(src)] = stage_reference(src)
            ref = self.staged[str(src)]
        wf = self.workflow(p, arm, ref)
        if self.since >= 6 or not guard.headroom_ok():
            guard.recycle_comfy("interval" if self.since >= 6 else "headroom")
            self.since = 0
        img = generate(wf)
        out = self.pairs_dir / f"{p['id']}--{arm}.png"
        shutil.copy2(img, out)
        out.with_suffix(".json").write_text(json.dumps(
            {"id": p["id"], "arm": arm, "seed": p["seed"], "prompt": a["prompt"],
             "ref": a.get("ref"), "window": a.get("window", 0.0), "late": a.get("late", 0.0),
             "workflow": wf},
            indent=2, ensure_ascii=False), encoding="utf-8")
        self.since += 1
        return {"file": f"pairs/{out.name}"}

    def after_failure(self):
        """v1: a failed render recycles ComfyUI; a recycle that fails abandons the pass."""
        self.since = 0
        return guard.recycle_comfy("after failure")

    def close(self):
        for name in self.staged.values():
            try:
                (COMFY_IN / name).unlink()
            except OSError:
                pass


def ready_readback(model):
    guard.require_model(model, vram_gb=20, ram_gb=guard.RAM_FLOOR_GB, free=["comfy"], verbose=False)


def readback(pairs_dir, p, arm, model):
    """Craft annotation + style readback of one image. Returns the entry, or None
    when neither pass read anything - an entry of errors is not a readback, and
    caching it would satisfy the resume guard forever (dojo_video.py's 2026-09-20
    lesson, `failure-not-empty-success`, now kept here too; v1 cached it)."""
    key = f"{p['id']}--{arm}"
    b64 = base64.b64encode((pairs_dir / f"{key}.png").read_bytes()).decode("ascii")
    entry = {}
    try:
        text, _ = run_ollama(model, b64, "image/png")
        entry["craft"] = grade.parse(text)
    except Exception as e:  # noqa: BLE001
        entry["craft_error"] = str(e)[:200]
    try:
        entry["style"] = grade.parse(grade.run_style_readback(model, b64))
    except Exception as e:  # noqa: BLE001
        entry["style_error"] = str(e)[:200]
    return entry if ("craft" in entry or "style" in entry) else None


def main():
    import dojo_run
    raise SystemExit(dojo_run.main(sys.argv[1:]))


if __name__ == "__main__":
    main()
