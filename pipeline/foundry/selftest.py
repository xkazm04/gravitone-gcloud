"""The foundry pipeline's own gate: the failure paths, exercised without a GPU.

    python selftest.py

WHY THIS EXISTS. Everything in this directory runs for hours on one card and
then writes a verdict, so its failure paths are the expensive ones -- and they
are precisely the paths a human never sees while things are going well. Before
this file, nothing in the repository executed a single line of Python: the CI
gate (.github/workflows/gates.yml) installs Node and nothing else, and both test
lanes (`npm test`, `npm run test:live`) are TypeScript. The first case below is
why that mattered: the README's "a candidate that could not be graded is
`unmeasured`, counted separately, and never a pass" was false, and the statement
that broke it sat directly under the code that had just made it true.

WHAT IT MAY CONTAIN. Only cases that need no GPU, no ComfyUI, no Ollama, no
network AND NO THIRD-PARTY PACKAGE: the vendor calls are faked at the seam, so
what is under test is this directory's own control flow. Verified stdlib-only
by running it with PIL, numpy, requests, httpx, cv2 and torch blocked at import
-- 5 cases green -- which is what would let a CI job run it with no pip step
and still block. Pillow and numpy are imported INSIDE crop_letterbox and
publish, so keep out of cases that call those; a case that needs a card belongs
in a plan, not here.

WHAT IT IS NOT. It is a courtesy, not yet a gate -- nothing invokes it. Running
it is one command and it takes under a second; run it after touching anything
in this directory.
"""

import importlib.util
import io
import json
import contextlib
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))

FAILURES = []


def check(name, got, want):
    ok = got == want
    print(f"  {'ok  ' if ok else 'FAIL'}  {name}: got {got!r}, want {want!r}")
    if not ok:
        FAILURES.append(name)


