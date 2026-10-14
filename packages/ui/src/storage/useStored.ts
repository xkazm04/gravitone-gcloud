"use client";

// A REGISTERED KEY AS STATE: `const [view, setView] = useStored(store, LIBRARY_VIEW, "grid")`.
//
// Hydration-safe by construction, as v1 lib/useRemembered.ts was: the server snapshot
// is "nothing stored", so the server and the first client render agree on the
// fallback, and the stored value lands in the commit after. The snapshot is the RAW
// text (stable by value), parsed only when it changes. A value that is absent, or
// fails its schema, reads as `fallback` - the narrower legal state - and never throws
// into a render. Another tab's write arrives through the `storage` event.
//
// Not verifiable in node (no DOM for Vitest): the store's decisions are tested in
// store.test.ts; this only subscribes.

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { z } from "zod";
import type { Parsed } from "@gt/domain/door";
import type { AppError, Result } from "@gt/domain/errors";

import { decode, type KeyDef, type Store } from "./store.ts";

const serverSnapshot = (): null => null;

export function useStored<S extends z.ZodType>(
  store: Store,
  def: KeyDef<S>,
  fallback: Parsed<z.output<S>>,
  /** A stored value that fails its schema reaches this door (telemetry, the bell) instead of vanishing. */
  onCorrupt?: (e: AppError) => void,
): [Parsed<z.output<S>>, (next: z.input<S>) => Result<null>] {
  const subscribe = useCallback(
    (listener: () => void) => {
      const off = store.subscribe(listener);
      const onStorage = (e: StorageEvent): void => {
        if (e.key === def.key || e.key === null) listener();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        off();
        window.removeEventListener("storage", onStorage);
      };
    },
    [store, def],
  );
  const raw = useSyncExternalStore(subscribe, () => store.snapshot(def), serverSnapshot);
  const decoded = useMemo(() => decode(def, raw), [def, raw]);
  const report = useRef(onCorrupt);
  useEffect(() => {
    report.current = onCorrupt;
  });
  useEffect(() => {
    if (!decoded.ok) report.current?.(decoded.error);
  }, [decoded]);
  const value = decoded.ok && decoded.value !== undefined ? decoded.value : fallback;
  const set = useCallback((next: z.input<S>) => store.write(def, next), [store, def]);
  return [value, set];
}
