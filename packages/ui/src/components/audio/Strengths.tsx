// THE STRENGTHS TABLE - providers across, one facet's values down, a cell per provider × value
// (v1 app/playground/triage/Strengths.tsx, re-expressed on the kit). The rules are ./strengths.ts;
// this draws them:
//   · a measured cell is its keep rate as the figure, the mean and n beside it, the defect that
//     sank it most under it, and its heat as a tint - the tint repeats the figure, never replaces
//     it (data-viz encoding-vocabulary: colour carries status, the number carries the value);
//   · a cell under the floor draws its judged takes as pips against the three it needs and the
//     word "waiting" - no rate, no mean, no tint;
//   · a cell nobody judged is a dot, not a zero.
// Column heads sort (aria-sort); a cell is a button that selects it for the detail.
import { CapsHeading } from "../heading/CapsHeading.tsx";
import { Chip } from "../chip/Chip.tsx";
import { cx } from "../cx.ts";
import { PipRow } from "../piprow/PipRow.tsx";
import { Seg } from "../seg/Seg.tsx";
import { Tally } from "../tally/Tally.tsx";
import { vars } from "../vars.ts";
import { cellKey, cellView, coverage, FACET_WORD, FACETS, MIN_N, pivot, PROVIDER_NAME, providerColumns, sortRows, type Facet, type Provider, type Sort, type StrengthCell, type StrengthKind } from "./strengths.ts";
import s from "./Strengths.module.css";

export type StrengthTableProps = {
  readonly kind: StrengthKind;
  readonly cells: readonly StrengthCell[];
  readonly facet: Facet;
  readonly sort: Sort;
  /** The selected cell's key (./strengths.ts `cellKey`). */
  readonly picked: string | null;
  readonly onFacet: (f: Facet) => void;
  readonly onSort: (s: Sort) => void;
  readonly onPick: (c: StrengthCell) => void;
};

const defectWord = (d: string): string => d.replace(/-/g, " ");

function nextSort(cur: Sort, key: Sort["key"], provider: Provider | null): Sort {
  if (cur.key === key && cur.provider === provider) return { ...cur, dir: cur.dir === "desc" ? "asc" : "desc" };
  return { key, provider, dir: key === "value" ? "asc" : "desc" };
}

function Head({ label, on, dir, onPress }: { readonly label: string; readonly on: boolean; readonly dir: Sort["dir"]; readonly onPress: () => void }) {
  return (
    <span role="columnheader" aria-sort={on ? (dir === "asc" ? "ascending" : "descending") : "none"} className={s.head}>
      <button type="button" className={cx(s.sort, on && s.sortOn)} onClick={onPress}>
        {label}
        {on && <span aria-hidden="true">{dir === "asc" ? " ↑" : " ↓"}</span>}
      </button>
    </span>
  );
}

function Cell({ cell, label, on, onPick }: { readonly cell: StrengthCell | undefined; readonly label: string; readonly on: boolean; readonly onPick: () => void }) {
  const v = cellView(cell);
  if (v.state === "empty" || cell === undefined)
    return (
      <span role="cell" className={s.empty} aria-label={`${label}: nothing judged`}>
        <i className={s.dot} aria-hidden="true" />
      </span>
    );
  if (v.state === "insufficient")
    return (
      <span role="cell" className={s.cellWrap}>
        <button type="button" className={cx(s.cell, s.waiting, on && s.on)} aria-pressed={on} aria-label={`${label}: ${v.n} judged, ${v.need} more before a rate`} onClick={onPick}>
          <PipRow looks={Array.from({ length: v.n }, () => "done" as const)} max={MIN_N} label={`${v.n} of ${MIN_N} judged`} />
          <span className={s.wait} aria-hidden="true">
            waiting
          </span>
        </button>
      </span>
    );
  return (
    <span role="cell" className={s.cellWrap}>
      <button
        type="button"
        className={cx(s.cell, on && s.on)}
        data-heat={v.heat}
        aria-pressed={on}
        aria-label={`${label}: kept ${v.keepPct} of ${v.n}${v.mean === null ? "" : `, mean ${v.mean}`}${v.topDefect === null ? "" : `, most often ${defectWord(v.topDefect)}`}`}
        onClick={onPick}
      >
        <b className={s.rate} aria-hidden="true">
          {v.keepPct}
        </b>
        <span className={s.sub} aria-hidden="true">
          {v.mean ?? "—"} · n {v.n}
        </span>
        {v.topDefect !== null && cell.rejected > 0 && (
          <span className={s.defect} aria-hidden="true">
            {defectWord(v.topDefect)}
          </span>
        )}
      </button>
    </span>
  );
}

