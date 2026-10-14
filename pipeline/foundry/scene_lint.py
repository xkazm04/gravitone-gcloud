"""Scene-grammar lint: check a shot list BEFORE any generation is spent.

    from scene_lint import lint_shots

The corpus technique `scene-grammar-progression` says to write the scene as beats,
assign each a size from its meaning, then "check the list top to bottom for axis,
eyeline, and progression violations -- before any generation is spent." Until this
file that check was a human reading `SHOTS` by eye; the s5 close-up of scene_demo.py
shipped with its gaze stated but its screen direction not, which is exactly the
brief an isolated generation is free to flip.

Stdlib only; no GPU. A shot is a tuple (id, brief, refs, function) as in scene_demo.
Rules (each returns a plain string; an empty list means the list is clean):

  opening   the first shot must be a wide establishing shot (or the function must
            say DISORIENT, the knowing exception).
  direction a shot that carries an identity reference (a face is in frame) must
            state a screen direction word: screen-left, screen-right, toward
            camera, away from camera.
  axis      a shot with exactly ONE identity reference must agree with every other
            single-reference shot of that identity on screen-left vs screen-right
            (the line of action holds), unless its function says CROSS.
  stutter   two consecutive shots with the same size class and the same references
            read as a glitch, not an edit.
"""

import re

DIRECTION = re.compile(r"screen[- ](left|right)|toward camera|away from camera", re.I)
SIDE = re.compile(r"screen[- ](left|right)", re.I)

SIZES = [  # order matters: most specific first
    ("extreme-close", re.compile(r"^\s*extreme close-up", re.I)),
    ("over-shoulder", re.compile(r"^\s*(reverse )?over-the-shoulder", re.I)),
    ("close", re.compile(r"^\s*close-up|^\s*medium close-up", re.I)),
    ("wide", re.compile(r"^\s*wide|establishing", re.I)),
    ("medium", re.compile(r"^\s*medium", re.I)),
]


def size_class(brief):
    for name, rx in SIZES:
        if rx.search(brief):
            return name
    return "unknown"


def lint_shots(shots):
    problems = []
    if not shots:
        return ["the shot list is empty"]
    first = shots[0]
    if size_class(first[1]) != "wide" and "DISORIENT" not in first[3]:
        problems.append(f"opening: {first[0]} is {size_class(first[1])}, not a wide establishing shot")
    side_of = {}
    for sid, brief, refs, function in shots:
        if refs and not DIRECTION.search(brief):
            problems.append(f"direction: {sid} carries a face but states no screen direction")
        if len(refs) == 1 and "CROSS" not in function:
            m = SIDE.search(brief)
            if m:
                side = m.group(1).lower()
                prior = side_of.setdefault(refs[0], (side, sid))
                if prior[0] != side:
                    problems.append(
                        f"axis: {sid} puts {refs[0]} screen-{side}, {prior[1]} put them screen-{prior[0]}")
    for a, b in zip(shots, shots[1:]):
        sa, sb = size_class(a[1]), size_class(b[1])
        if sa == sb and sa != "unknown" and set(a[2]) == set(b[2]):
            problems.append(f"stutter: {a[0]} and {b[0]} are both {sa} on the same subject")
    return problems
