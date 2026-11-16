// THE STUDIO'S GLOBAL LAYER (spark fable-ten, package C): ⌘K opens Jump from any screen, the
// Jump dialog then owns the keyboard, Escape closes it and gives focus back, ⌘/ draws the key
// sheet and never fires while typing, and the sheet draws every row a press could reach - from
// the table itself, so a binding added without its sheet row is impossible, not merely untested.
import { describe, expect, it } from "vitest";

import { BINDINGS, KEYMAP } from "../src/keymap/bindings.ts";
import { helpModes, helpTable } from "../src/keymap/help.ts";
import { GLOBAL, compile, conflicts, keyTable, problems, type Binding } from "../src/keymap/keymap.ts";
import { globalReachable, pageMode, route, type Decision, type KeyInput } from "../src/keymap/route.ts";
import { NO_TARGET, type TargetInfo } from "../src/keymap/target.ts";
import { focusAfterClose } from "../src/layers/containment.ts";
import { EMPTY_STACK, push, type LayerEntry, type LayerKind, type LayerStack } from "../src/layers/stack.ts";

const entry = (id: string, kind: LayerKind, more: Partial<LayerEntry> = {}): LayerEntry => ({ id, kind, close: () => undefined, ...more });
const stackOf = (...es: LayerEntry[]): LayerStack => es.reduce(push, EMPTY_STACK);
const key = (k: string, more: Partial<KeyInput> = {}): KeyInput => ({ key: k, target: NO_TARGET, ...more });
const ctrl = (k: string, more: Partial<KeyInput> = {}): KeyInput => key(k, { ctrlKey: true, ...more });
const decide = (e: KeyInput, layers: LayerStack, page: string | null, facts: string[] = []): Decision =>
  route(KEYMAP, e, { layers, page, facts: new Set(facts) });
const verb = (d: Decision): string =>
  d.kind === "binding" ? `${d.match.binding.mode}/${d.match.binding.verb}` : d.kind === "close-layer" ? `close:${d.id}` : "none";

const inField = (name = ""): TargetInfo => ({ editable: true, field: name, control: true });
const JUMP = entry("jump", "dialog", { mode: "jump" });

describe("the chord opens Jump from anywhere in the shell", () => {
  it("Ctrl+K and ⌘K on a screen reach the global layer after the screen declined", () => {
    for (const page of ["floor", "library", "ledger", "part.frames", "board.cull"]) {
      expect(verb(decide(ctrl("k"), EMPTY_STACK, page)), page).toBe("studio/jump");
      expect(verb(decide(key("k", { metaKey: true }), EMPTY_STACK, page)), page).toBe("studio/jump");
    }
  });
  it("a screen that bound no keys still has the studio's", () => {
    expect(verb(decide(ctrl("k"), EMPTY_STACK, null))).toBe("studio/jump");
  });
  it("it is declared live in fields: mid-search in the Library, ⌘K still jumps", () => {
    expect(verb(decide(ctrl("k", { target: inField("search") }), EMPTY_STACK, "library"))).toBe("studio/jump");
  });
  it("a sheet does not stop it (the Board over the Floor); a confirm or a compose popover does", () => {
    expect(verb(decide(ctrl("k"), stackOf(entry("sheet", "sheet", { mode: "board.cull" })), "floor"))).toBe("studio/jump");
    expect(verb(decide(ctrl("k"), stackOf(entry("sheet", "sheet", { mode: "board.cull" }), entry("confirm", "dialog")), "floor"))).toBe("none");
    expect(verb(decide(ctrl("k"), stackOf(entry("compose", "popover", { mode: "compose" })), "projects"))).toBe("none");
    expect(globalReachable(stackOf(entry("zoom", "zoom"), entry("tip", "tooltip")))).toBe(true);
  });
  it("the bare letter is still the screen's: K without the modifier is not a jump", () => {
    expect(verb(decide(key("k"), EMPTY_STACK, "ledger"))).toBe("ledger/prev");
    expect(verb(decide(key("k"), EMPTY_STACK, "floor"))).toBe("none");
  });
  it("the shell's own scope is never the page: a screen mounted before it keeps its mode", () => {
    expect(pageMode([{ mode: "floor" }, { mode: GLOBAL }], EMPTY_STACK)).toBe("floor");
    expect(pageMode([{ mode: GLOBAL }], EMPTY_STACK)).toBeNull();
  });
});

describe("with Jump open, the layer beneath receives no key", () => {
  it("the Floor's C, 1 and ⏎ are nobody's while the dialog is up", () => {
    const s = stackOf(JUMP);
    for (const k of ["c", "1", "Enter", "b"]) expect(verb(decide(key(k), s, "floor")), k).toBe("none");
  });
  it("its own keys work: ↓ leaves the field for the rows, ⏎ in the field goes, arrows walk the rows", () => {
    const s = stackOf(JUMP);
    expect(verb(decide(key("ArrowDown", { target: inField("jump") }), s, "floor"))).toBe("jump/to-rows");
    expect(verb(decide(key("Enter", { target: inField("jump") }), s, "floor"))).toBe("jump/go");
    expect(verb(decide(key("ArrowUp"), s, "floor"))).toBe("jump/move");
  });
  it("⏎ on a focused row is the row's own link, not the dialog's", () => {
    expect(verb(decide(key("Enter", { target: { editable: false, field: "", control: true } }), stackOf(JUMP), "floor"))).toBe("none");
  });
  it("⌘K inside Jump opens nothing over it", () => {
    expect(verb(decide(ctrl("k", { target: inField("jump") }), stackOf(JUMP), "floor"))).toBe("none");
  });
});

