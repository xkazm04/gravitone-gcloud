"""Lyrics normalisation, WER/CER and phoneme error rate for score.py (moved verbatim from kiro/yue2-lab score.py)."""
from __future__ import annotations

import json
import os
import re
import unicodedata
from pathlib import Path

TAG_RE = re.compile(r"\[[^\]]*\]")
CJK_RE = re.compile(r"[㐀-鿿豈-﫿]")


def read_lyrics(path: Path) -> str:
    txt = path.read_text(encoding="utf-8")
    if path.suffix.lower() == ".json":
        txt = json.loads(txt)["lyrics"]
    return txt


def detect_lang(text: str) -> str:
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return "en"
    return "zh" if sum(bool(CJK_RE.match(c)) for c in letters) / len(letters) > 0.3 else "en"


def norm_text(text: str, lang: str) -> str:
    text = TAG_RE.sub(" ", text or "")
    if lang == "zh":
        try:
            import zhconv
            text = zhconv.convert(text, "zh-cn")
        except Exception:  # noqa: BLE001 - zhconv is optional
            pass
    text = text.lower().replace("-", " ").replace("’", "'")
    text = "".join(" " if unicodedata.category(c).startswith(("P", "S")) else c for c in text)
    text = text.replace("'", "")
    text = re.sub(r"\s+", " ", text).strip()
    if lang == "zh":   # character level, drop spaces
        text = text.replace(" ", "")
    return text


def error_rate(ref_tokens, hyp_tokens, detail=None):
    """Standard (S+D+I)/N. If `detail` is a dict it receives S, D, I, N and the insertion-free rate (S+D)/N:
    YuE2 often sings the chorus more times than the lyrics sheet has it (and Whisper appends hallucinated
    outros) - both are pure insertions that push WER past 1.0 although every lyric line was recognised."""
    import jiwer
    if not ref_tokens:
        return None
    if not hyp_tokens:
        if detail is not None:
            detail.update(S=0, D=len(ref_tokens), I=0, N=len(ref_tokens), sd_rate=1.0)
        return 1.0
    o = jiwer.process_words(" ".join(ref_tokens), " ".join(hyp_tokens))
    n = len(ref_tokens)
    if detail is not None:
        detail.update(S=o.substitutions, D=o.deletions, I=o.insertions, N=n,
                      sd_rate=round((o.substitutions + o.deletions) / n, 4))
    return round(o.wer, 4)


def text_error(ref: str, hyp: str, lang: str, detail=None):
    """WER (en) or CER (zh) on normalised text."""
    if lang == "zh":
        return error_rate(list(ref), list(hyp), detail)
    return error_rate(ref.split(), hyp.split(), detail)


_PHON = None


def phonemes(text: str, lang: str):
    global _PHON
    if _PHON is None:
        import espeakng_loader
        from phonemizer.backend.espeak.wrapper import EspeakWrapper
        EspeakWrapper.set_library(espeakng_loader.get_library_path())
        os.environ["ESPEAK_DATA_PATH"] = espeakng_loader.get_data_path()
        from phonemizer import phonemize
        from phonemizer.separator import Separator
        _PHON = (phonemize, Separator(phone=" ", word=" _ ", syllable=""))
    phonemize, sep = _PHON
    if not text.strip():
        return []
    if lang == "zh":
        text = " ".join(text)   # espeak cmn reads per character
    out = phonemize([text], language={"en": "en-us", "zh": "cmn"}[lang], backend="espeak",
                    separator=sep, strip=True, preserve_punctuation=False, with_stress=False, njobs=1)
    return [t for t in out[0].split() if t != "_"]


def lyric_errors(r: dict, lyrics_text: str, lang: str, per_on: bool):
    """WER/CER (+PER) of every transcript in r["asr"] against the lyrics; writes the score.py v2 record keys
    (wer, wer_min, wer_detail, wer_sd, wer_sd_min, per, per_min, per_sd, per_sd_min). Returns a note when PER
    had to be dropped (phonemizer/espeak-ng missing), else None."""
    for k in ("wer", "per", "wer_min", "per_min", "wer_sd", "per_sd", "wer_sd_min", "per_sd_min", "wer_detail"):
        r.pop(k, None)
    ref = norm_text(lyrics_text, lang)
    r["lyrics_norm"] = ref
    wer, per, wdet, per_sd = {}, {}, {}, {}
    ref_ph, note = None, None
    if per_on:
        try:
            ref_ph = phonemes(ref, lang)
        except Exception as ex:  # noqa: BLE001
            note = f"phonemizer/espeak-ng unavailable: {ex!r}"
    for asr, by_src in r.get("asr", {}).items():
        for src, d in by_src.items():
            hyp = norm_text(d["text"], lang)
            d["text_norm"] = hyp
            det = {}
            wer[f"{asr}_{src}"] = text_error(ref, hyp, lang, det)
            wdet[f"{asr}_{src}"] = det
            if ref_ph is not None:
                pdet = {}
                per[f"{asr}_{src}"] = error_rate(ref_ph, phonemes(hyp, lang), pdet)
                per_sd[f"{asr}_{src}"] = pdet["sd_rate"]
    r["wer_kind"] = "cer" if lang == "zh" else "wer"
    r["wer"] = wer
    vals = [v for v in wer.values() if v is not None]
    r["wer_min"] = min(vals) if vals else None
    r["wer_detail"] = wdet
    r["wer_sd"] = {k: d.get("sd_rate") for k, d in wdet.items()}
    sd = [v for v in r["wer_sd"].values() if v is not None]
    r["wer_sd_min"] = min(sd) if sd else None
    if per:
        r["per"] = per
        r["per_min"] = min(per.values())
        r["per_sd"] = per_sd
        r["per_sd_min"] = min(per_sd.values())
    return note
