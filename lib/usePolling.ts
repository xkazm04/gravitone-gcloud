"use client";

// POLLING THAT STOPS WHEN NOBODY IS LOOKING.
//
// Three surfaces in this app poll a live run on an interval, and not one of them
// paused when the tab went to the background: app/foundry/FoundryView.tsx (4s),
// app/foundry/ExtractView.tsx (4s) and app/_phases/script/_notes/
// RecalibrateControl.tsx (1s). A foundry tab left open behind another window hit
// `/api/foundry/*` every four seconds indefinitely — for a run whose progress
// nobody could see.
//
// That load is not hypothetical and it is already written down elsewhere in the
// repo: lib/apiAuth.ts names "a 4-second poll of a live run plus a debounced
// verdict autosave" as the shape its rate limiter is sized against. Half of that
// traffic was being spent on hidden tabs.
//
// `document.hidden` is the right signal rather than blur or focus: a tab behind
// another window is hidden, a tab merely unfocused beside a devtools pane is not,
// and the second one is still being watched. Resuming fires the callback
// IMMEDIATELY on becoming visible, before the next tick — otherwise a tab you
// come back to shows stale data for up to a full interval, which is the exact
// moment a person is most likely to be looking at it.

import { useEffect, useRef } from "react";

/**
 * Call `fn` every `ms` while `enabled` is true AND the document is visible.
 *
 * `fn` is read from a ref written in an effect — never during render, which
 * `react-hooks/refs` objects to and objects correctly — so a caller may pass an
 * inline closure without restarting the interval on every render. Only `ms` and
 * `enabled` restart it.
 */
export function usePolling(fn: () => void, ms: number, enabled: boolean = true): void {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    if (!enabled) return;

    let id: number | undefined;
    const stop = () => {
      if (id !== undefined) {
        window.clearInterval(id);
        id = undefined;
      }
    };
    const start = () => {
      if (id === undefined) id = window.setInterval(() => fnRef.current(), ms);
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
        return;
      }
      // Catch up first, then resume the cadence. A tab returned to after five
      // minutes should not show a five-minute-old run for another four seconds.
      fnRef.current();
      start();
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ms, enabled]);
}
