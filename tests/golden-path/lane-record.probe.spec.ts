// LANE — VLM PROBE LANE RECORD & REPLAY (dynamic).
//
// THE SEAM THIS GUARDS. The vlm-probe lane.json files are the reproducibility
// record for gitignored pixels. Previously, they omitted parameters choosing
// the output directory (tag, zoom), resolution, and models, were rewritten
// on a no-op resume over mismatched parameters, and motion lanes pinned machine-absolute
// paths.
//
// lane_record.py owns the v2 schema, legacy reading, command replay, integrity check,
// and resume validation that prevents parameter drift over existing pixels.
import { spawnSync } from "node:child_process";
import { test, expect } from "@playwright/test";

function runPython(code: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("python", ["-c", code], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 15000,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

test("Case 1: lane_record.replay_argv derives tag and matches consistency argparse kwargs", () => {
  const code = `
import sys
sys.path.insert(0, "pipeline/vlm-probe")
import lane_record, consistency

rec = lane_record.read("pipeline/vlm-probe/shots/reference-face-e25")
argv = lane_record.replay_argv(rec)
want = ["consistency.py", "--lane", "reference", "--ref-crop", "face", "--late", "0.25", "--tag=-face-e25", "--steps", "20", "--seed", "770425"]
assert argv == want, f"got {argv!r}, want {want!r}"

ap = consistency.build_arg_parser() if hasattr(consistency, "build_arg_parser") else None
if ap is None:
    ap = consistency.argparse.ArgumentParser()
    ap.add_argument("--lane", required=True, choices=["baseline", "reference"])
    ap.add_argument("--refs", type=int, default=1)
    ap.add_argument("--steps", type=int, default=20)
    ap.add_argument("--seed", type=int, default=770425)
    ap.add_argument("--zoom", action="store_true")
    ap.add_argument("--ref-crop", choices=["full", "face"], default="full")
    ap.add_argument("--late", type=float, default=0.0)
    ap.add_argument("--tag", default="")

args = ap.parse_args(argv[1:])
assert args.lane == rec["lane"]
assert args.ref_crop == rec["ref_crop"]
assert args.late == rec["reference_joins_at"]
assert args.tag == rec["tag"]
assert args.steps == rec["steps"]
assert args.seed == rec["seed"]
print("OK")
`;
  const res = runPython(code);
  expect(res.stderr).toBe("");
  expect(res.status).toBe(0);
  expect(res.stdout.trim()).toBe("OK");
});

test("Case 2: replay_argv on baseline-zoom contains --zoom and no --tag", () => {
  const code = `
import sys
sys.path.insert(0, "pipeline/vlm-probe")
import lane_record

rec = lane_record.read("pipeline/vlm-probe/shots/baseline-zoom")
argv = lane_record.replay_argv(rec)
assert "--zoom" in argv, f"expected --zoom in {argv}"
assert "--lane" in argv and argv[argv.index("--lane") + 1] == "baseline", f"bad lane in {argv}"
assert not any(a.startswith("--tag") for a in argv), f"unexpected tag in {argv}"
print("OK")
`;
  const res = runPython(code);
  expect(res.stderr).toBe("");
  expect(res.status).toBe(0);
  expect(res.stdout.trim()).toBe("OK");
});

test("Case 3: every one of the 8 tracked lane.json files reads and yields replay_argv", () => {
  const code = `
import sys
sys.path.insert(0, "pipeline/vlm-probe")
import lane_record

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
    rec = lane_record.read(p)
    assert rec is not None, f"failed to read {p}"
    argv = lane_record.replay_argv(rec)
    assert isinstance(argv, list) and len(argv) > 0, f"empty argv for {p}"
print("OK")
`;
  const res = runPython(code);
  expect(res.stderr).toBe("");
  expect(res.status).toBe(0);
  expect(res.stdout.trim()).toBe("OK");
});

test("Case 4: consistency.run_lane refuses resume with changed parameters (steps 20 -> 30)", () => {
  const code = `
import sys, tempfile, json
from pathlib import Path
sys.path.insert(0, "pipeline/vlm-probe")
import consistency, guard

tmp = Path(tempfile.mkdtemp())
shots_dir = tmp / "shots" / "baseline"
shots_dir.mkdir(parents=True)

# create 01-wide.png and lane.json with steps=20
(shots_dir / "01-wide.png").write_bytes(b"dummy image")
initial_lane_json = {
    "schema": "lane-record/2",
    "lane": "baseline",
    "steps": 20,
    "seed": 770425,
    "zoom": False,
    "tag": "",
    "shots": {"01-wide": "wide prompt"}
}
lane_file = shots_dir / "lane.json"
lane_file.write_text(json.dumps(initial_lane_json, indent=2), encoding="utf-8")
initial_bytes = lane_file.read_bytes()

# stub guard and SHOTS
consistency.SHOTS = tmp / "shots"
guard.start_comfy = lambda: True
guard.headroom_ok = lambda: True
generate_called = False
def fake_generate(*a, **k):
    global generate_called
    generate_called = True
    f = tmp / "out.png"
    f.write_bytes(b"generated")
    return f
consistency.generate = fake_generate

refused = False
try:
    consistency.run_lane("baseline", steps=30)
except SystemExit as e:
    refused = True
    msg = str(e)
    assert "steps 20 -> 30" in msg or "steps: 20 -> 30" in msg, f"expected steps mismatch message, got: {msg}"

assert refused, "expected run_lane to raise SystemExit"
assert not generate_called, "generate was called before resume check!"
assert lane_file.read_bytes() == initial_bytes, "lane.json was modified despite rejection"
print("OK")
`;
  const res = runPython(code);
  expect(res.stderr).toBe("");
  expect(res.status).toBe(0);
  expect(res.stdout.trim()).toBe("OK");
});

test("Case 5: consistency.run_lane writes shot record after each shot", () => {
  const code = `
import sys, tempfile, json
from pathlib import Path
sys.path.insert(0, "pipeline/vlm-probe")
import consistency, guard, lane_record

tmp = Path(tempfile.mkdtemp())
consistency.SHOTS = tmp / "shots"
guard.start_comfy = lambda: True
guard.headroom_ok = lambda: True

call_count = 0
def fake_generate(*a, **k):
    global call_count
    call_count += 1
    if call_count == 1:
        f = tmp / "shot1.png"
        f.write_bytes(b"pixel data shot 1")
        return f
    raise RuntimeError("generation failed on shot 2")

consistency.generate = fake_generate

failed = False
try:
    consistency.run_lane("baseline", steps=20)
except RuntimeError as e:
    failed = True
    assert "generation failed on shot 2" in str(e)

assert failed, "expected run_lane to fail on shot 2"

lane_file = tmp / "shots" / "baseline" / "lane.json"
assert lane_file.exists(), "lane.json was not written after shot 1!"

rec = lane_record.read(lane_file)
shots = rec.get("shots", {})
assert "01-wide" in shots, f"01-wide not in shots: {shots}"
shot1 = shots["01-wide"]
assert isinstance(shot1, dict), f"shot1 should be a dict, got {type(shot1)}"
assert "sha256" in shot1, f"sha256 missing in shot1: {shot1}"
assert "params" in shot1, f"params missing in shot1: {shot1}"
assert len(shots) == 1, f"expected exactly 1 shot, got {len(shots)}: {shots}"
print("OK")
`;
  const res = runPython(code);
  expect(res.stderr).toBe("");
  expect(res.status).toBe(0);
  expect(res.stdout.trim().endsWith("OK")).toBe(true);
});

test("Case 6: new stills record carries metadata and round-trips via replay_argv", () => {
  const code = `
import sys, tempfile
from pathlib import Path
sys.path.insert(0, "pipeline/vlm-probe")
import lane_record, consistency

tmp = Path(tempfile.mkdtemp()) / "lane.json"
rec = lane_record.record_stills(
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

assert rec["tag"] == "-face-e25"
assert rec["zoom"] is False
assert rec["width"] == 1280
assert rec["height"] == 720
assert rec["guidance"] == 4.0
assert rec["sampler"] == "euler"

models_str = str(rec["models"])
assert "flux2_dev_fp8mixed.safetensors" in models_str
assert "mistral_3_small_flux2_fp8.safetensors" in models_str
assert "flux2-vae.safetensors" in models_str

argv = lane_record.replay_argv(rec)
ap = consistency.argparse.ArgumentParser()
ap.add_argument("--lane", required=True, choices=["baseline", "reference"])
ap.add_argument("--refs", type=int, default=1)
ap.add_argument("--steps", type=int, default=20)
ap.add_argument("--seed", type=int, default=770425)
ap.add_argument("--zoom", action="store_true")
ap.add_argument("--ref-crop", choices=["full", "face"], default="full")
ap.add_argument("--late", type=float, default=0.0)
ap.add_argument("--tag", default="")

args = ap.parse_args(argv[1:])
assert args.lane == rec["lane"]
assert args.ref_crop == rec["ref_crop"]
assert args.late == rec["reference_joins_at"]
assert args.tag == rec["tag"]
assert args.steps == rec["steps"]
assert args.seed == rec["seed"]
print("OK")
`;
  const res = runPython(code);
  expect(res.stderr).toBe("");
  expect(res.status).toBe(0);
  expect(res.stdout.trim()).toBe("OK");
});

test("Case 7: motion record stores hero repo-relative and resolves legacy paths", () => {
  const code = `
import sys, tempfile
from pathlib import Path
sys.path.insert(0, "pipeline/vlm-probe")
import lane_record

ROOT = lane_record.ROOT
hero_path = ROOT / "pipeline" / "vlm-probe" / "shots" / "reference" / "00-hero.png"

rec = lane_record.record_clip(
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

assert rec["hero"] == "pipeline/vlm-probe/shots/reference/00-hero.png", f"hero not repo-relative: {rec['hero']}"

# legacy read of clips/chain/lane.json resolves hero to local checkout ROOT
chain_rec = lane_record.read("pipeline/vlm-probe/clips/chain")
resolved_hero = Path(chain_rec["hero"])
expected_hero = (ROOT / "pipeline" / "vlm-probe" / "shots" / "reference" / "00-hero.png").resolve()
assert resolved_hero == expected_hero, f"got {resolved_hero}, want {expected_hero}"
print("OK")
`;
  const res = runPython(code);
  expect(res.stderr).toBe("");
  expect(res.status).toBe(0);
  expect(res.stdout.trim()).toBe("OK");
});

test("Case 8: lane_record.check detects pixel changes", () => {
  const code = `
import sys, tempfile, hashlib
from pathlib import Path
sys.path.insert(0, "pipeline/vlm-probe")
import lane_record

tmp = Path(tempfile.mkdtemp())
img1 = tmp / "01-wide.png"
img1.write_bytes(b"wide pixels")
img2 = tmp / "02-medium.png"
img2.write_bytes(b"medium pixels")

rec = lane_record.record_stills(
    out_dir=tmp,
    lane="baseline",
    steps=20,
    seed=770425
)
lane_record.write_shot(tmp, "01-wide", img1, "wide prompt")
lane_record.write_shot(tmp, "02-medium", img2, "medium prompt")

# initially clean
findings = lane_record.check(tmp)
assert findings == [], f"expected clean check, got: {findings}"

# tamper 02-medium
img2.write_bytes(b"tampered medium pixels")
findings = lane_record.check(tmp)
assert findings == [("02-medium", "pixels changed since record")], f"unexpected findings: {findings}"
print("OK")
`;
  const res = runPython(code);
  expect(res.stderr).toBe("");
  expect(res.status).toBe(0);
  expect(res.stdout.trim()).toBe("OK");
});
