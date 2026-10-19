"""One Flux 2 still, from a prompt, to a path.

    python pipeline/video/flux_still.py out.jpg "the prompt"

A thin CLI over pipeline/vlm-probe/consistency.py's flux workflow so a
TypeScript build script can render locally without reimplementing the graph.
Text-to-image, no references: the caller supplies a fully compiled prompt.
"""
import shutil
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT / "pipeline" / "vlm-probe"))
import guard  # noqa: E402
from consistency import flux_workflow, generate  # noqa: E402

W, H, STEPS = 1280, 720, 20


def main():
    if len(sys.argv) < 3:
        raise SystemExit("usage: flux_still.py <out> <prompt>")
    out = Path(sys.argv[1])
    prompt = sys.argv[2]
    if not guard.start_comfy():
        raise SystemExit("ComfyUI is not running and could not be started")
    if not guard.headroom_ok():
        guard.recycle_comfy("headroom")
    # Seed from the output path so a re-run of the same plate is the same plate.
    seed = abs(hash(out.name)) % (2 ** 31)
    src = generate(flux_workflow(prompt, seed, width=W, height=H, steps=STEPS,
                                 prefix=f"trial-{out.stem}"), timeout=1200)
    out.parent.mkdir(parents=True, exist_ok=True)
    if out.suffix.lower() in (".jpg", ".jpeg"):
        Image.open(src).convert("RGB").save(out, quality=88, optimize=True)
    else:
        shutil.copy2(src, out)


main()
