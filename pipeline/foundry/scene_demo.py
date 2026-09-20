"""One SCENE, built from the corpus's own rules, to sit beside the nine plates.

    py .scene_demo.py <cycle-dir>

The 2026-09-20 envelope rendered nine isolated compositions and they read as stock
photography. The corpus predicted that: `generated-shot-sourcing`'s conditioning
ladder calls text-only "least controlled ... unacceptable wherever anything must
match an adjacent shot", which is every shot in a scene. This builds the same stack
at the rungs the corpus actually prescribes.

What is applied here that the envelope omitted:

  genre-visual-contracts        one genre contract, chosen FIRST, constraining all
                                below it ("Genre is chosen first" - golden path)
  style-block-restated-every-call   one style block, verbatim in every call
  (location identity)           one location clause, verbatim in every call. This is
                                the 2026-09-07 banked lead - reference-role-map has a
                                location role but NO continuity rule - so it is
                                carried by restatement, the weakest option, and the
                                gap is the point.
  character-identity-continuity identity is carried by an IMAGE, never by words
                                ("a face cannot be named")
  reference-admitted-late       text owns the early denoise so composition is the
                                brief's; the reference joins at `late` to assert the
                                face. late=0.25 is this repo's MEASURED winner
                                (CONSISTENCY-FINDINGS.md, reference-face-e25, worst
                                identity distance 0.371 vs a real-film floor 0.364)
  scene-grammar-progression     establishing contract, then coverage: master ->
                                OTS pair -> insert -> close. Axis discipline: she
                                faces screen-right throughout, he screen-left.
  one-function-per-visual       every shot states the one thing it does
  but-therefore-beat-linking    a want, an obstacle, a turn - not five compositions

The scene is original and IP-neutral. Unlike the nine plates it does NOT avoid
faces or two-figure contact: those were avoided in the plate library for
generation-risk reasons, and avoiding them is precisely what made the plates
scene-free.
"""
import json
import shutil
import sys
import time
from pathlib import Path

HERE = Path(__file__).parent
PROBE = HERE.parent / "vlm-probe"
ROOT = HERE.parent.parent
sys.path.insert(0, str(PROBE))
sys.path.insert(0, str(HERE))
import guard  # noqa: E402
from consistency import generate, stage_reference, flux_workflow  # noqa: E402

SEED = 11
W, H, STEPS, LATE = 1280, 544, 20, 0.25

# --- Genre contract, chosen first. Everything below is constrained by it. -------
STYLE = ("Cinematic live-action film still, anamorphic 2.39:1, grounded neo-noir crime drama. "
         "One hard practical source from a caged bulb over the counter, everything outside its "
         "throw falling to deep unlit shadow. Muted cold palette with a single warm amber "
         "practical. Fine 35mm grain, natural skin texture, no glamour lighting.")

# --- One place, restated verbatim in every call (the banked location lead) ------
PLACE = ("The back room of a night pawnshop: a scarred wooden counter, a steel security grille "
         "behind it, shelves of unclaimed goods receding into shadow.")

NO_TEXT = " No text, no letters, no watermark, no caption, no logo."

# --- The identity references. Carried by image, never by words. -----------------
REFS = [
    ("ref-broker", "Medium close-up portrait of a woman in her forties, dark wool overcoat "
                   "buttoned high, hair pulled back severely, a hard unsentimental face, no "
                   "make-up. Plain dark background, one hard source from high left."),
    ("ref-keeper", "Medium close-up portrait of a man in his sixties, heavy knitted cardigan, "
                   "wire-rimmed glasses, thinning grey hair, deep lines, a guarded expression. "
                   "Plain dark background, one hard source from high left."),
]

