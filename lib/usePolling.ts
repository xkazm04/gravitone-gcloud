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
 *
 * IN-FLIGHT GUARD. If `fn` returns a promise, the next tick is SKIPPED while that
 * promise is pending, so a slow response stops multiplying requests against the
 * rate limiter (lib/apiAuth.ts). A promise that never settles must not stall the
 * poll forever: a pending call older than `IN_FLIGHT_CAP_MS` is abandoned and
 * the tick proceeds. A synchronous `fn` is never skipped.
 */
export const IN_FLIGHT_CAP_MS = 30_000;

/** Pure decision, exported for tests: may a tick run given when the last call began? */
export function mayTick(startedAt: number | null, now: number, cap: number = IN_FLIGHT_CAP_MS): boolean {
  return startedAt === null || now - startedAt >= cap;
}

export function usePolling(
  fn: () => void | Promise<unknown>,
  ms: number,
  enabled: boolean = true,
): void {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    if (!enabled) return;

    let id: number | undefined;
    let startedAt: number | null = null;
    let generation = 0;
    const run = () => {
      if (!mayTick(startedAt, Date.now())) return;
      let result: void | Promise<unknown>;
      try {
        result = fnRef.current();
      } catch (e) {
        startedAt = null;
        throw e;
      }
      if (!result || typeof (result as Promise<unknown>).then !== "function") {
        startedAt = null;
        return;
      }
      // A newer call (after the cap) bumps the generation, so the abandoned
      // one settling late cannot clear the newer one's in-flight mark.
      const mine = ++generation;
      startedAt = Date.now();
      const settle = () => {
        if (mine === generation) startedAt = null;
      };
      (result as Promise<unknown>).then(settle, settle);
    };
    const stop = () => {
      if (id !== undefined) {
        window.clearInterval(id);
        id = undefined;
      }
    };
    const start = () => {
      if (id === undefined) id = window.setInterval(run, ms);
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
        return;
      }
      // Catch up first, then resume the cadence. A tab returned to after five
      // minutes should not show a five-minute-old run for another four seconds.
      run();
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
