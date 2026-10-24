import { describe, expect, it } from "vitest";

import { KEYMAP } from "../src/keymap/bindings.ts";
import { pageMode, route, type Decision, type KeyInput } from "../src/keymap/route.ts";
import { NO_TARGET } from "../src/keymap/target.ts";
import { createScrollLock, focusAfterClose, type LockEnv } from "../src/layers/containment.ts";
import {
  EMPTY_STACK, activeMode, closing, escapeTarget, outsidePress, push, remove, top, trapOwner,
  type DismissReason, type LayerEntry, type LayerKind, type LayerStack,
} from "../src/layers/stack.ts";

const closed: { id: string; reason: DismissReason }[] = [];
const entry = (id: string, kind: LayerKind, more: Partial<LayerEntry> = {}): LayerEntry => ({
  id, kind, close: (reason) => closed.push({ id, reason }), ...more,
});
const stackOf = (...es: LayerEntry[]): LayerStack => es.reduce(push, EMPTY_STACK);
const key = (k: string, more: Partial<KeyInput> = {}): KeyInput => ({ key: k, target: NO_TARGET, ...more });
const decide = (e: KeyInput, layers: LayerStack, page: string | null, facts: string[] = []): Decision =>
  route(KEYMAP, e, { layers, page, facts: new Set(facts) });
const verb = (d: Decision): string => (d.kind === "binding" ? d.match.binding.verb : d.kind === "close-layer" ? `close:${d.id}` : "none");

describe("the stack holds entries by identity", () => {
  it("push is idempotent per id; remove is by id and a no-op for an unknown id", () => {
    const s = stackOf(entry("a", "dialog"));
    expect(push(s, entry("a", "dialog"))).toBe(s);
    expect(remove(s, "nope")).toBe(s);
    expect(remove(s, "a").entries).toEqual([]);
  });
  it("closing a layer with layers above it closes them first, top-down, once each", () => {
    const s = stackOf(entry("sheet", "sheet"), entry("dialog", "dialog"), entry("menu", "popover"));
    const r = closing(s, "sheet");
    expect(r.close.map((e) => e.id)).toEqual(["menu", "dialog", "sheet"]);
    expect(closing(r.stack, "sheet").close).toEqual([]);
    expect(top(r.stack)).toBeUndefined();
  });
});

describe("Escape closes one thing", () => {
  it("the top live layer, not the one beneath", () => {
    const s = stackOf(entry("sheet", "sheet", { mode: "board.cull" }), entry("zoom", "zoom"));
    expect(verb(decide(key("Escape"), s, "floor"))).toBe("close:zoom");
  });
  it("an Escape an inner control already spent closes nothing", () => {
    expect(verb(decide(key("Escape", { defaultPrevented: true }), stackOf(entry("d", "dialog")), "floor"))).toBe("none");
  });
  it("a URL layer that is leaving owns no input: a second Escape does not navigate back twice", () => {
    const s = stackOf(entry("floor-menu", "popover"), entry("sheet", "sheet", { mode: "board.cull" }));
    const after = closing(s, "sheet").stack;
    expect(after.entries).toHaveLength(2);
    expect(verb(decide(key("Escape"), after, "floor"))).toBe("close:floor-menu");
    expect(verb(decide(key("Escape"), closing(after, "floor-menu").stack, "floor"))).toBe("none");
  });
  it("the top layer's own mode may back out of an inner state first (the calendar's selected day)", () => {
    const s = stackOf(entry("month", "sheet", { mode: "calendar" }));
    expect(verb(decide(key("Escape"), s, "floor", ["day"]))).toBe("clear-day");
    expect(verb(decide(key("Escape"), s, "floor"))).toBe("close:month");
  });
  it("with no layer open, Escape is the page's (the Library's back-out cascade)", () => {
    expect(verb(decide(key("Escape"), EMPTY_STACK, "library"))).toBe("back");
  });
  it("Escape into a named field inside a layer reaches that field's row (cancel the note)", () => {
    const s = stackOf(entry("sheet", "sheet", { mode: "board.review" }));
    expect(verb(decide(key("Escape", { target: { editable: true, field: "note", control: false } }), s, "floor"))).toBe("cancel-note");
  });
});

describe("the active mode", () => {
  it("is the top claiming layer's mode: the sheet's desk, not the Floor beneath", () => {
    const s = stackOf(entry("sheet", "sheet", { mode: "board.cull" }));
    expect(verb(decide(key("1"), s, "floor"))).toBe("keep");
    expect(verb(decide(key("c"), s, "floor"))).toBe("none");
  });
  it("a claiming layer with no mode (a confirm) blocks the page's rows", () => {
    expect(activeMode(stackOf(entry("confirm", "dialog")), "floor")).toBeNull();
    expect(verb(decide(key("c"), stackOf(entry("confirm", "dialog")), "floor"))).toBe("none");
  });
  it("the zoom does not claim keys: the cull still decides through it", () => {
    const s = stackOf(entry("sheet", "sheet", { mode: "board.cull" }), entry("zoom", "zoom"));
    expect(verb(decide(key("5"), s, "floor"))).toBe("reject");
  });
  it("a /kit specimen that does not claim keys leaves the page live", () => {
    const s = stackOf(entry("spec", "dialog", { claimsKeys: () => false }));
    expect(activeMode(s, "floor")).toBe("floor");
  });
  it("the page mode skips a mode a layer owns, so a leaving sheet's desk goes quiet", () => {
    const s = closing(stackOf(entry("sheet", "sheet", { mode: "board.cull" })), "sheet").stack;
    const scopes = [{ mode: "floor" }, { mode: "board.cull" }];
    expect(pageMode(scopes, s)).toBe("floor");
    expect(verb(decide(key("5"), s, pageMode(scopes, s)))).toBe("none");
  });
});

