"""A Dojo cycle's LOCAL stack as a kernel job: its plan, and the session that performs one unit.

    from dojo_job import runner_of, plan, open_session     # dojo_run.py, worker.py

v1 had three runners (dojo_pairs.py, dojo_video.py, dojo_video_h3.py), each its
own driver: a render loop, then a readback loop, resumable because a file on
disk is a finished render and a key in readbacks.json a finished readback. The
wrapper (dojo_run.py) picked one by the cycle's declared stack and media and
refused a spec that named neither stack - "the wrapper never guesses which bill
it is running up". Since Phase 4 (L34) the driver is a kernel job on gpu.local
(worker.py), and:

  KEPT, HERE: stack purity (`runner_of`: an unknown stack refuses, a google spec
    is never run on the card); the engine turn - every render, then every
    readback, so ComfyUI and the annotator each load once; the resume rule as
    the plan; the runner's own render order (the serial-lane runner's wan-first).
  KEPT, IN THE RUNNERS: each unit (`RenderPass.render`, `readback`), the files
    they write, readbacks.json as the artefact store v1's readers read.
  UPGRADED: the card - dojo_pairs.py and dojo_video_h3.py took no lease (only
    dojo_video.py did, around each phase); the job's slot is the lease now for
    all three, named through `hold_for_job`. A readback that read nothing is
    never cached (v1's dojo_pairs and h3 cached an all-error entry, which the
    resume guard then took for done - dojo_video.py's 2026-09-20 lesson). And a
    cycle that ended with units unrendered or unread is a FAILED job naming how
    many, not a clean exit that printed "3/4 rendered" (marker-certifies-what-
    was-done): its retry takes exactly the rest.

THE GOOGLE STACK IS NOT HERE. It is paid (Nano Banana pixels, Gemini eyes) and
every paid call is the meter's (decision 7), which this protocol cannot book
(packages/kernel/py/job.py: "Python books no money"). So a google cycle is a
Node job on cloud.google (packages/producers/src/dojo/define.ts, metered through
the imaging router), launched and driven by pipeline/foundry/launch.mts.

Step names: `render:<pair>--<arm>`, `readback:<pair>--<arm>`.
"""
import importlib
import json
import os
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]

LOCAL = {("local", "image"): "dojo_pairs", ("local", "video"): "dojo_video",
         ("local", "video-serial-lanes"): "dojo_video_h3"}
GOOGLE = {("google", "image"): "dojo-pairs-nb (Node, metered)"}
DRY_MODEL = "dry/stand-in"


def training_root():
    """FOUNDRY_TRAINING_DIR (a test's temp universe), else <repo>/<foundry-out|fixtures-out>/training -
    lib/foundry/training/store.ts `outPath("training")`, which the gate surface reads."""
    env = os.environ.get("FOUNDRY_TRAINING_DIR", "").strip()
    if env:
        return Path(env).resolve()
    universe = "fixtures-out" if os.environ.get("NEXT_PUBLIC_GRAVITONE_DATA") == "fixtures" else "foundry-out"
    return ROOT / universe / "training"


def media_of(spec):
    media = spec.get("media", "image")
    if media == "video" and any(a.get("engine") for pr in spec.get("pairs", [])
                                for a in (pr.get("baseline", {}), pr.get("challenger", {}))):
        return "video-serial-lanes"
    return media


def runner_of(spec):
    """(stack, media) for a gen-spec, or SystemExit with the sentence (v1 dojo_run.py's)."""
    stack = spec.get("stack")
    media = media_of(spec)
    if stack not in ("local", "google"):
        raise SystemExit(
            f"gen-spec.json declares stack={stack!r} — a cycle names 'local' or 'google' "
            "explicitly; the wrapper never guesses which bill it is running up.")
    if (stack, media) not in LOCAL and (stack, media) not in GOOGLE:
        raise SystemExit(f"no runner for stack={stack} media={media} — "
                         "google video has no lane; see the overlay's video section.")
    return stack, media


# ── the plan (pure; packages/producers/src/dojo/plan.ts is its twin) ────────

def plan(view, booked, abandoned=False):
    """`view.units` in the runner's render order, each {key, rendered, read}."""
    units = view["units"]
    steps = [] if abandoned else [f"render:{u['key']}" for u in units if not u["rendered"]]
    steps += [f"readback:{u['key']}" for u in units if u["rendered"] and not u["read"]]
    return [s for s in steps if s not in booked]


# ── the dry stand-ins ───────────────────────────────────────────────────────

def dry_render(pairs_dir, key, ext, video, would):
    import forge
    forge.dry_pause()
    out = pairs_dir / f"{key}{ext}"
    out.write_bytes(forge.DRY_PNG)  # a placeholder: no engine ran (sidecar says so)
    out.with_suffix(".json").write_text(json.dumps({"key": key, "dry": True, "would": would}, indent=2), encoding="utf-8")
    if video:
        for tag in ("t0", "t1", "t2"):
            (pairs_dir / f"{key}--{tag}.png").write_bytes(forge.DRY_PNG)
    return {"file": f"pairs/{out.name}", "dry": True}


def dry_readback(video):
    import forge
    forge.dry_pause()
    craft = dict(forge.DRY_ANNOTATION)
    if video:
        return {"t0": {"craft": craft}, "t1": {"craft": craft}, "t2": {"craft": craft}, "dry": True}
    return {"craft": craft, "style": {"has_text": False}, "dry": True}


# ── the session ─────────────────────────────────────────────────────────────

