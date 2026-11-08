// A NOTE BELONGS TO THE RUN (perfect, note-on-judged-run). After a verdict key the cursor has moved on, so E
// must note the run just judged - while the cursor's own run holds no verdict - and the note is written on the
// run's first cell, the one stable cell the server reads into notes[cell]. Esc inside the field, in the zoom,
// cancels the note and not the run.
import { describe, expect, test } from "vitest";

import type { BoardVerdict } from "../src/board/boardGate.ts";
import { noteAct, noteCellOf, noteOfRun, noteRunOf, type Cell } from "../src/board/cull.ts";
import { KEYMAP } from "../src/keymap/bindings.ts";
import { route, type Decision, type KeyInput } from "../src/keymap/route.ts";
import { NO_TARGET, type TargetInfo } from "../src/keymap/target.ts";
import { EMPTY_STACK, push, type LayerEntry } from "../src/layers/stack.ts";

// Two storyboard runs of three frames each: cells 0-2 and 3-5.
const cells: Cell[] = ["a1", "a2", "a3", "b1", "b2", "b3"].map((id) => ({ id, row: id[0] ?? "" }));
const runs = [{ members: [0, 1, 2] }, { members: [3, 4, 5] }];
const keep: BoardVerdict = { verdict: "keep", reasons: [] };
const judgedRun = (v: BoardVerdict, ids: string[]): Record<string, BoardVerdict> => Object.fromEntries(ids.map((i) => [i, v]));

describe("which run E notes", () => {
  test("1, E: the keys moved the cursor to run 2, so E notes run 1", () => {
    const verdicts = judgedRun(keep, ["a1", "a2", "a3"]);
    expect(noteRunOf(runs, cells, verdicts, 1, 0)).toBe(0);
  });

  test("2, E (a reject with a reason) reaches the judged run the same way", () => {
    const verdicts = judgedRun({ verdict: "reject", reasons: ["story"] }, ["a1", "a2", "a3"]);
    expect(noteRunOf(runs, cells, verdicts, 1, 0)).toBe(0);
  });

  test("a cursor run with a verdict of its own is the one noted", () => {
    const verdicts = { ...judgedRun(keep, ["a1", "a2", "a3"]), b2: keep };
    expect(noteRunOf(runs, cells, verdicts, 1, 0)).toBe(1);
  });

  test("once the cursor is deliberately moved (judged cleared) E is the cursor's, and refuses on an undecided run", () => {
    const verdicts = judgedRun(keep, ["a1", "a2", "a3"]);
    expect(noteRunOf(runs, cells, verdicts, 1, null)).toBe(1);
    expect(noteAct(verdicts["b1"], "x", 500).kind).toBe("refuse");
  });

  test("nothing judged, or a judged run that is gone, leaves the cursor's run", () => {
    expect(noteRunOf(runs, cells, {}, 1, 7)).toBe(1);
    expect(noteRunOf(runs, cells, {}, 0, 0)).toBe(0);
  });
});

describe("the note is the run's, on its first cell", () => {
  test("written on the first cell, so the existing path (notes[cell]) carries it", () => {
    const run = runs[0] ?? { members: [] };
    expect(noteCellOf(run)).toBe(0);
    const verdicts = judgedRun(keep, ["a1", "a2", "a3"]);
    const act = noteAct(verdicts["a1"], "  frame 4 is the wrong office  ", 500);
    expect(act).toEqual({ kind: "mark", verdict: { ...keep, note: "frame 4 is the wrong office" }, cleared: false });
  });

  test("the run reads its note off its first cell, else an older per-variant one", () => {
    expect(noteOfRun([0, 1, 2], cells, { a1: { ...keep, note: "first" }, a2: { ...keep, note: "second" } })).toBe("first");
    expect(noteOfRun([0, 1, 2], cells, { a2: { ...keep, note: "second" } })).toBe("second");
    expect(noteOfRun([0, 1, 2], cells, {})).toBeUndefined();
  });
});

describe("Esc while noting in the opened run cancels the note and keeps the run", () => {
  const inField: TargetInfo = { editable: true, field: "note", control: true };
  const noop = () => undefined;
  const zoom = push(EMPTY_STACK, { id: "zoom", kind: "zoom", close: noop } satisfies LayerEntry);
  const at = (k: KeyInput, layers = zoom): string => {
    const d: Decision = route(KEYMAP, k, { layers, page: "board.cull", facts: new Set(["notes"]) });
    return d.kind === "binding" ? d.match.binding.verb : d.kind === "close-layer" ? `close:${d.id}` : "none";
  };
  test("in the field Esc is cancel-note; outside it Esc still closes the zoom", () => {
    expect(at({ key: "Escape", target: inField })).toBe("cancel-note");
    expect(at({ key: "Escape", target: NO_TARGET })).toBe("close:zoom");
  });
  test("a tooltip over the field still takes its own Esc", () => {
    const tip = push(zoom, { id: "tip", kind: "tooltip", close: noop } satisfies LayerEntry);
    expect(at({ key: "Escape", target: inField }, tip)).toBe("close:tip");
  });
});
