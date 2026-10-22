"use client";

// The opened run across the WHOLE screen (operator, 2026-10-22: "via modal to spread across whole
// screen comfortably"). Its head: the run's category, label and place among the packet's runs; its
// brief - what it tried to make (`aim`) and the attributes it is judged on (`checks`), the run's own
// words from its record; and a verdict on the whole run by click. Below, the run's variants; at the
// foot, the cull's own bar. A lens, not a dialog: the desk's keys keep working, and Z / Esc / the
// close cap return to the mosaic with the cursor on the run.
import { useRef, type ReactNode } from "react";

import type { BoardVerdict } from "../../board/boardGate.ts";
import { useLayer } from "../../layers/useLayer.ts";
import { Keycap } from "../keycaps/Keycaps.tsx";
import { VerdictPick } from "./VerdictPick.tsx";
import s from "./Runs.module.css";

export type RunModalProps = {
  readonly category: string;
  readonly label: string;
  readonly position: string;
  readonly aim?: string;
  readonly checks?: readonly string[];
  /** The whole run's verdict when every variant agrees, else undefined. */
  readonly runVerdict: BoardVerdict | undefined;
  readonly reasons: readonly string[];
  readonly maxReasons: number;
  readonly onRunVerdict: (v: BoardVerdict | null) => void;
  readonly onClose: () => void;
  /** Off on a /kit specimen. */
  readonly live?: boolean;
  readonly foot: ReactNode;
  readonly children: ReactNode;
};

export function RunModal({ category, label, position, aim, checks, runVerdict, reasons, maxReasons, onRunVerdict, onClose, live = true, foot, children }: RunModalProps) {
  const panel = useRef<HTMLDivElement | null>(null);
  useLayer(live, { kind: "zoom", panelRef: panel, onClose });
  return (
    <div ref={panel} className={s.modal} role="region" aria-label={`run ${label}`}>
      <header className={s.modalHead}>
        <div className={s.headLine}>
          <span className={s.eyebrow}>{category}</span>
          <h3 className={s.modalTitle}>{label}</h3>
          <span className={s.runPos}>{position}</span>
          <span className={s.whole}>
            <VerdictPick label="the whole run" verdict={runVerdict} reasons={reasons} maxReasons={maxReasons} onChange={onRunVerdict} size="sm" />
          </span>
          <button type="button" className={s.close} onClick={onClose} aria-label="back to the runs">
            <Keycap mode="board.cull" verb="zoom" />
          </button>
        </div>
        {(aim !== undefined || (checks !== undefined && checks.length > 0)) && (
          <div className={s.brief}>
            {aim !== undefined && <p className={s.aim}>{aim}</p>}
            {checks !== undefined && checks.length > 0 && (
              <ul className={s.checks} aria-label="judged on">
                {checks.map((c) => (
                  <li key={c} className={s.check}>
                    {c}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </header>
      <div className={s.modalBody}>{children}</div>
      <footer className={s.modalFoot}>{foot}</footer>
    </div>
  );
}
