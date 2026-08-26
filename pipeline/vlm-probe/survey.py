"""Ingest the comparison set and measure its editing grammar.

    python survey.py                      # download + measure every source
    python survey.py --publish 30         # also publish 30 frames each for annotation
    python survey.py --only wow-shadowlands matrix-bullets

Runs layer 3 (sequence) and the cheap half of layer 5 (extraction) across
every source in corpus.json, and needs no GPU: cut timestamps come from
ffmpeg, and the statistics are arithmetic.

Doing this *first* is deliberate. It is the only stage that produces a
statement about filmmaking rather than a measurement about our own pipeline,
and it costs minutes. A corpus effort that leaves extraction until after all
the capture is built runs for months without saying anything.

Reporting rules this enforces, because each was a real failure mode:

- **Distribution over central tendency.** The Arcane source reads as
  "median 1.04 s, fast cutting" and is in fact bimodal -- 47 shots under half
  a second AND 30 over four. The median alone deletes the finding.
- **n per bucket, always.** A craft/duration table looks authoritative while
  resting on a handful of samples.
- **Per-source, never pooled by default.** Pooling six sources of different
  lengths lets the longest one write the conclusion.
"""

import argparse
import json
import statistics as st
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from ingest import FRAMES_DIR, download, extract, keep_or_throw, probe_duration  # noqa: E402

HERE = Path(__file__).parent
MEDIA = HERE / "media"
WORK = HERE / ".ingest"
CORPUS = HERE / "corpus.json"

BANDS = [("<0.5s", 0, 0.5), ("0.5-1s", 0.5, 1), ("1-2s", 1, 2),
         ("2-4s", 2, 4), ("4s+", 4, 1e9)]


def rhythm(cuts, duration):
    """Shot-length statistics from a cut list.

    Shots under ~0.15 s are dropped: at 24 fps that is three frames, below
    which a 'shot' is usually a detector artefact on a flash or a whip rather
    than a cut a human would count.
    """
    lens = [b - a for a, b in zip(cuts, cuts[1:]) if b - a > 0.15]
    if not lens:
        return None
    s = sorted(lens)
    bands = Counter()
    for L in lens:
        for name, lo, hi in BANDS:
            if lo <= L < hi:
                bands[name] += 1
                break
    return {
        "duration_s": round(duration, 1),
        "shots": len(lens),
        "cuts_per_min": round(len(lens) / (duration / 60), 1),
        "median_s": round(st.median(lens), 2),
        "mean_s": round(st.mean(lens), 2),
        "p10_s": round(s[len(s) // 10], 2),
        "p90_s": round(s[9 * len(s) // 10], 2),
        "max_s": round(max(lens), 1),
        "bands": {n: bands[n] for n, _, _ in BANDS},
        # Share of runtime spent in held shots vs bursts. Two sources can share
        # a median while spending their screen time completely differently,
        # and that split is closer to what an audience actually experiences.
        "share_time_in_shots_over_4s": round(
            sum(L for L in lens if L >= 4) / sum(lens), 2),
        "share_shots_under_1s": round(
            sum(1 for L in lens if L < 1) / len(lens), 2),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*", default=None)
    ap.add_argument("--publish", type=int, default=0,
                    help="publish N frames per source into frames/ for annotation")
    ap.add_argument("--threshold", type=float, default=0.30)
    args = ap.parse_args()

    corpus = json.loads(CORPUS.read_text(encoding="utf-8"))
    sources = corpus["sources"]
    if args.only:
        sources = [s for s in sources if s["slug"] in args.only]

    results = {}
    for src in sources:
        slug = src["slug"]
        video = MEDIA / f"{src['id']}.mp4"
        if not video.exists():
            try:
                video = download(src["url"])
            except SystemExit as e:
                print(f"{slug}: download failed -- {e}")
                continue
        dur = probe_duration(video)
        print(f"\n{slug} ({src['category']}): {dur:.0f}s")

        frames = extract(video, WORK / slug, "scene", threshold=args.threshold)
        cuts = [t for _, t, _ in frames if t >= 0]
        r = rhythm(cuts, dur)
        if not r:
            print("  no usable cuts")
            continue
        r["category"] = src["category"]
        r["medium"] = src["medium"]
        results[slug] = r
        print(f"  {r['shots']} shots, {r['cuts_per_min']}/min, median {r['median_s']}s, "
              f"p90 {r['p90_s']}s, longest {r['max_s']}s")
        print(f"  bands {r['bands']}")

        if args.publish:
            kept, thrown = keep_or_throw(frames)
            if len(kept) > args.publish:
                step = len(kept) / args.publish
                kept = [kept[int(i * step)] for i in range(args.publish)]
            import shutil
            FRAMES_DIR.mkdir(parents=True, exist_ok=True)
            manifest = []
            for n, (idx, ts, path, m) in enumerate(kept, 1):
                dest = FRAMES_DIR / f"{slug}-{n:03d}.jpg"
                shutil.copy2(path, dest)
                manifest.append({"frame": dest.name, "source": slug,
                                 "t_seconds": round(ts, 2)})
            (FRAMES_DIR / f"{slug}-manifest.json").write_text(
                json.dumps(manifest, indent=2), encoding="utf-8")
            print(f"  published {len(manifest)} frames")

        (WORK / f"{slug}-rhythm.json").write_text(json.dumps(r, indent=2), encoding="utf-8")

    if not results:
        return
    print("\n\n## Editing grammar across the set\n")
    print("| source | category | shots | cuts/min | median | p90 | longest | <1s | time in 4s+ holds |")
    print("|---|---|---|---|---|---|---|---|---|")
    for slug, r in sorted(results.items(), key=lambda x: -x[1]["cuts_per_min"]):
        print(f"| {slug} | {r['category']} | {r['shots']} | {r['cuts_per_min']} | "
              f"{r['median_s']}s | {r['p90_s']}s | {r['max_s']}s | "
              f"{100 * r['share_shots_under_1s']:.0f}% | "
              f"{100 * r['share_time_in_shots_over_4s']:.0f}% |")
    print("\n`<1s` = share of shots under a second (burst density).")
    print("`time in 4s+ holds` = share of RUNTIME spent in shots of 4s or longer.")
    print("A source can be high on both: that is a punctuated grammar, not a fast one.")
    (WORK / "survey.json").write_text(json.dumps(results, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
