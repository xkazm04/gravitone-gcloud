"""Where in the arc does a trailer put its holds, its bursts and its longest shot?

    python beats.py --form long-cinematic
    python beats.py --form long-cinematic short-trailer scene

Cut rhythm answered *how fast* a source cuts. That is a summary statistic and
it says nothing about **structure** -- two sources with identical medians can
front-load their bursts or save them for the last twenty seconds, and only one
of those is a trailer shape worth copying.

So: normalise every source to 0-100% of its runtime, bin into deciles, and ask
what the editing does at each position. Different runtimes become comparable,
which is the whole point -- a 67-second cut-down and a 323-second cinematic
can then be asked the same question.

What comes out is a **positional profile**: a curve of shot length against
position in the arc. If several sources of one form share a profile, that
profile is the form's structure and can be generated against. If they do not,
the form has no shared structure and we should stop looking for one -- an
equally useful answer, and much cheaper to discover here than after building a
generator around an assumption.

Reporting rules carried from the rest of the pipeline: **per form, never
pooled** (a 67s cut-down and a 270s short have different shapes and averaging
them invents a third that neither has), and **n stated at every bin**, because
a decile of a 12-shot source holds one shot.
"""

import argparse
import json
import statistics as st
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from ingest import extract, probe_duration  # noqa: E402

HERE = Path(__file__).parent
MEDIA = HERE / "media"
WORK = HERE / ".ingest"
CORPUS = HERE / "corpus.json"
BINS = 10


def cut_list(src, threshold=0.30):
    """Cut timestamps for one source, cached -- detection is the slow part."""
    cache = WORK / f"{src['slug']}-cuts.json"
    if cache.exists():
        return json.loads(cache.read_text())
    video = MEDIA / f"{src['id']}.mp4"
    if not video.exists():
        return None
    frames = extract(video, WORK / f"{src['slug']}-beats", "scene", threshold=threshold)
    cuts = sorted(t for _, t, _ in frames if t >= 0)
    cache.write_text(json.dumps(cuts))
    return cuts


def profile(cuts, duration):
    """Median shot length per decile of runtime, plus structural landmarks."""
    shots = [(a, b - a) for a, b in zip(cuts, cuts[1:]) if b - a > 0.15]
    if len(shots) < BINS:
        return None
    bins = [[] for _ in range(BINS)]
    for start, length in shots:
        idx = min(int((start / duration) * BINS), BINS - 1)
        bins[idx].append(length)
    longest_at = max(shots, key=lambda s: s[1])
    # The burst is the tightest run of three consecutive shots -- a single
    # short shot is noise, three in a row is a decision.
    burst_at, burst_len = None, 1e9
    for i in range(len(shots) - 2):
        run = sum(s[1] for s in shots[i:i + 3])
        if run < burst_len:
            burst_len, burst_at = run, shots[i][0]
    return {
        "bins": [round(st.median(b), 2) if b else None for b in bins],
        "counts": [len(b) for b in bins],
        "longest_shot_s": round(longest_at[1], 1),
        "longest_at_pct": round(100 * longest_at[0] / duration),
        "burst_at_pct": round(100 * burst_at / duration) if burst_at is not None else None,
        "burst_3shot_s": round(burst_len, 2),
        "opening_shot_s": round(shots[0][1], 2),
        "closing_shot_s": round(shots[-1][1], 2),
    }


def bar(v, lo, hi, width=22):
    if v is None:
        return " " * width
    frac = min(max((v - lo) / max(hi - lo, 1e-6), 0), 1)
    return "#" * max(1, int(frac * width))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--form", nargs="*", default=["long-cinematic"])
    ap.add_argument("--threshold", type=float, default=0.30)
    args = ap.parse_args()

    corpus = json.loads(CORPUS.read_text(encoding="utf-8"))["sources"]

    for form in args.form:
        srcs = [s for s in corpus if s.get("form") == form]
        if not srcs:
            continue
        print(f"\n{'=' * 78}\n## {form}  (n={len(srcs)})\n")
        profiles = {}
        for s in srcs:
            cuts = cut_list(s, args.threshold)
            if not cuts:
                print(f"  {s['slug']}: no video")
                continue
            dur = probe_duration(MEDIA / f"{s['id']}.mp4")
            p = profile(cuts, dur)
            if not p:
                print(f"  {s['slug']}: too few shots ({len(cuts)}) for a decile profile")
                continue
            profiles[s["slug"]] = p
            print(f"  {s['slug']:24s} open {p['opening_shot_s']:5.1f}s | "
                  f"longest {p['longest_shot_s']:5.1f}s @ {p['longest_at_pct']:3d}% | "
                  f"burst @ {p['burst_at_pct']}% ({p['burst_3shot_s']}s/3 shots) | "
                  f"close {p['closing_shot_s']:5.1f}s")

        if len(profiles) < 2:
            continue
        print(f"\n  Median shot length by position in the arc (deciles):\n")
        allv = [v for p in profiles.values() for v in p["bins"] if v]
        lo, hi = min(allv), max(allv)
        for i in range(BINS):
            vals = [p["bins"][i] for p in profiles.values() if p["bins"][i]]
            n = sum(p["counts"][i] for p in profiles.values())
            if not vals:
                print(f"   {i * 10:3d}-{i * 10 + 10:3d}%   (no shots)")
                continue
            m = st.median(vals)
            print(f"   {i * 10:3d}-{i * 10 + 10:3d}%  {m:6.2f}s  n={n:3d}  {bar(m, lo, hi)}")
        print("\n  (median across sources of each source's median for that decile;"
              "\n   n = total shots contributed by all sources to that bin)")

        spread = [p["longest_at_pct"] for p in profiles.values()]
        print(f"\n  longest shot lands at: {sorted(spread)} (% of runtime)")
        bursts = [p["burst_at_pct"] for p in profiles.values() if p["burst_at_pct"] is not None]
        print(f"  tightest 3-shot burst lands at: {sorted(bursts)} (% of runtime)")


if __name__ == "__main__":
    main()
