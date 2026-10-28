"""The audition renderer - one fixed phrase played on one sampled instrument.

    python pipeline/audio/sidecar.py audition --spec <spec.json> --out <wav> --json

A non-musician compares instruments by ear only when everything else is held still: the same
four bars (I-V-vi-IV in a major key, i-VI-III-VII in a minor one), the same tempo, the same key,
the same length, the same loudness. A generator cannot hold that - every reroll moves melody,
tempo and mix together - so the phrase is rendered here, from the local multisamples, and the
only thing left to differ between two auditions is the instrument.

THE SAMPLES' PITCHES ARE MEASURED, NOT READ OFF THEIR NAMES. FL Studio's packs number their
files ("Rhodes (3).wav"); Ableton names notes with its own octave convention (C3 = MIDI 60) and
not always the same way twice. A wrong root note gives an out-of-tune audition that teaches the
listener nothing, so every file's fundamental is measured (YIN, de Cheveigne & Kawahara 2002)
and a note name, where the file has one, only settles the octave a measurement can slip on.
The measured map is cached beside the renders, keyed by the file list.

The spec (JSON, a temp file the Node side writes - never argv):
    {"files": [abs paths], "bpm": 90, "tonic": 0..11, "minor": false, "role": "keys"|"bass"|...,
     "lufs": -20, "cacheDir": "<dir for the pitch map>"}
Answer: {"ok": true, "durationS", "lufs", "notes", "range": [lo, hi], "measured": n}.
"""

import hashlib
import io
import json
import math
import os
import re

SR = 44100
NOTE_RE = re.compile(r"(?<![A-Za-z])([A-Ga-g])\s?([#b]?)\s?(-?\d)(?!\d)")
PC = {"c": 0, "d": 2, "e": 4, "f": 5, "g": 7, "a": 9, "b": 11}
MAX_FILES = 48
# The progressions, as (semitones above the tonic, minor triad?) per bar.
MAJOR = [(0, False), (7, False), (9, True), (5, False)]
MINOR = [(0, True), (8, False), (3, False), (10, False)]


class AuditionError(Exception):
    pass


def _read(path):
    """(float32 frames x channels, rate). FL Studio's packs wrap an Ogg Vorbis stream in a RIFF
    (format tag 0x674F, "Og") that libsndfile refuses as a WAV; its `data` chunk IS an Ogg file."""
    import soundfile as sf

    try:
        return sf.read(path, dtype="float32", always_2d=True)
    except Exception as first:  # libsndfile's refusal; the RIFF-wrapped Ogg is the one case known here
        with open(path, "rb") as f:
            raw = f.read()
        at = raw.find(b"OggS")
        if raw[:4] != b"RIFF" or at < 0:
            raise AuditionError(f"{os.path.basename(path)}: {first}") from None
        # The wrapped stream reports no frame count (2^63 - 1), so it is read to a bound; a read
        # past its end stops at the end.
        with sf.SoundFile(io.BytesIO(raw[at:])) as f:
            return f.read(frames=f.samplerate * 30, dtype="float32", always_2d=True), f.samplerate


def _mono_head(path, seconds):
    data, rate = _read(path)
    return data[: int(rate * seconds)].mean(axis=1), rate


def _mono_full(path):
    import numpy as np

    data, rate = _read(path)
    x = data.mean(axis=1)
    if rate != SR:
        n = int(len(x) * SR / rate)
        x = np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x).astype("float32")
    return x


