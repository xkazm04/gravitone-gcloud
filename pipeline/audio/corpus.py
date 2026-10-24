"""The audio-triage corpus: clean bases, each defect injected at three severities, and the labels.

    python pipeline/audio/corpus.py build --out <dir> [--seed N] [--real] [--real-dir D]
                                          [--real-max N] [--only a,b] [--plan] [--json]
      -> <dir>/<id>.wav (16-bit PCM) + <dir>/labels.json
      -> stdout's LAST line: {"ok":true,"out":...,"rows":n,"files":n,"grid":{...},"real":{...}}
         or {"ok":false,"error":"<the underlying sentence>","kind":...} and exit 1

The eval harness (pipeline/audio-triage-eval.mts) builds this, runs the sidecar's `triage` over
every file, and scores each check against the labels; `check:audio-triage` holds the floors over
the SYNTHETIC rows of seed 7. Spark audio-triage, WP2 (.vault/Spark/ideas/audio-triage.md).

LABELS (`labels.json`): {version, seed, rate, real:{asked, found, reason, skipped}, rows:[...]},
one row per file:
  {file, kind, context, base, defect: <check>|null, variant: <str>|null,
   severity: "low"|"medium"|"high"|null, amount: <number>|null, unit: <str>|null, real: bool,
   expect: {<check>: "flag"|"pass"|"skip"}}
`context` is the TriageContext the take is judged against (@gt/domain/audio.triage); `base` is the
clean control the row was made from (a clean control names itself). `expect` states, per check:
  skip  the context does not commit what the check needs (no asked length, not music, no
        sections, not a loop, a loop's ending, a mono file) - the contract's skip rule;
  flag  the check this row's defect was injected for;
  pass  every other check: the injection leaves it where the clean base had it;
  (absent) DON'T CARE - a side effect the injection cannot avoid (a hard clip also lifts the true
        peak and the loudness; a long tail also lengthens the take; a warp also moves the plan's
        boundaries). Named in DONT_CARE below, so it is never scored as a false positive.

THE GRID (GRID below): every amount is physical - dB, seconds, a ratio - and fixed, so moving a
threshold moves the scores and never the corpus. Low sits under the kind's current bar on
purpose (it measures how far below the bar a detector still sees), medium a step over it, high
far over it; the gate's recall is held at medium+high. Where the brief's grid put a medium ON a
bar (music dead air 2 s against a 2 s bar) the medium is moved a step off it (2.5 s), and voice's
lengths scale with voice's wider tolerance (35 %, not 10 %).

CLEAN CONTROLS: eight instances of every synthetic base (eight tempi for the music), each a row
with defect null and every non-skipped check expected to pass - the false-positive rate's
denominator. Injected rows derive from instance (severity + 3 x variant) mod 8 of their base.

`--plan` writes labels.json alone (no audio): the rows do not depend on the samples, which is
what lets a test pin them cheaply. `--only` keeps rows whose id contains any of the given words.
"""

import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

LABELS_VERSION = 1
CHECKS = ("clipping", "true-peak-over", "loudness-range", "dead-air", "duration",
          "broken-ending", "tempo-instability", "section-boundary", "loop-seam", "mono-fold")
SEV = ("low", "medium", "high")
CLEAN_INSTANCES = 8
# The fewest positives a check gets at medium+high: at 10, one miss still holds recall 0.9.
POSITIVES_MH = 10

