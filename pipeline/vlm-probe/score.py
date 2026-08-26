"""Score a probe run: can a local model annotate a frame as well as the yardstick?

    python score.py --run 2026-08-25T101500Z
    python score.py --run <id> --reference gemini-3.7-flash

Four questions, in the order they can disqualify a model:

1. **Does it answer at all?**  Valid JSON, every required field, every enum
   value inside its vocabulary. A model that fails here is unusable as a
   labeller no matter how good its prose is.
2. **Is it right?**  Only where a `frames/truth/<stem>.json` file exists --
   frames whose camera and lighting we specified ourselves when we generated
   them, so the correct answer is known rather than voted on.
3. **Does it agree with the yardstick?**  Per-field agreement with the
   reference model. Agreement is not truth; it is the cheap proxy that tells
   you where to look, and disagreements are printed so a human adjudicates.
4. **What does it cost?**  Seconds per frame and resident VRAM -- the numbers
   that decide whether annotating a hundred thousand frames is a weekend or
   a quarter.

Ordinal fields (shot size, lens, contrast, depth of field) score a near-miss
at half credit: calling a wide shot "full" is a different kind of wrong from
calling it a close-up, and a scorer that flattens the two teaches us nothing.
"""

import argparse
import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from schema import ENUM_FIELDS, FIELDS, LIST_FIELDS, ORDINAL, REQUIRED, TEXT_FIELDS  # noqa: E402

HERE = Path(__file__).parent
OUT_ROOT = HERE.parent.parent / "vlm-probe-out"
TRUTH_DIR = HERE / "frames" / "truth"


def load_rows(run_id):
    path = OUT_ROOT / run_id / "results.jsonl"
    if not path.exists():
        sys.exit(f"no results at {path}")
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def structural(parsed):
    """Faults that make an annotation unusable regardless of its content."""
    faults = []
    for f in REQUIRED:
        if f not in parsed:
            faults.append(f"missing:{f}")
    for f in ENUM_FIELDS:
        v = parsed.get(f)
        if v is not None and v not in FIELDS[f]["enum"]:
            faults.append(f"off-vocab:{f}={v}")
    for f in LIST_FIELDS:
        v = parsed.get(f)
        if v is not None and not isinstance(v, list):
            faults.append(f"not-a-list:{f}")
    # The schema asks for noun phrases. A model that answers in paragraphs is
    # hiding its uncertainty in prose, and that is worth counting.
    for f in TEXT_FIELDS:
        v = parsed.get(f)
        if isinstance(v, str) and len(v.split()) > 30:
            faults.append(f"overlong:{f}({len(v.split())}w)")
    return faults


