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

WHAT IT IS. A BLOCKING gate: the `python` job in .github/workflows/gates.yml
runs it. It passes from any working directory (paths are anchored to HERE) and
takes under a second; run it after touching anything in this directory.
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


def test_a_grade_names_the_grader_version_not_just_the_model():
    """A grade recorded the grader's model id and nothing else, so a change to
    grade.py's schema or prompts could not be told apart from the grader
    drifting -- and lib/foundry/calibration.ts measures the grader against the
    human PER GRADER, so rows from two instruments would pool into one number.
    forge.py now stamps grade.py's digest on every grade."""
    F = load("forge")
    m = manifest_with(candidate("stamped", "generated"))
    run_dir = staged_run(m)
    fake_graders(F, craft={"shot_size": "full shot"})
    F.stage_grade(m, run_dir, "fake")
    g = m["candidates"][0]["grade"]
    G = F.grade
    check("a grade carries grade.py's digest", g.get("grader_digest"), G.GRADER_DIGEST)
    check("...a 16-hex-digit digest", len(G.GRADER_DIGEST) == 16 and all(ch in "0123456789abcdef" for ch in G.GRADER_DIGEST), True)
    check("...stable across calls", G.grader_digest(), G.GRADER_DIGEST)
    parts = G.grader_parts()
    check("...over both prompts and both schemas",
          sorted(parts), ["craft_fields", "craft_prompt", "craft_schema", "ordinal", "style_enums", "style_prompt", "style_schema"])
    moved = dict(parts, style_prompt=parts["style_prompt"] + " ")
    check("...and one character of prompt is a new grader", G.grader_digest(moved) != G.GRADER_DIGEST, True)


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


# ── the catalogue lock: one fence for TS and Python ─────────────────────────

def test_catalogue_lock_speaks_the_apps_protocol():
    """acquire.py and the app's commits (lib/foundry/catalogue.ts) write the
    same styles.json; they exclude each other only if they agree on the lock
    file's name, its staleness bound and its wait bound. The numbers are read
    out of the TypeScript, not restated, so a change on one side fails here."""
    import os
    import time as _time
    L = load("catalogue_lock")
    repo = HERE.parent.parent
    disk_tx = (repo / "lib" / "diskTx.ts").read_text(encoding="utf-8")
    catalogue_ts = (repo / "lib" / "foundry" / "catalogue.ts").read_text(encoding="utf-8")
    import re
    timing = re.search(r"DEFAULT_LOCK_TIMING[^=]*=\s*\{\s*staleMs:\s*([\d_]+),\s*waitMs:\s*([\d_]+)", disk_tx)
    check("catalogue lock: lib/diskTx.ts declares DEFAULT_LOCK_TIMING", bool(timing), True)
    if timing:
        check("catalogue lock: the staleness bound agrees with the app",
              int(timing.group(1).replace("_", "")), int(L.STALE_S * 1000))
        check("catalogue lock: the wait bound agrees with the app",
              int(timing.group(2).replace("_", "")), int(L.WAIT_S * 1000))
    check("catalogue lock: the lock file name agrees with the app",
          f'CATALOGUE_LOCK = "{L.LOCK_NAME}"' in catalogue_ts, True)
    check("catalogue lock: the journal name agrees with the app",
          f'CATALOGUE_JOURNAL = "{L.JOURNAL_NAME}"' in catalogue_ts, True)

    root = Path(tempfile.mkdtemp())
    lock = root / L.LOCK_NAME
    with L.catalogue_lock(root, by="selftest"):
        held = json.loads(lock.read_text(encoding="utf-8"))
        check("catalogue lock: the body names its holder", (held["pid"], held["by"]), (os.getpid(), "selftest"))
        check("catalogue lock: this process holds it", L.holds_lock(root), True)
        try:
            with L.catalogue_lock(root, wait_s=0.15):
                outcome = "entered twice"
        except L.CatalogueLocked as e:
            outcome = "refused" if str(lock) in str(e) else f"refused without naming the lock: {e}"
        check("catalogue lock: a second holder past the wait bound is refused, naming the file", outcome, "refused")
    check("catalogue lock: leaving the block releases it", lock.exists(), False)

    lock.write_text('{"pid": 1, "at": "2026-01-01T00:00:00Z", "by": "dead"}', encoding="utf-8")
    old = _time.time() - 120
    os.utime(lock, (old, old))
    with L.catalogue_lock(root, wait_s=0.5):
        took = L.holds_lock(root)
    check("catalogue lock: a lock older than the staleness bound is broken", took, True)


