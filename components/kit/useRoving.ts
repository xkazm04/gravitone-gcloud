"use client";

// ONE TAB STOP PER GRID, and the arrow keys walk it.
//
// A grid of tiles used to be either a tab stop per tile (three hundred Tabs to get
// past a cull) or none (a keyboard could not enter it). The roving pattern is the
// third thing: exactly one item has `tabIndex 0`, the rest `-1`, Tab enters at the
// active one and leaves past the whole grid, and the arrows move between items.
//
//   const r = useRoving({ count: tiles.length, onActivate: open });
//   <div role="group" aria-label="Candidates" {...r.containerProps}>
//     {tiles.map((t, i) => <Tile key={t.id} {...t} rovingProps={r.itemProps(i)} />)}
//   </div>
//
// The layout is READ, not declared: rows are found from the items' own positions,
// so an auto-fill grid that reflows at a new width still moves Up and Down by one
// visual row. Home/End go to the first/last item, Ctrl+Home/End likewise; PageUp/
// PageDown move by a screenful of rows (at least one).
//
// What is inside an item that takes Tab (a verdict's K / X buttons) is taken out of
// the tab order while its item is not the active one, so "one tab stop" is true of
// the grid and not merely of its tiles. Enter and Space on the ITEM itself call
// `onActivate`; a keypress on a button inside the item belongs to the button.
//
// CONTROLLED MODE. A surface that already owns "which one is focused" (the foundry's
// cull grid keeps it in app state and binds arrows on `window`, on purpose) passes
// `active` + `onActive` and `arrows: false`: the hook then only supplies the tab
// stop, the inert descendants and focus that FOLLOWS `active` when the grid already
// holds the browser's focus. It never moves `active` on its own there.

import { useCallback, useEffect, useRef, useState } from "react";

const INNER = 'button, a[href], input, select, textarea, [tabindex]:not([data-roving])';

export interface RovingOptions {
  count: number;
  /** Controlled: the active index. Omit for the hook to hold it. */
  active?: number;
  onActive?: (index: number) => void;
  /** Enter / Space on an item. */
  onActivate?: (index: number) => void;
  /** Handle the arrow / Home / End / Page keys. Default true. */
  arrows?: boolean;
  /** Left on the first item goes to the last (and back). Default false. */
  wrap?: boolean;
}

export interface RovingItemProps {
  tabIndex: 0 | -1;
  "data-roving": number;
}

export interface Roving {
  active: number;
  setActive: (index: number) => void;
  /** Spread on the element that holds the items. */
  containerProps: {
    ref: React.RefObject<HTMLDivElement | null>;
    onKeyDown: (e: React.KeyboardEvent) => void;
    onFocus: (e: React.FocusEvent) => void;
  };
  /** Spread on item `i` (a `Tile` takes it as `rovingProps`). */
  itemProps: (index: number) => RovingItemProps;
}

export function useRoving({ count, active: controlled, onActive, onActivate, arrows = true, wrap = false }: RovingOptions): Roving {
  const ref = useRef<HTMLDivElement | null>(null);
  const [own, setOwn] = useState(0);
  const isControlled = controlled !== undefined;
  const raw = isControlled ? controlled : own;
  const active = count === 0 ? 0 : Math.min(Math.max(raw, 0), count - 1);

  const setActive = useCallback(
    (i: number) => {
      if (!isControlled) setOwn(i);
      onActive?.(i);
    },
    [isControlled, onActive],
  );

  const items = useCallback((): HTMLElement[] => {
    const root = ref.current;
    if (!root) return [];
    const els = Array.from(root.querySelectorAll<HTMLElement>("[data-roving]"));
    return els.sort((a, b) => Number(a.dataset.roving) - Number(b.dataset.roving));
  }, []);

  const focusItem = useCallback(
    (i: number) => {
      const el = items().find((e) => Number(e.dataset.roving) === i);
      if (!el) return;
      setActive(i);
      el.focus({ preventScroll: false });
    },
    [items, setActive],
  );

  // Take the items' own controls out of the tab order unless the item is the active
  // one. Marked, so restoring never touches a tabindex somebody else set.
  useEffect(() => {
    for (const el of items()) {
      const own = Number(el.dataset.roving) === active;
      el.querySelectorAll<HTMLElement>(INNER).forEach((inner) => {
        if (own) {
          if (inner.dataset.rovingInert !== undefined) {
            inner.removeAttribute("tabindex");
            delete inner.dataset.rovingInert;
          }
        } else if (inner.dataset.rovingInert === undefined && inner.getAttribute("tabindex") !== "-1") {
          inner.setAttribute("tabindex", "-1");
          inner.dataset.rovingInert = "";
        }
      });
    }
  });

  // Controlled: focus follows `active` when the grid already holds the browser's focus.
  const last = useRef(active);
  useEffect(() => {
    if (last.current === active) return;
    last.current = active;
    const root = ref.current;
    if (!isControlled || !root || !root.contains(document.activeElement)) return;
    items().find((e) => Number(e.dataset.roving) === active)?.focus({ preventScroll: true });
  }, [active, isControlled, items]);

  const columnsOf = (els: HTMLElement[]) => {
    if (els.length === 0) return 1;
    const top = els[0].getBoundingClientRect().top;
    let n = 0;
    for (const el of els) {
      if (Math.abs(el.getBoundingClientRect().top - top) > 2) break;
      n++;
    }
    return Math.max(1, n);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const els = items();
    if (els.length === 0) return;
    const on = (e.target as HTMLElement).closest<HTMLElement>("[data-roving]");
    const here = on ? Number(on.dataset.roving) : active;

    if ((e.key === "Enter" || e.key === " ") && e.target === on) {
      if (onActivate) {
        e.preventDefault();
        onActivate(here);
      }
      return;
    }
    // A key pressed on a control inside the item is that control's, except the arrows
    // when they are not text-editing keys.
    const t = e.target as HTMLElement;
    if (t !== on && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    if (!arrows || e.altKey || e.metaKey) return;

    const cols = columnsOf(els);
    const end = els.length - 1;
    let to = here;
    switch (e.key) {
      case "ArrowRight":
        to = here + 1;
        break;
      case "ArrowLeft":
        to = here - 1;
        break;
      case "ArrowDown":
        to = here + cols;
        break;
      case "ArrowUp":
        to = here - cols;
        break;
      case "PageDown":
        to = here + cols * Math.max(1, Math.floor(window.innerHeight / (els[0].getBoundingClientRect().height || 200)) - 1);
        break;
      case "PageUp":
        to = here - cols * Math.max(1, Math.floor(window.innerHeight / (els[0].getBoundingClientRect().height || 200)) - 1);
        break;
      case "Home":
        to = 0;
        break;
      case "End":
        to = end;
        break;
      default:
        return;
    }
    e.preventDefault();
    if (wrap && (e.key === "ArrowRight" || e.key === "ArrowLeft")) to = (to + els.length) % els.length;
    focusItem(Math.min(end, Math.max(0, to)));
  };

  // Whatever takes focus becomes the active item: a click, or Tab landing on it.
  const onFocus = (e: React.FocusEvent) => {
    const on = (e.target as HTMLElement).closest<HTMLElement>("[data-roving]");
    if (!on) return;
    const i = Number(on.dataset.roving);
    if (i !== active) setActive(i);
  };

  return {
    active,
    setActive,
    containerProps: { ref, onKeyDown, onFocus },
    itemProps: (i) => ({ tabIndex: i === active ? 0 : -1, "data-roving": i }),
  };
}
