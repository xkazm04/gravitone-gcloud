// TRUTH SIDECARS — LABELLED SHOT CLAUSES MINT LANE-QUALIFIED TRUTH (python lane).
//
// THE SEAM THIS GUARDS. vlm-probe measures accuracy (not agreement) only where
// a truth file exists, and until this stage that was two hand-written files in
// frames/truth/. The consistency lanes dictate shot size, angle and focus for
// every render in prose (SHOTS_SPEC / ZOOM_SPEC) and kept none of it. C11 stage
// 1 (critic-2026-10-07): each clause is LABELLED (not compiled - a recompiled
// clause moves the pixels under the fixed seed), run_lane writes
// <lane-dir>/<shot>.truth.json beside the shot, probe.py names a shot frame
// "<lane-dir>--<shot>.png" (= truth_id + ".png"), and score.py resolves that
// name to the sidecar - so three lanes' "01-wide" stop colliding on one stem.
//
// A dictated label is a request, not a truth: score.py grades only sidecars
// whose basis is "dictated+confirmed", and a sidecar whose spec_digest no
// longer matches the current label set is named, never silently used.
//
// Python, no GPU, no network: guard, generate, stage_reference,
// face_reference and the probe backends are faked.
import { spawnSync } from "node:child_process";
import { test, expect } from "@playwright/test";

