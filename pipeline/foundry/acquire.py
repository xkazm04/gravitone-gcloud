"""Acquire a style from a best-in-class source: readback -> catalogue entry.

    python acquire.py --list
    python acquire.py --source lotr-scene --id epic-film-naturalistic --name "Epic Film Naturalistic" --family cinematic
    python acquire.py --source matrix-bullets --id green-tint-noir --name "Green-Tint Noir" --family cinematic --model qwen3.8:27b

This is the registry's style-onboarding-from-sample, made into a command. A
multi-frame readback (../vlm-probe/style.py) has already described each
corpus source in the observable vocabulary and written an `imitable_recipe`;
this turns one such readback into a `candidate` style in the kernel store -- the
observables become the measurable half, the recipe the generator-facing half --
and re-exports pipeline/foundry/styles.json from the store (Phase 5: the store
is the catalogue's truth, the file its export for the Python readers).

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
# The kernel's Python doors (packages/kernel/py), appended BEHIND this folder's own modules.
sys.path.append(str(HERE.parent.parent / "packages" / "kernel" / "py"))
from kernel_store import StoreError, store_location  # noqa: E402
from styles import StyleRefused, Styles, ensure_styles  # noqa: E402
READBACKS = HERE.parent.parent / "vlm-probe-out" / "style" / "style.jsonl"

OBSERVABLE_FIELDS = ["render_mode", "detail_density", "surface_realism", "atmospherics",
                     "palette_strategy", "black_handling", "edge_treatment"]

DEFAULT_NEGATIVE = "text, watermark, logo, caption, border"


def cell(parsed, field, width):
    """One listing column, present or not. See the note in main()'s --list."""
    return str(parsed.get(field) or "-")[:width].ljust(width)


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
        # ONE OLD ROW MUST NOT HIDE EVERY ROW AFTER IT. style.jsonl is
        # append-only across model and schema versions -- readbacks() already
        # says so by filtering for `ok` and for `parsed` being a dict -- so a
        # row written under a different field set is the ordinary case, not an
        # exotic one. Indexing three keys raw meant the first such row raised
        # a KeyError mid-listing: the operator saw a partial catalogue with no
        # sign it was partial, and --list is exactly how they choose the
        # --source they type next.
        for r in rows:
            p = r["parsed"]
            print(f"{r['source']:24s} {r['model']:18s} {cell(p, 'render_mode', 20)} "
                  f"{cell(p, 'palette_strategy', 26)} {str(p.get('signature') or '-')[:70]}")
        return
    if not (args.source and args.id and args.name):
        sys.exit("--source, --id and --name are required (or --list)")

    hit = [r for r in rows if r["source"] == args.source and r["model"] == args.model]
    if not hit:
        models = sorted({r["model"] for r in rows if r["source"] == args.source})
        sys.exit(f"no readback of {args.source} by {args.model}; available models: {models or 'none'}")
    p = hit[-1]["parsed"]
    # And the same heterogeneity, one step later: `imitable_recipe` is the one
    # field this command cannot substitute for -- it IS the entry -- so a row
    # that predates it (or lost it to a truncated answer) must be named, not
    # raised as a KeyError from the middle of building the entry.
    if not str(p.get("imitable_recipe") or "").strip():
        sys.exit(f"the {args.model} readback of {args.source} carries no `imitable_recipe` -- "
                 "re-read the source with ../vlm-probe/style.py before acquiring it")

    # THE WRITE GOES THROUGH THE STORE'S DOOR (packages/kernel/py/styles.py): one transaction
    # holds the read of the existing entry, the refusal rules and the write, under SQLite's
    # write lock - the fence catalogue_lock.py used to build around styles.json by hand. Then
    # the export, so forge.py's next `prepare` reads the style this just added.
    try:
        store = Styles(ensure_styles(store_location()))
        entry = acquire_entry(args, p, store)
        store.export(STYLES)
    except (StyleRefused, StoreError) as e:
        sys.exit(str(e))
    print(f"acquired {args.id} from {args.source} ({args.model}) as candidate")
    print(f"  observables: {entry['observables']}")
    print(f"  recipe: {entry['recipe']}")
    print("  edit the recipe in styles.json, then `node pipeline/import/styles.mts --yes`, before forging -- the readback is a hypothesis")


def acquire_entry(args, p, store):
    """Build the entry and land it through the door. The door refuses a judged style always and
    an unjudged one without --force, in the words this command always used."""
    entry = {
        "id": args.id,
        "name": args.name,
        "family": args.family,
        "origin": {"kind": "readback", "source": args.source, "models": [args.model],
                   "signature": p.get("signature", "")},
        "observables": {f: p[f] for f in OBSERVABLE_FIELDS if p.get(f)},
        "recipe": p["imitable_recipe"].strip(),
        "negative": args.negative or DEFAULT_NEGATIVE,
    }
    store.put_readback(entry, force=args.force, by="acquire.py")
    return entry


if __name__ == "__main__":
    main()
