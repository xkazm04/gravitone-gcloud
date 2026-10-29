"""ScoreSpec validator, deterministic pattern-aware MIDI compiler, section shaper, and REAPER .rpp writer."""

import math
import os
import re
import zlib

import numpy as np
from scipy import signal

import fxchain
import score_instruments as inst_lib
import score_patterns

SCORE_SPEC_VERSION = 1
ROLES = tuple(inst_lib.role_compat())  # the studio roles, in audio.roles.json order
MAX_TRACKS = 8
TRACK_ID = re.compile(r"^[a-z0-9-]{1,24}$")
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


class ScoreRefused(ValueError):
    """A ScoreSpec that violates a schema bound, key constraint, or instrument audition gate."""


def _num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def _int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def _note_name(midi):
    return f"{NOTE_NAMES[midi % 12]}{(midi // 12) - 1}"


def track_id(track):
    """A track's id: its own `id`, else its role (a v1 track)."""
    return track.get("id") or track["role"]


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
    if not isinstance(tracks, list) or not (1 <= len(tracks) <= MAX_TRACKS):
        raise ScoreRefused(f"tracks: expected 1..{MAX_TRACKS} tracks")
    root_pc, steps = KEYS[key]
    allowed_pc = {(root_pc + st) % 12 for st in steps}
    role_count = {}
    for tr in tracks:
        if isinstance(tr, dict):
            role_count[tr.get("role")] = role_count.get(tr.get("role"), 0) + 1
    seen_ids = set()
    for i, tr in enumerate(tracks):
        if not isinstance(tr, dict):
            raise ScoreRefused(f"tracks.{i}: expected an object")
        extra_t = sorted(set(tr) - {"id", "role", "instrument", "muted", "solo", "gainDb", "pan", "pattern", "fx", "notes", "enters"})
        if extra_t:
            raise ScoreRefused(f"tracks.{i}: unrecognized key {extra_t[0]!r}")
        role = tr.get("role")
        if role not in ROLES:
            raise ScoreRefused(f"tracks.{i}.role: unknown role {role!r}")
        if "id" in tr:
            if not isinstance(tr["id"], str) or not TRACK_ID.fullmatch(tr["id"]):
                raise ScoreRefused(f"tracks.{i}.id: {tr['id']!r} is not 1..24 of a-z, 0-9, -")
        elif role_count[role] > 1:
            raise ScoreRefused(f"tracks.{i}.role: duplicate role {role} (a repeated role needs an id on every one of its tracks)")
        if track_id(tr) in seen_ids:
            raise ScoreRefused(f"tracks.{i}.id: duplicate track id {track_id(tr)}")
        seen_ids.add(track_id(tr))
        if "enters" in tr:
            ent = tr["enters"]
            if not isinstance(ent, list) or len(ent) != len(secs) or not all(isinstance(x, bool) for x in ent):
                raise ScoreRefused(f"tracks.{i}.enters: expected {len(secs)} booleans, one per section")
            if not any(ent):
                raise ScoreRefused(f"tracks.{i}.enters: the track plays in no section - remove it or mute it")
        inst_id = tr.get("instrument")
        if inst_id not in inst_lib.CATALOG:
            raise ScoreRefused(f"tracks.{i}.instrument: unknown instrument {inst_id!r}")
        cat = inst_lib.CATALOG[inst_id]
        if not cat["licence"].strip():
            raise ScoreRefused(f"tracks.{i}.instrument: {inst_id} has an empty licence note")
        if cat["status"] != "ready":
            raise ScoreRefused(f"tracks.{i}.instrument: {inst_id} refused ({cat['refusalReason']})")
        if cat["role"] not in inst_lib.role_compat()[role]:
            raise ScoreRefused(f"tracks.{i}.instrument: {inst_id} is for {cat['role']}, not {role}")
        if "gainDb" in tr and (not _num(tr["gainDb"]) or not (-24 <= tr["gainDb"] <= 12)):
            raise ScoreRefused(f"tracks.{i}.gainDb: {tr['gainDb']!r} is outside -24..12")
        if "pan" in tr and (not _num(tr["pan"]) or not (-1 <= tr["pan"] <= 1)):
            raise ScoreRefused(f"tracks.{i}.pan: {tr['pan']!r} is outside -1..1")
        if "fx" in tr and tr["fx"] is not None:
            try:
                fxchain.validate(tr["fx"])
            except fxchain.ChainRefused as e:
                raise ScoreRefused(f"tracks.{i}.fx.{e}") from None
        if "notes" in tr and tr["notes"] is not None:
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
                if cat["role"] != "drums" and (midi_n % 12) not in allowed_pc:
                    raise ScoreRefused(f"tracks.{i}.notes.{j}.midi: {midi_n} ({_note_name(midi_n)}) leaves declared key {key} in bar {bar_n}")
    return doc


