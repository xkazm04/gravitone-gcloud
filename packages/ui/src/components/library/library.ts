// THE LIBRARY'S ARITHMETIC - pure, so the rules the prototype kept in one 800-line closure
// (docs/next/prototype/app/library.js) are tested without a DOM: the tile and row geometry
// per size, the order a facet group's values are drawn in, the "7 then +N more" fold, the
// blocks a window needs, and what each key does to the selection.
//
// Kept from the prototype: columns = floor((inner + gap) / (min + gap)) over S/M/L minimums
// (150/206/300), thumbs at 16:10, captions 32/48, list rows 34/40/56, overscan in ROWS; a
// group's values by count then label, with state and source in their own fixed order; a
// pressed value drawn even at 0 (it must stay unpressable); seven rows, and "+N more" only
// when it hides more than two (`vals.length <= LIM + 2` shows them all).
// Upgraded: the numbers are the generated tokens' (`tokens["w-lib-tile-m"]`), so the CSS and
// the arithmetic cannot drift a pixel apart (the Ledger's `h-event` rule); and a 50,000-item
// result is never held whole - the window asks for BLOCKS of rows (`blocksFor`), fetched from
// the server's index as they scroll into view (table: client-server-split - never sort or
// filter on the client below a server-truncated window).

import { FIXED_ORDER, LIBRARY_STATES, type LibrarySource, type LibraryState } from "@gt/domain/library";

import { tokens, type TokenName } from "../../tokens.ts";
import type { Layout } from "../../window/core.ts";

export type Density = "s" | "m" | "l";
export type View = "grid" | "list";
export type { LibrarySource, LibraryState };

const px = (name: TokenName): number => Number.parseInt(tokens[name], 10);

/** Tile minimum, caption, list row and list thumb per size: the tokens' own numbers. */
export const SIZES: { readonly [D in Density]: { readonly tile: number; readonly caption: number; readonly row: number; readonly thumb: number; readonly gap: number } } = {
  s: { tile: px("w-lib-tile-s"), caption: px("h-lib-cap-s"), row: px("h-lib-row-s"), thumb: px("w-lib-thumb-s"), gap: px("sp-3") },
  m: { tile: px("w-lib-tile-m"), caption: px("h-lib-cap"), row: px("h-lib-row-m"), thumb: px("w-lib-thumb-m"), gap: px("sp-5") },
  l: { tile: px("w-lib-tile-l"), caption: px("h-lib-cap"), row: px("h-lib-row-l"), thumb: px("w-lib-thumb-l"), gap: px("sp-5") },
};

/** The grid's inset inside the scroller (library.js `pad`). */
export const GRID_PAD = px("sp-loose");

export type TileBox = { readonly columns: number; readonly width: number; readonly thumb: number; readonly height: number };

/** One tile's box for a container width: the width the columns leave, a 16:10 thumb, the caption under it. */
export function tileBox(width: number, d: Density): TileBox {
  const z = SIZES[d];
  const inner = Math.max(120, width - GRID_PAD * 2);
  const columns = Math.max(1, Math.floor((inner + z.gap) / (z.tile + z.gap)));
  const w = (inner - z.gap * (columns - 1)) / columns;
  const thumb = Math.round((w * 10) / 16);
  return { columns, width: w, thumb, height: thumb + z.caption };
}

/** The window's layout for a view at a width: a grid's rhythm is tile + gap, a list's is its row. */
export function layoutFor(view: View, d: Density, width: number): Layout {
  if (view === "list") return { kind: "list", rowHeight: SIZES[d].row };
  const z = SIZES[d];
  const box = tileBox(width, d);
  return { kind: "grid", width, minTile: z.tile, gap: z.gap, rowHeight: box.height + z.gap, pad: GRID_PAD };
}

/* ── the rail ───────────────────────────────────────────────────────────── */

export type FacetValue = { readonly value: string; readonly label: string; readonly count: number; readonly selected: boolean };

/** States in the Library's own order (library-data.js `STATES`), never by count. */
export const STATE_ORDER: readonly LibraryState[] = LIBRARY_STATES;

