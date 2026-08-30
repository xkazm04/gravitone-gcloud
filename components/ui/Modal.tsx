"use client";

// MODAL — the shared overlay this design language did not have yet.
//
// Added for the Script step, whose notebook is 19 facts, 3 mechanisms and 4
// reversals: far too much to inline on a phase surface, and exactly the kind of
// content globals.css's `.scroll-y` comment anticipates ("modals size their
// content to FIT — these exist so that when a small viewport forces a scroll
// anyway, the scrollbar is ours and not the OS chrome").
//
// Contract:
//  · portalled to <body>, so a `overflow-hidden` shell (StudioFrame) cannot clip it
//  · Escape closes; the backdrop closes; the page behind cannot scroll
//  · focus moves into the dialog on open, and on close returns to the opener —
//    or to the surface's own <main> when the opener did not survive the dialog
//  · the BODY scrolls, not the page — header and footer stay put
//  · no colour literal: every colour here is a Tailwind utility (white-alpha
//    hairlines, and `bg-[var(--gt-ink)]/80` on the backdrop), which is the
//    rendered form of what tokens.ts declares — see the scoped colour-literal
//    rule at the top of that file
//
// Entrance motion only: the app's shared `.gt-rise` (globals.css) at this
// surface's own weight, 14px over 220ms. It used to be a `gt-modal-in` keyframe
// declared in this file and injected by a <style> tag on every open — one of
// three near-identical copies. globals.css disables all animation under
// prefers-reduced-motion, so nothing here needs its own guard.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * Hand focus back when the dialog closes: to the opener while it is still in the
 * document, and to the surface's own <main> when it is not.
 *
 * The line this replaces was `openerRef.current?.focus?.()`, unconditionally.
 * Focusing a DETACHED node is a silent no-op, so on every flow where the
 * dialog's own confirm removes the control it was opened FROM, focus fell to
 * <body> — and app/library/ContextMenu.tsx already states what that costs: "a
 * dismissed menu that leaves focus on <body> strands a keyboard user at the top
 * of the document". Measured on the Research step: Clear opens "clear this
 * research?", confirming runs `doClear`, and `run.reset()` lands in the SAME
 * commit as the close — so `ready` goes false, the Clear button unmounts with
 * the dialog, and the restore focused a node that was already gone.
 * ProjectsMatrix's per-row Delete is the same shape one page over.
 *
 * ContextMenu's own guard (`if (opener && document.contains(opener))`) is the
 * right test and half the answer: it SKIPS a pointless focus() and moves focus
 * nowhere, so its opener-is-gone case also ends on <body>. A restore needs a
 * destination, not just a condition.
 *
 * <main> is that destination, and it is chosen rather than nearest-to-hand. From
 * <body> the next Tab restarts at the top of the document and walks the
 * wordmark, three module links, the bell and the account menu before reaching
 * anything the user was doing; from <main> it reaches the first control of the
 * surface the dialog was opened over, and a screen reader announces the landmark
 * on the way. StudioFrame does NOT render one — it is chrome (aurora, nav,
 * account controls) wrapped around `children` — so the landmark belongs to each
 * view, and ProjectsView, LibraryView and StudioView each declare tabIndex={-1}
 * on their own <main> for this. A surface with no <main> at all (the playground
 * bench) keeps the old behaviour: there is no landmark to hand focus to, and
 * inventing one from here would be guessing at someone else's layout.
 *
 * The RESULT of focus() is read rather than assumed, because focus() has exactly
 * one failure mode and it is silence. `isConnected` cannot see an opener that is
 * still in the document but no longer focusable — disabled while the dialog was
 * open, collapsed behind a section — and `document.activeElement` afterwards
 * sees both cases. focus() is synchronous, so there is nothing to wait for.
 */
function restoreFocus(opener: Element | null): void {
  if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
  const landed = document.activeElement;
  if (landed && landed !== document.body) return;
  const main = document.querySelector("main");
  if (!main) return;
  // <main> takes programmatic focus only while it is focusable. The three views
  // declare the attribute; setting it here too is not belt-and-braces but the
  // same rule this function exists for — focus() on a <main> without it is one
  // more silent no-op, and a view added later must not be able to re-open the
  // defect by forgetting an attribute.
  if (!main.hasAttribute("tabindex")) main.tabIndex = -1;
  // preventScroll: the page behind the dialog is already where the user left it,
  // and yanking it to the top of <main> on close would be its own surprise.
  main.focus({ preventScroll: true });
}