class DojoSession:
    producer = "dojo"

    def __init__(self, job, run, dry, gpu):
        self.job, self.run, self.dry, self.gpu = job, run, dry, gpu
        rid = job["of"]["id"]
        self.cycle_id = rid.split(":", 1)[1] if rid.startswith("dojo:") else rid
        self.cdir = training_root() / self.cycle_id
        spec_path = self.cdir / "gen-spec.json"
        if not spec_path.exists():
            raise LookupError(f"dojo cycle {self.cycle_id} has no gen-spec.json under {training_root()}")
        self.spec = json.loads(spec_path.read_text(encoding="utf-8"))
        try:
            stack, media = runner_of(self.spec)
        except SystemExit as e:
            raise ValueError(str(e.code)) from None
        if stack != "local":
            # Purity: the job was launched on the card; a spec that now says google is not run here.
            raise ValueError(f"dojo cycle {self.cycle_id} declares stack={stack}; a gpu.local job runs only the local stack")
        self.media = media
        self.mod = importlib.import_module(LOCAL[(stack, media)])
        self.video = media != "image"
        self.units = self.mod.order(self.spec)
        self.by_key = {f"{p['id']}--{arm}": (p, arm) for p, arm in self.units}
        self.pairs_dir = self.cdir / "pairs"
        self.pairs_dir.mkdir(parents=True, exist_ok=True)
        self.rb_path = self.cdir / "readbacks.json"
        self.readbacks = json.loads(self.rb_path.read_text(encoding="utf-8")) if self.rb_path.exists() else {}
        self.model = self.spec.get("annotator", "qwen3.8:27b")
        self.engine, self.hold, self.pass_, self.abandoned = None, None, None, False

    def view(self):
        return {"units": [{"key": f"{p['id']}--{arm}", "rendered": self.mod.rendered(self.pairs_dir, p, arm) is not None,
                           "read": f"{p['id']}--{arm}" in self.readbacks} for p, arm in self.units]}

    def plan(self, booked):
        return plan(self.view(), booked, self.abandoned)

    def turn(self, engine):
        if self.engine == engine:
            return
        if self.pass_ is not None:
            self.pass_.close()
            self.pass_ = None
        if not self.dry:
            if self.hold is not None:
                self.hold.release()
            self.hold = self.gpu.hold_for_job(self.run, f"foundry/dojo-{self.media}", engine, 20 if engine == "comfy" else 22,
                                              job_prefix=f"dojo-{self.cycle_id}")
            if engine == "comfy":
                self.pass_ = self.mod.RenderPass(self.cdir, self.spec)
                self.pass_.ready()
            else:
                self.mod.ready_readback(self.model)
        self.engine = engine

    def perform(self, step):
        kind, _, key = step.partition(":")
        unit = self.by_key.get(key)
        if unit is None:
            return ("fatal", "conflict", f"dojo cycle {self.cycle_id} has no unit {key!r} in its gen-spec; it changed under the job")
        p, arm = unit
        try:
            if kind == "render":
                return self._render(p, arm, key)
            if kind == "readback":
                return self._readback(p, arm, key)
        except SystemExit as e:
            return ("fatal", "unavailable", str(e.code))
        return ("fatal", "internal", f"dojo has no step kind {kind!r} ({step})")

    def _render(self, p, arm, key):
        self.turn("comfy")
        if self.dry:
            return ("produced", dry_render(self.pairs_dir, key, self.mod.EXTS[0], self.video,
                                           {"engine": p[arm].get("engine", "comfy"), "seed": p.get("seed"), "prompt": p[arm].get("prompt")}))
        try:
            out = self.pass_.render(p, arm)
        except Exception as e:  # noqa: BLE001 - v1: the clip failed, the pass goes on
            print(f"  {key} FAILED: {str(e)[:90]}", flush=True)
            if not self.pass_.after_failure():
                self.abandoned = True
            return ("vendor-failure", f"render {key}: {str(e)[:200]}")
        return ("produced", dict(out, key=key))

    def _readback(self, p, arm, key):
        self.turn("ollama")
        entry = dry_readback(self.video) if self.dry else self.mod.readback(self.pairs_dir, p, arm, self.model)
        if entry is None:
            return ("vendor-failure", f"readback {key}: the annotator read nothing; not cached, taken again on retry")
        self.readbacks[key] = entry
        self.rb_path.write_text(json.dumps(self.readbacks, indent=1, ensure_ascii=False), encoding="utf-8")
        return ("produced", {"key": key, **({"dry": True} if self.dry else {})})

    def finish(self):
        if self.pass_ is not None:
            self.pass_.close()
            self.pass_ = None
        v = self.view()["units"]
        made = sum(1 for u in v if u["rendered"])
        read = sum(1 for u in v if u["read"])
        print(f"dojo: {self.cycle_id} -- {made}/{len(v)} rendered, {read}/{len(v)} read back", flush=True)
        if made == len(v) and read == len(v):
            return None
        return ("unavailable", f"dojo cycle {self.cycle_id}: {made}/{len(v)} unit(s) rendered, {read}/{len(v)} read back. "
                               "Retry the job to take the rest; what is on disk is kept.")

    def failed(self, message):
        if self.pass_ is not None:
            self.pass_.close()
            self.pass_ = None

    def close(self):
        if self.hold is not None:
            self.hold.release()
            self.hold = None


def open_session(job, run, dry, gpu):
    return DojoSession(job, run, dry, gpu)
