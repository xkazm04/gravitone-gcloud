// A card's one playhead (spark audio-agent-studio, stage S2; desk's playhead): while the card sounds,
// write where it stands (0..1) as `--desk-at` on its timeline, every frame from the transport's
// exact position. Under prefers-reduced-motion it follows the 4 Hz clock instead of the frame, so
// the line steps rather than glides. Nothing renders through React at frame rate.
import { useEffect, type RefObject } from "react";

import { fracAt } from "@gt/ui/components/studio-desk/desk.ts";

/** `scale`: the share of the width the audio covers (sections may be planned past the end of the render). */
export function usePlayhead(ref: RefObject<HTMLElement | null>, active: boolean, position: () => number, duration: number | null, clock: number, scale = 1): void {
  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const set = (s: number): void => el.style.setProperty("--desk-at", String(fracAt(s, duration) * scale));
    if (!active) {
      el.style.setProperty("--desk-at", "0");
      return;
    }
    const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      set(clock);
      return;
    }
    let raf = 0;
    const tick = (): void => {
      set(position());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ref, active, position, duration, clock, scale]);
}
