"""The sketch - the seed's instruments together, across the shape a person painted.

    python pipeline/audio/sidecar.py sketch --spec <spec.json> --out <wav> --json

Every four-bar column of the shape plays the audition phrase (./audition.py) once, on the voices
its level carries: the quietest level the first instrument alone, the fullest every one - the
same rule the composer writes into the ElevenLabs plan (@gt/ui shape.ts `voicesAt`), so what is
heard here is what the plan asks for. Each voice is brought to the same RMS before mixing, so no
instrument wins by being sampled louder. At the fullest level a soft synthesised pulse (a pitch-
swept sine kick, a filtered-noise tick on the off-beats) keeps time: it is a click, not a
drummer, and the brief does not ask for it.

Spec: {"voices": [{"files": [...], "role": "keys"}], "levels": [0..3, ...], "bpm", "tonic",
       "minor", "lufs", "cacheDir"}. Answer: {"ok": true, "durationS", "lufs", "voices", "columns"}.
"""

import math

from audition import SR, AuditionError, _loudness, finish, voice

GAIN = [0.45, 0.62, 0.82, 1.0]
MAX_VOICES = 5


def _pulse(beat, level):
    """One four-bar group of the click at `level` (silent under the fullest)."""
    import numpy as np

    n = int(16 * beat * SR)
    out = np.zeros(n, dtype="float64")
    if level < 3:
        return out
    k = int(0.18 * SR)
    t = np.arange(k) / SR
    kick = np.sin(2 * math.pi * (50 * t + 1.8 * (1 - np.exp(-t / 0.03)))) * np.exp(-t / 0.09)
    rng = np.random.default_rng(7)  # the same tick every render: a sketch is deterministic
    h = int(0.05 * SR)
    noise = np.diff(rng.standard_normal(h + 1)) * np.exp(-np.arange(h) / (0.012 * SR))
    for b in range(16):
        at = int(b * beat * SR)
        if b % 2 == 0:
            m = max(0, min(k, n - at))
            out[at:at + m] += 0.9 * kick[:m]
        if b % 2 == 1:
            off = int((b + 0.5) * beat * SR)
            m = max(0, min(h, n - off))
            out[off:off + m] += 0.12 * noise[:m]
    return out


def render_sketch(spec):
    import numpy as np

    levels = [max(0, min(3, int(x))) for x in spec["levels"]]
    voices = spec["voices"][:MAX_VOICES]
    if not voices:
        raise AuditionError("the seed has no instrument this machine can play")
    if not levels:
        raise AuditionError("the shape has no columns")
    bpm = float(spec["bpm"])
    beat = 60.0 / bpm
    parts = []
    for v in voices:
        x, _ = voice(v["files"], bpm, spec["tonic"], spec["minor"], v.get("role", "keys"), spec.get("cacheDir"))
        parts.append(x * (0.1 / max(float(np.sqrt(np.mean(x * x))), 1e-9)))
    group = int(16 * beat * SR)
    total = group * len(levels) + max(0, len(parts[0]) - group)
    mix = np.zeros(total, dtype="float64")
    for i, lv in enumerate(levels):
        at = i * group
        k = max(1, min(len(parts), math.ceil((lv + 1) / 4 * len(parts))))
        for x in parts[:k]:
            end = min(total, at + len(x))
            mix[at:end] += GAIN[lv] * x[: end - at]
        p = _pulse(beat, lv)
        if np.any(p):
            p *= 0.05 / max(float(np.sqrt(np.mean(p * p))), 1e-9)
            end = min(total, at + len(p))
            mix[at:end] += GAIN[lv] * p[: end - at]
    y = finish(mix, float(spec.get("lufs", -20.0)))
    return y, {"durationS": round(len(y) / SR, 3), "lufs": round(_loudness(y.astype("float64")), 2), "voices": len(parts), "columns": len(levels)}