def field_credit(field, got, want):
    """1.0 exact, 0.5 one step off on an ordinal scale, 0.0 otherwise."""
    if got == want:
        return 1.0
    scale = ORDINAL.get(field)
    if scale and got in scale and want in scale and abs(scale.index(got) - scale.index(want)) == 1:
        return 0.5
    return 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True)
    ap.add_argument("--reference", default="gemini-3.7-flash")
    ap.add_argument("--show-disagreements", action="store_true")
    args = ap.parse_args()

    rows = load_rows(args.run)
    models = sorted({r["model"] for r in rows}, key=lambda m: (m == args.reference, m))
    frames = sorted({r["frame"] for r in rows})

    # First repeat only for the comparison tables; repeats feed consistency.
    first = {(r["frame"], r["model"]): r for r in rows if r.get("repeat") == 1}

    truth = {}
    for frame in frames:
        tp = TRUTH_DIR / (Path(frame).stem + ".json")
        if tp.exists():
            truth[frame] = json.loads(tp.read_text(encoding="utf-8"))

    lines = []

    def emit(s=""):
        print(s)
        lines.append(s)

    emit(f"# VLM frame-annotation probe -- run {args.run}")
    emit()
    emit(f"{len(frames)} frame(s), {len(models)} model(s), reference = `{args.reference}`")
    if truth:
        emit(f"ground truth available for: {', '.join(sorted(truth))}")
    emit()

    # --- 1. structural ----------------------------------------------------
    emit("## 1. Does it answer at all")
    emit()
    emit("| model | tier | valid JSON | structural faults | s/frame (median) | VRAM GB |")
    emit("|---|---|---|---|---|---|")
    fault_detail = defaultdict(list)
    for m in models:
        mrows = [r for r in rows if r["model"] == m]
        okrows = [r for r in mrows if r.get("ok")]
        faults = 0
        for r in okrows:
            f = structural(r["parsed"])
            faults += len(f)
            if f:
                fault_detail[m].append((r["frame"], f))
        lat = [r["latency_s"] for r in mrows if r.get("latency_s")]
        vram = [r.get("vram_gb") for r in mrows if r.get("vram_gb")]
        tier = next((r.get("tier", "?") for r in mrows), "?")
        emit(f"| `{m}` | {tier} | {len(okrows)}/{len(mrows)} | {faults} | "
             f"{statistics.median(lat) if lat else float('nan'):.1f} | "
             f"{max(vram) if vram else '--'} |")
    emit()
    for m, items in fault_detail.items():
        for frame, f in items:
            emit(f"- `{m}` on `{frame}`: {', '.join(f)}")
    errs = [r for r in rows if not r.get("ok")]
    for r in errs:
        emit(f"- FAILED `{r['model']}` on `{r['frame']}`: {r.get('error', '?')[:160]}")
    emit()

    # --- 2. ground truth --------------------------------------------------
    if truth:
        emit("## 2. Is it right (frames with known ground truth)")
        emit()
        graded = [f for f in ENUM_FIELDS if any(f in t for t in truth.values())]
        emit("| model | " + " | ".join(graded) + " | score |")
        emit("|---" * (len(graded) + 2) + "|")
        for m in models:
            cells, total, n = [], 0.0, 0
            for f in graded:
                credits = []
                for frame, t in truth.items():
                    if f not in t:
                        continue
                    r = first.get((frame, m))
                    if not r or not r.get("ok"):
                        continue
                    credits.append(field_credit(f, r["parsed"].get(f), t[f]))
                if credits:
                    c = sum(credits) / len(credits)
                    total += sum(credits)
                    n += len(credits)
                    cells.append("+" if c == 1 else ("~" if c >= 0.5 else "X"))
                else:
                    cells.append("--")
            pct = f"{100 * total / n:.0f}%" if n else "--"
            emit(f"| `{m}` | " + " | ".join(cells) + f" | **{pct}** |")
        emit()
        emit("`+` exact  `~` one step off on an ordinal scale  `X` wrong")
        emit()

    # --- 3. agreement with the yardstick ----------------------------------
    if args.reference in models:
        emit(f"## 3. Agreement with `{args.reference}`")
        emit()
        emit("| model | " + " | ".join(ENUM_FIELDS) + " | mean |")
        emit("|---" * (len(ENUM_FIELDS) + 2) + "|")
        disagreements = []
        for m in models:
            if m == args.reference:
                continue
            cells, scores = [], []
            for f in ENUM_FIELDS:
                credits = []
                for frame in frames:
                    ref, got = first.get((frame, args.reference)), first.get((frame, m))
                    if not (ref and got and ref.get("ok") and got.get("ok")):
                        continue
                    rv, gv = ref["parsed"].get(f), got["parsed"].get(f)
                    credits.append(field_credit(f, gv, rv))
                    if gv != rv:
                        disagreements.append((frame, f, m, gv, rv))
                if credits:
                    c = sum(credits) / len(credits)
                    scores.append(c)
                    cells.append(f"{c:.2f}")
                else:
                    cells.append("--")
            mean = f"{statistics.mean(scores):.2f}" if scores else "--"
            emit(f"| `{m}` | " + " | ".join(cells) + f" | **{mean}** |")
        emit()
        if disagreements and args.show_disagreements:
            emit("### Where they disagree (a human decides who is right)")
            emit()
            for frame, f, m, gv, rv in disagreements:
                emit(f"- `{frame}` **{f}**: `{m}` said `{gv}`, `{args.reference}` said `{rv}`")
            emit()

    # --- 4. self-consistency ---------------------------------------------
    reps = max((r.get("repeat", 1) for r in rows), default=1)
    if reps > 1:
        emit("## 4. Self-consistency across repeats")
        emit()
        emit("| model | enum fields stable across runs |")
        emit("|---|---|")
        for m in models:
            stable = tot = 0
            for frame in frames:
                rs = [r for r in rows if r["model"] == m and r["frame"] == frame and r.get("ok")]
                if len(rs) < 2:
                    continue
                for f in ENUM_FIELDS:
                    tot += 1
                    if len({r["parsed"].get(f) for r in rs}) == 1:
                        stable += 1
            emit(f"| `{m}` | {f'{100 * stable / tot:.0f}%' if tot else '--'} |")
        emit()

    report = OUT_ROOT / args.run / "report.md"
    report.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\nwritten -> {report}")


if __name__ == "__main__":
    main()
