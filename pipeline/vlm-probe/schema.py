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

SHOT_SIZE = [
    "extreme-wide", "wide", "full", "medium-full",
    "medium", "medium-close", "close-up", "extreme-close-up",
]

CAMERA_ANGLE = [
    "eye-level", "low-angle", "extreme-low-angle",
    "high-angle", "extreme-high-angle", "overhead", "dutch",
]

LENS_IMPRESSION = ["ultra-wide", "wide-angle", "normal", "telephoto", "macro"]

DEPTH_OF_FIELD = ["deep", "moderate", "shallow"]

LIGHTING_KEY = ["high-key", "low-key", "neutral"]

LIGHTING_DIRECTION = ["front", "side", "back-rim", "top", "under", "mixed"]

LIGHTING_QUALITY = ["hard", "soft", "mixed"]

CONTRAST = ["low", "moderate", "high", "extreme"]

TEXTURE = [
    "film-grain", "digital-clean", "painterly",
    "cel-animated", "3d-rendered", "glossy-cg",
]

GENRE_REGISTER = [
    "noir", "horror-slow-burn", "horror-slasher", "psychological-thriller",
    "action-chaos", "action-precision", "romance", "sci-fi-sterile",
    "sci-fi-used-future", "sci-fi-neon", "period-drama", "western",
    "documentary-verite", "commercial-product", "coming-of-age", "other",
]


def _enum(values, desc):
    return {"type": "string", "enum": list(values), "description": desc}


def _str(desc):
    return {"type": "string", "description": desc}


def _list(desc, max_items=6):
    return {
        "type": "array",
        "items": {"type": "string"},
        "description": f"{desc} (at most {max_items} short entries)",
    }


# --- the schema itself ---------------------------------------------------
# `propertyOrdering` matters: models answer in order, so the cheap
# observations come first and the interpretive calls last, after the model
# has already committed to what it can see.

FIELDS = {
    "shot_size": _enum(SHOT_SIZE, "How much of the main subject the frame holds."),
    "camera_angle": _enum(CAMERA_ANGLE, "Where the camera sits relative to the subject's eyeline."),
    "angle_evidence": _str("The visual cue that proves the angle, in under 15 words (converging verticals, visible ceiling, ground plane height)."),
    "lens_impression": _enum(LENS_IMPRESSION, "The lens register the image reads as -- from perspective stretch and edge behaviour, NOT a guessed focal length."),
    "lens_evidence": _str("The cue behind the lens call, under 15 words (edge distortion, background compression, foreground exaggeration)."),
    "depth_of_field": _enum(DEPTH_OF_FIELD, "How much of the depth is in focus."),
    "subject_scale": _str("How large the main subject sits in frame, as a fraction of height, e.g. 'about one third'."),
    "lighting_key": _enum(LIGHTING_KEY, "Overall exposure register."),
    "lighting_direction": _enum(LIGHTING_DIRECTION, "Dominant direction the key light comes from."),
    "lighting_quality": _enum(LIGHTING_QUALITY, "Shadow edge character."),
    "contrast": _enum(CONTRAST, "Distance between the brightest and darkest areas that carry detail."),
    "light_sources": _list("Light sources visible or clearly implied IN the frame (practical lamps, fire, screens, sun, emissive props)."),
    "palette": _str("The colour scheme in under 12 words."),
    "foreground": _str("What occupies the foreground layer, under 20 words. 'empty' if nothing."),
    "midground": _str("What occupies the midground layer -- usually the subject -- under 20 words."),
    "background": _str("What occupies the background layer, under 20 words."),
    "subjects": _list("The people or creatures in frame and what each is doing."),
    "surrounding_objects": _list("Notable set objects and props that establish the place."),
    "texture": _enum(TEXTURE, "Surface character of the image itself."),
    "genre_register": _enum(GENRE_REGISTER, "The genre contract the frame's light, camera and palette belong to."),
    "confidence": _enum(["low", "medium", "high"], "How sure you are overall."),
}

REQUIRED = list(FIELDS.keys())

# Fields scored by exact match against ground truth / reference.
ENUM_FIELDS = [k for k, v in FIELDS.items() if "enum" in v]
TEXT_FIELDS = [k for k, v in FIELDS.items() if v.get("type") == "string" and "enum" not in v]
LIST_FIELDS = [k for k, v in FIELDS.items() if v.get("type") == "array"]

# Ordinal fields: being one step off is a near-miss, not a flat error.
ORDINAL = {
    "shot_size": SHOT_SIZE,
    "lens_impression": LENS_IMPRESSION,
    "depth_of_field": DEPTH_OF_FIELD,
    "contrast": CONTRAST,
}


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


PROMPT = """You are annotating a single frame pulled from a film or animated series, \
for a cinematography training corpus.

Report only what this frame shows. Do not identify the title, characters or actors, \
and do not invent detail you cannot see -- if a field is genuinely unreadable from \
the frame, choose the closest value and set confidence to low.

Judge the camera from the image itself: perspective and edge behaviour give you the \
lens register, the ground plane and converging verticals give you the angle. Never \
report a focal length in millimetres -- report the register the image reads as.

Answer with JSON matching the given schema, and keep every free-text field to the \
word limit stated in its description."""
