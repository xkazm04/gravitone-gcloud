// The Board desks' pure halves: where the cull's cursor goes, what a reason key does under each
// source's list (1-9, 0, −), the undecided jump, how a blind pick draws, and the commit flow's
// table. Literal cells and verdicts in, values out.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import type { PairView } from "@gt/domain/board";
import { parseAt } from "@gt/domain/door";
import { candidateIdSchema } from "@gt/domain/ids";
import { SOURCES } from "@gt/domain/source";

import type { BoardVerdict } from "../src/board/boardGate.ts";
import { commitFlow, cycleDirective, noteText, onCommitKey } from "../src/board/commit.ts";
import { cullCells, reasonAct, reasonSlot, rowOf, tallyOf, undecidedOf, vertical, type Cell } from "../src/board/cull.ts";
import { OUTCOME_OF, agreement, armLook, currentPair, outcomeWords } from "../src/board/pair.ts";

const rows = [{ id: "r1" }, { id: "r2" }];
const items = [
  { id: "a", row: "r1" },
  { id: "b", row: "r1" },
  { id: "c", row: "r1" },
  { id: "d", row: "r2" },
  { id: "e", row: "r2" },
];
const cells: Cell[] = cullCells(rows, items);
const keep: BoardVerdict = { verdict: "keep", reasons: [] };

describe("the matrix", () => {
  test("cells run row by row in the presentation's order; an unnamed row is drawn last, not dropped", () => {
    expect(cells.map((c) => c.id)).toEqual(["a", "b", "c", "d", "e"]);
    const more = cullCells([{ id: "r2" }], [...items, { id: "z" }]);
    expect(more.map((c) => c.id)).toEqual(["d", "e", "a", "b", "c", "z"]);
  });

  test("a row is every tile in the cursor's row (⇧K / ⇧X act on these)", () => {
    expect(rowOf(cells, 1)).toEqual([0, 1, 2]);
    expect(rowOf(cells, 4)).toEqual([3, 4]);
  });

  test("↑ / ↓ keep the column, or land on the shorter row's last tile, and stop at the edges", () => {
    expect(vertical(cells, 1, 1)).toBe(4);
    expect(vertical(cells, 2, 1)).toBe(4);
    expect(vertical(cells, 4, -1)).toBe(1);
    expect(vertical(cells, 0, -1)).toBe(0);
    expect(vertical(cells, 3, 1)).toBe(3);
  });

  test("the tally and the undecided jump read the same map", () => {
    const v = { a: keep, d: { verdict: "reject", reasons: [] } } as const;
    expect(tallyOf(cells, v)).toEqual({ kept: 1, rejected: 1, undecided: 3 });
    expect(undecidedOf(cells, v)).toEqual([1, 2, 4]);
    expect(undecidedOf(cells, { a: keep, b: keep, c: keep, d: keep, e: keep })).toEqual([]);
  });
});

describe("reject keys 2-4 follow the run's reason order", () => {
  test("2, 3 and 4 are the three slots; every other cap is none", () => {
    expect(["2", "3", "4"].map(reasonSlot)).toEqual([0, 1, 2]);
    for (const cap of ["1", "5", "0", "-", "K"]) expect(reasonSlot(cap), cap).toBe(-1);
  });

  test("audio's first three defects are the keys; the other eight are the chips'", () => {
    const a = SOURCES.audio;
    expect(reasonAct(a.reasons, a.maxReasons, "2", undefined)).toEqual({ kind: "mark", verdict: { verdict: "reject", reasons: ["smeared-transients"] }, then: "advance" });
    const four = reasonAct(a.reasons, a.maxReasons, "4", undefined);
    expect(four.kind === "mark" && four.verdict.reasons).toEqual(["section-bleed"]);
  });

  test("on a fresh tile a reason rejects and moves on; on a standing reject it toggles and stays", () => {
    const s = SOURCES.strips;
    const first = reasonAct(s.reasons, s.maxReasons, "3", undefined);
    expect(first).toEqual({ kind: "mark", verdict: { verdict: "reject", reasons: ["legibility"] }, then: "advance" });
    const added = reasonAct(s.reasons, s.maxReasons, "2", { verdict: "reject", reasons: ["legibility"] });
    // Kept in the list's order, not the order pressed.
    expect(added).toEqual({ kind: "mark", verdict: { verdict: "reject", reasons: ["concept", "legibility"] }, then: "stay" });
    const removed = reasonAct(s.reasons, s.maxReasons, "3", { verdict: "reject", reasons: ["concept", "legibility"] });
    expect(removed).toEqual({ kind: "mark", verdict: { verdict: "reject", reasons: ["concept"] }, then: "stay" });
  });

  test("past the source's cap the key is refused, never silently dropped", () => {
    const s = SOURCES.seeds;
    const full: BoardVerdict = { verdict: "reject", reasons: ["generic", "not for us"] };
    expect(reasonAct(s.reasons, s.maxReasons, "4", full)).toEqual({ kind: "refuse", why: "at most 2 reasons" });
  });

  test("a slot past the list is a plain reject that moves on; a cap that is no reject key refuses", () => {
    expect(reasonAct(SOURCES.mv.reasons, 0, "2", undefined)).toEqual({ kind: "mark", verdict: { verdict: "reject", reasons: [] }, then: "advance" });
    expect(reasonAct(SOURCES.forge.reasons, 4, "5", undefined)).toEqual({ kind: "refuse", why: "key 5 names no reason" });
  });
});

