"use client";

// ONE SELECTION, HELD IN THE URL — the state behind a count that is a door.
//
// `<Tally select>` and `<StackBar onSegment>` turn a count into the filter for
// the set it counts. The selection lives in a search param (`?only=missed`) so a
// filtered view is linkable from the bell, the palette or a share, and survives
// a reload. The reader and the writer are pure functions of a query string so
// the round trip is provable without a router.

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/** The selection `key` holds in `search` (a query string or params), or null. */
export function readCountFilter(search: string | URLSearchParams, key: string): string | null {
  const v = new URLSearchParams(typeof search === "string" ? search : search.toString()).get(key);
  return v ? v : null;
}

/** `search` with `key` set to `value` (or removed for null), as a query string
 *  with no leading `?`. Other params are untouched. */
export function writeCountFilter(search: string | URLSearchParams, key: string, value: string | null): string {
  const p = new URLSearchParams(typeof search === "string" ? search : search.toString());
  if (value) p.set(key, value);
  else p.delete(key);
  return p.toString();
}

/**
 * `const [only, setOnly, toggle] = useCountFilter("only")`.
 * `toggle(v)` selects `v`, or clears it when it is already selected.
 */
export function useCountFilter(key: string) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const current = readCountFilter(params, key);
  const set = useCallback(
    (value: string | null) => {
      const qs = writeCountFilter(params, key, value);
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, key, pathname, router],
  );
  const toggle = useCallback((value: string) => set(current === value ? null : value), [current, set]);
  return [current, set, toggle] as const;
}
