import { describe, expect, it } from "vitest";

import { BINDINGS, KEYMAP } from "../src/keymap/bindings.ts";
import { chordsOf, parseCap } from "../src/keymap/chord.ts";
import { compile, conflicts, keyTable, modePath, problems, resolve, type Binding, type Press } from "../src/keymap/keymap.ts";
import { NO_TARGET, targetInfo, type ElementLike, type TargetInfo } from "../src/keymap/target.ts";

const press = (e: Parameters<typeof chordsOf>[0], more: { repeat?: boolean; target?: TargetInfo } = {}): Press => ({
  chords: chordsOf(e),
  repeat: more.repeat ?? false,
  target: more.target ?? NO_TARGET,
});
const none = new Set<string>();
const verbOf = (p: Press, mode: string, facts: ReadonlySet<string> = none): string | null => resolve(KEYMAP, p, mode, facts)?.binding.verb ?? null;

describe("caps parse into chords", () => {
  it.each([
    ["K", { key: "k", shift: false, mod: false }],
    ["⇧K", { key: "k", shift: true, mod: false }],
    ["⌘Z", { key: "z", shift: false, mod: true }],
    ["⇧1", { key: "1", shift: true, mod: false }],
    ["⏎", { key: "Enter", shift: false, mod: false }],
    ["⌫", { key: "Backspace", shift: false, mod: false }],
    ["Space", { key: " ", shift: false, mod: false }],
    ["/", { key: "/", shift: false, mod: false }],
  ])("%s", (cap, chord) => {
    const r = parseCap(cap);
    expect(r.ok && r.value).toEqual(chord);
  });
  it("refuses a shifted punctuation cap: the character carries its own shift", () => {
    expect(parseCap("⇧/").ok).toBe(false);
  });
  it("refuses a word that is not a named key", () => {
    expect(parseCap("Kay").ok).toBe(false);
  });
});

describe("a press makes chords, best reading first", () => {
  it("letters fold case: caps lock is not a different verb", () => {
    expect(chordsOf({ key: "K" })).toEqual([{ key: "k", shift: false, mod: false }]);
  });
  it("Shift+digit also reads the code, because key has become a symbol", () => {
    expect(chordsOf({ key: "!", code: "Digit1", shiftKey: true })).toEqual([
      { key: "!", shift: false, mod: false },
      { key: "1", shift: true, mod: false },
    ]);
  });
  it("the typed character is tried first: ⇧7 on a German board is / and opens search", () => {
    expect(chordsOf({ key: "/", code: "Digit7", shiftKey: true })[0]).toEqual({ key: "/", shift: false, mod: false });
    expect(verbOf(press({ key: "/", code: "Digit7", shiftKey: true }), "library")).toBe("search");
  });
  it("Alt belongs to the OS and assistive tech", () => {
    expect(chordsOf({ key: "k", altKey: true })).toEqual([]);
  });
  it("AltGr types [ on a German board and is not a chord", () => {
    expect(chordsOf({ key: "[", code: "Digit8", ctrlKey: true, altKey: true })).toEqual([{ key: "[", shift: false, mod: false }]);
    expect(verbOf(press({ key: "]", code: "Digit9", ctrlKey: true, altKey: true }), "board")).toBe("packet");
  });
  it("Ctrl and Cmd are the same primary modifier", () => {
    expect(chordsOf({ key: "z", ctrlKey: true })).toEqual(chordsOf({ key: "z", metaKey: true }));
  });
  it("a bare modifier or a dead key is nobody's", () => {
    expect(chordsOf({ key: "Shift" })).toEqual([]);
    expect(chordsOf({ key: "Dead" })).toEqual([]);
  });
});

describe("the real table is sound", () => {
  it("every cap parses and every shadows has something to shadow", () => {
    expect(problems(KEYMAP)).toEqual([]);
  });
  it("no two live rows claim one chord", () => {
    expect(conflicts(KEYMAP).map((c) => c.why)).toEqual([]);
  });
  it("covers the design's named keys", () => {
    const has = (mode: string, cap: string) => BINDINGS.some((b) => b.mode === mode && [...b.keys, ...(b.alias ?? [])].includes(cap));
    for (const [mode, cap] of [
      ["floor", "⇧1"], ["floor", "⇧4"], ["board.cull", "K"], ["board.cull", "X"], ["board.cull", "U"], ["board.cull", "4"],
      ["board.cull", "⇧K"], ["board.cull", "⇧X"], ["board.cull", "Z"], ["board.cull", "⌫"], ["board", "]"],
    ] as const) expect(has(mode, cap), `${mode} ${cap}`).toBe(true);
  });
});