describe("Escape closes Jump and restores focus", () => {
  it("Escape, in the field or on a row, closes the dialog (it binds no Escape of its own)", () => {
    expect(verb(decide(key("Escape", { target: inField("jump") }), stackOf(JUMP), "floor"))).toBe("close:jump");
    expect(verb(decide(key("Escape"), stackOf(entry("sheet", "sheet", { mode: "board.cull" }), JUMP), "floor"))).toBe("close:jump");
  });
  it("focus goes back to the control that had it when the dialog opened", () => {
    const opener = { isConnected: true, focus: () => undefined };
    const landmark = { isConnected: true, focus: () => undefined };
    expect(focusAfterClose("dialog", opener, landmark)).toBe(opener);
    expect(focusAfterClose("dialog", { ...opener, isConnected: false }, landmark)).toBe(landmark);
  });
});

describe("the key sheet (⌘/)", () => {
  it("opens from a screen, and never while typing in a field", () => {
    expect(verb(decide(ctrl("/"), EMPTY_STACK, "library"))).toBe("studio/keys");
    expect(verb(decide(ctrl("/", { target: inField("search") }), EMPTY_STACK, "library"))).toBe("none");
    expect(verb(decide(ctrl("/", { target: inField("") }), EMPTY_STACK, "floor"))).toBe("none");
  });
  it("a bare ? is no key of the studio's: it is a typed character (character-key criterion)", () => {
    expect(verb(decide(key("?", { shiftKey: true, code: "Slash" }), EMPTY_STACK, "floor"))).toBe("none");
  });
  it("draws the modes a press can reach, innermost first, the studio's last", () => {
    expect(helpModes("board.cull")).toEqual(["board.cull", "board", GLOBAL]);
    expect(helpModes(null)).toEqual([GLOBAL]);
    expect(helpTable(KEYMAP, "library", new Set()).map((s) => s.mode)).toEqual(["library", GLOBAL]);
  });
  it("each section is the mode's own keyTable under the screen's facts (the dispatcher's rows)", () => {
    const facts = new Set(["in-results"]);
    for (const s of helpTable(KEYMAP, "library", facts)) expect(s.rows).toEqual(keyTable(KEYMAP, s.mode, { facts }));
  });
  it("every drawable row of the real table appears on the sheet of its own mode", () => {
    for (const b of BINDINGS) {
      if (b.field !== undefined || b.keys.length === 0) continue;
      const facts = new Set(b.when !== undefined && !b.when.startsWith("!") ? [b.when] : []);
      const drawn = helpTable(KEYMAP, b.mode, facts).flatMap((s) => s.rows);
      const does = b.does ?? b.verb;
      expect(drawn.some((r) => r.does === does && b.keys.every((k) => r.keys.includes(k))), `${b.mode}/${b.verb}`).toBe(true);
    }
  });
  it("a binding added to the table is on the sheet with no other edit", () => {
    const added: Binding = { mode: "library", keys: ["Q"], verb: "quiet", does: "quiet" };
    const map = compile([...BINDINGS, added]);
    expect(helpTable(map, "library", new Set()).flatMap((s) => s.rows)).toContainEqual({ keys: ["Q"], does: "quiet" });
    expect(helpTable(KEYMAP, "library", new Set()).flatMap((s) => s.rows)).not.toContainEqual({ keys: ["Q"], does: "quiet" });
  });
  it("the studio's own section draws jump and keys once each, not the field-live twin", () => {
    expect(keyTable(KEYMAP, GLOBAL)).toEqual([
      { keys: ["⌘K"], does: "jump" },
      { keys: ["⌘/"], does: "keys" },
    ]);
  });
});

describe("the global layer is outer to every mode for the checker", () => {
  it("the real table is still sound", () => {
    expect(problems(KEYMAP)).toEqual([]);
    expect(conflicts(KEYMAP).map((c) => c.why)).toEqual([]);
  });
  it("a screen row on ⌘K without `shadows` is a conflict; with it, a declared win", () => {
    const g: Binding = { mode: GLOBAL, keys: ["⌘K"], verb: "jump" };
    const screen: Binding = { mode: "board.cull", keys: ["⌘K"], verb: "keep" };
    expect(conflicts(compile([g, screen]))).toHaveLength(1);
    expect(conflicts(compile([g, { ...screen, shadows: true }]))).toHaveLength(0);
    expect(problems(compile([g, { ...screen, shadows: true }]))).toEqual([]);
  });
});
