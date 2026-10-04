"""Find the part of a clip that is actually moving, and stretch it to fill the run.

    python pipeline/video/retime.py in.mp4 out.mp4 --seconds 3

WHY. MiniMax H3 fl2va FRONT-LOADS. Measured 2026-09-09 on the blueprint swatch,
per-decile motion energy across a 73-frame clip:

    0.28  0.44  0.79  0.37  0.51  0.25  0.12  0.50  0.15  0.37

The build — drafting hatch filling the bars, annotation rings settling — is over
by about the third decile, roughly 1.2 s in. What follows is not stillness, it is
low-amplitude noise, which is worse: a viewer reads it as a clip that stopped.

That shape did not move under any generation setting tried. 25 steps without the
turbo LoRA made it weaker (mean 0.285). Pinning first_frame == last_frame
flattened the profile but reduced the motion to a slow breath. Extending to 124
frames let the model wander off the style entirely — a teal infographic with the
LoRA, a dashboard with pie charts and invented text without it. The engine has no
negative prompt input, so there is no way to forbid the wandering either.

So the fix is post-hoc and deterministic: KEEP THE PART THAT MOVES AND SLOW IT
DOWN. The clip is cut at the point its motion dies and the remainder is retimed
to the target duration, with optical-flow interpolation filling the frames that
slowing invents. A 1.2 s build stretched over 3 s is a slower build, which is
what a showcase wants anyway.

WHAT THIS IS NOT. It cannot add motion that was never generated. If a clip is
uniformly dead it stays dead, and this says so instead of stretching noise.
"""
import argparse
import subprocess
import sys
from pathlib import Path

import numpy as np

# THE MEASURE IS DISPLACEMENT FROM THE FIRST FRAME, not frame-to-frame
# difference, and the difference between those two is the whole reason this file
# works. Frame-to-frame energy stays busy right to the end of an H3 clip -- but
# it is noise, not progress, and a detector built on it kept 72 of 73 frames and
# changed nothing. Displacement asks the question a viewer actually asks: is the
# picture still BECOMING something? Measured on blueprint, as a percentage of
# its own peak, by decile:
#
#     local H3      21  33  65  94  98  99  99  99  99  99   <- arrives, then sits
#     hailuo-03     10  33  79 100  88  94  95  96  95  96   <- keeps moving
#
# The local clip has arrived by the fourth decile and every later frame is a
# repaint of the same picture. That is precisely what "it stops after a second
# and goes stale" looks like as a number.
ARRIVED_FRACTION = 0.95
# Never cut below this share of the clip: a profile that decays smoothly has no
# obvious knee, and over-trimming it would throw away real motion.
MIN_KEEP = 0.35


def displacement(video, width=160):
    """How far each frame has travelled from the first, in one decode pass.

    Greyscale raw frames straight off a pipe: decoding 73 frames one ffmpeg
    call at a time took longer than the render did.
    """
    probe_ = probe(video)
    h = 2 * round(width * 9 / 16 / 2) or 2
    r = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(video),
         "-vf", f"scale={width}:{h}", "-pix_fmt", "gray", "-f", "rawvideo", "-"],
        capture_output=True)
    buf = np.frombuffer(r.stdout, dtype=np.uint8)
    per = width * h
    n = len(buf) // per
    if n < 2:
        return []
    fr = buf[:n * per].reshape(n, per).astype(np.float64)
    return list(np.abs(fr - fr[0]).mean(axis=1))


def probe(video):
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_frames",
         "-show_entries", "stream=nb_read_frames,r_frame_rate:format=duration",
         "-of", "default=nw=1:nk=1", str(video)], capture_output=True, text=True)
    parts = r.stdout.split()
    num, den = (parts[0].split("/") + ["1"])[:2]
    return {"fps": float(num) / float(den or 1), "frames": int(parts[1]),
            "seconds": float(parts[2])}


def active_window(disp):
    """The frame at which the picture has ARRIVED, and why.

    Everything after it is the same picture being repainted, so it is the frame
    to cut at.
    """
    if not disp:
        return 0, "no frames"
    peak = max(disp)
    if peak <= 0:
        return len(disp), "no motion at all"
    target = peak * ARRIVED_FRACTION
    arrived = next((i for i, v in enumerate(disp) if v >= target), len(disp) - 1)
    keep = max(arrived + 1, int(len(disp) * MIN_KEEP))
    return min(keep, len(disp)), f"arrived at frame {arrived} of {len(disp)} ({arrived / len(disp) * 100:.0f}%)"


def retime(src, dest, seconds, fps=20, width=None):
    info = probe(src)
    keep, why = active_window(displacement(src))
    keep_frames = min(keep, info["frames"])
    # The PTS SPAN of n frames is (n-1)/fps, not n/fps -- the first frame sits
    # at time zero. Using n/fps here made a 3.0s request land at 2.8s, which the
    # refusal at the bottom caught. It is the kind of off-by-one that ships when
    # nothing measures the output.
    keep_seconds = max(keep_frames - 1, 1) / info["fps"]
    factor = seconds / keep_seconds

    scale = f",scale={width}:-2:flags=lanczos" if width else ""
    if factor > 1.02:
        # minterpolate INVENTS the frames that slowing asks for. Without it a
        # 2.5x stretch shows each source frame two or three times and reads as
        # a stutter, which is the defect being fixed, differently.
        vf = (f"trim=end_frame={keep_frames},setpts=(PTS-STARTPTS)*{factor:.4f}{scale},"
              f"minterpolate=fps={fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1")
    else:
        vf = f"trim=end_frame={keep_frames},setpts=PTS-STARTPTS{scale},fps={fps}"

    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(src),
                    "-vf", vf, "-an", "-r", str(fps),
                    "-c:v", "libvpx-vp9", "-crf", "28", "-b:v", "0", "-row-mt", "1",
                    "-pix_fmt", "yuv420p", str(dest)], check=True)
    out = probe(dest)
    return {"kept_frames": keep_frames, "kept_seconds": round(keep_seconds, 2),
            "factor": round(factor, 2), "why": why,
            "out_frames": out["frames"], "out_seconds": round(out["seconds"], 2)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dest")
    ap.add_argument("--seconds", type=float, default=3.0)
    ap.add_argument("--fps", type=int, default=20)
    ap.add_argument("--width", type=int, default=None)
    a = ap.parse_args()
    r = retime(Path(a.src), Path(a.dest), a.seconds, a.fps, a.width)
    print(f"  kept {r['kept_frames']} frames ({r['kept_seconds']}s) of the source — {r['why']}")
    print(f"  slowed {r['factor']}x -> {r['out_frames']} frames, {r['out_seconds']}s")
    if abs(r["out_seconds"] - a.seconds) > 0.15:
        sys.exit(f"REFUSING: asked for {a.seconds}s, got {r['out_seconds']}s")


if __name__ == "__main__":
    main()
