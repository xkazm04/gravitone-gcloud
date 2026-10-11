"""Blind admission: turn a "dictated" sidecar into a label, or into a finding.

    python truth_admit.py --run 2026-08-25T101500Z            # >= 2 independent model reads
    python truth_admit.py --run <id> --min-reads 1 --models human-ui

A consistency lane writes `<shot>.truth.json` with basis "dictated": what the
prompt asked for, not what the pixels show. This module compares that request
with annotations of the rendered frame made WITHOUT the label in view -- the
probe's own results.jsonl rows, where each model saw only the image. For every
graded field of the sidecar:

    all reads equal the dictated value        -> confirmed
    a strict majority of reads differ         -> disputed (the generator disobeyed)
    anything else (a split, too few reads)    -> undecided, the sidecar stays "dictated"

A sidecar whose graded fields are all confirmed becomes "dictated+confirmed"
(score.py grades it); one with any disputed field becomes "dictated-disputed"
(score.py counts it as generator compliance, never against the annotator).
Reads count once per model, from the first repeat. A sidecar whose spec_digest no
longer matches craft_spec's labels is refused, not admitted.

Stdlib only.
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import craft_spec  # noqa: E402
from schema import ENUM_FIELDS  # noqa: E402

HERE = Path(__file__).parent
OUT_ROOT = HERE.parent.parent / "vlm-probe-out"
SHOTS = HERE / "shots"

CONFIRMED = "dictated+confirmed"
DISPUTED = "dictated-disputed"


def judge(sidecar, reads, min_reads=2):
    """(basis, per-field verdicts) for one sidecar given blind reads.
    `reads` maps reader name -> {field: value}. Raises ValueError for a digest
    mismatch; returns the sidecar's basis unchanged when evidence is short."""
    if sidecar.get("spec_digest") != craft_spec.current_digest(sidecar):
        raise ValueError("spec changed since render (spec_digest mismatch)")
    fields = [f for f in ENUM_FIELDS if f in sidecar]
    verdicts = {}
    for f in fields:
        got = [r[f] for r in reads.values() if r.get(f) is not None]
        want = sidecar[f]
        if len(got) < min_reads:
            verdict = "undecided"
        elif all(g == want for g in got):
            verdict = "confirmed"
        elif sum(g != want for g in got) * 2 > len(got):
            verdict = "disputed"
        else:
            verdict = "undecided"
        verdicts[f] = {"verdict": verdict, "reads": got}
    kinds = {v["verdict"] for v in verdicts.values()}
    if "disputed" in kinds:
        basis = DISPUTED
    elif fields and kinds == {"confirmed"}:
        basis = CONFIRMED
    else:
        basis = sidecar.get("basis", "dictated")
    return basis, verdicts


def admit_run(run_id, min_reads=2, models=None, shots_dir=SHOTS, out_root=OUT_ROOT):
    """Admit every lane-qualified frame of a probe run, rewriting its sidecar.
    Returns {truth_id: basis, or 'refused: why'}."""
    path = Path(out_root) / run_id / "results.jsonl"
    if not path.exists():
        raise FileNotFoundError(f"no results at {path}")
    by_frame = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        r = json.loads(line)
        if not r.get("ok") or r.get("repeat", 1) != 1:
            continue
        if models and r["model"] not in models:
            continue
        by_frame.setdefault(Path(r["frame"]).stem, {})[r["model"]] = r["parsed"]
    outcome = {}
    for tid, reads in sorted(by_frame.items()):
        lane_shot = craft_spec.split_truth_id(tid)
        if not lane_shot:
            continue
        tp = Path(shots_dir) / lane_shot[0] / f"{lane_shot[1]}.truth.json"
        if not tp.exists():
            continue
        t = json.loads(tp.read_text(encoding="utf-8"))
        if t.get("truth_id") != tid:
            continue
        try:
            basis, verdicts = judge(t, reads, min_reads)
        except ValueError as e:
            outcome[tid] = f"refused: {e}"
            continue
        t["basis"] = basis
        t["_admission"] = {"run": run_id, "min_reads": min_reads,
                           "readers": sorted(reads), "fields": verdicts}
        tp.write_text(json.dumps(t, indent=2) + "\n", encoding="utf-8")
        outcome[tid] = basis
    return outcome


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True)
    ap.add_argument("--min-reads", type=int, default=2)
    ap.add_argument("--models", nargs="*", help="restrict to these readers (default: all in the run)")
    args = ap.parse_args()
    for tid, basis in admit_run(args.run, args.min_reads, args.models).items():
        print(f"{tid}: {basis}")


if __name__ == "__main__":
    main()
