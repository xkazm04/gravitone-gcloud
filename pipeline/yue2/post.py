#!/usr/bin/env python
"""post.py - the YuE2 post-chain and the blind A/B window (moved from kiro/yue2-lab post.py; YUE2_HOME/.venv-eval).

  python post.py --in F --out F --stages stems,buses,debuzz,master [--reference F] [--debuzz-strength 0.8]
    -> {"ok":true,"out":F,"stages":[...],"lufs":n,"truePeakDb":n[,"stems":{"vocals":F,"drums":F,"bass":F,"other":F,"residual":F}]
        [,"buses":{"sepResidualDb":n,"resumResidualDb":n,"vocals":{"grDb":n,...},"drums":{"grDb":n,...},"bass":{"grDb":n,...}}]}
  python post.py --op ab-window --in F --out F --window-s 25 [--start S]
    -> {"ok":true,"out":F,"windowS":[start,end],"vocalOnsetS":n}

Stages (any subset, applied in this order):
  stems   Mel-Band RoFormer vocals + htdemucs_6s on the instrumental -> vocals / drums / bass / other plus the
          separation residual, written as float WAVs to <out without suffix>_stems/. The mix passes through
          unchanged (stems + residual sum back to it exactly). The separators run at 44.1 kHz; their stems are
          resampled back to the take's own rate (48 kHz for YuE2).
  buses   the stem buses (_buses.py, ported from yue2-lab): vocals HPF 80 Hz / de-ess 5-9 kHz / comp 3:1 at
          -18 dB / +2 dB @ 3.5 kHz / plate 12 %; drums comp 4:1 for ~3 dB GR + 20 % parallel saturation; bass
          mono below 120 Hz + comp 2:1 for ~1.5 dB GR; each RMS-matched to its stem, then re-summed with
          `other` and the separation residual. Gain reduction is energy-weighted. Without `stems` in the
          stages, `buses` separates first (the same cached separation) and writes no stem files.
  debuzz  the unbiased (`smooth`) Ruach debuzz of the VAE frame-seam ripple, on the full mix (48 kHz takes only).
  master  WITH --reference: Matchering to the reference, then the limiter to -14 LUFS / -1 dBTP.
          WITHOUT: the limiter only.
Without `master` a final peak-safety gain keeps the sample peak at or under 0.999.

ab-window: the window starts at the first vocal onset (RoFormer vocal stem; or --start), lasts --window-s
(clamped to the take), gets 50 ms fades, and is loudness-matched to -14 LUFS / -1 dBTP like a master.
Outputs: .flac or .wav, 24-bit PCM at the input rate. GPU is used only by the separators (one model at a time).
"""
from __future__ import annotations

import os
import shutil
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _contract import EVAL_BIN, Parser, Refused, log, need_file, run  # noqa: E402

STAGE_ORDER = ["stems", "buses", "debuzz", "master"]   # = YUE2_POST_STAGES (packages/domain/src/audio.yue2.ts)
OUT_SUFFIXES = {".flac", ".wav"}


def write_out(out: Path, y, sr):
    import soundfile as sf
    out.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(out), y, sr, subtype="PCM_24")