GRID = {
    ("clipping", None): ("dB over full scale", {"*": (1, 4, 10)}),
    ("true-peak-over", None): ("dBTP", {"*": (0.3, 1, 2.5)}),
    ("loudness-range", None): ("LUFS", {"sfx": (-41, -46, -55), "*": (-31, -36, -45)}),
    ("dead-air", None): ("s", {"music": (1, 2.5, 4), "*": (1, 2, 4)}),
    ("duration", "trim"): ("ratio short", {"voice": (0.15, 0.45, 0.7), "*": (0.05, 0.12, 0.25)}),
    ("duration", "stretch"): ("ratio long", {"voice": (0.15, 0.45, 0.7), "*": (0.05, 0.12, 0.25)}),
    ("broken-ending", "cut"): ("dB at the last sample", {"*": (-14, -6, 0)}),
    ("broken-ending", "tail"): ("s of silent tail", {"music": (2, 4.5, 8), "*": (1.5, 3, 6)}),
    ("tempo-instability", None): ("drift ratio, thirds", {"*": (0.02, 0.04, 0.08)}),
    ("section-boundary", None): ("s boundary shift", {"*": (1, 3, 6)}),
    ("loop-seam", "level"): ("dB step", {"*": (2, 4, 8)}),
    ("loop-seam", "spectral"): ("dB step above 2 kHz", {"*": (2, 4, 8)}),
    ("mono-fold", None): ("degrees of rotation", {"*": (75, 120, 180)}),
}

COMMON = [("clipping", None), ("true-peak-over", None), ("loudness-range", None), ("dead-air", None),
          ("duration", "trim"), ("duration", "stretch"), ("broken-ending", "cut"), ("broken-ending", "tail")]
LOOPS = [("loop-seam", "level"), ("loop-seam", "spectral")]
INJECT = {
    "music": COMMON + [("tempo-instability", None), ("section-boundary", None), ("mono-fold", None)],
    "music-loop": LOOPS,
    "sfx": COMMON + [("mono-fold", None)],
    "sfx-loop": LOOPS,
    "voice": COMMON,
    "real": COMMON + [("tempo-instability", None), ("mono-fold", None)],
}
DONT_CARE = {
    "clipping": {"true-peak-over", "loudness-range"},
    "loudness-range": {"dead-air"},
    "dead-air": {"tempo-instability"},
    "duration": {"section-boundary"},
    "broken-ending:tail": {"duration"},
    "tempo-instability": {"duration", "section-boundary"},
}


def emit(doc, code=0):
    print(json.dumps(doc), flush=True)
    sys.exit(code)


class Args(argparse.ArgumentParser):
    def error(self, message):
        emit({"ok": False, "error": message, "kind": "refused"}, 1)


def expectations(kind, context, channels, defect, variant):
    skip = {
        "duration": "durationS" not in context,
        "broken-ending": context.get("loop") is True,
        "tempo-instability": kind != "music",
        "section-boundary": "sections" not in context,
        "loop-seam": context.get("loop") is not True,
        "mono-fold": channels < 2,
    }
    dont = DONT_CARE.get(f"{defect}:{variant}", set()) | DONT_CARE.get(defect or "", set())
    out = {}
    for c in CHECKS:
        if skip.get(c, False):
            out[c] = "skip"
        elif c == defect:
            out[c] = "flag"
        elif c not in dont:
            out[c] = "pass"
    return out


def base_config(name):
    import corpus_bases as B

    return {
        "music": ("music", 2, B.TAIL_S, B.FADE_S),
        "music-loop": ("music", 2, 0.0, 0.0),
        "sfx": ("sfx", 2, B.TAIL_S, B.FADE_S),
        "sfx-loop": ("sfx", 2, 0.0, 0.0),
        "voice": ("voice", 1, B.VOICE_TAIL_S, B.VOICE_FADE_S),
    }[name]


def synthetic_context(name, instance):
    import corpus_bases as B

    s = B.spec(name, instance)
    kind = base_config(name)[0]
    ctx = {"kind": kind, "durationS": round(s["frames"] / B.RATE, 4)}
    if kind == "music":
        ctx["tempoBpm"] = s["bpm"]
    if name.endswith("-loop"):
        ctx["loop"] = True
    if "sections" in s:
        ctx["sections"] = s["sections"]
    return ctx


def plan_rows(bases):
    """bases: [(base_id, family, kind, channels, context, source)] -> rows (labels) + render plan."""
    rows = []
    for base_id, family, kind, channels, ctx, source in bases:
        rows.append(({"file": f"{base_id}.clean.wav", "kind": kind, "context": ctx, "base": base_id, "defect": None,
                      "variant": None, "severity": None, "amount": None, "unit": None, "real": family == "real",
                      "expect": expectations(kind, ctx, channels, None, None)}, (source, None)))
    return rows


