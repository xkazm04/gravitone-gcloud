"""Compile a ScoreSpec into MIDI and per-role WAV stems, mix with FxChain + sidechain ducking,
master to -14 LUFS, verify determinism, and export a REAPER .rpp project (D6 + A2 + C6).
"""

import hashlib
import json
import math
import os
import time
import zlib

import numpy as np
from scipy import signal

import fxchain
import loudness
import score_instruments as inst_lib
import triage

SCORE_SPEC_VERSION = 1
ROLES = ("drums", "bass", "chords", "lead")
KEYS = {
    "C major": (0, (0, 2, 4, 5, 7, 9, 11)), "G major": (7, (0, 2, 4, 5, 7, 9, 11)),
    "D major": (2, (0, 2, 4, 5, 7, 9, 11)), "F major": (5, (0, 2, 4, 5, 7, 9, 11)),
    "Bb major": (10, (0, 2, 4, 5, 7, 9, 11)), "Eb major": (3, (0, 2, 4, 5, 7, 9, 11)),
    "A minor": (9, (0, 2, 3, 5, 7, 8, 10)), "E minor": (4, (0, 2, 3, 5, 7, 8, 10)),
    "D minor": (2, (0, 2, 3, 5, 7, 8, 10)), "C minor": (0, (0, 2, 3, 5, 7, 8, 10)),
    "G minor": (7, (0, 2, 3, 5, 7, 8, 10)), "F# minor": (6, (0, 2, 3, 5, 7, 8, 10)),
}
STYLES = ("chill-hiphop", "calm-bed", "synthwave-pulse", "warm-acoustic")
NOTE_NAMES = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "Bb", "B")
TAIL_SILENCE_S = 0.5
FADE_OUT_S = 1.2
TARGET_LUFS = -14.0
CEILING_DBTP = -1.1


class ScoreRefused(ValueError):
    """A ScoreSpec that violates a schema bound, key constraint, or instrument audition gate."""


def _num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def _int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def _note_name(midi):
    return f"{NOTE_NAMES[midi % 12]}{(midi // 12) - 1}"