def yin_midi(x, rate, fmin=27.0, fmax=2100.0, threshold=0.15):
    """(midi as float, confidence 0..1) of a window's fundamental, or (None, 0)."""
    import numpy as np

    peak = int(np.argmax(np.abs(x))) if len(x) else 0
    start = min(peak + int(0.06 * rate), max(0, len(x) - 1))
    w = min(4096, (len(x) - start) // 2)
    tau_max = min(int(rate / fmin), w - 1)
    tau_min = max(2, int(rate / fmax))
    if w < 512 or tau_max <= tau_min:
        return None, 0.0
    seg = x[start:start + w + tau_max].astype("float64")
    seg = seg - seg.mean()
    if float(np.max(np.abs(seg))) < 1e-4:
        return None, 0.0
    v = seg[:w]
    c = np.correlate(seg, v, mode="valid")[: tau_max + 1]
    sq = np.concatenate([[0.0], np.cumsum(seg * seg)])
    taus = np.arange(tau_max + 1)
    e = sq[taus + w] - sq[taus]
    d = e[0] + e - 2.0 * c
    d[0] = 0.0
    cm = np.ones_like(d)
    run = np.cumsum(d[1:])
    cm[1:] = d[1:] * taus[1:] / np.maximum(run, 1e-12)
    below = np.where(cm[tau_min:] < threshold)[0]
    if len(below):
        t = int(below[0]) + tau_min
        while t + 1 <= tau_max and cm[t + 1] < cm[t]:
            t += 1
    else:
        t = int(np.argmin(cm[tau_min:])) + tau_min
    if 1 <= t < tau_max:  # parabolic interpolation around the dip
        a, b, cc = cm[t - 1], cm[t], cm[t + 1]
        den = a - 2 * b + cc
        shift = 0.5 * (a - cc) / den if abs(den) > 1e-12 else 0.0
    else:
        shift = 0.0
    f0 = rate / (t + shift)
    return 69.0 + 12.0 * math.log2(f0 / 440.0), float(max(0.0, 1.0 - cm[t]))


def named_midi(path):
    """The note a file's NAME claims, Ableton's convention (C3 = 60); None when it names none."""
    m = NOTE_RE.findall(os.path.splitext(os.path.basename(path))[0])
    if not m:
        return None
    letter, acc, octave = m[-1]
    pc = PC[letter.lower()] + (1 if acc == "#" else -1 if acc == "b" else 0)
    return 12 * (int(octave) + 2) + pc


def measure_pitches(files):
    """[(path, midi)] for every file whose pitch could be settled: a named note exactly, a measured one to the cent."""
    out = []
    for path in files:
        named = named_midi(path)
        if named is not None:  # a named note needs no decode
            out.append((path, named))
            continue
        if len(out) >= MAX_FILES:
            continue
        try:
            x, rate = _mono_head(path, 1.4)
        except Exception:  # an unreadable file is not an instrument note; it is skipped, not fatal
            continue
        heard, conf = yin_midi(x, rate)
        if heard is not None and conf >= 0.5 and 12 <= heard <= 120:
            # Kept fractional: a sample recorded 20 cents sharp is resampled 20 cents down, so the
            # chord it joins is in tune (rounding left FL's choir up to 40 cents out).
            out.append((path, round(float(heard), 2)))
    return out


def _pitch_map(files, cache_dir):
    key = hashlib.sha1("\n".join(sorted(files)).encode("utf8")).hexdigest()[:16]
    cached = os.path.join(cache_dir, f"pitches-v2-{key}.json") if cache_dir else None
    if cached and os.path.isfile(cached):
        try:
            with open(cached, "r", encoding="utf8") as f:
                return [(p, float(m)) for p, m in json.load(f)]
        except (ValueError, OSError):
            pass  # another render's half-written map, or a stale one: measured again below
    pairs = measure_pitches(sorted(files))
    if cached:
        # Written beside and swapped in whole: two renders of one family (a duel pair, a sketch and
        # an audition warming together) must never read each other's half-written map.
        os.makedirs(cache_dir, exist_ok=True)
        tmp = f"{cached}.{os.getpid()}.part"
        with open(tmp, "w", encoding="utf8") as f:
            json.dump(pairs, f)
        swap_in(tmp, cached)
    return pairs


def swap_in(tmp, target):
    """os.replace, for a file two workers may write at once. On Windows the replace is refused
    (WinError 5) while the other process holds the target; what it wrote is the same bytes - a
    measure and a render are deterministic - so a target that is there is taken as written."""
    import time

    for attempt in range(5):
        try:
            os.replace(tmp, target)
            return
        except PermissionError:
            if os.path.isfile(target):
                try:
                    os.remove(tmp)
                except OSError:
                    pass
                return
            time.sleep(0.05 * (attempt + 1))
    os.replace(tmp, target)


def phrase(tonic, minor, role):
    """[(start beat, length in beats, midi)] - the same notes for every instrument of a register."""
    notes = []
    for bar, (step, minor_chord) in enumerate(MINOR if minor else MAJOR):
        root_pc = (tonic + step) % 12
        third = 3 if minor_chord else 4
        b0 = bar * 4
        if role == "bass":
            r = 36 + root_pc if root_pc <= 7 else 24 + root_pc
            for i, (off, length) in enumerate([(0, 1.0), (1, 1.0), (2, 1.0), (3, 1.0)]):
                notes.append((b0 + off, length, r + [0, 0, 7, 12][i]))
        else:
            r = 48 + root_pc if root_pc >= 7 else 60 + root_pc
            for i, iv in enumerate([0, third, 7, 12]):
                notes.append((b0 + i, 4 - i + (1 if bar == 3 else 0), r + iv))
    return notes


def _fit_register(notes, lo, hi):
    """Shift the phrase by octaves so it sits inside what the instrument was sampled over."""
    mid = (lo + hi) / 2
    pitches = [m for _, _, m in notes]
    centre = (min(pitches) + max(pitches)) / 2
    best = min(range(-3, 4), key=lambda k: (max(0, lo - (min(pitches) + 12 * k)) + max(0, (max(pitches) + 12 * k) - hi), abs(centre + 12 * k - mid)))
    return [(b, ln, m + 12 * best) for b, ln, m in notes]


def voice(files, bpm, tonic, minor, role, cache_dir):
    """One instrument playing the phrase: 16 beats and one more of ring, unnormalised, mono."""
    import numpy as np

    files = [f for f in files if os.path.isfile(f)]
    if not files:
        raise AuditionError("none of the instrument's sample files exist on this machine")
    pairs = _pitch_map(files, cache_dir)
    if not pairs:
        raise AuditionError("no sample of the instrument has a pitch that could be measured")
    beat = 60.0 / float(bpm)
    lo, hi = min(m for _, m in pairs), max(m for _, m in pairs)
    notes = _fit_register(phrase(int(tonic) % 12, bool(minor), role), lo, hi)
    total = int(SR * (17 * beat + 0.6))
    mix = np.zeros(total, dtype="float64")
    loaded = {}
    fade = int(0.12 * SR)
    for start_b, len_b, midi in notes:
        path, root = min(pairs, key=lambda p: (abs(p[1] - midi), p[0]))
        if path not in loaded:
            x = _mono_full(path)
            on = np.where(np.abs(x) > np.max(np.abs(x)) * 0.01)[0]
            x = x[int(on[0]):] if len(on) else x
            loaded[path] = x / max(float(np.max(np.abs(x))), 1e-9)
        src = loaded[path]
        ratio = 2.0 ** ((midi - root) / 12.0)
        n = min(int(len_b * beat * SR) + fade, int((len(src) - 1) / ratio))
        if n <= 0:
            continue
        y = np.interp(np.arange(n) * ratio, np.arange(len(src)), src)
        f = min(fade, n)
        y[n - f:] *= np.linspace(1.0, 0.0, f)
        at = int(start_b * beat * SR)
        end = min(total, at + n)
        mix[at:end] += 0.5 * y[: end - at]
    if float(np.sqrt(np.mean(mix * mix))) < 1e-5:
        raise AuditionError("the instrument renders silent")
    return mix, {"notes": len(notes), "range": [lo, hi], "measured": len(pairs)}


def finish(mix, target):
    """Fade the tail, set the integrated loudness to `target`, hold the peak under -1 dBFS softly;
    answer (samples, the loudness they measure).

    A gain lands exactly on `target`, so a render the limiter leaves alone is measured once. One the
    limiter touches (a kit's transients) loses some loudness to it and is measured and set again -
    the promise is that every audition sits at `target`, so a choice is about timbre, not level.
    Each measure is an FFT the length of the render: three of them were most of a three-minute
    sketch's four seconds."""
    import numpy as np

    tail = min(len(mix), int(0.6 * SR))
    mix[len(mix) - tail:] *= np.linspace(1.0, 0.0, tail)
    ceiling = 0.89
    for _ in range(2):
        mix *= 10 ** ((target - _loudness(mix)) / 20.0)
        if np.max(np.abs(mix)) <= ceiling:
            return mix.astype("float32"), target
        mix = ceiling * np.tanh(mix / ceiling)
    return mix.astype("float32"), _loudness(mix)


def render(spec):
    if spec.get("role") == "drums":  # a kit plays the groove, not the phrase (./drums.py)
        from drums import beat

        mix, facts = beat(spec["files"], spec["bpm"])
    else:
        mix, facts = voice(spec["files"], spec["bpm"], spec["tonic"], spec["minor"], spec.get("role", "keys"), spec.get("cacheDir"))
    y, lufs = finish(mix, float(spec.get("lufs", -20.0)))
    return y, {"durationS": round(len(y) / SR, 3), "lufs": round(lufs, 2), **facts}


def _biquad_gain2(kind, gain_db, q, fc, w):
    """|H(e^jw)|^2 of one RBJ biquad (pyloudnorm's IIRfilter coefficients, the BS.1770 K-weighting pair)."""
    import numpy as np

    a_ = 10 ** (gain_db / 40.0)
    w0 = 2 * math.pi * fc / SR
    alpha = math.sin(w0) / (2 * q)
    c = math.cos(w0)
    if kind == "high_shelf":
        b = [a_ * ((a_ + 1) + (a_ - 1) * c + 2 * math.sqrt(a_) * alpha), -2 * a_ * ((a_ - 1) + (a_ + 1) * c), a_ * ((a_ + 1) + (a_ - 1) * c - 2 * math.sqrt(a_) * alpha)]
        a = [(a_ + 1) - (a_ - 1) * c + 2 * math.sqrt(a_) * alpha, 2 * ((a_ - 1) - (a_ + 1) * c), (a_ + 1) - (a_ - 1) * c - 2 * math.sqrt(a_) * alpha]
    else:  # high_pass
        b = [(1 + c) / 2, -(1 + c), (1 + c) / 2]
        a = [1 + alpha, -2 * c, 1 - alpha]
    z = np.exp(-1j * w)
    h = (b[0] + b[1] * z + b[2] * z * z) / (a[0] + a[1] * z + a[2] * z * z)
    return np.abs(h) ** 2


def _loudness(x):
    """Integrated loudness, LUFS (ITU-R BS.1770-4: K-weighting, 400 ms blocks at 75% overlap, the
    -70 LUFS absolute and -10 LU relative gates) in NumPy alone. pyloudnorm gives the same figure
    (within 0.1 LU on the renders here) but imports SciPy - ~650 module files, measured at 16 s of a
    21 s render on this box while other jobs held the disk. The K-weighting is applied as its
    magnitude in the frequency domain: block power does not depend on phase.
    """
    import numpy as np

    x = np.asarray(x, dtype="float64")
    n = len(x)
    if n < int(0.4 * SR):
        return 20.0 * math.log10(max(float(np.sqrt(np.mean(x * x))) if n else 0.0, 1e-9))
    # A power of two (a ragged length made the FFT 10x slower), past the signal by half a second
    # so the 38 Hz high-pass's tail does not wrap round onto its start.
    nfft = 1 << (n + SR // 2 - 1).bit_length()
    spec = np.fft.rfft(x, nfft)
    w = 2 * math.pi * np.fft.rfftfreq(nfft, 1.0 / SR) / SR
    g2 = _biquad_gain2("high_shelf", 4.0, 1 / math.sqrt(2), 1500.0, w) * _biquad_gain2("high_pass", 0.0, 0.5, 38.0, w)
    y = np.fft.irfft(spec * np.sqrt(g2), nfft)[:n]
    block, step = int(0.4 * SR), int(0.1 * SR)
    sq = np.concatenate([[0.0], np.cumsum(y * y)])
    starts = np.arange(0, n - block + 1, step)
    z = (sq[starts + block] - sq[starts]) / block
    with np.errstate(divide="ignore"):
        lk = -0.691 + 10 * np.log10(z)
    above = z[lk > -70.0]
    if len(above) == 0:
        return -70.0
    rel = -0.691 + 10 * math.log10(float(np.mean(above))) - 10.0
    kept = z[(lk > -70.0) & (lk > rel)]
    return -0.691 + 10 * math.log10(float(np.mean(kept if len(kept) else above)))


def render_to(spec, out, render_fn=None):
    """Render `spec` into `out` (16-bit WAV, swapped in whole) and answer the facts."""
    import soundfile as sf

    y, facts = (render_fn or render)(spec)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    tmp = f"{out}.{os.getpid()}.part.wav"
    sf.write(tmp, y, SR, subtype="PCM_16")
    swap_in(tmp, out)
    return facts


def serve(stdin, stdout):
    """One request per line, one answer per line, until stdin ends: {id, verb, spec, out} ->
    {id, ok, ...facts} or {id, ok: false, error, kind}. A render costs about a second; starting
    Python and importing NumPy costs three more on a loaded box, so the Node side keeps this
    running (lib/audio/renderWorker.ts) instead of spawning one per audition."""
    # The imports are paid here, before the first request, so a worker the server starts ahead of
    # time (renderWorker.ts warmWorkers) answers its first press at render speed.
    import numpy  # noqa: F401
    import soundfile  # noqa: F401
    from sketch import render_sketch

    fns = {"audition": None, "sketch": render_sketch}
    for line in stdin:
        line = line.strip()
        if not line:
            continue
        rid = None
        try:
            req = json.loads(line)
            rid = req.get("id")
            if req.get("verb") not in fns:
                raise AuditionError(f"no verb {req.get('verb')!r} here (audition, sketch)")
            facts = render_to(req["spec"], req["out"], fns[req["verb"]])
            doc = {"id": rid, "ok": True, **facts}
        except AuditionError as e:
            doc = {"id": rid, "ok": False, "error": str(e), "kind": "refused"}
        except Exception as e:  # the tool's own sentence; the loop goes on for the next request
            doc = {"id": rid, "ok": False, "error": str(e) or type(e).__name__, "kind": "failed"}
        stdout.write(json.dumps(doc) + "\n")
        stdout.flush()


def cmd_audition(a, emit, failure, render_fn=None):
    import soundfile as sf

    with open(a.spec, "r", encoding="utf8") as f:
        spec = json.load(f)
    try:
        y, facts = (render_fn or render)(spec)
    except AuditionError as e:
        raise failure(str(e), "refused") from None
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    tmp = f"{a.out}.{os.getpid()}.part.wav"
    sf.write(tmp, y, SR, subtype="PCM_16")
    swap_in(tmp, a.out)
    emit({"ok": True, **facts})
