"use client";

// THE PROTOTYPE'S ONE DIALOG (prototype dock-package): every variant opens its detail on click in this, so the
// behaviour a dialog owes - a modal layer over the page, focus moved in and kept in, Esc and the scrim close it, focus
// handed back to what opened it, no rise under reduced motion - is written once and the variants differ only in how
// the panel LOOKS (`className`, `tone`). Candidate for @gt/ui at consolidation (with a /kit specimen).
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import s from "./dialog.module.css";

export interface DialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** The dialog's accessible name, and its heading unless `head` replaces it. */
  readonly title: string;
  readonly head?: ReactNode;
  readonly children: ReactNode;
  readonly foot?: ReactNode;
  /** The panel's look - the variant's own class. */
  readonly className?: string;
  readonly width?: "narrow" | "wide";
}

const FOCUSABLE = "a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";

export function Dialog({ open, onClose, title, head, children, foot, className, width = "narrow" }: DialogProps) {
  const reduce = useReducedMotion();
  const panel = useRef<HTMLDivElement | null>(null);
  const opener = useRef<Element | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const first = panel.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || panel.current === null) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const a = items[0];
      const z = items[items.length - 1];
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        z?.focus();
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a?.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, [open, onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className={s.layer}>
          <motion.div className={s.scrim} onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.18 }} />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className={`${s.panel} ${width === "wide" ? s.wide : ""} ${className ?? ""}`}
            initial={reduce ? false : { opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }}
          >
            <header className={s.head}>
              {head ?? (
                <h2 id={titleId} className={s.title}>
                  {title}
                </h2>
              )}
              {head !== undefined && (
                <span id={titleId} className={s.sr}>
                  {title}
                </span>
              )}
              <button type="button" className={s.close} onClick={onClose} aria-label={`close ${title}`}>
                <span aria-hidden="true">×</span>
              </button>
            </header>
            <div className={s.body}>{children}</div>
            {foot !== undefined && <footer className={s.foot}>{foot}</footer>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