def validate_spec(doc):
    """Validate ScoreSpec dict with strict paths matching @gt/domain/audio.score."""
    if not isinstance(doc, dict):
        raise ScoreRefused("(root): expected an object")
    extra = sorted(set(doc) - {"v", "title", "style", "seed", "tempoBpm", "key", "loop", "controls", "sections", "tracks"})
    if extra:
        raise ScoreRefused(f"(root): unrecognized key {extra[0]!r}")
    if doc.get("v") != SCORE_SPEC_VERSION:
        raise ScoreRefused(f"v: expected {SCORE_SPEC_VERSION}, got {doc.get('v')!r}")
    title = doc.get("title")
    if not isinstance(title, str) or not (1 <= len(title.strip()) <= 120):
        raise ScoreRefused("title: expected 1..120 characters")
    if "style" in doc and doc["style"] not in STYLES:
        raise ScoreRefused(f"style: unknown style {doc['style']!r}")
    seed = doc.get("seed")
    if not _int(seed) or not (0 <= seed <= 2147483647):
        raise ScoreRefused(f"seed: expected integer 0..2147483647, got {seed!r}")
    bpm = doc.get("tempoBpm")
    if not _num(bpm) or not (40 <= bpm <= 220):
        raise ScoreRefused(f"tempoBpm: {bpm!r} is outside 40..220")
    key = doc.get("key")
    if key not in KEYS:
        raise ScoreRefused(f"key: unknown key {key!r}")
    if "loop" in doc and not isinstance(doc["loop"], bool):
        raise ScoreRefused("loop: expected a boolean")
    ctrls = doc.get("controls")
    if not isinstance(ctrls, dict):
        raise ScoreRefused("controls: expected an object")
    ctrl_bounds = {"density": (0, 1), "brightness": (0, 1), "lift": (0, 1), "swing": (0, 0.5), "humanise": (0, 1)}
    extra_c = sorted(set(ctrls) - set(ctrl_bounds))
    if extra_c:
        raise ScoreRefused(f"controls: unrecognized key {extra_c[0]!r}")
    for ck, (lo, hi) in ctrl_bounds.items():
        cv = ctrls.get(ck)
        if not _num(cv) or not (lo <= cv <= hi):
            raise ScoreRefused(f"controls.{ck}: {cv!r} is outside {lo}..{hi}")
    secs = doc.get("sections")
    if not isinstance(secs, list) or not (1 <= len(secs) <= 8):
        raise ScoreRefused("sections: expected 1..8 sections")
    total_bars = 0
    for i, s in enumerate(secs):
        if not isinstance(s, dict):
            raise ScoreRefused(f"sections.{i}: expected an object")
        extra_s = sorted(set(s) - {"name", "bars", "energy", "progression"})
        if extra_s:
            raise ScoreRefused(f"sections.{i}: unrecognized key {extra_s[0]!r}")
        if not isinstance(s.get("name"), str) or not (1 <= len(s["name"].strip()) <= 40):
            raise ScoreRefused(f"sections.{i}.name: expected 1..40 characters")
        if not _int(s.get("bars")) or not (1 <= s["bars"] <= 32):
            raise ScoreRefused(f"sections.{i}.bars: expected integer 1..32, got {s.get('bars')!r}")
        if not _num(s.get("energy")) or not (0 <= s["energy"] <= 1):
            raise ScoreRefused(f"sections.{i}.energy: {s.get('energy')!r} is outside 0..1")
        if "progression" in s:
            prog = s["progression"]
            if not isinstance(prog, list) or not (1 <= len(prog) <= 8) or not all(_int(x) and 0 <= x <= 6 for x in prog):
                raise ScoreRefused(f"sections.{i}.progression: expected 1..8 scale degrees in 0..6")
        total_bars += s["bars"]
    if not (2 <= total_bars <= 64):
        raise ScoreRefused(f"sections: total bars {total_bars} is outside 2..64")
    tracks = doc.get("tracks")
    if not isinstance(tracks, list) or not (1 <= len(tracks) <= 4):
        raise ScoreRefused("tracks: expected 1..4 tracks")
    root_pc, steps = KEYS[key]
    allowed_pc = {(root_pc + st) % 12 for st in steps}
    seen_roles = set()
    for i, tr in enumerate(tracks):
        if not isinstance(tr, dict):
            raise ScoreRefused(f"tracks.{i}: expected an object")
        extra_t = sorted(set(tr) - {"role", "instrument", "muted", "solo", "gainDb", "pan", "pattern", "fx", "notes"})
        if extra_t:
            raise ScoreRefused(f"tracks.{i}: unrecognized key {extra_t[0]!r}")
        role = tr.get("role")
        if role not in ROLES:
            raise ScoreRefused(f"tracks.{i}.role: unknown role {role!r}")
        if role in seen_roles:
            raise ScoreRefused(f"tracks.{i}.role: duplicate role {role}")
        seen_roles.add(role)
        inst_id = tr.get("instrument")
        if inst_id not in inst_lib.CATALOG:
            raise ScoreRefused(f"tracks.{i}.instrument: unknown instrument {inst_id!r}")
        cat = inst_lib.CATALOG[inst_id]
        if not cat["licence"].strip():
            raise ScoreRefused(f"tracks.{i}.instrument: {inst_id} has an empty licence note")
        if cat["status"] != "ready":
            raise ScoreRefused(f"tracks.{i}.instrument: {inst_id} refused ({cat['refusalReason']})")
        if cat["role"] != role:
            raise ScoreRefused(f"tracks.{i}.instrument: {inst_id} is for {cat['role']}, not {role}")
        if "gainDb" in tr and (not _num(tr["gainDb"]) or not (-24 <= tr["gainDb"] <= 12)):
            raise ScoreRefused(f"tracks.{i}.gainDb: {tr['gainDb']!r} is outside -24..12")
        if "pan" in tr and (not _num(tr["pan"]) or not (-1 <= tr["pan"] <= 1)):
            raise ScoreRefused(f"tracks.{i}.pan: {tr['pan']!r} is outside -1..1")
        if "fx" in tr:
            try:
                fxchain.validate(tr["fx"])
            except fxchain.ChainRefused as e:
                raise ScoreRefused(f"tracks.{i}.fx.{e}") from None
        if "notes" in tr:
            notes = tr["notes"]
            if not isinstance(notes, list) or len(notes) > 512:
                raise ScoreRefused(f"tracks.{i}.notes: expected array up to 512 notes")
            lo_p, hi_p = cat["pitchRange"]
            for j, n in enumerate(notes):
                if not isinstance(n, dict):
                    raise ScoreRefused(f"tracks.{i}.notes.{j}: expected an object")
                bar_n, beat_n, dur_n, midi_n, vel_n = n.get("bar"), n.get("beat"), n.get("durationBeats"), n.get("midi"), n.get("velocity")
                if not _int(bar_n) or not (1 <= bar_n <= total_bars):
                    raise ScoreRefused(f"tracks.{i}.notes.{j}.bar: bar {bar_n!r} exceeds total bars {total_bars}")
                if not _num(beat_n) or not (0 <= beat_n < 4.0):
                    raise ScoreRefused(f"tracks.{i}.notes.{j}.beat: {beat_n!r} is outside 0..3.99")
                if not _num(dur_n) or not (0.1 <= dur_n <= 16.0):
                    raise ScoreRefused(f"tracks.{i}.notes.{j}.durationBeats: {dur_n!r} is outside 0.1..16")
                if not _int(midi_n) or not (lo_p <= midi_n <= hi_p):
                    raise ScoreRefused(f"tracks.{i}.notes.{j}.midi: {midi_n!r} is outside {inst_id} range {lo_p}..{hi_p}")
                if not _int(vel_n) or not (1 <= vel_n <= 127):
                    raise ScoreRefused(f"tracks.{i}.notes.{j}.velocity: {vel_n!r} is outside 1..127")
                if role != "drums" and (midi_n % 12) not in allowed_pc:
                    raise ScoreRefused(f"tracks.{i}.notes.{j}.midi: {midi_n} ({_note_name(midi_n)}) leaves declared key {key} in bar {bar_n}")
    return doc


