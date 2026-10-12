"""The annotation schema every model under test must fill.

This is the contract of the probe: one frame in, one FrameAnnotation out.
The controlled vocabularies are lifted verbatim from the ai-registry
`media-generation / visual-generation / cinematic-language` subject, so an
annotation that validates here is already registry-shaped -- shot ladder,
angle attitudes, lens effect language, lighting dials and the thirteen
genre contracts. That is deliberate: the probe measures whether a local
model can speak the vocabulary we already decided to think in.

Free-text fields are kept short on purpose. A 9B model that is asked for a
paragraph will write a paragraph and hide its errors inside it; asked for a
noun phrase, it either knows or it visibly does not.
"""

# --- controlled vocabularies (closed sets: scoreable, no fuzzy matching) ---
#
# They live in pipeline/vocab/cinematography.json, with the measured reason each
# value exists, and are read here -- not re-declared. Edit the file (and bump its
# `version`), never a literal in this module; pipeline/check-vocab.mjs holds it.

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "vocab"))
import vocab  # noqa: E402


# --- the schema itself ---------------------------------------------------
# `propertyOrdering` matters: models answer in order, so the cheap
# observations come first and the interpretive calls last, after the model
# has already committed to what it can see. The order is the file's
# `craft_frame` subset.

FIELDS = vocab.schema_props("craft_frame")

REQUIRED = list(FIELDS.keys())

# Fields scored by exact match against ground truth / reference.
ENUM_FIELDS = [k for k, v in FIELDS.items() if "enum" in v]
TEXT_FIELDS = [k for k, v in FIELDS.items() if v.get("type") == "string" and "enum" not in v]
LIST_FIELDS = [k for k, v in FIELDS.items() if v.get("type") == "array"]

# Ordinal fields: being one step off is a near-miss, not a flat error.
ORDINAL = vocab.ordinal("craft_frame")


def json_schema():
    """Full JSON Schema -- what Ollama's `format` field takes."""
    return {
        "type": "object",
        "properties": FIELDS,
        "required": REQUIRED,
        "additionalProperties": False,
    }


def gemini_schema():
    """OpenAPI subset -- what Gemini's `responseSchema` takes.

    Gemini rejects `additionalProperties` and wants `propertyOrdering` to
    pin the generation order. Same fields, same enums: the two backends are
    answering an identical question or the comparison means nothing.
    """
    return {
        "type": "object",
        "properties": {k: dict(v) for k, v in FIELDS.items()},
        "required": REQUIRED,
        "propertyOrdering": REQUIRED,
    }


PROMPT = """You are annotating a single frame from a film or animated series for a \
cinematography training corpus. Describe the CRAFT, not the story.

Report only what this frame shows. Do not name the title, characters, actors or \
franchise -- the corpus records how the shot was made, not what it is from. Do not \
invent detail you cannot see: if a field is genuinely unreadable, choose the closest \
value and set confidence to low.

Judge the camera from the image itself. Perspective stretch and edge behaviour give \
you the lens register; the ground plane and converging verticals give you the angle. \
Never report a focal length in millimetres -- report the register the image reads as.

TWO FIELDS ARE ROUTINELY GOT WRONG. Read these before answering them.

`exposure` is the brightness question. `lighting_key` is NOT. Key is the ratio \
between key and fill -- it is a question about SHADOWS, answered by looking at the \
DARKEST part of the frame, never the brightest. A brightly lit frame that still \
falls to true black is LOW-key. A dim frame lit evenly with no true blacks is \
HIGH-key. If you find yourself giving `lighting_key` and `exposure` the same \
answer, you have answered brightness twice and shadow depth not at all.

`lens_impression` requires a visible cue: edge distortion, stretched foreground, or \
compressed background separation. Most tight shots contain no such cue, and the \
correct answer there is `indeterminate`. Do not default to `wide-angle` -- if the \
frame does not show you the lens, say so.

WORD LIMITS ARE HARD. Every free-text field states a maximum. Answer those as clipped \
noun phrases, not sentences -- no "The camera is positioned...", just the cue itself. \
Going over the limit is an error even when the extra words are true.

Answer with JSON matching the given schema."""
