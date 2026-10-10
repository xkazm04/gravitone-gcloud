// THE LAYER STACK — what is open, in order, and who gets this key.
//
// Modal, the bell tray and the account panel each used to own a private copy of
// dismissal: a document keydown, an outside mousedown, focus return and (Modal)
// a scroll lock. Nothing could answer "what is on top", so:
//  · the app's key guards sniffed the DOM for aria-modal (lib/board/keys.ts) and
//    could not see the trays — role="group" by deliberate choice — so with the
//    bell open and focused on /board, A approved the picked batch behind it;
//  · every listener acted on one press, so Escape closed the tray AND the
//    Board's window listener emptied the multi-pick, and two nested Modals both
//    closed together;
//  · each Modal captured the overflow the previous one left, so closing out of
//    order restored `overflow: ''` under a dialog that was still open.
//
// Now a surface pushes an entry while it is open (`useLayer`), and ONE keydown
// and ONE pointerdown listener, installed while the stack is non-empty, route
// each event to the top entry only. The queries are pure and exported so the
// node lane asserts them (tests/golden-path/layer-stack.probe.spec.ts).
//
// THE HAND-OFF to window-level guards is `preventDefault()`, not the stack's
// contents. Document listeners run before window ones, and a dismiss pops the
// entry synchronously, so by the time the Board's listener asks the stack it is
// already empty. A dismissing Escape is therefore preventDefaulted, and
// boardKeyAction yields to a prevented Escape.
//
// NOT on the stack yet: Hint, Select and the three ContextMenus. They still
// stop their own Escape, and `escapeTarget` keeps yielding to `cancelBubble`
// (c6ac2db) so a popover inside a Modal closes first. They are the next adopters.

import { useEffect, useId, useRef, type RefObject } from "react";

export type LayerKind = "modal" | "tray" | "popover";
export type DismissReason = "escape" | "outside";

/** What a key event must offer the router — a KeyboardEvent, or a test's stand-in. */
export interface KeyEventLike {
  key: string;
  cancelBubble?: boolean;
  defaultPrevented?: boolean;
  preventDefault(): void;
}

export interface LayerEntry {
  id: string;
  kind: LayerKind;
  /** Is the node inside this layer's panel? */
  contains?: (node: unknown) => boolean;
  /** Is the node the control that opened it? A press there is the trigger's own toggle. */
  anchorContains?: (node: unknown) => boolean;
  dismiss?: (reason: DismissReason, e: KeyEventLike | null) => void;
  /** Non-Escape keys, delivered only while this layer owns the trap. */
  onKey?: (e: KeyEventLike) => void;
  /** False for a specimen seeded open on /kit: it is on screen, it is not the user's focus. */
  claimsKeys?: boolean;
}

/* ── pure queries ─────────────────────────────────────────────────────────── */

/** Who closes on this Escape: the top layer, unless something inside already handled it. */
export function escapeTarget(stack: readonly LayerEntry[], e: Pick<KeyEventLike, "cancelBubble" | "defaultPrevented"> | null = null): string | null {
  if (e?.cancelBubble || e?.defaultPrevented) return null;
  return stack.length ? stack[stack.length - 1].id : null;
}

/**
 * Which layers a press at `target` dismisses, top first. Walks down from the
 * top: a press inside a layer or on its anchor stops the walk (the anchor's own
 * onClick toggles it — dismissing here too would re-open it). A modal is never
 * dismissed by an outside press (its backdrop is its own control) and the walk
 * stops at it: what lies beneath a modal cannot have been pressed.
 */
export function outsidePress(stack: readonly LayerEntry[], target: unknown): string[] {
  const out: string[] = [];
  for (let i = stack.length - 1; i >= 0; i--) {
    const l = stack[i];
    if (l.contains?.(target) || l.anchorContains?.(target)) break;
    if (l.kind === "modal") break;
    out.push(l.id);
  }
  return out;
}

/** The modal whose Tab trap is live: the topmost one. */
export function trapOwner(stack: readonly LayerEntry[]): string | null {
  for (let i = stack.length - 1; i >= 0; i--) if (stack[i].kind === "modal") return stack[i].id;
  return null;
}

/** Does any open layer own the keyboard? */
export function claimsKeys(stack: readonly LayerEntry[]): boolean {
  return stack.some((l) => l.claimsKeys !== false);
}

/** The single keydown route: Escape to the top layer, anything else to the trap owner. */
export function routeKey(stack: readonly LayerEntry[], e: KeyEventLike): void {
  if (e.key === "Escape") {
    const id = escapeTarget(stack, e);
    if (id === null) return;
    stack.find((l) => l.id === id)?.dismiss?.("escape", e);
    e.preventDefault();
    return;
  }
  const owner = trapOwner(stack);
  if (owner !== null) stack.find((l) => l.id === owner)?.onKey?.(e);
}

/* ── the stack ────────────────────────────────────────────────────────────── */

export interface LayerStack {
  /** Push; returns the remover, which removes by identity and is idempotent. */
  push(entry: LayerEntry): () => void;
  list(): readonly LayerEntry[];
}

