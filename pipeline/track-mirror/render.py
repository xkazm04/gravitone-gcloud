"""Render YuE2 prompts by id, three seeds each, measure every take against the reference.

    python pipeline/track-mirror/render.py <track dir> <prompt id> [<prompt id> ...] [--seeds 4201,4202,4203]

<track dir> holds yue2-prompts.json (one prompt per hypothesis), abc/, analysis.json and source/. A take
that exists is not rendered again, so a rerun only adds what is missing. The card's lease is held for the
whole call. The page leads each prompt with the seed compare.py ranks closest.

A take reproduces from the score, both seeds and max_duration
(docs/concepts/yue2-audio-experiments-2026-11-06.md, rule 1), so all four are stored beside it.
"""

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import comfy  # noqa: E402

HERE = Path(__file__).resolve().parent
VENV = os.environ.get("TRACK_MIRROR_PYTHON", "C:/Users/kazda/ai/tools/track-mirror-venv/Scripts/python.exe")


def measure(track, audio, out):
    done = subprocess.run(
        [VENV, "-I", str(HERE / "compare.py"), str(track / "analysis.json"), str(audio), str(out),
         "--audio-ref", str(track / "source/tears-44k.wav")],
        capture_output=True, text=True, cwd=HERE.parents[1],
    )
    if done.returncode != 0:
        raise RuntimeError(f"compare failed on {audio}: {done.stderr[-600:]}")
    return json.loads(Path(out).read_text(encoding="utf-8"))


def summary(figures):
    keep = ("closeness", "duration_s", "bpm", "tempo_gap_pct", "key", "chord_hits", "entry_s", "energy_corr", "timbre_gap", "band_gap")
    return " ".join(f"{k}={figures[k]}" for k in keep)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("track")
    parser.add_argument("ids", nargs="+")
    parser.add_argument("--seeds", default="4201,4202,4203")
    args = parser.parse_args()
    track = Path(args.track)
    prompts = {p["id"]: p for p in json.loads((track / "yue2-prompts.json").read_text(encoding="utf-8"))["prompts"]}
    unknown = [i for i in args.ids if i not in prompts]
    if unknown:
        print(f"no such prompt: {unknown}")
        return 2
    seeds = [int(s) for s in args.seeds.split(",")]
    with comfy.Tenancy("track-mirror/yue2-" + "-".join(args.ids)[:40]):
        for prompt_id in args.ids:
            prompt = prompts[prompt_id]
            abc = (track / "abc" / prompt["score"]).read_text(encoding="utf-8") if prompt.get("score") else ""
            folder = track / "yue2" / prompt_id
            for seed in seeds:
                audio = folder / f"s{seed}.flac"
                meta = folder / f"s{seed}.json"
                if not audio.exists():
                    take = {**prompt, "abc": abc, "seed": seed, "name": f"{prompt_id}-s{seed}", "max_duration": 360.0}
                    seconds = comfy.render(take, audio)
                    meta.write_text(json.dumps({
                        "prompt": prompt_id, "seed": seed, "render_s": seconds, "max_duration": 360.0,
                        "mode": prompt["mode"], "score": prompt.get("score"),
                    }, indent=1), encoding="utf-8")
                figures = measure(track, audio, folder / f"s{seed}.figures.json")
                print(f"{prompt_id} s{seed}: {summary(figures)}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
