import type { Event } from "@gt/domain/event";
import { AppError, type Result } from "@gt/domain/errors";

import { publicError } from "./http.ts";

// THE LEDGER AS A STREAM - Server-Sent Events over `eventsAfter(seq)`.
//
// Every live view reads one cursor: the ledger's `seq`, gapless and assigned
// under the write lock, so "everything after N" misses nothing and repeats
// nothing (packages/kernel/src/events-query.ts). This module turns that cursor
// into an SSE body. It replaces v1's polling (lib/usePolling.ts at 4 s per
// view, one HTTP request and one store read per view per tick) with one
// connection per tab that carries the events themselves.
//
// THE WIRE (stream-proxy-hop):
//   - each event is one frame: `id: <seq>` and `data: <the Event as JSON>`, no
//     `event:` field, so a consumer needs one `onmessage`. JSON has no raw
//     newlines, so one `data:` line always suffices;
//   - THE HEARTBEAT IS A COMMENT (`: hb`), which a compliant parser drops
//     before application code (idle-heartbeat-injection). Every HEARTBEAT_MS
//     of silence. @gt/ui/freshness reads silence past DEFAULT_SILENCE_MS
//     (35 s) as "not live": 15 s forgives one lost beat with 5 s to spare, and
//     tests/next-server/sse.test.ts holds the two numbers together;
//   - RESUME: EventSource re-sends the last `id:` as Last-Event-ID on every
//     reconnect, so a dropped stream continues where it stopped. A first
//     connect may pass `?after=<seq>` (the seq a Server Component rendered at);
//   - A CURSOR AHEAD OF THE LEDGER (a store that was reset, the fixture
//     universe swapped in) is not waited on in silence: an `event: reset` frame
//     names the real head and the stream continues from there. The client's
//     view was built from another ledger and must be re-read;
//   - LIFETIME: the stream ends itself on purpose before the route's
//     maxDuration with `event: rotate` and the cursor, and the client's
//     ordinary reconnect resumes it losslessly (lifetime-cap-rotation);
//   - a store failure ends the stream with `event: fail` carrying the error
//     envelope, `internal` made opaque like any other answer.
//
// BACKPRESSURE IS THE PULL. The stream does work only when its reader asks for
// the next chunk: a slow or stalled client stops the queries, it does not grow
// a buffer. At most one frame-batch (BATCH events) is queued at any time.
//
// THE TICK IS 1 s, and it is a poll, said plainly: there is no wake mechanism
// yet (no in-process notifier on `append`, and writers in other processes -
// CLIs, Python workers - could not reach one anyway). One tick is one indexed
// read per subscriber: `seq > ?` on the rowid and `max(seq)` on the rowid,
// O(log n) each. At one operator's few tabs that is a few cheap reads a
// second; it buys an act-to-screen latency under a second for changes made by
// another process, which is what this stream is for (the actor's own tab sees
// its write in the action's response). A wake signal replaces the tick when one
// exists; the cursor contract does not change.

export const TICK_MS = 1_000;
export const HEARTBEAT_MS = 15_000;
/** Reconnect delay hint sent once per stream (the `retry:` field). */
export const RETRY_MS = 2_000;
export const BATCH = 200;

export type ReadAfter = (after: number, limit: number) => Result<{ readonly events: readonly Event[]; readonly head: number }>;

export type StreamOptions = {
  readonly after: number;
  /** Ends the stream with `event: rotate` this long after it opened. */
  readonly lifetimeMs: number;
  readonly signal: AbortSignal;
  readonly tickMs?: number;
  readonly heartbeatMs?: number;
  readonly now?: () => number;
  /** Abortable wait; a test passes a fast one. */
  readonly sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
};

const enc = new TextEncoder();
const frame = (lines: readonly string[]): string => `${lines.join("\n")}\n\n`;

export const eventFrame = (e: Event): string => frame([`id: ${e.seq}`, `data: ${JSON.stringify(e)}`]);
export const controlFrame = (name: "reset" | "rotate" | "fail", data: object): string => frame([`event: ${name}`, `data: ${JSON.stringify(data)}`]);
export const HEARTBEAT_FRAME = ": hb\n\n";

export function sleepFor(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done(): void {
      clearTimeout(t);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}

/** Where a stream starts: Last-Event-ID (a reconnect) wins over `?after=`; both absent is 0. */
export function resumeFrom(req: Request): Result<number> {
  const raw = req.headers.get("last-event-id") ?? new URL(req.url).searchParams.get("after");
  if (raw === null || raw.trim() === "") return { ok: true, value: 0 };
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 0) return { ok: false, error: new AppError("invalid", `events stream: cursor "${raw}" is not a sequence number`) };
  return { ok: true, value: n };
}

/** The SSE body: frames after `after`, heartbeats in the silences, ended by abort, rotation or failure. */
export function eventStream(read: ReadAfter, opts: StreamOptions): ReadableStream<Uint8Array> {
  const tick = opts.tickMs ?? TICK_MS;
  const beat = opts.heartbeatMs ?? HEARTBEAT_MS;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? sleepFor;
  const stop = new AbortController();
  const signal = AbortSignal.any([opts.signal, stop.signal]);
  const endAt = now() + opts.lifetimeMs;
  let cursor = opts.after;
  let spokeAt = now();
  let first = true;

  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        const send = (text: string): void => {
          controller.enqueue(enc.encode(text));
          spokeAt = now();
        };
        for (;;) {
          // A cancelled stream's controller refuses close(); a request abort
          // that arrives before the cancel still closes it cleanly.
          if (stop.signal.aborted) return;
          if (signal.aborted) return controller.close();
          if (now() >= endAt) {
            send(controlFrame("rotate", { after: cursor }));
            return controller.close();
          }
          const page = read(cursor, BATCH);
          if (!page.ok) {
            send(controlFrame("fail", publicError(page.error, "events stream")));
            return controller.close();
          }
          let out = first ? `retry: ${RETRY_MS}\n\n` : "";
          if (first && cursor > page.value.head) {
            out += controlFrame("reset", { head: page.value.head, after: cursor });
            cursor = page.value.head;
          }
          first = false;
          for (const e of page.value.events) {
            out += eventFrame(e);
            cursor = e.seq;
          }
          if (out !== "") return send(out);
          if (now() - spokeAt >= beat) return send(HEARTBEAT_FRAME);
          await sleep(Math.min(tick, Math.max(0, endAt - now())), signal);
        }
      },
      cancel() {
        stop.abort();
      },
    },
    { highWaterMark: 1 },
  );
}

/** The Response: SSE headers that no cache or proxy buffer may hold back. */
export function eventStreamResponse(read: ReadAfter, opts: StreamOptions): Response {
  return new Response(eventStream(read, opts), {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      // nginx and its kin buffer a proxied body unless told not to; a buffered
      // event stream is a stream that arrives in bursts or not at all.
      "x-accel-buffering": "no",
    },
  });
}
