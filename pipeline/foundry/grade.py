"""Automatic pre-grading of a foundry candidate -- the filter before the human.

Two questions per candidate, two small schemas, two calls (the registry's
grading rule: keep a schema under about seven fields or the grader answers
every question shallowly; if you need more, run two passes).

1. CRAFT -- did the shot survive? The candidate is re-annotated with the
   vlm-probe craft schema (unchanged, one schema for every model) and scored
   field by field against the SOURCE frame's annotation with the same
   partial-credit scale replicate.py uses. This is the beat-mastery half:
   whether "full shot, low angle, keyed hard from the side" carried through
   the restyle.

2. STYLE + VETO -- did the look arrive, and is the image usable at all? A
   seven-field readback in the style.py vocabulary, compared enum-for-enum
   against the target style's `observables`. `has_text` is the veto: a plate
   with letters in it is unusable whatever else it does (the studio draws
   its own text), so it is the first field and the gate short-circuits on it.

Every grade records who graded it. A candidate that could not be graded is
`unmeasured`, never a pass -- the ledger counts those separately.
"""

import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
PROBE = HERE.parent / "vlm-probe"
sys.path.insert(0, str(PROBE))

import style as style_mod  # noqa: E402
from probe import OLLAMA, post  # noqa: E402
from replicate import CRAFT_FIELDS, credit  # noqa: E402

# The observables a single image can answer. `motion_treatment` and
# `consistency_across_frames` are set-level questions and are left out.
STYLE_ENUMS = ["render_mode", "palette_strategy", "edge_treatment", "black_handling"]

STYLE_FIELDS = {
    "has_text": {"type": "boolean",
                 "description": "TRUE if any letters, numbers, words, logos, captions or watermark-like marks are visible anywhere in the image. Look at every edge and corner."},
    "render_mode": style_mod.FIELDS["render_mode"],
    "palette_strategy": style_mod.FIELDS["palette_strategy"],
    "edge_treatment": style_mod.FIELDS["edge_treatment"],
    "black_handling": style_mod.FIELDS["black_handling"],
    "dominant_colours": {"type": "array", "items": {"type": "string"}, "maxItems": 4,
                         "description": "Two to four dominant colours as plain lowercase colour names."},
    "depiction": {"type": "string",
                  "description": "One sentence, under 25 words, of what is actually depicted -- figures, their action, the place. Only what you can see."},
}
STYLE_REQUIRED = list(STYLE_FIELDS)

STYLE_PROMPT = """You are grading ONE generated image. Answer only about what you can \
actually see in it -- never what a brief might have asked for.

Report the observable properties of how the image is rendered: how surfaces and \
edges resolve, how colour is organised, what happens in the darkest areas. Do not \
rate quality. Do not name titles, studios or franchises.

`has_text` is the most important field: inspect every edge and corner for letters, \
numbers, logos or watermark marks and answer TRUE if any exist."""


def style_schema():
    return {"type": "object", "properties": STYLE_FIELDS, "required": STYLE_REQUIRED,
            "additionalProperties": False}


def run_style_readback(model, b64):
    body = {"model": model,
            "messages": [{"role": "user", "content": STYLE_PROMPT, "images": [b64]}],
            "format": style_schema(), "stream": False,
            "options": {"temperature": 0, "num_ctx": 8192}}
    try:
        r = post(f"{OLLAMA}/api/chat", dict(body, think=False))
    except Exception:
        r = post(f"{OLLAMA}/api/chat", body)
    return r["message"]["content"]


def craft_score(source_annotation, candidate_annotation):
    """Per-field credit over the craft fields the source actually carries."""
    per = {f: credit(f, candidate_annotation.get(f), source_annotation.get(f))
           for f in CRAFT_FIELDS
           if source_annotation.get(f) is not None and f != "texture"}
    if not per:
        return None, {}
    return round(sum(per.values()) / len(per), 3), per


def style_score(observables, readback):
    """Fraction of the style's declared observables the candidate reads back as."""
    per = {}
    for f in STYLE_ENUMS:
        want = observables.get(f)
        if want is None:
            continue
        per[f] = 1.0 if readback.get(f) == want else 0.0
    if not per:
        return None, {}
    return round(sum(per.values()) / len(per), 3), per


def parse(text):
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start >= 0 and end > start:
            return json.loads(text[start:end + 1])
        raise
