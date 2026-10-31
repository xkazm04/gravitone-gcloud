"""Bar patterns for the studio roles the v1 engine did not have (pad, percussion, texture) and the
per-section entry mask (`enters`) every track may carry (spark audio-agent-studio S2).

score_compiler.compile_track_events owns the bar loop and the seeded RNG; it hands each bar of a
pad / percussion / texture track to `bar_events`. Every pattern plays in the first bar of every
section, so a track compiles to > 0 events for any spec; an unknown pattern plays the role default.
"""

PATTERNS = {
    "pad": ("sustained", "slow-swell", "high-air"),
    "percussion": ("shaker", "clap-backbeat", "offbeat-hat"),
    "texture": ("sparse-high", "drone", "glint"),
}
# Drum-kit notes the kit renderer maps to its upper pieces: 39 the clap, anything above 40 a hat.
CLAP, HAT_CLOSED, HAT_OPEN = 39, 42, 46


def _vel(r, base, scale, humanise, lo, hi, spread=5):
    return max(lo, min(hi, int(base * scale) + int(r.integers(-spread, spread + 1) * humanise)))


def bar_events(role, pat, r, c):
    """One bar of a pad / percussion / texture part -> [(start_s, end_s, midi, vel)].

    c: bar_start_s, beat_s, deg, k (bar in section), bars (section length), is_lift, density, swing,
    humanise, vel_base, midi(octave, degree) -> an in-key note clamped to the instrument's range.
    """
    t0, beat_s, deg, k, lift = c["bar_start_s"], c["beat_s"], c["deg"], c["k"], c["is_lift"]
    hum, vb = c["humanise"], c["vel_base"]
    at = lambda bt: t0 + bt * beat_s  # noqa: E731
    out = []
    if role == "pad":
        pat = pat if pat in PATTERNS["pad"] else "sustained"
        if pat == "slow-swell":
            if k % 2 == 1:
                return out
            hold = min(7.9, 4.0 * (c["bars"] - k) - 0.1)
            voicing, octave = (0, 2, 4), 3
        elif pat == "high-air":
            hold, voicing, octave = 3.95, (0, 4, 7), (5 if lift else 4)
        else:
            hold = 3.95
            voicing = (0, 2, 4, 6) if (lift and c["density"] >= 0.5) else (0, 2, 4)
            octave = 4 if lift else 3
        for iv in voicing:
            out.append((at(0.0), at(hold), c["midi"](octave, deg + iv), _vel(r, vb, 0.62, hum, 30, 100)))
    elif role == "percussion":
        pat = pat if pat in PATTERNS["percussion"] else "shaker"
        swing = c["swing"] * 0.35 * beat_s

        def hit(bt, note, scale, lo=20):
            is_off = abs((bt * 2) % 2 - 1.0) < 0.05
            jit = float(r.uniform(-0.003, 0.003)) * hum
            start = at(bt) + (swing if is_off else 0.0) + jit
            out.append((max(t0, start), start + 0.1 * beat_s, note, _vel(r, vb, scale, hum, lo, 118, 6)))

        if pat == "clap-backbeat":
            for bt in ((1.0, 3.0, 3.5) if lift else (1.0, 3.0)):
                hit(bt, CLAP, 0.82 if bt != 3.5 else 0.5)
            for bt in (0.5, 1.5, 2.5, 3.5):
                hit(bt, HAT_CLOSED, 0.42)
        elif pat == "offbeat-hat":
            for bt in (0.5, 1.5, 2.5, 3.5):
                hit(bt, HAT_OPEN, 0.6)
            if lift:
                for bt in (1.75, 3.75):
                    hit(bt, HAT_CLOSED, 0.38)
        else:
            step = 0.25 if (lift and c["density"] >= 0.45) else 0.5
            n = int(round(4.0 / step))
            for i in range(n):
                bt = i * step
                hit(bt, HAT_CLOSED, 0.72 if bt == int(bt) else 0.55)
    elif role == "texture":
        pat = pat if pat in PATTERNS["texture"] else "sparse-high"
        if pat == "drone":
            out.append((at(0.0), at(3.98), c["midi"](3, 0), _vel(r, vb, 0.45, hum, 28, 90)))
            if lift:
                out.append((at(0.0), at(3.98), c["midi"](3, 4), _vel(r, vb, 0.4, hum, 28, 90)))
        elif pat == "glint":
            plan = ((0.0, 4), (1.5, 6), (3.0, 9)) if lift else (((0.0, 4),) if k % 2 == 0 else ())
            for bt, step in plan:
                out.append((at(bt), at(bt + 0.9), c["midi"](5, deg + step), _vel(r, vb, 0.55, hum, 28, 100)))
        else:
            if k % 2 == 0:
                out.append((at(0.0), at(3.0), c["midi"](5, deg + 4), _vel(r, vb, 0.5, hum, 28, 96)))
            elif lift:
                out.append((at(2.0), at(3.75), c["midi"](5, deg + 2), _vel(r, vb, 0.45, hum, 28, 96)))
    return out


def plays_in(spec, track):
    """Per-section booleans for the track (absent `enters` = plays everywhere)."""
    enters = track.get("enters")
    return list(enters) if enters else [True] * len(spec["sections"])


def section_spans_s(spec):
    bar_s, at, spans = 240.0 / float(spec["tempoBpm"]), 0, []
    for sec in spec["sections"]:
        spans.append((at * bar_s, (at + int(sec["bars"])) * bar_s))
        at += int(sec["bars"])
    return spans


def apply_enters(spec, track, events):
    """Drop events that START in a resting section. Applied after generation, so the seeded RNG
    stream - and every event in a playing section - is exactly what the track plays without a mask."""
    on = plays_in(spec, track)
    if all(on):
        return events
    spans = section_spans_s(spec)

    def plays(t):
        for (_a, b), here in zip(spans, on):
            if t < b - 1e-9:
                return here
        return on[-1]

    return [e for e in events if plays(e[0])]


def rest_gate(spec, track, frames, rate, fade_s=0.06):
    """A per-frame gain (or None): 1 where the track plays, 0 where it rests; a ringing tail fades over
    `fade_s` INSIDE the resting section, so the frames of every playing section stay untouched."""
    on = plays_in(spec, track)
    if all(on):
        return None
    import numpy as np

    gate = np.ones(frames, dtype=np.float32)
    fade_n = max(1, int(round(fade_s * rate)))
    for idx, ((a, b), here) in enumerate(zip(section_spans_s(spec), on)):
        if here:
            continue
        i0 = min(frames, int(round(a * rate)))
        i1 = frames if idx == len(on) - 1 else min(frames, int(round(b * rate)))
        gate[i0:i1] = 0.0
        if idx > 0 and on[idx - 1] and i1 > i0:
            n = min(fade_n, i1 - i0)
            gate[i0:i0 + n] = np.linspace(1.0, 0.0, n, dtype=np.float32)
    return gate
