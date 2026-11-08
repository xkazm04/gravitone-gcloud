// ONE PASS OVER BOTH TABS (perfect, one-pass-both-tabs): the walk at the end of a tab carries into the next tab
// that still has an open run, T switches tabs and is drawn in Keycaps, and a partial commit that would leave runs
// in a tab never opened says so, with counts, before it goes on.
import { describe, expect, test } from "vitest";

import type { BoardVerdict } from "../src/board/boardGate.ts";
import { carryTo, heldBackOf, heldBackWords, nextLane, type Cell, type Lane } from "../src/board/cull.ts";
import { KEYMAP } from "../src/keymap/bindings.ts";
import { chordsOf } from "../src/keymap/chord.ts";
import { keyTable, resolve } from "../src/keymap/keymap.ts";
import { NO_TARGET } from "../src/keymap/target.ts";

// Storyboards: runs 0-1 (cells 0-1). Reels: runs 2-4 (cells 2-4). One cell a run.
const cells: Cell[] = ["s1", "s2", "r1", "r2", "r3"].map((id) => ({ id, row: id }));
const runs = cells.map((_, i) => ({ members: [i] }));
const lanes: Lane[] = [
  { tab: "storyboards", order: [0, 1] },
  { tab: "reels", order: [2, 3, 4] },
];
const keep: BoardVerdict = { verdict: "keep", reasons: [] };

describe("the walk carries into the next tab", () => {
  test("past the last storyboard it lands on the first open reel", () => {
    expect(carryTo(lanes, 1, runs, cells, { s1: keep, s2: keep, r1: keep }, false)).toBe(3);
  });
  test("a tab with nothing open is passed over; with nothing open anywhere the walk stays (null)", () => {
    expect(carryTo(lanes, 1, runs, cells, { s1: keep, s2: keep, r1: keep, r2: keep }, false)).toBe(4);
    expect(carryTo(lanes, 1, runs, cells, { s1: keep, s2: keep, r1: keep, r2: keep, r3: keep }, false)).toBeNull();
  });
  test("it wraps from the last tab back to the first", () => {
    expect(carryTo(lanes, 4, runs, cells, { r1: keep, r2: keep, r3: keep }, false)).toBe(0);
  });
  test("a reject still owing its reason is open where the source requires one", () => {
    const bare: BoardVerdict = { verdict: "reject", reasons: [] };
    expect(carryTo(lanes, 0, runs, cells, { r1: bare, r2: keep, r3: keep }, true)).toBe(2);
    expect(carryTo(lanes, 0, runs, cells, { r1: bare, r2: keep, r3: keep }, false)).toBeNull();
  });
  test("one tab has nowhere to carry to", () => {
    expect(carryTo([lanes[0] as Lane], 1, runs, cells, {}, false)).toBeNull();
  });
});

describe("T switches tabs", () => {
  test("to the next tab's first run, wrapping; nowhere with one tab", () => {
    expect(nextLane(lanes, 1)).toBe(2);
    expect(nextLane(lanes, 3)).toBe(0);
    expect(nextLane([lanes[0] as Lane], 0)).toBeNull();
  });
  test("T is bound on the cull and drawn in Keycaps", () => {
    const m = resolve(KEYMAP, { chords: chordsOf({ key: "t" }), repeat: false, target: NO_TARGET }, "board.cull", new Set());
    expect(m?.binding.verb).toBe("next-tab");
    expect(keyTable(KEYMAP, "board.cull").find((r) => r.keys.includes("T"))).toEqual({ keys: ["T"], does: "tab" });
  });
});

describe("a commit asks about what it leaves in tabs never opened", () => {
  const visited = (...runsSeen: number[]) => new Set(runsSeen);
  test("undecided runs of another tab the cursor never stood on are counted per tab", () => {
    expect(heldBackOf(lanes, 0, runs, cells, { s1: keep }, visited(0, 1))).toEqual([{ tab: "reels", runs: 3 }]);
    expect(heldBackOf(lanes, 0, runs, cells, { s1: keep, r1: keep }, visited(0, 1, 3))).toEqual([{ tab: "reels", runs: 1 }]);
  });
  test("a tab walked and left undecided, or one fully decided, is not asked about", () => {
    expect(heldBackOf(lanes, 0, runs, cells, { s1: keep }, visited(0, 2, 3, 4))).toEqual([]);
    expect(heldBackOf(lanes, 0, runs, cells, { r1: keep, r2: keep, r3: keep }, visited(0))).toEqual([]);
  });
  test("the cursor's own tab is the existing partial's business, not this ask", () => {
    expect(heldBackOf(lanes, 3, runs, cells, {}, visited(3))).toEqual([{ tab: "storyboards", runs: 2 }]);
  });
  test("the statement names the counts and where they go", () => {
    expect(heldBackWords([{ tab: "reels", runs: 3 }, { tab: "storyboards", runs: 1 }])).toEqual([
      "reels · 3 runs never opened, undecided",
      "storyboards · 1 run never opened, undecided",
      "undecided runs go on to the remainder packet",
    ]);
    expect(heldBackWords([])).toEqual([]);
  });
});