def _seeded_rng(seed, *tags):
    words = [int(seed)] + [zlib.crc32(str(t).encode("utf8")) for t in tags]
    return np.random.default_rng(np.random.SeedSequence(words))


def _scale_midi(key, base_octave, degree):
    root_pc, steps = KEYS[key]
    oct_shift, deg = divmod(int(degree), 7)
    return 12 * (base_octave + 1 + oct_shift) + root_pc + steps[deg]


def compile_track_events(spec, track):
    """Compile one role track into [(start_s, end_s, midi, vel)] deterministically."""
    bpm = float(spec["tempoBpm"])
    beat_s, bar_s = 60.0 / bpm, 240.0 / bpm
    ctrls = spec["controls"]
    swing, density, lift, humanise = float(ctrls["swing"]), float(ctrls["density"]), float(ctrls["lift"]), float(ctrls["humanise"])
    role = track["role"]
    r = _seeded_rng(spec["seed"], role, track.get("pattern") or "default", spec["key"])

    if track.get("notes"):
        return [
            (round(((n["bar"] - 1) * 4.0 + float(n["beat"])) * beat_s, 6),
             round(((n["bar"] - 1) * 4.0 + float(n["beat"]) + float(n["durationBeats"])) * beat_s, 6),
             int(n["midi"]), int(n["velocity"]))
            for n in track["notes"]
        ]

    events, at_bar = [], 0
    lo_p, hi_p = inst_lib.CATALOG[track["instrument"]]["pitchRange"]
    for sec_idx, sec in enumerate(spec["sections"]):
        bars, sec_energy = int(sec["bars"]), float(sec["energy"])
        is_lift = sec_energy >= 0.65 or (len(spec["sections"]) >= 3 and sec_idx == 1)
        eff_energy = min(1.0, max(0.15, sec_energy * (0.7 + 0.3 * lift) if is_lift else sec_energy * (1.0 - 0.25 * lift)))
        prog = sec.get("progression") or [0, 5, 3, 4]
        for k in range(bars):
            bar_start_s = (at_bar + k) * bar_s
            deg = prog[k % len(prog)]
            vel_base = int(round(68 + 42 * eff_energy))
            if role == "drums":
                kicks = (0.0, 1.5, 2.0, 3.0) if (is_lift and density >= 0.5) else (0.0, 2.0)
                snares = (1.0, 3.0)
                hat_step = 0.25 if (is_lift and density >= 0.65) else (0.5 if eff_energy >= 0.35 else 1.0)
                for bt in kicks:
                    jit = float(r.uniform(-0.004, 0.004)) * humanise if bt > 0 else 0.0
                    v = max(45, min(126, vel_base + int(r.integers(-5, 6) * humanise)))
                    events.append((max(0.0, bar_start_s + bt * beat_s + jit), bar_start_s + (bt + 0.35) * beat_s, 36, v))
                for bt in snares:
                    jit = float(r.uniform(-0.005, 0.005)) * humanise
                    v = max(40, min(124, vel_base - (0 if is_lift else 14) + int(r.integers(-6, 6) * humanise)))
                    events.append((bar_start_s + bt * beat_s + jit, bar_start_s + (bt + 0.25) * beat_s, 38, v))
                for bt in np.arange(0.0, 4.0, hat_step):
                    is_off = abs((bt * 2) % 2 - 1.0) < 0.05
                    sw = swing * 0.35 * beat_s if is_off else 0.0
                    v = max(28, min(115, int(vel_base * (0.65 if is_off else 0.82)) + int(r.integers(-8, 8) * humanise)))
                    events.append((bar_start_s + bt * beat_s + sw, bar_start_s + bt * beat_s + sw + 0.1 * beat_s, 42, v))
            elif role == "bass":
                oct_b = 2 if is_lift else 1
                beats = (0.0, 1.5, 2.0, 3.0) if (is_lift and density >= 0.45) else (0.0, 2.0)
                for idx_b, bt in enumerate(beats):
                    step_deg = deg if idx_b % 2 == 0 else (deg + 4) % 7
                    midi_n = max(lo_p, min(hi_p, _scale_midi(spec["key"], oct_b, step_deg)))
                    dur_b = 1.35 if len(beats) == 2 else 0.85
                    v = max(50, min(122, vel_base + int(r.integers(-5, 5) * humanise)))
                    events.append((bar_start_s + bt * beat_s, bar_start_s + (bt + dur_b) * beat_s, midi_n, v))
            elif role == "chords":
                oct_c = 4 if is_lift else 3
                triad = (0, 2, 4, 6) if is_lift else (0, 2, 4)
                strikes = (0.0, 2.0) if (is_lift and density >= 0.5) else (0.0,)
                dur_c = 1.9 if len(strikes) == 2 else 3.8
                for bt in strikes:
                    for iv in triad:
                        midi_n = max(lo_p, min(hi_p, _scale_midi(spec["key"], oct_c, deg + iv)))
                        v = max(42, min(118, int(vel_base * 0.88) + int(r.integers(-6, 6) * humanise)))
                        events.append((bar_start_s + bt * beat_s, bar_start_s + (bt + dur_c) * beat_s, midi_n, v))
            elif role == "lead":
                oct_l = 5 if is_lift else 4
                motif_beats = ((0.0, 0.75, 1.5, 2.5, 3.0) if density >= 0.5 else (0.0, 1.5, 3.0)) if is_lift else ((0.0, 2.0) if k % 2 == 0 else (0.0,))
                motif_steps = (0, 2, 4, 2, 1) if is_lift else (0, 2)
                for m_idx, bt in enumerate(motif_beats):
                    is_off = abs((bt * 2) % 2 - 1.0) < 0.05
                    sw = swing * 0.3 * beat_s if is_off else 0.0
                    midi_n = max(lo_p, min(hi_p, _scale_midi(spec["key"], oct_l, deg + motif_steps[m_idx % len(motif_steps)])))
                    v = max(38, min(120, int(vel_base * (0.95 if is_lift else 0.55)) + int(r.integers(-6, 6) * humanise)))
                    events.append((bar_start_s + bt * beat_s + sw, bar_start_s + (bt + 0.65) * beat_s + sw, midi_n, v))
        at_bar += bars
    return events


