"""Competence envelope for the local still stack, over CONTROLLED scenarios.

    py .scenario_probe.py <cycle-dir> [--seeds 3,4]

Not an A/B. This answers the prior question an A/B cannot answer for itself:
**can this pipeline render a controlled movie scene legibly at all?** Until that
is established for a given scenario, any arm comparison over it is noise against
noise, and a tie or a refusal says nothing about the technique under test.

The scenarios are gravity's own nine role x size trailer recipes (shotPrompt.ts
SUBJECT_RECIPE), used verbatim as the action block. They are real use cases,
IP-neutral, and already the thing this project renders -- so the envelope
measured here is the envelope that matters, not one measured on an invented
brief. Each carries an EXPECT line whose claims are countable (one figure,
three figures, one lit window) rather than aesthetic, so a reader grades the
same thing twice.

One style block for all nine, held constant, because composition is under test
and style is not.

KNOWN DUPLICATION: SCENARIOS below restates SUBJECT_RECIPE from
app/_phases/frames/shotPrompt.ts, which the repo's own "derived, never authored"
rule would normally forbid. The recipes live in TypeScript and this is a Python
probe; there is no shared source today. Keep them in step by hand, or delete this
copy the day a recipe export exists. Measured 2026-09-20: 8 of 9 scenarios render
their stated expectation at 1280x544 / 20 steps -- see SCENARIO-ENVELOPE.md.
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
from consistency import generate  # noqa: E402
from forge import flux_workflow  # noqa: E402

STYLE = ("Cinematic live-action film still, anamorphic, 2.39:1 framing, natural filmic "
         "contrast, desaturated cool palette, fine grain.")
NO_TEXT = " No text, no letters, no watermark, no caption, no logo."

# id, action block (gravity SUBJECT_RECIPE, verbatim), countable expectation
SCENARIOS = [
    ("setup-EWS",
     "A wide landscape seen past a dark silhouetted form occupying one third of the frame, layered mist receding to a low horizon, one small point of light far in the distance.",
     "a horizon; ONE dark silhouetted mass at ~1/3 of frame; EXACTLY ONE distant point of light; layered depth"),
    ("setup-MS",
     "A lone figure seen from behind at medium distance, back and shoulders only, walking away into soft depth, the place they are heading toward visible beyond them.",
     "EXACTLY ONE figure; seen from BEHIND; a destination visible beyond them"),
    ("rung-WS",
     "Several figures at middle distance advancing toward the viewer out of smoke, rim-lit from behind, faces unreadable, low ground haze.",
     "THREE OR MORE figures; advancing toward viewer; rim-light from behind; faces unreadable; ground haze"),
    ("rung-MCU",
     "A single figure framed head and shoulders, dead centre and symmetrical, lit by one hard source with a strong colour cast from high to one side, the far side of the face falling to near-black, nothing else in the surround lit.",
     "EXACTLY ONE face; centred and symmetrical; ONE side of the face near-black; surround unlit"),
    ("peak-EWS",
     "One vast form filling the horizon - a vertical beam of light above a massed crowd rendered as texture - with small figures beneath it for scale.",
     "ONE vast form on the horizon; a VERTICAL beam; small figures giving scale"),
    ("peak-MS",
     "Three figures abreast at medium distance moving toward the viewer through smoke, seen from below, backlit, legs cropped by the lower frame edge.",
     "EXACTLY THREE figures; ABREAST; LOW angle; backlit; legs cropped by lower edge"),
    ("peak-ECU",
     "One physical event frozen very close - debris, sparks and a single shard mid-flight - filling the frame against a dark ground, the sparks themselves the only light, everything a hand's width away falling to black.",
     "extreme close scale; debris/sparks mid-flight; dark ground; sparks are the only light"),
    ("reset-EWS",
     "A single small structure on a flat horizon at night, one lit window its only light spilling a small warm pool onto the ground, the sky and the land otherwise dark, nothing moving, the lower third clear.",
     "ONE small structure; EXACTLY ONE lit window; otherwise dark; lower third clear"),
    ("tail-EWS",
     "A wide landscape plate with a deliberately quiet, empty upper third carrying no focal detail, atmosphere thinning toward the top of the frame.",
     "wide landscape; upper third EMPTY of focal detail; atmosphere thinning upward"),
]


def main():
    cyc = Path(sys.argv[1])
    if not cyc.is_absolute():
        cyc = ROOT / cyc
    seeds = [3]
    if "--seeds" in sys.argv:
        seeds = [int(x) for x in sys.argv[sys.argv.index("--seeds") + 1].split(",")]
    out = cyc / "shots"
    out.mkdir(parents=True, exist_ok=True)

    todo = [(sid, act, exp, s) for sid, act, exp in SCENARIOS for s in seeds
            if not (out / f"{sid}--s{s}.png").exists()]
    print(f"scenario_probe: {len(SCENARIOS)} scenario(s) x {len(seeds)} seed(s), {len(todo)} to render", flush=True)
    if not todo:
        return

    guard.require(ram_gb=0, free=["ollama"], verbose=False)
    if guard.comfy_process_ids():
        guard.recycle_comfy("fresh engine for scenario probe")
    elif not guard.start_comfy():
        raise SystemExit("ComfyUI is not running and could not be started")
    guard.require(vram_gb=16, ram_gb=guard.RAM_FLOOR_GB, verbose=False)

    manifest = []
    for n, (sid, act, exp, seed) in enumerate(todo, 1):
        if not guard.headroom_ok():
            guard.recycle_comfy("headroom")
        prompt = f"{STYLE} {act}{NO_TEXT}"
        wf = flux_workflow(prompt, seed, width=1280, height=544, steps=20,
                           prefix=f"scen-{cyc.name}")
        t0 = time.time()
        try:
            img = generate(wf)
        except Exception as e:  # noqa: BLE001
            print(f"  [{n}/{len(todo)}] {sid} s{seed} FAILED: {str(e)[:90]}", flush=True)
            if not guard.recycle_comfy("after failure"):
                break
            continue
        dst = out / f"{sid}--s{seed}.png"
        shutil.copy2(img, dst)
        manifest.append({"id": sid, "seed": seed, "file": f"shots/{dst.name}",
                         "expect": exp, "prompt": prompt})
        print(f"  [{n}/{len(todo)}] {sid} s{seed} -> {time.time()-t0:.0f}s", flush=True)

    mf = cyc / "scenarios.json"
    prior = json.loads(mf.read_text(encoding="utf-8")) if mf.exists() else []
    mf.write_text(json.dumps(prior + manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"scenario_probe: wrote {mf}", flush=True)


if __name__ == "__main__":
    main()
