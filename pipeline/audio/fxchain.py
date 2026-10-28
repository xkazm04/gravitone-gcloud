"""The fx half of the audio sidecar: re-validate a voice-fx chain, then render it.

The chain's shape is owned by packages/domain/src/audio.fx.ts (`fxChainSchema`); STAGES below
is that table again, in Python, ON PURPOSE. The Node side parses the chain at the door before
it ever reaches here, but this process is a CLI anyone on the box can run with any JSON file,
so it refuses rather than trusts: an unknown kind, an unknown or missing key, a number outside
its bound, a version other than 1, or a chain of 0 or more than 8 stages is an error with its
path, in the door's own `stages.<i>.<key>` spelling. Nothing is clamped - a clamped chain
renders something nobody asked for. (When the two tables drift, the vitest door test that
renders a chain at every stage's bounds is what goes red.)

Render: consecutive pedalboard stages run as one Pedalboard; `ringmod` (the robot voice) is
numpy, y = x*(1-mix) + x*sin(2*pi*hz*t)*mix, and splits the board where it sits. Order is
signal order. Pedalboard returns as many samples as it was given, so a delay's or a reverb's
tail past the end of the take is CUT, not appended: the take keeps its length, which is what
the line's timing on the strip and the acceptance length check were planned against. A
lowpass above Nyquist is a no-op in physics and an unstable filter in JUCE, so its cutoff is
set just under Nyquist and the result says so in `notes`.
"""

import math

import numpy as np

FX_CHAIN_VERSION = 1
FX_STAGES_MAX = 8

STAGES = {
    "gain": {"db": (-24, 12)},
    "highpass": {"hz": (20, 2000)},
    "lowpass": {"hz": (500, 20000)},
    "pitch": {"semitones": (-12, 12)},
    "delay": {"delayS": (0.02, 2), "feedback": (0, 0.9), "mix": (0, 1)},
    "reverb": {"roomSize": (0, 1), "damping": (0, 1), "wet": (0, 1), "dry": (0, 1), "width": (0, 1)},
    "chorus": {"rateHz": (0.05, 10), "depth": (0, 1), "mix": (0, 1)},
    "phaser": {"rateHz": (0.05, 10), "depth": (0, 1), "mix": (0, 1)},
    "distortion": {"driveDb": (0, 40)},
    "bitcrush": {"bitDepth": (2, 16)},
    "compressor": {"thresholdDb": (-60, 0), "ratio": (1, 20)},
    "gsm": {},
    "ringmod": {"hz": (10, 2000), "mix": (0, 1)},
}


class ChainRefused(ValueError):
    """A chain this sidecar will not render; the message is the refusal with its path."""


def _num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def validate(doc):
    """The chain's stages as plain dicts, or ChainRefused naming the first defect's path."""
    if not isinstance(doc, dict):
        raise ChainRefused("(root): expected an object")
    extra = sorted(set(doc) - {"v", "stages"})
    if extra:
        raise ChainRefused(f"(root): unrecognized key {extra[0]!r}")
    if doc.get("v") != FX_CHAIN_VERSION:
        raise ChainRefused(f"v: expected {FX_CHAIN_VERSION}, got {doc.get('v')!r}")
    stages = doc.get("stages")
    if not isinstance(stages, list):
        raise ChainRefused("stages: expected an array")
    if not 1 <= len(stages) <= FX_STAGES_MAX:
        raise ChainRefused(f"stages: expected 1..{FX_STAGES_MAX} stages, got {len(stages)}")
    for i, st in enumerate(stages):
        if not isinstance(st, dict):
            raise ChainRefused(f"stages.{i}: expected an object")
        kind = st.get("kind")
        if kind not in STAGES:
            raise ChainRefused(f"stages.{i}.kind: unknown stage kind {kind!r}")
        bounds = STAGES[kind]
        for key in st:
            if key != "kind" and key not in bounds:
                raise ChainRefused(f"stages.{i}: unrecognized key {key!r} for {kind}")
        for key, (lo, hi) in bounds.items():
            if key not in st:
                raise ChainRefused(f"stages.{i}.{key}: required for {kind}")
            v = st[key]
            if not _num(v):
                raise ChainRefused(f"stages.{i}.{key}: expected a number, got {v!r}")
            if v < lo or v > hi:
                raise ChainRefused(f"stages.{i}.{key}: {v} is outside {lo}..{hi}")
    return stages


def _plugin(st, rate, notes):
    import pedalboard as pb

    k = st["kind"]
    if k == "gain":
        return pb.Gain(gain_db=st["db"])
    if k == "highpass":
        return pb.HighpassFilter(cutoff_frequency_hz=st["hz"])
    if k == "lowpass":
        hz = st["hz"]
        ceiling = 0.49 * rate
        if hz > ceiling:
            notes.append(f"lowpass {hz:g} Hz is above Nyquist at {rate} Hz; cut at {ceiling:g} Hz")
            hz = ceiling
        return pb.LowpassFilter(cutoff_frequency_hz=hz)
    if k == "pitch":
        return pb.PitchShift(semitones=st["semitones"])
    if k == "delay":
        return pb.Delay(delay_seconds=st["delayS"], feedback=st["feedback"], mix=st["mix"])
    if k == "reverb":
        return pb.Reverb(room_size=st["roomSize"], damping=st["damping"], wet_level=st["wet"], dry_level=st["dry"], width=st["width"])
    if k == "chorus":
        return pb.Chorus(rate_hz=st["rateHz"], depth=st["depth"], mix=st["mix"])
    if k == "phaser":
        return pb.Phaser(rate_hz=st["rateHz"], depth=st["depth"], mix=st["mix"])
    if k == "distortion":
        return pb.Distortion(drive_db=st["driveDb"])
    if k == "bitcrush":
        return pb.Bitcrush(bit_depth=st["bitDepth"])
    if k == "compressor":
        return pb.Compressor(threshold_db=st["thresholdDb"], ratio=st["ratio"])
    if k == "gsm":
        return pb.GSMFullRateCompressor()
    raise ChainRefused(f"no pedalboard plugin for {k}")


def ringmod(x, rate, hz, mix):
    """x shaped (channels, frames); the carrier starts at phase 0 on the first frame."""
    t = np.arange(x.shape[1], dtype=np.float64) / rate
    carrier = np.sin(2.0 * np.pi * hz * t).astype(np.float32)
    return (x * (1.0 - mix) + x * carrier[np.newaxis, :] * mix).astype(np.float32)


def render(audio, rate, stages):
    """audio shaped (frames, channels) float32 -> (rendered (frames, channels) float32, notes)."""
    import pedalboard as pb

    notes = []
    x = np.ascontiguousarray(audio.T, dtype=np.float32)
    pending = []

    def flush(y):
        if not pending:
            return y
        board = pb.Pedalboard(list(pending))
        pending.clear()
        return board(y, rate)

    for st in stages:
        if st["kind"] == "ringmod":
            x = ringmod(flush(x), rate, st["hz"], st["mix"])
        else:
            pending.append(_plugin(st, rate, notes))
    x = flush(x)
    if not np.all(np.isfinite(x)):
        raise ValueError("the chain produced non-finite samples")
    return np.ascontiguousarray(x.T), notes
