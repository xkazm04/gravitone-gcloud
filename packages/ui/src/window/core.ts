// WHICH ITEMS THE DOM HOLDS RIGHT NOW - one windowing core for lists and grids.
//
// v1 had two answers to "this list is long" that never met. `components/kit/Pager.tsx`
// `useWindow` drew the first N rows and offered "+N more", so a long list was still
// a long DOM once widened; `app/_projects/useShelf.ts` `useVirtual` (over
// shelf.ts `prefixOffsets` / `rowAt` / `windowRange`) truly virtualised, but only a
// single column of measured rows. The prototype's Library added the third shape
// v1 lacked: a GRID whose column count follows the viewport width, painted by row,
// with "rendered N of M" (docs/next/prototype/app/library.js `layout`/`paint`).
//
// One pure function now covers all three. Kept from v1: running offsets with a
// binary search (variable heights cost O(log n) per scroll, not O(n)), overscan on
// both sides, the half-open [start, end) range, padTop/padBottom as the spacer
// arithmetic. Kept from the prototype: columns = floor((inner + gap) / (min + gap)),
// overscan counted in ROWS so a grid never paints a partial row. Upgraded: the
// result says how much it holds (`shown`), so the count gate in §9.5 is a test on a
// number instead of a stopwatch.

export type Layout =
  /** Every row the same height. */
  | { readonly kind: "list"; readonly rowHeight: number }
  /** Measured rows: running offsets from `prefixOffsets`, so out[n] is the full height. */
  | { readonly kind: "measured"; readonly offsets: readonly number[] }
  /** Tiles that fill the width; the column count follows it. */
  | { readonly kind: "grid"; readonly width: number; readonly minTile: number; readonly gap: number; readonly rowHeight: number; readonly pad?: number };

export type WindowInput = {
  readonly count: number;
  readonly layout: Layout;
  readonly viewport: number;
  readonly scrollTop: number;
  /** Extra rows painted beyond each edge. */
  readonly overscan: number;
};

export type Win = {
  /** First item held, inclusive. */
  readonly start: number;
  /** Last item held, exclusive. */
  readonly end: number;
  readonly padTop: number;
  readonly padBottom: number;
  /** The scrollable height. */
  readonly total: number;
  readonly columns: number;
  /** Items the DOM holds: the "rendered N of M" readout. */
  readonly shown: number;
};

/** Running offsets: out[i] is the top of row i, out[n] the full height (v1 shelf.ts). */
export function prefixOffsets(heights: readonly number[]): number[] {
  const out = [0];
  let acc = 0;
  for (const h of heights) {
    acc += Math.max(0, h);
    out.push(acc);
  }
  return out;
}

/** The row whose box contains `y`: the first row whose bottom edge is below it (binary search). */
export function rowAt(offsets: readonly number[], y: number): number {
  const n = offsets.length - 1;
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((offsets[mid + 1] ?? Infinity) <= y) lo = mid + 1;
    else hi = mid;
  }
  return Math.min(lo, Math.max(0, n - 1));
}

/** Grid columns for a width (the prototype Library's rule). Never below one. */
export function columnsFor(width: number, minTile: number, gap: number, pad = 0): number {
  const inner = Math.max(0, width - pad * 2);
  return Math.max(1, Math.floor((inner + gap) / (Math.max(1, minTile) + gap)));
}

const EMPTY: Win = { start: 0, end: 0, padTop: 0, padBottom: 0, total: 0, columns: 1, shown: 0 };

/** Uniform rows (a list, or a grid's rows): [firstRow, endRow) intersecting the viewport, widened. */
function uniformRows(rows: number, rowHeight: number, pad: number, viewport: number, scrollTop: number, overscan: number): [number, number] {
  const h = Math.max(1, rowHeight);
  const top = Math.max(0, scrollTop - pad);
  const first = Math.min(rows - 1, Math.floor(top / h));
  const last = Math.min(rows - 1, Math.floor((top + Math.max(1, viewport) - 1) / h));
  return [Math.max(0, first - overscan), Math.min(rows, last + 1 + overscan)];
}