describe("outside presses and the trap", () => {
  const inside = (node: unknown) => node === "panel";
  it("a popover closes on an outside press; the dialog beneath it does not", () => {
    const s = stackOf(entry("dialog", "dialog"), entry("menu", "popover", { contains: inside }));
    expect(outsidePress(s, "page")).toEqual(["menu"]);
  });
  it("a press inside the popover, or on its anchor, closes nothing", () => {
    const s = stackOf(entry("menu", "popover", { contains: inside, anchorContains: (n) => n === "anchor" }));
    expect(outsidePress(s, "panel")).toEqual([]);
    expect(outsidePress(s, "anchor")).toEqual([]);
  });
  it("the topmost live modal owns the focus trap", () => {
    const s = stackOf(entry("a", "dialog"), entry("menu", "popover"), entry("b", "dialog"));
    expect(trapOwner(s)).toBe("b");
    expect(trapOwner(closing(s, "b").stack)).toBe("a");
  });
  it("escapeTarget is the top live entry", () => {
    expect(escapeTarget(stackOf(entry("a", "dialog"), entry("b", "popover")), false)).toBe("b");
    expect(escapeTarget(EMPTY_STACK, false)).toBeNull();
  });
});

describe("the scroll lock is counted, not toggled (v1)", () => {
  const env = (): LockEnv & { html: { style: { overflow: string } }; body: { style: { overflow: string; paddingRight: string } } } => ({
    html: { style: { overflow: "auto" } },
    body: { style: { overflow: "visible", paddingRight: "3px" } },
    gap: 15,
  });
  it("the first holder locks, the last one out restores, in any order", () => {
    const e = env();
    const lock = createScrollLock(() => e);
    expect(lock.acquire("a")).toBe("lock");
    expect(e.body.style.paddingRight).toBe("15px");
    expect(lock.acquire("b")).toBe("none");
    expect(lock.release("a")).toBe("none");
    expect(e.html.style.overflow).toBe("hidden");
    expect(lock.release("b")).toBe("unlock");
    expect([e.html.style.overflow, e.body.style.overflow, e.body.style.paddingRight]).toEqual(["auto", "visible", "3px"]);
  });
});

describe("focus returns to the opener", () => {
  const node = (isConnected: boolean) => ({ isConnected, focus: () => undefined });
  it("the opener when it survives, else the landmark, never the void", () => {
    const opener = node(true);
    const landmark = node(true);
    expect(focusAfterClose("dialog", opener, landmark)).toBe(opener);
    expect(focusAfterClose("dialog", node(false), landmark)).toBe(landmark);
    expect(focusAfterClose("dialog", null, node(false))).toBeNull();
  });
  it("a tooltip moves no focus on close, even with its opener and a landmark alive (WCAG 1.4.13)", () => {
    expect(focusAfterClose("tooltip", node(true), node(true))).toBeNull();
    expect(focusAfterClose("popover", node(true), node(true))).not.toBeNull();
  });
});

describe("the tooltip kind (a hover or focus disclosure)", () => {
  const tip = (more: Partial<LayerEntry> = {}) => entry("tip", "tooltip", { contains: (n) => n === "tip", anchorContains: (n) => n === "glyph", ...more });
  it("one Escape dismisses it without the pointer or focus moving, and only it", () => {
    const s = stackOf(entry("sheet", "sheet", { mode: "board.cull" }), tip());
    expect(verb(decide(key("Escape"), s, "floor"))).toBe("close:tip");
    expect(verb(decide(key("Escape"), closing(s, "tip").stack, "floor"))).toBe("close:sheet");
  });
  it("does not claim the keyboard: the page's rows, and a layer's mode beneath, keep firing", () => {
    expect(verb(decide(key("c"), stackOf(tip()), "floor"))).toBe("calendar");
    expect(verb(decide(key("1"), stackOf(entry("sheet", "sheet", { mode: "board.cull" }), tip()), "floor"))).toBe("keep");
  });
  it("Escape in a named field still reaches the tip first: the dismissal is not an inner back-out", () => {
    const s = stackOf(entry("sheet", "sheet", { mode: "board.review" }), tip());
    expect(verb(decide(key("Escape", { target: { editable: true, field: "note", control: false } }), s, "floor"))).toBe("close:tip");
  });
  it("an outside press closes it and keeps walking; a press on its glyph or inside it does not", () => {
    const s = stackOf(entry("menu", "popover", { contains: (n) => n === "panel" }), tip());
    expect(outsidePress(s, "page")).toEqual(["tip", "menu"]);
    expect(outsidePress(s, "panel")).toEqual(["tip"]);
    expect(outsidePress(stackOf(tip()), "glyph")).toEqual([]);
    expect(outsidePress(stackOf(tip()), "tip")).toEqual([]);
  });
  it("is never the focus-trap owner, so a dialog beneath it keeps its trap", () => {
    expect(trapOwner(stackOf(tip()))).toBeNull();
    expect(trapOwner(stackOf(entry("d", "dialog"), tip()))).toBe("d");
  });
});
