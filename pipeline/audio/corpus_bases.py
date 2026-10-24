"""Clean bases for the triage corpus (pipeline/audio/corpus.py): synthetic signals, real takes.

Every base is CLEAN by construction, on every check @gt/domain/audio.triage defines, so that a
defect injected into it is the only thing a detector can find there:

  music       a click/drum pattern at a known BPM over a chord pad, stereo, in three sections
              of 4 / 6 / 3 bars whose drum pattern, chord progression, register and timbre all
              change at the bar line - a boundary a novelty curve can see. The pad is a body
              shared by both channels plus a width layer detuned +-2 cents per channel at -9 dB:
              a real stereo image that still folds to mono with no loss worth naming. Ends on a
              1.5 s fade and 0.5 s of digital silence.
  music-loop  the same, 8 bars, one section, rendered CIRCULARLY: every hit and every pad
              release that runs past the last sample is added back onto the first, so the wrap
              is the same signal as any other bar line. No fade (a loop's end is its seam).
  sfx         an ambience bed: coloured noise synthesised in the frequency domain (which is
              periodic in its own length by construction), a shared bed plus 30 % independent
              noise per channel, a slow modulation made of whole cycles over the file, and sparse
              crackles. The non-loop bed fades out like the music; the loop is seamless for the
              same reason as the music loop.
  voice       a speech-like signal, MONO: pink noise and a 110-150 Hz buzz through three formant
              bands, gated into syllables at about 4 Hz, grouped in phrases with 0.25-0.55 s
              pauses (well under any dead-air bar), a 0.3 s lead and a 0.6 s tail.

A base has an "open" ending too: the body simply continues to the last sample (an extra bar is
rendered and truncated, so the take stops at body level) - the raw material of the broken-ending
cut. Its length equals the clean one, so the asked duration still holds.

LEVELS: every base is normalised to its kind's working loudness (music -16, sfx -24, voice -18
LUFS by pyloudnorm, the sidecar's meter) and then held to a true peak at or under -1.5 dBTP
(4x oversampled), so a clean base can never clip, never over, and sits inside every kind's
loudness range.

REAL bases (`--real`): kept takes discovered READ-ONLY under the sound store's `files/` and the
music-video album folders `mv/**`, deduplicated by content hash, decoded by soundfile (never a
.sqlite, never a write next to them), excerpted from 30 % in, levelled and given the same clean
ending. They are treated as clean for injected-defect recall only: a kept take may carry a real
defect, which is why the gate never reads them (spark audio-triage, Risks).

Seeded: every random draw comes from a numpy Generator keyed by (seed, base, instance, part), so
the same seed renders the same samples, bit for bit, on the same machine.
"""

import hashlib
import os
import zlib

import numpy as np
from scipy import signal

RATE = 44100
FADE_S = 1.5
TAIL_S = 0.5
VOICE_LEAD_S = 0.3
VOICE_TAIL_S = 0.6
VOICE_FADE_S = 0.3
LUFS = {"music": -16.0, "sfx": -24.0, "voice": -18.0}
TP_CEILING_DB = -1.5

# One tempo per instance: a detector is held across tempi, not tuned to 120.
BPMS = (120, 100, 128, 90, 140, 110, 124, 96)
MUSIC_SECTIONS = (("intro", 4), ("body", 6), ("outro", 3))
LOOP_BARS = 8
SFX_S = 12.0
SFX_LOOP_S = 8.0
VOICE_S = 10.0
REAL_EXCERPT_S = 26.0
AUDIO_EXT = {".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac", ".opus", ""}


def rng(seed, *keys):
    words = [int(seed)] + [zlib.crc32(str(k).encode("utf8")) for k in keys]
    return np.random.default_rng(np.random.SeedSequence(words))


def bar_s(bpm):
    return 240.0 / bpm


def n_of(seconds):
    return int(round(seconds * RATE))


# ---------------------------------------------------------------- spec (lengths without rendering)

def music_spec(instance):
    bpm = BPMS[instance % len(BPMS)]
    bars = sum(b for _, b in MUSIC_SECTIONS)
    n_body = n_of(bars * bar_s(bpm))
    sections, at = [], 0
    for name, b in MUSIC_SECTIONS:
        start = at
        at += b
        sections.append({"name": name, "startMs": round(start * bar_s(bpm) * 1000), "endMs": round(at * bar_s(bpm) * 1000)})
    return {"bpm": bpm, "frames": n_body + n_of(TAIL_S), "sections": sections}


