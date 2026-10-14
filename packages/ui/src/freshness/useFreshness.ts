"use client";

// The two hooks that wire freshness/core.ts and poll.ts to React and the document.
// No decisions here; not verifiable in node (no DOM for Vitest), driven live by the
// wave-2 shell.
//
// `usePollBackstop` keeps v1 usePolling's behaviour: it stops while the document is
// HIDDEN (a foundry tab behind another window used to hit /api/foundry/* every 4 s
// for a run nobody could see), and catches up IMMEDIATELY when the tab becomes
// visible, because the moment a person comes back is the moment they look.
// `document.hidden`, not blur: a tab beside a devtools pane is unfocused and still
// watched.

import { useCallback, useEffect, useRef, useState } from "react";

import { nextChange, observe, open, view, type EdgeEvent, type FreshState, type FreshView } from "./core.ts";
import { mayTick } from "./poll.ts";

/**
 * Hold a live value with its freshness. Feed it with `observe` (from an SSE
 * subscription or the poll backstop). Re-renders on events and at the ONE instant
 * the edge would change, never on a clock.
 */
export function useFreshness<T>(opts: { silenceMs?: number; maxAgeMs?: number } = {}): [FreshView<T>, (e: EdgeEvent<T>) => void] {
  const [state, setState] = useState<FreshState<T>>(() => open<T>(Date.now(), opts));
  const [now, setNow] = useState(() => Date.now());
  const feed = useCallback((e: EdgeEvent<T>) => {
    setState((s) => observe(s, e));
    setNow(Date.now());
  }, []);
  useEffect(() => {
    const at = nextChange(state, now);
    if (at === null) return;
    const id = window.setTimeout(() => setNow(Date.now()), Math.max(0, at - Date.now()));
    return () => window.clearTimeout(id);
  }, [state, now]);
  return [view(state, now), feed];
}

/** Call `fn` every `ms` while `enabled` and the document is visible (v1 usePolling). */
export function usePollBackstop(fn: () => void | Promise<unknown>, ms: number, enabled = true): void {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  useEffect(() => {
    if (!enabled) return;
    let id: number | undefined;
    let startedAt: number | null = null;
    let generation = 0;
    const run = (): void => {
      if (!mayTick(startedAt, Date.now())) return;
      const result = fnRef.current();
      if (!(result instanceof Promise)) {
        startedAt = null;
        return;
      }
      // A newer call (after the cap) bumps the generation, so the abandoned one
      // settling late cannot clear the newer one's in-flight mark.
      const mine = ++generation;
      startedAt = Date.now();
      const settle = (): void => {
        if (mine === generation) startedAt = null;
      };
      result.then(settle, settle);
    };
    const stop = (): void => {
      if (id !== undefined) window.clearInterval(id);
      id = undefined;
    };
    const start = (): void => {
      if (id === undefined) id = window.setInterval(run, ms);
    };
    const onVisibility = (): void => {
      if (document.hidden) return stop();
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