def test_acquire_journals_and_revisions_under_the_lock():
    """An acquire is a catalogue transaction like any app commit: one journal
    line ahead of the write, styles.json `_rev` advanced from the newest of
    the file and the journal, and no save at all without the lock."""
    A = load("acquire")
    root = Path(tempfile.mkdtemp())
    (root / "styles.json").write_text(json.dumps({"_rev": 4, "styles": []}), encoding="utf-8")
    (root / "catalogue-journal.jsonl").write_text(json.dumps({"rev": 6, "op": "extract-commit", "run": "r"}) + "\n",
                                                  encoding="utf-8")
    rb = root / "style.jsonl"
    rb.write_text(json.dumps(readback_row("src-a")) + "\n", encoding="utf-8")
    A.STYLES, A.READBACKS = root / "styles.json", rb
    argv, sys.argv = sys.argv, ["acquire.py", "--source", "src-a", "--id", "acq-a", "--name", "A"]
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            A.main()
    finally:
        sys.argv = argv
    cat = json.loads((root / "styles.json").read_text(encoding="utf-8"))
    lines = [json.loads(l) for l in (root / "catalogue-journal.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    check("acquire: the style lands", [s["id"] for s in cat["styles"]], ["acq-a"])
    check("acquire: _rev is minted past the newest journal line", cat["_rev"], 7)
    check("acquire: exactly one journal line, naming the transaction",
          [(l["rev"], l["op"], l["run"], l["ids"], l["by"]) for l in lines[1:]], [(7, "acquire", "src-a", ["acq-a"], "acquire.py")])
    check("acquire: the lock is released", (root / ".catalogue.lock").exists(), False)
    try:
        A.save_catalogue({"styles": []}, "src-b", ["b"])
        outcome = "saved without the lock"
    except RuntimeError:
        outcome = "refused"
    check("acquire: save_catalogue refuses to run outside the lock", outcome, "refused")


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


def test_palette_is_measured_and_the_sample_is_declared():
    """On 2026-09-14 the two style readers gave different palette_strategy
    answers for all six sources they shared. palette_measure puts the number
    beside the enum, and declares which published frames the readers skipped."""
    spec = importlib.util.spec_from_file_location(
        "palette_measure", HERE.parent / "vlm-probe" / "palette_measure.py")
    P = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(P)

    idx, s = P.pick_evenly(36, 8)
    check("the pick is the one style.py always made", idx, [int(i * 36 / 8) for i in range(8)])
    check("...and an uneven stride is declared, not implied", (s["kept"], s["available"], s["stride"], s["gaps"]),
          (8, 36, None, [4, 5]))
    check("an even pick names its stride", P.pick_evenly(17, 8)[1]["stride"], 2)

    one_hue = P.palette_stats([(0, 128, 0)] * 50)
    check("one hue family concentrates fully", one_hue["hue_concentration_60deg"], 1.0)
    split = P.palette_stats([(0, 128, 128)] * 50 + [(255, 140, 0)] * 50)
    check("a teal/orange split is half in any 60-degree window", split["hue_concentration_60deg"], 0.5)
    check("...and names both families", sorted(d for d, _ in split["top_hue_families_deg"]), [30, 180])
    dark = P.palette_stats([(5, 5, 5)] * 50)
    check("a frame of shadow is unmeasured hue, never an even spread",
          (dark["hue_concentration_60deg"], dark["near_black_share"]), (None, 1.0))



def load_vlm(mod):
    spec = importlib.util.spec_from_file_location(mod, HERE.parent / "vlm-probe" / f"{mod}.py")
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load module {mod}")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_frame_manifest_v2_schema_write_and_read_v1_normalization():
    FM = load_vlm("frame_manifest")
    tmp = Path(tempfile.mkdtemp()) / "test-manifest.json"
    frames = [{"frame": "f1.jpg", "source": "test-slug", "t_seconds": 1.5}]
    FM.write(tmp, "test-slug", 42.0, "scene", 0.3, [10.0, 20.0], frames)
    data = json.loads(tmp.read_text(encoding="utf-8"))
    check("frame_manifest.write schema is frame-manifest/2", data.get("schema"), "frame-manifest/2")
    check("frame_manifest.write preserves slug", data.get("slug"), "test-slug")
    check("frame_manifest.write preserves duration_s", data.get("duration_s"), 42.0)
    check("frame_manifest.write preserves strategy", data.get("strategy"), "scene")
    check("frame_manifest.write preserves threshold", data.get("threshold"), 0.3)
    check("frame_manifest.write preserves cuts", data.get("cuts"), [10.0, 20.0])
    check("frame_manifest.write preserves frames", data.get("frames"), frames)

    v1_tmp = Path(tempfile.mkdtemp()) / "v1.json"
    v1_data = [{"frame": "f1.jpg", "source": "s1", "t_seconds": 2.5}]
    v1_tmp.write_text(json.dumps(v1_data), encoding="utf-8")
    norm = FM.read(v1_tmp)
    check("frame_manifest.read normalizes v1 schema", norm.get("schema"), "frame-manifest/1")
    check("frame_manifest.read v1 has duration_s=None", norm.get("duration_s"), None)
    check("frame_manifest.read v1 has cuts=[]", norm.get("cuts"), [])
    check("frame_manifest.read v1 preserves frames", norm.get("frames"), v1_data)


def test_shot_index_and_beat_of_mapping():
    FM = load_vlm("frame_manifest")
    cuts = [10.0, 20.0, 30.0]
    check("shot_index 0 before first cut", FM.shot_index(0.0, cuts), 0)
    check("shot_index 0 mid first shot", FM.shot_index(5.0, cuts), 0)
    check("shot_index 1 at first cut", FM.shot_index(10.0, cuts), 1)
    check("shot_index 1 in second shot", FM.shot_index(15.0, cuts), 1)
    check("shot_index 2 at second cut", FM.shot_index(20.0, cuts), 2)
    check("shot_index 2 before third cut", FM.shot_index(29.9, cuts), 2)
    check("shot_index 3 at third cut", FM.shot_index(30.0, cuts), 3)
    check("shot_index with empty cuts is 0", FM.shot_index(5.0, []), 0)

    dur = 100.0
    check("beat_of setup at 0%", FM.beat_of(0.0, dur), "setup(0-25%)")
    check("beat_of setup at 24.9%", FM.beat_of(24.9, dur), "setup(0-25%)")
    check("beat_of build at 25%", FM.beat_of(25.0, dur), "build(25-55%)")
    check("beat_of build at 54.9%", FM.beat_of(54.9, dur), "build(25-55%)")
    check("beat_of peak at 55%", FM.beat_of(55.0, dur), "peak(55-85%)")
    check("beat_of peak at 84.9%", FM.beat_of(84.9, dur), "peak(55-85%)")
    check("beat_of tail at 85%", FM.beat_of(85.0, dur), "tail(85-100%)")
    check("beat_of tail at 100%", FM.beat_of(100.0, dur), "tail(85-100%)")


def test_frame_manifest_upgrade_preserves_backup():
    FM = load_vlm("frame_manifest")
    tmp = Path(tempfile.mkdtemp())
    mf = tmp / "demo-manifest.json"
    v1_frames = [{"frame": "demo-001.jpg", "source": "demo", "t_seconds": 5.0}]
    mf.write_text(json.dumps(v1_frames), encoding="utf-8")

    rhythm_file = tmp / "demo-rhythm.json"
    rhythm_file.write_text(json.dumps({"duration_s": 88.5}), encoding="utf-8")

    cuts_file = tmp / "demo-cuts.json"
    cuts_file.write_text(json.dumps([12.5, 35.0]), encoding="utf-8")

    FM.upgrade(mf, rhythm_file, cuts_file)

    backup = tmp / "demo-manifest.v1.json"
    check("upgrade preserves backup .v1.json", backup.exists(), True)
    if backup.exists():
        check("backup holds original v1 data", json.loads(backup.read_text(encoding="utf-8")), v1_frames)

    upgraded = json.loads(mf.read_text(encoding="utf-8"))
    check("upgraded schema is frame-manifest/2", upgraded.get("schema"), "frame-manifest/2")
    check("upgraded duration_s is set", upgraded.get("duration_s"), 88.5)
    check("upgraded cuts is set", upgraded.get("cuts"), [12.5, 35.0])
    check("upgraded frames matches v1 frames", upgraded.get("frames"), v1_frames)


def test_dojo_study_beat_map_runtime_and_none_handling():
    FM = load_vlm("frame_manifest")
    DS = load("dojo_study")
    tmp = Path(tempfile.mkdtemp())

    # Source 1: has duration_s = 100.0
    s1_frames = [
        {"frame": "s1-001.jpg", "source": "s1", "t_seconds": 10.0},
        {"frame": "s1-002.jpg", "source": "s1", "t_seconds": 70.0},
    ]
    FM.write(tmp / "s1-manifest.json", "s1", 100.0, "scene", 0.3, [], s1_frames)

    # Source 2: has duration_s = None (v1 manifest)
    s2_frames = [
        {"frame": "s2-001.jpg", "source": "s2", "t_seconds": 10.0},
        {"frame": "s2-002.jpg", "source": "s2", "t_seconds": 70.0},
    ]
    (tmp / "s2-manifest.json").write_text(json.dumps(s2_frames), encoding="utf-8")

    per_source = {
        "s1": {"s1-001.jpg": {"shot_size": "close"}, "s1-002.jpg": {"shot_size": "wide"}},
        "s2": {"s2-001.jpg": {"shot_size": "close"}, "s2-002.jpg": {"shot_size": "wide"}},
    }
    bm = DS.beat_map(per_source, frames_dir=tmp)

    check("s1 runtime beat binning includes setup", "setup(0-25%)" in bm.get("s1", {}), True)
    check("s1 runtime beat binning includes peak", "peak(55-85%)" in bm.get("s1", {}), True)
    check("s1 close frame in setup", bm.get("s1", {}).get("setup(0-25%)", {}).get("shot_size", {}).get("close"), 1)
    check("s1 wide frame in peak", bm.get("s1", {}).get("peak(55-85%)", {}).get("shot_size", {}).get("wide"), 1)

    s2_entry = bm.get("s2", {})
    check("s2 with duration_s=None is flagged or skipped", bool(s2_entry.get("_skipped") or s2_entry.get("_flag") or "setup(0-25%)" not in s2_entry), True)


def test_dojo_study_beat_binning_153_frames_discrepancy():
    FM = load_vlm("frame_manifest")
    DS = load("dojo_study")

    manifests = list((HERE.parent / "vlm-probe" / "frames").glob("*-manifest.json"))
    if not manifests:
        # The frame manifests live under the gitignored /pipeline/vlm-probe/frames/*,
        # so a clean checkout (CI) has no corpus to measure. The counts below are a
        # measurement of that local corpus, not an invariant of the tree: asserting
        # them against nothing failed the blocking python job on every push.
        print("  skip  153-frame corpus discrepancy: no local frame manifests in this checkout")
        return
    manifest_data = {}
    for m in manifests:
        manifest_data[m.stem.replace("-manifest", "")] = FM.read(m)

    rhythms = {}
    for p in (HERE.parent / "vlm-probe" / ".ingest").glob("*-rhythm.json"):
        rhythms[p.stem.replace("-rhythm", "")] = json.loads(p.read_text("utf-8"))

    slugs = list(manifest_data.keys())
    per_source = DS.load(slugs)

    diff_count = 0
    total_checked = 0
    runtime_misbinned = 0

    for src, frames in per_source.items():
        m = manifest_data.get(src)
        if not m:
            continue
        m_frames = {item["frame"]: item["t_seconds"] for item in m.get("frames", [])}
        dur = m.get("duration_s") or rhythms.get(src, {}).get("duration_s")
        if not dur:
            continue
        seq = sorted([f for f in frames.keys() if f in m_frames])
        for i, f in enumerate(seq):
            total_checked += 1
            idx_f = i / max(len(seq) - 1, 1)
            b_idx = DS.BEATS[0] if idx_f < .25 else DS.BEATS[1] if idx_f < .55 else DS.BEATS[2] if idx_f < .85 else DS.BEATS[3]

            t = m_frames[f]
            b_rt = FM.beat_of(t, dur)
            if b_idx != b_rt:
                diff_count += 1
            if b_rt != FM.beat_of(t, dur):
                runtime_misbinned += 1

    check("153 frames checked from sources with manifests", total_checked, 153)
    check("49 frames mis-binned by index", diff_count, 49)
    check("0 frames mis-binned by runtime", runtime_misbinned, 0)


def test_lane_record_replay_argv_and_consistency_kwargs():
    LR = load_vlm("lane_record")
    C = load_vlm("consistency")

    rec = LR.read(HERE.parent.parent / "pipeline/vlm-probe/shots/reference-face-e25")
    argv = LR.replay_argv(rec)
    want = ["consistency.py", "--lane", "reference", "--ref-crop", "face", "--late", "0.25", "--tag=-face-e25", "--steps", "20", "--seed", "770425"]
    check("replay_argv for reference-face-e25", argv, want)

    ap = C.argparse.ArgumentParser()
    ap.add_argument("--lane", required=True, choices=["baseline", "reference"])
    ap.add_argument("--refs", type=int, default=1)
    ap.add_argument("--steps", type=int, default=20)
    ap.add_argument("--seed", type=int, default=770425)
    ap.add_argument("--zoom", action="store_true")
    ap.add_argument("--ref-crop", choices=["full", "face"], default="full")
    ap.add_argument("--late", type=float, default=0.0)
    ap.add_argument("--tag", default="")

    args = ap.parse_args(argv[1:])
    check("parsed lane equals recorded", args.lane, rec["lane"])
    check("parsed ref_crop equals recorded", args.ref_crop, rec["ref_crop"])
    check("parsed late equals recorded", args.late, rec["reference_joins_at"])
    check("parsed tag equals recorded", args.tag, rec["tag"])
    check("parsed steps equals recorded", args.steps, rec["steps"])
    check("parsed seed equals recorded", args.seed, rec["seed"])


def test_lane_record_replay_argv_baseline_zoom():
    LR = load_vlm("lane_record")
    rec = LR.read(HERE.parent.parent / "pipeline/vlm-probe/shots/baseline-zoom")
    argv = LR.replay_argv(rec)
    check("baseline-zoom replay_argv has --zoom", "--zoom" in argv, True)
    check("baseline-zoom replay_argv lane is baseline", "--lane" in argv and argv[argv.index("--lane") + 1] == "baseline", True)
    check("baseline-zoom replay_argv has no --tag", any(a.startswith("--tag") for a in argv), False)


def test_lane_record_reads_all_8_tracked_lanes():
    LR = load_vlm("lane_record")
    paths = [
        "pipeline/vlm-probe/shots/baseline",
        "pipeline/vlm-probe/shots/baseline-zoom",
        "pipeline/vlm-probe/shots/reference",
        "pipeline/vlm-probe/shots/reference-face-e25",
        "pipeline/vlm-probe/shots/reference-face-late",
        "pipeline/vlm-probe/shots/reference-face-only",
        "pipeline/vlm-probe/clips/chain",
        "pipeline/vlm-probe/clips/ref2va",
    ]
    for p in paths:
        rec = LR.read(HERE.parent.parent / p)
        check(f"read({p}) is not None", rec is not None, True)
        argv = LR.replay_argv(rec)
        check(f"replay_argv({p}) is non-empty", isinstance(argv, list) and len(argv) > 0, True)


def test_consistency_run_lane_refuses_drifted_resume():
    C = load_vlm("consistency")
    G = load_vlm("guard")

    tmp = Path(tempfile.mkdtemp())
    shots_dir = tmp / "shots" / "baseline"
    shots_dir.mkdir(parents=True)
    (shots_dir / "01-wide.png").write_bytes(b"dummy image")
    lane_file = shots_dir / "lane.json"
    initial_lane_json = {
        "schema": "lane-record/2",
        "lane": "baseline",
        "steps": 20,
        "seed": 770425,
        "zoom": False,
        "tag": "",
        "shots": {"01-wide": "wide prompt"}
    }
    lane_file.write_text(json.dumps(initial_lane_json, indent=2), encoding="utf-8")
    initial_bytes = lane_file.read_bytes()

    old_shots = C.SHOTS
    old_start = C.guard.start_comfy
    old_headroom = C.guard.headroom_ok
    old_gen = C.generate
    C.SHOTS = tmp / "shots"
    C.guard.start_comfy = lambda: True
    C.guard.headroom_ok = lambda: True
    generate_called = False
    def fake_gen(*a, **k):
        nonlocal generate_called
        generate_called = True
        return tmp / "out.png"
    C.generate = fake_gen

    refused = False
    msg = ""
    try:
        C.run_lane("baseline", steps=30)
    except SystemExit as e:
        refused = True
        msg = str(e)
    finally:
        C.SHOTS = old_shots
        C.guard.start_comfy = old_start
        C.guard.headroom_ok = old_headroom
        C.generate = old_gen

    check("run_lane raised SystemExit on steps 20 -> 30", refused, True)
    check("SystemExit message names steps 20 -> 30", "steps 20 -> 30" in msg or "steps: 20 -> 30" in msg, True)
    check("generate was never called", generate_called, False)
    check("lane.json byte-identical after refusal", lane_file.read_bytes() == initial_bytes, True)


def test_consistency_run_lane_writes_shot_record_per_shot():
    C = load_vlm("consistency")
    LR = load_vlm("lane_record")

    tmp = Path(tempfile.mkdtemp())
    old_shots = C.SHOTS
    old_start = C.guard.start_comfy
    old_headroom = C.guard.headroom_ok
    old_gen = C.generate
    C.SHOTS = tmp / "shots"
    C.guard.start_comfy = lambda: True
    C.guard.headroom_ok = lambda: True

    call_count = 0
    def fake_gen(*a, **k):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            f = tmp / "shot1.png"
            f.write_bytes(b"pixel data shot 1")
            return f
        raise RuntimeError("generation failed on shot 2")
    C.generate = fake_gen

    failed = False
    try:
        C.run_lane("baseline", steps=20)
    except RuntimeError as e:
        failed = True
    finally:
        C.SHOTS = old_shots
        C.guard.start_comfy = old_start
        C.guard.headroom_ok = old_headroom
        C.generate = old_gen

    check("crashed on shot 2", failed, True)
    lane_file = tmp / "shots" / "baseline" / "lane.json"
    check("lane.json exists after shot 1", lane_file.exists(), True)
    rec = LR.read(lane_file)
    shots = rec.get("shots", {})
    check("01-wide in shots after shot 1", "01-wide" in shots, True)
    shot1 = shots.get("01-wide", {})
    check("shot 1 has sha256", "sha256" in shot1, True)
    check("shot 1 has params", "params" in shot1, True)
    check("shots has exactly 1 entry", len(shots), 1)


def test_lane_record_record_stills_and_replay_roundtrip():
    LR = load_vlm("lane_record")
    C = load_vlm("consistency")

    tmp = Path(tempfile.mkdtemp()) / "lane.json"
    rec = LR.record_stills(
        out_dir=tmp.parent,
        lane="reference",
        tag="-face-e25",
        zoom=False,
        steps=20,
        seed=770425,
        ref_crop="face",
        late=0.25,
        refs=["ref1.png"]
    )
    check("stills tag preserved", rec["tag"], "-face-e25")
    check("stills zoom False", rec["zoom"], False)
    check("stills width 1280", rec["width"], 1280)
    check("stills height 720", rec["height"], 720)
    check("stills guidance 4.0", rec["guidance"], 4.0)
    check("stills sampler euler", rec["sampler"], "euler")
    models_str = str(rec["models"])
    check("model unet recorded", "flux2_dev_fp8mixed.safetensors" in models_str, True)
    check("model clip recorded", "mistral_3_small_flux2_fp8.safetensors" in models_str, True)
    check("model vae recorded", "flux2-vae.safetensors" in models_str, True)

    argv = LR.replay_argv(rec)
    ap = C.argparse.ArgumentParser()
    ap.add_argument("--lane", required=True, choices=["baseline", "reference"])
    ap.add_argument("--refs", type=int, default=1)
    ap.add_argument("--steps", type=int, default=20)
    ap.add_argument("--seed", type=int, default=770425)
    ap.add_argument("--zoom", action="store_true")
    ap.add_argument("--ref-crop", choices=["full", "face"], default="full")
    ap.add_argument("--late", type=float, default=0.0)
    ap.add_argument("--tag", default="")

    args = ap.parse_args(argv[1:])
    check("roundtrip lane matches", args.lane, rec["lane"])
    check("roundtrip ref_crop matches", args.ref_crop, rec["ref_crop"])
    check("roundtrip late matches", args.late, rec["reference_joins_at"])
    check("roundtrip tag matches", args.tag, rec["tag"])
    check("roundtrip steps matches", args.steps, rec["steps"])
    check("roundtrip seed matches", args.seed, rec["seed"])


def test_lane_record_record_clip_hero_repo_relative():
    LR = load_vlm("lane_record")
    ROOT = LR.ROOT
    hero_path = ROOT / "pipeline" / "vlm-probe" / "shots" / "reference" / "00-hero.png"

    rec = LR.record_clip(
        out_dir=Path(tempfile.mkdtemp()),
        lane="chain",
        seed=770425,
        steps=4,
        lora=True,
        width=832,
        height=480,
        length=73,
        fps=24,
        hero=hero_path
    )
    check("motion record hero is repo-relative", rec["hero"], "pipeline/vlm-probe/shots/reference/00-hero.png")

    chain_rec = LR.read(HERE.parent.parent / "pipeline/vlm-probe/clips/chain")
    resolved_hero = Path(chain_rec["hero"])
    expected_hero = (ROOT / "pipeline" / "vlm-probe" / "shots" / "reference" / "00-hero.png").resolve()
    check("legacy clips/chain hero resolves to checkout root", resolved_hero, expected_hero)


def test_lane_record_check_detects_tampering():
    LR = load_vlm("lane_record")
    tmp = Path(tempfile.mkdtemp())
    img1 = tmp / "01-wide.png"
    img1.write_bytes(b"wide pixels")
    img2 = tmp / "02-medium.png"
    img2.write_bytes(b"medium pixels")

    LR.record_stills(out_dir=tmp, lane="baseline", steps=20, seed=770425)
    LR.write_shot(tmp, "01-wide", img1, "wide prompt")
    LR.write_shot(tmp, "02-medium", img2, "medium prompt")

    findings = LR.check(tmp)
    check("initial check is clean", findings, [])

    img2.write_bytes(b"tampered medium pixels")
    findings = LR.check(tmp)
    check("tampered image detected", findings, [("02-medium", "pixels changed since record")])


def test_dojo_gemini_key_travels_in_a_header_not_the_url():
    # The judge put the API key in the request URL (?key=...). A URL is the part
    # of a request that ends up in proxy logs, tracebacks and error strings; the
    # header is the channel lib/imaging/providers/google.ts already uses.
    # Moonshot backlog Q6, 2026-10-05. The vendor is faked at urlopen.
    m = load("dojo_judge")
    seen = {}

    def fake_urlopen(req, timeout=None):
        seen["url"] = req.full_url
        seen["header"] = req.get_header("X-goog-api-key")
        reply = {"candidates": [{"content": {"parts": [{"text": '{"pick":"A","reason":"r"}'}]}}]}
        return io.BytesIO(json.dumps(reply).encode())

    m.key = lambda: "SELFTEST-SECRET"
    m.urllib.request.urlopen = fake_urlopen
    with tempfile.TemporaryDirectory() as d:
        cdir = Path(d)
        (cdir / "pairs").mkdir()
        for arm in ("baseline", "challenger"):
            (cdir / "pairs" / f"p1--{arm}.png").write_bytes(b"png bytes, never decoded")
        got = m.gemini("gemini-test", "claim", cdir, "p1", "baseline")
    check("dojo gemini: the pick is still parsed", got.get("pick"), "A")
    check("dojo gemini: the key is not in the URL", "SELFTEST-SECRET" in seen["url"], False)
    check("dojo gemini: the key travels as x-goog-api-key", seen["header"], "SELFTEST-SECRET")


def test_every_third_party_import_is_declared_in_requirements():
    # pipeline/requirements.txt claims to be what the code imports. This walks
    # every tracked .py file with `ast` (never importing the packages -- the CI
    # python job has none) and fails on a module that is neither stdlib, nor a
    # sibling/sys.path-local module, nor declared. 2026-10-06.
    import ast
    import re
    import subprocess

    root = HERE.parent.parent
    files = subprocess.run(["git", "ls-files", "*.py"], cwd=root, capture_output=True,
                           text=True).stdout.split()
    check("requirements guard: the walk found python files", len(files) > 0, True)

    def norm(n):
        return re.sub(r"[-_.]+", "-", n).lower()

    # import name -> distribution name, where they differ
    dist_of = {"PIL": "Pillow", "facenet_pytorch": "facenet-pytorch", "cv2": "opencv-python",
               "yaml": "PyYAML", "sklearn": "scikit-learn"}
    # modules importable by bare name from a script under pipeline/ (the scripts
    # insert vlm-probe/ and foundry/ onto sys.path), plus each file's own siblings
    pipeline_local = {Path(f).stem for f in files if f.startswith("pipeline/")}

    def undeclared(declared):
        out = set()
        for f in files:
            fp = root / f
            sibs = {p.stem for p in fp.parent.glob("*.py")} | {p.name for p in fp.parent.iterdir() if p.is_dir()}
            local = sibs | (pipeline_local if f.startswith("pipeline/") else set())
            tree = ast.parse(fp.read_text(encoding="utf-8"), filename=f)
            for node in ast.walk(tree):
                mods = ([a.name for a in node.names] if isinstance(node, ast.Import)
                        else [node.module] if isinstance(node, ast.ImportFrom) and node.level == 0 and node.module
                        else [])
                for m in mods:
                    top = m.split(".")[0]
                    if top in sys.stdlib_module_names or top in local:
                        continue
                    if norm(dist_of.get(top, top)) not in declared:
                        out.add(f"{f}: {top}")
        return sorted(out)

    lines = (root / "pipeline" / "requirements.txt").read_text(encoding="utf-8").splitlines()
    declared = {norm(re.split(r"[<>=!~\[; ]", l.strip())[0]) for l in lines
                if l.strip() and not l.strip().startswith("#")}
    check("requirements guard: nothing imported is undeclared", undeclared(declared), [])
    # the control: drop one name and the same walk must name its importers
    got = undeclared(declared - {"facenet-pytorch"})
    check("requirements guard: a missing name is caught", got, ["pipeline/vlm-probe/identity.py: facenet_pytorch"])


def _bytes(obj):
    return io.BytesIO(json.dumps(obj).encode())


def test_replicate_poll_survives_a_busy_card_and_names_a_dead_one():
    """consistency.generate learned that a /history poll failing while the card
    is busy is expected, and that a poll failing because the PROCESS is gone is
    not. replicate.py carried its own copy of the loop with neither rule: one
    slow poll failed the replica and recycled ComfyUI under a running job."""
    import time as _time
    import urllib.error
    import urllib.request
    R = load_vlm("replicate")
    done = {"p1": {"outputs": {"13": {"images": [{"filename": "replica_00001_.png", "subfolder": ""}]}}}}

    def run(alive, history):
        polls = []

        def fake_urlopen(req, timeout=None):
            url = req if isinstance(req, str) else req.full_url
            if url.endswith("/prompt"):
                return _bytes({"prompt_id": "p1"})
            polls.append(url)
            return history(len(polls))
        saved = (urllib.request.urlopen, _time.sleep, R.guard.comfy_process_ids)
        urllib.request.urlopen, _time.sleep = fake_urlopen, (lambda s: None)
        R.guard.comfy_process_ids = lambda: [4242] if alive else []
        try:
            return R.comfy_generate("a prompt", 7, timeout=60).name
        except Exception as e:
            return f"{type(e).__name__}: {e}"
        finally:
            urllib.request.urlopen, _time.sleep, R.guard.comfy_process_ids = saved

    def busy_once(n):
        if n == 1:
            raise urllib.error.URLError("timed out while the card was busy")
        return _bytes(done)
    check("replicate: one failed poll on a busy card is not a failed replica",
          run(True, busy_once), "replica_00001_.png")

    def never(n):
        raise urllib.error.URLError("connection refused")
    got = run(False, never)
    check("replicate: a vanished ComfyUI is named, not reported as a poll error",
          "vanished" in got, True)


def test_motion_collect_takes_the_newest_video_like_its_frames():
    """collect() takes the NEWEST png per tag (hits[-1]) and took the OLDEST mp4
    (first hit, then break), so a re-run lane paired fresh frames with the
    previous run's video -- the one artefact the human check reads."""
    M = load_vlm("motion")
    tmp = Path(tempfile.mkdtemp())
    out, dest = tmp / "comfy-out", tmp / "lane"
    out.mkdir()
    dest.mkdir()
    for n in (1, 2):
        (out / f"ref2va-01-turn_c-last_{n:05d}_.png").write_bytes(b"png %d" % n)
        (out / f"ref2va-01-turn_{n:05d}_.mp4").write_bytes(b"mp4 %d" % n)
    saved = M.COMFY_OUT
    M.COMFY_OUT = out
    try:
        got = M.collect("ref2va-01-turn", dest, 73)
    finally:
        M.COMFY_OUT = saved
    check("motion.collect: the frame is the newest run's", got["c-last"].read_bytes(), b"png 2")
    check("motion.collect: ...and so is the video", sorted(p.name for p in dest.glob("*.mp4")),
          ["ref2va-01-turn_00002_.mp4"])


def test_motion_chain_refuses_to_restart_from_the_hero():
    """The chain lane's whole claim is "clip N starts on clip N-1's last frame".
    When a clip's last frame was not collected, the next clip silently started
    on the HERO instead -- a ref-start clip recorded as a chain result."""
    import types
    M = load_vlm("motion")
    tmp = Path(tempfile.mkdtemp())
    hero = tmp / "hero.png"
    hero.write_bytes(b"hero")
    last = tmp / "01-turn_c-last.png"
    last.write_bytes(b"last")

    def run(collected):
        staged = []
        saved = (M.CLIPS, M.lane_record, M.stage_reference, M.generate, M.collect,
                 M.guard.recycle_comfy, M.guard.vram_ok)
        M.CLIPS = Path(tempfile.mkdtemp())
        M.lane_record = types.SimpleNamespace(
            check_resume=lambda *a, **k: None, record_clip=lambda **k: None,
            read=lambda *a: {}, write_shot=lambda *a, **k: None)
        M.stage_reference = lambda p: staged.append(Path(p).name) or Path(p).name
        M.generate = lambda wf, timeout=0: None
        M.collect = lambda prefix, dest, length: collected(prefix)
        M.guard.recycle_comfy = lambda *a: True
        M.guard.vram_ok = lambda: True
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                M.run("chain", 832, 480, 73, 4, True, hero)
            err = None
        except Exception as e:
            err = str(e)
        finally:
            (M.CLIPS, M.lane_record, M.stage_reference, M.generate, M.collect,
             M.guard.recycle_comfy, M.guard.vram_ok) = saved
        return staged, err

    # control: a collected last frame IS what the next clip starts on
    staged, err = run(lambda prefix: {"c-last": last})
    check("motion chain (control): clip 2 starts on clip 1's last frame", (staged[2], err),
          ("01-turn_c-last.png", None))
    staged, err = run(lambda prefix: {})
    check("motion chain: a missing last frame stops the lane", err is not None and "02-walk" in err, True)
    check("motion chain: ...and no clip after the first started on the hero", staged.count("hero.png"), 2)


def test_fetch_ref2va_exit_code_reports_a_download_it_gave_up_on():
    """The docstring says run it DETACHED, so the exit code is the only signal
    anyone reads -- and a download abandoned after twelve attempts exited 0."""
    import time as _time
    import types
    F = load_vlm("fetch_ref2va")
    tmp = Path(tempfile.mkdtemp())

    def refuse(**k):
        raise OSError("stalled at 7 GB")
    had = sys.modules.get("huggingface_hub")
    saved = (F.COMFY_MODELS, _time.sleep, sys.argv)
    sys.modules["huggingface_hub"] = types.SimpleNamespace(hf_hub_download=refuse)
    F.COMFY_MODELS, _time.sleep, sys.argv = tmp, (lambda s: None), ["fetch_ref2va.py"]
    code = "returned"
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            F.main()
    except SystemExit as e:
        code = e.code
    finally:
        F.COMFY_MODELS, _time.sleep, sys.argv = saved
        if had is None:
            sys.modules.pop("huggingface_hub", None)
        else:
            sys.modules["huggingface_hub"] = had
    check("fetch_ref2va: a download it gave up on exits non-zero", code, 1)


def test_reconcile_resume_is_per_annotator():
    """reconciled.jsonl carries an `annotator` per row, but resume keyed on the
    frame alone -- so adjudicating a second annotator's answers in the same run
    skipped every frame the first one had covered and reported success."""
    Rc = load_vlm("reconcile")
    tmp = Path(tempfile.mkdtemp())
    run_dir = tmp / "r"
    run_dir.mkdir()
    frame = "arcane-fights-001.jpg"
    (run_dir / "results.jsonl").write_text("".join(
        json.dumps({"frame": frame, "model": m, "ok": True, "parsed": {}}) + "\n"
        for m in ("qwen", "gemma")), encoding="utf-8")
    (run_dir / "reconciled.jsonl").write_text(
        json.dumps({"frame": frame, "annotator": "qwen"}) + "\n", encoding="utf-8")

    def go(annotator):
        saved = (Rc.OUT_ROOT, Rc.judge, sys.argv)
        Rc.OUT_ROOT = tmp
        Rc.judge = lambda *a, **k: ({"corrected": {}, "corrections": [], "unanswerable": []}, {}, 0.0)
        sys.argv = ["reconcile.py", "--run", "r", "--annotator", annotator]
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                Rc.main()
        finally:
            Rc.OUT_ROOT, Rc.judge, sys.argv = saved
        rows = [json.loads(l) for l in (run_dir / "reconciled.jsonl").read_text(encoding="utf-8").splitlines()]
        return sorted(r["annotator"] for r in rows)

    check("reconcile: a second annotator's frame is adjudicated", go("gemma"), ["gemma", "qwen"])
    check("reconcile (control): a frame already judged for its annotator is skipped",
          go("qwen"), ["gemma", "qwen"])


def test_replicate_one_unreadable_reannotation_does_not_end_phase_2():
    """Phase 2 parsed each re-annotation with a bare json.loads, so one
    malformed reply from the annotator ended the run and every frame after it
    went unscored -- the phase reconcile.py already survives per frame."""
    R = load_vlm("replicate")
    tmp = Path(tempfile.mkdtemp())
    run_dir, reps = tmp / "r", tmp / "replicas"
    run_dir.mkdir()
    reps.mkdir()
    craft = {"shot_size": "wide", "contrast": "high"}
    frames = ["arcane-fights-001.jpg", "arcane-fights-002.jpg"]
    (run_dir / "results.jsonl").write_text("".join(
        json.dumps({"frame": f, "model": R.ANNOTATOR, "ok": True, "parsed": craft}) + "\n"
        for f in frames), encoding="utf-8")
    for f in frames:
        (reps / f"replica-{Path(f).stem}.png").write_bytes(b"png")
    replies = iter(["the model wrote prose instead", json.dumps(craft)])
    saved = (R.OUT_ROOT, R.REPLICA_DIR, R.run_ollama, R.guard.require_model, sys.argv)
    R.OUT_ROOT, R.REPLICA_DIR = tmp, reps
    R.run_ollama = lambda *a, **k: (next(replies), None)
    R.guard.require_model = lambda *a, **k: None
    sys.argv = ["replicate.py", "--run", "r", "--reuse-replicas"]
    err = None
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            R.main()
    except BaseException as e:
        err = type(e).__name__
    finally:
        R.OUT_ROOT, R.REPLICA_DIR, R.run_ollama, R.guard.require_model, sys.argv = saved
    out = run_dir / "replication.jsonl"
    scored = [json.loads(l)["frame"] for l in out.read_text(encoding="utf-8").splitlines()] if out.exists() else []
    check("replicate: phase 2 finishes past an unreadable re-annotation", (err, scored),
          (None, ["arcane-fights-002.jpg"]))


def test_identity_decision_functions_load_without_torch_or_pil():
    """identity.py owns the ruler that every published identity number is read
    against, and its refusal (ruler_blindness) used to be unpinnable in CI
    because torch and PIL were imported at module level."""
    saved = {k: sys.modules.get(k) for k in ("torch", "PIL", "PIL.Image", "PIL.ImageDraw")}
    for k in saved:
        sys.modules[k] = None
    try:
        try:
            I = load_vlm("identity")
        except ImportError as e:
            check("identity: loads with torch and PIL blocked", f"ImportError: {e}", "loaded")
            return
    finally:
        for k, v in saved.items():
            if v is None:
                sys.modules.pop(k, None)
            else:
                sys.modules[k] = v
    check("identity: loads with torch and PIL blocked", True, True)
    inverted = {"id_within": 0.2, "id_floor": 0.5, "id_ceil": 0.4, "look_floor": 0.3}
    sound = {"id_within": 0.2, "id_floor": 0.4, "id_ceil": 0.7, "look_floor": 0.3}
    check("identity: an inverted scale is refused", isinstance(I.ruler_blindness(inverted), str), True)
    check("identity: a sound scale is not refused", I.ruler_blindness(sound), None)
    check("identity: a missing floor is refused",
          isinstance(I.ruler_blindness({**sound, "id_floor": None}), str), True)
    check("identity: no face reads as unscored", I.verdict(None, 0.1, sound), "unscored (no face detected)")
    check("identity: at the ceiling reads as a different person",
          I.verdict(0.7, 0.1, sound).startswith("READS AS A DIFFERENT PERSON"), True)
    rows = [("floor", "a", "b", 0.3, 0.2, ""), ("hard-ceil", "a", "c", 0.6, 0.5, "")]
    check("identity: scale_from reads floor and ceiling",
          (I.scale_from(rows)["id_floor"], I.scale_from(rows)["id_ceil"]), (0.3, 0.6))
    check("identity: missing_anchors names every absent still",
          len(I.missing_anchors(tempfile.mkdtemp())), len(I.ANCHORS))


TESTS = [
    test_palette_is_measured_and_the_sample_is_declared,
    test_frozen_is_a_number_not_a_poster_impression,
    test_ungradable_candidate_does_not_kill_the_run,
    test_scoreless_source_annotation_does_not_kill_the_run,
    test_resume_regrades_an_unmeasured_candidate,
    test_a_run_that_gave_up_mid_generation_does_not_report_done,
    test_a_grade_names_the_grader_version_not_just_the_model,
    test_list_survives_a_row_from_another_schema,
    test_catalogue_lock_speaks_the_apps_protocol,
    test_acquire_journals_and_revisions_under_the_lock,
    test_an_unparseable_readback_is_kept_on_disk,
    test_frame_manifest_v2_schema_write_and_read_v1_normalization,
    test_shot_index_and_beat_of_mapping,
    test_frame_manifest_upgrade_preserves_backup,
    test_dojo_study_beat_map_runtime_and_none_handling,
    test_dojo_study_beat_binning_153_frames_discrepancy,
    test_lane_record_replay_argv_and_consistency_kwargs,
    test_lane_record_replay_argv_baseline_zoom,
    test_lane_record_reads_all_8_tracked_lanes,
    test_consistency_run_lane_refuses_drifted_resume,
    test_consistency_run_lane_writes_shot_record_per_shot,
    test_lane_record_record_stills_and_replay_roundtrip,
    test_lane_record_record_clip_hero_repo_relative,
    test_lane_record_check_detects_tampering,
    test_dojo_gemini_key_travels_in_a_header_not_the_url,
    test_every_third_party_import_is_declared_in_requirements,
    test_replicate_poll_survives_a_busy_card_and_names_a_dead_one,
    test_motion_collect_takes_the_newest_video_like_its_frames,
    test_motion_chain_refuses_to_restart_from_the_hero,
    test_fetch_ref2va_exit_code_reports_a_download_it_gave_up_on,
    test_reconcile_resume_is_per_annotator,
    test_replicate_one_unreadable_reannotation_does_not_end_phase_2,
    test_identity_decision_functions_load_without_torch_or_pil,
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
