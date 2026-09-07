"""Motion energy of a clip -- the number a poster triptych cannot give.

    python motion_energy.py <clip.webm> [<clip.webm> ...]

WHY THIS EXISTS. dojo_video.py judges a clip from three stills (t0 / t1 / t2)
read back in words, and the chokepoint rubric asks whether ONE readable move
happened. A DIRECTED near-still clip -- "almost still: a thin band of mist
drifts a fraction; the window light flickers once; the camera does not move"
-- is indistinguishable from a frozen render across three posters. On
2026-08-31 (training/2026-08-31-video-compose, pair v1-reset-still) the judge
called exactly that clip "the same frozen wide of a lit hut with nothing
advancing" and picked against it. Measured here, the clip moved:

    frozen floor (one PNG looped through the same VP9 encode)     0.000  max 0.0025
    v1-reset-still  challenger  "almost still", camera holds       0.210
    v1-reset-still  baseline    bare scene sentence, no motion     0.558
    v1-rung-advance challenger  three slow steps, camera holds     3.129
    v1-rung-advance baseline    bare scene sentence                8.547

Two orders of magnitude above the floor, and the posters could not see it.
The clip obeyed its brief and the harness scored the obedience as a defect.
That is the same mistake dojo_video.py's global NEG makes from the other
side: "static frame, frozen image, no motion" is written against a FAILURE
(a dead clip) and applied to every request, including the ones whose
contract is stillness. So "frozen" is a measurement here, not a poster
impression: at or under FROZEN_MAX the clip did not move; above it the clip
moved, whatever the posters say.

THE NUMBER. Mean luma (0-255) of the difference between consecutive frames,
at 320 px wide (ffmpeg: tblend=all_mode=difference + signalstats, YAVG per
frame). The first tblend frame is differenced against nothing and is dropped.

WHAT IT IS NOT. It cannot say WHAT moved -- a camera drift and a figure
twitch score alike -- and it does not judge whether the move was the one the
brief asked for. It is a pre-filter beside the readbacks, like everything in
dojo_measure.py: the human's pick is still the verdict.

Stdlib only, so selftest.py can exercise summarize() without a card or an
ffmpeg. yavg_series() needs ffmpeg on PATH (posters() already does).
"""
import re
import subprocess
import sys

# Ten times the measured VP9 floor (max 0.0025 on a looped PNG). Under it, the
# clip did not move. Calibrated once on 2026-09-07; recalibrate if the encode
# in dojo_video.py's SaveWEBM node changes codec or crf.
FROZEN_MAX = 0.01
SCALE_W = 320
_YAVG = re.compile(r"lavfi\.signalstats\.YAVG=([0-9.]+)")


def yavg_series(video, width=SCALE_W):
    """Per-frame mean luma of the consecutive-frame difference image."""
    vf = (f"scale={width}:-1,tblend=all_mode=difference,signalstats,"
          "metadata=print:key=lavfi.signalstats.YAVG:file=-")
    out = subprocess.run(["ffmpeg", "-v", "error", "-i", str(video), "-vf", vf, "-f", "null", "-"],
                         capture_output=True, text=True, check=True).stdout
    series = [float(m) for m in _YAVG.findall(out)]
    return series[1:]


def summarize(series):
    """mean / median / p90 / max over the series, and the frozen verdict.

    An empty series is UNMEASURED: frozen is None, never False -- a clip
    ffmpeg could not read has not been shown to move."""
    if not series:
        return {"n": 0, "mean": None, "median": None, "p90": None, "max": None, "frozen": None}
    s = sorted(series)
    n = len(s)
    mean = sum(s) / n
    return {"n": n, "mean": mean, "median": s[n // 2], "p90": s[min(n - 1, int(n * 0.9))],
            "max": s[-1], "frozen": mean <= FROZEN_MAX}


if __name__ == "__main__":
    for path in sys.argv[1:]:
        r = summarize(yavg_series(path))
        print(f"{path}  n={r['n']} mean={r['mean']:.3f} median={r['median']:.3f} "
              f"p90={r['p90']:.3f} max={r['max']:.3f}{'  FROZEN' if r['frozen'] else ''}")
