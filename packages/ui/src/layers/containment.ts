// WHAT A MODAL LAYER BORROWS FROM THE PAGE, AND GIVES BACK: the scroll lock and the
// focus it took. Both pure over injected environments; live.ts supplies the DOM.
//
// The scroll lock is v1's (components/ui/layers.ts `createScrollLock`) unchanged in
// behaviour, because each rule in it was paid for:
//   · reference-counted, not toggled: each Modal used to capture the overflow the
//     previous one left, so closing out of order restored `overflow: ''` under a
//     dialog that was still open;
//   · BOTH html and body: the scroll container here is documentElement, and locking
//     body alone left the page scrolling 1465px behind an open dialog on one wheel;
//   · padded by the vanished scrollbar, so the page behind does not jump sideways.
//
// Focus return is new as a pure rule (modal-stack focus-and-scroll-containment):
// the opener is captured AT OPEN, never looked up at close (by then it is a control
// inside the closing panel), and if it is gone by close time focus falls to a
// surviving landmark instead of the document root. A kind that never took focus
// (the tooltip) returns none.

import { POLICY, type LayerKind } from "./stack.ts";

type Styled<K extends string> = { style: Record<K, string> };

export type LockEnv = {
  readonly html: Styled<"overflow">;
  readonly body: Styled<"overflow" | "paddingRight">;
  /** The scrollbar width that disappears with the lock. */
  readonly gap: number;
};

export type ScrollLock = {
  acquire(id: string): "lock" | "none";
  release(id: string): "unlock" | "none";
};

export function createScrollLock(env: () => LockEnv | null): ScrollLock {
  const holders = new Set<string>();
  let saved: { env: LockEnv; html: string; body: string; pad: string } | null = null;
  return {
    acquire(id) {
      if (holders.has(id)) return "none";
      holders.add(id);
      if (holders.size > 1) return "none";
      const e = env();
      if (e === null) return "none";
      saved = { env: e, html: e.html.style.overflow, body: e.body.style.overflow, pad: e.body.style.paddingRight };
      e.html.style.overflow = "hidden";
      e.body.style.overflow = "hidden";
      if (e.gap > 0) e.body.style.paddingRight = `${e.gap}px`;
      return "lock";
    },
    release(id) {
      if (!holders.delete(id) || holders.size > 0 || saved === null) return "none";
      const { env: e, html, body, pad } = saved;
      saved = null;
      e.html.style.overflow = html;
      e.body.style.overflow = body;
      e.body.style.paddingRight = pad;
      return "unlock";
    },
  };
}

export type Focusable = { readonly isConnected: boolean; focus(options?: { preventScroll?: boolean }): void };

/**
 * Where focus goes when a layer closes: its opener if still in the document, else the
 * landmark - unless the kind's policy says focus never moved in (a tooltip), in which
 * case nowhere: the user's focus is left exactly where it is (WCAG 1.4.13).
 */
export function focusAfterClose<T extends Focusable>(kind: LayerKind, opener: T | null, landmark: T | null): T | null {
  if (!POLICY[kind].returnsFocus) return null;
  if (opener?.isConnected === true) return opener;
  return landmark?.isConnected === true ? landmark : null;
}
