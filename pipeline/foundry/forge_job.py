"""The forge as a kernel job: its plan, and the session that performs one step.

    from forge_job import plan, open_session     # worker.py is the only caller

forge.py was its own driver: three stage loops, a manifest rewritten after every
unit, `--resume` adopting what a dead run left on disk. Since Phase 4 (L34) the
DRIVER is a kernel job on gpu.local (worker.py over packages/kernel/py/job.py),
and what forge.py knew moves here or stays:

  KEPT, HERE: the step order - every annotation, then every generation, then
    every grade, because "every stage loads its engine ONCE" (one 24 GB card,
    two engines, the turn explicit); the resume rule as the plan - a PNG on disk
    is a finished generation whatever the manifest says (adopt_plate), and an
    `unmeasured` candidate is graded again; the recycle interval and the
    headroom recycle; a failed plate recycles ComfyUI, and a recycle that fails
    abandons the rest of the generations and grades what exists (`incomplete`).
  KEPT, IN forge.py: each unit (annotate_scene, generate_candidate,
    grade_candidate), run.json as the artefact store v1's readers read.
  UPGRADED: the card. v1's forge took no GPU lease at all - the one tenant the
    others could not see (scout §FORGE). The job's slot on gpu.local#1 IS the
    lease now, and `hold_for_job` names the forge as the card's tenant under the
    job's fence, so guard's recycle is the holder's own and nobody else's.
    A crash: v1 left a live status with no pid behind it; the job is now named
    `interrupted` by whoever looks next (gpu.local is a free lane: no hold), and
    a retry resumes from the booked steps - a booked plate is never generated
    again (its step is booked AND its PNG is on disk: either one keeps it out).

THE PLAN IS PURE AND SHARED. `plan(view, booked, attempt, ...)` is a function
of a literal view of run.json, and packages/producers/src/forge/plan.ts is the
same function for the receipt; plan-cases.json beside that file holds both to
the same answers (tests/next-server/producer-forge.test.ts runs it in both).

Step names: `annotate:<scene>`, `generate:<candidate>`, `grade:<candidate>:a<n>`.
A grade carries the job's attempt because an `unmeasured` grade is BOOKED (the
pass happened; the annotator failed it) and is still owed a regrade: within an
attempt it is not taken twice, and the next attempt takes it again.
"""
import json
import time
from pathlib import Path

import forge

GRADABLE = ("generated", "unmeasured")
UNMADE = ("pending", "failed")


# ── the plan (pure; plan.ts is its twin) ────────────────────────────────────

def view_of(manifest, run_dir):
    """The literal facts the plan reads: which scenes are annotated, each
    candidate's status and whether its PNG is on disk."""
    return {
        "scenes": [{"id": s["id"], "annotated": bool(s.get("annotation"))} for s in manifest["scenes"]],
        "candidates": [{"id": c["id"], "scene": c["scene"], "status": c["status"],
                        "plate": (Path(run_dir) / c["file"]).exists()} for c in manifest["candidates"]],
    }


def plan(view, booked, attempt, skip_grade=False, abandoned=False):
    """The missing steps, in the order the engines take them.

    `abandoned`: ComfyUI could not be recycled after a failure this drive, so no
    generation is planned again in it (v1's `break`); the grades still are."""
    annotated = {s["id"] for s in view["scenes"] if s["annotated"]}
    steps = [f"annotate:{s['id']}" for s in view["scenes"] if not s["annotated"]]
    if not abandoned:
        steps += [f"generate:{c['id']}" for c in view["candidates"]
                  if not c["plate"] and c["status"] in UNMADE and c["scene"] in annotated]
    if not skip_grade:
        steps += [f"grade:{c['id']}:a{attempt}" for c in view["candidates"]
                  if c["status"] in GRADABLE or (c["plate"] and c["status"] in UNMADE)]
    return [s for s in steps if s not in booked]


def candidate_of(step):
    """`generate:<id>` / `grade:<id>:a<n>` -> the candidate id."""
    kind, _, rest = step.partition(":")
    return rest.rsplit(":a", 1)[0] if kind == "grade" else rest


# ── the session: one drive of one job ───────────────────────────────────────