def _apply_section_envelope(stem, role, spec, body_frames):
    bpm, lift_ctrl = float(spec["tempoBpm"]), float(spec["controls"]["lift"])
    bar_s = 240.0 / bpm
    out = stem.copy()
    if len(spec["sections"]) < 2 or role == "drums":
        return out
    at_bar = 0
    for idx, sec in enumerate(spec["sections"]):
        i0 = max(0, int(round(at_bar * bar_s * inst_lib.RATE)))
        at_bar += int(sec["bars"])
        i1 = min(body_frames, int(round(at_bar * bar_s * inst_lib.RATE)))
        if i1 <= i0:
            continue
        is_lift = float(sec["energy"]) >= 0.65 or (len(spec["sections"]) >= 3 and idx == 1)
        if is_lift:
            out[i0:i1] *= 1.0 + 0.45 * lift_ctrl
        else:
            gain = max(0.32, 0.55 - 0.22 * lift_ctrl)
            sos = signal.butter(2, 1400.0 if role == "lead" else 2200.0, "lowpass", fs=inst_lib.RATE, output="sos")
            out[i0:i1] = signal.sosfilt(sos, out[i0:i1], axis=0).astype(np.float32) * gain
    return out


def _track_hash(spec, track):
    payload = {
        "v": spec["v"], "seed": spec["seed"], "tempoBpm": spec["tempoBpm"], "key": spec["key"],
        "loop": bool(spec.get("loop", False)), "controls": spec["controls"], "sections": spec["sections"],
        "track": {k: v for k, v in track.items() if k not in ("muted", "solo")},
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()[:16]


def _sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 18), b""):
            h.update(chunk)
    return h.hexdigest()


