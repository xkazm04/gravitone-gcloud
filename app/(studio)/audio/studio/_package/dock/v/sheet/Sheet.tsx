"use client";

// THE SHEET'S TYPE (prototype dock-package, round 2, variant "sheet"): a step's body set as a document. A `Section` is
// a heading, one quiet Edit and its lines; a `Line` is a small quiet label over the value set large in the body face -
// the value is what is read. A blank is a dash, never a sentence. No field, no chip and no colour is drawn here: the
// page is read-only, and every change happens in the section's editor (the dialog). Kit candidates: SheetSection,
// SheetLines/SheetLine, SheetTable, TrackTabs.
import type { ReactNode } from "react";

import s from "./sheet.module.css";

export function SheetSection({ id, title, onEdit, edit = "Edit", aside, children }: {
  readonly id: string;
  readonly title: string;
  /** The section's one door to its editor. */
  readonly onEdit?: () => void;
  readonly edit?: string;
  readonly aside?: ReactNode;
  readonly children: ReactNode;
}) {
  const head = `sheet-${id}`;
  return (
    <section className={s.section} aria-labelledby={head}>
      <header className={s.secHead}>
        <h3 id={head} className={s.secTitle}>
          {title}
        </h3>
        {aside !== undefined && <span className={s.aside}>{aside}</span>}
        {onEdit !== undefined && (
          <button type="button" className={s.edit} onClick={onEdit} aria-label={`${edit} ${title}`}>
            {edit}
          </button>
        )}
      </header>
      {children}
    </section>
  );
}

/** A value, or the drawn blank. */
export function Value({ v }: { readonly v: string | null | undefined }) {
  if (v === null || v === undefined || v.trim() === "") {
    return (
      <span className={s.blank} aria-label="not set">
        —
      </span>
    );
  }
  return <>{v}</>;
}

export interface LineDef {
  readonly k: string;
  readonly v: string | null;
  /** Spans the whole row: a title, a list of names. */
  readonly wide?: boolean;
  /** A figure: digits, a code - set in the mono face so its characters line up. */
  readonly code?: boolean;
}

export function SheetLines({ lines, cols = 3 }: { readonly lines: readonly LineDef[]; readonly cols?: 2 | 3 | 4 }) {
  return (
    <dl className={s.lines} data-cols={cols}>
      {lines.map((l) => (
        <div key={l.k} className={s.line} data-wide={l.wide === true ? "" : undefined}>
          <dt className={s.k}>{l.k}</dt>
          <dd className={s.v} data-code={l.code === true ? "" : undefined}>
            <Value v={l.v} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Rows of a list set as a table: a number, the row's name read large, then its quiet figures. */
export function SheetTable({ label, head, rows }: {
  readonly label: string;
  readonly head: readonly string[];
  readonly rows: readonly { readonly key: string; readonly cells: readonly ReactNode[] }[];
}) {
  return (
    <table className={s.table} aria-label={label}>
      <thead>
        <tr>
          {head.map((h, i) => (
            <th key={`${h}:${i}`} scope="col" className={s.th}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className={s.tr}>
            {r.cells.map((c, i) => (
              <td key={i} className={i === 1 ? s.tdName : s.td}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Which track a per-track page reads: the numbers, the current one underlined. Drawn only for two tracks or more. */
export function TrackTabs({ titles, current, onPick }: { readonly titles: readonly string[]; readonly current: number; readonly onPick: (i: number) => void }) {
  if (titles.length < 2) return null;
  return (
    <div className={s.tabs} role="group" aria-label="track">
      {titles.map((t, i) => (
        <button key={i} type="button" className={s.tab} aria-pressed={i === current} aria-label={`track ${i + 1}, ${t.trim() === "" ? "untitled" : t}`} onClick={() => onPick(i)}>
          <span className={s.tabNo} aria-hidden="true">
            {i + 1}
          </span>
          <span className={s.tabTitle} aria-hidden="true">
            {t.trim() === "" ? "untitled" : t}
          </span>
        </button>
      ))}
    </div>
  );
}
