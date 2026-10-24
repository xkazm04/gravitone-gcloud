"use client";

// The opened run across the WHOLE screen (operator, 2026-10-22). Four bands, top to bottom:
//   head    left half: the run's category, label and place among the packet's runs, its USE (the
//           content it can serve, as stated at launch), what it tried to make (`aim`), a verdict on
//           the whole run by click and the note on the variant under the cursor (saved, or its field
//           while E is open); right half: the reference it was read from - not output.
//   body    the variants, as large as the screen leaves them (RunView).
//   checks  the attributes the run is judged on, one row across the full width.
//   foot    the cull's own bar.
// A lens, not a dialog: the desk's keys keep working, and Z / Esc / the close cap return to the
// mosaic with the cursor on the run.
import { useRef, type ReactNode } from "react";

import type { BoardVerdict } from "../../board/boardGate.ts";
import { useLayer } from "../../layers/useLayer.ts";
import { Plate } from "../desk/Plate.tsx";
import { Keycap } from "../keycaps/Keycaps.tsx";
import { VerdictPick, type VerdictReasons } from "./VerdictPick.tsx";
import s from "./Runs.module.css";

export type RunModalProps = {
  readonly category: string;
  readonly label: string;
  readonly position: string;
  readonly use?: string;
  readonly aim?: string;
  /** The prompt the run was drawn from (an idea's studio prompt), after the aim. */
  readonly prompt?: string;
  readonly checks?: readonly string[];
  /** The reference the run was read from (third-party, reference-only). */
  readonly reference?: string;
  /** The whole run's verdict when every variant agrees, else undefined. */
  readonly runVerdict: BoardVerdict | undefined;
  readonly reasons: VerdictReasons;
  readonly onRunVerdict: (v: BoardVerdict | null) => void;
  /** The note on the variant under the cursor: its words, or its field while it is being written. */
  readonly note?: ReactNode;
  readonly onClose: () => void;
  /** Off on a /kit specimen. */
  readonly live?: boolean;
  readonly foot: ReactNode;
  readonly children: ReactNode;
};

export function RunModal({ category, label, position, use, aim, prompt, checks, reference, runVerdict, reasons, onRunVerdict, note, onClose, live = true, foot, children }: RunModalProps) {
  const panel = useRef<HTMLDivElement | null>(null);
  useLayer(live, { kind: "zoom", panelRef: panel, onClose });
  return (
    <div ref={panel} className={s.modal} role="region" aria-label={`run ${label}`}>
      <header className={s.modalHead}>
        <div className={s.headWords}>
          <div className={s.headLine}>
            <span className={s.eyebrow}>{category}</span>
            <h3 className={s.modalTitle}>{label}</h3>
            <span className={s.runPos}>{position}</span>
          </div>
          <dl className={s.purpose}>
            <dt className={s.purposeKey}>use</dt>
            <dd className={use === undefined ? s.purposeNone : s.purposeVal}>{use ?? "not stated"}</dd>
            {aim !== undefined && (
              <>
                <dt className={s.purposeKey}>aim</dt>
                <dd className={s.purposeVal}>{aim}</dd>
              </>
            )}
            {prompt !== undefined && (
              <>
                <dt className={s.purposeKey}>prompt</dt>
                <dd className={s.purposeVal}>{prompt}</dd>
              </>
            )}
          </dl>
          <div className={s.headActs}>
            <VerdictPick label="the whole run" verdict={runVerdict} reasons={reasons} onChange={onRunVerdict} size="sm" />
            <button type="button" className={s.close} onClick={onClose} aria-label="back to the runs">
              <Keycap mode="board.cull" verb="zoom" />
            </button>
          </div>
          {note}
        </div>
        {reference !== undefined && (
          <figure className={s.headRef}>
            <Plate className={s.headRefFace} src={reference} alt={`reference ${label}`} />
            <figcaption className={s.runRefNote}>reference · not output</figcaption>
          </figure>
        )}
      </header>
      <div className={s.modalBody}>{children}</div>
      {checks !== undefined && checks.length > 0 && (
        <ul className={s.checksRow} aria-label="judged on">
          {checks.map((c) => (
            <li key={c} className={s.check}>
              {c}
            </li>
          ))}
        </ul>
      )}
      <footer className={s.modalFoot}>{foot}</footer>
    </div>
  );
}
