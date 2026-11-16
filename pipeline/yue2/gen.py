#!/usr/bin/env python
"""gen.py - render ONE YuE2 take (moved from kiro/yue2-lab gen.py; run in YUE2_HOME/.venv, torch 2.10 pinned).

  python gen.py --style-file F --lyrics F --seed N --cot full|melody|off [--cfg X]
                [--lora P --lora-strength S] [--lora-trigger W] --out F.flac [--artifacts DIR] [--dry-run]
  -> {"ok":true,"out":F,"durationS":n,"seconds":n,"peakVramGiB":n,"cot":c,"cfg"?:x,"seed":n,"lora"?:{...}}

Lyrics use YuE2's section tags, one per line: [Intro] [Verse] [Pre-Chorus] [Chorus] [Bridge] [Interlude] [Outro],
with a blank line between sections. There is no duration parameter: song length follows the lyrics.
One seed per call: the model loads every call (6-12 s warm); Node runs one call per (seed x condition).
`--cfg` applies to the SEMANTIC stage only (absent = the model's per-mode default: full/melody 1.0, off 1.01).
`seconds` is the synchronized render wall time (model already loaded); `peakVramGiB` is torch's peak reserved.
`--artifacts DIR` keeps score.abc, plan.json, semantic/latent .npy, request/config/result.json (and lora.json).
`--dry-run` validates the arguments, reads the inputs and checks the yue2 package is importable, without
loading the model; it answers {"ok":true,"dryRun":true,...}.
Weights: YUE2_MODEL (default m-a-p/YuE2-3B) and YUE2_VAE (default m-a-p/YuE2-Vae), from the HF cache.
"""
from __future__ import annotations

import importlib.util
import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _contract import Failed, GpuSampler, Parser, Refused, gpu_used_mib, log, need_file, run  # noqa: E402

MODEL = os.environ.get("YUE2_MODEL") or "m-a-p/YuE2-3B"
VAE = os.environ.get("YUE2_VAE") or "m-a-p/YuE2-Vae"
COTS = ("full", "melody", "off")


def audio_stats(audio, sr):
    import numpy as np
    a = np.asarray(audio, dtype=np.float64)
    mono = a.mean(axis=1) if a.ndim == 2 else a
    peak = float(np.abs(a).max()) if a.size else 0.0
    rms = float(np.sqrt(np.mean(a ** 2))) if a.size else 0.0
    win = max(1, int(sr * 0.05))
    n = len(mono) // win
    frames = mono[: n * win].reshape(n, win) if n else mono.reshape(1, -1)
    frame_db = 20 * np.log10(np.sqrt((frames ** 2).mean(axis=1)) + 1e-12)
    return {"seconds": round(len(a) / sr, 2), "sample_rate": sr, "channels": a.shape[1] if a.ndim == 2 else 1,
            "peak_dbfs": round(20 * np.log10(peak + 1e-12), 2), "rms_dbfs": round(20 * np.log10(rms + 1e-12), 2),
            "clipped_samples": int((np.abs(a) >= 0.999).sum()),
            "silent_pct_50ms_below_-50dB": round(float((frame_db < -50).mean() * 100), 1)}


def parse_args():
    p = Parser(prog="gen.py", description=__doc__)
    p.add_argument("--style-file", required=True, help="file containing the style/tags prompt")
    p.add_argument("--lyrics", required=True, help="lyrics text file (YuE2 [Section] tags)")
    p.add_argument("--seed", required=True, type=int)
    p.add_argument("--cot", required=True, choices=COTS)
    p.add_argument("--cfg", type=float, help="semantic-stage CFG scale (default per mode)")
    p.add_argument("--abc", help="optional ABC score file (cot full/melody)")
    p.add_argument("--lora", help="adapter .safetensors (sv-fused AR+NAR or ntc-native AR-only; auto-detected)")
    p.add_argument("--lora-strength", type=float, default=1.0)
    p.add_argument("--lora-trigger", help="trigger word prepended to the style as '<trigger>, <style>'")
    p.add_argument("--out", required=True, help="output .flac or .wav")
    p.add_argument("--artifacts", help="directory for the render's artifacts")
    p.add_argument("--dry-run", action="store_true")
    a = p.parse_args()
    if not 0 <= a.seed < 2 ** 31:
        raise Refused(f"gen.py: --seed {a.seed} is outside 0..2^31-1")
    if a.cfg is not None and not 0.5 <= a.cfg <= 4.0:
        raise Refused(f"gen.py: --cfg {a.cfg} is outside 0.5..4")
    if not 0.0 <= a.lora_strength <= 2.0:
        raise Refused(f"gen.py: --lora-strength {a.lora_strength} is outside 0..2")
    if Path(a.out).suffix.lower() not in (".flac", ".wav"):
        raise Refused(f"gen.py: --out must end in .flac or .wav, got {a.out}")
    return a


