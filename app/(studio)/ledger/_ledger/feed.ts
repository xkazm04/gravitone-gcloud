"use client";

// THE LEDGER'S LIVE EDGE - one stream per page, read with fetch (sse.ts says why not
// EventSource), feeding @gt/ui/freshness and telling the page WHICH seqs arrived.
//
// AN ARRIVAL IS AN INVALIDATION, NOT DATA TO COPY IN (realtime-events: push-vs-refetch-
// reconciliation). The page's rows, counts and strip are one server read over one filter;
// an act that arrives changes all three, and the server is the only place they are computed
// together. So the feed reports seqs and the page refreshes - coalesced, so a sync landing
// two hundred acts is one refresh, not two hundred. The seqs mark the arrived rows `fresh`
// once the refresh draws them.
//
// LIFECYCLE (realtime-events: subscription-lifecycle; client-state: effect-identity). The
// effect depends on nothing but the starting cursor's FIRST value: callbacks are read
// through a ref, so a re-render never restarts the stream (and never resets its backoff or
// the silence clock). Teardown aborts the fetch; a cancelled flag stops a reader that was
// mid-handshake from resubscribing. `pagehide` closes the connection (an open stream keeps a
// page out of the back/forward cache, app/api/events/stream) and `pageshow` reopens it at
// the last seq seen - Last-Event-ID, so nothing is missed and nothing repeats.

import { useEffect, useRef, useState } from "react";
import { number, object } from "zod/mini";

import { parseJsonAt } from "@gt/domain/door";
import { AppError } from "@gt/domain/errors";
import { useFreshness } from "@gt/ui/freshness/useFreshness";
import type { FreshView } from "@gt/ui/freshness/core";

import { backoff, parseFrames } from "./sse.ts";

const seqOnly = object({ seq: number() });
const STREAM = "/api/events/stream";
/** How long after mount the stream opens: past Playwright's 500 ms network-idle window. */
const SETTLE_MS = 1_500;

export type FeedHandlers = {
  /** New acts landed, by seq, oldest first. */
  readonly onEvents: (seqs: readonly number[]) => void;
  /** The ledger behind the stream is not the one the page was drawn from. */
  readonly onReset: () => void;
};

export type Feed = FreshView<number> & {
  /** The stream has been tried: before that, "never heard" is not news. */
  readonly armed: boolean;
};

export function useLedgerFeed(after: number, handlers: FeedHandlers): Feed {
  const [view, feed] = useFreshness<number>();
  const [armed, setArmed] = useState(false);
  const h = useRef(handlers);
  useEffect(() => {
    h.current = handlers;
  });
  const start = useRef(after);

  useEffect(() => {
    let cancelled = false;
    let cursor = start.current;
    let failures = 0;
    let retryMs = 2_000;
    let ctl: AbortController | null = null;
    let timer: number | undefined;

    const schedule = (ms: number): void => {
      if (cancelled) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void connect(), ms);
    };

    const connect = async (): Promise<void> => {
      if (cancelled) return;
      setArmed(true);
      ctl?.abort();
      const mine = new AbortController();
      ctl = mine;
      let rotated = false;
      try {
        const res = await fetch(`${STREAM}?after=${cursor}`, { signal: mine.signal, headers: { "last-event-id": String(cursor) }, cache: "no-store" });
        if (!res.ok || res.body === null) throw new AppError("unavailable", `events stream answered ${res.status}`);
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done || cancelled) break;
          const { frames, rest } = parseFrames(buffer + chunk.value);
          buffer = rest;
          const now = Date.now();
          const seqs: number[] = [];
          for (const f of frames) {
            if (f.kind === "comment") feed({ kind: "heartbeat", at: now });
            else if (f.kind === "retry") retryMs = f.ms;
            else if (f.kind === "event") {
              const e = parseJsonAt("ledger feed", seqOnly, f.data);
              if (e.ok) {
                cursor = Math.max(cursor, e.value.seq);
                seqs.push(e.value.seq);
              }
            } else if (f.name === "reset") {
              const r = parseJsonAt("ledger feed reset", object({ head: number() }), f.data);
              if (r.ok) cursor = r.value.head;
              h.current.onReset();
            } else if (f.name === "rotate") rotated = true;
            else if (f.name === "fail") feed({ kind: "fail", at: now });
          }
          if (frames.length > 0) failures = 0;
          // Any frame is contact: the first is the server's `retry:` hint, sent the moment the
          // stream opens, so the edge reads live at once rather than at the first heartbeat.
          if (seqs.length > 0) {
            feed({ kind: "value", value: cursor, at: now });
            h.current.onEvents(seqs);
          } else if (frames.length > 0) feed({ kind: "heartbeat", at: now });
        }
        // A rotation is the server's planned end: resume at once. Any other end is a drop.
        if (!cancelled) {
          if (!rotated) feed({ kind: "fail", at: Date.now() });
          schedule(rotated ? 0 : backoff(++failures, retryMs));
        }
      } catch (e) {
        if (cancelled || mine.signal.aborted) return;
        console.error(`[ledger feed] ${e instanceof Error ? e.message : String(e)}`);
        feed({ kind: "fail", at: Date.now() });
        schedule(backoff(++failures, retryMs));
      }
    };

    let hidden = false;
    const hide = (): void => {
      hidden = true;
      window.clearTimeout(timer);
      ctl?.abort();
    };
    // pageshow also fires on the first load; only a page that was hidden reconnects.
    const show = (): void => {
      if (!hidden) return;
      hidden = false;
      schedule(0);
    };
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", show);
    // The stream opens after the page has settled, not with it: it is not first-paint work
    // (page-load-pipeline), and a connection held open from the first byte means the page
    // never reaches network-idle - the settling signal every live probe in tests/live waits
    // on. Nothing is lost by the wait: the cursor is the seq the server rendered at.
    schedule(SETTLE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      ctl?.abort();
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", show);
    };
  }, [feed]);

  return { ...view, armed };
}
