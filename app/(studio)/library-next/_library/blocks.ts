"use client";

// THE ROWS THIS BROWSER HOLDS - a sparse cache of BLOCKS of the result, by index. The first
// block arrives with the page; any other is asked of the port when the window first reaches it
// (library.ts `blocksFor`), once, and kept for the life of this result. A 50,000-item result is
// never fetched whole, and the server's order is the only order (table: client-server-split).
//
// One cache per result: when the query's identity changes the cache starts over from the new
// page's first block (derived during render, so no frame draws the old rows under the new
// filter), and a slow answer for the old query is dropped by its identity on arrival
// (async-ui-states: a stale response must not land after a fresh one).

import { useCallback, useMemo, useRef, useState } from "react";

import type { LibraryQuery } from "@gt/domain/library";
import { BLOCK } from "@gt/ui/components/library/library.ts";
import type { LibraryCard } from "@gt/ui/components/library/LibraryTile.tsx";

import type { LibraryPort } from "../_port/contract.ts";

export type Blocks = {
  readonly at: (i: number) => LibraryCard | undefined;
  readonly indexOf: (id: string) => number;
  /** Ask for every block in [start, end) not yet held or asked for. */
  readonly want: (start: number, end: number) => void;
  /** The card at index i, fetching its block when needed. */
  readonly ensure: (i: number) => Promise<LibraryCard | undefined>;
  readonly error: string | null;
};

type Held = { readonly identity: string; readonly rows: ReadonlyMap<number, readonly LibraryCard[]> };

export function useBlocks(port: LibraryPort, identity: string, query: (offset: number, limit: number) => LibraryQuery, first: readonly LibraryCard[]): Blocks {
  const [state, setState] = useState<Held>(() => ({ identity, rows: new Map([[0, first]]) }));
  const [error, setError] = useState<{ readonly identity: string; readonly text: string } | null>(null);
  const [seenFirst, setSeenFirst] = useState(first);
  // Asked blocks by `<identity>#<block>`: a block asked for under an old query is never mistaken
  // for one of the new query's.
  const asked = useRef<Map<string, Promise<readonly LibraryCard[] | undefined>>>(new Map());
  if (state.identity !== identity) {
    setState({ identity, rows: new Map([[0, first]]) });
    setSeenFirst(first);
  } else if (seenFirst !== first) {
    // The same result re-read after an act: its first block is the truth again.
    setSeenFirst(first);
    setState((h) => ({ identity: h.identity, rows: new Map(h.rows).set(0, first) }));
  }
  const held = useMemo<ReadonlyMap<number, readonly LibraryCard[]>>(() => (state.identity === identity ? state.rows : new Map([[0, first]])), [state, identity, first]);

  const fetchBlock = useCallback(
    (b: number): Promise<readonly LibraryCard[] | undefined> => {
      const have = held.get(b);
      if (have !== undefined) return Promise.resolve(have);
      const key = `${identity}#${b}`;
      const running = asked.current.get(key);
      if (running !== undefined) return running;
      const p = port.query(query(b * BLOCK, BLOCK)).then((r) => {
        if (!r.ok) {
          asked.current.delete(key);
          setError({ identity, text: r.error.error });
          return undefined;
        }
        // Lands only in the cache of the query that asked for it.
        setState((h) => (h.identity === identity ? { identity, rows: new Map(h.rows).set(b, r.value.items) } : h));
        return r.value.items;
      });
      asked.current.set(key, p);
      return p;
    },
    [held, port, query, identity],
  );

  const want = useCallback(
    (start: number, end: number): void => {
      if (end <= start) return;
      for (let b = Math.floor(start / BLOCK); b <= Math.floor((end - 1) / BLOCK); b++) if (!held.has(b)) void fetchBlock(b);
    },
    [held, fetchBlock],
  );

  const at = useCallback((i: number) => held.get(Math.floor(i / BLOCK))?.[i % BLOCK], [held]);

  const indexOf = useCallback(
    (id: string): number => {
      for (const [b, rows] of held) {
        const k = rows.findIndex((c) => c.id === id);
        if (k >= 0) return b * BLOCK + k;
      }
      return -1;
    },
    [held],
  );

  const ensure = useCallback(async (i: number) => (await fetchBlock(Math.floor(i / BLOCK)))?.[i % BLOCK], [fetchBlock]);

  return { at, indexOf, want, ensure, error: error !== null && error.identity === identity ? error.text : null };
}
