"use client";

// A LIST THAT WINDOWS ITSELF AND SAYS HOW MUCH LIES BEYOND.
//
//   useWindow(items, {size, step})   the rows to draw now, and the verbs to widen
//   <Pager shown total onMore onAll/> the sentinel under them
//
// The sentinel is a meridian: a dotted rule the width of the list, inked to the
// share already shown, so how much is beyond is a length rather than a sentence.
// Two numbers ride on it ("48 of 212"), then the two verbs. When everything is
// shown the verbs go and the rule closes; the count stays, because "212 of 212"
// is the answer to "is that all of it".
//
// `auto` wires an IntersectionObserver to the rule so scrolling widens the window;
// the buttons stay, since a keyboard never scrolls a sentinel into view by itself.
// Nothing here fetches: `total` is what the caller already knows.
//
// `key` (Wave 0, 2026-10-08): a filter, a sort, a search — whatever makes the
// list a DIFFERENT list — resets the window to its first page by itself. Before
// it every caller had to remember `reset()` in each handler, and the one that
// forgot showed page four of a list the user had just narrowed to six rows.
//
// OUTSIDE A WORLD the sentinel draws in Obsidian's own vocabulary. The `k-*`
// classes resolve only under `[data-world]` (kit.css's scope), and most studio
// routes set none, so the meridian there was unstyled text. Unscoped, the count
// is a <Tally> (`48/212`, spoken "48 of 212") and the verbs are ghost Buttons:
// the same parts and the same accessible names, in the palette around them.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/Primitives";
import { Tally } from "@/components/ui/signal";
import { useWorldScoped } from "@/components/ui/world";

export interface Windowed<T> {
  /** The rows to draw. */
  visible: readonly T[];
  shown: number;
  total: number;
  remaining: number;
  more: () => void;
  all: () => void;
  /** Back to the first window (a filter changed, a sort was flipped). */
  reset: () => void;
}

export function useWindow<T>(
  items: readonly T[],
  opts: {
    size?: number;
    step?: number;
    /** When this changes (a filter, a sort, a query), the window goes back to `size`. Compared with Object.is. */
    key?: unknown;
  } = {},
): Windowed<T> {
  const size = opts.size ?? 24;
  const step = opts.step ?? size;
  const total = items.length;
  const [n, setN] = useState(size);
  // Derived during render, not in an effect: the narrowed list must never draw
  // one frame at the old window's width.
  const [seenKey, setSeenKey] = useState<unknown>(opts.key);
  if (!Object.is(seenKey, opts.key)) {
    setSeenKey(opts.key);
    setN(size);
  }
  const shown = Math.min(n, total);
  const visible = useMemo(() => items.slice(0, shown), [items, shown]);
  const more = useCallback(() => setN((v) => Math.min(total, Math.min(v, total) + step)), [total, step]);
  const all = useCallback(() => setN(Math.max(total, 1)), [total]);
  const reset = useCallback(() => setN(size), [size]);
  return { visible, shown, total, remaining: total - shown, more, all, reset };
}

export function Pager({
  shown,
  total,
  onMore,
  onAll,
  step,
  noun = "rows",
  auto = false,
}: {
  shown: number;
  total: number;
  onMore: () => void;
  onAll?: () => void;
  /** How many the next press adds, for the button's name. */
  step?: number;
  /** What the rows are, for the accessible name only: "assets". */
  noun?: string;
  /** Widen when the rule scrolls into view. */
  auto?: boolean;
}) {
  const rule = useRef<HTMLDivElement | null>(null);
  const scoped = useWorldScoped();
  const done = shown >= total;
  const remaining = Math.max(0, total - shown);
  const add = Math.min(step ?? remaining, remaining);

  useEffect(() => {
    const el = rule.current;
    if (!auto || done || !el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && onMore(), { rootMargin: "240px" });
    io.observe(el);
    return () => io.disconnect();
  }, [auto, done, onMore, shown]);

  const share = total === 0 ? 1 : Math.min(1, shown / total);

  if (!scoped) {
    return (
      <div className="flex flex-wrap items-center gap-3 pt-4" role="group" aria-label={`${noun}: ${shown} of ${total} shown`}>
        <div ref={rule} aria-hidden className="h-px min-w-12 flex-1 bg-white/8" />
        <Tally value={shown} of={total} />
        {!done && (
          <>
            <Button variant="ghost" size="sm" onClick={onMore} aria-label={`Show ${add} more ${noun}`}>
              +{add}
            </Button>
            {onAll && (
              <Button variant="ghost" size="sm" onClick={onAll} aria-label={`Show all ${remaining} remaining ${noun}`}>
                all
              </Button>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className={`k-pager${done ? " k-pager--done" : ""}`} role="group" aria-label={`${noun}: ${shown} of ${total} shown`}>
      <div ref={rule} className="k-pager__rule" aria-hidden="true">
        <i style={{ width: `${(share * 100).toFixed(2)}%` }} />
      </div>
      <span className="k-num k-pager__n">
        <b>{shown}</b> of {total}
      </span>
      {!done && (
        <span className="k-pager__acts">
          <button type="button" className="k-btn k-btn--line k-btn--sm" onClick={onMore} aria-label={`Show ${add} more ${noun}`}>
            +{add}
          </button>
          {onAll && (
            <button type="button" className="k-btn k-btn--line k-btn--sm" onClick={onAll} aria-label={`Show all ${remaining} remaining ${noun}`}>
              all
            </button>
          )}
        </span>
      )}
    </div>
  );
}
