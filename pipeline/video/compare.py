"""Put clips side by side, correctly, so a human can judge them.

    python pipeline/video/compare.py out.mp4 \
        "Local H3=pipeline/runs/preset-clips/blueprint.mp4" \
        "Leonardo=pipeline/runs/preset-clips/blueprint-hailuo-03.mp4"

WHY THIS IS A FILE. Four comparison videos were hand-rolled before this one and
every single one had a timestamp bug. The last shipped a grid whose panes were
60 frames tagged 20 fps -- three seconds of content -- inside a container that
claimed 15.6 seconds, so it played as a slideshow and the operator, correctly,
stopped trusting the comparison rather than the clips.

The cause each time was the same shape of mistake: `-stream_loop` and the `trim`
filter both leave the SOURCE timestamps on the frames they pass. `setpts` has to
reset them, `fps` has to be applied in the right order, and every input has to
be padded to identical pixel dimensions before a stack will even accept them.
Getting that right once and calling it is the whole point.

WHAT IT GUARANTEES, and then verifies by probing its own output:

  · every pane is exactly `--seconds` long, looped if the source is shorter and
    cut if longer, so panes of different lengths stay in step
  · one constant frame rate across the whole grid
  · identical pane dimensions, letterboxed rather than stretched, so a 16:9 clip
    and a 4:3 clip can sit next to each other without either one lying about
    its own shape
  · a readable label burnt into each pane

It REFUSES to write a file whose measured duration disagrees with what was
asked for. A comparison you cannot trust is worse than no comparison, because
it sends the argument after the wrong defect.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

PANE_W, PANE_H = 560, 336
FPS = 20
SECONDS = 4.0


def probe(path):
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_frames",
         "-show_entries", "stream=width,height,nb_read_frames:format=duration",
         "-of", "json", str(path)], capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"cannot read {path}: {r.stderr.strip()[:200]}")
    j = json.loads(r.stdout)
    s = (j.get("streams") or [{}])[0]
    return {"width": s.get("width", 0), "height": s.get("height", 0),
            "frames": int(s.get("nb_read_frames") or 0),
            "seconds": float((j.get("format") or {}).get("duration") or 0)}


def esc(text):
    """drawtext eats colons, backslashes and quotes."""
    return text.replace("\\", "\\\\").replace(":", "\\:").replace("'", "")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("panes", nargs="+", help='"Label=path/to/clip.mp4"')
    ap.add_argument("--seconds", type=float, default=SECONDS)
    ap.add_argument("--fps", type=int, default=FPS)
    ap.add_argument("--pane-width", type=int, default=PANE_W)
    ap.add_argument("--pane-height", type=int, default=PANE_H)
    ap.add_argument("--cols", type=int, default=0, help="0 picks a near-square grid")
    a = ap.parse_args()

    items = []
    for p in a.panes:
        label, _, path = p.partition("=")
        if not path:
            label, path = Path(label).stem, label
        path = Path(path)
        if not path.exists():
            raise SystemExit(f"no such clip: {path}")
        items.append((label, path, probe(path)))

    n = len(items)
    cols = a.cols or (1 if n == 1 else 2 if n <= 4 else 3)
    rows = (n + cols - 1) // cols
    if rows * cols != n:
        raise SystemExit(f"{n} panes do not fill a {cols}x{rows} grid; pass --cols")

    print(f"comparing {n} clip(s) at {a.seconds}s, {a.fps}fps, {cols}x{rows}")
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y"]
    for _, path, info in items:
        # LOOP AT THE DEMUXER, CUT AT THE DEMUXER. -stream_loop repeats the input
        # and -t stops it; doing both before -i means the filter graph never sees
        # a timestamp it has to repair. Enough loops to cover the window, and one
        # spare so rounding cannot leave the last frames short.
        loops = 0 if info["seconds"] >= a.seconds else int(a.seconds / max(info["seconds"], 0.04)) + 1
        cmd += ["-stream_loop", str(loops), "-t", f"{a.seconds}", "-i", str(path)]

    parts, tags = [], []
    for i, (label, _, _) in enumerate(items):
        tag = f"p{i}"
        parts.append(
            f"[{i}:v]scale={a.pane_width}:{a.pane_height}:force_original_aspect_ratio=decrease,"
            f"pad={a.pane_width}:{a.pane_height}:(ow-iw)/2:(oh-ih)/2,setsar=1,"
            f"fps={a.fps},setpts=PTS-STARTPTS,"
            f"drawtext=text='{esc(label)}':x=10:y=8:fontsize=17:fontcolor=white:"
            f"box=1:boxcolor=black@0.7:boxborderw=5[{tag}]")
        tags.append(tag)

    row_tags = []
    for r in range(rows):
        row = tags[r * cols:(r + 1) * cols]
        if cols == 1:
            row_tags.append(row[0])
        else:
            parts.append("".join(f"[{t}]" for t in row) + f"hstack=inputs={cols}[r{r}]")
            row_tags.append(f"r{r}")
    if rows == 1:
        final = row_tags[0]
    else:
        parts.append("".join(f"[{t}]" for t in row_tags) + f"vstack=inputs={rows}[grid]")
        final = "grid"

    cmd += ["-filter_complex", ";".join(parts), "-map", f"[{final}]",
            # -r pins a constant output rate; without it the muxer can infer one
            # from timestamps and land somewhere neither input asked for.
            "-r", str(a.fps), "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p",
            "-movflags", "+faststart", a.out]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"ffmpeg failed:\n{r.stderr.strip()[-1200:]}")

    # VERIFY OUR OWN OUTPUT. This is the check whose absence produced four bad
    # comparison videos in a row.
    got = probe(a.out)
    want_frames = round(a.seconds * a.fps)
    ok = abs(got["seconds"] - a.seconds) <= 0.15 and abs(got["frames"] - want_frames) <= 2
    for label, path, info in items:
        print(f"  {label:34s} {info['width']}x{info['height']} "
              f"{info['frames']}f {info['seconds']:.2f}s")
    print(f"  -> {a.out}  {got['width']}x{got['height']} {got['frames']}f {got['seconds']:.2f}s")
    if not ok:
        raise SystemExit(
            f"REFUSING this file: asked for {a.seconds:.2f}s / {want_frames} frames, "
            f"got {got['seconds']:.2f}s / {got['frames']}. Do not judge clips by it.")


if __name__ == "__main__":
    main()
