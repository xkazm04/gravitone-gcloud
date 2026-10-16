"use client";

// The workspace's item rail: the part's units (cards, slots, candidates, beats, scenarios) as one
// listbox, WINDOWED past one screen (@gt/ui window - v1's research board held 39 cards and a
// 7000 px page in the DOM). One tab stop: the keymap walks it (J/K), so the rail uses the
// active-descendant pattern rather than roving tabindex (registry accessibility/keyboard-
// navigation-models: never half of each on a virtualised list), and the selected row is scrolled
// into the window whenever the selection moves.
//
// Rows are one height, the `h-pile-face` token both here (the window's arithmetic) and in the
// stylesheet, so the spacer maths and the drawn rows cannot disagree.
import { useEffect, type ReactNode } from "react";

import { tokens } from "../../tokens.ts";
import { cx } from "../cx.ts";
import { useWindow } from "../../window/useWindow.ts";
import s from "./Part.module.css";

export const RAIL_ROW = Number.parseFloat(tokens["h-pile-face"]);
/** A tall row (a card with a two-line claim): one and a half rows, the stylesheet's `railTall`. */
export const RAIL_TALL = RAIL_ROW * 1.5;

export type RailListProps<T> = {
  readonly label: string;
  readonly items: readonly T[];
  readonly idOf: (item: T) => string;
  readonly selected: string | null;
  readonly onSelect: (id: string) => void;
  readonly row: (item: T, selected: boolean) => ReactNode;
  /** Changes when the list becomes a different list (a filter): the window goes back to the top. */
  readonly listKey?: string;
  readonly tall?: boolean;
};

const domId = (label: string, id: string): string => `rail-${label.replace(/\W+/g, "-")}-${id.replace(/\W+/g, "-")}`;

export function RailList<T>({ label, items, idOf, selected, onSelect, row, listKey, tall = false }: RailListProps<T>) {
  const rowHeight = tall ? RAIL_TALL : RAIL_ROW;
  const { ref, onScroll, reveal, start, end, padTop, padBottom, shown } = useWindow<HTMLDivElement>({ count: items.length, layout: () => ({ kind: "list", rowHeight }), key: listKey });
  const at = selected === null ? -1 : items.findIndex((x) => idOf(x) === selected);
  useEffect(() => {
    if (at >= 0) reveal(at);
  }, [at, reveal]);
  return (
    <div
      ref={ref}
      onScroll={onScroll}
      className={s.railList}
      role="listbox"
      aria-label={label}
      tabIndex={0}
      aria-activedescendant={at >= 0 && selected !== null ? domId(label, selected) : undefined}
      data-component="RailList"
      data-shown={shown}
    >
      <div style={{ height: padTop }} aria-hidden="true" />
      {items.slice(start, end).map((item) => {
        const id = idOf(item);
        const on = id === selected;
        return (
          <div key={id} id={domId(label, id)} role="option" aria-selected={on} className={cx(s.railRow, tall && s.railTall, on && s.railOn)} data-item={id} onClick={() => onSelect(id)}>
            {row(item, on)}
          </div>
        );
      })}
      <div style={{ height: padBottom }} aria-hidden="true" />
    </div>
  );
}
