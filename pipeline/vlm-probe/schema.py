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

# "indeterminate" is load-bearing. Measured 2026-08-25 on a 36-frame animation
# corpus, this field answered "wide-angle" 34 times out of 36 -- including on
# every extreme close-up, where nothing in the image can reveal a lens register.
# A field that returns the same value regardless of input carries no
# information. Giving the model a legitimate way to decline restores it.
LENS_IMPRESSION = ["ultra-wide", "wide-angle", "normal", "telephoto", "macro",
                   "indeterminate"]

# Exposure exists so that lighting_key can stop being a brightness detector.
# In the same run, 22 of 36 frames came back BOTH high-key and high-contrast --
# near-contradictory, since high-key means filled shadows -- while a luma check
# showed the field tracking mean brightness almost perfectly (143 vs 68). The
# model was answering a question we had not asked. Now it has somewhere to put
# that answer, and lighting_key is redefined as the ratio it actually is.
EXPOSURE = ["dark", "dim", "mid", "bright", "blown"]

DEPTH_OF_FIELD = ["deep", "moderate", "shallow"]

LIGHTING_KEY = ["high-key", "low-key", "neutral"]

LIGHTING_DIRECTION = ["front", "side", "back-rim", "top", "under", "mixed"]

LIGHTING_QUALITY = ["hard", "soft", "mixed"]

CONTRAST = ["low", "moderate", "high", "extreme"]

TEXTURE = [
    "film-grain", "digital-clean", "painterly",
    "cel-animated", "3d-rendered", "glossy-cg",
]

# Added for the replication lane: layers and light alone do not pin a frame down.
# Where the subject sits in the rectangle is a deliberate authored choice, and a
# replica that gets light and lens right but composition wrong has not understood
# the shot.
COMPOSITION = [
    "centered", "symmetrical", "rule-of-thirds", "diagonal",
    "frame-within-frame", "off-center-negative-space",
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
    "lens_impression": _enum(LENS_IMPRESSION, "The lens register the image reads as -- from perspective stretch and edge behaviour, NOT a guessed focal length. Answer 'indeterminate' unless the frame actually shows a cue: visible edge distortion, stretched foreground, or compressed background separation. A tight shot with no visible depth cues is indeterminate, and saying so is correct."),
    "lens_evidence": _str("The cue behind the lens call, under 15 words (edge distortion, background compression, foreground exaggeration). If indeterminate, say what is missing."),
    "depth_of_field": _enum(DEPTH_OF_FIELD, "How much of the depth is in focus."),
    "subject_scale": _str("How large the main subject sits in frame, as a fraction of height, e.g. 'about one third'."),
    "composition": _enum(COMPOSITION, "How the subject is placed in the rectangle."),
    "exposure": _enum(EXPOSURE, "Overall brightness of the frame. This is the BRIGHTNESS question -- answer it here, not in lighting_key."),
    # An observable, not a term of art. If the model cannot reason from shadow
    # depth to the high-key/low-key label, we can still derive the label from
    # this in code -- ask for what is visible, compute what is theoretical.
    "true_black_share": _enum(["none", "small", "large"], "How much of the frame is true black holding no detail at all. Look at the darkest regions and estimate their area: none, a small portion, or a large portion."),
    "lighting_key": _enum(LIGHTING_KEY, "The key-to-fill RATIO, which is about shadow depth and NOT about brightness. high-key = shadows filled in, few dark areas, gentle falloff. low-key = shadows left unfilled, much of the frame falling to black. A bright frame with deep black shadows is LOW-key; a dim frame lit evenly with no true blacks is HIGH-key. Judge the darkest areas, not the brightest."),
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
