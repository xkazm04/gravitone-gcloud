#!/usr/bin/env python
"""score.py - score ONE YuE2 take (moved from kiro/yue2-lab score.py; run in YUE2_HOME/.venv-eval).

  python score.py --in <take.flac> --lyrics <lyrics.txt|request.json> [--cache-dir DIR] [--skip m1,m2]
  -> last stdout line {"ok":true,"scores":{wer,werSd,per,songEval:{...},aesthetics:{ce,cu,pc,pq},buzzIdx,transcript}}

Stages, in this order (names usable with --skip): sep, qwen, whisper, per, songeval, aesthetics, buzz.
Raw-file stats and the -14 LUFS copy are always computed (cheap, numpy). Every model-based metric runs on the
-14 LUFS copy (never on the raw file), loudness-matched EXACTLY by the true-peak limiter (CACHE_VERSION 2).
Models are loaded ONE AT A TIME and freed before the next, so the GPU peak stays at the largest single model
(the GPU is shared with generation jobs). A metric that could not be computed is OMITTED from `scores`.
Per-take results are cached in --cache-dir (default YUE2_HOME/.score-cache), keyed by (path, mtime, version).
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _contract import (  # noqa: E402
    EVAL_BIN, LAB, SEP_MODEL_DIR, SONGEVAL_DIR, GpuSampler, Parser, Refused, free_gpu, log, need_file, run,
    torch_peak_gib, torch_peak_reset,
)

SEP_MODEL = "vocals_mel_band_roformer.ckpt"      # Kimberley Jensen Mel-Band RoFormer vocals (SDR 12.6)
QWEN_ASR = "Qwen/Qwen3-ASR-1.7B"
WHISPER = "large-v3"                              # faster-whisper -> Systran/faster-whisper-large-v3
MUQ = "OpenMuQ/MuQ-large-msd-iter"
CACHE_VERSION = 2         # v2: limiter-based exact loudness match (changes the audio every model scores)
SE_WHOLE_MAX_S = 70     # SongEval: whole-clip MuQ pass up to this length (official behaviour)
SE_CHUNK_S = 60         # ... longer clips: MuQ in windows of this length
STAGES = ["sep", "qwen", "whisper", "per", "songeval", "aesthetics", "buzz"]
SE_DIMS = ["Coherence", "Musicality", "Memorability", "Clarity", "Naturalness"]


def ensure_env():
    """ctranslate2 (faster-whisper) dlopens CUDA-12 cuBLAS/cuDNN: put the pip nvidia libs on LD_LIBRARY_PATH
    and re-exec once (same pid, so Node's kill still reaches it). Also put ffmpeg (imageio-ffmpeg) on PATH."""
    os.environ["PATH"] = f"{EVAL_BIN}:{os.environ.get('PATH', '')}"
    if os.environ.get("_SCORE_REEXEC") == "1":
        return
    site = Path(sys.prefix) / "lib" / f"python{sys.version_info.major}.{sys.version_info.minor}" / "site-packages"
    libs = [str(p) for p in sorted((site / "nvidia").glob("*/lib")) if p.is_dir()]
    if libs:
        os.environ["LD_LIBRARY_PATH"] = ":".join(libs + [os.environ.get("LD_LIBRARY_PATH", "")])
    os.environ["_SCORE_REEXEC"] = "1"
    sys.stdout.flush()
    os.execv(sys.executable, [sys.executable] + sys.argv)


class Entry:
    def __init__(self, path: Path, cache_root: Path):
        self.path = path
        st = path.stat()
        self.mtime_ns = st.st_mtime_ns
        key = hashlib.sha1(f"{path}|{st.st_mtime_ns}|{CACHE_VERSION}".encode()).hexdigest()[:16]
        self.dir = cache_root / f"{path.stem}_{key}"
        self.dir.mkdir(parents=True, exist_ok=True)
        self.json_path = self.dir / "results.json"
        self.r = json.loads(self.json_path.read_text()) if self.json_path.exists() else {}
        self.r.setdefault("timing_s", {})
        self.r.setdefault("errors", {})
        self.lyrics_text = None
        self.lang = None

    @property
    def norm_wav(self):
        return self.dir / "norm.wav"

    @property
    def stem_wav(self):
        return self.dir / "vocals.wav"

    def save(self):
        self.json_path.write_text(json.dumps(self.r, ensure_ascii=False, indent=1))

    def sources(self):
        s = {"mix": self.norm_wav}
        if self.stem_wav.exists():
            s["stem"] = self.stem_wav
        return s


def run_stage(name, entries, needs, fn, load=None, unload=None):
    """Load a model once, run fn(entry, model) on every entry that lacks `needs`, free it."""
    todo = [e for e in entries if needs(e)]
    if not todo:
        log(f"{name}: all cached")
        return {}
    log(f"{name}: {len(todo)} file(s)")
    meta = {}
    with GpuSampler() as gs:
        model = None
        if load:
            torch_peak_reset()
            t = time.time()
            try:
                model = load()
            except Exception as ex:  # noqa: BLE001 - a stage that cannot load is an absent metric, not a failed run
                log(f"{name}: LOAD FAILED: {ex!r}")
                for e in todo:
                    e.r["errors"][name] = f"load: {ex!r}"
                    e.save()
                return {"error": repr(ex)}
            meta["load_s"] = round(time.time() - t, 1)
        for e in todo:
            t = time.time()
            try:
                fn(e, model)
                e.r["errors"].pop(name, None)
            except Exception as ex:  # noqa: BLE001
                import traceback
                traceback.print_exc()
                e.r["errors"][name] = repr(ex)
            e.r["timing_s"][name] = round(time.time() - t, 2)
            e.save()
            log(f"  {name} {e.path.name}: {e.r['timing_s'][name]} s")
        try:
            meta["torch_peak_reserved_gib"] = torch_peak_gib()
        except Exception:  # noqa: BLE001
            pass
        if unload:
            unload(model)
        del model
        free_gpu()
    meta["device_peak_used_mib"] = gs.peak
    log(f"{name}: done {meta}")
    return meta


def wav16(path):
    import librosa
    import numpy as np
    y, _ = librosa.load(str(path), sr=16000, mono=True)
    return y.astype(np.float32)


def stage_sep(entries, cache_root):
    def load():
        from audio_separator.separator import Separator
        SEP_MODEL_DIR.mkdir(parents=True, exist_ok=True)
        s = Separator(model_file_dir=str(SEP_MODEL_DIR), output_dir=str(cache_root / "_sep_tmp"),
                      output_format="WAV", output_single_stem="Vocals", use_soundfile=True)
        s.load_model(model_filename=SEP_MODEL)
        return s

    def fn(e, s):
        outs = s.separate(str(e.norm_wav), custom_output_names={"Vocals": f"{e.dir.name}_vocals"})
        src = Path(outs[0])
        if not src.is_absolute():
            src = cache_root / "_sep_tmp" / src
        shutil.move(str(src), e.stem_wav)
        e.r["sep"] = {"model": SEP_MODEL, "stem": str(e.stem_wav)}

    return run_stage("sep", entries, lambda e: not e.stem_wav.exists(), fn, load)


def stage_qwen(entries):
    def load():
        import torch
        from qwen_asr import Qwen3ASRModel
        return Qwen3ASRModel.from_pretrained(QWEN_ASR, dtype=torch.bfloat16, device_map="cuda:0",
                                             max_inference_batch_size=8, max_new_tokens=1024)

    def fn(e, m):
        res = e.r.setdefault("asr", {}).setdefault("qwen3", {})
        for src, p in e.sources().items():
            if src in res:
                continue
            out = m.transcribe(audio=(wav16(p), 16000), language={"en": "English", "zh": "Chinese"}[e.lang])
            res[src] = {"text": out[0].text, "language": out[0].language}

    need = lambda e: any(s not in e.r.get("asr", {}).get("qwen3", {}) for s in e.sources())  # noqa: E731
    return run_stage("qwen", entries, need, fn, load)


def stage_whisper(entries, beam):
    def load():
        from faster_whisper import WhisperModel
        return WhisperModel(WHISPER, device="cuda", compute_type="float16")

    def fn(e, m):
        res = e.r.setdefault("asr", {}).setdefault("whisper", {})
        for src, p in e.sources().items():
            if src in res:
                continue
            segs, info = m.transcribe(wav16(p), language=e.lang, beam_size=beam,
                                      condition_on_previous_text=False, vad_filter=False)
            segs = list(segs)
            res[src] = {"text": " ".join(s.text.strip() for s in segs), "language": info.language,
                        "segments": [[round(s.start, 2), round(s.end, 2), s.text.strip()] for s in segs]}

    def unload(m):
        try:
            del m.model
        except Exception:  # noqa: BLE001
            pass

    need = lambda e: any(s not in e.r.get("asr", {}).get("whisper", {}) for s in e.sources())  # noqa: E731
    return run_stage("whisper", entries, need, fn, load, unload)


def stage_songeval(entries):
    def load():
        import importlib.util
        sys.path.insert(0, str(SONGEVAL_DIR))
        # SongEval's config targets top-level `model.Generator`; an earlier stage's package can already own
        # sys.modules["model"] (seen in the 44-clip run), so bind SongEval's model.py explicitly by path.
        spec = importlib.util.spec_from_file_location("model", SONGEVAL_DIR / "model.py")
        se_model = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(se_model)
        sys.modules["model"] = se_model
        from hydra.utils import instantiate
        from muq import MuQ
        from omegaconf import OmegaConf
        from safetensors.torch import load_file
        cfg = OmegaConf.load(SONGEVAL_DIR / "config.yaml")
        g = instantiate(cfg.generator).to("cuda").eval()
        g.load_state_dict(load_file(str(SONGEVAL_DIR / "ckpt" / "model.safetensors"), device="cpu"), strict=False)
        mq = MuQ.from_pretrained(MUQ).to("cuda").eval()
        return g, mq

    def fn(e, m):
        import librosa
        import numpy as np
        import torch
        g, mq = m
        wav, _ = librosa.load(str(e.norm_wav), sr=24000)   # as SongEval eval.py: mono 24 kHz
        # Official eval.py runs MuQ on the whole clip; full-sequence attention made a 225 s clip peak at
        # 12.5 GiB. Clips <= SE_WHOLE_MAX_S keep the official whole-clip pass; longer clips are run in
        # SE_CHUNK_S windows and the layer-6 features concatenated in time (bounded VRAM, ~3 GiB).
        sr = 24000
        torch.cuda.reset_peak_memory_stats()
        with torch.no_grad():
            if len(wav) <= SE_WHOLE_MAX_S * sr:
                spans = [(0, len(wav))]
            else:
                spans = [(i, min(len(wav), i + SE_CHUNK_S * sr)) for i in range(0, len(wav), SE_CHUNK_S * sr)]
                if spans[-1][1] - spans[-1][0] < 5 * sr and len(spans) > 1:   # merge a tiny tail
                    spans[-2] = (spans[-2][0], spans[-1][1])
                    spans.pop()
            hs = [mq(torch.tensor(wav[a:b]).unsqueeze(0).cuda(), output_hidden_states=True)["hidden_states"][6]
                  for a, b in spans]
            s = g(torch.cat(hs, dim=1)).squeeze(0)
        e.r["songeval"] = {n: round(s[i].item(), 4) for i, n in enumerate(SE_DIMS)}
        e.r["songeval"]["mean"] = round(float(np.mean([e.r["songeval"][n] for n in SE_DIMS])), 4)
        e.r["songeval"]["muq_windows"] = len(spans)
        e.r["songeval"]["torch_peak_gib"] = round(torch.cuda.max_memory_reserved() / 2**30, 2)

    return run_stage("songeval", entries, lambda e: "muq_windows" not in e.r.get("songeval", {}), fn, load)


def stage_aesthetics(entries):
    def load():
        from audiobox_aesthetics.infer import initialize_predictor
        return initialize_predictor()

    def fn(e, m):
        import soundfile as sf
        import torch
        y, sr = sf.read(str(e.norm_wav), dtype="float32", always_2d=True)   # tensor input: no torchaudio.load
        out = m.forward([{"path": torch.from_numpy(y.T.copy()), "sample_rate": sr}])[0]
        e.r["aesthetics"] = {k: round(float(v), 3) for k, v in out.items()}

    return run_stage("aesthetics", entries, lambda e: "aesthetics" not in e.r, fn, load)


def to_scores(r: dict) -> dict:
    """The cached v2 record -> the SongScores fields (CONTRACT-python.md); an absent metric stays absent."""
    out = {}
    num = lambda v: isinstance(v, (int, float)) and not isinstance(v, bool)  # noqa: E731
    if num(r.get("wer_min")):
        out["wer"] = r["wer_min"]
    if num(r.get("wer_sd_min")):
        out["werSd"] = r["wer_sd_min"]
    if num(r.get("per_min")):
        out["per"] = r["per_min"]
    se = r.get("songeval") or {}
    if all(num(se.get(d)) for d in SE_DIMS):
        out["songEval"] = {d.lower(): se[d] for d in SE_DIMS}
    ae = r.get("aesthetics") or {}
    if all(num(ae.get(k)) for k in ("CE", "CU", "PC", "PQ")):
        out["aesthetics"] = {k.lower(): ae[k] for k in ("CE", "CU", "PC", "PQ")}
    bz = (r.get("buzz") or {}).get("mix") or {}
    if num(bz.get("buzz_index_db")):
        out["buzzIdx"] = bz["buzz_index_db"]
    text = ((r.get("asr") or {}).get("qwen3") or {}).get("mix", {}).get("text")
    if isinstance(text, str) and text.strip():
        out["transcript"] = text.strip()
    return out


def main():
    ap = Parser(prog="score.py", description=__doc__)
    ap.add_argument("--in", dest="inp", required=True, help="the take (flac/wav)")
    ap.add_argument("--lyrics", required=True, help="lyrics .txt (or a request .json with a 'lyrics' key)")
    ap.add_argument("--cache-dir", default=str(LAB / ".score-cache"))
    ap.add_argument("--skip", default="", help=f"comma list of {STAGES}")
    ap.add_argument("--whisper-beam", type=int, default=5)
    args = ap.parse_args()

    from _audio import buzz_metric, load_audio, make_norm_copy, raw_stats
    from _text import detect_lang, lyric_errors, read_lyrics

    skip = {s.strip() for s in args.skip.split(",") if s.strip()}
    bad = skip - set(STAGES)
    if bad:
        raise Refused(f"unknown --skip {sorted(bad)}; valid: {STAGES}")
    inp = need_file(args.inp, "--in").resolve()
    lyrics_path = need_file(args.lyrics, "--lyrics")
    cache_root = Path(args.cache_dir).expanduser()
    e = Entry(inp, cache_root)
    e.lyrics_text = read_lyrics(lyrics_path)
    e.lang = detect_lang(e.lyrics_text)
    entries = [e]
    t_run = time.time()

    # 1. raw stats + -14 LUFS copy + buzz (numpy, always on)
    if not ("raw" in e.r and e.norm_wav.exists() and ("buzz" in e.r or "buzz" in skip)):
        t = time.time()
        x, sr = load_audio(e.path)
        e.r["raw"] = raw_stats(x, sr)
        e.r["norm"] = make_norm_copy(x, sr, e.r["raw"], e.norm_wav)
        e.r["timing_s"]["raw_norm"] = round(time.time() - t, 2)
        if "buzz" not in skip:
            t = time.time()
            try:
                e.r["buzz"] = {"mix": buzz_metric(x, sr)}
            except Exception as ex:  # noqa: BLE001
                e.r["errors"]["buzz"] = repr(ex)
            e.r["timing_s"]["buzz"] = round(time.time() - t, 2)
        e.save()
        log(f"raw/norm/buzz {e.path.name}: LUFS {e.r['raw']['lufs_i']} TP {e.r['raw']['true_peak_dbtp']}")

    # 2. vocal stem, 3. ASR (Qwen3-ASR then faster-whisper), each model loaded alone and freed
    if "sep" not in skip:
        stage_sep(entries, cache_root)
    lyr = [x for x in entries if x.lyrics_text]
    if "qwen" not in skip:
        stage_qwen(lyr)
    if "whisper" not in skip:
        stage_whisper(lyr, args.whisper_beam)

    # 3c. WER/CER (+PER) from transcripts - recomputed every run (lyrics may change), cheap
    if e.lyrics_text:
        note = lyric_errors(e.r, e.lyrics_text, e.lang, "per" not in skip)
        e.save()
        if note:
            log("PER dropped:", note)

    # 4. SongEval and 5. Audiobox Aesthetics, on the -14 LUFS copy
    if "songeval" not in skip:
        stage_songeval(entries)
    if "aesthetics" not in skip:
        stage_aesthetics(entries)

    # 6. buzz on the stem too (cheap)
    if "buzz" not in skip and e.stem_wav.exists() and "stem" not in e.r.get("buzz", {}):
        import soundfile as sf
        y, sr = sf.read(str(e.stem_wav), dtype="float32", always_2d=True)
        e.r.setdefault("buzz", {})["stem"] = buzz_metric(y, sr)
        e.save()

    if e.r.get("errors"):
        log(f"stage errors (metrics omitted): {json.dumps(e.r['errors'])}")
    log(f"wall {time.time() - t_run:.1f} s, cache {e.dir}")
    return {"scores": to_scores(e.r)}


if __name__ == "__main__":
    try:
        ensure_env()
    except OSError as ex:   # execv refused: answer anyway (faster-whisper may then miss its CUDA libs)
        print(f"re-exec failed: {ex!r}", flush=True)
    run(main)
