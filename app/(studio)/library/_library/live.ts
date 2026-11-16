"use client";

// THE LIBRARY STAYS CURRENT (spark fable-ten, package D) - the studio's one live rule
// (_shell/liveFeed.ts: events are advice, a re-read is the truth), as Runs keeps it.
//
//   what a refresh re-reads   the page (../page.tsx): the first block, the total, the rail's
//                             counts. router.refresh() merges the new props into the island
//                             without remounting it, so the selection, the open detail (held by
//                             id), the window (view, size, drawers, folds) and the scroller's
//                             position are the island's own state and stay. A re-read whose total
//                             moved drops the cached blocks past the first (./blocks.ts): rows
//                             landing at the top shift every block after it.
//   which events              every non-ingest event (no `families`). What changes the index is
//                             not a closed set of event types: a sync lands rows WITHOUT an event,
//                             started by a render (lib/library/fresh.ts, at most once a minute),
//                             and what it lands was made by any producer's job or any v1 store -
//                             an include list would leave a new source's work to the backstop.
//                             The consequence, stated: an event re-renders the page, the render
//                             starts the sync that is due, and the rows that sync lands show on
//                             the NEXT re-read - the next event or the 20 s backstop.
//   not a transition          the re-read is not wrapped in the island's startTransition: that
//                             would mark the results busy for a refresh the operator did not ask for.

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

import { usePollBackstop } from "@gt/ui/freshness/useFreshness";

import { BACKSTOP_MS, openFeed } from "../../_shell/liveFeed.ts";

export function useLiveLibrary(head: number | undefined): void {
  const router = useRouter();
  const heard = useCallback(() => router.refresh(), [router]);
  // From the FIRST render's seq: a re-read must not reopen the stream (Runs.tsx's rule).
  const first = useRef(head);
  useEffect(() => {
    const from = first.current;
    return from === undefined ? undefined : openFeed({ head: from, refresh: heard, fail: () => undefined });
  }, [heard]);
  usePollBackstop(heard, BACKSTOP_MS);
}