SYNTHETIC = ("music", "music-loop", "sfx", "sfx-loop", "voice")


def replicas(check):
    """Copies per (base, variant, severity) so every check has >= POSITIVES_MH rows at medium+high."""
    combos = sum(1 for fam in SYNTHETIC for c, _ in INJECT[fam] if c == check)
    return -(-POSITIVES_MH // (2 * combos))


def injected_rows(family, pairs, base_ids, kind, channels, context_of, source_of, reps=None):
    rows = []
    for v_index, (check, variant) in enumerate(pairs):
        unit, table = GRID[(check, variant)]
        amounts = table.get(kind, table["*"])
        n = reps if reps is not None else replicas(check)
        for rep in range(n):
            for s_index, sev in enumerate(SEV):
                base_id = base_ids[(3 * rep + s_index + v_index) % len(base_ids)]
                ctx = json.loads(json.dumps(context_of(base_id)))
                if check == "section-boundary":
                    d = int(round(amounts[s_index] * 1000))
                    ctx["sections"][0]["endMs"] += d
                    ctx["sections"][1]["startMs"] += d
                slug = f"{check}-{variant}-{sev}" if variant else f"{check}-{sev}"
                rows.append(({"file": f"{base_id}.{slug}.wav", "kind": kind, "context": ctx, "base": base_id, "defect": check,
                              "variant": variant, "severity": sev, "amount": amounts[s_index], "unit": unit,
                              "real": family == "real", "expect": expectations(kind, ctx, channels, check, variant)},
                             (source_of(base_id), (check, variant, amounts[s_index]))))
    return rows


def plan(seed, real_found):
    out = []
    for name in SYNTHETIC:
        kind, channels, _, _ = base_config(name)
        ids = [f"{name}-{i}" for i in range(CLEAN_INSTANCES)]
        ctx = {f"{name}-{i}": synthetic_context(name, i) for i in range(CLEAN_INSTANCES)}
        src = {f"{name}-{i}": ("synthetic", name, i) for i in range(CLEAN_INSTANCES)}
        out += plan_rows([(b, name, kind, channels, ctx[b], src[b]) for b in ids])
        out += injected_rows(name, INJECT[name], ids, kind, channels, ctx.__getitem__, src.__getitem__)
    for sha, path, frames, rate, channels in real_found:
        b = f"real-{sha}"
        ctx = {"kind": "music", "durationS": round(frames / rate, 4)}
        out += plan_rows([(b, "real", "music", channels, ctx, ("real", path, rate))])
        pairs = [(c, v) for c, v in INJECT["real"] if channels > 1 or c != "mono-fold"]
        source = ("real", path, rate)
        out += injected_rows("real", pairs, [b], "music", channels, lambda _b, c=ctx: c, lambda _b, s=source: s, reps=1)
    return out


class Renderer:
    """Clean and open renders, cached per base: every row of a base starts from the same samples."""

    def __init__(self, seed):
        self.seed = seed
        self.cache = {}

    def base(self, source, ending):
        key = (source, ending)
        if key not in self.cache:
            import corpus_bases as B

            if source[0] == "synthetic":
                self.cache[key] = (B.render(self.seed, source[1], source[2], ending), B.RATE)
            else:
                self.cache[key] = B.real(source[1], ending)
        return self.cache[key]


def render_row(r, row, source, op):
    import corpus_defects as D

    family = source[1] if source[0] == "synthetic" else "real"
    _, _, tail_s, fade_s = base_config(family) if family != "real" else ("music", 2, 0.5, 1.5)
    if op is None:
        return r.base(source, "fade")
    check, variant, amount = op
    if check == "broken-ending" and variant == "cut":
        a, rate = r.base(source, "open")
        return D.open_cut(a, rate, amount), rate
    a, rate = r.base(source, "fade")
    body = len(a) - int(round(tail_s * rate))
    if check == "clipping":
        return D.clip(a, amount), rate
    if check == "true-peak-over":
        return D.true_peak(a, rate, amount, body), rate
    if check == "loudness-range":
        return D.to_lufs(a, rate, amount), rate
    if check == "dead-air":
        return D.dead_air(a, rate, amount, body), rate
    if check == "duration":
        return (D.trim(a, rate, amount, tail_s, fade_s) if variant == "trim" else D.stretch(a, amount)), rate
    if check == "broken-ending":
        return D.long_tail(a, rate, amount, tail_s), rate
    if check == "tempo-instability":
        return D.tempo_warp(a, amount), rate
    if check == "section-boundary":
        return a, rate
    if check == "loop-seam":
        return (D.loop_level(a, amount) if variant == "level" else D.loop_spectral(a, rate, amount)), rate
    if check == "mono-fold":
        return D.mono_fold(a, rate, amount), rate
    raise ValueError(f"no injection for {check}")


def probe_real(root, limit):
    import corpus_bases as B
    import soundfile as sf

    found, reason = B.discover_real(root, limit)
    usable, skipped = [], []
    for sha, path in found:
        try:
            info = sf.info(path)
            a, rate = B.real(path, "fade")
            usable.append((sha, path, len(a), rate, info.channels))
        except Exception as e:  # a take soundfile cannot decode is reported, not fatal
            skipped.append({"sha": sha, "reason": str(e)})
    return usable, reason, skipped


def build(args):
    import numpy as np

    real_found, real = [], {"asked": bool(args.real), "found": 0, "reason": None, "skipped": []}
    if args.real and args.plan:
        real["reason"] = "real bases are decoded to be planned; --plan leaves them out"
    elif args.real:
        root = os.path.abspath(args.real_dir or os.path.join(REPO, "foundry-out", "sound"))
        real_found, real["reason"], real["skipped"] = probe_real(root, args.real_max)
        real["found"] = len(real_found)
    rows = plan(args.seed, real_found)
    if args.only:
        words = [w for w in args.only.split(",") if w]
        rows = [x for x in rows if any(w in x[0]["file"] for w in words)]
    os.makedirs(args.out, exist_ok=True)
    files = 0
    if not args.plan:
        import soundfile as sf

        r = Renderer(args.seed)
        for row, (source, op) in rows:
            a, rate = render_row(r, row, source, op)
            sf.write(os.path.join(args.out, row["file"]), np.clip(a, -1.0, 1.0), rate, subtype="PCM_16")
            files += 1
    grid = {}
    for row, _ in rows:
        cell = grid.setdefault(row["defect"] or "clean", {})
        k = row["severity"] or "clean"
        cell[k] = cell.get(k, 0) + 1
    import corpus_bases as B

    doc = {"version": LABELS_VERSION, "seed": args.seed, "rate": B.RATE, "real": real, "rows": [x[0] for x in rows]}
    with open(os.path.join(args.out, "labels.json"), "w", encoding="utf8", newline="\n") as f:
        json.dump(doc, f, indent=1)
        f.write("\n")
    return {"ok": True, "out": os.path.abspath(args.out), "rows": len(rows), "files": files, "grid": grid, "real": real}


def main():
    p = Args(prog="corpus.py")
    sub = p.add_subparsers(dest="verb", required=True, parser_class=Args)
    b = sub.add_parser("build")
    b.add_argument("--out", required=True)
    b.add_argument("--seed", type=int, default=7)
    b.add_argument("--real", action="store_true")
    b.add_argument("--real-dir", default=None)
    b.add_argument("--real-max", type=int, default=4)
    b.add_argument("--only", default=None)
    b.add_argument("--plan", action="store_true")
    b.add_argument("--json", action="store_true")
    args = p.parse_args()
    try:
        emit(build(args))
    except ImportError as e:
        emit({"ok": False, "error": str(e), "kind": "missing-module"}, 1)
    except Exception as e:  # the contract: one JSON line whatever happened, the tool's own words
        emit({"ok": False, "error": f"{type(e).__name__}: {e}", "kind": "failed"}, 1)


if __name__ == "__main__":
    main()