export function windowOf(input: WindowInput): Win {
  const { count, layout, viewport, scrollTop } = input;
  const overscan = Math.max(0, Math.floor(input.overscan));
  if (count <= 0) return EMPTY;
  if (layout.kind === "measured") {
    const n = Math.min(count, layout.offsets.length - 1);
    if (n <= 0) return EMPTY;
    const total = layout.offsets[n] ?? 0;
    const first = rowAt(layout.offsets, Math.max(0, scrollTop));
    const last = rowAt(layout.offsets, Math.max(0, scrollTop + Math.max(1, viewport) - 1));
    const start = Math.max(0, first - overscan);
    const end = Math.min(n, last + 1 + overscan);
    const padTop = layout.offsets[start] ?? 0;
    return { start, end, padTop, padBottom: Math.max(0, total - (layout.offsets[end] ?? total)), total, columns: 1, shown: end - start };
  }
  const grid = layout.kind === "grid";
  const columns = grid ? columnsFor(layout.width, layout.minTile, layout.gap, layout.pad ?? 0) : 1;
  const pad = grid ? (layout.pad ?? 0) : 0;
  const rows = Math.ceil(count / columns);
  const rowHeight = Math.max(1, layout.rowHeight);
  // A grid's last row carries no trailing gap, but the rhythm is rowHeight per row.
  const total = pad * 2 + rows * rowHeight - (grid ? layout.gap : 0);
  const [r0, r1] = uniformRows(rows, rowHeight, pad, viewport, scrollTop, overscan);
  const start = r0 * columns;
  const end = Math.min(count, r1 * columns);
  const padTop = pad + r0 * rowHeight;
  return { start, end, padTop, padBottom: Math.max(0, total - pad - r1 * rowHeight), total, columns, shown: end - start };
}

/** The most items `windowOf` can ever hold for this viewport: the §9.5 count bound. */
export function windowBound(layout: Layout, viewport: number, overscan: number, minRow?: number): number {
  const rowHeight = layout.kind === "measured" ? Math.max(1, minRow ?? 1) : Math.max(1, layout.rowHeight);
  const columns = layout.kind === "grid" ? columnsFor(layout.width, layout.minTile, layout.gap, layout.pad ?? 0) : 1;
  const visibleRows = Math.ceil(Math.max(1, viewport) / rowHeight) + 1;
  return (visibleRows + 2 * Math.max(0, Math.floor(overscan))) * columns;
}

/**
 * The scrollTop that brings item `i` fully into view, or `scrollTop` unchanged
 * when it already is (v1 `reveal`, the prototype's `ensureVisible`).
 */
export function revealTop(win: Pick<WindowInput, "count" | "layout" | "viewport" | "scrollTop">, i: number): number {
  const { layout, viewport, scrollTop } = win;
  if (i < 0 || i >= win.count) return scrollTop;
  let top: number;
  let bottom: number;
  if (layout.kind === "measured") {
    top = layout.offsets[i] ?? 0;
    bottom = layout.offsets[i + 1] ?? top;
  } else {
    const columns = layout.kind === "grid" ? columnsFor(layout.width, layout.minTile, layout.gap, layout.pad ?? 0) : 1;
    const pad = layout.kind === "grid" ? (layout.pad ?? 0) : 0;
    const gap = layout.kind === "grid" ? layout.gap : 0;
    top = pad + Math.floor(i / columns) * layout.rowHeight;
    bottom = top + layout.rowHeight - gap;
  }
  if (top < scrollTop) return top;
  if (bottom > scrollTop + viewport) return Math.max(0, bottom - viewport);
  return scrollTop;
}

/** Items one PgUp/PgDn moves: whole visible rows times columns (the prototype's `page`). */
export function pageStep(layout: Layout, viewport: number): number {
  if (layout.kind === "measured") return 10;
  const columns = layout.kind === "grid" ? columnsFor(layout.width, layout.minTile, layout.gap, layout.pad ?? 0) : 1;
  return Math.max(1, Math.floor(viewport / Math.max(1, layout.rowHeight))) * columns;
}

/** Two windows that hold the same items at the same offsets: the hook re-renders only when this is false. */
export const sameWindow = (a: Win, b: Win): boolean =>
  a.start === b.start && a.end === b.end && a.padTop === b.padTop && a.padBottom === b.padBottom && a.columns === b.columns;
