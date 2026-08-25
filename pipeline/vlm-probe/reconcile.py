"""Adjudicate a local model's annotations with a thinking model.

    python reconcile.py --run arcane-prompt-channel --limit 12
    python reconcile.py --run arcane-prompt-channel --annotator qwen3.8:27b

The bake-off left two fields unresolved. `lighting_key` tracked brightness
rather than shadow depth; `lens_impression` returned one constant, then
returned a different constant after steering. Prompt engineering moved the
answers without showing that any of them were right, and with a two-frame
truth set there was nothing to check them against.

This closes that gap from the other side. A reasoning model sees the frame AND
the local annotation, and is asked to correct it field by field. Two things
come out:

1. **Better labels** — the corrected annotation is what enters the corpus.
2. **A truth set that scales.** Every correction is a graded field on a frame
   nobody hand-labelled. The 36-frame corpus becomes 36 × 11 adjudicated
   fields, which is the measurement the whole probe has been missing.

The judge is also asked which fields this frame simply cannot answer. A field
that keeps coming back unanswerable is not a model failure — it is a schema
defect, and it should be cut rather than defended.

Runs on the Claude Code CLI subscription rather than the metered API, so a
whole corpus can be adjudicated without a per-frame bill. Interrupted runs
resume: frames already in reconciled.jsonl are skipped.
"""

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from schema import ENUM_FIELDS, FIELDS, PROMPT, json_schema  # noqa: E402

HERE = Path(__file__).parent
FRAMES_DIR = HERE / "frames"
OUT_ROOT = HERE.parent.parent / "vlm-probe-out"

# Runs through the Claude Code CLI rather than the Anthropic API: the work is
# covered by the existing subscription, so adjudicating a whole corpus costs
# nothing per frame. The CLI reads the image with its own Read tool -- verified
# genuinely viewing it, not inferring from the filename -- and `--json-schema`
# gives the same structured-output guarantee the API's response schema does.
MODEL = "fable"
CLI_TIMEOUT = 300

JUDGE_PROMPT = """You are auditing a machine-generated cinematography annotation \
against the frame it describes. Your corrections become ground truth for a \
training corpus, so being right matters more than being agreeable.

Go field by field. For each one, decide what the frame actually shows and give the \
correct value. Keep the annotator's value when it is right — do not manufacture \
disagreement.

Two fields are known to be unreliable and deserve your attention:

- `lighting_key` is the key-to-fill RATIO, a question about SHADOW DEPTH, not \
brightness. Look at the darkest areas. A bright frame that still falls to true \
black is LOW-key. A dim, evenly lit frame with no true blacks is HIGH-key. The \
annotator has been observed answering brightness here instead.
- `lens_impression` needs a visible cue — edge distortion, stretched foreground, \
compressed background separation. Where the frame shows no such cue the honest \
answer is `indeterminate`. The annotator has been observed defaulting, first to \
`wide-angle` and then, after steering, to `indeterminate` regardless of content.

Also report `unanswerable`: any field this frame genuinely cannot support a \
judgement on. That list is how we find schema defects, so be honest rather than \
completist — a field that is merely hard is not unanswerable.

Describe craft only. Do not name the title, characters or franchise."""


def judge(frame_rel, annotation, schema, model=MODEL):
    """One adjudication through the Claude Code CLI.

    The prompt names a path rather than carrying pixels: the CLI's own Read
    tool opens the image, so nothing is base64'd through an argument list.
    Only Read is allowed -- the judge has no business editing anything, and a
    narrow tool list also means no permission prompt can stall a batch.
    """
    prompt = (
        f"{JUDGE_PROMPT}\n\n"
        f"Read the image file {frame_rel} and look at it carefully.\n\n"
        f"An automated annotator produced this for that frame:\n\n"
        f"{json.dumps(annotation, indent=2)}\n\n"
        f"Audit it field by field and return your verdict."
    )
    r = subprocess.run(
        ["claude", "-p", prompt, "--model", model,
         "--json-schema", json.dumps(schema),
         "--output-format", "json", "--allowedTools", "Read"],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        timeout=CLI_TIMEOUT, cwd=str(HERE))
    if r.returncode != 0:
        raise RuntimeError(f"cli exit {r.returncode}: {(r.stderr or r.stdout)[:200]}")
    env = json.loads(r.stdout)
    if env.get("is_error"):
        raise RuntimeError(f"cli reported error: {str(env.get('result'))[:200]}")
    # `structured_output` is the already-parsed object when the schema holds;
    # `result` is the same JSON as text. Prefer the former, fall back cleanly.
    out = env.get("structured_output")
    if not isinstance(out, dict):
        out = json.loads(env["result"])
    return out, env.get("usage", {}), env.get("total_cost_usd")


