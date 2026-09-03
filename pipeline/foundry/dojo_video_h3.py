"""Dojo serial-lane runner: Wan t2v vs MiniMax H3 ref2va, per-arm engines.

    python dojo_video_h3.py foundry-out/training/<cycle-id>

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
"""
import base64
import json
import shutil
import sys
import time
from pathlib import Path

HERE = Path(__file__).parent
PROBE = HERE.parent / "vlm-probe"
ROOT = HERE.parent.parent
sys.path.insert(0, str(PROBE))
sys.path.insert(0, str(HERE))
import guard  # noqa: E402
import motion  # noqa: E402
from consistency import stage_reference  # noqa: E402
from probe import run_ollama  # noqa: E402
from dojo_video import generate_video, posters, wan_workflow, NEG  # noqa: E402
import grade  # noqa: E402

W, H, LEN = 832, 480, 73  # H3's mod-17 law; wan matches for equal-duration pairs


def main():
    cdir = Path(sys.argv[1])
    if not cdir.is_absolute():
        cdir = ROOT / cdir
    spec = json.loads((cdir / "gen-spec.json").read_text(encoding="utf-8"))
    pairs_dir = cdir / "pairs"
    pairs_dir.mkdir(parents=True, exist_ok=True)
    rb_path = cdir / "readbacks.json"
    readbacks = json.loads(rb_path.read_text(encoding="utf-8")) if rb_path.exists() else {}
    model = spec.get("annotator", "qwen3.8:27b")

    units = [(p, arm) for p in spec["pairs"] for arm in ("baseline", "challenger")]
    todo = [(p, a) for p, a in units if not (pairs_dir / f"{p['id']}--{a}.webm").exists()
            and not (pairs_dir / f"{p['id']}--{a}.mp4").exists()]
    todo.sort(key=lambda u: u[0][u[1]].get("engine", "wan"))  # h3 first alphabetically? no: group only
    todo.sort(key=lambda u: 0 if u[0][u[1]].get("engine", "wan") == "wan" else 1)
    print(f"dojo_video_h3: {len(spec['pairs'])} duo(s), {len(todo)} clip(s) to render "
          f"(wan first, then h3) at {W}x{H}x{LEN}", flush=True)

    if todo:
        if guard.foreign_job():
            raise SystemExit(f"runner: busy — foreign job on the engine: {guard.foreign_job()}")
        guard.require(ram_gb=0, free=["ollama"], verbose=False)
        if guard.comfy_process_ids():
            guard.recycle_comfy("fresh engine for dojo serial lanes")
        elif not guard.start_comfy():
            raise SystemExit("ComfyUI is not running and could not be started")
        current_engine = None
        staged = {}
        for n, (p, arm) in enumerate(todo, 1):
            a = p[arm]
            engine = a.get("engine", "wan")
            if current_engine is not None and engine != current_engine:
                guard.recycle_comfy(f"engine switch {current_engine} -> {engine}")
            current_engine = engine
            if not guard.headroom_ok():
                guard.recycle_comfy("headroom")
            if engine == "wan":
                wf = wan_workflow(a["prompt"], p["seed"], W, H, LEN + 48,  # 121: wan's own sweet spot
                                  steps=20, prefix=f"dojo-{cdir.name}")
            else:
                ref = a["ref"]
                if ref not in staged:
                    src = Path(ref)
                    if not src.is_absolute():
                        src = ROOT / ref
                    staged[ref] = stage_reference(src)
                motion.SEED = p["seed"]  # motion._tail reads the module global
                wf = motion.ref2va_workflow(a["prompt"], staged[ref], W, H, LEN,
                                            steps=4, prefix=f"dojo-{cdir.name}")
            t0 = time.time()
            try:
                vid = generate_video(wf)
            except Exception as e:  # noqa: BLE001
                print(f"  [{n}/{len(todo)}] {p['id']}--{arm} FAILED: {str(e)[:90]}", flush=True)
                if not guard.recycle_comfy("after failure"):
                    break
                current_engine = None
                continue
            out = pairs_dir / f"{p['id']}--{arm}{Path(vid).suffix}"
            shutil.copy2(vid, out)
            out.with_suffix(".json").write_text(json.dumps(
                {"id": p["id"], "arm": arm, "engine": engine, "seed": p["seed"],
                 "prompt": a["prompt"], "ref": a.get("ref")}, indent=2, ensure_ascii=False), encoding="utf-8")
            posters(out, pairs_dir, f"{p['id']}--{arm}")
            print(f"  [{n}/{len(todo)}] {p['id']}--{arm} ({engine}) -> {time.time()-t0:.0f}s", flush=True)

    need = []
    for p, arm in units:
        key = f"{p['id']}--{arm}"
        vids = [f for f in (pairs_dir / f"{key}.webm", pairs_dir / f"{key}.mp4") if f.exists()]
        if vids:
            if not (pairs_dir / f"{key}--t0.png").exists():
                posters(vids[0], pairs_dir, key)
            if key not in readbacks:
                need.append((p, arm))
    if need:
        guard.require_model(model, vram_gb=20, ram_gb=guard.RAM_FLOOR_GB, free=["comfy"], verbose=False)
        for n, (p, arm) in enumerate(need, 1):
            key = f"{p['id']}--{arm}"
            entry = {}
            for tag in ("t0", "t1", "t2"):
                b64 = base64.b64encode((pairs_dir / f"{key}--{tag}.png").read_bytes()).decode("ascii")
                one = {}
                try:
                    text, _ = run_ollama(model, b64, "image/png")
                    one["craft"] = grade.parse(text)
                except Exception as e:  # noqa: BLE001
                    one["craft_error"] = str(e)[:200]
                entry[tag] = one
            readbacks[key] = entry
            rb_path.write_text(json.dumps(readbacks, indent=1, ensure_ascii=False), encoding="utf-8")
            print(f"  readback [{n}/{len(need)}] {key}", flush=True)

    rendered = sum(1 for p, a in units if (pairs_dir / f"{p['id']}--{a}.webm").exists()
                   or (pairs_dir / f"{p['id']}--{a}.mp4").exists())
    print(f"dojo_video_h3: done -- {rendered}/{len(units)} clip(s), {len(readbacks)}/{len(units)} read back", flush=True)


if __name__ == "__main__":
    main()
