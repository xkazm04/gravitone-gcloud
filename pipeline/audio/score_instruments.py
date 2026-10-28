"""Instrument catalog, SMF MIDI writer, and deterministic VST3 / sample-pack / synth rendering (A0).

Runtime paths to local desktop instruments and sample packs are read ONLY from environment
variables (`GRAVITONE_VST3_DIR`, `GRAVITONE_ABLETON_SAMPLES_DIR`, `GRAVITONE_FL_PACKS_DIR`,
`GRAVITONE_INSTRUMENTS_CONFIG`) or an untracked runtime JSON config (`.hackathon/instruments.local.json`).
No machine-specific paths are hardcoded in committed code.
"""

import json
import math
import os
import struct
import time

import numpy as np
from scipy import signal

RATE = 44100


def _entry(id_, name, role, engine, plain, char, pr, lic, status="ready", refusal=None):
    return {
        "id": id_, "name": name, "role": role, "engine": engine, "plainLabel": plain,
        "character": char, "pitchRange": pr, "licence": lic, "status": status, "refusalReason": refusal,
    }


_LIC_SAMPLE = "Local DAW sample pack (licensed to this machine; runtime path only)"
_LIC_VITAL = "Vital Audio EULA: commercial audio output permitted"

CATALOG = {
    "kit-808-warm": _entry("kit-808-warm", "808 Boom-Bap Kit", "drums", "sample-pack", "Deep sub kick, crisp snare, warm vinyl hats", "warm", (35, 81), _LIC_SAMPLE),
    "kit-909-pulse": _entry("kit-909-pulse", "909 Tight Electronic Kit", "drums", "sample-pack", "Punchy electronic kick, snappy clap, bright hats", "punchy", (35, 81), _LIC_SAMPLE),
    "kit-acoustic-brush": _entry("kit-acoustic-brush", "Soft Studio Brush Kit", "drums", "sample-pack", "Gentle acoustic kick, soft rimshot, brushed hats", "soft", (35, 81), _LIC_SAMPLE),
    "vital-sub-bass": _entry("vital-sub-bass", "Vital Warm Sub Bass", "bass", "vital-vst3", "Deep, smooth low-end anchor from Vital synth", "deep", (24, 60), _LIC_VITAL),
    "sample-mamas-bass": _entry("sample-mamas-bass", "Picked Finger Bass", "bass", "sample-pack", "Warm sampled bass guitar with natural pluck", "warm", (24, 64), _LIC_SAMPLE),
    "vital-pulse-bass": _entry("vital-pulse-bass", "Vital Analog Pulse Bass", "bass", "vital-vst3", "Rhythmic synth bass with warm filter sweep", "punchy", (24, 64), _LIC_VITAL),
    "sample-felt-piano": _entry("sample-felt-piano", "Upright Felt Piano", "chords", "sample-pack", "Intimate upright home piano with soft felt hammers", "soft", (36, 88), _LIC_SAMPLE),
    "vital-warm-pad": _entry("vital-warm-pad", "Vital Warm Pad", "chords", "vital-vst3", "Floating stereo synth pad that fills the room", "warm", (36, 84), _LIC_VITAL),
    "sample-lofi-keys": _entry("sample-lofi-keys", "Lo-Fi Electric Keys", "chords", "sample-pack", "Warm vintage electric piano with gentle warble", "warm", (36, 84), _LIC_SAMPLE),
    "sample-grand-piano": _entry("sample-grand-piano", "Concert Grand Piano", "chords", "sample-pack", "Clear acoustic grand piano across full range", "bright", (28, 96), _LIC_SAMPLE),
    "vital-pluck-lead": _entry("vital-pluck-lead", "Vital Pluck Synth", "lead", "vital-vst3", "Crisp, bell-like synth pluck for clear melodies", "bright", (48, 96), _LIC_VITAL),
    "sample-ikembe-bell": _entry("sample-ikembe-bell", "Kalimba Thumb Bell", "lead", "sample-pack", "Organic metallic thumb piano with woody resonance", "warm", (48, 88), _LIC_SAMPLE),
    "sample-mallet-guitar": _entry("sample-mallet-guitar", "Warm Mallet Guitar", "lead", "sample-pack", "Muted plucked acoustic guitar with soft decay", "soft", (40, 84), _LIC_SAMPLE),
    "vital-glass-lead": _entry("vital-glass-lead", "Vital Airy Flute Lead", "lead", "vital-vst3", "Smooth, breathy synth melody that sits gently", "soft", (48, 96), _LIC_VITAL),
    "minigrand-vst3": _entry("minigrand-vst3", "AIR MiniGrand VST3", "chords", "vital-vst3", "Acoustic piano plugin; refused by silent render gate", "bright", (21, 108), "AIR Music Tech standard EULA", "refused", "instrument render is silent (note-on C4 vel 100 measured null LUFS)"),
    "hybrid-vst3": _entry("hybrid-vst3", "AIR Hybrid 3 VST3", "lead", "vital-vst3", "Subtractive synth plugin; refused by load and licence gate", "punchy", (24, 96), "", "refused", "cold load 77.6 s exceeds 5.0 s ceiling and licence note is empty"),
}

