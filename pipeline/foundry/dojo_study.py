"""Dojo corpus study: cross-analyze an annotated A-tier frame set into numbers
an improvement idea can stand on.

    python dojo_study.py analyze <prefix> [<prefix> ...] [--out stats.json]

A study reads the vlm-probe corpus annotations (qwen3.8:27b craft readbacks,
newest run per frame) for the named source prefixes and computes what a
prompt-surface assumption can be TESTED against:

  - per-source distributions of the craft fields (shot_size, camera_angle,
    composition, exposure, lighting_key/direction/quality, contrast, DoF);
  - the mean true_black_share, and how often light is motivated by a named
    in-world source (`light_sources` non-empty);
  - ADJACENCY over the sampled sequence: how long a run of consecutive frames
    holds the same shot size, and the step distribution on the size ladder
    between neighbours — the cut-rhythm facts FRAMES-SCENE-PROMPT.md's
    "vary from your neighbours" rule and shots.ts's SIZE_LADDER assume;
  - the composition x shot_size crosstab — the fact behind the
    crosshair-for-fast-cuts / thirds-for-holds mapping.

Numbers only. The IDEA extraction is a reasoning turn over this output, and an
idea earns a cycle only as a falsifiable claim the pair runner can A/B. Frames
never leave the machine and never become generation references; only words
cross over (the repo's standing acquisition rule).
"""
import argparse
import collections
import json
from pathlib import Path

HERE = Path(__file__).parent
PROBE_OUT = HERE.parent.parent / "vlm-probe-out"

SIZE_ORDER = ["extreme-wide", "wide", "full", "medium-full", "medium", "medium-close", "close", "extreme-close"]
FIELDS = ["shot_size", "camera_angle", "composition", "exposure", "depth_of_field",
          "lighting_key", "lighting_direction", "lighting_quality", "contrast", "subject_scale"]


def load(prefixes):
    """Newest qwen annotation per frame, filtered to the given prefixes."""
    rows = {}
    for results in sorted(PROBE_OUT.glob("*/results.jsonl"), key=lambda p: p.stat().st_mtime):
        for line in results.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            r = json.loads(line)
            if r.get("ok") and r.get("model") == "qwen3.8:27b" and r.get("repeat", 1) == 1 \
                    and isinstance(r.get("parsed"), dict):
                rows[r["frame"]] = r["parsed"]
    out = collections.defaultdict(dict)
    for frame, ann in rows.items():
        for p in prefixes:
            if frame.startswith(p):
                out[p][frame] = ann
    return out


def size_idx(v):
    for i, s in enumerate(SIZE_ORDER):
        if v and s in str(v):
            return i
    return None


def analyze(per_source):
    stats = {}
    for src, frames in per_source.items():
        ordered = [frames[f] for f in sorted(frames)]
        s = {"n": len(ordered), "fields": {}, "adjacency": {}, "lighting": {}, "crosstab": {}}
        for f in FIELDS:
            s["fields"][f] = dict(collections.Counter(str(a.get(f)) for a in ordered).most_common())
        # lighting depth
        blacks = [a.get("true_black_share") for a in ordered if isinstance(a.get("true_black_share"), (int, float))]
        s["lighting"]["true_black_share_mean"] = round(sum(blacks) / len(blacks), 3) if blacks else None
        s["lighting"]["motivated_source_rate"] = round(
            sum(1 for a in ordered if a.get("light_sources")) / len(ordered), 2)
        # adjacency: same-size run lengths + ladder steps between neighbours
        sizes = [size_idx(a.get("shot_size")) for a in ordered]
        runs, cur = [], 1
        steps = []
        for a, b in zip(sizes, sizes[1:]):
            if a is not None and b is not None:
                steps.append(abs(a - b))
            if a == b:
                cur += 1
            else:
                runs.append(cur)
                cur = 1
        runs.append(cur)
        s["adjacency"]["same_size_run_lengths"] = dict(collections.Counter(runs).most_common())
        s["adjacency"]["ladder_step_distribution"] = dict(collections.Counter(steps).most_common())
        s["adjacency"]["big_jump_rate_ge2"] = round(
            sum(1 for x in steps if x >= 2) / len(steps), 2) if steps else None
        # composition x size
        ct = collections.Counter((str(a.get("shot_size")), str(a.get("composition"))) for a in ordered)
        s["crosstab"]["size_x_composition"] = {f"{a} | {b}": n for (a, b), n in ct.most_common(12)}
        stats[src] = s
    return stats


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["analyze"])
    ap.add_argument("prefixes", nargs="+")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    per_source = load(args.prefixes)
    if not per_source:
        raise SystemExit(f"no annotated frames match prefixes {args.prefixes}")
    stats = analyze(per_source)
    text = json.dumps(stats, indent=1, ensure_ascii=False)
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
        print(f"wrote {args.out}: " + ", ".join(f"{k} n={v['n']}" for k, v in stats.items()))
    else:
        print(text)


if __name__ == "__main__":
    main()