export function createLayerStack(onChange?: (size: number) => void): LayerStack {
  let stack: LayerEntry[] = [];
  return {
    push(entry) {
      stack = [...stack, entry];
      onChange?.(stack.length);
      let gone = false;
      return () => {
        if (gone) return;
        gone = true;
        stack = stack.filter((l) => l !== entry);
        onChange?.(stack.length);
      };
    },
    list: () => stack,
  };
}

/* ── the scroll lock ──────────────────────────────────────────────────────── */

interface Styled<K extends string> {
  style: Record<K, string>;
}
export interface LockEnv {
  html: Styled<"overflow">;
  body: Styled<"overflow" | "paddingRight">;
  /** The scrollbar width that disappears with the lock. */
  gap: number;
  onRestore?: () => void;
}

/**
 * Reference-counted: the first holder captures the originals and locks, the
 * last one out restores them — whatever order the holders leave in.
 *
 * `document.body` alone is NOT enough: here the scroll container is
 * documentElement (body is height-auto inside it), so locking body left the page
 * scrolling 1465px behind an open dialog on one wheel gesture. Lock both, and
 * pad for the scrollbar so the layout behind does not jump.
 */
export function createScrollLock(env: () => LockEnv | null) {
  const holders = new Set<string>();
  let saved: { env: LockEnv; html: string; body: string; pad: string } | null = null;
  return {
    acquire(id: string): "lock" | "none" {
      if (holders.has(id)) return "none";
      holders.add(id);
      if (holders.size > 1) return "none";
      const e = env();
      if (!e) return "none";
      saved = { env: e, html: e.html.style.overflow, body: e.body.style.overflow, pad: e.body.style.paddingRight };
      e.html.style.overflow = "hidden";
      e.body.style.overflow = "hidden";
      if (e.gap > 0) e.body.style.paddingRight = `${e.gap}px`;
      return "lock";
    },
    release(id: string): "unlock" | "none" {
      if (!holders.delete(id) || holders.size > 0 || !saved) return "none";
      const { env: e, html, body, pad } = saved;
      saved = null;
      e.html.style.overflow = html;
      e.body.style.overflow = body;
      e.body.style.paddingRight = pad;
      e.onRestore?.();
      return "unlock";
    },
  };
}

/* ── the live instance ────────────────────────────────────────────────────── */

const onKeyDown = (e: KeyboardEvent) => routeKey(live.list(), e);
const onPointerDown = (e: PointerEvent) => {
  const stack = live.list();
  for (const id of outsidePress(stack, e.target)) stack.find((l) => l.id === id)?.dismiss?.("outside", null);
};

const live = createLayerStack((size) => {
  if (typeof document === "undefined") return;
  // Installed while anything is open, and only then: a closed account menu no
  // longer listens to every press on the page.
  if (size === 1) {
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
  } else if (size === 0) {
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("pointerdown", onPointerDown);
  }
});

const lock = createScrollLock(() =>
  typeof document === "undefined"
    ? null
    : {
        html: document.documentElement,
        body: document.body,
        gap: window.innerWidth - document.documentElement.clientWidth,
      },
);

/** The layers open right now, bottom first. */
export function openLayers(): readonly LayerEntry[] {
  return live.list();
}

/** Push onto the live stack; a modal also holds the scroll lock. Returns the remover. */
export function pushLayer(entry: LayerEntry): () => void {
  const remove = live.push(entry);
  if (entry.kind === "modal") lock.acquire(entry.id);
  return () => {
    remove();
    if (entry.kind === "modal") lock.release(entry.id);
  };
}

/**
 * Be on the stack while `open`. Options are read through a ref at event time,
 * so an inline onDismiss (every consumer passes one) does not re-push the layer
 * on each render — the Modal lock effect learned that the hard way.
 */
export function useLayer(
  open: boolean,
  opts: {
    kind: LayerKind;
    panelRef: RefObject<HTMLElement | null>;
    anchorRef?: RefObject<HTMLElement | null>;
    onDismiss: (reason: DismissReason, e: KeyEventLike | null) => void;
    onKey?: (e: KeyEventLike) => void;
    /** Read at key time; a specimen seeded open on /kit answers false until it is toggled. */
    claimsKeys?: () => boolean;
  },
): void {
  const id = useId();
  const ref = useRef(opts);
  useEffect(() => {
    ref.current = opts;
  });
  useEffect(() => {
    if (!open) return;
    const has = (r: RefObject<HTMLElement | null> | undefined, n: unknown) =>
      Boolean(r?.current && n instanceof Node && r.current.contains(n));
    return pushLayer({
      id,
      kind: ref.current.kind,
      contains: (n) => has(ref.current.panelRef, n),
      anchorContains: (n) => has(ref.current.anchorRef, n),
      dismiss: (reason, e) => ref.current.onDismiss(reason, e),
      onKey: (e) => ref.current.onKey?.(e),
      get claimsKeys() {
        return ref.current.claimsKeys?.() ?? true;
      },
    });
  }, [open, id]);
}
