"""Write an image's motion prompt by LOOKING AT THE IMAGE FIRST.

    python pipeline/video/motion_author.py public/presets/blueprint.jpg
    python pipeline/video/motion_author.py public/presets/blueprint.jpg --json

WHY THIS EXISTS -- the bug it is the fix for.

The first two rounds of preset clips were authored by hand, blind, and both
failed the same way. Round one asked for things to be DRAWN and got a white
banner sweeping the frame and a gloved hand entering the chalkboard. Round two
retreated to camera-only lines ("very slow camera push in toward the panel")
and got exactly what it asked for and nothing else: a global drift with every
element frozen inside it, which on a five-second loop reads as the picture
going soft rather than the picture moving.

The common cause is that NEITHER PROMPT EVER SAID WHAT WAS IN THE FRAME. Wan is
a text-to-video model conditioned on a start image; given a motion clause with
no subject, the only thing it can attach the motion to is the camera. A verb
with no noun becomes a camera move. That is not a prompt-wording problem to be
fixed by rewording -- it is a missing stage.

So the prompt is now DERIVED, in two passes against the local annotator:

    READ     the swatch -> the elements actually in it, named, with positions
    PROPOSE  those elements -> a prompt that opens by describing the scene and
             then gives NAMED elements their own verbs

The scene sentence is not decoration. It is the anchor the motion attaches to,
and it is why this file sends the readback back into the model rather than
letting a human paraphrase it: a human writing from memory writes "the bars"
where the image has four bars, a ground line, a circle and an arrow, and the
model then animates whichever of those it feels like.

ONE MODEL, TWO PROMPTS. qwen3.8:27b -- the annotator the dojo already trusts
for readbacks -- reads the picture and then writes the prompt from its own
reading. It is 22.3 GB resident, so it CANNOT co-reside with ComfyUI: callers
author every prompt they need first, then free ollama and render. The
`--json` output exists so a caller can do exactly that in two processes.
"""
import argparse
import base64
import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(ROOT / "pipeline" / "vlm-probe"))
from probe import post, extract_json  # noqa: E402

OLLAMA = "http://127.0.0.1:11434"
MODEL = "qwen3.8:27b"
MIME = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}

# ── PASS 1 · READ ──────────────────────────────────────────────────────────
# Closed-ish fields and a hard cap of six elements. A model asked for "the
# elements" of a picture will happily return eighteen, including "the negative
# space", and a prompt built from eighteen nouns animates none of them.

READ_PROMPT = """You are looking at a single still frame that will become a 5-second video clip.

Describe ONLY what is actually visible. Do not invent objects, do not interpret
meaning, do not mention style adjectives like "elegant" or "modern".

scene: one plain sentence naming what the picture shows, as if to someone who
cannot see it. Name the medium (photograph, flat vector drawing, chalk on a
blackboard, cut paper, blueprint linework) and the background.

elements: the distinct THINGS in the frame, at most six, largest and most
important first. For each: a short noun name as it appears in the picture, and
where it sits in the frame. Skip the background itself; it is not an element.

grounded: true if the objects rest on a visible surface, ground line or floor;
false if they float."""

READ_SCHEMA = {
    "type": "object",
    "properties": {
        "scene": {"type": "string"},
        "elements": {
            "type": "array",
            "minItems": 1,
            "maxItems": 6,
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "where": {"type": "string"},
                },
                "required": ["name", "where"],
            },
        },
        "grounded": {"type": "boolean"},
    },
    "required": ["scene", "elements", "grounded"],
}

# ── PASS 2 · PROPOSE ───────────────────────────────────────────────────────
# Every rule below is a defect that was actually rendered on this box, and the
# comment beside it says which. Rules without that provenance do not belong.

