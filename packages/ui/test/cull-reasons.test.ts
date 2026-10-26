// EVERY X NEEDS A REASON, AND A NOTE ON THE CULL (spark scout-decision-graph WP-S1). Where a source's vocabulary
// says `required` (the seeds), a reasonless reject is not done: the commit gate counts it beside the undecided,
// flashes and jumps to it and says `<n> need a reason`; 5 then a chip (or a reject key) sets it and moves on. E opens a
// one-line note field on the decision under the cursor (its ⏎ and Esc are the keymap's field rows, Escape still
// closing the top layer first); the saved note rides the verdict and shows under its row, in its words.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { reasonsOf, reasonVocabulary } from "@gt/domain/source";

import type { BoardVerdict } from "../src/board/boardGate.ts";
import { chipThen, commitGate, keepingNote, nextOpen, noteAct, notDoneOf, notDoneWords, reasonAct, runKeyAct, stillOpen, type Cell, type KeyAct } from "../src/board/cull.ts";
import { remainderOf } from "../src/board/port.ts";
import { categoryOf, tabOf } from "../src/board/runs.ts";
import { CullFoot } from "../src/components/cull/CullFoot.tsx";
import { IdeaList } from "../src/components/cull/IdeaList.tsx";
import { NoteField } from "../src/components/cull/NoteField.tsx";
import { KEYMAP } from "../src/keymap/bindings.ts";
import { chordsOf } from "../src/keymap/chord.ts";
import { keyTable, resolve } from "../src/keymap/keymap.ts";
import { route, type Decision, type KeyInput } from "../src/keymap/route.ts";
import { NO_TARGET, type TargetInfo } from "../src/keymap/target.ts";
import { EMPTY_STACK, push, type LayerEntry } from "../src/layers/stack.ts";

const SEEDS = reasonVocabulary("seeds");
const cells: Cell[] = ["sd-001", "sd-002", "sd-003", "sd-004"].map((id) => ({ id, row: id }));
const keep: BoardVerdict = { verdict: "keep", reasons: [] };
const reject = (...reasons: string[]): BoardVerdict => ({ verdict: "reject", reasons });
const noop = () => undefined;

/** A key pressed on a cull desk, through the real keymap, to what it does to the run under the cursor. */
function press(key: string, list: readonly string[], max: number, current: BoardVerdict | undefined, required = false): KeyAct | null {
  const m = resolve(KEYMAP, { chords: chordsOf({ key }), repeat: false, target: NO_TARGET }, "board.cull", new Set());
  return m === null ? null : runKeyAct(m.binding.verb, m.cap, list, max, current, required);
}

describe("the number row decides a run on every cull desk (spark scout-storyboards)", () => {
  const FORGE = reasonVocabulary("forge");
  test("1 keeps and moves on; 2-4 reject with reasons #1-3 and move on; 5 rejects bare and stays for a chip", () => {
    expect(press("1", FORGE.list, FORGE.max, undefined)).toEqual({ kind: "mark", verdict: keep, then: "advance" });
    expect(["2", "3", "4"].map((k) => press(k, FORGE.list, FORGE.max, undefined))).toEqual(["style", "subject", "text"].map((r) => ({ kind: "mark", verdict: reject(r), then: "advance" })));
    expect(press("5", FORGE.list, FORGE.max, undefined)).toEqual({ kind: "mark", verdict: reject(), then: "ask" });
  });

  test("K and X, and the old reason keys past 4, do nothing", () => {
    for (const k of ["k", "K", "x", "X", "6", "9", "0", "-"]) expect(press(k, FORGE.list, FORGE.max, undefined), k).toBeNull();
  });

  test("a scout run's keys 2-4 follow its group's order", () => {
    const SCOUT = reasonVocabulary("scout");
    const keyed = (group: string) => ["2", "3", "4"].map((k) => {
      const act = press(k, reasonsOf(SCOUT, group), SCOUT.max, undefined);
      return act?.kind === "mark" ? act.verdict.reasons[0] : act?.kind;
    });
    expect(keyed("3d")).toEqual(["topology", "texture", "rig"]);
    expect(keyed("ideas")).toEqual(["generic", "use case", "subject"]);
    expect(keyed("storyboards")).toEqual(["story", "generic", "use case"]);
  });

  test("a source with no reasons: 2-4 are a plain reject that moves on, 5 a plain reject that stays", () => {
    const SUNO = reasonVocabulary("suno");
    for (const k of ["2", "3", "4"]) expect(press(k, SUNO.list, SUNO.max, undefined), k).toEqual({ kind: "mark", verdict: reject(), then: "advance" });
    expect(press("5", SUNO.list, SUNO.max, undefined)).toEqual({ kind: "mark", verdict: reject(), then: "advance" });
  });
});

