"use client";

// The React side of ./shelf.ts — the URL as the query's only store, a keyboard
// cursor, and a windowed list. Every /projects variant mounts the same three.

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { Project } from "@/lib/projects";

import {
  deriveShelf,
  prefixOffsets,
  queryFromParams,
  queryToParams,
  windowRange,
  type ShelfDefaults,
  type ShelfQuery,
} from "./shelf";

/* ── The query lives in the URL ───────────────────────────────────────────── */

/** `defaults` must be a module-level constant: it is a memo dependency. */
export function useShelf(projects: readonly Project[], defaults: ShelfDefaults) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const query = useMemo(() => queryFromParams(params, defaults), [params, defaults]);

  // `replace`, not `push`: a filter is a view onto the same shelf, and Back
  // should leave /projects rather than step through every chip pressed.
  const setQuery = useCallback(
    (patch: Partial<ShelfQuery>) => {
      const next = queryToParams({ ...query, ...patch }, params, defaults).toString();
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    },
    [query, params, defaults, router, pathname],
  );

  const view = useMemo(() => deriveShelf(projects, query), [projects, query]);
  return { query, setQuery, ...view };
}

/* ── The keyboard ─────────────────────────────────────────────────────────── */

function typing(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
}

/** A modal owns the keyboard while it is up (components/ui/Modal.tsx). */
const modalOpen = () => document.querySelector('[role="dialog"][aria-modal="true"]') !== null;

/**
 * J / K walk `order` (the ids in on-screen order), Enter opens, `/` focuses the
 * search, X toggles selection where a variant has one, Escape clears it.
 *
 * Enter is taken only when focus is on a ROW (or nowhere): a focused edit button
 * inside a row must still do its own job on Enter.
 *
 * `moved` ticks on every keyboard move so a variant can scroll the row into
 * view and focus it — the row may not be in the DOM yet when the key lands.
 */
export function useShelfKeys(
  order: readonly string[],
  {
    onOpen,
    onToggle,
    onEscape,
  }: { onOpen: (id: string) => void; onToggle?: (id: string) => void; onEscape?: () => void },
) {
  const [activeId, setActiveState] = useState<string | null>(null);
  const [moved, setMoved] = useState(0);
  const searchRef = useRef<HTMLInputElement | null>(null);
  // The handler reads the cursor from here, not from the render it was bound
  // in: keys arrive faster than effects re-bind, and a J pressed before the
  // last J re-rendered must still step from where the last one landed.
  const cursor = useRef<string | null>(null);
  const setActiveId = useCallback((id: string | null) => {
    cursor.current = id;
    setActiveState(id);
  }, []);

  // The cursor survives a filter only if its row does; otherwise it parks on
  // nothing rather than on a row the user never chose.
  const active = activeId !== null && order.includes(activeId) ? activeId : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || modalOpen()) return;
      if (e.key === "/" && !typing(e.target)) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key === "Escape" && typing(e.target) && e.target === searchRef.current) {
        searchRef.current?.blur();
        return;
      }
      if (typing(e.target)) return;
      const key = e.key.toLowerCase();
      const at = cursor.current !== null && order.includes(cursor.current) ? cursor.current : null;
      if (key === "j" || key === "k") {
        if (order.length === 0) return;
        e.preventDefault();
        const i = at === null ? -1 : order.indexOf(at);
        const next = key === "j" ? Math.min(order.length - 1, i + 1) : i <= 0 ? 0 : i - 1;
        setActiveId(order[next]);
        setMoved((m) => m + 1);
        return;
      }
      const onRow = e.target instanceof HTMLElement && e.target.dataset.shelfId !== undefined;
      const nowhere = e.target === document.body || e.target === document.documentElement;
      if (e.key === "Enter" && at && (onRow || nowhere)) {
        e.preventDefault();
        onOpen(at);
        return;
      }
      if (key === "x" && at && onToggle && (onRow || nowhere)) {
        e.preventDefault();
        onToggle(at);
        return;
      }
      if (e.key === "Escape" && onEscape) onEscape();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [order, setActiveId, onOpen, onToggle, onEscape]);

  return { activeId: active, setActiveId, moved, searchRef };
}

/** Focus the row element for `id` without letting the browser scroll it — the
 *  variant has already put it where it belongs. */
export function focusRow(id: string | null) {
  if (!id) return;
  const el = document.querySelector<HTMLElement>(`[data-shelf-id="${CSS.escape(id)}"]`);
  el?.focus({ preventScroll: true });
}

/** After a keyboard move: scroll the active row into the box, then focus it once
 *  it has rendered. Keyed on `moved` so a filter or a scroll never yanks focus —
 *  only a J or a K does. */
export function useRevealOnMove(
  moved: number,
  activeId: string | null,
  indexOf: (id: string) => number,
  reveal: (i: number, stickyTop?: number) => void,
  stickyTop = 0,
) {
  const handled = useRef(0);
  useEffect(() => {
    if (moved === handled.current) return;
    handled.current = moved;
    if (!activeId) return;
    const i = indexOf(activeId);
    if (i >= 0) reveal(i, stickyTop);
    // Two frames: the first lets the re-windowed slice commit, the second
    // finds the row in it.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => focusRow(activeId));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [moved, activeId, indexOf, reveal, stickyTop]);
}

/* ── The windowed list ────────────────────────────────────────────────────── */

/**
 * Rows of known height in a scrolling box; only the slice that intersects the
 * box (plus `overscan` each side) is rendered, padded above and below to the
 * height of what is not. Fixed heights per row kind are the contract — the
 * variant draws each row at exactly the height it declares here.
 *
 * Written here rather than reaching for kit `useWindow` (components/kit/Pager.tsx)
 * because that one GROWS: "+N" and "all" add rows that never leave, so a shelf
 * of 500 that somebody pressed "all" on is 500 rows in the DOM. This one holds
 * the DOM to the viewport whatever the shelf's size.
 */
export function useVirtual(
  ref: React.RefObject<HTMLDivElement | null>,
  heights: readonly number[],
  overscan = 6,
) {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(720);
  const offsets = useMemo(() => prefixOffsets(heights), [heights]);

  // ResizeObserver reports once on `observe`, so this is also the first measure.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setViewport(el.clientHeight || 720));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  /** Bring row i fully into view, below `stickyTop` px of pinned chrome. */
  const reveal = useCallback(
    (i: number, stickyTop = 0) => {
      const el = ref.current;
      if (!el || i < 0 || i >= offsets.length - 1) return;
      const top = offsets[i];
      const bottom = offsets[i + 1];
      if (top - stickyTop < el.scrollTop) el.scrollTop = Math.max(0, top - stickyTop);
      else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight;
      setScrollTop(el.scrollTop);
    },
    [ref, offsets],
  );

  const toTop = useCallback(() => {
    if (ref.current) ref.current.scrollTop = 0;
    setScrollTop(0);
  }, [ref]);

  const [start, end] = windowRange(offsets, scrollTop, viewport, overscan);
  const total = offsets[offsets.length - 1] ?? 0;
  return {
    onScroll,
    start,
    end,
    offsets,
    scrollTop,
    padTop: offsets[start] ?? 0,
    padBottom: Math.max(0, total - (offsets[end] ?? total)),
    reveal,
    toTop,
  };
}