PROPOSE_PROMPT = """You are writing the text prompt for an image-to-video model.
The first frame is fixed: it is the picture described below. You are choosing
what happens over the next 5 seconds.

THE PICTURE
{readback}

WRITE ONE PROMPT, in this exact order:

1. A sentence describing the picture, adapted from `scene` above. The video
   model needs to know what it is looking at before it can move any part of it.
   A prompt that opens with a motion verb and no subject produces a camera
   drift with every object frozen inside it. This sentence is the anchor.

2. One or two sentences of MOTION, in which you name elements from the list by
   their own names and give each a verb. Not "things move" -- "the tallest bar
   rises", "the circle drifts upward". An unnamed element will not move.

3. A final short clause naming what HOLDS STILL, including the camera.

RULES, each learned from a spoiled render:

- MOVE THE OBJECTS, NOT THE CAMERA. Do not write a camera push-in, drift, pan,
  tilt or zoom as the motion. A camera move is what this model falls back to
  when it has nothing else, and it reads as the picture going soft.
- NOTHING IS CREATED OR DESTROYED. Never ask for anything to be drawn, written,
  erased, added or removed. "Lines draw themselves across the drawing" put a
  white banner through the frame; the model renders a wipe, not an act of
  drawing.
- NOTHING ENTERS THE FRAME. No hand, no tool, no new object. A request for
  chalk strokes brought a gloved arm in from the left.
- THE MOTION MUST BE SMALL AND PHYSICAL: a rise, a settle, a sway, a drift, a
  bob, a tilt, a pulse of brightness, a shadow lengthening. Something a real
  object made of matter could do in five seconds without changing shape.
- IF THE PICTURE IS GROUNDED, respect it: things that rest on a surface do not
  float away from it.
- AT MOST THREE ELEMENTS MOVE. Everything else holds. A frame where everything
  moves is a frame that boils.
- NO TEXT, no numbers, no labels appearing anywhere.

Keep the whole prompt under 90 words. Plain declarative sentences. Present
tense. No style adjectives, no camera-technique vocabulary, no mood words."""

