"use client";

// THE QUIET READ (variant "focus"): a step's values as label / value rows - one type scale, neutral ink, no chips, no
// colour. A blank is drawn as a dash (spoken "not set"), never explained. A row may be a door (its value opens the
// editor or the long list behind it); the row the lead is about carries the one focus tick. Kit candidate `ReadList`.
import type { ReactNode } from "react";

import s from "./focus.module.css";

export interface ReadRow {
  readonly key: string;
  readonly label: string;
  /** null or "" is the blank. */
  readonly value: string | null;
  /** The row is a door: its value opens what is behind it. */
  readonly open?: () => void;
}

export interface ReadGroup {
  readonly key: string;
  readonly label?: string;
  readonly rows: readonly ReadRow[];
  /** One quiet act on the group's heading line (its editor). */
  readonly action?: ReactNode;
}

function Value({ row }: { readonly row: ReadRow }) {
  const blank = row.value === null || row.value.trim() === "";
  const text = blank ? (
    <>
      <span aria-hidden="true">—</span>
      <span className={s.sr}>not set</span>
    </>
  ) : (
    row.value
  );
  if (row.open === undefined) return <span className={s.readValue} data-blank={blank ? "" : undefined}>{text}</span>;
  return (
    <button type="button" className={s.readDoor} data-blank={blank ? "" : undefined} onClick={row.open} aria-label={`${row.label}: ${blank ? "not set" : (row.value ?? "")}, open`}>
      <span className={s.readDoorText}>{text}</span>
      <span className={s.readChev} aria-hidden="true">
        ›
      </span>
    </button>
  );
}

export function ReadList({ groups, focus, label }: { readonly groups: readonly ReadGroup[]; readonly focus: string | null; readonly label: string }) {
  return (
    <div className={s.read} role="group" aria-label={label}>
      {groups.map((g) => (
        <section key={g.key} className={s.readGroup} aria-label={g.label ?? label} data-focus={focus === g.key ? "" : undefined}>
          {(g.label !== undefined || g.action !== undefined) && (
            <div className={s.readHead}>
              {g.label !== undefined && <h3 className={s.readLabel}>{g.label}</h3>}
              {g.action !== undefined && <span className={s.readAct}>{g.action}</span>}
            </div>
          )}
          <dl className={s.readRows}>
            {g.rows.map((r) => (
              <div key={r.key} className={s.readRow} data-focus={focus === r.key ? "" : undefined}>
                <dt className={s.readTerm}>{r.label}</dt>
                <dd className={s.readDd}>
                  <Value row={r} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