/**
 * A group's values as the rail draws them: every value the counts name, plus every SELECTED
 * value they do not (at 0, so a pressed filter can always be unpressed - faceting-and-filters:
 * a zero under the disjunctive count is not a dead end). State, source, attention and the
 * technique bands keep their fixed order; everything else by count, then by label.
 */
export function orderValues(group: string, values: readonly FacetValue[], selected: readonly string[]): readonly FacetValue[] {
  const have = new Set(values.map((v) => v.value));
  const all = [...values, ...selected.filter((s) => !have.has(s)).map((value) => ({ value, label: value, count: 0, selected: true }))];
  // The order is the contract's (@gt/domain/library FIXED_ORDER): the index sends values in it,
  // and a selected value this function adds at 0 must land in the same place.
  const fixed = FIXED_ORDER[group];
  if (fixed !== undefined) {
    const at = (v: string): number => {
      const i = fixed.indexOf(v);
      return i < 0 ? fixed.length : i;
    };
    return all.sort((a, b) => at(a.value) - at(b.value) || a.label.localeCompare(b.label));
  }
  return all.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Rows a group shows before "+N more". */
export const FOLD_AT = 7;

export type Folded = { readonly shown: readonly FacetValue[]; readonly hidden: number; readonly canFold: boolean };

/**
 * The fold (library.js `groupHTML`): seven rows, unless the rest is two or fewer, in which case
 * all of them - "+2 more" costs a click to save two lines. A selected value past the seventh is
 * drawn anyway, so a filter is never hidden behind the fold.
 */
export function foldValues(values: readonly FacetValue[], expanded: boolean): Folded {
  const open = expanded || values.length <= FOLD_AT + 2;
  if (open) return { shown: values, hidden: 0, canFold: values.length > FOLD_AT + 2 };
  const shown = values.filter((v, i) => i < FOLD_AT || v.selected);
  return { shown, hidden: values.length - shown.length, canFold: false };
}

/* ── blocks: what the window needs from the server ───────────────────────── */

/** Rows asked for at a time. The first block arrives with the page; the rest as they scroll in. */
export const BLOCK = 120;

/** Block indexes overlapping the held window [start, end). */
export function blocksFor(start: number, end: number, size = BLOCK): readonly number[] {
  if (end <= start) return [];
  const out: number[] = [];
  for (let b = Math.floor(start / size); b <= Math.floor((end - 1) / size); b++) out.push(b);
  return out;
}

/* ── keys ───────────────────────────────────────────────────────────────── */

export type Step = "left" | "right" | "up" | "down" | "page-up" | "page-down" | "first" | "last" | "prev" | "next";

/**
 * Where a key leaves the selection (library.js keydown): arrows walk by one and by a row of
 * columns, Page keys by the visible rows, Home/End to the ends. Nothing selected: the first
 * press lands on the first item. A list has no left or right; prev and next (the detail's
 * arrows) are one item in either view.
 */
export function stepTo(current: number, step: Step, count: number, columns: number, page: number, view: View): number {
  if (count <= 0) return -1;
  if (current < 0) return step === "last" ? count - 1 : 0;
  const cols = view === "grid" ? Math.max(1, columns) : 1;
  const d: Record<Step, number> = {
    left: view === "grid" ? -1 : 0,
    right: view === "grid" ? 1 : 0,
    up: -cols,
    down: cols,
    "page-up": -Math.max(1, page),
    "page-down": Math.max(1, page),
    first: -count,
    last: count,
    prev: -1,
    next: 1,
  };
  return Math.max(0, Math.min(count - 1, current + d[step]));
}

export type Back = "close-rail" | "close-detail" | "deselect" | "clear-query" | "nothing";

/**
 * The Esc cascade (library.js): the rail drawer, then the detail drawer, then the selection,
 * then the query - one layer per press, the nearest first. `nothing` lets the press go.
 */
export function backStep(s: { readonly railDrawer: boolean; readonly detailDrawer: boolean; readonly selected: boolean; readonly query: boolean }): Back {
  if (s.railDrawer) return "close-rail";
  if (s.detailDrawer) return "close-detail";
  if (s.selected) return "deselect";
  if (s.query) return "clear-query";
  return "nothing";
}

/** `12,345`: the prototype's en-US counts, the same on the server and in the browser. */
export const count = (n: number): string => n.toLocaleString("en-US");
