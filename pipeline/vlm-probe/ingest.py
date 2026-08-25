"""Turn a video into a set of frames worth annotating.

    python ingest.py "https://youtube.com/watch?v=..." --compare
    python ingest.py media/clip.mp4 --strategy scene --threshold 0.30
    python ingest.py media/clip.mp4 --strategy fixed --every 10

Two jobs, and the second is the one that matters.

**Sampling.** A frame every N seconds is cut-blind: it samples one locked-off
shot four times and misses the insert between. Scene-change detection samples
the *cuts* instead, which is what a cinematography corpus is actually made of —
one frame per shot, because a shot is the unit a director composes.

**Keeping.** Extraction is cheap and annotation is not. Every frame kept costs
GPU seconds and, worse, a wrong frame costs corpus quality: a dissolve is two
shots averaged into a composition that was never on screen, and a near-black
fade has no cinematography in it at all. The gates below throw those out before
a model ever sees them.

`--compare` answers the frequency question empirically rather than by taste. It
runs every strategy over the same video and reports what each one costs and
what each one misses, using the scene cuts as the reference set of real shots.
"""

import argparse
import json
import re
import shutil
import subprocess
import sys
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).parent
MEDIA_DIR = HERE / "media"
FRAMES_DIR = HERE / "frames"

# --- gates ---------------------------------------------------------------
# Thresholds are deliberately permissive. Stylised animation is legitimately
# flat, dark and soft in ways live action is not, and a tight gate would throw
# away exactly the frames worth studying. These reject the indefensible only.

BLANK_STD = 12.0        # near-uniform frame: fades, blackouts, flash transitions
EDGE_MIN = 1.6          # almost no edge energy: dissolves, heavy motion smear
DUP_HAMMING = 6         # dHash distance under which two frames are the same shot


def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True,
                          encoding="utf-8", errors="replace", **kw)


def download(url, out_dir=MEDIA_DIR):
    """Fetch a single video at <=1080p. Local study copy; never versioned."""
    out_dir.mkdir(parents=True, exist_ok=True)
    tmpl = str(out_dir / "%(id)s.%(ext)s")
    print(f"downloading {url}")
    r = run(["yt-dlp", "--no-warnings", "--no-playlist",
             "-f", "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
             "--merge-output-format", "mp4", "-o", tmpl, "--print", "after_move:filepath",
             url])
    path = None
    for line in (r.stdout or "").splitlines():
        line = line.strip()
        if line and Path(line).exists():
            path = Path(line)
    if path is None:
        # --print can be swallowed when the file was already present
        existing = sorted(out_dir.glob("*.mp4"), key=lambda p: p.stat().st_mtime)
        if not existing:
            sys.exit(f"download failed:\n{r.stderr[-1500:]}")
        path = existing[-1]
    print(f"  -> {path} ({path.stat().st_size / 1e6:.0f} MB)")
    return path


def probe_duration(video):
    r = run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=nw=1:nk=1", str(video)])
    try:
        return float(r.stdout.strip())
    except ValueError:
        return 0.0


def extract(video, out_dir, strategy, every=10.0, threshold=0.30, max_width=1280):
    """Extract candidate frames; return [(index, timestamp_seconds, path)].

    Both strategies go through showinfo so every frame carries the timestamp
    it came from. Without that a frame is un-locatable in the source, and an
    annotation you cannot trace back to a moment is not evidence.
    """
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    if strategy == "scene":
        vf = f"select='gt(scene,{threshold})',showinfo"
    else:
        vf = f"select='not(mod(t\\,{every}))*eq(pict_type\\,I)+gte(t-prev_selected_t\\,{every})',showinfo"
    vf += f",scale='min({max_width},iw)':-2"

    r = run(["ffmpeg", "-hide_banner", "-i", str(video), "-vf", vf,
             "-vsync", "vfr", "-q:v", "3", str(out_dir / "f-%05d.jpg")])

    times = [float(m) for m in re.findall(r"pts_time:([0-9.]+)", r.stderr or "")]
    files = sorted(out_dir.glob("f-*.jpg"))
    out = []
    for i, p in enumerate(files):
        out.append((i, times[i] if i < len(times) else -1.0, p))
    return out


# --- frame quality -------------------------------------------------------

def dhash(img, size=8):
    g = np.asarray(img.convert("L").resize((size + 1, size)), dtype=np.int16)
    bits = (g[:, 1:] > g[:, :-1]).flatten()
    return int("".join("1" if b else "0" for b in bits), 2)


def hamming(a, b):
    return bin(a ^ b).count("1")


def measure(path):
    img = Image.open(path)
    small = img.convert("L").resize((160, 90))
    a = np.asarray(small, dtype=np.float32)
    gx = np.abs(np.diff(a, axis=1)).mean()
    gy = np.abs(np.diff(a, axis=0)).mean()
    return {"std": float(a.std()), "edge": float((gx + gy) / 2), "hash": dhash(img)}


