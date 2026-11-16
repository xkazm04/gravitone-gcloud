"""SheetSage2 over the reference, in both modes: the ABC scores the cover takes start from.

    python -I pipeline/track-mirror/transcribe.py <audio> <out dir>

Output of the cover route on someone else's work is a cover of that work whatever its new style
(registry: reference-track-anchoring). The operator chose this route for stage 1 on 2026-11-07, with
the licence to be resolved only if a take succeeds, so nothing here leaves this machine.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import comfy  # noqa: E402


def main():
    audio, out = sys.argv[1], Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    with comfy.Tenancy("track-mirror/transcribe"):
        for mode in ("melody", "full"):
            text = comfy.transcribe(audio, mode)
            (out / f"sheetsage-{mode}.abc").write_text(text, encoding="utf-8", newline="\n")
            print(f"{mode}: {len(text)} chars", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
