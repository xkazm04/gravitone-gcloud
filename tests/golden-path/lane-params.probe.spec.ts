// LANE PARAMS — ONE TABLE, FOUR PROJECTIONS (dynamic, python lane).
//
// THE SEAM THIS GUARDS. A vlm-probe lane.json is the only reproducibility
// record for gitignored pixels, and its parameter set used to be written four
// times: two argparse blocks (consistency.py, motion.py), check_resume's
// per-key branches and replay_argv's per-key list. The copies disagreed: an
// interrupted reference lane replayed without --refs, a clip lane never
// replayed its --hero (so both replays were refused by the resume guard they
// fed), half the recorded knobs were never compared on resume, and
// lane_record's own default LOCATION described a hangar no lane rendered.
//
// lane_record.LANE_PARAMS is now the one authority. argparse
// (add_lane_args / build_arg_parser), the resume guard, replay_argv and the
// lane directory name (lane_dir / params_from_dir) are derived from it, and
// the cases below ITERATE the table, so a param added without a projection
// fails here rather than in a refused replay weeks later.
//
// Python, no GPU, no network: every seam that would reach ComfyUI is faked.
import { spawnSync } from "node:child_process";
import { test, expect } from "@playwright/test";

function runPython(code: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("python", ["-c", code], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 30000,
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
import sys, tempfile, json, ast, io, contextlib
from pathlib import Path
sys.path.insert(0, "pipeline/vlm-probe")
import lane_record as L
FACE_HERO = "pipeline/vlm-probe/shots/reference-face-e25/00b-hero-face.png"

def sample(p):
    """One non-default value per param type. A type with no sample fails the case."""
    if p.choices:
        return [c for c in p.choices if c != p.default][-1]
    if p.type is bool:
        return not p.default
    if p.type is int:
        return p.default + 3
    if p.type is float:
        return round(p.default + 0.35, 2)
    if p.type == "path":
        return FACE_HERO
    if p.type is str:
        return "-probe" if p.default == "" else "a different clause"
    raise AssertionError(f"no sample for {p.name} of type {p.type!r}")

def write(kind, **kw):
    out = Path(tempfile.mkdtemp())
    kw.setdefault("lane", "reference" if kind == "stills" else "chain")
    fn = L.record_stills if kind == "stills" else L.record_clip
    fn(out, **kw)
    return out

def same(p, a, b):
    if p.type == "path":
        return L.resolve_from_repo(str(a)) == L.resolve_from_repo(str(b))
    return a == b
`;

test("Case 1: an interrupted reference lane replays its --refs", () => {
  expectOk(`${PRELUDE}
out = write("stills", lane="reference", refs=[], ref_count=3, tag="-x")
argv = L.replay_argv(L.read(out))
i = argv.index("--refs") if "--refs" in argv else -1
assert i >= 0 and argv[i + 1] == "3", f"no --refs 3 in {argv}"
print("OK")
`);
});

test("Case 2: a clip lane replays its --hero, repo-relative", () => {
  expectOk(`${PRELUDE}
out = write("clips", lane="chain", hero=FACE_HERO)
argv = L.replay_argv(L.read(out))
assert "--hero" in argv, f"no --hero in {argv}"
assert argv[argv.index("--hero") + 1] == FACE_HERO, f"hero not repo-relative in {argv}"
print("OK")
`);
});

test("Case 3: every cli param in LANE_PARAMS round-trips record -> replay -> argparse", () => {
  expectOk(`${PRELUDE}
seen = 0
for kind in ("stills", "clips"):
    cli = [p for p in L.LANE_PARAMS[kind] if p.flag]
    assert cli, f"no cli params for {kind}"
    for p in cli:
        v = sample(p)
        out = write(kind, **{p.name: v})
        argv = L.replay_argv(L.read(out))
        assert argv[0] == ("consistency.py" if kind == "stills" else "motion.py"), argv
        ns = L.build_arg_parser(kind).parse_args(argv[1:])
        got = getattr(ns, p.name)
        assert same(p, got, v), f"{kind}.{p.name}: recorded {v!r}, replay parsed {got!r} from {argv}"
        seen += 1
assert seen >= 14, f"only {seen} cli params iterated"
print("OK")
`);
});

test("Case 4: every strict param in LANE_PARAMS is refused on a changed resume, by name", () => {
  expectOk(`${PRELUDE}
seen = 0
for kind in ("stills", "clips"):
    for p in [p for p in L.LANE_PARAMS[kind] if p.strict]:
        v2 = sample(p)
        v1 = p.default if p.default is not None else ("baseline" if p.name == "lane" else "one clause")
        if p.name == "lane":
            v1 = [c for c in p.choices if c != v2][0]
        out = write(kind, **{p.name: v1})
        L.check_resume(out / "lane.json", {p.name: v1})  # control: unchanged resumes
        try:
            L.check_resume(out / "lane.json", {p.name: v2})
            raise AssertionError(f"{kind}.{p.name}: {v1!r} -> {v2!r} resumed")
        except SystemExit as e:
            assert p.name in str(e), f"{kind}.{p.name}: refusal does not name it: {e}"
        seen += 1
names = {p.name for k in L.LANE_PARAMS for p in L.LANE_PARAMS[k] if p.strict}
for must in ("fps", "width", "height", "guidance", "sampler", "seed", "hero", "location"):
    assert must in names, f"{must} is not guarded on resume"
print(seen)
print("OK")
`);
});

test("Case 5: a record with no location invents none; lane_record owns no scene clauses", () => {
  // Critic revise: no default LOCATION/CHARACTER in lane_record (that would need
  // a lane_record -> consistency import cycle). DEVIATION, recorded in the
  // result file: a missing clause is left OUT of the record rather than raising,
  // because five read-only selftest cases and lane-record Cases 6-8 write
  // records without clauses and must stay green.
  expectOk(`${PRELUDE}
assert not hasattr(L, "LOCATION"), "lane_record still defines its own LOCATION"
assert not hasattr(L, "CHARACTER"), "lane_record still defines its own CHARACTER"
out = write("stills", lane="baseline")
on_disk = json.loads((out / "lane.json").read_text(encoding="utf-8"))
assert "location" not in on_disk and "character" not in on_disk, f"scene invented: {on_disk.get('location')!r}"
out = write("clips", lane="chain")
on_disk = json.loads((out / "lane.json").read_text(encoding="utf-8"))
assert "location" not in on_disk, "clip record invented a scene"
print("OK")
`);
});

test("Case 5b: the live stills path records consistency's own scene clauses", () => {
  expectOk(`${PRELUDE}
import consistency, guard
tmp = Path(tempfile.mkdtemp())
consistency.SHOTS = tmp / "shots"
guard.start_comfy = lambda: True
guard.headroom_ok = lambda: True
def fake_generate(*a, **k):
    raise RuntimeError("stop before the first shot")
consistency.generate = fake_generate
try:
    with contextlib.redirect_stdout(io.StringIO()):
        consistency.run_lane("baseline")
except RuntimeError:
    pass
rec = json.loads((tmp / "shots" / "baseline" / "lane.json").read_text(encoding="utf-8"))
assert rec["location"] == consistency.LOCATION, "run_lane recorded a scene it did not render"
assert rec["character"] == consistency.CHARACTER
print("OK")
`);
});

test("Case 6: lane_dir and its inverse are one pair, and both callers use it", () => {
  expectOk(`${PRELUDE}
assert L.lane_dir("stills", lane="reference", zoom=True, tag="-x") == "reference-zoom-x"
assert L.lane_dir("stills", lane="baseline") == "baseline"
assert L.lane_dir("clips", lane="chain") == "chain"
d = Path(tempfile.mkdtemp()) / "reference-zoom-x"
d.mkdir()
(d / "lane.json").write_text(json.dumps({"lane": "reference", "seed": 770425, "steps": 20}), encoding="utf-8")
rec = L.read(d)
assert rec["zoom"] is True and rec["tag"] == "-x", f"inverse parse gave zoom={rec['zoom']!r} tag={rec['tag']!r}"

def calls(path, fn):
    tree = ast.parse(Path(path).read_text(encoding="utf-8"))
    f = next(n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name == fn)
    return {ast.unparse(n.func) for n in ast.walk(f) if isinstance(n, ast.Call)}
assert "lane_record.lane_dir" in calls("pipeline/vlm-probe/consistency.py", "run_lane")
assert "lane_record.lane_dir" in calls("pipeline/vlm-probe/motion.py", "run")
assert "params_from_dir" in calls("pipeline/vlm-probe/lane_record.py", "read")
src = Path("pipeline/vlm-probe/consistency.py").read_text(encoding="utf-8")
consts = [n.value for n in ast.walk(ast.parse(src)) if isinstance(n, ast.Constant)]
assert "-zoom" not in consts, "consistency.py still spells the lane dir rule itself"
print("OK")
`);
});

test("Case 7 [guard]: the 8 tracked lanes replay to the argv they produced on b08bc7e", () => {
  expectOk(`${PRELUDE}
SNAPSHOT = [
["pipeline/vlm-probe/shots/baseline", ["consistency.py", "--lane", "baseline", "--steps", "20", "--seed", "770425"]],
["pipeline/vlm-probe/shots/baseline-zoom", ["consistency.py", "--lane", "baseline", "--zoom", "--steps", "20", "--seed", "770425"]],
["pipeline/vlm-probe/shots/reference", ["consistency.py", "--lane", "reference", "--steps", "20", "--seed", "770425"]],
["pipeline/vlm-probe/shots/reference-face-e25", ["consistency.py", "--lane", "reference", "--ref-crop", "face", "--late", "0.25", "--tag=-face-e25", "--steps", "20", "--seed", "770425"]],
["pipeline/vlm-probe/shots/reference-face-late", ["consistency.py", "--lane", "reference", "--ref-crop", "face", "--late", "0.45", "--tag=-face-late", "--steps", "20", "--seed", "770425"]],
["pipeline/vlm-probe/shots/reference-face-only", ["consistency.py", "--lane", "reference", "--ref-crop", "face", "--tag=-face-only", "--steps", "20", "--seed", "770425"]],
["pipeline/vlm-probe/clips/chain", ["motion.py", "--lane", "chain", "--width", "832", "--height", "480", "--length", "73", "--steps", "4"]],
["pipeline/vlm-probe/clips/ref2va", ["motion.py", "--lane", "ref2va", "--width", "832", "--height", "480", "--length", "73", "--steps", "4"]],
]
for path, want in SNAPSHOT:
    got = L.replay_argv(L.read(path))
    assert got == want, f"{path}: {got} != {want}"
print("OK")
`);
});

test("Case 8: a finished clip lane keeps its per-clip checksums", () => {
  // Critic's side finding: motion.run's final record_clip passed
  // beats=rec.get('beats') while write_shot stores clips under 'shots', so
  // every per-clip sha256 was erased the moment a clip lane finished.
  expectOk(`${PRELUDE}
import motion
tmp = Path(tempfile.mkdtemp())
hero = tmp / "hero.png"
hero.write_bytes(b"hero")
motion.CLIPS = tmp / "clips"
motion.stage_reference = lambda p: Path(p).name
motion.generate = lambda wf, timeout=0: None
def fake_collect(prefix, dest, length):
    f = dest / (prefix.split("-", 1)[-1] + "_c-last.png")
    f.write_bytes(("pixels " + prefix).encode())
    return {"c-last": f}
motion.collect = fake_collect
motion.guard.recycle_comfy = lambda *a: True
motion.guard.vram_ok = lambda: True
with contextlib.redirect_stdout(io.StringIO()):
    motion.run("chain", 832, 480, 73, 4, True, hero)
lane = motion.CLIPS / "chain"
rec = json.loads((lane / "lane.json").read_text(encoding="utf-8"))
shots = rec.get("shots", {})
assert sorted(shots) == ["01-turn_c-last", "02-walk_c-last", "03-look_c-last"], f"shots lost on completion: {sorted(shots)}"
assert all(s.get("sha256") for s in shots.values()), "a clip lost its sha256"
assert L.check(lane) == [], L.check(lane)
(lane / "02-walk_c-last.png").write_bytes(b"tampered")
assert L.check(lane) == [("02-walk_c-last", "pixels changed since record")], L.check(lane)
print("OK")
`);
});

test("Case 9: both CLIs take their lane flags from the table", () => {
  expectOk(`${PRELUDE}
def calls(path, fn):
    tree = ast.parse(Path(path).read_text(encoding="utf-8"))
    f = next(n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name == fn)
    return [n for n in ast.walk(f) if isinstance(n, ast.Call)]
def flags(path, fn):
    return {n.args[0].value for n in calls(path, fn)
            if ast.unparse(n.func).endswith("add_argument") and n.args and isinstance(n.args[0], ast.Constant)}
for path, fn in (("pipeline/vlm-probe/consistency.py", "build_arg_parser"), ("pipeline/vlm-probe/motion.py", "main")):
    assert "lane_record.add_lane_args" in {ast.unparse(n.func) for n in calls(path, fn)}, f"{path}:{fn} does not call add_lane_args"
    hand = flags(path, fn) & {p.flag for k in L.LANE_PARAMS for p in L.LANE_PARAMS[k] if p.flag}
    assert not hand, f"{path}:{fn} still declares lane flags by hand: {hand}"
print("OK")
`);
});
