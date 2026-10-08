// A POINTER GESTURE IS A MODE, AND A MODE HAS ONE OWNER OF ITS ENDING.
//
// Pan and drag both begin with a press and both can end in more ways than the
// author meant. Shipped drag code's defects are overwhelmingly exits nobody wrote
// and residue nobody swept — a highlight still lit on a lane after the pointer
// left, an auto-scroll that keeps scrolling after the drop, a window listener
// that outlives its drag. So there is exactly ONE function that ends a gesture,
// `end`, and every way out goes through it:
//
//   up             the pointer was released (a drop, or a click if it never armed)
//   escape         Escape, in the CAPTURE phase on window so no inner handler
//                  can eat it
//   pointercancel  the browser took the pointer (a touch became a scroll, a
//                  pen left range, the OS interrupted)
//   blur           the window lost focus, the tab was hidden, or focus moved from
//                  the surface to something else: the pointerup will be
//                  delivered to somebody else, or the user has changed task
//   dialog         an overlay opened over a live gesture — focus moved into it,
//                  or one is simply open on a frame tick
//   vanished       the caller's own per-frame check said the thing being dragged
//                  is gone (a poll refresh removed it)
//
// `end` is idempotent and does, in this order: removes every listener, stops the
// frame loop, releases pointer capture, lifts the selection lock, THEN tells the
// caller. The caller clears its own state in `onEnd` (the ghost, every lit target)
// — one owner each, never two.

import { overlayOpen } from "@/lib/board/keys";

import { refusedKey } from "../keyGuard";

export type Exit = "up" | "escape" | "pointercancel" | "blur" | "dialog" | "vanished";

export interface GestureSpec {
  pointerId: number;
  onMove(e: PointerEvent): void;
  /** Once per animation frame while live. Return an Exit to end the gesture. */
  frame?(): Exit | void;
  onEnd(exit: Exit, e: PointerEvent | null): void;
}

export interface Gesture {
  /** Take pointer capture on `surface` and lock text selection. Called when a
   *  press becomes a real gesture — a bare click never captures, so its trailing
   *  `click` event keeps its own target. */
  engage(surface: HTMLElement): void;
  end(exit: Exit): void;
  readonly live: boolean;
}

const OVERLAY = '[role="dialog"], [aria-modal="true"], dialog[open]';

export function startGesture(spec: GestureSpec): Gesture {
  let live = true;
  let surface: HTMLElement | null = null;
  let raf = 0;
  const html = document.documentElement;

  const onMove = (e: PointerEvent) => {
    if (e.pointerId === spec.pointerId) spec.onMove(e);
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerId === spec.pointerId) end("up", e);
  };
  const onCancel = (e: PointerEvent) => {
    if (e.pointerId === spec.pointerId) end("pointercancel", e);
  };
  const onKey = (e: KeyboardEvent) => {
    if (refusedKey(e)) return;
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    end("escape", null);
  };
  const onBlur = () => end("blur", null);
  // Focus leaving the surface for another element (not for nowhere: that is the
  // window's own blur, above) means something else has taken the keyboard.
  const onFocusOut = (e: FocusEvent) => {
    const to = e.relatedTarget as Node | null;
    if (to && surface && !surface.contains(to)) end("blur", null);
  };
  const onHidden = () => {
    if (document.hidden) end("blur", null);
  };
  // A dialog that takes focus is the common way an overlay arrives. It is told
  // apart from our own furniture by being outside the surface the gesture began on.
  const onFocusIn = (e: FocusEvent) => {
    const t = e.target as Element | null;
    if (!t || !t.closest) return;
    const overlay = t.closest(OVERLAY);
    if (overlay && !(surface && surface.contains(overlay))) end("dialog", null);
  };
  const tick = () => {
    if (!live) return;
    if (overlayOpen()) return end("dialog", null);
    const out = spec.frame?.();
    if (out) return end(out, null);
    raf = requestAnimationFrame(tick);
  };

  function end(exit: Exit, e: PointerEvent | null) {
    if (!live) return;
    live = false;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("blur", onBlur);
    document.removeEventListener("visibilitychange", onHidden);
    document.removeEventListener("focusin", onFocusIn);
    cancelAnimationFrame(raf);
    if (surface) {
      surface.removeEventListener("focusout", onFocusOut);
      try {
        if (surface.hasPointerCapture(spec.pointerId)) surface.releasePointerCapture(spec.pointerId);
      } catch {
        /* the pointer is already gone */
      }
      html.classList.remove("select-none");
    }
    spec.onEnd(exit, e);
  }

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onCancel);
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("blur", onBlur);
  document.addEventListener("visibilitychange", onHidden);
  document.addEventListener("focusin", onFocusIn);
  raf = requestAnimationFrame(tick);

  return {
    engage(el) {
      if (!live || surface) return;
      surface = el;
      el.addEventListener("focusout", onFocusOut);
      try {
        el.setPointerCapture(spec.pointerId);
      } catch {
        /* a synthetic pointer has nothing to capture */
      }
      html.classList.add("select-none");
    },
    end: (exit) => end(exit, null),
    get live() {
      return live;
    },
  };
}