describe("the commit gate on a source whose reject needs a reason", () => {
  test("the seeds' vocabulary requires it; the scout's does not", () => {
    expect(SEEDS.required).toBe(true);
    expect(reasonVocabulary("scout").required).toBeUndefined();
  });

  test("a reasonless reject is open beside the undecided, in draw order, and said so", () => {
    const v = { "sd-001": keep, "sd-002": reject(), "sd-004": reject("generic") };
    const open = notDoneOf(cells, v, true);
    expect(open).toEqual({ undecided: [2], reasonless: [1], all: [1, 2] });
    expect(notDoneWords(open)).toBe("1 undecided · 1 need a reason");
    expect(notDoneWords(notDoneOf(cells, { "sd-001": keep, "sd-002": reject(), "sd-003": reject(), "sd-004": keep }, true))).toBe("2 need a reason");
    // Where the source asks nothing, a bare reject is done, as it always was.
    expect(notDoneOf(cells, v, false)).toEqual({ undecided: [2], reasonless: [], all: [2] });
    expect([stillOpen(reject(), true), stillOpen(reject(), false), stillOpen(reject("format"), true), stillOpen(undefined, false)]).toEqual([true, false, false, true]);
  });

  test("5 then a reject key: the key sets the reason AND moves on; on a reasoned reject it toggles and stays", () => {
    const list = SEEDS.list;
    expect(reasonAct(list, SEEDS.max, "2", reject(), true)).toEqual({ kind: "mark", verdict: reject("generic"), then: "advance" });
    expect(reasonAct(list, SEEDS.max, "3", { ...reject(), note: "kept" }, true)).toEqual({ kind: "mark", verdict: { ...reject("not for us"), note: "kept" }, then: "advance" });
    expect(reasonAct(list, SEEDS.max, "4", reject("generic"), true)).toEqual({ kind: "mark", verdict: reject("generic", "audience"), then: "stay" });
    expect(reasonAct(list, SEEDS.max, "2", reject(), false)).toEqual({ kind: "mark", verdict: reject("generic"), then: "advance" });
    expect(reasonAct(list, SEEDS.max, "6", reject(), true)).toEqual({ kind: "refuse", why: "key 6 names no reason" });
  });

  test("5 then a chip on a seeds desk: the click sets the reason and moves on to the next open run", () => {
    // The press: 5 rejects with no reason and asks for the chips, staying on the row.
    expect(press("5", SEEDS.list, SEEDS.max, undefined, true)).toEqual({ kind: "mark", verdict: reject(), then: "ask" });
    // The click on the asked row (VerdictPick's toggle) finishes it; anywhere else, or on a source that
    // asks nothing, a chip only sets the reason.
    expect(chipThen(true, true, reject("audience"))).toBe("advance");
    expect(chipThen(true, true, reject())).toBe("stay");
    expect(chipThen(true, false, reject("audience"))).toBe("stay");
    expect(chipThen(false, true, reject("audience"))).toBe("stay");
    // Next OPEN run: sd-002 is kept already, so the click on sd-001 lands on sd-003.
    const runs = cells.map((_, i) => ({ members: [i] }));
    expect(nextOpen([0, 1, 2, 3], 0, runs, cells, { "sd-001": reject("generic"), "sd-002": keep }, true)).toBe(2);
    expect(nextOpen([0, 1, 2, 3], 2, runs, cells, { "sd-004": keep }, true)).toBe(3);
    // Nothing open after it: the next run, clamped to the last.
    expect(nextOpen([0, 1, 2, 3], 3, runs, cells, {}, true)).toBe(3);
  });

  test("the bar's commit names both what is undecided and what needs a reason", () => {
    const html = renderToStaticMarkup(h(CullFoot, { tally: { kept: 1, rejected: 2, undecided: 1 }, reasonless: 2, reasons: SEEDS, refusals: 0, busy: false, onCommit: noop }));
    expect(html).toContain("1 undecided · 2 need a reason");
  });

  test("a commit in parts: undecided go on to the remainder, a reasonless reject and an empty commit still refuse", () => {
    const v = { "sd-001": keep, "sd-002": reject("generic") };
    expect(commitGate(cells, v, true, true)).toEqual({ kind: "go", later: 2 });
    // Not partial: the undecided hold the commit, as on every other source.
    expect(commitGate(cells, v, true, false)).toEqual({ kind: "refuse", left: { undecided: [2, 3], reasonless: [], all: [2, 3] } });
    // A reasonless reject holds a partial commit; only it is flashed.
    expect(commitGate(cells, { ...v, "sd-003": reject() }, true, true)).toEqual({ kind: "refuse", left: { undecided: [], reasonless: [2], all: [2] } });
    expect(commitGate(cells, {}, true, true)).toMatchObject({ kind: "refuse", left: { undecided: [0, 1, 2, 3] } });
    expect(commitGate(cells, { ...v, "sd-003": keep, "sd-004": keep }, true, false)).toEqual({ kind: "go", later: 0 });
    // The bar says how many commit now and how many later, and stops waiting on the undecided.
    const html = renderToStaticMarkup(h(CullFoot, { tally: { kept: 1, rejected: 1, undecided: 2 }, later: 2, reasons: SEEDS, refusals: 0, busy: false, onCommit: noop }));
    expect(html).toContain("2 later");
    expect(html).toContain("commit packet, 2 · 2 later");
    expect(html).not.toContain("2 undecided");
    expect([remainderOf("pkt:scout:2026-10-24"), remainderOf("pkt:scout:2026-10-24:2"), remainderOf("pkt:scout:muse:2026-10-24"), remainderOf("pkt:seeds:2026-10-24-2")]).toEqual(["pkt:scout:2026-10-24:2", "pkt:scout:2026-10-24:3", "pkt:scout:muse:2026-10-24:2", "pkt:seeds:2026-10-24-2:2"]);
  });

  test("a reasonless reject flashes on the list as an undecided row does; a reasoned one does not", () => {
    const run = (i: number) => ({ run: { row: cells[i]?.id ?? "", words: undefined, members: [i], group: "seeds" }, at: i });
    const html = renderToStaticMarkup(
      h(IdeaList, {
        categories: [{ category: "seeds", runs: [run(0), run(1), run(3)] }],
        cells,
        verdicts: { "sd-002": reject(), "sd-004": reject("generic") },
        wordsOf: (id: string) => ({ label: `the sentence of ${id}` }),
        cur: 0,
        nudged: new Set([0, 1, 3]),
        reasons: SEEDS,
        onFocus: noop,
        onVerdict: noop,
      }),
    );
    const article = (id: string): string => html.slice(html.indexOf(`aria-label="the sentence of ${id}`) - 200, html.indexOf(`aria-label="the sentence of ${id}`));
    expect(article("sd-002")).toMatch(/nudge/);
    expect(article("sd-004")).not.toMatch(/nudge/);
    // A batch's seeds are words filed in the ideas tab, under their own name.
    expect(tabOf(categoryOf({ row: "sd-001", words: undefined, members: [0], group: "seeds" }, "text/plain"))).toBe("ideas");
    expect(html).toContain(">seeds<");
  });
});

