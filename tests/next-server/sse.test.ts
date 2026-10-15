import { afterAll, describe, expect, it } from "vitest";

import { err, ok, type Result } from "@gt/domain/errors";
import { eventSchema } from "@gt/domain/event";
import { append } from "@gt/kernel/events";
import { eventsAfter } from "@gt/kernel/events-query";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { DEFAULT_SILENCE_MS } from "@gt/ui/freshness/core";

import { eventStream, HEARTBEAT_FRAME, HEARTBEAT_MS, resumeFrom, type ReadAfter, type StreamOptions } from "../../app/_server/sse.ts";

// The ledger stream over a real kernel store: frames carry the events in seq
// order, resume from Last-Event-ID, beat in the silences, rotate before the
// cap, end on abort, and do no work a reader did not ask for.

const kernels: Kernel[] = [];
afterAll(() => kernels.forEach((k) => k.close()));

function world(): { k: Kernel; read: ReadAfter; add(n: number): void } {
  const r = openKernel(":memory:");
  if (!r.ok) throw r.error;
  const k = r.value;
  kernels.push(k);
  let i = 0;
  return {
    k,
    read: (after, limit) => eventsAfter(k.store, after, limit),
    add(n) {
      const done = k.store.tx((t) => {
        for (let j = 0; j < n; j++) append(t, { actor: { kind: "machine", id: "box" }, type: "job.done", subject: { kind: "job", id: `j${++i}` }, data: { i } });
      });
      if (!done.ok) throw done.error;
    },
  };
}

const fast = (over: Partial<StreamOptions> = {}): StreamOptions => ({
  after: 0,
  lifetimeMs: 60_000,
  signal: new AbortController().signal,
  tickMs: 2,
  heartbeatMs: 10_000,
  ...over,
});

type Frame = { id?: string; event?: string; data?: string; comment?: boolean; retry?: string };

/** Read frames until `stop` says enough, or the stream ends. */
async function frames(s: ReadableStream<Uint8Array>, stop: (all: Frame[]) => boolean): Promise<Frame[]> {
  const reader = s.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const out: Frame[] = [];
  while (!stop(out)) {
    const next = await reader.read();
    if (next.done) break;
    buf += dec.decode(next.value, { stream: true });
    let cut: number;
    while ((cut = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, cut);
      buf = buf.slice(cut + 2);
      const f: Frame = {};
      for (const line of block.split("\n")) {
        if (line.startsWith(":")) f.comment = true;
        const m = /^(id|event|data|retry): (.*)$/.exec(line);
        if (m?.[1] !== undefined && m[2] !== undefined) f[m[1] as "id" | "event" | "data" | "retry"] = m[2];
      }
      out.push(f);
    }
  }
  await reader.cancel();
  return out;
}

const dataFrames = (fs: Frame[]): Frame[] => fs.filter((f) => f.id !== undefined);

describe("the event stream", () => {
  it("carries every event after the cursor, in seq order, each id its seq and data the Event", async () => {
    const w = world();
    w.add(3);
    const fs = await frames(eventStream(w.read, fast()), (all) => dataFrames(all).length >= 3);
    expect(fs[0]?.retry).toBe("2000");
    const evs = dataFrames(fs);
    expect(evs.map((f) => f.id)).toEqual(["1", "2", "3"]);
    const parsed = eventSchema.safeParse(JSON.parse(evs[2]?.data ?? "null"));
    expect(parsed.success && parsed.data.seq).toBe(3);
  });

  it("resumes after the cursor and delivers what arrives later, nothing twice", async () => {
    const w = world();
    w.add(2);
    const s = eventStream(w.read, fast({ after: 2 }));
    setTimeout(() => w.add(2), 20);
    const fs = await frames(s, (all) => dataFrames(all).length >= 2);
    expect(dataFrames(fs).map((f) => f.id)).toEqual(["3", "4"]);
  });

  it("beats with a comment in the silences, and silence is bounded under the client's limit", async () => {
    const w = world();
    const fs = await frames(eventStream(w.read, fast({ heartbeatMs: 15 })), (all) => all.filter((f) => f.comment).length >= 2);
    expect(fs.filter((f) => f.comment).length).toBe(2);
    expect(HEARTBEAT_FRAME.startsWith(":")).toBe(true);
    // Two beats may be lost to scheduling and the client still reads the edge live.
    expect(HEARTBEAT_MS * 2 + 5_000).toBeLessThanOrEqual(DEFAULT_SILENCE_MS);
  });

  it("a cursor ahead of the ledger is told the real head, not left waiting", async () => {
    const w = world();
    w.add(2);
    const s = eventStream(w.read, fast({ after: 40 }));
    setTimeout(() => w.add(1), 20);
    const fs = await frames(s, (all) => dataFrames(all).length >= 1);
    const reset = fs.find((f) => f.event === "reset");
    expect(JSON.parse(reset?.data ?? "{}")).toEqual({ head: 2, after: 40 });
    expect(dataFrames(fs).map((f) => f.id)).toEqual(["3"]);
  });

  it("rotates before its lifetime with the cursor to resume from, then ends", async () => {
    const w = world();
    w.add(1);
    let t = 0;
    const fs = await frames(eventStream(w.read, fast({ lifetimeMs: 100, now: () => t, sleep: async () => void (t += 50) })), () => false);
    const last = fs.at(-1);
    expect(last?.event).toBe("rotate");
    expect(JSON.parse(last?.data ?? "{}")).toEqual({ after: 1 });
  });

  it("ends when the request aborts", async () => {
    const w = world();
    const ac = new AbortController();
    const s = eventStream(w.read, fast({ signal: ac.signal }));
    setTimeout(() => ac.abort(), 15);
    const fs = await frames(s, () => false);
    expect(dataFrames(fs)).toEqual([]);
  });

  it("a store failure ends the stream with a fail frame, internal made opaque", async () => {
    const quiet = console.error;
    console.error = () => undefined;
    try {
      const broken: ReadAfter = () => err("internal", "SQLITE_IOERR at C:/private/store.sqlite");
      const fs = await frames(eventStream(broken, fast()), () => false);
      const fail = fs.find((f) => f.event === "fail");
      expect(fail?.data).toContain('"code":"internal"');
      expect(fail?.data).not.toContain("private");
    } finally {
      console.error = quiet;
    }
  });

  it("does no work a reader did not ask for: a stalled reader stops the reads", async () => {
    const w = world();
    let reads = 0;
    const counted: ReadAfter = (a, l) => {
      reads++;
      return w.read(a, l);
    };
    w.add(1);
    const s = eventStream(counted, fast());
    const reader = s.getReader();
    await reader.read();
    w.add(500);
    await new Promise((r) => setTimeout(r, 60));
    // One read filled the queue's single slot; nothing more until the reader returns.
    const stalled = reads;
    await new Promise((r) => setTimeout(r, 60));
    expect(reads).toBe(stalled);
    expect(stalled).toBeLessThanOrEqual(3);
    await reader.cancel();
  });
});

describe("resumeFrom", () => {
  const at = (headers: Record<string, string>, q = ""): Result<number> => resumeFrom(new Request(`http://127.0.0.1/api/events/stream${q}`, { headers }));
  it("Last-Event-ID wins over ?after=, absent is 0, junk is invalid", () => {
    expect(at({ "last-event-id": "12" }, "?after=3")).toEqual(ok(12));
    expect(at({}, "?after=3")).toEqual(ok(3));
    expect(at({})).toEqual(ok(0));
    expect(at({ "last-event-id": "-1" }).ok).toBe(false);
    expect(at({}, "?after=1.5").ok).toBe(false);
  });
});