class ForgeSession:
    """Performs a forge job's steps against its run.json. Built per drive: the
    engine on the card, the staged references and the recycle count are this
    process's, never the record's."""

    producer = "forge"

    def __init__(self, job, run, dry, gpu):
        self.job, self.run, self.dry, self.gpu = job, run, dry, gpu
        rid = job["of"]["id"]  # the Run a forge job serves: `forge:<run-id>` (plan.ts forgeRunOf)
        self.run_id = rid.split(":", 1)[1] if rid.startswith("forge:") else rid
        self.run_dir = forge.runs_root() / self.run_id
        path = self.run_dir / "run.json"
        if not path.exists():
            raise LookupError(f"forge run {self.run_id} has no run.json under {forge.runs_root()}")
        self.m = json.loads(path.read_text(encoding="utf-8"))
        opts = self.m.get("forge") or {}
        self.model = opts.get("annotator", forge.ANNOTATOR)
        self.recycle_every = int(opts.get("recycle_every", 6))
        self.skip_grade = bool(opts.get("skip_grade", False))
        self.attempt = int(job.get("attempt", 1))
        self.engine, self.hold, self.staged, self.since, self.abandoned = None, None, {}, 0, False
        self.m["job"] = job["id"]
        if dry:
            self.m["dry"] = True
        self.m.pop("error", None)
        forge.adopt_plates(self.m, self.run_dir)
        forge.log(self.m, self.run_dir, f"job {job['id']} attempt {self.attempt} ({'dry' if dry else 'live'})")

    def plan(self, booked):
        return plan(view_of(self.m, self.run_dir), booked, self.attempt, self.skip_grade, self.abandoned)

    # The engine turn: the job holds the card already; `hold_for_job` names what it
    # holds it FOR, so guard.recycle_comfy recycles only under a comfy holding.
    def turn(self, engine):
        if self.engine == engine:
            return
        if not self.dry:
            if self.hold is not None:
                self.hold.release()  # gives nothing back: the job's slot is the lease
            self.hold = self.gpu.hold_for_job(self.run, "foundry/forge", engine, 16 if engine == "comfy" else 20,
                                              job_prefix=f"foundry-{self.run_id}")
            g = forge.guard
            if engine == "comfy":
                g.require(ram_gb=0, free=["ollama"], verbose=False)
                if g.comfy_process_ids():
                    g.recycle_comfy("fresh engine for the forge")
                elif not g.start_comfy():
                    raise SystemExit("ComfyUI is not running and could not be started")
                g.require(vram_gb=16, ram_gb=g.RAM_FLOOR_GB, verbose=False)
                self.since = 0
            else:
                g.require_model(self.model, vram_gb=20, ram_gb=g.RAM_FLOOR_GB, free=["comfy"], verbose=False)
        self.engine = engine

    def stage(self, name):
        if self.m.get("status") != name:
            forge.set_stage(self.m, self.run_dir, name)

    def perform(self, step):
        """One step -> ("produced", output) | ("vendor-failure", message) | ("fatal", code, message)."""
        kind = step.split(":", 1)[0]
        try:
            if kind == "annotate":
                return self._annotate(step.split(":", 1)[1])
            if kind == "generate":
                return self._generate(candidate_of(step))
            if kind == "grade":
                return self._grade(candidate_of(step))
        except SystemExit as e:
            # v1's refusals (a frame not found, ComfyUI that will not start) end the job with their sentence.
            return ("fatal", "unavailable", str(e.code))
        return ("fatal", "internal", f"forge has no step kind {kind!r} ({step})")

    def _annotate(self, scene_id):
        self.stage("annotating")
        s = next(x for x in self.m["scenes"] if x["id"] == scene_id)
        try:
            out = forge.annotate_scene(self.m, self.run_dir, s, self.model, dry=self.dry, ready=lambda: self.turn("ollama"))
        except SystemExit:
            raise
        except Exception as e:  # noqa: BLE001 - the annotator's failure is a vendor failure, counted by the breaker
            forge.log(self.m, self.run_dir, f"  {scene_id}: annotation FAILED: {str(e)[:120]}")
            return ("vendor-failure", f"annotate {scene_id}: {str(e)[:200]}")
        return ("produced", out)

    def _generate(self, cid):
        self.stage("generating")
        c = next(x for x in self.m["candidates"] if x["id"] == cid)
        self.turn("comfy")
        g = forge.guard
        if not self.dry and (self.since >= self.recycle_every or not g.headroom_ok()):
            g.recycle_comfy("interval" if self.since >= self.recycle_every else "headroom")
            self.since = 0
        t0 = time.time()
        try:
            forge.generate_candidate(self.m, self.run_dir, c, self.staged, dry=self.dry)
        except Exception as e:  # noqa: BLE001 - v1: the plate failed, the run goes on
            c["status"], c["error"] = "failed", str(e)[:200]
            forge.log(self.m, self.run_dir, f"  {cid} FAILED: {str(e)[:80]}")
            if not self.dry and not g.recycle_comfy("after failure"):
                self.abandoned = True
                forge.log(self.m, self.run_dir, "  ComfyUI could not be recycled: the rest of the plates are abandoned this drive")
            self.since = 0
            return ("vendor-failure", f"generate {cid}: {str(e)[:200]}")
        self.since += 1
        forge.log(self.m, self.run_dir, f"  {cid} -> {time.time()-t0:.0f}s{' (dry)' if self.dry else ''}")
        out = {"candidate": cid, "file": c["file"], "seconds": c["timings"]["generate_s"]}
        if self.dry:
            out["dry"] = True
        return ("produced", out)

    def _grade(self, cid):
        self.stage("grading")
        c = next(x for x in self.m["candidates"] if x["id"] == cid)
        if c["status"] in UNMADE:  # a plate adopted from disk (adopt_plates ran at open; a drive may outlive it)
            forge.adopt_plates(self.m, self.run_dir)
        self.turn("ollama")
        forge.grade_candidate(self.m, self.run_dir, c, self.model, dry=self.dry)
        g = c["grade"]
        return ("produced", {"candidate": cid, "status": c["status"], "grader": g["grader"],
                             "grader_digest": g["grader_digest"],
                             "craft": g["craft"]["score"] if g["craft"] else None,
                             "style": g["style"]["score"] if g["style"] else None})

    def finish(self):
        """The drive reached the end of its plan: (None) done, or (code, sentence) to fail with."""
        forge.unstage(self.staged)
        status = forge.finish(self.m, self.run_dir)
        if status == "done":
            return None
        left = sum(1 for c in self.m["candidates"] if c["status"] in UNMADE)
        return ("unavailable", f"forge run {self.run_id} is incomplete: {left} of {len(self.m['candidates'])} "
                               f"candidate(s) never produced. Retry the job to take them again; booked plates are kept.")

    def failed(self, message):
        """The job failed: run.json says so, in v1's words (`status: failed`, `error`)."""
        forge.unstage(self.staged)
        self.m["status"] = "failed"
        self.m["error"] = message[:300]
        forge.save(self.run_dir, self.m)

    def close(self):
        if self.hold is not None:
            self.hold.release()
            self.hold = None


def open_session(job, run, dry, gpu):
    return ForgeSession(job, run, dry, gpu)
