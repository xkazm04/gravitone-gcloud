"""Group score JSONL by condition (filename minus seed) and print a per-condition summary + per-clip ranking.

A DEV CLI (not run by Node; moved from kiro/yue2-lab). It reads both record shapes:
  - the yue2-lab score.py v2 records (scores_*.jsonl: file, wer_min, songeval{...}, aesthetics{CE..}, buzz{...});
  - the moved score.py answers, one per line, with the take's path added: {"file": F, "scores": {wer, ...}}.

usage: python analyze.py <scores.jsonl> [--md out.md]
Selector (yue2-lab HYBRID-RESEARCH 1c): gate on lyric fidelity first (wer <= GATE), then rank by SongEval mean + CE.
"""
import json, re, sys, statistics as st
from collections import defaultdict
from pathlib import Path

GATE = 0.10  # max standard WER (incl. repeated-section insertions) to pass the lyric gate


def g(d, path, default=None):
    for k in path.split("."):
        if not isinstance(d, dict) or k not in d:
            return default
        d = d[k]
    return d


def from_answer(r):
    """{"file", "scores": SongScores fields} -> the v2 record keys row() reads."""
    sc = r.get("scores") or {}
    se = sc.get("songEval") or {}
    ae = sc.get("aesthetics") or {}
    return {"file": r["file"], "wer_min": sc.get("wer"), "wer_sd_min": sc.get("werSd"),
            "songeval": {k.capitalize(): v for k, v in se.items()},
            "aesthetics": {k.upper(): v for k, v in ae.items()}, "raw": {"duration_s": r.get("durationS")}}


def row(r):
    if "scores" in r:
        r = from_answer(r)
    name = Path(r["file"]).stem
    se = g(r, "songeval") or {}
    # only the 5 quality dims (the record also carries mean / muq_windows / torch_peak_gib)
    se_vals = [se[k] for k in ("Coherence", "Musicality", "Memorability", "Clarity", "Naturalness") if k in se]
    return {
        "name": name,
        "cond": re.sub(r"_s\d+$", "", name),
        "seed": (re.search(r"_s(\d+)$", name) or [None, "-"])[1],
        "dur": g(r, "raw.duration_s"),
        "wer": g(r, "wer_min"),
        "wer_sd": g(r, "wer_sd_min"),
        "se": round(st.mean(se_vals), 3) if se_vals else None,
        "phr": se.get("Naturalness") or se.get("Vocal Phrasing Naturalness") or se.get("Naturalness of Vocal Breathing and Phrasing"),
        "ce": g(r, "aesthetics.CE"),
        "pq": g(r, "aesthetics.PQ"),
        "buzz150": g(r, "buzz.mix.harmonics_pctl.150Hz"),
    }


def passes(r):
    return r["wer"] is not None and r["wer"] <= GATE


def mean(xs):
    xs = [x for x in xs if isinstance(x, (int, float))]
    return round(st.mean(xs), 3) if xs else None


def main():
    recs = [json.loads(l) for l in open(sys.argv[1], encoding="utf-8") if l.strip()]
    recs = [from_answer(r) if "scores" in r else r for r in recs]
    rows = [row(r) for r in recs]
    se_keys = sorted({k for r in recs for k in (r.get("songeval") or {})})
    out = [f"SongEval dims: {se_keys}", ""]
    by = defaultdict(list)
    for r in rows:
        by[r["cond"]].append(r)
    hdr = "| condition | n | gate pass | WER mean | WER-sd mean | SongEval | CE | PQ | dur s |"
    out += [hdr, "|" + "---|" * 9]
    summ = []
    for c, rs in by.items():
        summ.append((c, len(rs), sum(1 for r in rs if passes(r)), mean(r["wer"] for r in rs),
                     mean(r["wer_sd"] for r in rs), mean(r["se"] for r in rs), mean(r["ce"] for r in rs),
                     mean(r["pq"] for r in rs), mean(r["dur"] for r in rs)))
    for s in sorted(summ, key=lambda s: (-(s[2] / s[1]), -(s[5] or 0))):
        out.append("| " + " | ".join(str(x) for x in s) + " |")
    out += ["", f"Top clips (gate WER <= {GATE}, ranked by SongEval + CE/2):", "",
            "| clip | WER | WER-sd | SongEval | CE | PQ | buzz150 pctl |", "|" + "---|" * 7]
    passed = [r for r in rows if passes(r) and r["se"] is not None]
    for r in sorted(passed, key=lambda r: -(r["se"] + (r["ce"] or 0) / 2))[:12]:
        out.append(f"| {r['name']} | {r['wer']} | {r['wer_sd']} | {r['se']} | {r['ce']} | {r['pq']} | {r['buzz150']} |")
    text = "\n".join(out)
    print(text)
    if "--md" in sys.argv:
        Path(sys.argv[sys.argv.index("--md") + 1]).write_text(text + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
