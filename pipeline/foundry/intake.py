"""Take a folder of screenshots into the foundry: frames -> readback -> plan.

    python intake.py "C:/shots/mygame" --slug mygame
    python intake.py "C:/shots/mygame" --slug mygame --acquire --name "My Game Look"
    python intake.py "C:/shots/mygame" --slug mygame --plan --scenes 5

One command for the loop the next runs will repeat: the operator drops ~10
screenshots of one production somewhere, and this

 1. **publishes** them as frames — copied into ../vlm-probe/frames/ as
    <slug>-NNN.jpg, long edge capped at 1280 (vision encoders tile anyway,
    and bytes are upload time);
 2. **reads the style back** as a SET (style.py's multi-frame pass — style is
    a property of the source, not of a frame) and appends the row to
    vlm-probe-out/style/style.jsonl where acquire.py looks;
 3. with --acquire, turns that readback into a `candidate` catalogue entry
    (same rules as acquire.py: hand-edit the recipe before forging);
 4. with --plan, writes plans/<slug>.json crossing the screenshots as scenes
    against the catalogue — which is both halves of the next question at
    once: do OUR styles fit this scenario, and does ITS OWN extracted style
    survive on its own scenes?

The readback defaults to the frontier model over HTTP (GEMINI_API_KEY from
personas/.env) precisely so it can run while ComfyUI holds the card — a forge
can be mid-sweep and intake still works. Pass --model qwen3.8:27b to use the
local eye instead (needs the card).

Scene notes are left empty on purpose: the forge's stage 0 annotates every
scene with the craft schema, and inventing a note here would just be a worse
annotation. The per-scene craft chips on /foundry come from stage 0.
"""

import argparse
import base64
import json
import re
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).parent
PROBE = HERE.parent / "vlm-probe"
sys.path.insert(0, str(PROBE))

import style as style_mod  # noqa: E402
from probe import load_env  # noqa: E402

FRAMES_DIR = PROBE / "frames"
STYLE_OUT = HERE.parent.parent / "vlm-probe-out" / "style" / "style.jsonl"
STYLES = HERE / "styles.json"
PLANS = HERE / "plans"

EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def publish(folder: Path, slug: str, max_width=1280):
    """Copy screenshots in as <slug>-NNN.jpg, capped and letterbox left alone
    (forge crops letterbox per scene at plan time)."""
    from PIL import Image
    srcs = sorted(p for p in folder.iterdir() if p.suffix.lower() in EXTS)
    if not srcs:
        sys.exit(f"no images in {folder}")
    existing = sorted(FRAMES_DIR.glob(f"{slug}-[0-9][0-9][0-9].jpg"))
    if existing:
        print(f"  note: {len(existing)} frame(s) already published under '{slug}-'; adding after them")
    # THE NEXT INDEX IS THE HIGHEST ONE TAKEN, NOT HOW MANY ARE LEFT.
    #
    # This counted. Delete one bad screenshot from a published set and the count
    # no longer matches the highest index, so the next publish reuses a number
    # that is still on disk and overwrites it -- while printing "adding after
    # them". Plans reference frames by NAME, so that is not a collision anyone
    # sees: it is a plan that quietly points at a different picture, and the
    # forge then annotates and grades the wrong source.
    #
    # Measured: publish 5, delete 003, publish 2 more -> mygame-005.jpg came
    # back with different pixels under the same name.
    n = max((int(p.stem.rsplit("-", 1)[1]) for p in existing), default=0)
    out = []
    for p in srcs:
        n += 1
        dest = FRAMES_DIR / f"{slug}-{n:03d}.jpg"
        im = Image.open(p).convert("RGB")
        if im.width > max_width:
            im = im.resize((max_width, round(im.height * max_width / im.width)))
        im.save(dest, quality=90)
        out.append(dest)
        print(f"  {p.name} -> {dest.name}  ({im.width}x{im.height})")
    return out


