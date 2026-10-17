// LANE — ONE KEYMAP: the resolver, the guard and the disclosure are one object (node).
//
// <Keycaps> drew a table while a hand-rolled `switch` bound the keys elsewhere
// behind its own guard, so the drawing and the behaviour drifted: Ctrl+K stamped
// a keep on the cull, and Enter on a checkbox was the grid's. components/ui/
// signal/keymap.ts declares bindings once and derives the resolver, the window
// binding and the rows. Asserted here over the pure resolver, with two retired
// keymaps as fixtures: the forge cull's (its grid retired in Phase 3) and the v1
// Board's (retired with lib/board in Phase 6 wave C). Their bindings are still the
// sharpest test of the resolver.
import { test, expect } from "@playwright/test";

import { activeKeymaps, defineKeymap, keycapsRows, resolveKey } from "@/components/ui/signal/keymap";

/** The retired lib/board/keys.ts BOARD_KEYMAP, verbatim: the v1 Board's whole keymap, a
 *  fixture of the resolver now (the v1 Board retired in Phase 6 wave C; the new Board binds
 *  through @gt/ui/keymap, held by packages/ui/test/keymap.test.ts). */
const BOARD_KEYMAP = defineKeymap<"approve" | "reject" | "clear" | "next" | "prev" | "loupe" | "close" | "undo">({
  id: "board",
  bindings: [
    { keys: ["A"], does: "approve", action: "approve" },
    { keys: ["X"], does: "reject", action: "reject" },
    { keys: ["U"], does: "clear", action: "clear" },
    { keys: ["J"], does: "next", action: "next", repeat: true },
    { keys: ["K"], does: "previous", action: "prev", repeat: true },
    { keys: ["Enter"], does: "loupe", action: "loupe" },
    { keys: ["Esc"], does: "close", action: "close", repeat: true },
    { keys: ["Z"], does: "undo", action: "undo" },
  ],
});

/** The retired app/foundry/cullKeymap.ts, verbatim: a fixture of the resolver now. */
const CULL = defineKeymap<"move" | "keep" | "reject" | "clear" | "undo" | "next-undecided" | "compare">({
  id: "foundry-cull",
  bindings: [
    { keys: ["←", "→", "↑", "↓"], does: "move", action: "move", repeat: true },
    { keys: ["K"], does: "keep", action: "keep" },
    { keys: ["X"], does: "reject", action: "reject" },
    { keys: ["U"], does: "clear", action: "clear" },
    { keys: ["Z"], does: "undo", action: "undo" },
    { keys: ["N"], does: "next undecided", action: "next-undecided" },
    { keys: ["Enter"], does: "compare", action: "compare" },
  ],
});

const el = (tagName: string, extra: Record<string, unknown> = {}) => ({ tagName, closest: () => null, getAttribute: () => null, ...extra });
const NO_LAYERS = { layers: [] as const };

test("keymap 1: a chord is the browser's — Ctrl+K no longer keeps", () => {
  expect(resolveKey(CULL, { key: "k", ctrlKey: true }, NO_LAYERS)).toBe(null);
  expect(resolveKey(CULL, { key: "k", metaKey: true }, NO_LAYERS)).toBe(null);
  expect(resolveKey(CULL, { key: "k" }, NO_LAYERS)).toBe("keep");
  expect(resolveKey(CULL, { key: "K" }, NO_LAYERS)).toBe("keep"); // caps lock is not a different verb
});

test("keymap 2: a held key decides once; a held arrow still walks", () => {
  expect(resolveKey(CULL, { key: "x", repeat: true }, NO_LAYERS)).toBe(null);
  expect(resolveKey(CULL, { key: "ArrowRight", repeat: true }, NO_LAYERS)).toBe("move");
  expect(resolveKey(CULL, { key: "ArrowUp" }, NO_LAYERS)).toBe("move");
});

test("keymap 3: an open combobox takes the letter as type-ahead", () => {
  const open = el("DIV", { closest: (sel: string) => (sel.includes("aria-expanded='true'") ? {} : null) });
  expect(resolveKey(CULL, { key: "x", target: open as never }, NO_LAYERS)).toBe(null);
  expect(resolveKey(CULL, { key: "x", target: el("INPUT") as never }, NO_LAYERS)).toBe(null);
  expect(resolveKey(CULL, { key: "x", target: el("DIV") as never }, NO_LAYERS)).toBe("reject");
});

test("keymap 4: Enter on a focused control is the control's — in EVERY keymap", () => {
  const checkbox = el("DIV", { getAttribute: (n: string) => (n === "role" ? "checkbox" : null) });
  for (const map of [CULL, BOARD_KEYMAP]) {
    expect(resolveKey(map as never, { key: "Enter", target: checkbox as never }, NO_LAYERS), map.id).toBe(null);
    expect(resolveKey(map as never, { key: "Enter", target: el("BUTTON") as never }, NO_LAYERS), map.id).toBe(null);
    expect(resolveKey(map as never, { key: "Enter", target: el("BODY") as never }, NO_LAYERS), map.id).not.toBe(null);
  }
  expect(resolveKey(CULL, { key: "Enter" }, NO_LAYERS)).toBe("compare");
});

test("keymap 5: the disclosure is the bindings — adding one changes it with no second edit", () => {
  expect(keycapsRows(CULL)).toEqual(CULL.bindings.map(({ keys, does }) => ({ keys, does })));
  const small = defineKeymap({ id: "t", bindings: [{ keys: ["Q"], does: "quit", action: "quit" as const }] });
  const grown = defineKeymap({ id: "t", bindings: [...small.bindings, { keys: ["W"], does: "wake", action: "wake" as const }] });
  expect(keycapsRows(grown).length).toBe(keycapsRows(small).length + 1);
  // The cull still draws what it drew before the move.
  expect(keycapsRows(CULL).map((r) => `${r.keys.join("")}=${r.does}`)).toEqual([
    "←→↑↓=move",
    "K=keep",
    "X=reject",
    "U=clear",
    "Z=undo",
    "N=next undecided",
    "Enter=compare",
  ]);
});

test("keymap: an overlay owns the keyboard, but Escape stays one-press-one-layer", () => {
  expect(resolveKey(CULL, { key: "k" }, { overlay: true, layers: [] })).toBe(null);
  expect(resolveKey(BOARD_KEYMAP, { key: "Escape" }, { overlay: true, layers: [] })).toBe("close");
  expect(resolveKey(BOARD_KEYMAP, { key: "Escape", defaultPrevented: true }, { layers: [] })).toBe(null);
  expect(resolveKey(BOARD_KEYMAP, { key: "Escape" }, { layers: [{ id: "bell", kind: "tray" }] })).toBe(null);
});

test("keymap: the Board's keys resolve to what they say", () => {
  for (const b of BOARD_KEYMAP.bindings) {
    const k = b.keys[0] === "Esc" ? "Escape" : b.keys[0];
    expect(resolveKey(BOARD_KEYMAP, { key: k }, NO_LAYERS), b.does).toBe(b.action);
  }
  expect(activeKeymaps()).toEqual([]); // nothing mounted in the node lane
});
