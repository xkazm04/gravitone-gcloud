// THE DOCUMENT SURFACE, for what is read rather than judged: a style's recipe,
// observables, negative and evidence ledger; a run's findings. A gold caps label at
// the left, the matter at the right, a hairline between sections.

export function Doc({ children }: { children: React.ReactNode }) {
  return <div className="k-doc">{children}</div>;
}

/** The line under a document's title: a mark and a fact ("proven"). */
export function DocLede({ children }: { children: React.ReactNode }) {
  return <div className="k-dhead"><div className="k-dhead__stl">{children}</div></div>;
}

export function DocSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="k-dsec">
      <h3 className="k-caps">{label}</h3>
      <div>{children}</div>
    </section>
  );
}

/** Prose in the work's own voice: display italic. */
export function Rule({ children }: { children: React.ReactNode }) {
  return <p className="k-rule">{children}</p>;
}

export function DefList({ items }: { items: { term: string; value: React.ReactNode }[] }) {
  return (
    <dl className="k-deflist">
      {items.map((it) => (
        <div key={it.term} style={{ display: "contents" }}>
          <dt>{it.term}</dt>
          <dd>{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A few numbers, large, each under its word. */
export function Stats({ items }: { items: { n: React.ReactNode; label: string }[] }) {
  return (
    <div className="k-stats">
      {items.map((s) => (
        <div key={s.label}>
          <b>{s.n}</b>
          {s.label}
        </div>
      ))}
    </div>
  );
}

export function DataTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="k-table">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Verbatim text that must keep its line breaks (findings.md). */
export function Verbatim({ children }: { children: React.ReactNode }) {
  return <pre className="k-findings">{children}</pre>;
}

/** Running text in the work's own words (a recipe, a critique, a note). `ink` is
 *  full strength and keeps line breaks; the default is vellum, for secondary matter. */
export function Prose({ children, ink = false }: { children: React.ReactNode; ink?: boolean }) {
  return <p className={ink ? "k-prose k-prose--ink" : "k-prose"}>{children}</p>;
}
