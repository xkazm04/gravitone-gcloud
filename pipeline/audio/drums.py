"""The drum voice - one four-bar groove played on one kit.

A kit is a folder of one-shots named by piece (FL Studio's HQ kits: "Kick 1 HQ Jazz #4.wav",
"HH Closed ...", "Snare Hit ..."; Ableton's 808: "Kick 808 ...", "Snare 808 ...", "Cymbal 808
..."). Every kit plays the SAME groove at the seed's tempo, so swapping one kit for another holds
the rhythm still and only the kit changes - the audition rule (./audition.py), for drums.

The groove thins with the shape's level, the way the melodic voices do: quiet is the hats alone,
steady adds the kick, lifting adds the snare, full adds the open hat and a crash on the downbeat.
"""

import os
import re

from audition import SR, AuditionError, _mono_full

# Piece -> name patterns, most specific first; the first file that matches a piece plays it.
PIECES = {
    "kick": [r"\bkick 1\b", r"\bkick\b", r"\bbd\b"],
    "snare": [r"\bsnare hit\b", r"\bsnare\b(?!.*\b(rim|side)\b)", r"\bsd\b"],
    "hat": [r"\bhh closed\b", r"\bhihat\b", r"\bclosed hat\b", r"\bhh\b", r"\bcymbal\b.*\be\b"],
    "open": [r"\bhh open\b", r"\bopen hat\b", r"\bcymbal\b.*\bh\b"],
    "crash": [r"\bcrash\b", r"\bcymbal\b(?!.*\b[ehk]\b)"],
}
GAIN = {"kick": 0.9, "snare": 0.75, "hat": 0.32, "open": 0.3, "crash": 0.4}


def pieces(files):
    """{piece: path} - per piece the middle file of its matches (a mid velocity of eight)."""
    out = {}
    names = [(f, os.path.splitext(os.path.basename(f))[0].lower()) for f in sorted(files)]
    for piece, pats in PIECES.items():
        for pat in pats:
            hits = [f for f, n in names if re.search(pat, n)]
            if hits:
                out[piece] = hits[len(hits) // 2]
                break
    return out


def groove(level):
    """[(beat, piece)] for four bars at `level` (0 quiet .. 3 full), on an eighth-note grid."""
    hits = []
    for bar in range(4):
        b0 = bar * 4
        for e in range(8):
            t = b0 + e / 2
            hits.append((t, "hat"))
            if level >= 1 and (e in (0, 4) or (bar == 3 and e == 5)):
                hits.append((t, "kick"))
            if level >= 2 and e in (2, 6):
                hits.append((t, "snare"))
        if level >= 3:
            hits.append((b0 + 3.5, "open"))
    if level >= 3:
        hits.append((0.0, "crash"))
    return hits


def beat(files, bpm, level=3):
    """One kit playing the groove: 16 beats and one more of ring, unnormalised, mono."""
    import numpy as np

    kit = pieces([f for f in files if os.path.isfile(f)])
    if "kick" not in kit and "snare" not in kit:
        raise AuditionError("no kick or snare could be named among the kit's files")
    beat_s = 60.0 / float(bpm)
    total = int(SR * (17 * beat_s + 0.6))
    mix = np.zeros(total, dtype="float64")
    loaded = {}
    for t, piece in groove(level):
        path = kit.get(piece) or (kit.get("hat") if piece == "open" else None)
        if path is None:
            continue
        if path not in loaded:
            x = _mono_full(path).astype("float64")
            loaded[path] = x / max(float(np.max(np.abs(x))), 1e-9)
        x = loaded[path]
        at = int(t * beat_s * SR)
        n = min(len(x), total - at, int(2.5 * SR))
        if n > 0:
            mix[at:at + n] += GAIN[piece] * x[:n]
    if float(np.sqrt(np.mean(mix * mix))) < 1e-5:
        raise AuditionError("the kit renders silent")
    return mix, {"notes": len(groove(level)), "range": [0, 0], "measured": len(kit)}
