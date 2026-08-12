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
//  · focus moves into the dialog on open and returns to the opener on close
//  · the BODY scrolls, not the page — header and footer stay put
//  · no colour literal: cyan/rose/white-alpha utilities are the rendered form
//    of the accents already declared in tokens.ts
//
// Entrance motion only (one fade + rise, on mount). globals.css disables all
// animation under prefers-reduced-motion, so nothing here needs its own guard.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

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

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      // Focus trap: Tab must not walk out of the dialog into the page behind
      // it, which is the difference between a modal and a decorative overlay.
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])',
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
      (openerRef.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <style>{MODAL_KEYFRAMES}</style>
      {/* Backdrop. Out of the tab order on purpose — the dialog traps focus and
          Escape is the keyboard way out; a full-screen tab stop is noise. */}
      <button
        aria-hidden
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-[var(--gt-ink)]/80 backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{ animation: "gt-modal-in 220ms var(--gt-ease) both" }}
        className={`glass-panel relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl sm:max-h-[85vh] sm:rounded-2xl ${className}`}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/8 bg-white/[0.02] px-5 py-4">
          <div className="min-w-0">
            {eyebrow}
            <h2 className="font-instrument mt-1 truncate text-xl text-white">{title}</h2>
            {subtitle && <div className="mt-1 text-sm text-slate-400">{subtitle}</div>}
          </div>
          <button
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

const MODAL_KEYFRAMES = `@keyframes gt-modal-in{from{opacity:0;transform:translate3d(0,14px,0)}to{opacity:1;transform:none}}`;