_VITAL_CACHE = None
_SAMPLE_CACHE = {}


def runtime_paths():
    """Resolve local instrument directories from env vars or untracked runtime config."""
    repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    cfg_path = os.environ.get("GRAVITONE_INSTRUMENTS_CONFIG") or os.path.join(repo_root, ".hackathon", "instruments.local.json")
    cfg = {}
    if os.path.isfile(cfg_path):
        try:
            with open(cfg_path, encoding="utf-8") as f:
                cfg = json.load(f)
        except Exception:
            cfg = {}
    vst3_dir = os.environ.get("GRAVITONE_VST3_DIR") or cfg.get("vst3Dir") or os.path.join(os.environ.get("CommonProgramFiles", ""), "VST3")
    ableton_dir = os.environ.get("GRAVITONE_ABLETON_SAMPLES_DIR") or cfg.get("abletonSamplesDir") or ""
    fl_dir = os.environ.get("GRAVITONE_FL_PACKS_DIR") or cfg.get("flPacksDir") or ""
    return {"vst3Dir": vst3_dir, "abletonSamplesDir": ableton_dir, "flPacksDir": fl_dir}


def _vlq(n):
    val = max(0, int(n))
    out = [val & 0x7F]
    val >>= 7
    while val > 0:
        out.append((val & 0x7F) | 0x80)
        val >>= 7
    return bytes(reversed(out))


def write_smf_midi(events, bpm, out_path):
    """Write note events [(start_s, end_s, midi, vel)] to a Standard MIDI File (Format 0, 480 TPB)."""
    tpb = 480
    us_per_beat = int(round(60_000_000 / float(bpm)))
    sec_to_tick = lambda s: int(round(float(s) * (bpm / 60.0) * tpb))
    raw = []
    for start_s, end_s, midi_note, vel in events:
        t0 = max(0, sec_to_tick(start_s))
        t1 = max(t0 + 1, sec_to_tick(end_s))
        raw.append((t0, 1, bytes([0x90, int(midi_note) & 0x7F, max(1, min(127, int(vel)))])))
        raw.append((t1, 0, bytes([0x80, int(midi_note) & 0x7F, 0])))
    raw.sort(key=lambda x: (x[0], x[1]))
    body = bytearray()
    body += _vlq(0) + b"\xFF\x51\x03" + us_per_beat.to_bytes(3, "big")
    last_tick = 0
    for tick, _kind, msg in raw:
        body += _vlq(tick - last_tick) + msg
        last_tick = tick
    body += _vlq(0) + b"\xFF\x2F\x00"
    header = b"MThd" + struct.pack(">IHHH", 6, 0, 1, tpb)
    track = b"MTrk" + struct.pack(">I", len(body)) + bytes(body)
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    with open(out_path, "wb") as f:
        f.write(header + track)