def loop_spec(instance):
    bpm = BPMS[instance % len(BPMS)]
    return {"bpm": bpm, "frames": n_of(LOOP_BARS * bar_s(bpm))}


def spec(base, instance):
    if base == "music":
        return music_spec(instance)
    if base == "music-loop":
        return loop_spec(instance)
    if base == "sfx":
        return {"frames": n_of(SFX_S) + n_of(TAIL_S)}
    if base == "sfx-loop":
        return {"frames": n_of(SFX_LOOP_S)}
    if base == "voice":
        return {"frames": n_of(VOICE_S)}
    raise ValueError(f"no such base: {base}")


# ---------------------------------------------------------------- levels

def true_peak_db(a):
    up = signal.resample_poly(a, 4, 1, axis=0)
    peak = float(np.max(np.abs(up))) if up.size else 0.0
    return 20 * np.log10(peak) if peak > 0 else -200.0


def lufs(a, rate=RATE):
    import pyloudnorm

    return float(pyloudnorm.Meter(rate).integrated_loudness(a if a.shape[1] > 1 else a[:, 0]))


def level(a, kind, rate=RATE):
    """Normalise to the kind's working loudness, then hold the true peak under the ceiling."""
    a = a * 10 ** ((LUFS[kind] - lufs(a, rate)) / 20)
    over = true_peak_db(a) - TP_CEILING_DB
    return a * 10 ** (-over / 20) if over > 0 else a


def fade_end(a, seconds, rate=RATE):
    n = min(len(a), int(round(seconds * rate)))
    a = a.copy()
    a[len(a) - n :] *= (0.5 + 0.5 * np.cos(np.linspace(0, np.pi, n)))[:, None]
    return a


def silence(seconds, channels, rate=RATE):
    return np.zeros((int(round(seconds * rate)), channels))


# ---------------------------------------------------------------- music

PROGRESSIONS = ((0, 5, 7, 3), (0, 8, 3, 10), (0, 3, 8, 7), (0, 10, 8, 5), (0, 7, 5, 8))


def drum_kit(r):
    t = np.arange(n_of(0.3)) / RATE
    kick = np.sin(2 * np.pi * np.cumsum(50 + 90 * np.exp(-t * 30)) / RATE) * np.exp(-t * 9)
    sos = signal.butter(2, (1000, 5000), "bandpass", fs=RATE, output="sos")
    ts = t[: n_of(0.18)]
    snare = signal.sosfilt(sos, r.standard_normal(len(ts))) * np.exp(-ts * 25) * 1.6
    snare += 0.5 * np.sin(2 * np.pi * 190 * ts) * np.exp(-ts * 30)
    th = t[: n_of(0.06)]
    hat = signal.sosfilt(signal.butter(2, 7000, "highpass", fs=RATE, output="sos"), r.standard_normal(len(th))) * np.exp(-th * 80)
    return {"kick": kick, "snare": snare * 0.55, "hat": hat * 0.35}


# Beat positions within a 4-beat bar, per section style.
PATTERNS = (
    {"kick": (0, 2), "snare": (), "hat": tuple(i / 2 for i in range(8))},
    {"kick": (0, 1, 2, 3), "snare": (1, 3), "hat": tuple(i / 2 for i in range(8))},
    {"kick": (0, 1.5, 2), "snare": (1, 3), "hat": tuple(i / 4 for i in range(16))},
)


def add(out, x, at, gain=1.0, pan=0.0):
    end = min(len(out), at + len(x))
    if end <= at:
        return
    out[at:end, 0] += x[: end - at] * gain * (1 - pan)
    out[at:end, 1] += x[: end - at] * gain * (1 + pan)


def pad_note(r, f, seconds, harmonics, detune):
    """One pad note: a body shared by both channels plus a detuned width layer per channel at
    -9 dB, so the image is wide but folds to mono losing well under a dB."""
    n = n_of(seconds + 0.3)
    t = np.arange(n) / RATE
    env = np.minimum(1.0, t / 0.08) * np.clip((seconds + 0.25 - t) / 0.25, 0, 1)

    def voice_(d):
        ph = r.uniform(0, 2 * np.pi, harmonics)
        return sum(np.sin(2 * np.pi * f * d * (h + 1) * t + ph[h]) / (h + 1) ** 1.5 for h in range(harmonics))

    body = voice_(1.0)
    out = np.stack([body + 0.35 * voice_(1 + detune), body + 0.35 * voice_(1 - detune)], axis=1)
    return out * env[:, None] * 0.12


