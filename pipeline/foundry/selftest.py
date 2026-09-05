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

WHAT IT MAY CONTAIN. Only cases that need no GPU, no ComfyUI, no Ollama and no
network: the vendor calls are faked at the seam, so what is under test is this
directory's own control flow. A case that needs a card belongs in a plan, not
here.

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


TESTS = [
    test_ungradable_candidate_does_not_kill_the_run,
    test_scoreless_source_annotation_does_not_kill_the_run,
    test_resume_regrades_an_unmeasured_candidate,
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