describe("a note on the cull", () => {
  test("rides a verdict: refused on an undecided tile, trimmed and cut at the source's bound, cleared when blank", () => {
    expect(noteAct(undefined, "hm", SEEDS.noteMax)).toEqual({ kind: "refuse", why: "a note rides a verdict: keep or reject it first" });
    expect(noteAct(reject("generic"), "  seen it twice this month  ", SEEDS.noteMax)).toEqual({ kind: "mark", verdict: { ...reject("generic"), note: "seen it twice this month" }, cleared: false });
    expect(noteAct(keep, "x".repeat(600), 500)).toMatchObject({ verdict: { note: "x".repeat(500) } });
    expect(noteAct({ ...keep, note: "old" }, "   ", 500)).toEqual({ kind: "mark", verdict: keep, cleared: true });
    expect(noteAct(keep, "n", 0)).toEqual({ kind: "refuse", why: "this source keeps no note" });
  });

  test("survives K, X and a reason cast over it; U takes both", () => {
    const noted: BoardVerdict = { ...keep, note: "the union arc" };
    expect(keepingNote(noted, reject("generic"))).toEqual({ ...reject("generic"), note: "the union arc" });
    expect(keepingNote(noted, { ...keep, note: "new" })).toEqual({ ...keep, note: "new" });
    expect(keepingNote(noted, null)).toBeNull();
    expect(keepingNote(undefined, keep)).toEqual(keep);
  });

  test("E is drawn where the source keeps a note; the field draws its own ⏎ and Esc", () => {
    expect(keyTable(KEYMAP, "board.cull", { facts: new Set(["notes"]) }).find((r) => r.does === "note")).toEqual({ keys: ["E"], does: "note" });
    expect(keyTable(KEYMAP, "board.cull").some((r) => r.does === "note")).toBe(false);
    expect(keyTable(KEYMAP, "board.cull", { field: "note" })).toEqual([
      { keys: ["⏎"], does: "save" },
      { keys: ["Esc"], does: "cancel" },
    ]);
    const foot = (noteMax: number) => renderToStaticMarkup(h(CullFoot, { tally: { kept: 0, rejected: 0, undecided: 1 }, reasons: { ...SEEDS, noteMax }, refusals: 0, busy: false, onCommit: noop }));
    expect(foot(500)).toMatch(/<kbd[^>]*>E<\/kbd>/);
    expect(foot(0)).not.toMatch(/<kbd[^>]*>E<\/kbd>/);
  });

  test("E opens the field; typed E is text; ⏎ saves and Esc cancels inside it; Escape closes the top layer first", () => {
    const inField: TargetInfo = { editable: true, field: "note", control: true };
    const sheet = push(EMPTY_STACK, { id: "sheet", kind: "sheet", mode: "board.cull", close: noop } satisfies LayerEntry);
    const at = (k: KeyInput, layers = EMPTY_STACK, facts = ["notes"]): string => {
      const d: Decision = route(KEYMAP, k, { layers, page: "board.cull", facts: new Set(facts) });
      return d.kind === "binding" ? d.match.binding.verb : d.kind === "close-layer" ? `close:${d.id}` : "none";
    };
    expect(at({ key: "e", target: NO_TARGET })).toBe("note");
    expect(at({ key: "e", target: NO_TARGET }, EMPTY_STACK, [])).toBe("none");
    expect(at({ key: "e", target: inField })).toBe("none");
    expect(at({ key: "Enter", target: inField })).toBe("save-note");
    expect(at({ key: "Enter", target: NO_TARGET })).toBe("commit");
    expect(at({ key: "Escape", target: inField })).toBe("cancel-note");
    expect(at({ key: "Escape", target: inField }, sheet)).toBe("cancel-note");
    expect(at({ key: "Escape", target: NO_TARGET }, sheet)).toBe("close:sheet");
    const tip = push(sheet, { id: "tip", kind: "tooltip", close: noop } satisfies LayerEntry);
    expect(at({ key: "Escape", target: inField }, tip)).toBe("close:tip");
  });

  test("the field is @gt/ui's Field named to the keymap, bounded; a saved note shows under its row in its words", () => {
    const field = renderToStaticMarkup(h(NoteField, { label: "the union seed", value: "the union arc", max: 500, onChange: noop, onSave: noop }));
    expect(field).toMatch(/<input[^>]*aria-label="note on the union seed"[^>]*data-keyfield="note"/);
    expect(field).toContain("13/500");
    const list = (noting?: { cell: number; field: ReturnType<typeof h> }) =>
      renderToStaticMarkup(
        h(IdeaList, {
          categories: [{ category: "seeds", runs: [{ run: { row: "sd-001", words: undefined, members: [0], group: "seeds" }, at: 0 }] }],
          cells,
          verdicts: { "sd-001": { ...keep, note: "the union arc is the channel" } },
          wordsOf: () => ({ label: "A tired printer unionises the office machines." }),
          cur: 0,
          nudged: new Set<number>(),
          reasons: SEEDS,
          onFocus: noop,
          onVerdict: noop,
          ...(noting === undefined ? {} : { noting }),
        }),
      );
    expect(list()).toContain(">the union arc is the channel</p>");
    const open = list({ cell: 0, field: h(NoteField, { label: "sd-001", value: "draft", max: 500, onChange: noop, onSave: noop }) });
    expect(open).toContain('data-keyfield="note"');
    expect(open).not.toContain(">the union arc is the channel</p>");
  });
});
