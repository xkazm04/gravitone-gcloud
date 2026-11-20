"use client";

// THE STREET'S OVERLAY FRAME (spark character-cores S1.5 WP7) - what a click on the timeline street opens instead of
// growing rows under it (the operator, 2026-11-20: "clickable images and points in the timeline rather open overlays").
// The same full-page ground as the core picker, under the studio header: a head with the node's name, its state and
// the run's ← → steps, and a body the caller fills.
//
// A modal dialog on the @gt/ui layer stack (kind "dialog"): it claims the keyboard, so the canvas keymap beneath is
// paused while it is open, and Esc reaches it as the stack's close. The stack captures the opener when the frame first
// mounts - the tile that was clicked - and returns focus there on close, however many steps the overlay took in
// between (the frame stays mounted across steps; only its body changes). Tab is held inside. ← → step the run unless
// focus is in a field (a direction being typed keeps its arrows).

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

import { targetInfo } from "@gt/ui/keymap/target";
import { useLayer } from "@gt/ui/layers/useLayer";

import { Gl, Kbd } from "../ui/kit.tsx";
import o from "./overlay.module.css";

const TABBABLE = 'button:not([disabled]), [href], input, select, textarea, video[controls], [tabindex]:not([tabindex="-1"])';

type Props = {
  /** The heading's id: the dialog is labelled by it. */
  readonly headId: string;
  readonly title: ReactNode;
  /** Beside the title: the node's facts (its time, state). */
  readonly facts?: ReactNode;
  /** The run's neighbours' names, for the step buttons' accessible names; absent, no steps are drawn. */
  readonly prevName?: string | undefined;
  readonly nextName?: string | undefined;
  readonly onStep?: (step: 1 | -1) => void;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly role?: string;
};

export function Overlay({ headId, title, facts, prevName, nextName, onStep, onClose, children, role = "node-overlay" }: Props) {
  const panel = useRef<HTMLElement | null>(null);
  useLayer(true, { kind: "dialog", panelRef: panel, onClose: () => onClose() });
  // After the layer has captured the opener: focus moves inside.
  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
  }, []);

  const onKey = (e: KeyboardEvent<HTMLElement>): void => {
    if (e.key === "Tab") {
      const stops = [...(panel.current?.querySelectorAll<HTMLElement>(TABBABLE) ?? [])].filter((el) => el.tabIndex >= 0);
      const a = stops[0];
      const z = stops[stops.length - 1];
      if (a === undefined || z === undefined) return;
      const here = document.activeElement;
      if (e.shiftKey && (here === a || here === panel.current)) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && here === z) {
        e.preventDefault();
        a.focus();
      }
      return;
    }
    if (onStep === undefined || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    if (e.altKey || e.ctrlKey || e.metaKey || targetInfo(e.target as HTMLElement).editable) return;
    e.preventDefault();
    e.stopPropagation();
    onStep(e.key === "ArrowRight" ? 1 : -1);
  };

  return (
    <section ref={panel} className={o.overlay} role="dialog" aria-modal="true" aria-labelledby={headId} data-role={role} tabIndex={-1} onKeyDown={onKey}>
      <div className={o.head}>
        <h2 id={headId}>{title}</h2>
        {facts}
        <span className={o.grow} />
        {onStep !== undefined && (
          <span className={o.steps}>
            <button type="button" className={o.btn} onClick={() => onStep(-1)} aria-label={`Previous: ${prevName ?? ""}`} aria-keyshortcuts="ArrowLeft" data-role="overlay-prev">
              <Gl name="prev" />
              <Kbd cap="←" />
            </button>
            <button type="button" className={o.btn} onClick={() => onStep(1)} aria-label={`Next: ${nextName ?? ""}`} aria-keyshortcuts="ArrowRight" data-role="overlay-next">
              <Kbd cap="→" />
              <Gl name="next" />
            </button>
          </span>
        )}
        <button type="button" className={o.btn} onClick={onClose} aria-label="Close" aria-keyshortcuts="Escape" data-role="overlay-close">
          <Gl name="x" />
          <Kbd verb="up" />
        </button>
      </div>
      {children}
    </section>
  );
}
