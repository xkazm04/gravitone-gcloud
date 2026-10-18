// LANE — ONE LAYER STACK OWNS ESCAPE, OUTSIDE-PRESS, THE TRAP AND THE LOCK.
//
// Modal, the bell tray and the account panel each carried a private copy of
// dismissal: their own document keydown, their own outside mousedown, their own
// scroll lock. Nothing could say what was on top, so the key guards sniffed the
// DOM for aria-modal (lib/board/keys.ts) and could not see the trays at all:
// with the bell open and focused on /board, A approved the picked batch behind
// it, and one Escape closed the tray AND emptied the Board's multi-pick.
//
// Asserted without a browser: the pure queries over a stack, the key router's
// hand-off to the window-level guards (preventDefault on dismiss), the
// reference-counted scroll lock over a style seam, and a source ratchet that the
// stack owns one listener of each kind. The three surfaces (Modal, the bell tray,
// the account panel) and the v1 Board retired in Phase 6 wave C; their wiring
// ratchets went with them, and the Board's keymap is a fixture below. The new
// world's stack is @gt/ui/layers (packages/ui/test/layers.test.ts).
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import {
  createLayerStack,
  createScrollLock,
  escapeTarget,
  openLayers,
  outsidePress,
  pushLayer,
  routeKey,
  trapOwner,
  type LayerEntry,
} from "@/components/ui/layers";

import { stripComments } from "./_helpers";

const src = (p: string) => stripComments(readFileSync(join(process.cwd(), p), "utf8"));

/** A node is just an identity here; `contains` is set membership. */
const node = (name: string) => ({ name });
const layer = (id: string, kind: LayerEntry["kind"], over: Partial<LayerEntry> = {}): LayerEntry => ({ id, kind, ...over });

/** A keydown a test can dispatch: records preventDefault like the DOM does. */
function key(k: string, over: { cancelBubble?: boolean; shiftKey?: boolean } = {}) {
  return {
    key: k,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    repeat: false,
    shiftKey: over.shiftKey ?? false,
    target: null,
    cancelBubble: over.cancelBubble ?? false,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
}

test("1 · an open tray is on the live stack", () => {
  const remove = pushLayer({ id: "bell", kind: "tray" });
  try {
    expect(openLayers().map((l) => l.id)).toEqual(["bell"]);
  } finally {
    remove();
  }
  expect(openLayers()).toEqual([]);
});

test("2 · one Escape closes the top layer only", () => {
  const stack = [layer("bell", "tray")];
  expect(escapeTarget(stack, key("Escape"))).toBe("bell");
});

test("2b · a dismissing Escape is preventDefaulted (critic)", () => {
  // The hand-off, in order: the stack's document listener pops the tray first,
  // synchronously; a window listener runs after with the stack ALREADY empty.
  // Only defaultPrevented carries the news across.
  const s = createLayerStack();
  let closed = 0;
  const remove = s.push(layer("bell", "tray", { dismiss: () => { closed++; remove(); } }));
  const e = key("Escape");
  routeKey(s.list(), e);
  expect(closed).toBe(1);
  expect(s.list()).toEqual([]);
  expect(e.defaultPrevented).toBe(true);

  const ls = src("components/ui/layers.ts");
  const at = ls.indexOf("export function routeKey");
  expect(at).toBeGreaterThan(-1);
  const body = ls.slice(at, ls.indexOf("\n}\n", at));
  expect(body).toMatch(/dismiss\?\.\([^)]*\)[^]*preventDefault\(\)/);
});

test("3 · nested modals: Escape pops the inner one; removal is by identity", () => {
  const s = createLayerStack();
  const closed: string[] = [];
  const rmA = s.push(layer("A", "modal", { dismiss: () => closed.push("A") }));
  const rmB = s.push(layer("B", "modal", { dismiss: () => closed.push("B") }));
  expect(escapeTarget(s.list(), key("Escape"))).toBe("B");
  routeKey(s.list(), key("Escape"));
  expect(closed).toEqual(["B"]);
  rmB();
  expect(escapeTarget(s.list(), key("Escape"))).toBe("A");
  rmB(); // idempotent: removing twice does not take A with it
  expect(s.list().map((l) => l.id)).toEqual(["A"]);
  rmA();
  expect(escapeTarget(s.list(), key("Escape"))).toBe(null);
});

test("4 · the scroll lock is reference-counted and restores the originals once", () => {
  const html = { style: { overflow: "auto" } };
  const body = { style: { overflow: "visible", paddingRight: "3px" } };
  let restores = 0;
  const lock = createScrollLock(() => ({ html, body, gap: 12, onRestore: () => restores++ }));
  expect(lock.acquire("A")).toBe("lock");
  expect(html.style.overflow).toBe("hidden");
  expect(body.style.overflow).toBe("hidden");
  expect(body.style.paddingRight).toBe("12px");
  expect(lock.acquire("B")).toBe("none");
  expect(lock.release("A")).toBe("none"); // out of order: B is still open
  expect(html.style.overflow).toBe("hidden");
  expect(lock.release("B")).toBe("unlock");
  expect(html.style.overflow).toBe("auto");
  expect(body.style.overflow).toBe("visible");
  expect(body.style.paddingRight).toBe("3px");
  expect(restores).toBe(1);
  expect(lock.release("B")).toBe("none");
  expect(restores).toBe(1);
});

test("5 · outside-press dismisses the trays above the press, never a modal, never via the anchor", () => {
  const inA = node("inA");
  const inB = node("inB");
  const bellButton = node("bell-button");
  const elsewhere = node("elsewhere");
  const A = layer("A", "modal", { contains: (n) => n === inA });
  const B = layer("B", "tray", { contains: (n) => n === inB, anchorContains: (n) => n === bellButton });
  expect(outsidePress([A, B], inA)).toEqual(["B"]);
  expect(outsidePress([A, B], bellButton)).toEqual([]);
  expect(outsidePress([A, B], inB)).toEqual([]);
  expect(outsidePress([A, B], elsewhere)).toEqual(["B"]);
  expect(outsidePress([B], elsewhere)).toEqual(["B"]);
  expect(outsidePress([A], elsewhere)).toEqual([]);
});

test("6 · only the top modal traps Tab", () => {
  expect(trapOwner([layer("A", "modal"), layer("B", "modal")])).toBe("B");
  expect(trapOwner([layer("A", "modal")])).toBe("A");
  expect(trapOwner([layer("T", "tray")])).toBe(null);
  const seen: string[] = [];
  const stack = [layer("A", "modal", { onKey: () => seen.push("A") }), layer("B", "modal", { onKey: () => seen.push("B") })];
  routeKey(stack, key("Tab"));
  expect(seen).toEqual(["B"]);
});

test("7 [guard] · a handled Escape (Hint inside a Modal) closes nothing", () => {
  const s = createLayerStack();
  let closed = 0;
  s.push(layer("A", "modal", { dismiss: () => closed++ }));
  const e = key("Escape", { cancelBubble: true });
  expect(escapeTarget(s.list(), e)).toBe(null);
  routeKey(s.list(), e);
  expect(closed).toBe(0);
});

test("8 · source ratchet: the stack owns one listener of each kind", () => {
  const ls = src("components/ui/layers.ts");
  expect(ls.match(/addEventListener\(\s*["']keydown["']/g)?.length ?? 0).toBe(1);
  expect(ls.match(/addEventListener\(\s*["']pointerdown["']/g)?.length ?? 0).toBe(1);
  expect(ls).not.toMatch(/addEventListener\(\s*["']mousedown["']/);
});
