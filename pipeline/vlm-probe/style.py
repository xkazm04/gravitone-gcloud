"""Extract an art-style profile from SEVERAL frames of one source at once.

    python style.py --models qwen3.8:27b gemini-3.7-flash
    python style.py --only wow-shadowlands --frames-per-source 8

Why this is a separate pass rather than another craft field.

The per-frame schema already carries `texture`, and across six sources it
collapsed: `glossy-cg` on 86-93% of frames for four of them. That is not a
sample-size problem and more frames will not fix it. Style is a property of the
**source**, not of a frame -- one frame of a stylised film and one frame of a
photoreal one can look identical, and the difference only appears in what stays
constant across a set. Asking per-frame asks a question the frame cannot answer,
so the model falls back to a default. Show it eight frames and ask once.

It is also ~30x cheaper: one call per source instead of one per frame.

Everything is phrased as an **observable**, never a judgement. `lighting_key`
became a brightness detector and `lens_impression` went inert precisely because
they asked for a term of art where the model could only see a property. There
is deliberately no `quality` or `fidelity` field -- those are composed from
detail density, surface realism and edge treatment afterwards, in code.

The payoff field is `imitable_recipe`: the point of a style library is not to
name a look but to be able to ask a generator for it again.
"""

import argparse
import base64
import json
import sys
import time
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from probe import (GEMINI_BASE, OLLAMA, extract_json, load_env,  # noqa: E402
                   post)

HERE = Path(__file__).parent
FRAMES_DIR = HERE / "frames"
OUT_ROOT = HERE.parent.parent / "vlm-probe-out"
CORPUS = HERE / "corpus.json"

RENDER_MODE = ["photographic", "photoreal-cg", "stylised-realistic",
               "painterly", "cel-shaded", "graphic-abstract"]
DETAIL_DENSITY = ["sparse", "moderate", "dense", "hyper-dense"]
SURFACE_REALISM = ["flat", "simplified", "plausible", "physically-convincing"]
ATMOSPHERICS = ["none", "light-haze", "heavy-haze", "particulate", "volumetric-shafts"]
PALETTE_STRATEGY = ["monochrome", "duotone", "complementary-split",
                    "desaturated-naturalistic", "saturated-vivid", "warm-cool-split"]
BLACK_HANDLING = ["crushed", "deep-neutral", "lifted-milky"]
EDGE_TREATMENT = ["crisp", "soft", "bloom-heavy", "diffused"]
MOTION_TREATMENT = ["frozen-crisp", "motion-blur", "strobed", "mixed"]


def _enum(v, d):
    return {"type": "string", "enum": list(v), "description": d}


FIELDS = {
    "render_mode": _enum(RENDER_MODE, "How the images are made, judged from surfaces and edges rather than subject matter."),
    "detail_density": _enum(DETAIL_DENSITY, "How much incidental detail fills the frame -- set dressing, wear, background business."),
    "surface_realism": _enum(SURFACE_REALISM, "How convincingly materials behave: skin, metal, cloth, stone."),
    "atmospherics": _enum(ATMOSPHERICS, "Particulate and haze in the air across these frames."),
    "palette_strategy": _enum(PALETTE_STRATEGY, "How colour is organised across the set."),
    "black_handling": _enum(BLACK_HANDLING, "What happens in the darkest areas."),
    "edge_treatment": _enum(EDGE_TREATMENT, "How edges and highlights resolve."),
    "motion_treatment": _enum(MOTION_TREATMENT, "How movement is rendered where visible."),
    "consistency_across_frames": _enum(
        ["uniform", "mostly-uniform", "varied"],
        "Whether these frames look like one production. A source whose own style varies is a finding."),
    "signature": {"type": "string", "description": "What makes this look distinctive, under 25 words. Name properties, not titles or franchises."},
    "imitable_recipe": {"type": "string", "description": "How you would instruct an image generator to reproduce this look, under 40 words. Concrete visual instructions only -- no proper nouns, no studio or franchise names."},
}
REQUIRED = list(FIELDS)


def json_schema():
    return {"type": "object", "properties": FIELDS, "required": REQUIRED,
            "additionalProperties": False}


def gemini_schema():
    return {"type": "object", "properties": {k: dict(v) for k, v in FIELDS.items()},
            "required": REQUIRED, "propertyOrdering": REQUIRED}


