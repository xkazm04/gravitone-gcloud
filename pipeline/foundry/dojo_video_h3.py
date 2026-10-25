"""Dojo serial-lane runner: Wan t2v vs MiniMax H3 ref2va, per-arm engines.

    python dojo_video_h3.py foundry-out/training/<cycle-id>      (= dojo_run.py: a kernel job)

The 2026-09-02 replication closed text-phrasing as a lever for serial
continuity; the declared successor is reference conditioning (H3 ref2va held
identity at 0.1887 across hard cuts in the vlm-probe motion spike). This
runner renders a gen-spec whose ARMS carry their own engine:

    {"pairs":[{"id":..., "seed":...,
       "baseline":   {"engine":"wan",      "prompt":...},
       "challenger": {"engine":"h3-ref2va","prompt":..., "ref": "<image path>"}}]}

Units are ORDERED BY ENGINE (all wan, then all h3): Flux/Wan/H3 cannot
co-reside on the card, and alternating arms would recycle ComfyUI per clip.
H3 graphs come verbatim from pipeline/vlm-probe/motion.py (the measured
spike); its module-level SEED is set per unit so arms stay seed-matched.
H3 lengths must be congruent to 5 (mod 17) — 73 frames (~3 s) here; the wan
arm renders 73 frames too so the judge compares equal durations.

Posters (t0/t1/t2) and qwen readbacks follow dojo_video.py's discipline.

SINCE PHASE 4 (L34) THIS MODULE IS A UNIT PASS driven by dojo_job.py as a kernel
job; the engine order is the plan's order (`order`), so a resumed job keeps it.
"""
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
import motion  # noqa: E402
from consistency import stage_reference  # noqa: E402
import dojo_video  # noqa: E402
from dojo_video import generate_video, posters, wan_workflow  # noqa: E402

W, H, LEN = 832, 480, 73  # H3's mod-17 law; wan matches for equal-duration pairs
ARMS = ("baseline", "challenger")
EXTS = (".webm", ".mp4")
MEDIA = "video-serial-lanes"


def engine_of(p, arm):
    return p[arm].get("engine") or "wan"


def order(spec):
    """Every wan clip first, then every h3 one (a stable sort keeps spec order inside each)."""
    units = [(p, arm) for p in spec["pairs"] for arm in ARMS]
    return sorted(units, key=lambda u: 0 if engine_of(*u) == "wan" else 1)


def rendered(pairs_dir, p, arm):
    for ext in EXTS:
        f = pairs_dir / f"{p['id']}--{arm}{ext}"
        if f.exists():
            return f
    return None


class RenderPass:
    def __init__(self, cdir, spec):
        self.cdir, self.spec = cdir, spec
        self.pairs_dir = cdir / "pairs"
        self.pairs_dir.mkdir(parents=True, exist_ok=True)
        self.current, self.staged = None, {}

    def ready(self):
        if guard.foreign_job():
            raise SystemExit(f"runner: busy — foreign job on the engine: {guard.foreign_job()}")
        guard.require(ram_gb=0, free=["ollama"], verbose=False)
        # A warm engine is kept, not recycled: the H3 first-load costs ~70 min
        # on this box (measured 2026-09-03), so a resumed fill pass must reuse
        # it. The engine-switch and headroom recycles below still fire.
        if not guard.comfy_process_ids() and not guard.start_comfy():
            raise SystemExit("ComfyUI is not running and could not be started")

    def workflow(self, p, arm):
        a = p[arm]
        if engine_of(p, arm) == "wan":
            return wan_workflow(a["prompt"], p["seed"], W, H, LEN + 48,  # 121: wan's own sweet spot
                                steps=20, prefix=f"dojo-{self.cdir.name}")
        ref = a["ref"]
        if ref not in self.staged:
            src = Path(ref)
            if not src.is_absolute():
                src = ROOT / ref
            self.staged[ref] = stage_reference(src)
        motion.SEED = p["seed"]  # motion._tail reads the module global
        return motion.ref2va_workflow(a["prompt"], self.staged[ref], W, H, LEN, steps=4, prefix=f"dojo-{self.cdir.name}")

    def render(self, p, arm):
        engine = engine_of(p, arm)
        if self.current is not None and engine != self.current:
            guard.recycle_comfy(f"engine switch {self.current} -> {engine}")
        self.current = engine
        if not guard.headroom_ok():
            guard.recycle_comfy("headroom")
        # H3's first-load pays ~70 min once; warm clips are minutes.
        vid = generate_video(self.workflow(p, arm), timeout=5400 if engine != "wan" else 1800)
        out = self.pairs_dir / f"{p['id']}--{arm}{Path(vid).suffix}"
        shutil.copy2(vid, out)
        out.with_suffix(".json").write_text(json.dumps(
            {"id": p["id"], "arm": arm, "engine": engine, "seed": p["seed"],
             "prompt": p[arm]["prompt"], "ref": p[arm].get("ref")}, indent=2, ensure_ascii=False), encoding="utf-8")
        posters(out, self.pairs_dir, f"{p['id']}--{arm}")
        return {"file": f"pairs/{out.name}", "engine": engine}

    def after_failure(self):
        self.current = None
        return guard.recycle_comfy("after failure")

    def close(self):
        pass


ready_readback = dojo_video.ready_readback


def readback(pairs_dir, p, arm, model):
    """dojo_video's triptych over whichever clip this arm rendered (.webm or .mp4).
    v1 cached an all-error triptych here; it is not a readback (dojo_video says why)."""
    return dojo_video.readback(pairs_dir, p, arm, model, video=rendered(pairs_dir, p, arm))


def main():
    import dojo_run
    raise SystemExit(dojo_run.main(sys.argv[1:]))


if __name__ == "__main__":
    main()
