"use client";

// A SHEET: heavy content gets its own full-screen surface, not a corner of the
// page. The candidate comparison (source beside candidate at full width) and a
// style's document are both sheets. Same dialog as Modal (focus trap, Escape,
// scroll lock), sized to the window, with previous / next arrows at its edges.
//
// The caller owns the keys: ← and → step, K X U decide. The arrows are the same
// two actions for a pointer.

import { ChevronLeft, ChevronRight } from "lucide-react";

import Modal from "@/components/ui/Modal";

export function Sheet({
  open,
  onClose,
  title,
  eyebrow,
  onPrev,
  onNext,
  prevLabel = "Previous",
  nextLabel = "Next",
  footer,
  actions,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Caps line above the title; a `<span className="k-eb k-caps">`. */
  eyebrow?: React.ReactNode;
  /** Absent = no arrow. A disabled end is `undefined` too. */
  onPrev?: () => void;
  onNext?: () => void;
  prevLabel?: string;
  nextLabel?: string;
  footer?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} eyebrow={eyebrow} footer={footer} actions={actions} variant="sheet">
      {children}
      {(onPrev || onNext) && (
        <>
          <button type="button" className="k-parrow k-parrow--prev" onClick={onPrev} disabled={!onPrev} aria-label={prevLabel}>
            <ChevronLeft className="h-6 w-6" aria-hidden />
          </button>
          <button type="button" className="k-parrow k-parrow--next" onClick={onNext} disabled={!onNext} aria-label={nextLabel}>
            <ChevronRight className="h-6 w-6" aria-hidden />
          </button>
        </>
      )}
    </Modal>
  );
}
