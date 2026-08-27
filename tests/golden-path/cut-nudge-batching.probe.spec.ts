// LANE — TWO NUDGES MOVE A CLIP TWICE (dynamic).
//
// The Cut bench's drift control read its base offset from the component's
// render-time `offsets` binding inside a `setOffsets` updater:
//
//   const nudge = (c, ms) => setOffsets((o) => ({ ...o, [c.id]: offsetOf(c) + ms }));
//                                                            ^^^^^^^^^^^^ not `o`
//
// React batches the events a +50ms / -50ms pair of buttons invites, so two quick
// clicks both computed from the same stale base and the second OVERWROTE the
// first: pressing +50ms twice moved the clip 50ms. Nothing errored, the number
// beside the buttons agreed with the block on the ruler, and the only symptom was
// that the control felt like it dropped presses.
//
// A single click is correct under BOTH implementations, which is why this probe
// composes the step rather than calling it once - one application can never
// distinguish them.
import { test, expect } from "@playwright/test";

import { nudgeOffsets, offsetFrom, type Offsets } from "@/app/_phases/cut/CutTimeline";
import type { TimelineClip } from "@/app/_studio/projectTypes";

const clean: TimelineClip = { id: "t-x", track: "music", label: "x", startS: 4, durS: 3, status: "ok" };
/** A clip the CUT already records as drifting - the base is the fixture's own
 *  value, not zero, which is the case a naive `(o[id] ?? 0)` would also lose. */
const drifting: TimelineClip = { ...clean, id: "t-a2", status: "drift", offsetMs: 300 };

/** Fold n nudges the way a batch does: each step sees only the previous state. */
const applyAll = (c: TimelineClip, steps: number[]): Offsets =>
  steps.reduce<Offsets>((o, ms) => nudgeOffsets(o, c, ms), {});

test("one nudge moves the clip once", () => {
  expect(offsetFrom(applyAll(clean, [50]), clean)).toBe(50);
});

test("two nudges in one batch move it twice — the case the stale read collapsed", () => {
  const o = applyAll(clean, [50, 50]);
  console.log(`[cut] +50 +50 -> ${offsetFrom(o, clean)}ms`);
  // THE DEFECT: the old form yielded 50 here, because both steps read the same
  // render-time base.
  expect(offsetFrom(o, clean)).toBe(100);
});

test("a burst nets out, sign by sign", () => {
  expect(offsetFrom(applyAll(clean, [50, 50, 50, -50]), clean)).toBe(100);
});

test("a clip the cut already records as drifting nudges from ITS mark, not from zero", () => {
  // 300ms of recorded drift, then two -50 presses.
  const o = applyAll(drifting, [-50, -50]);
  console.log(`[cut] 300ms recorded, -50 -50 -> ${offsetFrom(o, drifting)}ms`);
  expect(offsetFrom(o, drifting)).toBe(200);
});

test("an untouched clip reports exactly what the cut says about it", () => {
  expect(offsetFrom({}, drifting)).toBe(300);
  expect(offsetFrom({}, clean)).toBe(0);
});

test("snapping to the mark is not undone by the fixture's own drift", () => {
  // The bench writes an explicit 0; `?? ` must not fall through it to offsetMs.
  expect(offsetFrom({ [drifting.id]: 0 }, drifting)).toBe(0);
});
