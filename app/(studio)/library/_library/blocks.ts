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

import { settle } from "../../../_server/settle.ts";
import type { LibraryPort } from "../_port/contract.ts";

// Library.tsx reads the shared rule through here (the rows, a detail and an act all settle).
export { settle };

export type Blocks = {
  readonly at: (i: number) => LibraryCard | undefined;
  readonly indexOf: (id: string) => number;
  /** Ask for every block in [start, end) not yet held or asked for. */
  readonly want: (start: number, end: number) => void;
  /** The card at index i, fetching its block when needed. */
  readonly ensure: (i: number) => Promise<LibraryCard | undefined>;
  readonly error: string | null;
};

/** `generation` counts the re-reads that moved the total under one identity (`reread`). */
type Held = { readonly identity: string; readonly generation: number; readonly rows: ReadonlyMap<number, readonly LibraryCard[]> };

type BlockError = { readonly identity: string; readonly block: number; readonly text: string };

/**
 * The block error once block `b` of `identity` has landed: gone when it was that block's, which
 * now reads (a refused block is asked again when the window next reaches it). Another block's
 * error, or another query's, is left standing. Before this the alert stood under the rows it said had
 * failed, for the life of the result.
 */
export const landed = (e: BlockError | null, identity: string, b: number): BlockError | null => (e !== null && e.identity === identity && e.block === b ? null : e);

/**
 * What a re-read of the SAME result keeps: the first block is the truth again, and the other
 * blocks too while the total stands (an act moved a mark, not the order). A total that moved means
 * rows came or went - a live re-read (./live.ts) after a sync - and every block after the first
 * is shifted, so they go and are asked again as the window reaches them, under a new generation.
 */
export function reread(rows: ReadonlyMap<number, readonly LibraryCard[]>, first: readonly LibraryCard[], moved: boolean): Map<number, readonly LibraryCard[]> {
  return moved ? new Map([[0, first]]) : new Map(rows).set(0, first);
}

export function useBlocks(port: LibraryPort, identity: string, query: (offset: number, limit: number) => LibraryQuery, first: readonly LibraryCard[], total: number): Blocks {
  const [state, setState] = useState<Held>(() => ({ identity, generation: 0, rows: new Map([[0, first]]) }));
  const [error, setError] = useState<BlockError | null>(null);
  const [seen, setSeen] = useState({ first, total });
  // Asked blocks by `<identity>@<generation>#<block>`: a block asked for under an old query, or
  // before a re-read that moved the total, is never mistaken for one of the current answer's.
  const asked = useRef<Map<string, Promise<readonly LibraryCard[] | undefined>>>(new Map());
  if (state.identity !== identity) {
    setState({ identity, generation: state.generation + 1, rows: new Map([[0, first]]) });
    setSeen({ first, total });
  } else if (seen.first !== first) {
    const moved = seen.total !== total;
    setSeen({ first, total });
    setState((h) => ({ identity: h.identity, generation: moved ? h.generation + 1 : h.generation, rows: reread(h.rows, first, moved) }));
  }
  const generation = state.generation;
  const held = useMemo<ReadonlyMap<number, readonly LibraryCard[]>>(() => (state.identity === identity ? state.rows : new Map([[0, first]])), [state, identity, first]);

  const fetchBlock = useCallback(
    (b: number): Promise<readonly LibraryCard[] | undefined> => {
      const have = held.get(b);
      if (have !== undefined) return Promise.resolve(have);
      const key = `${identity}@${generation}#${b}`;
      const running = asked.current.get(key);
      if (running !== undefined) return running;
      const p = settle(port.query(query(b * BLOCK, BLOCK))).then((r) => {
        if (!r.ok) {
          asked.current.delete(key);
          setError({ identity, block: b, text: r.error.error });
          return undefined;
        }
        // Lands only in the cache of the query - and the re-read - that asked for it.
        setState((h) => (h.identity === identity && h.generation === generation ? { identity, generation, rows: new Map(h.rows).set(b, r.value.items) } : h));
        setError((e) => landed(e, identity, b));
        return r.value.items;
      });
      asked.current.set(key, p);
      return p;
    },
    [held, port, query, identity, generation],
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
