import { describe, expect, it } from "vitest";

import type { BoardVerdict } from "../src/board/boardGate.ts";
import type { Cell } from "../src/board/cull.ts";
import { itemAct, runState, runVerdictOf, type Run } from "../src/board/runs.ts";

// The two triage levels (operator, 2026-10-23): a run judged whole, an item inside it differing;
// the run's verdict read off its items.

const cells: Cell[] = [{ id: "a", row: "r" }, { id: "b", row: "r" }, { id: "c", row: "r" }];
const run: Run = { row: "r", words: undefined, members: [0, 1, 2], group: "art styles" };
const keep: BoardVerdict = { verdict: "keep", reasons: [] };
const reject = (...reasons: string[]): BoardVerdict => ({ verdict: "reject", reasons });

describe("runState", () => {
  it("a kept run with one rejected item is still kept; every item rejected is rejected; anything open is open", () => {
    expect(runState(run, cells, { a: keep, b: reject("subject"), c: keep })).toBe("kept");
    expect(runState(run, cells, { a: reject(), b: reject(), c: reject() })).toBe("rejected");
    expect(runState(run, cells, { a: keep, b: keep })).toBe("open");
    expect(runState(run, cells, {})).toBe("open");
  });

  it("the run's verdict: kept, or the first item's rejection with its reasons, or none", () => {
    expect(runVerdictOf(run, cells, { a: keep, b: reject("subject"), c: keep })).toEqual(keep);
    expect(runVerdictOf(run, cells, { a: reject("style"), b: reject(), c: reject() })).toEqual(reject("style"));
    expect(runVerdictOf(run, cells, { a: keep })).toBeUndefined();
  });
});

describe("itemAct", () => {
  it("keeping an item keeps the run: its open items come with it, a rejected sibling stays the exception", () => {
    expect(itemAct(run, cells, { b: reject("subject") }, 0, keep)).toEqual([0, 2]);
    expect(itemAct(run, cells, { a: reject(), b: reject(), c: reject() }, 1, keep)).toEqual([1]);
  });

  it("rejecting or clearing an item moves that item alone", () => {
    expect(itemAct(run, cells, { a: keep, b: keep, c: keep }, 1, reject("subject"))).toEqual([1]);
    expect(itemAct(run, cells, {}, 2, null)).toEqual([2]);
  });
});