def write_reaper_rpp(spec, stems_info, out_path):
    lines = ['<REAPER_PROJECT 0.1 "7.0" 1730000000', f"  TEMPO {spec['tempoBpm']} 4 4", f"  SAMPLERATE {inst_lib.RATE} 0 0"]
    for st in stems_info:
        vol = 10.0 ** (float(st.get("gainDb", 0.0)) / 20.0)
        lines += [
            "  <TRACK", f'    NAME "{st["role"]} - {st["instrument"]}"',
            f"    VOLPAN {vol:.4f} {float(st.get('pan', 0.0)):.3f} -1 -1 1",
            f"    MUTESOLO {1 if st.get('muted') else 0} {1 if st.get('solo') else 0} 0",
            "    <ITEM", "      POSITION 0", f"      LENGTH {st['durationS']:.4f}", f'      NAME "{os.path.basename(st["wavPath"])}"',
            "      <SOURCE WAVE", f'        FILE "{st["wavPath"]}"', "      >", "    >", "  >",
        ]
    lines.append(">")
    with open(out_path, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines) + "\n")


def render_score(spec_doc, out_dir, cache_dir=None, verify_determinism=False, _skip_triage=False):
    """Compile and render ScoreSpec -> stems, mix.wav, triage, and optional determinism report."""
    from scipy import signal
    import soundfile as sf

    t_start = time.time()
    spec = validate_spec(spec_doc)
    stems_dir = os.path.join(out_dir, "stems")
    os.makedirs(stems_dir, exist_ok=True)

    bpm = float(spec["tempoBpm"])
    bar_s = 240.0 / bpm
    total_bars = sum(int(s["bars"]) for s in spec["sections"])
    is_loop = bool(spec.get("loop", False))
    body_s = total_bars * bar_s
    total_s = body_s if is_loop else (body_s + TAIL_SILENCE_S)
    body_frames, total_frames = int(round(body_s * inst_lib.RATE)), int(round(total_s * inst_lib.RATE))

    any_solo = any(bool(tr.get("solo")) for tr in spec["tracks"])
    stems_info, reused_roles, rendered_roles, stem_buffers = [], [], [], {}

    for tr in spec["tracks"]:
        role, inst_id = tr["role"], tr["instrument"]
        thash = _track_hash(spec, tr)
        wav_path, mid_path = os.path.join(stems_dir, f"{role}.wav"), os.path.join(stems_dir, f"{role}.mid")
        cache_wav = os.path.join(cache_dir, f"{role}-{thash}.wav") if cache_dir else None
        events = compile_track_events(spec, tr)
        inst_lib.write_smf_midi(events, bpm, mid_path)

        t0 = time.time()
        if cache_wav and os.path.isfile(cache_wav):
            buf, _ = sf.read(cache_wav, dtype="float32", always_2d=True)
            if os.path.abspath(cache_wav) != os.path.abspath(wav_path):
                with open(cache_wav, "rb") as sf_in, open(wav_path, "wb") as sf_out:
                    sf_out.write(sf_in.read())
            source_used = "cached-bit-exact"
            reused_roles.append(role)
        else:
            raw_body, source_used = inst_lib.render_instrument_events(inst_id, events, body_s, brightness=spec["controls"]["brightness"])
            shaped = _apply_section_envelope(raw_body[:body_frames], role, spec, body_frames)
            if "fx" in tr and tr["fx"]:
                shaped, _notes = fxchain.render(shaped, inst_lib.RATE, fxchain.validate(tr["fx"]))
            gain_db, pan = float(tr.get("gainDb", 0.0)), float(tr.get("pan", 0.0))
            g_lin = 10.0 ** (gain_db / 20.0)
            shaped[:, 0] *= g_lin * (1.0 - max(0.0, pan))
            shaped[:, 1] *= g_lin * (1.0 + min(0.0, pan))
            if not is_loop:
                fade_n = min(len(shaped), int(round(FADE_OUT_S * inst_lib.RATE)))
                if fade_n > 0:
                    shaped[-fade_n:] *= (0.5 + 0.5 * np.cos(np.linspace(0, math.pi, fade_n, dtype=np.float32)))[:, None]
                buf = np.vstack([shaped, np.zeros((total_frames - len(shaped), 2), dtype=np.float32)])
            else:
                buf = shaped[:total_frames]
            st_max = float(np.max(np.abs(buf))) if buf.size > 0 else 0.0
            st_tp = round(20.0 * math.log10(st_max), 2) if st_max > 0 else None
            if st_tp is not None and st_tp > CEILING_DBTP:
                buf = (buf * (10.0 ** ((CEILING_DBTP - st_tp) / 20.0))).astype(np.float32)
            sf.write(wav_path, buf, inst_lib.RATE, subtype="PCM_16", format="WAV")
            if cache_wav:
                os.makedirs(cache_dir, exist_ok=True)
                with open(wav_path, "rb") as sf_in, open(cache_wav, "wb") as sf_out:
                    sf_out.write(sf_in.read())
            buf, _ = sf.read(wav_path, dtype="float32", always_2d=True)
            rendered_roles.append(role)

        render_ms = int(round((time.time() - t0) * 1000))
        stem_buffers[role] = buf
        st_peak_lin = float(np.max(np.abs(buf))) if buf.size > 0 else 0.0
        st_lufs = loudness.integrated_lufs(buf, inst_lib.RATE) if not _skip_triage else None
        stems_info.append({
            "role": role, "instrument": inst_id, "instrumentName": inst_lib.CATALOG[inst_id]["name"], "source": source_used,
            "wavPath": os.path.abspath(wav_path), "midiPath": os.path.abspath(mid_path), "sha256": _sha256_file(wav_path),
            "trackHash": thash, "reused": role in reused_roles, "muted": bool(tr.get("muted", False)), "solo": bool(tr.get("solo", False)),
            "gainDb": float(tr.get("gainDb", 0.0)), "pan": float(tr.get("pan", 0.0)), "noteCount": len(events),
            "renderMs": render_ms, "durationS": round(len(buf) / float(inst_lib.RATE), 4),
            "integratedLufs": st_lufs, "truePeakDb": round(20.0 * math.log10(st_peak_lin), 2) if st_peak_lin > 0 else None,
        })

    mix = np.zeros((total_frames, 2), dtype=np.float32)
    drum_env = None
    if "drums" in stem_buffers:
        d_abs = np.max(np.abs(stem_buffers["drums"]), axis=1)
        win = max(1, int(0.025 * inst_lib.RATE))
        drum_env = signal.fftconvolve(d_abs, np.ones(win, dtype=np.float32) / win, mode="same")

    for tr in spec["tracks"]:
        role = tr["role"]
        active = bool(tr.get("solo", False)) if any_solo else not bool(tr.get("muted", False))
        if not active:
            continue
        s_buf = stem_buffers[role][:total_frames].copy()
        if role == "chords" and drum_env is not None:
            s_buf *= np.clip(1.0 - 0.25 * drum_env[:len(s_buf)], 0.72, 1.0)[:, None]
        mix += s_buf

    raw_lufs = loudness.integrated_lufs(mix, inst_lib.RATE)
    if raw_lufs is not None and math.isfinite(raw_lufs):
        mix = (mix * (10.0 ** ((TARGET_LUFS - raw_lufs) / 20.0))).astype(np.float32)
    thresh = 0.70
    mag = np.abs(mix)
    over = mag > thresh
    if np.any(over):
        mix[over] = np.sign(mix[over]) * (thresh + (0.84 - thresh) * np.tanh((mag[over] - thresh) / (0.84 - thresh)))
    lim_lufs = loudness.integrated_lufs(mix, inst_lib.RATE)
    if lim_lufs is not None and math.isfinite(lim_lufs):
        mix = (mix * (10.0 ** ((TARGET_LUFS - lim_lufs) / 20.0))).astype(np.float32)
    tp = loudness.true_peak_db(mix, inst_lib.RATE)
    if tp is not None and tp > CEILING_DBTP:
        mix = np.tanh(mix / 0.85) * 0.85
        lim_lufs2 = loudness.integrated_lufs(mix, inst_lib.RATE)
        if lim_lufs2 is not None and math.isfinite(lim_lufs2):
            mix = (mix * (10.0 ** ((TARGET_LUFS - lim_lufs2) / 20.0))).astype(np.float32)
        tp2 = loudness.true_peak_db(mix, inst_lib.RATE)
        if tp2 is not None and tp2 > CEILING_DBTP:
            mix = (mix * (10.0 ** ((CEILING_DBTP - tp2) / 20.0))).astype(np.float32)

    mix_path = os.path.join(out_dir, "mix.wav")
    sf.write(mix_path, mix, inst_lib.RATE, subtype="PCM_16", format="WAV")
    written_mix, _ = sf.read(mix_path, dtype="float32", always_2d=True)
    mix_sha = _sha256_file(mix_path)
    if _skip_triage:
        return {"ok": True, "mixPath": os.path.abspath(mix_path), "mixSha256": mix_sha}

    mix_measure = loudness.measure(written_mix, inst_lib.RATE)
    sections_ctx, at_b = [], 0
    for s in spec["sections"]:
        s_ms = int(round(at_b * bar_s * 1000))
        at_b += int(s["bars"])
        sections_ctx.append({"name": s["name"], "startMs": s_ms, "endMs": int(round(at_b * bar_s * 1000))})
    triage_ctx = {"kind": "music", "durationS": round(total_s, 4), "tempoBpm": bpm, "loop": is_loop}
    if len(sections_ctx) >= 2:
        triage_ctx["sections"] = sections_ctx
    triage_res = triage.run(written_mix, inst_lib.RATE, triage_ctx)

    rpp_path = os.path.join(out_dir, "project.rpp")
    write_reaper_rpp(spec, stems_info, rpp_path)

    determinism = None
    if verify_determinism:
        import tempfile
        with tempfile.TemporaryDirectory(prefix="gt-score-det-") as tmp2:
            second = render_score(spec_doc, tmp2, cache_dir=None, verify_determinism=False, _skip_triage=True)
            mix2, _ = sf.read(second["mixPath"], dtype="float32", always_2d=True)
            max_diff = float(np.max(np.abs(written_mix - mix2)))
            rms_diff = float(np.sqrt(np.mean(np.square(written_mix - mix2))))
            determinism = {
                "bitIdentical": mix_sha == second["mixSha256"] and max_diff == 0.0,
                "maxAbsDiff": round(max_diff, 8), "rmsDiff": round(rms_diff, 8),
                "firstSha256": mix_sha, "secondSha256": second["mixSha256"],
            }

    return {
        "ok": True, "title": spec["title"], "tempoBpm": bpm, "key": spec["key"], "loop": is_loop,
        "totalBars": total_bars, "durationS": mix_measure["durationS"], "mixPath": os.path.abspath(mix_path),
        "mixSha256": mix_sha, "reaperProjectPath": os.path.abspath(rpp_path), "measure": mix_measure,
        "triage": triage_res, "stems": stems_info, "reusedRoles": reused_roles, "renderedRoles": rendered_roles,
        "totalRenderMs": int(round((time.time() - t_start) * 1000)), "determinism": determinism,
    }
