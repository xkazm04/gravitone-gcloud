"""Did the OBJECTS move, or did the picture just go soft?

    python pipeline/video/clip_check.py <clip.webm> [<clip.webm> ...]

pipeline/foundry/motion_energy.py answers "did anything move at all", and says
in its own header that it cannot say WHAT moved -- "a camera drift and a figure
twitch score alike". That gap is exactly the defect this pipeline shipped on
2026-09-09: six clips with healthy motion energy, every one of them a global
camera drift with the elements frozen inside it. The number was green and the
clips were wrong.

So three numbers, and between them they separate the two cases.

ENERGY -- mean luma of consecutive-frame differences, the same measure
motion_energy.py takes, restated here so one command answers the whole
question. It gates ONLY at the floor: under FROZEN the clip did not move at
all. It deliberately has no upper requirement -- see the note beside FROZEN for
the measurement that removed one.

CONCENTRATION -- of all the change between the first frame and the last, what
share falls in the busiest tenth of the frame. A camera drift moves every pixel
a little, including the background, so its change is spread thin and this runs
LOW. Objects moving against a held background put their change in a few places
and this runs HIGH. This is the number that catches the defect the other two
miss.

RETENTION -- how much of the FIRST frame's linework is still there in the
middle and at the end. It exists because CONCENTRATION alone was fooled: a
render where the curve and the circle VANISHED mid-clip scored 0.47 and passed,
because a deletion is change in exactly one place and that is what concentration
rewards. It is the WEAKEST of the three -- see _retention for what it cannot do
and for the sharper version that was built, measured and thrown away.

SHARPNESS -- variance of the Laplacian of the last frame over the first. A clip
that is drifting and re-interpolating loses edge definition; a clip whose
background is genuinely held keeps it. Under 1.0 the picture ended softer than
it started, which on a looping swatch is the thing the eye actually complains
about.

PALETTE (only when a source still is given) -- how far the clip's colours drift
from the picture it was made from. A video model asked to animate a style swatch
may animate it into a DIFFERENT style, and the earlier numbers are all blind to
that: they read greyscale edges. Measured on a local H3 render that replaced a
blueprint's blue and white with orange, red and yellow, retention still scored
0.92, because the bars stayed where they were. For a swatch whose whole job is
to show a palette, that is the disqualifying defect and nothing here could see
it. Compared as a coarse 3D colour histogram, intersection over union: 1.0 is
the same palette, and under PALETTE_FLOOR the clip is showing colours the style
does not own.

A PASS IS ENERGY AND CONCENTRATION. Retention is printed beside them as a
diagnostic and deliberately does not gate -- the docstring on _retention says
why, and says what was tried instead. The thresholds below are calibrated on this repo's own
clips (see CALIBRATION) and are a pre-filter, never the verdict -- the contact
strip and the human eye are still what decides. What they buy is that a
regression of the exact kind that shipped cannot ship again silently.

Needs ffmpeg on PATH, numpy and pillow.
"""
import io
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

# ── CALIBRATION, measured 2026-09-09 on the six clips that shipped ─────────
#
#   clip               energy  concen  sharp   what it actually is
#   blueprint           0.368    0.42   1.16   camera drift, elements frozen
#   chalk-argument      0.203    0.27   1.11   camera drift, elements frozen
#   signal-ledger       0.301    0.33   1.14   camera drift, elements frozen
#   data-neon           0.115    0.93   1.04   very nearly still
#   newsprint-cutout    0.344    0.49   1.10   surface texture, whole-field
#   paper-relief        0.491    0.57   1.01   parallax between paper layers
#
# CONCENTRATION IS THE DISCRIMINATOR. The three clips a human called "blurring,
# elements static" are the three under 0.45, and no other number separates them:
# their energy overlaps the passing clips' completely.
#
# SHARPNESS earns its place, though not at first: read against the LAST frame it
# caught nothing, because a drifting Wan render re-interpolates edges and can
# score over 1.0. Read against the frame that differs MOST from the first -- the
# fix that ping-pong loops forced -- it fails data-neon at 0.79, whose motion is
# a glow that blooms and takes the edges with it. The softness a viewer reports
# is usually the drift; sometimes it is genuinely this.
# ENERGY GATES ONLY AT THE FLOOR, and the reason is measured. A high energy
# threshold assumes a clip that moves is a clip where a lot of the picture
# changes -- true of a camera drift, false of the thing we actually want. The
# first composited clip (one small circle gliding across a held background, the
# best clip this pipeline has produced) scored 0.143 against a 0.15 floor and
# was failed by it, while every camera drift cleared it. A floor calibrated on
# the defect rejects the fix. Its only prior catch, data-neon at 0.115, was a
# subtle clip and not obviously a defect at all.
#
# So: FROZEN says nothing happened, CONCENTRATION says the wrong thing happened,
# and "not very much happened" is left to the eye, which can tell a restrained
# clip from a dead one and an arithmetic mean cannot.
FROZEN = 0.01
MIN_CONCENTRATION = 0.45
MIN_SHARPNESS = 0.85
# Calibrated 2026-09-09 with the ground removed (see _palette): blueprint's own
# good clip scores well above this and the orange-and-red repaint well below.
PALETTE_FLOOR = 0.55
# 4 levels per channel: 64 buckets. Fine enough to separate blue-and-white from
# orange-and-yellow, coarse enough that a compression shift does not register.
PALETTE_BINS = 4

