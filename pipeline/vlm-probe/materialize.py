"""Re-materialize the corpus frames from corpus.lock.json, verifying what comes back.

    python materialize.py --dry              # list what is missing / wrong; fetch nothing
    python materialize.py                    # fetch missing sources, extract at t_seconds, verify
    python materialize.py --build-lock       # regenerate corpus.lock.json from frames/*-manifest.json

Each frame verifies to one of three outcomes:
    exact     sha256 matches the lock
    near      sha256 differs but the perceptual hash is within NEAR_HAMMING (codec drift)
    mismatch  a different picture (or unreadable) -- exit 1, and a freshly extracted
              mismatch is NOT kept
``--dry`` exits 0 when frames are merely missing and 1 when a present file mismatches.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import frame_manifest  # noqa: E402

FRAMES_DIR = HERE / "frames"
LOCK = HERE / "corpus.lock.json"
CORPUS = HERE / "corpus.json"
NEAR_HAMMING = 8  # of 64 bits; same shot re-encoded sits well under this, a different shot well over


def classify(path, entry):
    """exact | near | mismatch for a file that exists."""
    try:
        if frame_manifest.sha256_file(path) == entry["sha256"]:
            return "exact"
        if entry.get("phash") and frame_manifest.hamming_hex(frame_manifest.phash_file(path), entry["phash"]) <= NEAR_HAMMING:
            return "near"
    except Exception:  # an unreadable/corrupt jpg is a mismatch, not a crash
        pass
    return "mismatch"


def plan(lock, frames_dir):
    rows = []
    for name, entry in lock["frames"].items():
        p = Path(frames_dir) / name
        rows.append((name, entry, "missing" if not p.exists() else classify(p, entry)))
    return rows


def extract_at(video, t, dest):
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", str(t), "-i", str(video),
           "-frames:v", "1", "-vf", "scale='min(1280,iw)':-2", "-q:v", "3", str(dest)]
    return subprocess.run(cmd, capture_output=True).returncode == 0 and Path(dest).exists()


def fetch_missing(rows, frames_dir, corpus_path=CORPUS, download=None, extract=extract_at):
    """Fetch each missing entry's source once, extract at t_seconds, keep only exact/near."""
    urls = {s["slug"]: s["url"] for s in json.loads(Path(corpus_path).read_text(encoding="utf-8"))["sources"]}
    if download is None:
        import ingest  # heavy imports (numpy/PIL) only when really fetching
        download = ingest.download
    videos, out = {}, []
    for name, entry, state in rows:
        if state != "missing":
            out.append((name, entry, state))
            continue
        slug = entry["slug"]
        if slug not in videos:
            videos[slug] = download(urls[slug]) if slug in urls else None
        dest = Path(frames_dir) / name
        Path(frames_dir).mkdir(parents=True, exist_ok=True)
        if videos[slug] is None or not extract(videos[slug], entry["t_seconds"], dest):
            out.append((name, entry, "mismatch"))
            continue
        state = classify(dest, entry)
        if state == "mismatch":
            dest.unlink()
        out.append((name, entry, state))
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry", action="store_true", help="report only; fetch nothing")
    ap.add_argument("--build-lock", action="store_true", help="regenerate corpus.lock.json from the manifests")
    ap.add_argument("--lock", default=str(LOCK))
    ap.add_argument("--frames", default=str(FRAMES_DIR))
    args = ap.parse_args(argv)

    if args.build_lock:
        lock = frame_manifest.build_lock(args.frames, CORPUS)
        Path(args.lock).write_text(json.dumps(lock, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"lock: {len(lock['frames'])} frames -> {args.lock}")
        return 0

    lock = json.loads(Path(args.lock).read_text(encoding="utf-8"))
    rows = plan(lock, args.frames)
    if not args.dry:
        rows = fetch_missing(rows, args.frames)
    counts = {}
    for name, _, state in rows:
        counts[state] = counts.get(state, 0) + 1
        if state in ("missing", "mismatch", "near"):
            print(f"  {state:8s} {name}")
    print(f"{len(rows)} frames: " + ", ".join(f"{k} {v}" for k, v in sorted(counts.items())))
    return 1 if counts.get("mismatch") else 0


if __name__ == "__main__":
    sys.exit(main())
