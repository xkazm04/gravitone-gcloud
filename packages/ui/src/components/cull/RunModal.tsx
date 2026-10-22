"use client";

// The opened run across the WHOLE screen (operator, 2026-10-22: "via modal to spread across whole
// screen comfortably"): a head (the run's category, its label, where it sits among the packet's runs),
// the run itself at most three variants to a row, and the cull's own bottom bar - the same keys and
// the same commit as the mosaic under it. A lens, not a dialog: the desk's keys keep working, and Z /
// Esc / the close cap return to the mosaic with the cursor on the run.
import { useRef, type ReactNode } from "react";

import { useLayer } from "../../layers/useLayer.ts";
import { Keycap } from "../keycaps/Keycaps.tsx";
import s from "./Runs.module.css";

export type RunModalProps = {
  readonly category: string;
  readonly label: string;
  readonly position: string;
  readonly onClose: () => void;
  /** Off on a /kit specimen. */
  readonly live?: boolean;
  readonly foot: ReactNode;
  readonly children: ReactNode;
};

export function RunModal({ category, label, position, onClose, live = true, foot, children }: RunModalProps) {
  const panel = useRef<HTMLDivElement | null>(null);
  useLayer(live, { kind: "zoom", panelRef: panel, onClose });
  return (
    <div ref={panel} className={s.modal} role="region" aria-label={`run ${label}`}>
      <header className={s.modalHead}>
        <span className={s.eyebrow}>{category}</span>
        <h3 className={s.modalTitle}>{label}</h3>
        <span className={s.runPos}>{position}</span>
        <button type="button" className={s.close} onClick={onClose} aria-label="back to the runs">
          <Keycap mode="board.cull" verb="zoom" />
        </button>
      </header>
      <div className={s.modalBody}>{children}</div>
      <footer className={s.modalFoot}>{foot}</footer>
    </div>
  );
}