# The busiest tenth. Not a tunable: it is the definition of "concentrated".
BUSY_FRACTION = 0.10
SCALE_W = 320


def _frames(video, which):
    """Decode the named frame indices to greyscale float arrays, 320px wide."""
    out = {}
    for n in which:
        r = subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(video),
             "-vf", f"select='eq(n\\,{n})',scale={SCALE_W}:-2", "-frames:v", "1",
             "-f", "image2pipe", "-vcodec", "png", "-"],
            capture_output=True)
        if r.returncode != 0 or not r.stdout:
            raise RuntimeError(f"could not read frame {n} of {video}")
        out[n] = np.asarray(Image.open(io.BytesIO(r.stdout)).convert("L"), dtype=np.float64)
    return out


def _count(video):
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_frames",
         "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", str(video)],
        capture_output=True, text=True)
    return int((r.stdout.strip() or "0").split(",")[0] or 0)


def energy(video):
    """Mean luma of the consecutive-frame difference, over the whole clip.

    Same instrument as pipeline/foundry/motion_energy.py, in one ffmpeg pass.
    """
    vf = (f"scale={SCALE_W}:-1,tblend=all_mode=difference,signalstats,"
          f"metadata=print:file=-")
    r = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(video),
         "-vf", vf, "-an", "-f", "null", "-"],
        capture_output=True, text=True)
    vals = [float(line.split("=")[1]) for line in r.stdout.splitlines()
            if "signalstats.YAVG" in line]
    # The first tblend frame is differenced against nothing.
    vals = vals[1:]
    return sum(vals) / len(vals) if vals else 0.0


def _edges(a):
    """Edge magnitude, as a plain gradient. No scipy: this is two subtractions."""
    gy = np.abs(np.diff(a, axis=0))[:, :-1]
    gx = np.abs(np.diff(a, axis=1))[:-1, :]
    return gx + gy


def _retention(e0, mask, later_edges):
    """How much of frame 0's ink is still inside frame 0's ink mask later.

    Sampled at three moments rather than only the end, because the failure this
    catches is a dissolve AND A RETURN -- v5-travel lost its curve by frame 25
    and had it back by frame 100, and an endpoint check called that perfect.

    WHAT THIS NUMBER CANNOT DO, and a rejected attempt at fixing it. Measured
    globally it ranks correctly but separates weakly: v5-travel, whose curve and
    circle vanished for half the clip, scored 0.80 against 0.84-0.89 for renders
    that kept every line. The lost curve is thin, so it is a small share of the
    frame's ink. The obvious fix -- score 8x8 tiles and take the worst -- was
    built and REJECTED on measurement: it fails every clip that moves, because
    ink translating out of a tile is arithmetically identical to ink deleted
    from it. It scored paper-relief, whose layers plainly survive their
    parallax, at 0.01. A gate that cannot tell motion from deletion is worse
    than no gate.

    So the threshold is set low, to catch only gross dissolution, and this file
    keeps saying what it always says: the contact strip is what decides.
    """
    ink0 = np.where(mask, e0, 0.0)
    base = float(ink0.sum())
    if base <= 0:
        return 1.0
    return min(float(np.where(mask, e, 0.0).sum()) / base for e in later_edges)


def _palette(rgb):
    """A coarse 3D colour histogram of the INK, normalised.

    THE BACKGROUND IS DROPPED FIRST, and that is what makes this work. Measured
    2026-09-09: a clip that repainted a blueprint's bars orange, red and yellow
    scored 0.90 against the swatch on a plain histogram, because the blue ground
    is most of the frame and swamps everything drawn on it. Removing the single
    largest bucket -- always the ground on a swatch of this kind -- leaves the
    marks, which is where a style's palette actually lives.
    """
    q = (rgb.astype(np.int32) * PALETTE_BINS // 256).clip(0, PALETTE_BINS - 1)
    idx = (q[..., 0] * PALETTE_BINS + q[..., 1]) * PALETTE_BINS + q[..., 2]
    h = np.bincount(idx.ravel(), minlength=PALETTE_BINS ** 3).astype(np.float64)
    h[h.argmax()] = 0.0
    return h / max(h.sum(), 1.0)


def palette_drift(video, source, at=None):
    """Histogram intersection between the source still and the clip's frames.

    The MINIMUM across sampled frames, not the mean: a clip that is faithful for
    four seconds and then turns yellow has turned yellow.
    """
    src = _palette(np.asarray(Image.open(source).convert("RGB").resize((160, 96))))
    worst = 1.0
    for n in at:
        r = subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(video),
             "-vf", f"select='eq(n\\,{n})',scale=160:96", "-frames:v", "1",
             "-f", "image2pipe", "-vcodec", "png", "-"], capture_output=True)
        if not r.stdout:
            continue
        got = _palette(np.asarray(Image.open(io.BytesIO(r.stdout)).convert("RGB")))
        worst = min(worst, float(np.minimum(src, got).sum()))
    return worst


