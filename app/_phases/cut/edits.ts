// WHERE THE PLAYHEAD CAN LAND ON PURPOSE — edit points and music gaps, as pure
// arithmetic over the derived cut, so the transport's jumps and the scrub's
// snap read one list and tests/golden-path/cut.probe.spec.ts can drive it with
// no DOM.
//
//   edit point  a boundary between blocks on ANY lane — where a shot changes,
//               a line starts, a cue enters or leaves — at the position the
//               block is DRAWN (its mark plus the sync bench's offset), because
//               that is where the eye sees the cut and where the take sounds.
//               The head and the tail of the cut are edit points too.
//   music gap   seconds of the cut no cue sits over. Measured on the cue's MARK
//               (`startS`), not its drawn start, so a jump lands on exactly the
//               seconds the finish line's `music coverage` row counts as
//               unscored (finishLine.ts coveredS); a 50ms nudge must not open a
//               gap the gate does not see.

import type { DerivedCut } from "./deriveTimeline";
import { drawnStart, type Offsets } from "./offsets";

/** Two boundaries closer than this are one edit (float residue of `targetS`
 *  sums, and a cue that starts exactly where a shot does). One frame at 25fps. */
const SAME_EDIT_S = 0.04;

/** Every boundary on every lane, sorted, deduplicated, inside [0, totalS]. */
export function editPoints(cut: Pick<DerivedCut, "clips" | "totalS">, offsets: Offsets = {}): number[] {
  const total = Math.max(0, cut.totalS);
  const raw = [0, total];
  for (const c of cut.clips) {
    const from = drawnStart(offsets, c);
    raw.push(from, from + c.durS);
  }
  const out: number[] = [];
  for (const t of raw.map((x) => Math.min(total, Math.max(0, x))).sort((a, b) => a - b)) {
    if (out.length === 0 || t - out[out.length - 1] > SAME_EDIT_S) out.push(t);
  }
  return out;
}

/** The next edit strictly after `t` (dir 1) or strictly before it (dir -1);
 *  `t` itself when there is none, so a jump at the tail is a no-op rather than
 *  a wrap to the head. "Strictly" carries the same one-frame slack, so pressing
 *  twice from a point that is itself an edit moves on rather than sticking. */
export function nextEdit(points: readonly number[], t: number, dir: 1 | -1): number {
  if (dir > 0) return points.find((p) => p > t + SAME_EDIT_S) ?? t;
  for (let i = points.length - 1; i >= 0; i--) if (points[i] < t - SAME_EDIT_S) return points[i];
  return t;
}

/** The nearest point within `tolS` of `t`, else `t`. */
export function snapTo(points: readonly number[], t: number, tolS: number): number {
  let best = t;
  let gap = tolS;
  for (const p of points) {
    const d = Math.abs(p - t);
    if (d <= gap) {
      gap = d;
      best = p;
    }
  }
  return best;
}

export interface Gap {
  startS: number;
  endS: number;
}

/** The seconds of [0, totalS] no music cue covers, as intervals in order —
 *  the complement of finishLine's `coveredS`, over the same marks. */
export function musicGaps(cut: Pick<DerivedCut, "clips" | "totalS">): Gap[] {
  const total = Math.max(0, cut.totalS);
  if (total <= 0) return [];
  const spans = cut.clips
    .filter((c) => c.track === "music")
    .map((c) => [Math.max(0, c.startS), Math.min(total, c.startS + c.durS)] as const)
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);
  const gaps: Gap[] = [];
  let at = 0;
  for (const [a, b] of spans) {
    if (a - at > SAME_EDIT_S) gaps.push({ startS: at, endS: a });
    at = Math.max(at, b);
  }
  if (total - at > SAME_EDIT_S) gaps.push({ startS: at, endS: total });
  return gaps;
}

/** The start of the next gap after `t` (or the previous one before it). A
 *  playhead already INSIDE a gap moves to the next one — it has found this
 *  one. `null` when there is nowhere to go. */
export function nextGap(gaps: readonly Gap[], t: number, dir: 1 | -1): number | null {
  if (dir > 0) return gaps.find((g) => g.startS > t + SAME_EDIT_S)?.startS ?? null;
  for (let i = gaps.length - 1; i >= 0; i--) if (gaps[i].startS < t - SAME_EDIT_S) return gaps[i].startS;
  return null;
}
