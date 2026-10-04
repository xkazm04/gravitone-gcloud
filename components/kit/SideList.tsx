"use client";

// THE SIDE LIST: runs, cycles, families. A column of rows, each led by a status
// mark, the current one ruled in gold at its left edge. Below 860px it lies down
// into a horizontal strip. Rows carry a name and one line of facts; there is no
// slot for a sentence.

export function SideList({
  label,
  heading,
  children,
  aside,
  pinned,
}: {
  /** The list's accessible name. */
  label: string;
  /** The caps heading above it. */
  heading: string;
  children: React.ReactNode;
  /** Above the list, below the heading: a "new" row, an error, an empty state. */
  aside?: React.ReactNode;
  /** Rows that belong to the list's own controls, not to its data: "+ new run". */
  pinned?: React.ReactNode;
}) {
  return (
    <aside className="k-side" aria-label={label}>
      <div className="k-side__h k-caps">
        <span>{heading}</span>
      </div>
      {pinned && <ul className="k-list k-list--pinned">{pinned}</ul>}
      {aside}
      <ul className="k-list">{children}</ul>
    </aside>
  );
}

export function SideItem({
  glyph,
  title,
  meta,
  count,
  current = false,
  pressed,
  onSelect,
}: {
  /** A `<StatusGlyph>`. */
  glyph?: React.ReactNode;
  title: React.ReactNode;
  /** One line of facts. */
  meta?: React.ReactNode;
  /** A trailing number (family lists). */
  count?: number;
  current?: boolean;
  /** For a filter list: the row is a toggle, not a place. */
  pressed?: boolean;
  onSelect: () => void;
}) {
  const plain = !glyph && !meta;
  return (
    <li>
      <button
        type="button"
        className={`k-item${plain ? " k-item--plain" : ""}`}
        aria-current={pressed === undefined && current ? "true" : undefined}
        aria-pressed={pressed}
        onClick={onSelect}
      >
        {glyph && <span className="k-item__gl">{glyph}</span>}
        <span className="k-item__id">{title}</span>
        {plain && count !== undefined && <span className="k-muted k-num">{count}</span>}
        {meta && <span className="k-item__meta">{meta}</span>}
      </button>
    </li>
  );
}
