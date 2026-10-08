// LANE — WHERE THE PLAYHEAD LANDS ON PURPOSE (pure).
//
// The Cut's ↑/↓ (edit points), G / ⇧G (music gaps) and Shift-drag snap, and the
// Score's "add a cue" landing on the first uncovered run, all read the arithmetic
// in app/_phases/cut/edits.ts and app/_phases/score/gaps.ts. Held here on
// synthetic clips so a change to the one-frame slack or the gap rule shows up as
// a number, not as a playhead that sticks.
import { test, expect } from "@playwright/test";

import { editPoints, musicGaps, nextEdit, nextGap, snapTo } from "@/app/_phases/cut/edits";
import { gapRuns } from "@/app/_phases/score/gaps";
import type { Scene } from "@/app/_studio/projectTypes";

type Clip = Parameters<typeof editPoints>[0]["clips"][number];

const clip = (id: string, track: Clip["track"], startS: number, durS: number): Clip =>
  ({ id, track, label: id, startS, durS, status: "ok", ref: id, owner: "frames" }) as Clip;

/** Two decimals: the fixture's 14.01 mark makes float sums, and this is not a float test. */
const r = (x: number | null) => (x === null ? null : Math.round(x * 100) / 100);

const CUT = {
  totalS: 20,
  clips: [
    clip("p1", "video", 0, 6),
    clip("p2", "video", 6, 8),
    clip("p3", "video", 14, 6),
    // starts one float-residue away from the p2/p3 boundary: the same edit
    clip("m1", "music", 2, 4),
    clip("m2", "music", 14.01, 3),
  ],
};

test("edit points: every boundary on every lane, head and tail included, one-frame duplicates merged", () => {
  expect(editPoints(CUT).map(r)).toEqual([0, 2, 6, 14, 17.01, 20]);
});

test("nextEdit moves strictly forward or back and is a no-op at either end", () => {
  const pts = editPoints(CUT);
  expect(nextEdit(pts, 0, 1)).toBe(2);
  expect(nextEdit(pts, 6, 1)).toBe(14); // standing on an edit moves on, not sticks
  expect(nextEdit(pts, 6.02, -1)).toBe(2);
  expect(nextEdit(pts, 20, 1)).toBe(20);
  expect(nextEdit(pts, 0, -1)).toBe(0);
});

test("snapTo takes the nearest point within tolerance, else leaves t alone", () => {
  const pts = editPoints(CUT);
  expect(snapTo(pts, 6.3, 0.5)).toBe(6);
  expect(snapTo(pts, 15.5, 0.5)).toBe(15.5);
  expect(r(snapTo(pts, 16.6, 0.5))).toBe(17.01);
});

test("music gaps are the unscored seconds, measured on the cue marks", () => {
  const gaps = musicGaps(CUT);
  expect(gaps.map((g) => [r(g.startS), r(g.endS)])).toEqual([
    [0, 2],
    [6, 14.01],
    [17.01, 20],
  ]);
  expect(musicGaps({ totalS: 0, clips: [] })).toEqual([]);
  expect(musicGaps({ totalS: 10, clips: [clip("m", "music", 0, 10)] })).toEqual([]);
});

test("nextGap jumps to the next gap's start; inside a gap moves on; null when nowhere to go", () => {
  const gaps = musicGaps(CUT);
  expect(nextGap(gaps, 0, 1)).toBe(6);
  expect(r(nextGap(gaps, 8, 1))).toBe(17.01);
  expect(nextGap(gaps, 17.01, 1)).toBeNull();
  expect(nextGap(gaps, 8, -1)).toBe(6);
  expect(nextGap(gaps, 0, -1)).toBeNull();
});

test("gapRuns: contiguous uncovered scenes, in film order", () => {
  const scenes = ["a", "b", "c", "d", "e"].map((id, i) => ({ id, index: i + 1 }) as Scene);
  expect(gapRuns(scenes, new Set(["b", "c"]))).toEqual([["a"], ["d", "e"]]);
  expect(gapRuns(scenes, new Set(["a", "b", "c", "d", "e"]))).toEqual([]);
  expect(gapRuns(scenes, new Set())).toEqual([["a", "b", "c", "d", "e"]]);
});
