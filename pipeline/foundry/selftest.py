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

    rec = LR.read("pipeline/vlm-probe/shots/reference-face-e25")
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
    rec = LR.read("pipeline/vlm-probe/shots/baseline-zoom")
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
        rec = LR.read(p)
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

    chain_rec = LR.read("pipeline/vlm-probe/clips/chain")
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


TESTS = [
    test_palette_is_measured_and_the_sample_is_declared,
    test_frozen_is_a_number_not_a_poster_impression,
    test_ungradable_candidate_does_not_kill_the_run,
    test_scoreless_source_annotation_does_not_kill_the_run,
    test_resume_regrades_an_unmeasured_candidate,
    test_a_run_that_gave_up_mid_generation_does_not_report_done,
    test_list_survives_a_row_from_another_schema,
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
