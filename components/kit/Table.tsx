"use client";

// A TABLE THAT CAN BE READ BOTH WAYS. Heads that sort, a head that stays put while
// the rows scroll under it, and nothing else: no toolbar, no caption slot, no
// helper text. The sorted column says so with a mark on its head (a gold rule and a
// caret) and with `aria-sort`, never with a sentence.
//
// `DataTable` (Doc.tsx) stays for a fixed reading: a recipe, a ledger of credits.
// This is for rows that are worked: projects by update, cards by spend, assets by
// date. The rows are typed, the cells are drawn by the caller, and the sort keys
// are values, so the sort never has to read a rendered node.
//
// Sorting is stable and total: equal keys fall back to the row's id, then to the
// order the rows arrived in, so a re-sort never shuffles equal rows. Empty keys
// (null / undefined) sort last in both directions; a row with nothing to say about
// a column is never the "largest".

import { useMemo, useState } from "react";

import { Ghost } from "@/components/ui/signal";

export interface TableColumn<R> {
  id: string;
  /** The head, one or two words. */
  head: string;
  /** What the cell draws. */
  cell: (row: R) => React.ReactNode;
  /** The value the column sorts by. Absent: the column does not sort. */
  sortBy?: (row: R) => string | number | null | undefined;
  /** Right-aligned tabular figures. */
  num?: boolean;
}

export type SortDir = "asc" | "desc";
export interface TableSort {
  column: string;
  dir: SortDir;
}

export function Table<R extends { id: string }>({
  label,
  columns,
  rows,
  sort,
  defaultSort,
  onSort,
  maxHeight,
  empty = "no rows",
  onOpenRow,
}: {
  /** The table's accessible name. Required: a page can hold several. */
  label: string;
  columns: readonly TableColumn<R>[];
  rows: readonly R[];
  /** Controlled sort. Omit for the table to hold its own. */
  sort?: TableSort | null;
  defaultSort?: TableSort;
  onSort?: (next: TableSort) => void;
  /** A CSS length. Set it and the head sticks over a scrolling body. */
  maxHeight?: string;
  /** The Ghost's accessible name when there are no rows. */
  empty?: string;
  /** A row that opens (Enter / click). Rows become focusable buttons of their own. */
  onOpenRow?: (row: R) => void;
}) {
  const [own, setOwn] = useState<TableSort | null>(defaultSort ?? null);
  const active = sort !== undefined ? sort : own;

  const sorted = useMemo(() => {
    const col = active ? columns.find((c) => c.id === active.column) : undefined;
    if (!col?.sortBy || !active) return rows;
    const key = col.sortBy;
    const sign = active.dir === "asc" ? 1 : -1;
    return rows
      .map((r, i) => ({ r, i, k: key(r) }))
      .sort((a, b) => {
        const an = a.k === null || a.k === undefined;
        const bn = b.k === null || b.k === undefined;
        if (an !== bn) return an ? 1 : -1;
        if (!an && !bn) {
          const d =
            typeof a.k === "number" && typeof b.k === "number"
              ? a.k - b.k
              : String(a.k).localeCompare(String(b.k), undefined, { numeric: true });
          if (d !== 0) return d * sign;
        }
        return a.r.id.localeCompare(b.r.id) || a.i - b.i;
      })
      .map((x) => x.r);
  }, [rows, columns, active]);

  const pick = (col: TableColumn<R>) => {
    // First press ascends, a second descends, a third on a different column starts over.
    const next: TableSort =
      active?.column === col.id ? { column: col.id, dir: active.dir === "asc" ? "desc" : "asc" } : { column: col.id, dir: "asc" };
    if (sort === undefined) setOwn(next);
    onSort?.(next);
  };

  if (rows.length === 0) {
    return (
      <div className="k-tbl-empty">
        <Ghost shape="row" count={3} label={empty} />
      </div>
    );
  }

  return (
    <div
      className={`k-tbl${maxHeight ? " k-tbl--sticky" : ""}`}
      style={maxHeight ? { maxHeight } : undefined}
      // A scroller must be reachable by keyboard to be scrolled by one.
      tabIndex={maxHeight ? 0 : undefined}
      role="region"
      aria-label={label}
    >
      <table>
        <thead>
          <tr>
            {columns.map((c) => {
              const on = active?.column === c.id;
              const dir = on ? active.dir : null;
              return (
                <th
                  key={c.id}
                  scope="col"
                  className={`k-caps${c.num ? " k-tbl__num" : ""}${on ? " k-tbl__on" : ""}`}
                  aria-sort={dir ? (dir === "asc" ? "ascending" : "descending") : c.sortBy ? "none" : undefined}
                >
                  {c.sortBy ? (
                    <button type="button" onClick={() => pick(c)}>
                      {c.head}
                      <svg viewBox="0 0 10 14" aria-hidden="true" className="k-tbl__caret" data-dir={dir ?? "none"}>
                        <path className="k-tbl__up" d="M5 1 L9 6 H1 Z" />
                        <path className="k-tbl__dn" d="M5 13 L9 8 H1 Z" />
                      </svg>
                    </button>
                  ) : (
                    c.head
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr
              key={r.id}
              tabIndex={onOpenRow ? 0 : undefined}
              className={onOpenRow ? "k-tbl__open" : undefined}
              onClick={onOpenRow ? () => onOpenRow(r) : undefined}
              onKeyDown={
                onOpenRow
                  ? (e) => {
                      if (e.key === "Enter" && e.target === e.currentTarget) onOpenRow(r);
                    }
                  : undefined
              }
            >
              {columns.map((c) => (
                <td key={c.id} className={c.num ? "k-tbl__num" : undefined}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