def judge_blind(frame_rel, model=MODEL):
    """Annotate from the frame ALONE, never shown the local model's answer.

    The anchored pass asks "is this right?", and a judge shown a candidate
    answer tends to ratify it: measured on this corpus, it kept `indeterminate`
    33/36 while listing that field unanswerable only 4/36, and in 9 frames kept
    a value it declared unanswerable in the same breath. Those numbers are
    agreement with an anchor, not truth.

    A blind annotation has nothing to ratify. Comparing it to the local model's
    answer afterwards is the uncontaminated measurement.
    """
    prompt = (f"{PROMPT}\n\nRead the image file {frame_rel} and look at it "
              f"carefully, then annotate it.")
    r = subprocess.run(
        ["claude", "-p", prompt, "--model", model,
         "--json-schema", json.dumps(json_schema()),
         "--output-format", "json", "--allowedTools", "Read"],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        timeout=CLI_TIMEOUT, cwd=str(HERE))
    if r.returncode != 0:
        raise RuntimeError(f"cli exit {r.returncode}: {(r.stderr or r.stdout)[:200]}")
    env = json.loads(r.stdout)
    if env.get("is_error"):
        raise RuntimeError(f"cli error: {str(env.get('result'))[:200]}")
    out = env.get("structured_output")
    if not isinstance(out, dict):
        out = json.loads(env["result"])
    return out, env.get("usage", {}), env.get("total_cost_usd")


def judge_schema():
    """What the adjudicator must return. Enum fields only — free text is the
    annotator's job, and re-judging prose would cost tokens to measure nothing."""
    return {
        "type": "object",
        "properties": {
            "corrected": {
                "type": "object",
                "properties": {f: dict(FIELDS[f]) for f in ENUM_FIELDS},
                "required": list(ENUM_FIELDS),
                "additionalProperties": False,
            },
            "corrections": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "field": {"type": "string"},
                        "from": {"type": "string"},
                        "to": {"type": "string"},
                        "reason": {"type": "string", "description": "The visual evidence, under 20 words."},
                    },
                    "required": ["field", "from", "to", "reason"],
                    "additionalProperties": False,
                },
            },
            "unanswerable": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Fields this frame genuinely cannot support a judgement on.",
            },
        },
        "required": ["corrected", "corrections", "unanswerable"],
        "additionalProperties": False,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True)
    ap.add_argument("--annotator", default="qwen3.8:27b")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--blind", action="store_true",
                    help="annotate from the frame alone, never shown the local answer. "
                         "The anchored pass cannot validate -- measured 2026-08-25, the "
                         "judge kept a value it simultaneously called unanswerable in 9 "
                         "of 36 frames, and accepted `indeterminate` 33/36 while believing "
                         "the field answerable. Only a blind pass is a truth set.")
    ap.add_argument("--prefix", default="arcane-fights",
                    help="only adjudicate frames whose name starts with this")
    args = ap.parse_args()

    src = OUT_ROOT / args.run / "results.jsonl"
    rows = [json.loads(l) for l in src.read_text(encoding="utf-8").splitlines() if l.strip()]
    rows = [r for r in rows
            if r["model"] == args.annotator and r.get("ok")
            and r["frame"].startswith(args.prefix) and r.get("repeat", 1) == 1]
    if args.limit:
        rows = rows[:args.limit]
    if not rows:
        sys.exit(f"no annotations to adjudicate in {src}")

    out_path = OUT_ROOT / args.run / ("reconciled-blind.jsonl" if args.blind else "reconciled.jsonl")
    print(f"adjudicating {len(rows)} frame(s) with claude-{MODEL} via the Claude Code CLI")
    print(f"  -> {out_path}\n")

    done = set()
    if out_path.exists():
        # Resume rather than re-adjudicate: a 36-frame batch outlives most
        # command timeouts, and re-judging a frame is pure waste.
        for line in out_path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                done.add(json.loads(line)["frame"])
        if done:
            print(f"  ({len(done)} already adjudicated, skipping)")

    schema = judge_schema()
    notional = 0.0
    for n, r in enumerate(rows, 1):
        if r["frame"] in done:
            continue
        annotation = {f: r["parsed"].get(f) for f in ENUM_FIELDS}
        t0 = time.time()
        try:
            if args.blind:
                verdict, usage, cost = judge_blind(f"frames/{r['frame']}")
            else:
                verdict, usage, cost = judge(f"frames/{r['frame']}", annotation, schema)
        except Exception as e:
            print(f"  [{n:2d}/{len(rows)}] {r['frame']:24s} FAILED: {str(e)[:90]}")
            continue
        notional += cost or 0.0

        rec = {
            "frame": r["frame"], "annotator": args.annotator, "judge": MODEL,
            "latency_s": round(time.time() - t0, 1),
            "annotation": annotation, **verdict,
        }
        with out_path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")

        if args.blind:
            diff = [f for f in ENUM_FIELDS
                    if f in annotation and verdict.get(f) != annotation.get(f)]
            print(f"  [{n:2d}/{len(rows)}] {r['frame']:24s} differs on {len(diff):2d}/{len(annotation)}"
                  f"  {', '.join(diff[:4])}")
        else:
            fixed = ", ".join(f"{c['field']}:{c['from']}->{c['to']}" for c in verdict["corrections"][:3])
            print(f"  [{n:2d}/{len(rows)}] {r['frame']:24s} {len(verdict['corrections'])} corrections"
                  f"{'  ' + fixed if fixed else ''}")

    # Reported for scale intuition only -- this runs on the CLI subscription,
    # so it is not a bill.
    print(f"\nnotional API-equivalent cost ${notional:.2f} (subscription-billed, not charged)")
    print(f"written -> {out_path}")


if __name__ == "__main__":
    main()