def music(seed, instance, loop=False, ending="fade"):
    """Stereo music base; `ending` is "fade" (clean) or "open" (body to the last sample)."""
    r = rng(seed, "music-loop" if loop else "music", instance, ending)
    bpm = BPMS[instance % len(BPMS)]
    bar, beat = bar_s(bpm), bar_s(bpm) / 4
    plan = [("loop", LOOP_BARS)] if loop else list(MUSIC_SECTIONS)
    styles = [1] if loop else [0, 1, 2]
    if ending == "open":
        plan = plan + [(plan[-1][0], 1)]
        styles = styles + [styles[-1]]
    bars = sum(b for _, b in plan)
    n = n_of(bars * bar)
    out = np.zeros((n + n_of(bar + 1.0), 2))
    kit = drum_kit(r)
    progs = r.permutation(len(PROGRESSIONS))
    root = 110 * 2 ** (r.integers(0, 5) / 12)
    at_bar = 0
    for (name, b), style in zip(plan, styles):
        prog = PROGRESSIONS[int(progs[style % len(progs)])]
        octave, harm = (1, 3) if style == 0 else ((2, 6) if style == 1 else (4, 4))
        for k in range(b):
            t0 = (at_bar + k) * bar
            chord = (0, 3, 7, 10) if style == 2 else (0, 3, 7)
            for iv in chord:
                f = root * octave * 2 ** ((prog[k % 4] + iv) / 12)
                note = pad_note(r, f, bar, harm, 0.0012)
                end = min(len(out), n_of(t0) + len(note))
                out[n_of(t0) : end] += note[: end - n_of(t0)]
            for part, beats in PATTERNS[style].items():
                for bt in beats:
                    add(out, kit[part], n_of(t0 + bt * beat), r.uniform(0.85, 1.0), r.uniform(-0.2, 0.2) if part == "hat" else 0.0)
        at_bar += b
    if loop:
        over = out[n:]
        out = out[:n].copy()
        out[: len(over)] += over[:n]
    elif ending == "open":
        out = out[: music_spec(instance)["frames"]]
    else:
        out = fade_end(out[:n], FADE_S)
    a = level(out, "music")
    return np.vstack([a, silence(TAIL_S, 2)]) if not loop and ending == "fade" else a


# ---------------------------------------------------------------- sfx

def coloured(r, n, slope, lo=40, hi=12000):
    f = np.fft.rfftfreq(n, 1 / RATE)
    mag = np.where((f >= lo) & (f <= hi), np.maximum(f, 1.0) ** (slope / 2), 0.0)
    spec_ = mag * np.exp(1j * r.uniform(0, 2 * np.pi, len(f)))
    x = np.fft.irfft(spec_, n)
    return x / (np.std(x) + 1e-12)


def sfx(seed, instance, loop=False, ending="fade"):
    r = rng(seed, "sfx-loop" if loop else "sfx", instance, ending)
    n = n_of(SFX_LOOP_S if loop else SFX_S) + (n_of(TAIL_S) if ending == "open" else 0)
    slope = r.uniform(-1.6, -0.8)
    common = coloured(r, n, slope)
    t = np.arange(n) / n
    mod = 1 + sum(0.12 * np.sin(2 * np.pi * k * t + r.uniform(0, 2 * np.pi)) for k in r.integers(1, 6, 3))
    out = np.stack([(common + 0.3 * coloured(r, n, slope)) * mod, (common + 0.3 * coloured(r, n, slope)) * mod], axis=1)
    crackle = signal.sosfilt(signal.butter(2, 2500, "highpass", fs=RATE, output="sos"), r.standard_normal(n_of(0.02)))
    crackle *= np.exp(-np.arange(len(crackle)) / RATE * 200)
    for at in r.integers(0, n, int(r.integers(6, 14))):
        idx = (int(at) + np.arange(len(crackle))) % n
        g = r.uniform(0.5, 1.2)
        out[idx, 0] += crackle * g
        out[idx, 1] += crackle * g * r.uniform(0.6, 1.0)
    if loop or ending == "open":
        return level(out, "sfx")
    a = level(fade_end(out, FADE_S), "sfx")
    return np.vstack([a, silence(TAIL_S, 2)])