def _seeded_rng(seed, *tags):
    words = [int(seed)] + [zlib.crc32(str(t).encode("utf8")) for t in tags]
    return np.random.default_rng(np.random.SeedSequence(words))


def _scale_midi(key, base_octave, degree, lo_p, hi_p):
    root_pc, steps = KEYS[key]
    oct_shift, deg = divmod(int(degree), 7)
    m = 12 * (base_octave + 1 + oct_shift) + root_pc + steps[deg]
    while m < lo_p:
        m += 12
    while m > hi_p:
        m -= 12
    return max(lo_p, min(hi_p, m))


def compile_track_events(spec, track):
    """Compile one track into [(start_s, end_s, midi, vel)]; `enters` drops events after generation."""
    return score_patterns.apply_enters(spec, track, _generate_events(spec, track))


def _generate_events(spec, track):
    """Pattern-specific musicality, seeded by (seed, id ?? role, pattern, key): a v1 track's seed is unchanged."""
    bpm = float(spec["tempoBpm"])
    beat_s, bar_s = 60.0 / bpm, 240.0 / bpm
    ctrls = spec["controls"]
    swing, density, lift, humanise = float(ctrls["swing"]), float(ctrls["density"]), float(ctrls["lift"]), float(ctrls["humanise"])
    role, pat, tag = track["role"], track.get("pattern") or "default", track_id(track)
    r = _seeded_rng(spec["seed"], tag, pat, spec["key"])

    if track.get("notes"):
        return [
            (round(((n["bar"] - 1) * 4.0 + float(n["beat"])) * beat_s, 6),
             round(((n["bar"] - 1) * 4.0 + float(n["beat"]) + float(n["durationBeats"])) * beat_s, 6),
             int(n["midi"]), int(n["velocity"]))
            for n in track["notes"]
        ]

    events, at_bar = [], 0
    is_loop = bool(spec.get("loop", False))
    lo_p, hi_p = inst_lib.CATALOG[track["instrument"]]["pitchRange"]
    for sec_idx, sec in enumerate(spec["sections"]):
        bars, sec_energy = int(sec["bars"]), float(sec["energy"])
        is_lift = True if is_loop else (sec_energy >= 0.65 or (len(spec["sections"]) >= 3 and sec_idx == 1))
        eff_energy = (
            min(1.0, max(0.7, 0.65 + 0.25 * lift))
            if is_loop
            else min(1.0, max(0.15, sec_energy * (0.7 + 0.3 * lift) if is_lift else sec_energy * (1.0 - 0.25 * lift)))
        )
        prog = (0, 5) if is_loop else (sec.get("progression") or [0, 5, 3, 4])
        for k in range(bars):
            bar_idx = at_bar + k
            if is_loop:
                r = _seeded_rng(spec["seed"], tag, pat, spec["key"], bar_idx % 2)
            bar_start_s = bar_idx * bar_s
            deg = prog[(bar_idx if is_loop else k) % len(prog)]
            vel_base = int(round(68 + 42 * eff_energy))
            if role == "drums":
                if pat == "four-floor":
                    kicks = (0.0, 1.0, 2.0, 3.0) if is_lift else (0.0, 2.0)
                elif pat == "gentle-pulse":
                    kicks = (0.0, 2.0) if is_lift else (0.0,)
                elif pat == "studio-groove":
                    kicks = (0.0, 1.5, 2.0, 3.5) if (is_lift and density >= 0.45) else (0.0, 2.0)
                else:
                    kicks = (0.0, 1.5, 2.0, 3.0) if (is_lift and density >= 0.5) else (0.0, 2.0)
                snares = (1.0, 3.0) if (is_lift or pat != "gentle-pulse") else (2.0,)
                hat_step = 0.25 if (is_lift and density >= 0.65 and pat != "gentle-pulse") else (0.5 if eff_energy >= 0.32 else 1.0)
                for bt in kicks:
                    jit = float(r.uniform(-0.003, 0.003)) * humanise if bt > 0 else 0.0
                    v = max(45, min(126, vel_base + int(r.integers(-5, 6) * humanise)))
                    events.append((max(0.0, bar_start_s + bt * beat_s + jit), bar_start_s + (bt + 0.35) * beat_s, 36, v))
                for bt in snares:
                    jit = float(r.uniform(-0.004, 0.004)) * humanise
                    v = max(40, min(124, vel_base - (0 if is_lift else 14) + int(r.integers(-6, 6) * humanise)))
                    events.append((bar_start_s + bt * beat_s + jit, bar_start_s + (bt + 0.25) * beat_s, 38, v))
                    if is_lift and pat in ("four-floor", "boom-bap") and bt == 3.0:
                        events.append((bar_start_s + bt * beat_s, bar_start_s + (bt + 0.22) * beat_s, 39, max(45, v - 8)))
                for bt in np.arange(0.0, 4.0, hat_step):
                    is_off = abs((bt * 2) % 2 - 1.0) < 0.05
                    sw = swing * 0.35 * beat_s if is_off else 0.0
                    v = max(28, min(115, int(vel_base * (0.65 if is_off else 0.82)) + int(r.integers(-8, 8) * humanise)))
                    events.append((bar_start_s + bt * beat_s + sw, bar_start_s + bt * beat_s + sw + 0.1 * beat_s, 42, v))
            elif role == "bass":
                oct_b = 2 if is_lift else 1
                if pat == "eighth-drive" and is_lift:
                    b_plan = [(b * 0.5, 0.42, deg + (7 if b % 2 == 1 else 0)) for b in range(8)]
                elif pat == "warm-anchor":
                    b_plan = [(0.0, 1.9, deg), (2.0, 1.9, deg + 4)] if is_lift else [(0.0, 3.7, deg)]
                elif pat == "walking-root" and is_lift:
                    b_plan = [(0.0, 0.9, deg), (1.0, 0.9, deg + 2), (2.0, 0.9, deg + 4), (3.0, 0.9, deg + 5)]
                else:
                    beats = (0.0, 1.5, 2.0, 3.0) if (is_lift and density >= 0.45) else (0.0, 2.0)
                    dur_b = 1.35 if len(beats) == 2 else 0.85
                    b_plan = [(bt, dur_b, deg if idx_b % 2 == 0 else deg + 4) for idx_b, bt in enumerate(beats)]
                for bt, dur_b, step_deg in b_plan:
                    midi_n = _scale_midi(spec["key"], oct_b, step_deg, lo_p, hi_p)
                    v = max(50, min(122, vel_base + int(r.integers(-5, 5) * humanise)))
                    events.append((bar_start_s + bt * beat_s, bar_start_s + (bt + dur_b) * beat_s, midi_n, v))
            elif role == "chords":
                oct_c = 4 if is_lift else 3
                if pat == "arpeggio-bed":
                    arp_steps = (0, 2, 4, 6, 4, 2, 0, 2) if is_lift else (0, 2, 4, 2)
                    step_b = 4.0 / len(arp_steps)
                    for a_i, iv in enumerate(arp_steps):
                        bt = a_i * step_b
                        midi_n = _scale_midi(spec["key"], oct_c, deg + iv, lo_p, hi_p)
                        v = max(40, min(114, int(vel_base * (0.88 if a_i % 2 == 0 else 0.74)) + int(r.integers(-5, 5) * humanise)))
                        events.append((bar_start_s + bt * beat_s, bar_start_s + (bt + step_b * 1.35) * beat_s, midi_n, v))
                else:
                    triad = (0, 2, 4, 6) if is_lift else (0, 2, 4)
                    strikes = (0.0, 1.5, 2.5) if (pat == "open-chords" and is_lift) else ((0.0, 2.0) if (is_lift and density >= 0.5) else (0.0,))
                    dur_c = 1.15 if len(strikes) == 3 else (1.9 if len(strikes) == 2 else 3.8)
                    strum = 0.016 if pat in ("warm-voicing", "open-chords") else 0.0
                    for bt in strikes:
                        for v_i, iv in enumerate(triad):
                            midi_n = _scale_midi(spec["key"], oct_c, deg + iv, lo_p, hi_p)
                            v = max(42, min(118, int(vel_base * 0.88) + int(r.integers(-6, 6) * humanise)))
                            st_t = bar_start_s + bt * beat_s + v_i * strum
                            events.append((st_t, bar_start_s + (bt + dur_c) * beat_s, midi_n, v))
            elif role == "lead":
                oct_l = 5 if is_lift else 4
                if pat == "arp-lead" and is_lift:
                    motif_beats = (0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5) if density >= 0.55 else (0.0, 1.0, 2.0, 3.0)
                    motif_steps = (0, 2, 4, 6, 4, 2, 1, 2)
                elif pat == "sparse-motif":
                    motif_beats = (0.0, 1.5, 2.5) if is_lift else ((0.0, 2.0) if k % 2 == 0 else (0.0,))
                    motif_steps = (4, 2, 0) if k % 2 == 1 else (0, 2, 4)
                elif pat == "plucked-hook" and is_lift:
                    motif_beats = (0.0, 0.75, 1.5, 2.25, 3.0)
                    motif_steps = (0, 1, 2, 4, 2) if k % 2 == 0 else (4, 2, 1, 0, 2)
                else:
                    motif_beats = ((0.0, 0.75, 1.5, 2.5, 3.0) if density >= 0.5 else (0.0, 1.5, 3.0)) if is_lift else ((0.0, 2.0) if k % 2 == 0 else (0.0,))
                    motif_steps = (0, 2, 4, 2, 1) if k % 2 == 0 else (4, 2, 0, 1, 0)
                for m_idx, bt in enumerate(motif_beats):
                    is_off = abs((bt * 2) % 2 - 1.0) < 0.05
                    sw = swing * 0.3 * beat_s if is_off else 0.0
                    midi_n = _scale_midi(spec["key"], oct_l, deg + motif_steps[m_idx % len(motif_steps)], lo_p, hi_p)
                    v = max(38, min(120, int(vel_base * (0.95 if is_lift else 0.55)) + int(r.integers(-6, 6) * humanise)))
                    events.append((bar_start_s + bt * beat_s + sw, bar_start_s + (bt + 0.6) * beat_s + sw, midi_n, v))
            else:  # pad, percussion, texture
                events.extend(score_patterns.bar_events(role, pat, r, {
                    "bar_start_s": bar_start_s, "beat_s": beat_s, "deg": deg, "k": k, "bars": bars, "is_lift": is_lift,
                    "density": density, "swing": swing, "humanise": humanise, "vel_base": vel_base,
                    "midi": lambda o, d: _scale_midi(spec["key"], o, d, lo_p, hi_p),
                }))
        at_bar += bars
    return events