export default function Modal({
  open,
  onClose,
  title,
  eyebrow,
  subtitle,
  footer,
  children,
  className = "max-w-4xl",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: React.ReactNode;
  subtitle?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<Element | null>(null);

  // The lock effect below must run ONCE per open, and it used to key on
  // `[open, onClose]` while every single consumer passes an inline arrow for
  // onClose. So any unrelated re-render of the owning surface — a job tick, a
  // keystroke in a field behind the dialog — tore down the keydown listener,
  // unlocked the page, re-measured the scrollbar gap and re-locked, mid-lock,
  // with a `panelRef.current?.focus()` that yanked focus back out of whatever
  // the user was typing in. Reading onClose through a ref makes the component
  // robust to the calling convention all of its consumers already use, instead
  // of asking each of them for a useCallback.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => setMounted(true), []);

  // `mounted` is in the condition AND the deps, and both halves are load-bearing.
  // This component returns null until `mounted` flips, so on a first render with
  // `open` already true the effect used to run against a panel that did not
  // exist: `panelRef.current?.focus()` silently no-opped, `open` never changed,
  // and the effect never ran again — so a Modal MOUNTED open never received
  // focus, against this file's own contract four comment-lines above ("focus
  // moves into the dialog on open"). It also locked the page scroll for a dialog
  // that was not on screen yet. Every consumer today mounts closed and toggles,
  // which is why nothing has hit it; the contract should not depend on that.
  useEffect(() => {
    if (!open || !mounted) return;
    openerRef.current = document.activeElement;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      // Focus trap: Tab must not walk out of the dialog into the page behind
      // it, which is the difference between a modal and a decorative overlay.
      if (e.key !== "Tab" || !panelRef.current) return;
      // The disabled guard has to cover every control type, not just buttons.
      // This selector read `button:not([disabled]),input,select,textarea`, so a
      // disabled input — or an `input[type="hidden"]`, which matches `input` and
      // can never take focus — could be picked as `first` or `last`. Then
      // `first.focus()` is a silent no-op and the wrap does not happen: Tab walks
      // out of the dialog into the page behind it, which is precisely the
      // difference this block exists to enforce. The sr-only radios <Segmented>
      // renders are still matched — they are clipped, not disabled or hidden.
      const items = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),' +
          'select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!e.shiftKey && (active === last || !panelRef.current.contains(active))) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && (active === first || active === panelRef.current)) {
        e.preventDefault();
        last.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    // Scroll lock. `document.body` alone is NOT enough: on this page the scroll
    // container is documentElement (body is height-auto inside it), so locking
    // body left the page scrolling freely behind the open dialog — measured at
    // 1465px of background travel on one wheel gesture, which lands you somewhere
    // else when you close. Lock BOTH, and pad for the scrollbar that disappears
    // with it so the layout behind doesn't jump.
    const html = document.documentElement;
    const prev = {
      html: html.style.overflow,
      body: document.body.style.overflow,
      pad: document.body.style.paddingRight,
    };
    const gap = window.innerWidth - html.clientWidth;
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    if (gap > 0) document.body.style.paddingRight = `${gap}px`;
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      html.style.overflow = prev.html;
      document.body.style.overflow = prev.body;
      document.body.style.paddingRight = prev.pad;
      restoreFocus(openerRef.current);
    };
  }, [open, mounted]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      {/* Backdrop. A DIV, not a button: it used to be `<button aria-hidden
          tabIndex={-1}>`, which is an ARIA violation — aria-hidden on a
          focusable element hides from assistive tech something the browser will
          still hand focus to (tabIndex={-1} mitigates the tab order without
          resolving the contradiction). It has no keyboard affordance and needs
          none: the dialog traps focus and Escape is the keyboard way out, so a
          full-screen tab stop would be noise. Click-to-dismiss is a mouse
          convenience layered on top of a keyboard route that already works. */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-[var(--gt-ink)]/80 backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{ "--gt-rise-y": "14px" } as React.CSSProperties}
        className={`gt-rise glass-panel relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl sm:max-h-[85vh] sm:rounded-2xl ${className}`}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/8 bg-white/[0.02] px-5 py-4">
          <div className="min-w-0">
            {eyebrow}
            <h2 className="font-instrument mt-1 truncate text-xl text-white">{title}</h2>
            {subtitle && <div className="mt-1 text-sm text-slate-400">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg border border-white/10 p-2 text-white/60 transition hover:border-white/25 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="scroll-y grow px-5 py-5">{children}</div>

        {footer && (
          <footer className="shrink-0 border-t border-white/8 bg-white/[0.02] px-5 py-3">{footer}</footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