# ---------------------------------------------------------------- voice

def voice(seed, instance, ending="fade"):
    r = rng(seed, "voice", instance, ending)
    n = n_of(VOICE_S)
    t = np.arange(n) / RATE
    pink = coloured(r, n, -1.0, 80, 8000)
    f0 = r.uniform(110, 150) * (1 + 0.04 * np.sin(2 * np.pi * 0.7 * t))
    buzz = signal.sawtooth(2 * np.pi * np.cumsum(f0) / RATE)
    src = 0.5 * pink + 0.5 * buzz
    bands = [signal.sosfilt(signal.butter(2, b, "bandpass", fs=RATE, output="sos"), src) for b in ((250, 800), (900, 2500), (2600, 4000))]
    env = np.zeros(n)
    mix = np.zeros(n)
    at, stop = VOICE_LEAD_S, VOICE_S - VOICE_TAIL_S
    while at < stop - 0.2:
        for _ in range(int(r.integers(3, 8))):
            d = r.uniform(0.15, 0.3)
            if at + d > stop:
                break
            i0, i1 = n_of(at), n_of(at + d)
            env[i0:i1] = np.maximum(env[i0:i1], np.sin(np.linspace(0, np.pi, i1 - i0)) * r.uniform(0.7, 1.0))
            w = r.dirichlet((2, 2, 1))
            mix[i0:i1] = sum(w[k] * bands[k][i0:i1] for k in range(3)) / (np.std(bands[0]) + 1e-12)
            at += d + r.uniform(0.02, 0.06)
        at += r.uniform(0.25, 0.55)
    if ending == "open":
        # The last syllable never closes: the take stops at body level, mid-word.
        i0 = n_of(VOICE_S - 0.6)
        w = r.dirichlet((2, 2, 1))
        mix[i0:] = sum(w[k] * bands[k][i0:] for k in range(3)) / (np.std(bands[0]) + 1e-12)
        env[i0:] = np.minimum(1.0, np.arange(n - i0) / n_of(0.05)) * 0.9
    return level((mix * env)[:, None], "voice")


def render(seed, base, instance, ending="fade"):
    if base == "music":
        return music(seed, instance, False, ending)
    if base == "music-loop":
        return music(seed, instance, True, ending)
    if base == "sfx":
        return sfx(seed, instance, False, ending)
    if base == "sfx-loop":
        return sfx(seed, instance, True, ending)
    if base == "voice":
        return voice(seed, instance, ending)
    raise ValueError(f"no such base: {base}")


# ---------------------------------------------------------------- real bases

def discover_real(root, limit):
    """[(sha8, path)] of decodable takes under root/files and root/mv/**, or ([], reason)."""
    dirs = [d for d in (os.path.join(root, "files"), os.path.join(root, "mv")) if os.path.isdir(d)]
    if not dirs:
        return [], f"no files/ or mv/ under {root}"
    seen, found = set(), []
    for d in dirs:
        for here, subdirs, names in os.walk(d):
            subdirs.sort()
            for name in sorted(names):
                ext = os.path.splitext(name)[1].lower()
                if ext not in AUDIO_EXT or name.endswith((".json", ".sqlite")):
                    continue
                p = os.path.join(here, name)
                h = hashlib.sha256()
                with open(p, "rb") as f:
                    for chunk in iter(lambda: f.read(1 << 20), b""):
                        h.update(chunk)
                sha = h.hexdigest()[:8]
                if sha not in seen:
                    seen.add(sha)
                    found.append((sha, p))
    found.sort()
    if not found:
        return [], f"no audio files under {', '.join(dirs)}"
    return found[:limit], None


def real(path, ending="fade"):
    """(samples, rate) of one real take's excerpt, levelled, with the clean or the open ending."""
    import soundfile as sf

    a, rate = sf.read(path, dtype="float64", always_2d=True)
    start = int(len(a) * 0.3)
    a = a[start : start + int(REAL_EXCERPT_S * rate) + (int(TAIL_S * rate) if ending == "open" else 0)]
    if ending == "open":
        return level(a, "music", rate), rate
    a = level(fade_end(a, FADE_S, rate), "music", rate)
    return np.vstack([a, silence(TAIL_S, a.shape[1], rate)]), rate
