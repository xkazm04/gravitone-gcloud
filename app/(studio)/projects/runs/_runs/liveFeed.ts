// RUNS STAYS CURRENT - the ledger's stream says something changed, a re-read of the server
// says what (realtime-events: push-vs-refetch-reconciliation: events carry advice, reads carry
// truth). The page's data is a Server Component render, so "re-read" is `router.refresh()`,
// which re-runs ./load.ts and merges the new payload without losing client state.
//
//   advice     an EventSource on /api/events/stream from the seq the page rendered at. Any
//              event but the sync's own bookkeeping (`ingest.*`) is advice to re-read.
//   coalesce   a burst - a sync appends hundreds of events in one batch - is ONE refresh: the
//              first event arms a COALESCE_MS timer and later ones ride it (realtime-events:
//              coalescing-and-batching: the events are level-triggered, "something changed",
//              so collapsing them loses nothing).
//   backstop   v1 progress is not an event (a forge plate count moves without a ledger row),
//              so a slow poll re-reads every BACKSTOP_MS while the tab is visible and catches
//              up the moment it becomes visible again (Runs.tsx, @gt/ui usePollBackstop).
//   freshness  the page's own render time is the value; each new render confirms it. Past the
//              silence bound with no confirmation the page reads stale, never current.
//
// A plain function, not a hook: it opens the feed and returns its reaper, and the component's
// one effect owns the lifetime (realtime-events: subscription-lifecycle - creation names its
// reaper). The stream closes on the reaper and on pagehide (so the page can enter the
// back/forward cache, page-load-pipeline: navigation-reuse) and reopens on pageshow.

export const COALESCE_MS = 1_500;
export const BACKSTOP_MS = 20_000;

export type Feed = {
  /** The seq the page rendered at; EventSource resumes by Last-Event-ID after the first connect. */
  readonly head: number;
  /** Re-read the truth (router.refresh). Called at most once per COALESCE_MS. */
  readonly refresh: () => void;
  /** The stream errored: the freshness edge hears a failure. */
  readonly fail: () => void;
};

export function openFeed({ head, refresh, fail }: Feed): () => void {
  let es: EventSource | null = null;
  let timer: number | null = null;
  let closed = false;
  const soon = (): void => {
    if (timer !== null) return;
    timer = window.setTimeout(() => {
      timer = null;
      refresh();
    }, COALESCE_MS);
  };
  const open = (): void => {
    if (closed || es !== null) return;
    es = new EventSource(`/api/events/stream?after=${head}`);
    es.onmessage = (m: MessageEvent<string>) => {
      // The type is all this needs; a frame that does not carry one is still advice.
      const type = /"type":"([^"]+)"/.exec(m.data)?.[1] ?? "";
      if (!type.startsWith("ingest.")) soon();
    };
    es.addEventListener("reset", soon);
    es.onerror = fail;
  };
  const shut = (): void => {
    es?.close();
    es = null;
  };
  open();
  window.addEventListener("pagehide", shut);
  window.addEventListener("pageshow", open);
  return () => {
    closed = true;
    shut();
    window.removeEventListener("pagehide", shut);
    window.removeEventListener("pageshow", open);
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
  };
}
