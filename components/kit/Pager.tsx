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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

export function useWindow<T>(items: readonly T[], opts: { size?: number; step?: number } = {}): Windowed<T> {
  const size = opts.size ?? 24;
  const step = opts.step ?? size;
  const total = items.length;
  const [n, setN] = useState(size);
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
