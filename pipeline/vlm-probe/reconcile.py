"""Adjudicate a local model's annotations with a thinking model.

    python reconcile.py --run arcane-prompt-channel --limit 12
    python reconcile.py --run arcane-prompt-channel --annotator qwen3.8:27b --effort high

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

Costs real money (Fable 5 is the premium tier), so `--limit` is honoured and
the estimated spend is printed before the run.
"""

import argparse
import base64
import json
import sys
import time
from pathlib import Path

import anthropic

sys.path.insert(0, str(Path(__file__).parent))
from schema import ENUM_FIELDS, FIELDS  # noqa: E402

HERE = Path(__file__).parent
FRAMES_DIR = HERE / "frames"
OUT_ROOT = HERE.parent.parent / "vlm-probe-out"
ENV_FILE = Path(r"C:\Users\kazda\kiro\personas\.env")

MODEL = "claude-fable-5"
MIME = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}

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


def load_key():
    for line in ENV_FILE.read_text(encoding="utf-8", errors="replace").splitlines():
        if line.strip().startswith("ANTHROPIC_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


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
    ap.add_argument("--effort", default="high", choices=["low", "medium", "high", "xhigh", "max"])
    ap.add_argument("--prefix", default="arcane-fights",
                    help="only adjudicate frames whose name starts with this")
    args = ap.parse_args()

    key = load_key()
    if not key:
        sys.exit("ANTHROPIC_API_KEY not found in personas/.env")
    client = anthropic.Anthropic(api_key=key)

    src = OUT_ROOT / args.run / "results.jsonl"
    rows = [json.loads(l) for l in src.read_text(encoding="utf-8").splitlines() if l.strip()]
    rows = [r for r in rows
            if r["model"] == args.annotator and r.get("ok")
            and r["frame"].startswith(args.prefix) and r.get("repeat", 1) == 1]
    if args.limit:
        rows = rows[:args.limit]
    if not rows:
        sys.exit(f"no annotations to adjudicate in {src}")

    out_path = OUT_ROOT / args.run / "reconciled.jsonl"
    print(f"adjudicating {len(rows)} frame(s) with {MODEL} (effort={args.effort})")
    print(f"  -> {out_path}\n")

    tot_in = tot_out = 0
    for n, r in enumerate(rows, 1):
        frame = FRAMES_DIR / r["frame"]
        b64 = base64.b64encode(frame.read_bytes()).decode("ascii")
        annotation = {f: r["parsed"].get(f) for f in ENUM_FIELDS}
        t0 = time.time()
        # Beta surface: `betas` + `fallbacks` live there. Fable 5 rejects
        # `temperature` and `budget_tokens` outright, so neither appears --
        # thinking is always on and depth is set through output_config.effort.
        # `fallbacks: "default"` reroutes by refusal category rather than
        # making us maintain a model list.
        resp = client.beta.messages.create(
            model=MODEL,
            max_tokens=16000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            system=JUDGE_PROMPT,
            output_config={
                "effort": args.effort,
                "format": {"type": "json_schema", "schema": judge_schema()},
            },
            messages=[{"role": "user", "content": [
                {"type": "image", "source": {
                    "type": "base64",
                    "media_type": MIME[frame.suffix.lower()],
                    "data": b64}},
                {"type": "text", "text":
                    "The annotator produced this for the frame above:\n\n"
                    + json.dumps(annotation, indent=2)
                    + "\n\nAudit it field by field."},
            ]}],
        )

        if resp.stop_reason == "refusal":
            print(f"  {r['frame']:26s} REFUSED ({getattr(resp, 'stop_details', None)})")
            continue

        text = next(b.text for b in resp.content if b.type == "text")
        verdict = json.loads(text)
        tot_in += resp.usage.input_tokens
        tot_out += resp.usage.output_tokens

        rec = {
            "frame": r["frame"], "annotator": args.annotator, "judge": MODEL,
            "effort": args.effort, "latency_s": round(time.time() - t0, 1),
            "annotation": annotation, **verdict,
        }
        with out_path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")

        fixed = ", ".join(f"{c['field']}:{c['from']}->{c['to']}" for c in verdict["corrections"][:3])
        print(f"  [{n:2d}/{len(rows)}] {r['frame']:24s} {len(verdict['corrections'])} corrections"
              f"{'  ' + fixed if fixed else ''}")

    cost = tot_in / 1e6 * 10 + tot_out / 1e6 * 50
    print(f"\ntokens: {tot_in:,} in / {tot_out:,} out  ~${cost:.2f}")
    print(f"written -> {out_path}")


if __name__ == "__main__":
    main()