PROPOSE_SCHEMA = {
    "type": "object",
    "properties": {
        "prompt": {"type": "string"},
        "moves": {
            "type": "array",
            "minItems": 1,
            "maxItems": 3,
            "items": {
                "type": "object",
                "properties": {
                    "element": {"type": "string"},
                    "verb": {"type": "string"},
                },
                "required": ["element", "verb"],
            },
        },
        "holds_still": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["prompt", "moves", "holds_still"],
}


def _chat(messages, schema, model=MODEL, base=OLLAMA):
    body = {
        "model": model,
        "messages": messages,
        "format": schema,
        "stream": False,
        # Temperature 0: the same swatch must produce the same prompt, or a
        # re-render is a different clip and nothing above it can be compared.
        "options": {"temperature": 0, "num_ctx": 8192},
    }
    try:
        r = post(f"{base}/api/chat", dict(body, think=False))
    except Exception:
        r = post(f"{base}/api/chat", body)
    # extract_json already parses; it exists to survive a reply dressed in a
    # markdown fence, which the hosted endpoint does and the local one does not.
    return extract_json(r["message"]["content"])


def read_image(path, model=MODEL):
    """Pass 1: what is actually in this picture."""
    path = Path(path)
    b64 = base64.b64encode(path.read_bytes()).decode("ascii")
    return _chat([{"role": "user", "content": READ_PROMPT, "images": [b64]}], READ_SCHEMA, model)


def propose(readback, model=MODEL):
    """Pass 2: what those specific things should do for five seconds.

    Text only -- the image is deliberately NOT resent. The readback is the
    contract; if it named the wrong things, the fix belongs in pass 1 where it
    can be seen, not hidden in a second look that disagrees with the first.
    """
    lines = [f"scene: {readback['scene']}", f"grounded: {readback['grounded']}", "elements:"]
    lines += [f"  - {e['name']} ({e['where']})" for e in readback["elements"]]
    filled = PROPOSE_PROMPT.format(readback="\n".join(lines))
    return _chat([{"role": "user", "content": filled}], PROPOSE_SCHEMA, model)


# ── PASS 2b · PROPOSE AN END STATE ─────────────────────────────────────────
# The keyframe route does not ask a video model for motion at all. It asks the
# IMAGE model -- the one that drew the swatch, and is therefore faithful to it --
# for the SAME PICTURE with one element somewhere else, and interpolates between
# the two. The background is then held by construction rather than by asking a
# video model nicely, which pipeline/video/README.md records six renders proving
# it will not do on flat vector art.
#
# So this pass writes a STILL prompt, not a motion prompt. Its whole discipline
# is that the end state must be describable as the same picture: every rule below
# pushes toward "identical, except".

KEYFRAME_PROMPT = """You are choosing the END STATE of a 5-second loop.

The loop is made from two still pictures and an interpolation between them. The
first picture is fixed -- it is the one described below. You are writing a
description of the SECOND picture.

THE FIRST PICTURE
{readback}

The second picture must be THE SAME PICTURE with ONE element in a different
place. Not a different composition, not a later moment in a story, not a new
camera position. Everything a viewer could name must still be there, the same
size, the same colour, the same style, in the same place -- except one element,
which has moved a visible distance.

Write `end_state` as a full description of that second picture, the way you
would describe it to someone who has not seen the first. Describe the whole
frame, not just the change: the model reading it renders a picture, not a diff.

RULES:

- ONE element moves. Name it in `moving` exactly as it is named in the list.
- IT MOVES, IT DOES NOT CHANGE. Same size, same shape, same colour, same line
  weight. A thing that grows or shrinks cannot be interpolated -- the frames
  between would be a shape morphing, which is the defect this route exists to
  avoid.
- THE DISTANCE MUST BE VISIBLE but not the width of the frame. Roughly a tenth
  to a third of the frame. Smaller and the loop looks broken; larger and the
  interpolation between the two stills tears.
- IT STAYS INSIDE THE FRAME, and it stays physically sensible: something resting
  on a surface slides along it rather than flying off it.
- NOTHING IS ADDED OR REMOVED. Same count of everything.
- NO TEXT, no numbers, no labels.

`path` is one short phrase for how it gets from the first place to the second --
"slides right along the baseline", "rises straight up". It is not rendered; it
is there so a human can see at a glance whether the two states agree."""

KEYFRAME_SCHEMA = {
    "type": "object",
    "properties": {
        "end_state": {"type": "string"},
        "moving": {"type": "string"},
        "path": {"type": "string"},
    },
    "required": ["end_state", "moving", "path"],
}


def propose_keyframe(readback, model=MODEL):
    """Pass 2b: the same picture, one element moved. Text only, like propose()."""
    lines = [f"scene: {readback['scene']}", f"grounded: {readback['grounded']}", "elements:"]
    lines += [f"  - {e['name']} ({e['where']})" for e in readback["elements"]]
    filled = KEYFRAME_PROMPT.format(readback=chr(10).join(lines))
    return _chat([{"role": "user", "content": filled}], KEYFRAME_SCHEMA, model)


def author(path, model=MODEL):
    """The whole chain: a picture in, a rendering prompt out."""
    seen = read_image(path, model)
    return {
        "source": str(path),
        "model": model,
        "read": seen,
        # Both routes, from one reading. The video route is kept because the
        # reading it is built on is sound even where the renderer under it is
        # not; the keyframe route is the one that ships.
        "proposed": propose(seen, model),
        "keyframe": propose_keyframe(seen, model),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("--model", default=MODEL)
    ap.add_argument("--json", action="store_true", help="the whole record, for a caller")
    a = ap.parse_args()

    out = author(a.image, a.model)
    if a.json:
        print(json.dumps(out, indent=2, ensure_ascii=False))
        return
    print(f"\nREAD  {out['read']['scene']}")
    for e in out["read"]["elements"]:
        print(f"      · {e['name']} — {e['where']}")
    print(f"\nMOVES {', '.join(m['element'] + ' ' + m['verb'] for m in out['proposed']['moves'])}")
    print(f"STILL {', '.join(out['proposed']['holds_still'])}")
    print(f"\nVIDEO PROMPT\n{out['proposed']['prompt']}")
    k = out["keyframe"]
    print(f"\nKEYFRAME · moves {k['moving']} — {k['path']}")
    print(f"{k['end_state']}\n")


if __name__ == "__main__":
    main()