PROMPT = """You are profiling the ART STYLE of a production from several frames \
taken from it.

Judge the frames as a SET. You are describing what is constant across them -- the \
house look -- not what any single frame contains. Ignore subject matter entirely: \
two frames can share a subject and have nothing in common stylistically, and the \
reverse is just as true.

Describe only observable properties: how surfaces resolve, how much incidental \
detail fills the frame, what happens in the darkest areas, how edges and \
highlights behave, what is suspended in the air. Do not rate quality, and do not \
name the title, studio or franchise.

`imitable_recipe` is the field that matters most: write what you would tell an \
image generator to get this look back. Concrete visual instructions, no proper \
nouns."""


def run_ollama_multi(model, b64s):
    body = {"model": model,
            "messages": [{"role": "user", "content": PROMPT, "images": b64s}],
            "format": json_schema(), "stream": False,
            "options": {"temperature": 0, "num_ctx": 16384}}
    try:
        r = post(f"{OLLAMA}/api/chat", dict(body, think=False))
    except Exception:
        r = post(f"{OLLAMA}/api/chat", body)
    return r["message"]["content"]


def run_gemini_multi(model, b64s, api_key):
    parts = [{"text": PROMPT}]
    for b in b64s:
        parts.append({"inline_data": {"mime_type": "image/jpeg", "data": b}})
    body = {"contents": [{"parts": parts}],
            "generationConfig": {"temperature": 0,
                                 "responseMimeType": "application/json",
                                 "responseSchema": gemini_schema()}}
    r = post(f"{GEMINI_BASE}/{model}:generateContent", body,
             headers={"x-goog-api-key": api_key})
    cand = r["candidates"][0]
    return "".join(p.get("text", "") for p in cand["content"]["parts"])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", nargs="*", default=["qwen3.8:27b", "gemini-3.7-flash"])
    ap.add_argument("--only", nargs="*", default=None)
    ap.add_argument("--frames-per-source", type=int, default=8)
    ap.add_argument("--run-id", default="style")
    args = ap.parse_args()

    env = load_env()
    api_key = env.get("GEMINI_API_KEY")

    # Group the published frames by their source slug.
    by_source = defaultdict(list)
    for p in sorted(FRAMES_DIR.glob("*.jpg")):
        slug = p.stem.rsplit("-", 1)[0]
        by_source[slug].append(p)
    if args.only:
        by_source = {k: v for k, v in by_source.items() if k in args.only}
    if not by_source:
        sys.exit("no frames found -- run survey.py --publish first")

    out_dir = OUT_ROOT / args.run_id
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "style.jsonl"

    for slug, paths in sorted(by_source.items()):
        # Spread the sample across the runtime, so a single sequence cannot
        # stand in for the whole production's look.
        n = min(args.frames_per_source, len(paths))
        step = len(paths) / n
        picked = [paths[int(i * step)] for i in range(n)]
        b64s = [base64.b64encode(p.read_bytes()).decode("ascii") for p in picked]

        for model in args.models:
            t0 = time.time()
            row = {"source": slug, "model": model, "frames": len(b64s),
                   "frame_names": [p.name for p in picked]}
            try:
                if model.startswith("gemini"):
                    if not api_key:
                        raise RuntimeError("GEMINI_API_KEY missing")
                    text = run_gemini_multi(model, b64s, api_key)
                else:
                    text = run_ollama_multi(model, b64s)
                row["latency_s"] = round(time.time() - t0, 1)
                row["parsed"] = extract_json(text)
                row["ok"] = True
                p = row["parsed"]
                print(f"  {slug:22s} {model:18s} {row['latency_s']:5.1f}s  "
                      f"{p.get('render_mode')}/{p.get('detail_density')}/"
                      f"{p.get('surface_realism')}")
            except Exception as e:
                row["ok"] = False
                row["error"] = f"{type(e).__name__}: {e}"
                row["latency_s"] = round(time.time() - t0, 1)
                print(f"  {slug:22s} {model:18s} FAILED {str(e)[:80]}")
            with out_path.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(row, ensure_ascii=False) + "\n")

    print(f"\nwritten -> {out_path}")


if __name__ == "__main__":
    main()