def _load_sample(path):
    if path in _SAMPLE_CACHE:
        return _SAMPLE_CACHE[path]
    import soundfile as sf
    data, sr = sf.read(path, dtype="float32", always_2d=True)
    if sr != RATE:
        g = math.gcd(int(sr), RATE)
        data = signal.resample_poly(data, RATE // g, int(sr) // g, axis=0).astype(np.float32)
    if data.shape[1] == 1:
        data = np.repeat(data, 2, axis=1)
    peak = float(np.max(np.abs(data))) if data.size else 0.0
    if peak > 1e-4:
        data = (data / peak * 0.85).astype(np.float32)
    _SAMPLE_CACHE[path] = data
    return data


def _find_multisample(inst_id):
    ab = runtime_paths()["abletonSamplesDir"]
    mapping = {}
    if ab and os.path.isdir(ab):
        candidates = {
            "sample-felt-piano": ("Multisamples/Upright Home Piano", [("Upright Home Piano C2.aif", 36), ("Upright Home Piano C3.aif", 48), ("Upright Home Piano C4.aif", 60), ("Upright Home Piano C5.aif", 72)]),
            "sample-grand-piano": ("Multisamples/Grand Piano", [("GrandPiano C2 mf.aif", 36), ("GrandPiano C3 mf.aif", 48), ("GrandPiano C4 mf.aif", 60), ("GrandPiano C5 mf.aif", 72)]),
            "sample-lofi-keys": ("Multisamples/Synths/Lo Fi Voodoo", [("Lo Fi Voodoo - C1 - 1.aif", 36), ("Lo Fi Voodoo - C2 - 1.aif", 48), ("Lo Fi Voodoo - C3 - 1.aif", 60), ("Lo Fi Voodoo - C4 - 1.aif", 72)]),
            "sample-mamas-bass": ("Multisamples/Synths/Mamas Bass", [("Mamas Bass - C1.aif", 36), ("Mamas Bass - F#1.aif", 42), ("Mamas Bass - C2.aif", 48), ("Mamas Bass - F#2.aif", 54)]),
            "sample-ikembe-bell": ("Multisamples/Ikembe", [("Ikembe C2.aif", 60), ("Ikembe E2.aif", 64), ("Ikembe A2.aif", 69), ("Ikembe C3.aif", 72)]),
            "sample-mallet-guitar": ("Multisamples/Mallet Guitar", [("Mallet Guitar C1.wav", 48), ("Mallet Guitar C2.wav", 60), ("Mallet Guitar C3.wav", 72), ("Mallet Guitar C4.wav", 84)]),
        }
        if inst_id in candidates:
            sub, files = candidates[inst_id]
            folder = os.path.join(ab, *sub.split("/"))
            for fname, root_midi in files:
                fp = os.path.join(folder, fname)
                if os.path.isfile(fp):
                    mapping[root_midi] = fp
    return mapping


def _find_drum_samples(kit_id):
    paths = runtime_paths()
    ab, fl = paths["abletonSamplesDir"], paths["flPacksDir"]
    found = {}
    if ab and os.path.isdir(ab):
        picks = {
            "kit-808-warm": {"kick": "One Shots/Drums/Kick/Kick 007.aif", "snare": "One Shots/Drums/Snare/Snare 505.aif", "hat": "One Shots/Drums/Hihat/Hihat Closed 45 Vinyl.wav", "clap": "One Shots/Drums/Clap/Clap 808.aif"},
            "kit-909-pulse": {"kick": "Multisamples/Drum Machines/909/Kick 909 Tune1.wav", "snare": "One Shots/Drums/Snare/Snare 707.wav", "hat": "One Shots/Drums/Hihat/Hihat Closed 606.aif", "clap": "One Shots/Drums/Clap/Clap 909.aif"},
            "kit-acoustic-brush": {"kick": "One Shots/Drums/Kick/Kick 606.wav", "snare": "One Shots/Drums/Snare/Snare 3k Hiss.wav", "hat": "One Shots/Drums/Hihat/Hihat Closed 2B.aif", "clap": "One Shots/Drums/Clap/Clap 808 Light Quick.aif"},
        }.get(kit_id, {})
        for part, rel in picks.items():
            fp = os.path.join(ab, *rel.split("/"))
            if os.path.isfile(fp):
                found[part] = fp
    if len(found) < 3 and fl and os.path.isdir(fl):
        wv_picks = {"kick": "Drums (ModeAudio)/Kicks/Attack Kick 01.wv", "snare": "Drums (ModeAudio)/Snares/Attack Snare 01.wv", "hat": "Drums (ModeAudio)/Hi Hats/Attack Hat 01.wv", "clap": "Drums (ModeAudio)/Claps/Attack Clap 01.wv"}
        for part, rel in wv_picks.items():
            fp = os.path.join(fl, *rel.split("/"))
            if part not in found and os.path.isfile(fp):
                found[part] = fp
    return found


def _get_vital(vst_override=None):
    global _VITAL_CACHE
    if vst_override == "off" or os.environ.get("GRAVITONE_VST3_DISABLE") == "1":
        return None
    if _VITAL_CACHE is not None:
        return _VITAL_CACHE
    vst_dir = runtime_paths()["vst3Dir"]
    vital_path = os.path.join(vst_dir, "Vital.vst3") if vst_dir else ""
    if not vital_path or not os.path.exists(vital_path):
        return None
    try:
        import pedalboard as pb
        _VITAL_CACHE = pb.load_plugin(vital_path)
        return _VITAL_CACHE
    except Exception:
        return None


def _configure_vital_patch(inst, inst_id, brightness=0.5):
    p = inst.parameters
    for k in ("oscillator_1_phase_randomization", "oscillator_2_phase_randomization", "oscillator_3_phase_randomization", "sample_random_phase"):
        if k in p:
            p[k].raw_value = 0.0
    presets = {
        "vital-sub-bass": (0.08, 0.35, 0.65, 0.20, 0.0),
        "vital-pulse-bass": (0.04, 0.25, 0.45, 0.16, 0.35),
        "vital-warm-pad": (0.35, 0.55, 0.85, 0.45, 0.15),
        "vital-pluck-lead": (0.02, 0.28, 0.18, 0.25, 0.50),
        "vital-glass-lead": (0.20, 0.45, 0.70, 0.35, 0.25),
    }
    att, dec, sus, rel, morph = presets.get(inst_id, (0.08, 0.4, 0.6, 0.25, 0.2))
    if "envelope_1_attack" in p:
        p["envelope_1_attack"].raw_value = att
    if "envelope_1_decay" in p:
        p["envelope_1_decay"].raw_value = dec
    if "envelope_1_sustain" in p:
        p["envelope_1_sustain"].raw_value = sus
    if "envelope_1_release" in p:
        p["envelope_1_release"].raw_value = rel
    if "oscillator_1_wave_frame" in p:
        p["oscillator_1_wave_frame"].raw_value = min(1.0, max(0.0, morph + 0.2 * float(brightness)))
    inst.reset()


def _synth_voice(events, duration_s, inst_id, brightness=0.5):
    n_frames = int(round(duration_s * RATE))
    out = np.zeros((n_frames, 2), dtype=np.float32)
    meta = CATALOG.get(inst_id, {})
    role, char = meta.get("role", "chords"), meta.get("character", "warm")
    for start_s, end_s, midi_note, vel in events:
        i0 = max(0, int(round(start_s * RATE)))
        if i0 >= n_frames:
            continue
        dur = max(0.05, float(end_s - start_s))
        tail = 0.35 if role in ("chords", "lead") else 0.12
        length = min(n_frames - i0, int(round((dur + tail) * RATE)))
        if length <= 0:
            continue
        t = np.arange(length, dtype=np.float64) / RATE
        freq = 440.0 * (2.0 ** ((float(midi_note) - 69.0) / 12.0))
        amp = (float(vel) / 127.0) ** 1.3 * 0.26
        att = 0.08 if "pad" in inst_id or "glass" in inst_id else (0.012 if role == "bass" else 0.006)
        env = np.minimum(1.0, t / att) * np.exp(-t / (0.35 if "pluck" in inst_id or "bell" in inst_id or "piano" in inst_id else 1.8))
        env *= np.clip((dur + tail - t) / max(0.06, tail), 0.0, 1.0)
        harmonics = (1, 2, 3, 4) if char in ("warm", "soft", "deep") else (1, 2, 3, 4, 5, 6)
        falloff = 1.6 - 0.5 * float(brightness)
        body = sum(np.sin(2.0 * math.pi * freq * h * t) / (h ** falloff) for h in harmonics)
        side_l = np.sin(2.0 * math.pi * freq * 1.0015 * t + 0.3) * 0.22
        side_r = np.sin(2.0 * math.pi * freq * 0.9985 * t - 0.3) * 0.22
        out[i0:i0 + length, 0] += ((body + side_l) * env * amp).astype(np.float32)
        out[i0:i0 + length, 1] += ((body + side_r) * env * amp).astype(np.float32)
    cutoff = min(18000.0, max(400.0, (1200.0 if role == "bass" else 3200.0) + 6000.0 * float(brightness)))
    sos = signal.butter(2, cutoff, "lowpass", fs=RATE, output="sos")
    return signal.sosfilt(sos, out, axis=0).astype(np.float32), "scipy-synth"


def render_instrument_events(inst_id, events, duration_s, brightness=0.5):
    """Render [(start_s, end_s, midi, vel)] -> (float32 (frames, 2), source_used)."""
    if inst_id not in CATALOG:
        raise ValueError(f"unknown instrument {inst_id!r}")
    entry = CATALOG[inst_id]
    if entry["status"] != "ready" or not entry["licence"].strip():
        raise ValueError(f"instrument {inst_id} refused: {entry['refusalReason'] or 'not ready'}")
    n_frames = int(round(duration_s * RATE))
    if entry["role"] == "drums":
        kit_files = _find_drum_samples(inst_id)
        out = np.zeros((n_frames, 2), dtype=np.float32)
        if len(kit_files) >= 3:
            samples = {k: _load_sample(p) for k, p in kit_files.items()}
            source_used = "local-sample-kit"
        else:
            t_k = np.arange(int(0.28 * RATE)) / RATE
            kick = (np.sin(2 * np.pi * np.cumsum(48 + 95 * np.exp(-t_k * 32)) / RATE) * np.exp(-t_k * 9.5))[:, None].repeat(2, axis=1).astype(np.float32)
            rng = np.random.default_rng(108)
            t_s = np.arange(int(0.18 * RATE)) / RATE
            sn_noise = signal.sosfilt(signal.butter(2, (900, 5200), "bandpass", fs=RATE, output="sos"), rng.standard_normal(len(t_s)))
            snare = ((sn_noise * np.exp(-t_s * 24) + 0.45 * np.sin(2 * np.pi * 185 * t_s) * np.exp(-t_s * 28)) * 0.55)[:, None].repeat(2, axis=1).astype(np.float32)
            t_h = np.arange(int(0.06 * RATE)) / RATE
            hat_n = signal.sosfilt(signal.butter(2, 6800, "highpass", fs=RATE, output="sos"), rng.standard_normal(len(t_h)))
            hat = (hat_n * np.exp(-t_h * 75) * 0.35)[:, None].repeat(2, axis=1).astype(np.float32)
            samples = {"kick": kick, "snare": snare, "hat": hat, "clap": snare * 0.8}
            source_used = "scipy-drum-kit"
        for start_s, _end_s, midi_note, vel in events:
            i0 = max(0, int(round(start_s * RATE)))
            if i0 >= n_frames:
                continue
            part = "kick" if midi_note <= 37 else ("snare" if midi_note in (38, 40) else ("clap" if midi_note == 39 else "hat"))
            wav = samples.get(part, samples["hat"])
            length = min(n_frames - i0, len(wav))
            gain = (float(vel) / 127.0) ** 1.2 * (0.95 if part == "kick" else (0.75 if part in ("snare", "clap") else 0.42))
            pan = -0.12 if part == "hat" and (int(round(start_s * 8)) % 2 == 0) else (0.12 if part == "hat" else 0.0)
            out[i0:i0 + length, 0] += wav[:length, 0] * gain * (1.0 - max(0.0, pan))
            out[i0:i0 + length, 1] += wav[:length, 1] * gain * (1.0 + min(0.0, pan))
        return out, source_used

    if entry["engine"] == "vital-vst3":
        vital = _get_vital()
        if vital is not None:
            _configure_vital_patch(vital, inst_id, brightness=brightness)
            midi_msgs = []
            for start_s, end_s, midi_note, vel in events:
                midi_msgs.append((bytes([0x90, int(midi_note) & 0x7F, max(1, min(127, int(vel)))]), float(start_s)))
                midi_msgs.append((bytes([0x80, int(midi_note) & 0x7F, 0]), float(end_s)))
            midi_msgs.sort(key=lambda x: (x[1], x[0][0]))
            rendered = vital(midi_msgs, duration=float(duration_s), sample_rate=RATE, num_channels=2)
            y = np.ascontiguousarray(rendered.T, dtype=np.float32)[:n_frames]
            if float(np.max(np.abs(y))) > 1e-4:
                if len(y) < n_frames:
                    y = np.vstack([y, np.zeros((n_frames - len(y), 2), dtype=np.float32)])
                return y, "vital-vst3"

    if entry["engine"] == "sample-pack":
        ms = _find_multisample(inst_id)
        if ms:
            out = np.zeros((n_frames, 2), dtype=np.float32)
            roots = sorted(ms.keys())
            for start_s, end_s, midi_note, vel in events:
                i0 = max(0, int(round(start_s * RATE)))
                if i0 >= n_frames:
                    continue
                nearest = min(roots, key=lambda r: abs(r - midi_note))
                base_wav = _load_sample(ms[nearest])
                semis = float(midi_note - nearest)
                if abs(semis) < 0.01:
                    shifted = base_wav
                else:
                    ratio = 2.0 ** (-semis / 12.0)
                    new_len = max(16, int(round(len(base_wav) * ratio)))
                    idx = np.linspace(0, len(base_wav) - 1, new_len)
                    idx_lo = np.floor(idx).astype(np.int32)
                    idx_hi = np.minimum(len(base_wav) - 1, idx_lo + 1)
                    frac = (idx - idx_lo)[:, None].astype(np.float32)
                    shifted = base_wav[idx_lo] * (1.0 - frac) + base_wav[idx_hi] * frac
                dur_frames = min(n_frames - i0, len(shifted), int(round((end_s - start_s + 0.35) * RATE)))
                if dur_frames <= 0:
                    continue
                seg = shifted[:dur_frames].copy()
                rel_n = min(dur_frames, int(0.08 * RATE))
                if rel_n > 0:
                    seg[-rel_n:] *= np.linspace(1.0, 0.0, rel_n, dtype=np.float32)[:, None]
                gain = (float(vel) / 127.0) ** 1.2 * 0.48
                out[i0:i0 + dur_frames] += seg * gain
            return out, "local-multisample"

    return _synth_voice(events, duration_s, inst_id, brightness=brightness)


def audition_instrument(inst_id, out_path=None):
    """Render a 2.4s musical audition phrase for a catalog instrument, verify determinism, and measure."""
    import loudness
    import soundfile as sf

    if inst_id not in CATALOG:
        raise ValueError(f"unknown instrument {inst_id!r}")
    entry = CATALOG[inst_id]
    if not entry["licence"].strip():
        raise ValueError(f"instrument {inst_id} refused: licence note is empty ({entry['refusalReason'] or 'no licence'})")
    if entry["status"] != "ready":
        raise ValueError(f"instrument {inst_id} refused: {entry['refusalReason'] or 'audition failed'}")

    role = entry["role"]
    phrases = {
        "drums": [(0.0, 0.25, 36, 110), (0.25, 0.35, 42, 85), (0.5, 0.75, 38, 105), (0.75, 0.85, 42, 80), (1.0, 1.25, 36, 112), (1.25, 1.45, 36, 98), (1.5, 1.75, 39, 108), (1.75, 1.85, 42, 88)],
        "bass": [(0.0, 0.45, 36, 108), (0.5, 0.95, 43, 102), (1.0, 1.45, 41, 105), (1.5, 2.0, 36, 110)],
        "chords": [(0.0, 0.95, 60, 96), (0.0, 0.95, 64, 92), (0.0, 0.95, 67, 94), (0.0, 0.95, 71, 88), (1.0, 2.0, 57, 96), (1.0, 2.0, 60, 92), (1.0, 2.0, 64, 94), (1.0, 2.0, 69, 90)],
        "lead": [(0.0, 0.4, 69, 102), (0.45, 0.85, 72, 98), (0.9, 1.35, 76, 106), (1.4, 2.0, 72, 96)],
    }
    events = phrases[role]
    t0 = time.time()
    a1, source_used = render_instrument_events(inst_id, events, 2.4, brightness=0.55)
    t1 = time.time()
    a2, _ = render_instrument_events(inst_id, events, 2.4, brightness=0.55)
    max_diff = float(np.max(np.abs(a1 - a2)))
    tp = loudness.true_peak_db(a1, RATE)
    if tp is not None and tp > -1.1:
        a1 = (a1 * (10.0 ** ((-1.1 - tp) / 20.0))).astype(np.float32)
    meas = loudness.measure(a1, RATE)
    if meas["integratedLufs"] is None:
        raise ValueError(f"instrument {inst_id} render is silent")
    if out_path:
        os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
        sf.write(out_path, a1, RATE, subtype="PCM_16", format="WAV")
    return {
        "ok": True,
        "id": inst_id,
        "name": entry["name"],
        "role": role,
        "source": source_used,
        "outPath": os.path.abspath(out_path) if out_path else None,
        "audition": {
            "status": "ready",
            "noteOnWorks": True,
            "lufsAtVel100": meas["integratedLufs"],
            "truePeakDb": meas["truePeakDb"],
            "tailS": meas["tailSilenceS"],
            "renderMs": int(round((t1 - t0) * 1000)),
            "deterministic": max_diff == 0.0,
            "maxDiff": round(max_diff, 8),
            "refusalReason": None,
        },
    }