# --- The scene: a want, an obstacle, a turn. Coverage in order. -----------------
# She wants a sealed envelope back. He has it and will not hand it over.
# The turn: she puts a key on the counter and he takes it - she wins, and pays.
SHOTS = [
    ("s1-master",
     "Wide establishing two-shot. The woman stands at the left of frame facing screen right, "
     "the old man behind the counter at the right of frame facing screen left, a sealed manila "
     "envelope flat on the counter between them. Both full-length, the room's geography readable "
     "around them.",
     ["ref-broker", "ref-keeper"],
     "ESTABLISH: teach the room and the line of action (she left facing right, he right facing left)"),
    ("s2-ots-keeper",
     "Over-the-shoulder medium shot. The woman's dark shoulder and the back of her head fill the "
     "left foreground out of focus; beyond her the old man stands behind the counter facing screen "
     "left, one hand flat on the sealed envelope, holding it down.",
     ["ref-keeper"],
     "REFUSAL: he will not give it up, and his hand says so"),
    ("s3-ots-broker",
     "Reverse over-the-shoulder medium shot. The old man's cardigan shoulder fills the right "
     "foreground out of focus; beyond him the woman faces screen right across the counter, chin "
     "level, asking without pleading.",
     ["ref-broker"],
     "THE ASK: the reverse of s2, axis held, she faces screen right"),
    ("s4-insert-key",
     "Extreme close-up insert. A small brass key set down on the scarred counter, a woman's "
     "fingertips just leaving it, the grain of the wood and the key's worn teeth sharp, the room "
     "beyond thrown out of focus to darkness.",
     [],
     "PROMOTE THE OBJECT: the insert that turns a key into the plot"),
    ("s5-turn",
     "Close-up. The old man's hand closing over the small brass key on the counter, his face above "
     "it in the upper frame, eyes down on his own hand, the decision already made.",
     ["ref-keeper"],
     "THE TURN: he takes it - she gets the envelope and pays for it"),
]


def compile_prompt(action):
    """style-block-restated-every-call: no call opts out of the style or the place."""
    return f"{STYLE} {PLACE} {action}{NO_TEXT}"


def render(prompt, seed, refs, dst, prefix):
    wf = flux_workflow(prompt, seed, refs=tuple(refs), width=W, height=H,
                       steps=STEPS, prefix=prefix, late=LATE if refs else 0.0)
    img = generate(wf)
    shutil.copy2(img, dst)


def main():
    cyc = Path(sys.argv[1])
    if not cyc.is_absolute():
        cyc = ROOT / cyc
    out = cyc / "scene"
    out.mkdir(parents=True, exist_ok=True)

    guard.require(ram_gb=0, free=["ollama"], verbose=False)
    if guard.comfy_process_ids():
        guard.recycle_comfy("fresh engine for scene demo")
    elif not guard.start_comfy():
        raise SystemExit("ComfyUI is not running and could not be started")
    guard.require(vram_gb=16, ram_gb=guard.RAM_FLOOR_GB, verbose=False)

    # Pass 1 - the approved references. Text-only by necessity: they ARE the anchor.
    ref_names = {}
    for rid, desc in REFS:
        dst = out / f"{rid}.png"
        if not dst.exists():
            if not guard.headroom_ok():
                guard.recycle_comfy("headroom")
            t0 = time.time()
            render(compile_prompt(desc), SEED, [], dst, f"scene-{cyc.name}")
            print(f"  ref {rid} -> {time.time()-t0:.0f}s", flush=True)
        ref_names[rid] = stage_reference(dst)

    # Pass 2 - the coverage, each shot conditioned on the faces it contains.
    manifest = []
    for sid, action, uses, function in SHOTS:
        dst = out / f"{sid}.png"
        if not dst.exists():
            if not guard.headroom_ok():
                guard.recycle_comfy("headroom")
            t0 = time.time()
            render(compile_prompt(action), SEED, [ref_names[u] for u in uses], dst,
                   f"scene-{cyc.name}")
            print(f"  {sid} -> {time.time()-t0:.0f}s  (refs: {uses or 'none'})", flush=True)
        manifest.append({"id": sid, "file": f"scene/{sid}.png", "function": function,
                         "refs": uses, "late": LATE if uses else 0.0})

    (cyc / "scene.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False),
                                    encoding="utf-8")
    print(f"scene_demo: {len(SHOTS)} shot(s) + {len(REFS)} reference(s) -> {out}", flush=True)


if __name__ == "__main__":
    main()