function runPython(code: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("python", ["-c", code], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 60000,
    env: { ...process.env, KEYS_ENV_FILE: "__no_such_env_file__", PYTHONIOENCODING: "utf-8" },
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function expectOk(code: string) {
  const res = runPython(code);
  expect(res.stderr).toBe("");
  expect(res.status).toBe(0);
  expect(res.stdout.trim().split("\n").pop()).toBe("OK");
}

const PRELUDE = `
import sys, tempfile, json, ast, io, contextlib, shutil
from pathlib import Path
sys.path.insert(0, "pipeline/vlm-probe")
TRACKED = Path("pipeline/vlm-probe/shots")

def quiet(fn, *a, **k):
    with contextlib.redirect_stdout(io.StringIO()):
        return fn(*a, **k)

def stub_render(consistency, shots_root):
    """Every seam run_lane would take to ComfyUI or the face model, faked."""
    import guard
    consistency.SHOTS = shots_root
    guard.start_comfy = lambda: True
    guard.headroom_ok = lambda: True
    n = [0]
    def fake_generate(*a, **k):
        n[0] += 1
        f = shots_root.parent / f"gen-{n[0]}.png"
        f.write_bytes(f"pixels {n[0]}".encode())
        return f
    consistency.generate = fake_generate
    consistency.stage_reference = lambda p: "ref_" + Path(p).name
    def fake_face(src, dest):
        Path(dest).write_bytes(b"face")
        return Path(dest)
    consistency.face_reference = fake_face

def render_face_e25(consistency, tmp):
    """The tracked reference-face-e25 lane, resumed over a COPY of its real
    lane.json, so the resume guard runs against the recorded params."""
    shots_root = tmp / "shots"
    lane = shots_root / "reference-face-e25"
    lane.mkdir(parents=True)
    shutil.copyfile(TRACKED / "reference-face-e25" / "lane.json", lane / "lane.json")
    stub_render(consistency, shots_root)
    quiet(consistency.run_lane, "reference", tag="-face-e25", ref_crop="face", late=0.25)
    return lane
`;

test("Case 1: craft_spec.validate checks against schema enums, naming the field", () => {
  expectOk(`${PRELUDE}
import craft_spec as S
try:
    S.validate({"camera_angle": "low"})
    raise AssertionError("'low' passed - it is not in schema.CAMERA_ANGLE")
except ValueError as e:
    assert "camera_angle" in str(e), str(e)
S.validate({"camera_angle": "low-angle"})
try:
    S.validate({"not_a_field": "wide"})
    raise AssertionError("an unknown field passed")
except ValueError as e:
    assert "not_a_field" in str(e), str(e)
print("OK")
`);
});

test("Case 2: every labelled phrase sits in its clause, and the clauses still render the tracked prompts", () => {
  expectOk(`${PRELUDE}
import consistency as C, lane_record as L
labelled = 0
for table in (C.SHOTS_SPEC, C.ZOOM_SPEC):
    for name, clause, spec in table:
        assert spec, f"{name}: no labels"
        for field, entry in spec.items():
            assert entry["phrase"] in clause, f"{name}.{field}: {entry['phrase']!r} not in clause"
            labelled += 1
assert labelled >= 15, labelled
lanes = sorted(p.parent for p in TRACKED.glob("*/lane.json"))
assert len(lanes) == 6, lanes
compared = 0
for lane in lanes:
    rec = L.read(lane)
    table = C.ZOOM_SPEC if rec["zoom"] else C.SHOTS_SPEC
    for name, clause, _ in table:
        shot = rec["shots"][name]
        want = shot if isinstance(shot, str) else shot["prompt"]
        assert C.prompt_for(clause) == want, f"{lane.name}/{name}: prompt drifted - the pixels would move"
        compared += 1
assert compared == 18, compared
print("OK")
`);
});

test("Case 3: a stubbed run_lane mints a lane-qualified, digest-pinned sidecar per shot", () => {
  expectOk(`${PRELUDE}
import consistency as C, craft_spec as S
tmp = Path(tempfile.mkdtemp())
lane = render_face_e25(C, tmp)
side = lane / "01-wide.truth.json"
assert side.exists(), sorted(p.name for p in lane.iterdir())
text = side.read_text(encoding="utf-8")
t = json.loads(text)
spec = dict((n, s) for n, _, s in C.SHOTS_SPEC)["01-wide"]
assert t["shot_size"] == "extreme-wide", t
assert t["depth_of_field"] == "deep", t
assert t["camera_angle"] == "low-angle", t
assert t["basis"] == "dictated", t
assert t["seed"] == 770425, t
assert t["spec_digest"] == S.digest(spec), t
assert t["truth_id"] == "reference-face-e25--01-wide", t
assert str(tmp) not in text and str(tmp).replace("\\\\", "/") not in text, "absolute path in sidecar"
assert ":\\\\" not in text and '"/' not in text, "machine path in sidecar"
rec = json.loads((lane / "lane.json").read_text(encoding="utf-8"))
assert rec["shots"]["01-wide"]["params"]["spec_digest"] == t["spec_digest"], "lane.json shot params lack spec_digest"
print("OK")
`);
});

test("Case 4: an arguable dictated value goes to _ungraded with its phrase, never guessed", () => {
  expectOk(`${PRELUDE}
import consistency as C
tmp = Path(tempfile.mkdtemp())
lane = render_face_e25(C, tmp)
med = json.loads((lane / "02-medium.truth.json").read_text(encoding="utf-8"))
assert "depth_of_field" not in med and "depth_of_field" not in med.get("_ungraded", {}), med
assert "camera_angle" not in med, "a contested angle was graded"
assert "slightly above eye level" in med["_ungraded"]["camera_angle"], med["_ungraded"]
assert med["shot_size"] == "medium", med
close = json.loads((lane / "03-close.truth.json").read_text(encoding="utf-8"))
assert "shot_size" not in close, "a contested shot size was graded"
assert "Tight close-up" in close["_ungraded"]["shot_size"], close["_ungraded"]
assert close["camera_angle"] == "low-angle" and close["depth_of_field"] == "shallow", close
print("OK")
`);
});

test("Case 5: probe.py names a shot frame by its truth_id, and score.py resolves that real row to the sidecar run_lane wrote", () => {
  // Critic revise: the end-to-end join, not a hand-made row name.
  expectOk(`${PRELUDE}
import consistency as C, probe as P, score as Sc
assert P.frame_name(Path("pipeline/vlm-probe/shots/reference-face-e25/01-wide.png")) == "reference-face-e25--01-wide.png"
assert P.frame_name(Path("pipeline/vlm-probe/frames/arcane.png")) == "arcane.png"

tmp = Path(tempfile.mkdtemp())
lane = render_face_e25(C, tmp)
P.SHOTS = tmp / "shots"
P.OUT_ROOT = tmp / "out"
P.run_gemini = lambda model, b64, mime, api_key: ('{"shot_size": "wide"}', {})
import os
os.environ["GEMINI_API_KEY"] = "fake"
sys.argv = ["probe.py", "--models", "gemini-3.7-flash", "--shots", "reference-face-e25", "--run-id", "r1"]
quiet(P.main)
rows = [json.loads(l) for l in (tmp / "out" / "r1" / "results.jsonl").read_text(encoding="utf-8").splitlines()]
names = sorted(r["frame"] for r in rows)
assert names == ["reference-face-e25--01-wide.png", "reference-face-e25--02-medium.png",
                 "reference-face-e25--03-close.png"], names
Sc.SHOTS = tmp / "shots"
t = Sc.load_truth(rows[0]["frame"])
assert t is not None, "the probe row found no sidecar"
assert t["truth_id"] + ".png" == rows[0]["frame"], (t["truth_id"], rows[0]["frame"])
print("OK")
`);
});

test("Case 6: two lanes' 01-wide resolve to separate truth; a bare stem resolves to none", () => {
  expectOk(`${PRELUDE}
import craft_spec as S, score as Sc
tmp = Path(tempfile.mkdtemp())
for lane in ("baseline", "reference"):
    (tmp / lane).mkdir()
    S.write_sidecar(tmp / lane, "01-wide", "shots", seed=770425)
Sc.SHOTS = tmp
a, b = Sc.load_truth("baseline--01-wide.png"), Sc.load_truth("reference--01-wide.png")
assert a and b and a["truth_id"] == "baseline--01-wide" and b["truth_id"] == "reference--01-wide", (a, b)
assert Sc.load_truth("01-wide.png") is None
print("OK")
`);
});

const SCORE_FIXTURE = `
import craft_spec as S, score as Sc
tmp = Path(tempfile.mkdtemp())
Sc.SHOTS = tmp / "shots"
Sc.OUT_ROOT = tmp / "out"
LANES = {"baseline": "dictated+confirmed", "reference": "dictated+confirmed",
         "reference-face-e25": "dictated+confirmed", "reference-face-late": "dictated",
         "reference-face-only": "dictated-disputed"}
for lane, basis in LANES.items():
    d = Sc.SHOTS / lane
    d.mkdir(parents=True)
    p = S.write_sidecar(d, "01-wide", "shots", seed=770425)
    t = json.loads(p.read_text(encoding="utf-8"))
    t["basis"] = basis
    p.write_text(json.dumps(t), encoding="utf-8")

def report(rows):
    run = Sc.OUT_ROOT / "r"
    run.mkdir(parents=True, exist_ok=True)
    (run / "results.jsonl").write_text("\\n".join(json.dumps(r) for r in rows) + "\\n", encoding="utf-8")
    sys.argv = ["score.py", "--run", "r"]
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        Sc.main()
    return buf.getvalue().splitlines()

def row(frame, model="gemma4:12b", **p):
    parsed = {"shot_size": "extreme-wide", "camera_angle": "low-angle", "depth_of_field": "deep"}
    parsed.update(p)
    return {"frame": frame, "model": model, "repeat": 1, "ok": True, "latency_s": 1.0, "tier": "local", "parsed": parsed}

FRAMES = [lane + "--01-wide.png" for lane in LANES]
`;

test("Case 7: only dictated+confirmed sidecars are scored, n per field and basis per row; disputed counts as generator compliance", () => {
  expectOk(`${PRELUDE}${SCORE_FIXTURE}
out = report([row(f) for f in FRAMES])
text = "\\n".join(out)
i = out.index(next(l for l in out if l.startswith("## 2.")))
head = out[i + 2]
cols = [c.strip() for c in head.strip("|").split("|")]
assert cols[1:4] == ["shot_size", "camera_angle", "depth_of_field"], cols
nrow = next(l for l in out[i:] if l.startswith("| n |"))
assert [c.strip() for c in nrow.strip("|").split("|")][1:4] == ["3", "3", "3"], nrow
for lane in ("baseline", "reference", "reference-face-e25"):
    assert any(lane + "--01-wide.png" in l and "dictated+confirmed" in l for l in out), lane
late = [l for l in out if "reference-face-late--01-wide.png" in l]
assert late and all("unscored" in l for l in late), late
comp = [l for l in out if l.lower().startswith("generator compliance")]
assert comp and "1" in comp[0] and "reference-face-only--01-wide.png" in comp[0], comp
print("OK")
`);
});

test("Case 8: a sidecar whose spec_digest no longer matches the labels is unscored and named", () => {
  expectOk(`${PRELUDE}${SCORE_FIXTURE}
p = Sc.SHOTS / "baseline" / "01-wide.truth.json"
t = json.loads(p.read_text(encoding="utf-8"))
t["spec_digest"] = "0" * 64
p.write_text(json.dumps(t), encoding="utf-8")
out = report([row(f) for f in FRAMES])
i = out.index(next(l for l in out if l.startswith("## 2.")))
nrow = next(l for l in out[i:] if l.startswith("| n |"))
assert [c.strip() for c in nrow.strip("|").split("|")][1:4] == ["2", "2", "2"], nrow
stale = [l for l in out if "baseline--01-wide.png" in l]
assert stale and any("spec" in l and "unscored" in l for l in stale), stale
print("OK")
`);
});

test("Case 9 [guard]: the hand truth files still resolve by stem and score as on b08bc7e", () => {
  expectOk(`${PRELUDE}
import score as Sc
tmp = Path(tempfile.mkdtemp())
Sc.OUT_ROOT = tmp
run = tmp / "g"; run.mkdir()
def row(frame, model, **p):
    base = {"shot_size": "wide", "camera_angle": "eye-level", "depth_of_field": "deep", "lighting_key": "low-key", "contrast": "high"}
    base.update(p)
    return {"frame": frame, "model": model, "repeat": 1, "ok": True, "latency_s": 1.0, "tier": "local", "parsed": base}
rows = [
    row("arcane.png", "gemini-3.7-flash"),
    row("arcane.png", "gemma4:12b", depth_of_field="moderate", contrast="extreme"),
    row("duel-keyframe.png", "gemini-3.7-flash", shot_size="full"),
    row("duel-keyframe.png", "gemma4:12b", camera_angle="low-angle", lighting_key="high-key"),
]
(run / "results.jsonl").write_text("\\n".join(json.dumps(r) for r in rows) + "\\n", encoding="utf-8")
sys.argv = ["score.py", "--run", "g"]
buf = io.StringIO()
with contextlib.redirect_stdout(buf):
    Sc.main()
out = buf.getvalue().splitlines()
i = next(k for k, l in enumerate(out) if l.startswith("## 2."))
assert out[i + 2] == "| model | shot_size | camera_angle | depth_of_field | lighting_key | contrast | score |", out[i + 2]
SNAPSHOT = ["| \`gemma4:12b\` | + | X | ~ | ~ | ~ | **62%** |", "| \`gemini-3.7-flash\` | ~ | + | + | + | + | **94%** |"]
assert [l for l in out[i:] if l.startswith("| \`")][:2] == SNAPSHOT, out[i:]
print("OK")
`);
});

test("Case 10: the live paths use the new seams (run_lane, probe.main, score.main)", () => {
  expectOk(`${PRELUDE}
def calls(path, fn):
    tree = ast.parse(Path(path).read_text(encoding="utf-8"))
    f = next(n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name == fn)
    return {ast.unparse(n.func) for n in ast.walk(f) if isinstance(n, ast.Call)}
assert "craft_spec.write_sidecar" in calls("pipeline/vlm-probe/consistency.py", "run_lane")
assert "frame_name" in calls("pipeline/vlm-probe/probe.py", "main")
assert "load_truth" in calls("pipeline/vlm-probe/score.py", "main")
src = Path("pipeline/vlm-probe/score.py").read_text(encoding="utf-8")
assert "import consistency" not in src, "score.py must not import the render module (guard, urllib)"
src = Path("pipeline/vlm-probe/craft_spec.py").read_text(encoding="utf-8")
mods = {a.name.split(".")[0] for n in ast.walk(ast.parse(src)) if isinstance(n, ast.Import) for a in n.names}
mods |= {n.module.split(".")[0] for n in ast.walk(ast.parse(src)) if isinstance(n, ast.ImportFrom) and n.module}
assert mods <= {"hashlib", "json", "sys", "pathlib", "schema"}, f"craft_spec is not stdlib-only: {mods}"
print("OK")
`);
});
