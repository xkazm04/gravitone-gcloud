"use client";

// THE ENTRIES, AS THE SOURCE LAST SAID THEM.
//
// The canvas never fetches: a `PipelineSource` is handed in and its
// `loadPipeline()` is called here, so the adapters stay WP2's and the
// one-request-rule under app/foundry stays true. What this hook owns is what a
// poll does to the board:
//
//   · A RELOAD KEEPS IDENTITY. `loadPipeline()` returns brand-new objects for
//     every card on every call; if the entries replaced the old ones wholesale,
//     500 memoized cards would all see a new `entry` and re-render for a poll
//     that changed one of them. `reconcile` reuses the previous entry object
//     whenever id, version and placement are unchanged, so the cards that did
//     not change are not touched.
//   · A STALE ANSWER IS DROPPED. Two loads in flight resolve in either order;
//     only the latest request's answer is applied. (A sequence number, not an
//     `alive` flag: unmounting is just one more bump.)
//   · A FAILED LOAD KEEPS THE BOARD. The entries stay as they were and the
//     error rides beside them, so a blip does not blank 500 cards.

import { useCallback, useEffect, useRef, useState } from "react";

import type { PipelineEntry, PipelineItem, PipelineSource } from "@/lib/board/pipeline";

export function reconcile(prev: readonly PipelineEntry[], next: readonly PipelineEntry[]): PipelineEntry[] {
  const byId = new Map<string, PipelineEntry>();
  for (const e of prev) byId.set(e.item.id, e);
  return next.map((n) => {
    const p = byId.get(n.item.id);
    return p && p.item.version === n.item.version && p.placement.stage === n.placement.stage && p.placement.band === n.placement.band && p.item.lane === n.item.lane ? p : n;
  });
}

export interface PipelineData {
  entries: readonly PipelineEntry[];
  /** `loadPipeline()` has not answered yet. */
  loading: boolean;
  error: string | null;
  reload(): Promise<void>;
  /** Fold an authority-confirmed item back in. */
  apply(item: PipelineItem): void;
}

export function usePipelineData(source: PipelineSource, pollMs = 0): PipelineData {
  const [state, setState] = useState<{ entries: readonly PipelineEntry[] | null; error: string | null }>({ entries: null, error: null });
  const seq = useRef(0);
  const supersede = useCallback(() => {
    seq.current++;
  }, []);

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const next = await source.loadPipeline();
      if (mine !== seq.current) return;
      setState((s) => ({ entries: s.entries ? reconcile(s.entries, next) : next, error: null }));
    } catch (e) {
      if (mine !== seq.current) return;
      setState((s) => ({ entries: s.entries ?? [], error: e instanceof Error ? e.message : String(e) }));
    }
  }, [source]);

  useEffect(() => {
    void reload();
    const id = pollMs > 0 ? window.setInterval(() => void reload(), pollMs) : 0;
    return () => {
      supersede();
      if (id) window.clearInterval(id);
    };
  }, [reload, pollMs, supersede]);

  // A card the authority has just placed lands at the END of its new cell, which
  // is where the drag's preview showed the slot. The array order is the cell
  // order, so the confirmed entry goes to the back; the next reload restores the
  // source's own order. (Replacing it in place would drop it into the middle of
  // the cell by its old rank and shift every card under it.)
  const apply = useCallback((item: PipelineItem) => {
    setState((s) => {
      const at = s.entries ? s.entries.findIndex((e) => e.item.id === item.id) : -1;
      if (!s.entries || at < 0) return s;
      const moved = { ...s.entries[at], item, placement: item.placement };
      return { ...s, entries: [...s.entries.slice(0, at), ...s.entries.slice(at + 1), moved] };
    });
  }, []);

  return { entries: state.entries ?? EMPTY, loading: state.entries === null, error: state.error, reload, apply };
}

const EMPTY: readonly PipelineEntry[] = [];