def readback(frames, slug, model):
    """One multi-frame style pass over the published frames, appended to the
    same jsonl style.py writes, so acquire.py needs nothing new."""
    b64s = [base64.b64encode(p.read_bytes()).decode("ascii") for p in frames]
    t0 = time.time()
    if model.startswith("gemini"):
        key = load_env().get("GEMINI_API_KEY")
        if not key:
            sys.exit("GEMINI_API_KEY missing from personas/.env -- pass --model qwen3.8:27b to use the local eye (needs the GPU)")
        text = style_mod.run_gemini_multi(model, b64s, key)
    else:
        text = style_mod.run_ollama_multi(model, b64s)
    parsed = json.loads(text)
    row = {"source": slug, "model": model, "frames": len(frames),
           "frame_names": [p.name for p in frames],
           "latency_s": round(time.time() - t0, 1), "parsed": parsed, "ok": True}
    STYLE_OUT.parent.mkdir(parents=True, exist_ok=True)
    with STYLE_OUT.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(f"  readback by {model} in {row['latency_s']}s:")
    print(f"    signature: {parsed.get('signature', '')}")
    print(f"    recipe:    {parsed.get('imitable_recipe', '')}")
    return row


def write_plan(slug, frames, style_ids, scenes_cap):
    picked = frames[:scenes_cap] if scenes_cap else frames
    if scenes_cap and len(frames) > scenes_cap:
        print(f"  plan uses the first {scenes_cap} of {len(frames)} screenshots -- pick different ones by editing the plan")
    plan = {
        "id": slug,
        "_purpose": f"Intake sweep for '{slug}': the operator's screenshots as scenes, crossed against the catalogue. "
                    "Answers both directions at once -- which existing styles fit this scenario, and whether the "
                    "style extracted FROM these screenshots survives on its own scenes.",
        "scenes": [{"id": f"{slug}-{p.stem.rsplit('-', 1)[1]}", "frame": p.name, "note": ""} for p in picked],
        "styles": style_ids,
        "mechanisms": [
            {"id": "text", "reference": False, "label": "words only"},
            {"id": "ref-early", "reference": True, "window": 0.35,
             "label": "source frame conditions the first 35% of the denoise"},
        ],
        "seeds": [20260826],
        "steps": 20,
    }
    PLANS.mkdir(exist_ok=True)
    dest = PLANS / f"{slug}.json"
    dest.write_text(json.dumps(plan, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    n = len(plan["scenes"]) * len(style_ids) * 2
    print(f"  wrote {dest.name}: {len(plan['scenes'])} scenes x {len(style_ids)} styles x 2 = {n} candidates (~{n*2.5:.0f} min)")
    return dest


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("folder", help="directory of screenshots")
    ap.add_argument("--slug", required=True, help="kebab-case source name, e.g. mygame-reveal")
    ap.add_argument("--model", default="gemini-3.7-flash",
                    help="readback model; gemini runs over HTTP and does not touch the GPU")
    ap.add_argument("--no-readback", action="store_true", help="publish frames only")
    ap.add_argument("--acquire", action="store_true", help="also add the readback to styles.json as a candidate")
    ap.add_argument("--name", help="catalogue display name (with --acquire)")
    ap.add_argument("--family", default="game")
    ap.add_argument("--plan", action="store_true", help="also write plans/<slug>.json")
    ap.add_argument("--styles", nargs="*", default=None,
                    help="style ids for the plan (default: whole catalogue, plus the acquired one)")
    ap.add_argument("--scenes", type=int, default=5,
                    help="cap scenes in the plan (0 = all screenshots); 5 scenes x 10 styles x 2 is already 100 cells")
    args = ap.parse_args()

    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", args.slug):
        sys.exit("--slug must be kebab-case: lowercase letters, digits, dashes")

    print(f"publishing {args.folder} as '{args.slug}'")
    frames = publish(Path(args.folder), args.slug)

    if not args.no_readback:
        readback(frames, args.slug, args.model)

    if args.acquire:
        if args.no_readback:
            sys.exit("--acquire needs the readback")
        cmd = [sys.executable, str(HERE / "acquire.py"), "--source", args.slug,
               "--id", args.slug, "--name", args.name or args.slug,
               "--family", args.family, "--model", args.model]
        r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
        print(r.stdout.strip() or r.stderr.strip())
        if r.returncode != 0:
            sys.exit(r.returncode)

    if args.plan:
        cat = json.loads(STYLES.read_text(encoding="utf-8"))
        ids = args.styles or [s["id"] for s in cat["styles"]]
        unknown = [i for i in ids if i not in {s["id"] for s in cat["styles"]}]
        if unknown:
            sys.exit(f"unknown style ids: {unknown}")
        dest = write_plan(args.slug, frames, ids, args.scenes)
        print(f"\nnext:  python forge.py {dest.relative_to(HERE)} "
              f"   (detached if long: Start-Process python -ArgumentList '-u','forge.py','plans/{args.slug}.json')")


if __name__ == "__main__":
    main()