def load(mod):
    spec = importlib.util.spec_from_file_location(mod, HERE / f"{mod}.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def candidate(cid, status):
    return {"id": cid, "scene": "s1", "style": "st", "mechanism": "text", "seed": 1,
            "file": f"candidates/{cid}.png", "sidecar": f"candidates/{cid}.json",
            "status": status, "grade": None, "error": None}


def manifest_with(*cands, annotation=None):
    return {"id": "selftest",
            "plan": {"mechanisms": [{"id": "text"}], "styles": ["st"], "scenes": [{"id": "s1"}]},
            "styles": {"st": {"observables": {"render_mode": "photoreal"}}},
            "scenes": [{"id": "s1", "annotation": annotation if annotation is not None
                        else {"shot_size": "full shot"}}],
            "candidates": list(cands), "log": [], "status": "", "progress": {}}


def staged_run(manifest):
    """A run directory with every candidate's PNG already on disk -- the state
    `--resume` finds after a kill."""
    run_dir = Path(tempfile.mkdtemp())
    (run_dir / "candidates").mkdir(parents=True)
    for c in manifest["candidates"]:
        (run_dir / c["file"]).write_bytes(b"\x89PNG selftest")
    return run_dir


def fake_graders(F, craft=None, style=True):
    """Stand in for the two vendor calls stage_grade makes. `craft=None` means
    the craft pass raises, which is the `unmeasured` path the docstring
    promises is survivable."""
    F.guard.require_model = lambda *a, **k: None
    if craft is None:
        def boom(*a, **k):
            raise RuntimeError("ollama said no")
        F.run_ollama = boom
    else:
        F.run_ollama = lambda model, b64, mime: (json.dumps(craft), None)
    if style:
        F.grade.run_style_readback = lambda model, b64: json.dumps(
            {"has_text": False, "render_mode": "photoreal", "palette_strategy": "warm",
             "edge_treatment": "soft", "black_handling": "lifted"})
    else:
        def sboom(*a, **k):
            raise RuntimeError("ollama said no")
        F.grade.run_style_readback = sboom


# ── forge: grading ──────────────────────────────────────────────────────────

def test_ungradable_candidate_does_not_kill_the_run():
    """README: "a candidate that could not be graded is `unmeasured`, counted
    separately, and never a pass". The status is set correctly and then the
    progress line formats the absent score -- so the whole run dies one
    statement after surviving the thing it was built to survive."""
    F = load("forge")
    m = manifest_with(candidate("ungradable", "generated"))
    run_dir = staged_run(m)
    fake_graders(F, craft=None, style=False)
    try:
        F.stage_grade(m, run_dir, "fake")
        outcome = "survived"
    except Exception as e:
        outcome = f"{type(e).__name__}"
    check("an ungradable candidate does not abort the run", outcome, "survived")
    check("...and is recorded as unmeasured", m["candidates"][0]["status"], "unmeasured")


def test_scoreless_source_annotation_does_not_kill_the_run():
    """The same crash by the other door: craft_score returns None when the
    SOURCE annotation carries no scoreable field, with no exception anywhere."""
    F = load("forge")
    m = manifest_with(candidate("scoreless", "generated"), annotation={})
    run_dir = staged_run(m)
    fake_graders(F, craft={"shot_size": "full shot"})
    try:
        F.stage_grade(m, run_dir, "fake")
        outcome = "survived"
    except Exception as e:
        outcome = f"{type(e).__name__}"
    check("a source with no scoreable craft field does not abort the run", outcome, "survived")


def test_resume_regrades_an_unmeasured_candidate():
    """README: "Resumable by construction. A PNG on disk is a finished
    generation whatever the manifest says." A candidate whose grade failed
    transiently holds status `unmeasured`, which neither stage's todo filter
    admits -- so the plate is on disk, paid for, and can never be graded."""
    F = load("forge")
    m = manifest_with(candidate("ok-one", "generated"), candidate("flaky", "unmeasured"))
    run_dir = staged_run(m)
    F.stage_generate(m, run_dir, recycle_every=6)
    fake_graders(F, craft={"shot_size": "full shot"})
    F.stage_grade(m, run_dir, "fake")
    regraded = sorted(c["id"] for c in m["candidates"] if c["grade"] is not None)
    check("resume re-grades every candidate with a plate on disk",
          regraded, ["flaky", "ok-one"])


def test_a_run_that_gave_up_mid_generation_does_not_report_done():
    """stage_generate `break`s out of the candidate loop when ComfyUI cannot be
    recycled after a failure, leaving the rest of the plan `pending` -- and
    main() then wrote `status: "done"` unconditionally. The one field
    lib/foundry/store.ts reads as a lifecycle state said the run finished; the
    shortfall was derivable only from a candidate count that does not add up
    and a log the operator has to open. A run that abandoned candidates must
    not read as a finished run."""
    F = load("forge")
    m = manifest_with(candidate("first", "pending"), candidate("abandoned", "pending"))
    m["styles"]["st"]["recipe"] = "a recipe"
    run_dir = Path(tempfile.mkdtemp())
    (run_dir / "candidates").mkdir(parents=True)
    # The seams stage_generate reaches for: no card, no ComfyUI, and a recycle
    # that refuses exactly the way the finding describes.
    F.guard.require = lambda *a, **k: None
    F.guard.comfy_process_ids = lambda: [1]
    F.guard.headroom_ok = lambda: True
    F.guard.recycle_comfy = lambda why: why != "after failure"

    def boom(wf):
        raise RuntimeError("ComfyUI died")

    F.generate = boom
    with contextlib.redirect_stdout(io.StringIO()):
        F.stage_generate(m, run_dir, recycle_every=6)
    left = [c["id"] for c in m["candidates"] if c["status"] in ("pending", "failed")]
    check("the run abandons the candidates it never reached", left, ["first", "abandoned"])
    try:
        status = F.final_status(m)
    except AttributeError:
        # Arm A: main() has no such decision -- it assigns "done" outright.
        status = "done"
    check("a run that gave up mid-generation does not report done", status, "incomplete")


# ── acquire: the readback catalogue ─────────────────────────────────────────

def readback_row(source, **over):
    parsed = {"render_mode": "photoreal", "palette_strategy": "warm-cool split",
              "edge_treatment": "soft", "black_handling": "lifted",
              "signature": "a signature", "imitable_recipe": "do the thing"}
    parsed.update(over.pop("parsed", {}))
    return dict({"source": source, "model": "gemini-3.7-flash", "ok": True,
                 "parsed": parsed}, **over)


def test_list_survives_a_row_from_another_schema():
    """style.jsonl is append-only across model and schema versions, and
    `readbacks()` already filters for heterogeneity (`ok`, `parsed` is a dict).
    `--list` then indexes three keys raw, so ONE old row hides every row after
    it -- and the operator's next step is to name a source from that listing."""
    A = load("acquire")
    tmp = Path(tempfile.mkdtemp())
    rb = tmp / "style.jsonl"
    rows = [readback_row("good-a"),
            {"source": "older-b", "model": "gemini-3.7-flash", "ok": True,
             "parsed": {"render_mode": "painterly", "signature": "from an older schema"}},
            readback_row("good-c")]
    rb.write_text("\n".join(json.dumps(r) for r in rows) + "\n", encoding="utf-8")
    A.READBACKS = rb
    argv, sys.argv = sys.argv, ["acquire.py", "--list"]
    buf = io.StringIO()
    try:
        with contextlib.redirect_stdout(buf):
            A.main()
    except Exception:
        pass
    finally:
        sys.argv = argv
    check("--list prints every readback row", len(buf.getvalue().strip().splitlines()), 3)


# ── intake: the paid readback ───────────────────────────────────────────────

def test_an_unparseable_readback_is_kept_on_disk():
    """The readback is a paid vendor call over N frames. When the answer does
    not parse -- a truncation at the token ceiling is the ordinary way -- the
    bytes are the only record of what was bought, and losing them means paying
    again to find out what happened."""
    I = load("intake")
    tmp = Path(tempfile.mkdtemp())
    I.STYLE_OUT = tmp / "style.jsonl"
    frames = [tmp / "f-001.jpg"]
    frames[0].write_bytes(b"not really a jpeg")
    I.style_mod.run_ollama_multi = lambda model, b64s: '{"signature": "cut off mid-'
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            I.readback(frames, "src", "qwen3.8:27b")
    except BaseException:  # sys.exit is the designed outcome here
        pass
    rows = ([json.loads(l) for l in I.STYLE_OUT.read_text(encoding="utf-8").splitlines() if l.strip()]
            if I.STYLE_OUT.exists() else [])
    check("a failed readback leaves the raw answer on disk", len(rows), 1)
    if rows:
        check("...marked not ok", rows[0].get("ok"), False)
        check("...carrying the bytes that were paid for",
              rows[0].get("raw", "").startswith('{"signature"'), True)


def test_frozen_is_a_number_not_a_poster_impression():
    """The 2026-08-31 v1-reset-still clip obeyed "almost still" and the
    poster-reading judge called it frozen. motion_energy.summarize() is the
    ruler that tells those apart; this pins its three verdicts."""
    M = load("motion_energy")
    check("a looped still measures frozen", M.summarize([0.0] * 118)["frozen"], True)
    near = M.summarize([0.21] * 118)
    check("a directed near-still clip is NOT frozen", near["frozen"], False)
    check("...and carries the number the judge did not have", round(near["mean"], 3), 0.21)
    check("an unreadable clip is unmeasured, never frozen", M.summarize([])["frozen"], None)


TESTS = [
    test_frozen_is_a_number_not_a_poster_impression,
    test_ungradable_candidate_does_not_kill_the_run,
    test_scoreless_source_annotation_does_not_kill_the_run,
    test_resume_regrades_an_unmeasured_candidate,
    test_a_run_that_gave_up_mid_generation_does_not_report_done,
    test_list_survives_a_row_from_another_schema,
    test_an_unparseable_readback_is_kept_on_disk,
]


def main():
    for t in TESTS:
        print(f"{t.__name__}")
        t()
    print()
    if FAILURES:
        sys.exit(f"selftest: {len(FAILURES)} failing check(s): {', '.join(FAILURES)}")
    print(f"selftest: {len(TESTS)} cases green")


if __name__ == "__main__":
    main()
