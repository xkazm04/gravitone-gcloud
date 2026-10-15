// GET /api/events/stream[?after=<seq>] - the event ledger as Server-Sent Events.
//
// The live half of every studio view: a Server Component renders at some seq,
// and this stream carries everything after it (app/_server/sse.ts states the
// wire: frames, heartbeat, resume, rotation, backpressure). Access-guarded -
// the ledger records every act - and readable with the session cookie alone,
// because an EventSource cannot send a header. Not rate-bucketed: it spends
// nothing, and a tab holds one.
//
// The client closes its EventSource on `pagehide` and reopens on `pageshow`
// (page-load-pipeline: navigation-reuse): an open connection keeps a page out
// of the back/forward cache. That is the subscriber's half (L9).

import { eventsAfter } from "@gt/kernel/events-query";

import { kernel } from "../../../_server/kernel.ts";
import { route } from "../../../_server/route.ts";
import { eventStreamResponse, resumeFrom } from "../../../_server/sse.ts";

/** Cloud Run's default request timeout. The stream rotates a minute before it. */
export const maxDuration = 300;

export const GET = route({ guard: "access", bodyCap: 0 }, async ({ req }) => {
  const after = resumeFrom(req);
  if (!after.ok) return after;
  const k = kernel();
  if (!k.ok) return k;
  const store = k.value.store;
  return eventStreamResponse((seq, limit) => eventsAfter(store, seq, limit), {
    after: after.value,
    lifetimeMs: (maxDuration - 60) * 1000,
    signal: req.signal,
  });
});
