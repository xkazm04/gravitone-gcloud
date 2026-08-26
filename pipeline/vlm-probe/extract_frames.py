"""Cut a video into probe frames, one every N seconds.

    python extract_frames.py clip.mp4 --every 4
    python extract_frames.py clip.mp4 --every 4 --start 00:01:30 --duration 60
    python extract_frames.py clip.mp4 --every 4 --max-width 1280 --prefix arcane-s1e3

Writes into frames/ so probe.py picks them up on its next run.

Two things worth knowing before scaling this up. A frame every N seconds is
blind to cuts -- it will happily sample the same locked-off shot four times
and miss a whole insert -- so `--every` is a first approximation, and a
shot-boundary detector is what a real corpus wants. And a frame carries no
motion, so camera *movement* is unrecoverable from it: the schema asks for
lens, angle and light, all of which a still does hold, and deliberately does
not ask what the camera was doing.
"""

import argparse
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
FRAMES_DIR = HERE / "frames"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--every", type=float, default=5.0, help="seconds between frames")
    ap.add_argument("--start", default=None, help="seek before extracting, e.g. 00:01:30")
    ap.add_argument("--duration", default=None, help="seconds of video to cover")
    ap.add_argument("--max-width", type=int, default=1280,
                    help="downscale long edge; vision encoders tile anyway and "
                         "the bytes cost real upload time on the remote tier")
    ap.add_argument("--prefix", default=None, help="filename prefix (default: video stem)")
    ap.add_argument("--out", default=None, help="output dir (default: frames/)")
    args = ap.parse_args()

    src = Path(args.video)
    if not src.exists():
        sys.exit(f"no such video: {src}")

    out_dir = Path(args.out) if args.out else FRAMES_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    prefix = args.prefix or src.stem

    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error"]
    if args.start:
        cmd += ["-ss", args.start]
    cmd += ["-i", str(src)]
    if args.duration:
        cmd += ["-t", str(args.duration)]
    vf = f"fps=1/{args.every}"
    if args.max_width:
        vf += f",scale='min({args.max_width},iw)':-2"
    cmd += ["-vf", vf, "-q:v", "3", str(out_dir / f"{prefix}-%04d.jpg")]

    print(" ".join(cmd))
    subprocess.run(cmd, check=True)

    made = sorted(out_dir.glob(f"{prefix}-*.jpg"))
    print(f"{len(made)} frame(s) -> {out_dir}")


if __name__ == "__main__":
    main()