export function StrengthTable({ kind, cells, facet, sort, picked, onFacet, onSort, onPick }: StrengthTableProps) {
  const cols = providerColumns(cells);
  const rows = sortRows(pivot(cells, facet), sort);
  const cov = coverage(cells, facet);
  // The column count is data the grid is OF (one per provider), so it rides as a custom property.
  const grid = vars({ "--cols": cols.length });
  return (
    <section className={s.table} aria-label="provider strengths">
      <div className={s.bar}>
        <Seg label="facet" value={facet} onChange={onFacet} options={FACETS[kind].map((f) => ({ value: f, label: FACET_WORD[f], count: pivot(cells, f).length }))} />
        {cov.of > 0 && <Tally value={cov.measured} of={cov.of} label={`n≥${MIN_N}`} />}
      </div>
      {rows.length === 0 ? (
        <div className={s.grid} role="table" aria-label={`no ${FACET_WORD[facet]} judged yet`}>
          <div role="row" className={s.row} style={grid}>
            <span role="columnheader" className={s.head}>
              {FACET_WORD[facet]}
            </span>
            {cols.map((p) => (
              <span key={p} role="columnheader" className={s.head}>
                {PROVIDER_NAME[p]}
              </span>
            ))}
            <span role="columnheader" className={s.head}>
              n
            </span>
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className={s.row} style={grid} aria-hidden="true">
              <i className={s.ghostName} />
              {cols.map((p) => (
                <i key={p} className={s.ghostCell} />
              ))}
              <span />
            </div>
          ))}
        </div>
      ) : (
        <div className={s.grid} role="table" aria-label={`${FACET_WORD[facet]} by provider`}>
          <div role="row" className={s.row} style={grid}>
            <Head label={FACET_WORD[facet]} on={sort.key === "value"} dir={sort.dir} onPress={() => onSort(nextSort(sort, "value", null))} />
            {cols.map((p) => (
              <Head key={p} label={PROVIDER_NAME[p]} on={(sort.key === "keep" || sort.key === "mean") && sort.provider === p} dir={sort.dir} onPress={() => onSort(nextSort(sort, sort.key === "mean" ? "mean" : "keep", p))} />
            ))}
            <Head label="n" on={sort.key === "n"} dir={sort.dir} onPress={() => onSort(nextSort(sort, "n", null))} />
          </div>
          {rows.map((r) => (
            <div key={r.value} role="row" className={s.row} style={grid}>
              <span role="rowheader" className={s.value}>
                {r.value}
              </span>
              {cols.map((p) => {
                const c = r.cells[p];
                return <Cell key={p} cell={c} label={`${PROVIDER_NAME[p]} on ${r.value}`} on={c !== undefined && picked === cellKey(c)} onPick={() => c !== undefined && onPick(c)} />;
              })}
              <span role="cell" className={s.n}>
                {r.n}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** A selected cell: who, on what, and its figures - or its pips while it waits. */
export function StrengthHead({ cell }: { readonly cell: StrengthCell }) {
  const v = cellView(cell);
  return (
    <div className={s.detailHead}>
      <CapsHeading text={`${PROVIDER_NAME[cell.provider]} · ${FACET_WORD[cell.facet]}`} variant="section" level={3} />
      <b className={s.detailValue}>{cell.value}</b>
      <span className={s.figures}>
        {v.state === "measured" ? (
          <>
            <Tally value={cell.kept} of={cell.n} label="kept" />
            {v.mean !== null && <Tally value={v.mean} label="mean" />}
            {cell.topDefect !== null && cell.rejected > 0 && <Chip label={defectWord(cell.topDefect)} casing="lower" tone="rose" />}
          </>
        ) : (
          <PipRow looks={Array.from({ length: cell.n }, () => "done" as const)} max={MIN_N} label={`${cell.n} of ${MIN_N} judged`} />
        )}
      </span>
    </div>
  );
}