describe("conflicts() sees a collision", () => {
  const map = (rows: Binding[]) => compile(rows);
  it("two rows on one chord in one mode", () => {
    expect(conflicts(map([{ mode: "m", keys: ["K"], verb: "a" }, { mode: "m", keys: ["k"], verb: "b" }]))).toHaveLength(1);
  });
  it("an inner row over an outer chord without `shadows`", () => {
    const outer: Binding = { mode: "m", keys: ["⏎"], verb: "a" };
    const inner: Binding = { mode: "m.n", keys: ["⏎"], verb: "b" };
    expect(conflicts(map([outer, inner]))).toHaveLength(1);
    expect(conflicts(map([outer, { ...inner, shadows: true }]))).toHaveLength(0);
  });
  it("only `x` and `!x` are exclusive; two unrelated facts can both hold", () => {
    expect(conflicts(map([{ mode: "m", keys: ["P"], verb: "a", when: "job" }, { mode: "m", keys: ["P"], verb: "b", when: "!job" }]))).toHaveLength(0);
    expect(conflicts(map([{ mode: "m", keys: ["P"], verb: "a", when: "job" }, { mode: "m", keys: ["P"], verb: "b", when: "draft" }]))).toHaveLength(1);
  });
  it("a field row and a page row never fire together; '*' overlaps every field", () => {
    expect(conflicts(map([{ mode: "m", keys: ["Esc"], verb: "a" }, { mode: "m", keys: ["Esc"], verb: "b", field: "q" }]))).toHaveLength(0);
    expect(conflicts(map([{ mode: "m", keys: ["Esc"], verb: "a", field: "*" }, { mode: "m", keys: ["Esc"], verb: "b", field: "q" }]))).toHaveLength(1);
  });
  it("a sibling mode is not an overlap", () => {
    expect(conflicts(map([{ mode: "board.cull", keys: ["1"], verb: "a" }, { mode: "board.pair", keys: ["1"], verb: "b" }]))).toHaveLength(0);
  });
  it("a `shadows` with nothing under it is a problem", () => {
    expect(problems(map([{ mode: "m.n", keys: ["Q"], verb: "a", shadows: true }]))).toHaveLength(1);
  });
});

describe("resolve: modes", () => {
  it("modePath walks innermost first", () => {
    expect(modePath("board.cull")).toEqual(["board.cull", "board"]);
  });
  it("keys change meaning per mode: 1 opens a lane on the Floor and picks left in a pair", () => {
    expect(verbOf(press({ key: "1" }), "floor")).toBe("open-lane");
    expect(verbOf(press({ key: "1" }), "board.pair")).toBe("left");
  });
  it("an inner mode sees the outer mode's rows", () => {
    expect(verbOf(press({ key: "]" }), "board.cull")).toBe("packet");
  });
  it("a declared shadow wins: ⏎ commits in the cull, opens the next packet on the bare board", () => {
    expect(verbOf(press({ key: "Enter" }), "board.cull", new Set(["desk"]))).toBe("commit");
    expect(verbOf(press({ key: "Enter" }), "board")).toBe("open-next");
    expect(verbOf(press({ key: "Enter" }), "board.review", new Set(["desk"]))).toBeNull();
  });
  it("⇧1 focuses a lane; 1 opens it", () => {
    expect(verbOf(press({ key: "!", code: "Digit1", shiftKey: true }), "floor")).toBe("focus-lane");
  });
  it("when: audio adds Space play and M spawn to the cull", () => {
    expect(verbOf(press({ key: "m" }), "board.cull")).toBeNull();
    expect(verbOf(press({ key: "m" }), "board.cull", new Set(["audio"]))).toBe("spawn-mv");
  });
  it("⌘Z undoes in the cull; Ctrl+K is the browser's, not a keep", () => {
    expect(verbOf(press({ key: "z", ctrlKey: true }), "board.cull")).toBe("undo");
    expect(verbOf(press({ key: "k", ctrlKey: true }), "board.cull")).toBeNull();
  });
  it("the matched cap and its index reach the handler (reason 1-4)", () => {
    const m = resolve(KEYMAP, press({ key: "3" }), "board.cull", none);
    expect(m && { cap: m.cap, index: m.index }).toEqual({ cap: "3", index: 2 });
  });
});

