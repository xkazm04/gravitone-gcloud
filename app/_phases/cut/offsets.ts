// THE SYNC BENCH'S ARITHMETIC — moved here from CutTimeline.tsx (2026-10-05)
// when the timeline split into a workbench and three variants, so the pure part
// has no React tree above it. CutTimeline re-exports both names, which keeps
// tests/golden-path/cut-nudge-batching.probe.spec.ts importing what it always
// imported.

import type { TimelineClip } from "../../_studio/projectTypes";

/** Offsets a clip carries: the dialled-in drift if there is one, else whatever
 *  the cut itself records. */
export type Offsets = Record<string, number>;

export function offsetFrom(o: Offsets, c: TimelineClip): number {
  return o[c.id] ?? c.offsetMs ?? 0;
}

/**
 * Apply one nudge, as a pure step over the PREVIOUS offsets.
 *
 * Written as a function taking `o` so it cannot accidentally close over a
 * render-time value, which is exactly how the bug it replaces worked: the
 * updater read the component's `offsets` binding instead of its own argument, so
 * a batch of clicks all started from the same base and only the last survived.
 * Composing it with itself must move the clip twice — that is the whole contract.
 */
export function nudgeOffsets(o: Offsets, c: TimelineClip, ms: number): Offsets {
  return { ...o, [c.id]: offsetFrom(o, c) + ms };
}

/** Where a block is drawn — its mark plus whatever drift it carries. The
 *  number on the bench and the block on the ruler are one fact. */
export const drawnStart = (o: Offsets, c: TimelineClip) => c.startS + offsetFrom(o, c) / 1000;

/** A clip that drifted and has been brought back to its mark is no longer
 *  drifting, and the colour says so. */
export const shownStatus = (o: Offsets, c: TimelineClip): TimelineClip["status"] =>
  c.status === "drift" && offsetFrom(o, c) === 0 ? "ok" : c.status;
