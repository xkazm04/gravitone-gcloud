"""Acquire a style from a best-in-class source: readback -> catalogue entry.

    python acquire.py --list
    python acquire.py --source lotr-scene --id epic-film-naturalistic --name "Epic Film Naturalistic" --family cinematic
    python acquire.py --source matrix-bullets --id green-tint-noir --name "Green-Tint Noir" --family cinematic --model qwen3.8:27b

This is the registry's style-onboarding-from-sample, made into a command. A
multi-frame readback (../vlm-probe/style.py) has already described each
corpus source in the observable vocabulary and written an `imitable_recipe`;
this turns one such readback into a `candidate` entry in styles.json -- the
observables become the measurable half, the recipe the generator-facing half.

Two rules carried over from the technique:

- **The readback is a hypothesis, not the style.** The entry lands as
  `candidate` with `origin.kind = readback`, and the recipe is meant to be
  edited by hand before the forge tests it. The source frames never become
  references; only words cross over.
- **Never overwrite an entry that has evidence.** A style the cull has judged
  is a record; re-acquiring it would erase what was learned. Pass --force to
  replace an entry that has no evidence yet.

Readbacks are read from vlm-probe-out/style/style.jsonl. If a source has been
read by more than one model, the newest row for --model wins (default: the
frontier model, whose recipes were concrete enough to transfer in the dry run;
the local model tends to describe mood rather than surface).
"""

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
STYLES = HERE / "styles.json"
READBACKS = HERE.parent.parent / "vlm-probe-out" / "style" / "style.jsonl"

OBSERVABLE_FIELDS = ["render_mode", "detail_density", "surface_realism", "atmospherics",
                     "palette_strategy", "black_handling", "edge_treatment"]

DEFAULT_NEGATIVE = "text, watermark, logo, caption, border"


def readbacks():
    if not READBACKS.exists():
        sys.exit(f"no readbacks at {READBACKS} -- run ../vlm-probe/style.py first")
    rows = [json.loads(l) for l in READBACKS.read_text(encoding="utf-8").splitlines() if l.strip()]
    return [r for r in rows if r.get("ok") and isinstance(r.get("parsed"), dict)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true", help="show every readback available")
    ap.add_argument("--source", help="corpus slug, e.g. lotr-scene")
    ap.add_argument("--id", help="catalogue id, kebab-case")
    ap.add_argument("--name")
    ap.add_argument("--family", default="cinematic")
    ap.add_argument("--model", default="gemini-3.7-flash")
    ap.add_argument("--negative", default=None)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    rows = readbacks()
    if args.list:
        for r in rows:
            p = r["parsed"]
            print(f"{r['source']:24s} {r['model']:18s} {p['render_mode']:20s} {p['palette_strategy']:26s} {p['signature'][:70]}")
        return
    if not (args.source and args.id and args.name):
        sys.exit("--source, --id and --name are required (or --list)")

    hit = [r for r in rows if r["source"] == args.source and r["model"] == args.model]
    if not hit:
        models = sorted({r["model"] for r in rows if r["source"] == args.source})
        sys.exit(f"no readback of {args.source} by {args.model}; available models: {models or 'none'}")
    p = hit[-1]["parsed"]

    cat = json.loads(STYLES.read_text(encoding="utf-8"))
    existing = next((s for s in cat["styles"] if s["id"] == args.id), None)
    if existing:
        if existing.get("evidence"):
            sys.exit(f"{args.id} already has {len(existing['evidence'])} evidence row(s); refusing to overwrite a judged style")
        if not args.force:
            sys.exit(f"{args.id} exists (no evidence yet); pass --force to replace it")
        cat["styles"] = [s for s in cat["styles"] if s["id"] != args.id]

    entry = {
        "id": args.id,
        "name": args.name,
        "family": args.family,
        "status": "candidate",
        "origin": {"kind": "readback", "source": args.source, "models": [args.model],
                   "signature": p.get("signature", "")},
        "observables": {f: p[f] for f in OBSERVABLE_FIELDS if f in p},
        "recipe": p["imitable_recipe"].strip(),
        "negative": args.negative or DEFAULT_NEGATIVE,
        "evidence": [],
    }
    cat["styles"].append(entry)
    STYLES.write_text(json.dumps(cat, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"acquired {args.id} from {args.source} ({args.model}) as candidate")
    print(f"  observables: {entry['observables']}")
    print(f"  recipe: {entry['recipe']}")
    print("  edit the recipe in styles.json before forging -- the readback is a hypothesis")


if __name__ == "__main__":
    main()
