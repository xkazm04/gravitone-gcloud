"""Compile a ScoreSpec into MIDI and per-role WAV stems, mix with FxChain + sidechain ducking,
master to -14 LUFS, verify determinism, and export a REAPER .rpp project (D6 + A2 + C6).
"""

import hashlib
import json
import math
import os
import time

import numpy as np
from scipy import signal
import soundfile as sf

import fxchain
import loudness
import score_compiler as sc
import score_instruments as inst_lib
import triage

ScoreRefused = sc.ScoreRefused
validate_spec = sc.validate_spec
compile_track_events = sc.compile_track_events
write_reaper_rpp = sc.write_reaper_rpp

TAIL_SILENCE_S = sc.TAIL_SILENCE_S
FADE_OUT_S = sc.FADE_OUT_S
TARGET_LUFS = -14.0
CEILING_DBTP = -1.1


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


def render_score(spec_doc, out_dir, cache_dir=None, verify_determinism=False, _skip_triage=False):
    """Compile and render ScoreSpec -> stems, mix.wav, triage, and optional determinism report."""
    t_start = time.time()
    spec = sc.validate_spec(spec_doc)
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
        events = sc.compile_track_events(spec, tr)
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
            shaped = sc.apply_section_envelope(raw_body[:body_frames], role, spec, body_frames)
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
    thresh, ceil_lin = 0.65, 0.82
    mag = np.abs(mix)
    over = mag > thresh
    if np.any(over):
        mix[over] = np.sign(mix[over]) * (thresh + (ceil_lin - thresh) * np.tanh((mag[over] - thresh) / (ceil_lin - thresh)))
    lim_lufs = loudness.integrated_lufs(mix, inst_lib.RATE)
    if lim_lufs is not None and math.isfinite(lim_lufs):
        mix = (mix * (10.0 ** ((TARGET_LUFS - lim_lufs) / 20.0))).astype(np.float32)
    mag2 = np.abs(mix)
    over2 = mag2 > thresh
    if np.any(over2):
        mix[over2] = np.sign(mix[over2]) * (thresh + (ceil_lin - thresh) * np.tanh((mag2[over2] - thresh) / (ceil_lin - thresh)))
    peak_lin = float(np.max(np.abs(mix))) if mix.size > 0 else 0.0
    if peak_lin > 0.85:
        mix = (mix * (0.85 / peak_lin)).astype(np.float32)
    if is_loop and len(mix) > 128:
        w = np.linspace(0.0, 1.0, 64, dtype=np.float32)[:, None]
        mix[-64:] = mix[-64:] * (1.0 - w) + mix[0:1] * w

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
    if len(sections_ctx) >= 2 and not is_loop:
        triage_ctx["sections"] = sections_ctx
    triage_res = triage.run(written_mix, inst_lib.RATE, triage_ctx)

    rpp_path = os.path.join(out_dir, "project.rpp")
    sc.write_reaper_rpp(spec, stems_info, rpp_path)

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