def apply_section_envelope(stem, role, spec, body_frames):
    bpm, lift_ctrl = float(spec["tempoBpm"]), float(spec["controls"]["lift"])
    bar_s = 240.0 / bpm
    out = stem.copy()
    if bool(spec.get("loop", False)) or len(spec["sections"]) < 2 or role in ("drums", "percussion"):
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


def write_reaper_rpp(spec, stems_info, out_path):
    render_wav = os.path.join(os.path.dirname(os.path.abspath(out_path)), "reaper-render.wav")
    lines = [
        '<REAPER_PROJECT 0.1 "7.82/win64" 1730000000',
        f"  TEMPO {spec['tempoBpm']} 4 4",
        f"  SAMPLERATE {inst_lib.RATE} 1 0",
        f'  RENDER_FILE "{render_wav}"',
        '  RENDER_PATTERN ""',
        f"  RENDER_FMT 0 2 {inst_lib.RATE}",
        "  RENDER_1X 0",
        "  RENDER_RANGE 1 0 0 0 1000",
        "  RENDER_RESAMPLE 3 0 1",
        "  RENDER_ADDTOPROJ 0",
        "  RENDER_STEMS 0",
        "  RENDER_DITHER 0",
        "  <RENDER_CFG",
        "    ZXZhdxgAAQ==",
        "  >",
    ]
    for st in stems_info:
        vol = 10.0 ** (float(st.get("gainDb", 0.0)) / 20.0)
        lines += [
            "  <TRACK", f'    NAME "{st.get("id") or st["role"]} - {st["instrument"]}"',
            f"    VOLPAN {vol:.4f} {float(st.get('pan', 0.0)):.3f} -1 -1 1",
            f"    MUTESOLO {1 if st.get('muted') else 0} {1 if st.get('solo') else 0} 0",
            "    <ITEM", "      POSITION 0", f"      LENGTH {st['durationS']:.4f}", f'      NAME "{os.path.basename(st["wavPath"])}"',
            "      <SOURCE WAVE", f'        FILE "{os.path.abspath(st["wavPath"])}"', "      >", "    >", "  >",
        ]
    lines.append(">")
    with open(out_path, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines) + "\n")
