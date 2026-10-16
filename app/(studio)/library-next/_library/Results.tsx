"use client";

// The centre of the Library: the result as a virtualised grid or list (library.js `layout`,
// `paint`, `ensureVisible`). The window is @gt/ui's (`useWindow` over `windowOf`): the DOM holds
// the rows on screen plus two of overscan, whatever the total - "rendered N of M" is the
// window's own `shown`, a number the live lane reads. Rows the window reaches but this browser
// does not hold yet are asked for by block (./blocks.ts) and drawn as empty slots meanwhile, the
// same size, so nothing moves when they land (async-ui-states: placeholder-design).
//
// The scroller is the LISTBOX (role=listbox, aria-activedescendant): one tab stop, the arrows
// walk the options through the `library` keymap. Tiles and rows are options, never tab stops.

import { useEffect, useImperativeHandle, type Ref } from "react";

import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { layoutFor, type Density, type View } from "@gt/ui/components/library/library.ts";
import { ColumnsHead, LibraryRow, RowList } from "@gt/ui/components/library/LibraryRow.tsx";
import { LibraryTile, TileGrid, TileSlot } from "@gt/ui/components/library/LibraryTile.tsx";
import { pageStep } from "@gt/ui/window/core";
import { useWindow } from "@gt/ui/window/useWindow";

import type { Blocks } from "./blocks.ts";
import s from "./library.module.css";

export type ResultsHandle = { readonly reveal: (i: number) => void; readonly focus: () => void; readonly pageSize: () => number; readonly columns: () => number };

export type ResultsProps = {
  readonly ref: Ref<ResultsHandle>;
  readonly view: View;
  readonly density: Density;
  readonly total: number;
  readonly blocks: Blocks;
  readonly sel: string | null;
  readonly filtered: boolean;
  readonly busy: boolean;
  readonly onSelect: (id: string) => void;
  readonly onOpen: (id: string) => void;
  readonly onClear: () => void;
  readonly onShown: (shown: number) => void;
  readonly onFocusChange: (focused: boolean) => void;
};

export const domIdOf = (i: number): string => `lib-it-${i}`;

export function Results(p: ResultsProps) {
  const { ref, view, density, total, blocks } = p;
  // The window measures the scroller; the width it measured is what the tiles are sized from.
  const win = useWindow<HTMLDivElement>({ count: total, layout: (w) => layoutFor(view, density, w), overscan: 2, key: `${view}:${density}` });
  const { ref: scroller, onScroll, reveal, start, end, padTop, padBottom, columns, shown, width } = win;

  useEffect(() => {
    blocks.want(start, end);
  }, [blocks, start, end]);
  useEffect(() => {
    p.onShown(shown);
  });

  useImperativeHandle(
    ref,
    () => ({
      reveal,
      focus: () => scroller.current?.focus({ preventScroll: true }),
      pageSize: () => pageStep(layoutFor(view, density, scroller.current?.clientWidth ?? 0), scroller.current?.clientHeight ?? 600),
      columns: () => (view === "grid" ? columns : 1),
    }),
    [reveal, scroller, view, density, columns],
  );

  const selIndex = p.sel === null ? -1 : blocks.indexOf(p.sel);
  const active = selIndex >= start && selIndex < end ? domIdOf(selIndex) : undefined;
  const cells = [];
  for (let i = start; i < end; i++) {
    const c = blocks.at(i);
    if (c === undefined) {
      cells.push(view === "grid" ? <TileSlot key={`slot-${i}`} /> : <div key={`slot-${i}`} className={s.slotRow} aria-hidden="true" />);
      continue;
    }
    const common = { card: c, selected: c.id === p.sel, domId: domIdOf(i), onSelect: () => p.onSelect(c.id), onOpen: () => p.onOpen(c.id) };
    cells.push(view === "grid" ? <LibraryTile key={c.id} {...common} /> : <LibraryRow key={c.id} {...common} />);
  }

  return (
    <>
      {view === "list" && <ColumnsHead density={density} />}
      <div
        ref={scroller}
        onScroll={onScroll}
        className={s.vp}
        role="listbox"
        aria-label="Library items"
        aria-busy={p.busy}
        aria-activedescendant={active}
        tabIndex={0}
        data-view={view}
        onFocus={(e) => {
          if (e.target === e.currentTarget) p.onFocusChange(true);
        }}
        onBlur={(e) => {
          if (e.target === e.currentTarget) p.onFocusChange(false);
        }}
      >
        {total === 0 ? (
          p.filtered ? (
            <Empty label="0 items" action={{ label: "clear filters", size: "sm", onPress: p.onClear }} />
          ) : (
            <Empty label="0 items" />
          )
        ) : view === "grid" ? (
          <TileGrid width={width} density={density} padTop={padTop} padBottom={padBottom}>
            {cells}
          </TileGrid>
        ) : (
          <RowList density={density} padTop={padTop} padBottom={padBottom}>
            {cells}
          </RowList>
        )}
      </div>
    </>
  );
}