describe("resolve: guards", () => {
  const field = (name: string): TargetInfo => ({ editable: true, field: name, control: false });
  it("a letter typed into a field is text, not a verdict", () => {
    expect(verbOf(press({ key: "k" }, { target: field("") }), "board.cull")).toBeNull();
  });
  it("a row opts into one named field: Esc clears the Library search, nothing else", () => {
    expect(verbOf(press({ key: "Escape" }, { target: field("search") }), "library")).toBe("clear-search");
    expect(verbOf(press({ key: "Escape" }), "library")).toBe("back");
    expect(verbOf(press({ key: "Escape" }, { target: field("other") }), "library")).toBeNull();
  });
  it("a held K decides ONE item; a held arrow walks", () => {
    expect(verbOf(press({ key: "k" }, { repeat: true }), "board.cull")).toBeNull();
    expect(verbOf(press({ key: "ArrowRight" }, { repeat: true }), "board.cull")).toBe("next");
  });
  it("a refused repeat does not fall through to an outer row", () => {
    const m = compile([{ mode: "o", keys: ["Q"], verb: "outer", repeat: true }, { mode: "o.i", keys: ["Q"], verb: "inner", shadows: true }]);
    expect(resolve(m, press({ key: "q" }, { repeat: true }), "o.i", none)).toBeNull();
  });
  it("Enter on a focused button is the button's", () => {
    const onButton: TargetInfo = { editable: false, field: "", control: true };
    expect(verbOf(press({ key: "Enter" }, { target: onButton }), "floor")).toBeNull();
    expect(verbOf(press({ key: "Enter" }), "floor")).toBe("open-next");
  });
});

describe("targetInfo reads the press's element", () => {
  const el = (o: { tag?: string; attrs?: Record<string, string>; editableAncestor?: boolean; field?: string; ce?: boolean }): ElementLike => ({
    tagName: o.tag ?? "DIV",
    isContentEditable: o.ce ?? false,
    getAttribute: (n) => o.attrs?.[n] ?? null,
    closest: (sel) => {
      if (sel.startsWith("[data-keyfield]")) return o.field === undefined ? null : { getAttribute: () => o.field ?? null };
      return o.editableAncestor === true ? {} : null;
    },
  });
  it("an input is editable and carries its field name", () => {
    expect(targetInfo(el({ tag: "INPUT", field: "search" }))).toEqual({ editable: true, field: "search", control: true });
  });
  it("an open combobox takes printable keys as type-ahead", () => {
    expect(targetInfo(el({ editableAncestor: true })).editable).toBe(true);
  });
  it("a role=tab owns Enter", () => {
    expect(targetInfo(el({ attrs: { role: "tab" } })).control).toBe(true);
  });
  it("nothing focused is nothing", () => {
    expect(targetInfo(null)).toEqual(NO_TARGET);
  });
});

describe("keyTable is drawn from the same rows", () => {
  it("the cull draws the prototype's desk keymap, in its order", () => {
    expect(keyTable(KEYMAP, "board.cull", { facts: new Set(["desk"]) })).toEqual([
      { keys: ["K"], does: "keep" },
      { keys: ["X"], does: "reject" },
      { keys: ["U"], does: "undecide" },
      { keys: ["1", "2", "3", "4"], does: "reason" },
      { keys: ["←", "→"], does: "move" },
      { keys: ["⇧K", "⇧X"], does: "row" },
      { keys: ["Z"], does: "zoom" },
      { keys: ["⌫"], does: "undo" },
      { keys: ["⏎"], does: "commit" },
    ]);
  });
  it("an audio packet adds play and spawn MV", () => {
    const rows = keyTable(KEYMAP, "board.cull", { facts: new Set(["audio"]) }).map((r) => r.does);
    expect(rows).toContain("play");
    expect(rows).toContain("spawn MV");
  });
  it("a field draws its own rows (the review note editor)", () => {
    expect(keyTable(KEYMAP, "board.review", { field: "note" })).toEqual([
      { keys: ["Tab"], does: "directive" },
      { keys: ["⏎"], does: "attach" },
      { keys: ["Esc"], does: "cancel" },
    ]);
  });
});
