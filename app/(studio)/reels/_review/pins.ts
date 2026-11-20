// The pinned notes' arithmetic, pure: time order, the neighbour of the playhead, the marks the scrubber and the
// strip draw. A pin's `t` is desktop seconds.
import type { ReelPin } from "@/lib/reel/store";

import { mss } from "@gt/ui/components/filmstrip/Filmstrip.tsx";

export const byTime = (pins: readonly ReelPin[]): ReelPin[] => [...pins].sort((a, b) => a.t - b.t);

/** The pin before (-1) or after (+1) the playhead; a pin within half a frame of it is "at" it, not past it. */
export function neighbour(pins: readonly ReelPin[], t: number, dir: -1 | 1): ReelPin | undefined {
  const eps = 1 / 60;
  const sorted = byTime(pins);
  return dir > 0 ? sorted.find((p) => p.t > t + eps) : [...sorted].reverse().find((p) => p.t < t - eps);
}

/** A pin as a mark on a 0..1 track. */
export function marksOf(pins: readonly ReelPin[], duration: number): { readonly at: number; readonly label: string }[] {
  if (duration <= 0) return [];
  return byTime(pins).map((p) => ({ at: p.t / duration, label: `note at ${mss(p.t)}${p.reasons.length > 0 ? `: ${p.reasons.join(", ")}` : ""}` }));
}

/** A pin may be made of a reason or of words; a pin of neither says nothing. */
export const pinnable = (reasons: readonly string[], text: string): boolean => reasons.length > 0 || text.trim() !== "";