const cid = (s: string) => {
  const r = parseAt("test arm", candidateIdSchema, s);
  if (!r.ok) throw r.error;
  return r.value;
};
const pair = (row: string, outcome: PairView["outcome"], agrees?: boolean | null): PairView => ({
  row,
  a: cid(`${row}/a`),
  b: cid(`${row}/b`),
  outcome,
  ...(agrees === undefined ? {} : { machine: { candidate: cid(`${row}/a`), agrees } }),
});

describe("the blind pair", () => {
  test("the keys' verbs record the four outcomes", () => {
    expect(OUTCOME_OF).toEqual({ left: "a", right: "b", tie: "tie", "both-bad": "both-bad" });
  });

  test("the pair up is the first unjudged one; all judged is the summary", () => {
    expect(currentPair([pair("p1", "a", true), pair("p2", null), pair("p3", null)])).toBe(1);
    expect(currentPair([pair("p1", "a", true)])).toBe(1);
  });

  test("an arm draws picked, dropped, bad or even only once an outcome exists", () => {
    expect([armLook(null, "a"), armLook("a", "a"), armLook("a", "b"), armLook("both-bad", "a"), armLook("tie", "b")]).toEqual(["open", "picked", "dropped", "bad", "even"]);
    expect((["a", "b", "tie", "both-bad"] as const).map((o) => outcomeWords(o))).toEqual(["left", "right", "tie", "both bad"]);
  });

  test("agreement counts only picks the kernel compared; a tie's null is neither", () => {
    expect(agreement([pair("p1", "a", true), pair("p2", "b", false), pair("p3", "tie", null), pair("p4", null)])).toEqual({ agree: 1, compared: 2, total: 4 });
  });
});

describe("the commit flow", () => {
  test("a commit key refuses while anything is open, previews otherwise, and confirms a shown preview", () => {
    expect(onCommitKey("idle", 3)).toBe("refused");
    expect(onCommitKey("refused", 1)).toBe("refused");
    expect(onCommitKey("idle", 0)).toBe("previewing");
    expect(onCommitKey("shown", 0)).toBe("committing");
    expect(onCommitKey("committing", 0)).toBe("committing");
  });

  test("the table: a stale commit goes back to previewing, and done is final", () => {
    expect(commitFlow.can("committing", "previewing")).toBe(true);
    expect(commitFlow.can("idle", "committing")).toBe(false);
    expect(commitFlow.next("done")).toEqual([]);
  });

  test("Tab and ⇧Tab walk the five directives round; an empty note carries its directive's words", () => {
    expect(cycleDirective("more_weight", false)).toBe("less_weight");
    expect(cycleDirective("free_text", false)).toBe("more_weight");
    expect(cycleDirective("more_weight", true)).toBe("free_text");
    expect(noteText("less_weight", "  ")).toBe("less weight");
    expect(noteText("remove", " cut the anecdote ")).toBe("cut the anecdote");
  });
});

// The cut review on a phone: the stylesheet is the only place its columns are decided, so the source is the instrument
// (measured in a 390px page: the player was 36px wide beside the 300px beats column, 354px once stacked).
describe("the cut review's columns", () => {
  const css = readFileSync(join(import.meta.dirname, "../src/components/cut/Cut.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

  test("stack under the player at the desk's own phone width", () => {
    expect(css).toMatch(/@media\s*\(max-width:\s*900px\)\s*\{[^}]*\.cut\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  });

  test("keep the side column beside the player above it", () => {
    expect(css).toMatch(/^\.cut\{[^}]*minmax\(var\(--w-desk-side\),\s*1fr\)/m);
  });
});
