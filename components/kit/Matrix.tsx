// THE TRIAL MATRIX. Styles down, mechanisms across; the scene's source frame
// pinned beside it, because every judgement is "did the shot survive" and the shot
// has to be in view to say so. Read by ROW (a style that holds on every mechanism,
// or none) and by COLUMN (a mechanism that fails every style is a bad lane) before
// reading totals.
//
// Pure layout: the cells are whatever the caller renders (Tile, mostly).

export function Scene({
  label,
  aside,
  children,
}: {
  /** Names the region for a screen reader: "Scene s01". */
  label: string;
  /** The pinned source: a `<Plate>`, its caption, its chips. */
  aside: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="k-scene" aria-label={label}>
      <aside className="k-scene__aside">{aside}</aside>
      {children}
    </section>
  );
}

export interface MatrixColumn {
  id: string;
  /** The mechanism's id, in caps. */
  head: React.ReactNode;
  /** What it is: "words only · seed 3". */
  sub?: React.ReactNode;
}

export interface MatrixRow {
  id: string;
  /** The style: name, family, and (unless read-only) the row keys. */
  head: React.ReactNode;
  /** One cell per column, in order. */
  cells: React.ReactNode[];
}

export function Matrix({ label, columns, rows }: { label: string; columns: MatrixColumn[]; rows: MatrixRow[] }) {
  const min = columns.length > 2 ? 200 : 240;
  return (
    <div className="k-mx">
      <div
        className="k-grid"
        role="group"
        aria-label={label}
        style={{ gridTemplateColumns: `clamp(150px, 11vw, 190px) repeat(${columns.length}, minmax(${min}px, 1fr))` }}
      >
        <div />
        {columns.map((c) => (
          <div key={c.id} className="k-colh">
            <div className="k-caps">{c.head}</div>
            {c.sub && <div>{c.sub}</div>}
          </div>
        ))}
        {rows.map((r) => (
          <MatrixRowCells key={r.id} row={r} />
        ))}
      </div>
    </div>
  );
}

function MatrixRowCells({ row }: { row: MatrixRow }) {
  return (
    <>
      <div className="k-rowh">{row.head}</div>
      {row.cells}
    </>
  );
}

/** A row's head: the style's name in italic, its family beneath. */
export function RowHead({ name, meta, children }: { name: string; meta?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <>
      <div className="k-rowh__nm">{name}</div>
      {meta && <div className="k-rowh__fm">{meta}</div>}
      {children}
    </>
  );
}
