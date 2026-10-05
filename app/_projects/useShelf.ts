"use client";

// The React side of ./shelf.ts — the URL as the query's only store, a keyboard
// cursor, and a windowed list. The race sheet (./RaceSheet.tsx) mounts all three.

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { Project } from "@/lib/projects";

import { deriveShelf, prefixOffsets, queryFromParams, queryToParams, windowRange, type ShelfQuery } from "./shelf";

/* ── The query lives in the URL ───────────────────────────────────────────── */

/** After the entrance wave (RaceSheet.tsx, ~250ms) has run. */
const URL_WRITE_DELAY_MS = 320;

export function useShelf(projects: readonly Project[]) {
  const params = useSearchParams();
  const pathname = usePathname();
  const urlKey = params.toString();

  // THE PAGE RENDERS FROM ITS OWN COPY, AND THE URL FOLLOWS IT.
  //
  // `url` is the URL as this hook last saw it; `key` is the URL spelling of the
  // copy. When the URL moves — Back, a link, a hand edit — the copy is re-read
  // from it, during render (the `prevQ` idiom ShelfHeader.tsx#SearchBox uses),
  // so the URL stays the query's store and a shared link opens the same shelf.
  // When it moves to the copy's own spelling, that is this hook's write landing
  // (below, deferred), and there is nothing to read. A pick the URL has not
  // caught up with yet is NOT a URL move: `url` has not changed, so the copy
  // is not reverted to the stale address in the meantime.
  const [local, setLocal] = useState(() => ({ url: urlKey, key: urlKey, query: queryFromParams(params) }));
  let query = local.query;
  if (local.url !== urlKey) {
    if (urlKey === local.key) {
      setLocal({ ...local, url: urlKey });
    } else {
      query = queryFromParams(params);
      setLocal({ url: urlKey, key: urlKey, query });
    }
  }

  // `replace`, not `push`: a filter is a view onto the same shelf, and Back
  // should leave /projects rather than step through every filter picked.
  //
  // WHY THE COPY, AND WHY THE NATIVE HISTORY CALL — both measured 2026-10-05 on
  // ?seed=300, clicking a filter and sampling the DOM every frame:
  //  · `router.replace` is a navigation: a server round trip for the page's
  //    RSC payload even when only the query string moved. The shelf sat on the
  //    OLD rows for ~240ms after every pick, then swapped all of them in one
  //    frame. The dropdown had closed, so the pick read as ignored and then the
  //    list blinked.
  //  · `history.replaceState` skips the round trip — Next integrates it and
  //    `useSearchParams` re-reads it (node_modules/next/dist/docs/01-app/
  //    01-getting-started/04-linking-and-navigating.md, "Native History API")
  //    — but the re-read lands as a router transition, and rendering FROM it
  //    still left the new answer ~330ms behind the click in dev.
  // So the pick is a state update at the click's own priority, painted on the
  // next frame, and the URL is written AFTER the new answer has settled in —
  // the router's re-read re-renders the whole tree (measured: the click's long
  // task went 120ms → 230ms in dev with the write inline), and it has no
  // business in the frame the answer lands in. Picks inside the window coalesce
  // into one write.
  //
  // A WRITE STILL PENDING WHEN THE PAGE IS LEFT IS FLUSHED FIRST, not dropped
  // and not left to fire. Measured: Escape in the search box (which empties a
  // type=search input natively), J, Enter — the row's router.push was in
  // flight when the write fired, and Next's replaceState integration took the
  // URL back to /projects; the studio never opened. `flush` writes now, and
  // the sheet calls it before every `onOpen` — so the push is the LAST word,
  // and Back returns to exactly the shelf that was on screen. Unmounting
  // cancels whatever is left.
  //
  // Nothing on this page is server-rendered from the query, so the round trip
  // had nothing to fetch.
  const pending = useRef<{ timer: number; url: string } | null>(null);
  const write = useCallback(() => {
    const p = pending.current;
    if (!p) return;
    window.clearTimeout(p.timer);
    pending.current = null;
    window.history.replaceState(null, "", p.url);
  }, []);
  useEffect(
    () => () => {
      if (pending.current) window.clearTimeout(pending.current.timer);
    },
    [],
  );
  const setQuery = useCallback(
    (patch: Partial<ShelfQuery>) => {
      const next = { ...local.query, ...patch };
      const key = queryToParams(next, params).toString();
      setLocal((l) => ({ ...l, key, query: next }));
      if (pending.current) window.clearTimeout(pending.current.timer);
      pending.current = {
        url: key ? `${pathname}?${key}` : pathname,
        timer: window.setTimeout(write, URL_WRITE_DELAY_MS),
      };
    },
    [local.query, params, pathname, write],
  );

  const view = useMemo(() => deriveShelf(projects, query), [projects, query]);
  return { query, setQuery, flush: write, ...view };
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
 * search, Escape leaves it.
 *
 * Enter is taken only when focus is on a ROW (or nowhere): a focused edit button
 * inside a row must still do its own job on Enter.
 *
 * `moved` ticks on every keyboard move so the sheet can scroll the row into
 * view and focus it — the row may not be in the DOM yet when the key lands.
 */
export function useShelfKeys(order: readonly string[], { onOpen }: { onOpen: (id: string) => void }) {
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
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [order, setActiveId, onOpen]);

  return { activeId: active, setActiveId, moved, searchRef };
}

/** Focus the row element for `id` without letting the browser scroll it — the
 *  sheet has already put it where it belongs. */
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
  reveal: (i: number) => void,
) {
  const handled = useRef(0);
  useEffect(() => {
    if (moved === handled.current) return;
    handled.current = moved;
    if (!activeId) return;
    const i = indexOf(activeId);
    if (i >= 0) reveal(i);
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
  }, [moved, activeId, indexOf, reveal]);
}

/* ── The windowed list ────────────────────────────────────────────────────── */

/**
 * Rows of known height in a scrolling box; only the slice that intersects the
 * box (plus `overscan` each side) is rendered, padded above and below to the
 * height of what is not. Fixed heights per row kind are the contract — the
 * sheet draws each row at exactly the height it declares here.
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

  /** Bring row i fully into view. */
  const reveal = useCallback(
    (i: number) => {
      const el = ref.current;
      if (!el || i < 0 || i >= offsets.length - 1) return;
      const top = offsets[i];
      const bottom = offsets[i + 1];
      if (top < el.scrollTop) el.scrollTop = top;
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
