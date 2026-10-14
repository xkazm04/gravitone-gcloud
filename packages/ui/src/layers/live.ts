// THE ONE LIVE LAYER STACK: the app's instance of stack.ts, its outside-press
// listener and its scroll lock. Escape does NOT route here - the keymap dispatcher
// (keymap/dispatch.ts) holds the app's only keydown listener and asks this stack.
//
// v1 installed a document keydown AND pointerdown listener while anything was open;
// the pointerdown half is kept (installed only while the stack is non-empty, so a
// closed menu does not listen to every press on the page), the keydown half moved.

import { createScrollLock, type LockEnv } from "./containment.ts";
import { EMPTY_STACK, POLICY, closing, outsidePress, push, remove, type DismissReason, type LayerEntry, type LayerStack } from "./stack.ts";

let stack: LayerStack = EMPTY_STACK;
const listeners = new Set<() => void>();

const lockEnv = (): LockEnv | null =>
  typeof document === "undefined"
    ? null
    : { html: document.documentElement, body: document.body, gap: window.innerWidth - document.documentElement.clientWidth };
const lock = createScrollLock(lockEnv);

function onPointerDown(e: PointerEvent): void {
  for (const id of outsidePress(stack, e.target)) closeLayer(id, "outside");
}

function set(next: LayerStack): void {
  if (next === stack) return;
  const wasOpen = stack.entries.length > 0;
  stack = next;
  const isOpen = stack.entries.length > 0;
  if (typeof document !== "undefined" && wasOpen !== isOpen) {
    if (isOpen) document.addEventListener("pointerdown", onPointerDown);
    else document.removeEventListener("pointerdown", onPointerDown);
  }
  for (const l of listeners) l();
}

/** The live stack, for the dispatcher and for `useSyncExternalStore`. */
export const layerStack = (): LayerStack => stack;

export function subscribeLayers(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Push; a modal also holds the scroll lock. Returns the remover (idempotent, by identity). */
export function pushLayer(entry: LayerEntry): () => void {
  set(push(stack, entry));
  const modal = POLICY[entry.kind].modal;
  if (modal) lock.acquire(entry.id);
  let gone = false;
  return () => {
    if (gone) return;
    gone = true;
    set(remove(stack, entry.id));
    if (modal) lock.release(entry.id);
  };
}

/**
 * Run the close action of `id` and every layer above it, top-down, each once. They
 * stay on the stack, leaving, until their owners unmount them - which for the Board
 * sheet is the route change its close asked for.
 */
export function closeLayer(id: string, reason: DismissReason): void {
  const r = closing(stack, id);
  set(r.stack);
  for (const e of r.close) e.close(reason);
}