def keep_or_throw(frames):
    """Apply the gates in order; return (kept, thrown_with_reason)."""
    kept, thrown, seen_hashes = [], [], []
    for idx, ts, path in frames:
        m = measure(path)
        if m["std"] < BLANK_STD:
            thrown.append((path, ts, "blank")); continue
        if m["edge"] < EDGE_MIN:
            thrown.append((path, ts, "no-detail")); continue
        dup = next((h for h in seen_hashes if hamming(h, m["hash"]) <= DUP_HAMMING), None)
        if dup is not None:
            thrown.append((path, ts, "duplicate")); continue
        seen_hashes.append(m["hash"])
        kept.append((idx, ts, path, m))
    return kept, thrown


def shots_covered(sample_times, cut_times, duration):
    """How many real shots a sampling strategy actually landed in.

    Cuts from scene detection bound the shots. A strategy 'covers' a shot if it
    sampled at least one frame inside it. This is the number that makes the
    frequency question answerable instead of arguable.
    """
    bounds = [0.0] + sorted(cut_times) + [duration]
    shots = [(bounds[i], bounds[i + 1]) for i in range(len(bounds) - 1)
             if bounds[i + 1] - bounds[i] > 0.4]
    hit = sum(1 for lo, hi in shots if any(lo <= t < hi for t in sample_times))
    return hit, len(shots)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source", help="YouTube URL or local video path")
    ap.add_argument("--strategy", choices=["scene", "fixed"], default="scene")
    ap.add_argument("--every", type=float, default=10.0)
    ap.add_argument("--threshold", type=float, default=0.30)
    ap.add_argument("--compare", action="store_true",
                    help="run every strategy and report the tradeoff")
    ap.add_argument("--prefix", default=None)
    ap.add_argument("--max-frames", type=int, default=0,
                    help="cap kept frames (evenly spread) when publishing to frames/")
    ap.add_argument("--publish", action="store_true",
                    help="copy kept frames into frames/ for probe.py")
    args = ap.parse_args()

    src = args.source
    video = Path(src) if not src.startswith("http") else download(src)
    if not video.exists():
        sys.exit(f"no such video: {video}")
    prefix = args.prefix or video.stem
    duration = probe_duration(video)
    work = HERE / ".ingest" / prefix
    print(f"{video.name}: {duration:.0f}s")

    # The cut list doubles as the reference set of shots for coverage scoring.
    scene_frames = extract(video, work / "scene", "scene", threshold=args.threshold)
    cut_times = [t for _, t, _ in scene_frames if t >= 0]
    print(f"scene detection (threshold {args.threshold}): {len(cut_times)} cuts "
          f"-> ~{len(cut_times) / max(duration, 1) * 60:.1f} cuts/min\n")

    if args.compare:
        rows = []
        plans = [("scene", dict(strategy="scene", threshold=args.threshold))]
        for n in (5, 10, 20):
            plans.append((f"fixed-{n}s", dict(strategy="fixed", every=float(n))))
        for name, kw in plans:
            frames = scene_frames if name == "scene" else extract(video, work / name, **kw)
            kept, thrown = keep_or_throw(frames)
            reasons = Counter(r for _, _, r in thrown)
            hit, total = shots_covered([t for _, t, _, _ in kept], cut_times, duration)
            rows.append((name, len(frames), len(kept), reasons, hit, total))

        print(f"| strategy | extracted | kept | thrown (blank/no-detail/dup) | shots covered |")
        print(f"|---|---|---|---|---|")
        for name, ex, kp, reasons, hit, total in rows:
            r = f"{reasons.get('blank',0)}/{reasons.get('no-detail',0)}/{reasons.get('duplicate',0)}"
            print(f"| {name} | {ex} | {kp} | {r} | {hit}/{total} ({100*hit/max(total,1):.0f}%) |")
        print("\nshots covered = distinct shots the strategy landed at least one frame in,")
        print("with scene-detected cuts as the shot boundaries.")
        return

    frames = scene_frames if args.strategy == "scene" else extract(
        video, work / "chosen", args.strategy, every=args.every)
    kept, thrown = keep_or_throw(frames)
    reasons = Counter(r for _, _, r in thrown)
    print(f"extracted {len(frames)}, kept {len(kept)}, threw {len(thrown)} {dict(reasons)}")

    if args.max_frames and len(kept) > args.max_frames:
        step = len(kept) / args.max_frames
        kept = [kept[int(i * step)] for i in range(args.max_frames)]
        print(f"capped to {len(kept)} evenly across the runtime")

    if args.publish:
        FRAMES_DIR.mkdir(parents=True, exist_ok=True)
        manifest = []
        for n, (idx, ts, path, m) in enumerate(kept, 1):
            dest = FRAMES_DIR / f"{prefix}-{n:03d}.jpg"
            shutil.copy2(path, dest)
            manifest.append({"frame": dest.name, "source": video.name,
                             "t_seconds": round(ts, 2), "std": round(m["std"], 1),
                             "edge": round(m["edge"], 2)})
        mf = FRAMES_DIR / f"{prefix}-manifest.json"
        mf.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        print(f"published {len(manifest)} frames -> {FRAMES_DIR}")
        print(f"provenance -> {mf}")


if __name__ == "__main__":
    main()