def _laplacian_var(a):
    """Edge definition. The 4-neighbour Laplacian, variance of the response."""
    lap = (-4 * a[1:-1, 1:-1] + a[:-2, 1:-1] + a[2:, 1:-1] + a[1:-1, :-2] + a[1:-1, 2:])
    return float(lap.var())


def inspect(video, source=None):
    n = _count(video)
    if n < 3:
        raise RuntimeError(f"{video} has {n} frame(s)")

    # THE FAR FRAME IS FOUND, NOT ASSUMED. Comparing frame 0 with the LAST frame
    # is wrong for any clip that returns to where it started, and the composited
    # clips are all ping-pongs -- forward then reversed, so the loop closes with
    # no snap. Measured 2026-09-09: a correct composited clip scored 0.00
    # concentration and "barely moves", because its last frame IS its first.
    # So sample across the clip and take the frame that differs most from the
    # first; on a one-way clip that is the last frame anyway.
    probe_at = sorted({int(round(i * (n - 1) / 8)) for i in range(9)})
    f = _frames(video, probe_at)
    first = f[probe_at[0]]
    far_at = max(probe_at[1:], key=lambda k: float(np.abs(f[k] - first).sum()))
    last = f[far_at]

    diff = np.abs(last - first).ravel()
    total = diff.sum()
    if total <= 0:
        concentration = 0.0
    else:
        k = max(1, int(len(diff) * BUSY_FRACTION))
        # np.partition puts the k largest at the end without a full sort.
        concentration = float(np.partition(diff, -k)[-k:].sum() / total)

    s0 = _laplacian_var(first)
    sharpness = float(_laplacian_var(last) / s0) if s0 > 0 else 0.0

    # RETENTION. Frame 0's strongest edges are the drawing; ask how much of that
    # ink is still inside the same mask later. Sampled at the middle and the end
    # rather than only the end, because the failure this catches is a dissolve
    # and a return -- v5-travel lost its curve at frame 25 and had it back by
    # frame 100, and an endpoint check would have called that clip perfect.
    e0 = _edges(first)
    mask = e0 >= np.quantile(e0, 0.97)
    retention = _retention(e0, mask, [_edges(f[k]) for k in probe_at[1:]])

    e = energy(video)
    palette = palette_drift(video, source, probe_at) if source else None
    reasons = []
    if e < FROZEN:
        reasons.append(f"frozen ({e:.3f} < {FROZEN})")
    if concentration < MIN_CONCENTRATION:
        reasons.append(
            f"change is spread across the whole frame ({concentration:.2f} < "
            f"{MIN_CONCENTRATION}) — a camera move, not objects moving")
    # RETENTION IS REPORTED, NOT GATED. See _retention: it cannot separate ink
    # that MOVED out of the mask from ink that was DELETED, so a clip whose whole
    # surface genuinely slides scores like a clip that dissolved. paper-relief,
    # a correct render, reads 0.18. Comparing variants of ONE source image it is
    # informative -- among the blueprint renders it ranked the vanishing one
    # last -- and as a threshold across different images it is worthless.
    if sharpness < MIN_SHARPNESS:
        reasons.append(f"ends softer than it starts ({sharpness:.2f} < {MIN_SHARPNESS})")
    if palette is not None and palette < PALETTE_FLOOR:
        reasons.append(
            f"the colours leave the style ({palette:.2f} < {PALETTE_FLOOR}) — "
            f"this clip is not showing the swatch's palette")

    return {
        "clip": str(video),
        "frames": n,
        "far_frame": far_at,
        "energy": round(e, 4),
        "concentration": round(concentration, 4),
        "retention": round(retention, 4),
        "palette": None if palette is None else round(palette, 4),
        "sharpness": round(sharpness, 4),
        "ok": not reasons,
        "reasons": reasons,
    }


def main():
    argv = sys.argv[1:]
    # --source <still> turns the palette check on; without it that column is
    # blank rather than guessed at.
    source = None
    if "--source" in argv:
        i = argv.index("--source")
        source = Path(argv[i + 1])
        argv = argv[:i] + argv[i + 2:]
    args = [a for a in argv if not a.startswith("--")]
    as_json = "--json" in argv
    rows = [inspect(Path(a), source) for a in args]
    if as_json:
        print(json.dumps(rows, indent=2))
        return
    print(f"\n  {'clip':26s} {'energy':>8s} {'concen':>8s} {'retain':>8s} {'sharp':>7s} {'palette':>8s}  verdict")
    for r in rows:
        pal = "     n/a" if r["palette"] is None else f"{r['palette']:8.2f}"
        print(f"  {Path(r['clip']).stem:26s} {r['energy']:8.3f} {r['concentration']:8.2f} "
              f"{r['retention']:8.2f} {r['sharpness']:7.2f} {pal}  {'OK' if r['ok'] else 'FAIL'}")
        for why in r["reasons"]:
            print(f"      · {why}")
    print()
    sys.exit(0 if all(r["ok"] for r in rows) else 1)


if __name__ == "__main__":
    main()