def main():
    args = parse_args()
    style = need_file(args.style_file, "--style-file").read_text(encoding="utf-8").strip()
    lyrics = need_file(args.lyrics, "--lyrics").read_text(encoding="utf-8")
    if not style or not lyrics.strip():
        raise Refused("gen.py: the style and the lyrics must not be empty")
    abc = need_file(args.abc, "--abc").read_text(encoding="utf-8") if args.abc else None
    lora_path = need_file(args.lora, "--lora") if args.lora else None
    if args.lora_trigger:
        style = f"{args.lora_trigger}, {style}"
    out = Path(args.out).expanduser()
    base = {"out": str(out), "cot": args.cot, "seed": args.seed}
    if args.cfg is not None:
        base["cfg"] = args.cfg
    if args.dry_run:
        if importlib.util.find_spec("yue2") is None:
            raise ImportError("No module named 'yue2' (the yue2-infer wheel is not installed in this venv)")
        return {**base, "dryRun": True, "styleChars": len(style), "lyricsLines": len(lyrics.splitlines()),
                **({"lora": {"path": str(lora_path), "strength": args.lora_strength}} if lora_path else {})}

    import torch
    from yue2 import YuE2Pipeline
    from _adapter import Adapter, run_staged

    baseline = gpu_used_mib()
    t0 = time.perf_counter()
    pipe = YuE2Pipeline.from_pretrained(MODEL, vae=VAE, device="cuda", progress=False)
    load_s = time.perf_counter() - t0
    log(f"[gen] pipeline loaded in {load_s:.1f}s (gpu baseline {baseline} MiB)")
    adapter = Adapter(str(lora_path)) if lora_path else None
    lora = None
    try:
        if adapter:
            n = len(adapter.plan(pipe._load_model()))
            log(f"[gen] adapter {adapter.name}: format {adapter.format}, stages {adapter.stages}, {n} target weights validated")
            if adapter.format == "sv-fused":
                log(f"[gen] merged {adapter.merge(pipe._load_model(), args.lora_strength)} weights at strength {args.lora_strength}")
            lora = {"path": adapter.path, "name": adapter.name, "format": adapter.format, "stages": adapter.stages,
                    "strength": args.lora_strength}
            if args.lora_trigger:
                lora["trigger"] = args.lora_trigger
        torch.cuda.reset_peak_memory_stats()
        kwargs = {"cot": args.cot, "seed": args.seed}
        if args.cfg is not None:
            kwargs["cfg_scale"] = args.cfg
        if abc is not None:
            kwargs["abc"] = abc
        log(f"[gen] render cot={args.cot} cfg={args.cfg} seed={args.seed} lora={lora and lora['name']}")
        with GpuSampler(interval=0.25) as gs:
            t = time.perf_counter()
            try:
                if adapter and adapter.format == "ntc-native":
                    song = run_staged(pipe, style, lyrics, kwargs,
                                      lambda: adapter.hooks(pipe._load_model(), args.lora_strength))
                else:
                    song = pipe(style=style, lyrics=lyrics, **kwargs)
                torch.cuda.synchronize()
            except torch.cuda.OutOfMemoryError as e:   # a shared GPU: say so, the job is retryable
                raise Failed(f"CUDA out of memory during the render (another GPU job running?): {e}") from e
            wall = time.perf_counter() - t
        out.parent.mkdir(parents=True, exist_ok=True)
        song.save(out)
        if args.artifacts:
            art = Path(args.artifacts).expanduser()
            song.save_artifacts(art)
            if lora:
                (art / "lora.json").write_text(json.dumps({**lora, "metadata": adapter.metadata}, indent=1), encoding="utf-8")
        stats = audio_stats(song.audio, song.sample_rate)
        peak = round(torch.cuda.max_memory_reserved() / 2**30, 2)
        log("[gen] " + json.dumps({"wall_seconds": round(wall, 2), "load_seconds": round(load_s, 2),
                                   "torch_peak_allocated_gib": round(torch.cuda.max_memory_allocated() / 2**30, 2),
                                   "torch_peak_reserved_gib": peak, "nvidia_smi_peak_used_mib": gs.peak,
                                   "effective_semantic_cfg": song.config.get("cfg_scale"),
                                   "truncated": song.truncated, "timing": song.timing, "audio": stats}, default=str))
    finally:
        if adapter:
            adapter.restore(getattr(pipe, "_model", None))
        pipe.close()
    return {**base, "durationS": stats["seconds"], "seconds": round(wall, 2), "peakVramGiB": peak,
            **({"lora": lora} if lora else {})}


if __name__ == "__main__":
    run(main)