def chain(args, inp: Path, out: Path):
    import numpy as np
    import soundfile as sf
    from _audio import load_audio, loudness_of
    from _post_dsp import debuzz_verified, limit_master, matchering, separate

    if not args.stages:
        raise Refused("post.py: --stages is required (comma list of stems, buses, debuzz, master)")
    stages = [s.strip() for s in args.stages.split(",") if s.strip()]
    bad = set(stages) - set(STAGE_ORDER)
    if bad or not stages:
        raise Refused(f"post.py: unknown stages {sorted(bad)}; valid: {STAGE_ORDER}")
    reference = need_file(args.reference, "--reference") if args.reference else None
    if reference is not None and "master" not in stages:
        raise Refused("post.py: --reference only applies to the master stage")
    stages = [s for s in STAGE_ORDER if s in stages]
    x, sr = load_audio(inp)
    fields = {}
    tmp = out.with_name(f"_{out.stem}_tmp")

    stems = meta = None
    if "stems" in stages:
        t = time.time()
        stems, meta, _cache = separate(inp, x, sr)
        stem_dir = out.with_name(f"{out.stem}_stems")
        stem_dir.mkdir(parents=True, exist_ok=True)
        fields["stems"] = {}
        for k, v in stems.items():
            p = stem_dir / f"{k}.wav"
            sf.write(str(p), v, sr, subtype="FLOAT")
            fields["stems"][k] = str(p)
        log(f"stems: residual {meta['residual_db']} (cached={meta['cached']}) in {time.time() - t:.1f} s")

    if "buses" in stages:
        from _buses import buses
        if stems is None:   # buses needs stems: separate first, as yue2-lab did (no stem files written)
            t = time.time()
            stems, meta, _cache = separate(inp, x, sr)
            log(f"buses: separated, residual {meta['residual_db']} (cached={meta['cached']}) in {time.time() - t:.1f} s")
        t = time.time()
        x, rep = buses(stems, x, sr)
        fields["buses"] = {"sepResidualDb": meta["residual_db"]["all_stems_vs_mix"], **rep}
        log(f"buses: {fields['buses']} in {time.time() - t:.1f} s")

    if "debuzz" in stages:
        t = time.time()
        x, rep = debuzz_verified(x, sr, args.debuzz_strength)
        log(f"debuzz full mix: buzz {rep['before']['buzz_index_db']} -> {rep['after']['buzz_index_db']} dB, "
            f"fold {rep['before']['fold_depth_pct']} -> {rep['after']['fold_depth_pct']}, {rep['params']} "
            f"in {time.time() - t:.1f} s")

    if "master" in stages:
        t = time.time()
        if reference is not None:
            x, info = matchering(x, sr, reference, tmp)
            log(f"matchering: {info}")
        x, info = limit_master(x, sr)
        log(f"master limiter: {info} in {time.time() - t:.1f} s")
    else:
        pk = float(np.abs(x).max())
        if pk > 0.999:
            x = x * (0.999 / pk)
            log(f"peak safety gain {20 * np.log10(0.999 / pk):.2f} dB")

    write_out(out, x, sr)
    shutil.rmtree(tmp, ignore_errors=True)
    lufs, tp = loudness_of(x, sr)
    return {"out": str(out), "stages": stages, "lufs": lufs, "truePeakDb": tp, **fields}


def ab_window(args, inp: Path, out: Path):
    import numpy as np
    from _audio import load_audio
    from _post_dsp import limit_master, vocal_onset, vocal_stem

    if not args.window_s or args.window_s <= 0:
        raise Refused("post.py: --window-s must be a positive number of seconds")
    x, sr = load_audio(inp)
    dur = len(x) / sr
    if args.start is not None:
        if args.start < 0 or args.start >= dur:
            raise Refused(f"post.py: --start {args.start} is outside the take (0..{dur:.2f} s)")
        onset = None
        start = float(args.start)
    else:
        onset = vocal_onset(vocal_stem(inp, x, sr).mean(1), sr)
        start = onset
    start = round(min(start, max(0.0, dur - args.window_s)), 2)
    end = round(min(dur, start + args.window_s), 2)
    y = x[int(start * sr): int(end * sr)].copy()
    fade = min(int(0.05 * sr), len(y) // 2)
    if fade > 0:
        ramp = np.linspace(0.0, 1.0, fade, dtype=np.float32)[:, None]
        y[:fade] *= ramp
        y[-fade:] *= ramp[::-1]
    y, info = limit_master(y, sr)
    log(f"ab-window {start}..{end} s (onset {onset}), {info}")
    write_out(out, y, sr)
    fields = {"out": str(out), "windowS": [start, end]}
    fields["vocalOnsetS"] = onset if onset is not None else start
    return fields


def main():
    ap = Parser(prog="post.py", description=__doc__)
    ap.add_argument("--op", choices=["chain", "ab-window"], default="chain")
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out", required=True, help="output .flac or .wav (24-bit PCM)")
    ap.add_argument("--stages", help=f"comma list of {STAGE_ORDER}")
    ap.add_argument("--reference", help="reference master for Matchering (master stage)")
    ap.add_argument("--debuzz-strength", type=float, default=0.8)
    ap.add_argument("--window-s", type=float, default=25.0)
    ap.add_argument("--start", type=float, help="ab-window start in seconds (default: the first vocal onset)")
    args = ap.parse_args()
    os.environ["PATH"] = f"{EVAL_BIN}:{os.environ.get('PATH', '')}"   # ffmpeg for audio-separator (as score.py)
    inp = need_file(args.inp, "--in").resolve()
    out = Path(args.out).expanduser()
    if out.suffix.lower() not in OUT_SUFFIXES:
        raise Refused(f"post.py: --out must end in .flac or .wav, got {args.out}")
    if out.resolve() == inp:
        raise Refused("post.py: --out must differ from --in")
    if not 0.0 <= args.debuzz_strength <= 2.0:
        raise Refused("post.py: --debuzz-strength must be within 0..2")
    t = time.time()
    fields = ab_window(args, inp, out) if args.op == "ab-window" else chain(args, inp, out)
    log(f"wrote {out} in {time.time() - t:.1f} s")
    return fields


if __name__ == "__main__":
    run(main)
