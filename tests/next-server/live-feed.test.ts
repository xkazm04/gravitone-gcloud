// THE SHELL'S LIVE FEED (app/(studio)/_shell/liveFeed.ts) against the wire app/_server/sse.ts
// writes: a fake EventSource and a fake window, so the feed's reading of each frame is driven
// without a browser. An `error` after a `rotate` frame is the stream's own planned reconnect
// (lifetime-cap-rotation), not a failure the freshness edge should hear.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BACKSTOP_MS, COALESCE_MS, concerns, openFeed } from "../../app/(studio)/_shell/liveFeed.ts";
import { usePollBackstop } from "../../packages/ui/src/freshness/useFreshness.ts";

// The page's backstop is @gt/ui's usePollBackstop, a React hook; with no DOM renderer here, React
// is stood in for by the two calls the hook makes - its effect runs at once, as a mount would.
vi.mock("react", () => ({
  useRef: <T,>(v: T) => ({ current: v }),
  useEffect: (fn: () => void) => {
    fn();
  },
  useState: <T,>(v: T) => [v, () => undefined],
  useCallback: <T,>(fn: T) => fn,
}));

class FakeSource {
  static made: FakeSource[] = [];
  onmessage: ((m: { data: string; lastEventId: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onopen: (() => void) | null = null;
  closed = false;
  private readonly named = new Map<string, ((m: { data: string }) => void)[]>();
  constructor(readonly url: string) {
    FakeSource.made.push(this);
  }
  addEventListener(name: string, fn: (m: { data: string }) => void): void {
    this.named.set(name, [...(this.named.get(name) ?? []), fn]);
  }
  close(): void {
    this.closed = true;
  }
  /** One `id:`/`data:` frame. */
  event(seq: number, type: string): void {
    this.onmessage?.({ data: JSON.stringify({ seq, type }), lastEventId: String(seq) });
  }
  /** One `event: <name>` control frame. */
  control(name: string, data: object): void {
    for (const fn of this.named.get(name) ?? []) fn({ data: JSON.stringify(data) });
  }
  error(): void {
    this.onerror?.();
  }
}

const windowListeners = new Map<string, (() => void)[]>();
const fire = (name: string) => {
  for (const fn of windowListeners.get(name) ?? []) fn();
};

beforeEach(() => {
  vi.useFakeTimers();
  FakeSource.made = [];
  windowListeners.clear();
  vi.stubGlobal("EventSource", FakeSource);
  vi.stubGlobal("document", { hidden: false, addEventListener: () => undefined, removeEventListener: () => undefined });
  vi.stubGlobal("window", {
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (t: ReturnType<typeof setTimeout>) => clearTimeout(t),
    setInterval: (fn: () => void, ms: number) => setInterval(fn, ms),
    clearInterval: (t: ReturnType<typeof setInterval>) => clearInterval(t),
    addEventListener: (name: string, fn: () => void) => windowListeners.set(name, [...(windowListeners.get(name) ?? []), fn]),
    removeEventListener: (name: string, fn: () => void) => windowListeners.set(name, (windowListeners.get(name) ?? []).filter((f) => f !== fn)),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const open = (head = 10) => {
  const calls = { refresh: 0, fail: 0 };
  const reap = openFeed({ head, refresh: () => calls.refresh++, fail: () => calls.fail++ });
  const es = FakeSource.made[0];
  if (es === undefined) throw new Error("the feed opened no stream");
  return { calls, reap, es };
};

describe("the shell's live feed", () => {
  it("opens from the seq the page rendered at, and a burst is one refresh", () => {
    const { calls, es } = open(10);
    expect(es.url).toBe("/api/events/stream?after=10");
    es.event(11, "job.started");
    es.event(12, "job.done");
    es.event(13, "ingest.batch");
    vi.advanceTimersByTime(COALESCE_MS);
    expect(calls.refresh).toBe(1);
  });

  it("does not report the planned rotation as a failure", () => {
    const { calls, es } = open();
    es.control("rotate", { after: 10 });
    es.error();
    expect(calls.fail).toBe(0);
  });

  it("still reports a failure that no rotation announced, including one after a rotation", () => {
    const { calls, es } = open();
    es.error();
    expect(calls.fail).toBe(1);
    es.control("rotate", { after: 10 });
    es.error();
    es.error();
    expect(calls.fail).toBe(2);
  });

  it("a page restored from the back/forward cache resumes after the last event it heard, not its first render", () => {
    const { es } = open(10);
    es.event(11, "job.started");
    es.event(57, "job.done");
    fire("pagehide");
    expect(es.closed).toBe(true);
    fire("pageshow");
    expect(FakeSource.made[1]?.url).toBe("/api/events/stream?after=57");
  });

  it("with no families, every event but ingest.* is advice, as before families existed", () => {
    expect(concerns("job.done", undefined)).toBe(true);
    expect(concerns("metric.tick", undefined)).toBe(true);
    expect(concerns("commit", undefined)).toBe(true);
    expect(concerns("ingest.batch", undefined)).toBe(false);
    expect(concerns("", undefined)).toBe(true);
  });

  it("with families, only an event of one of them refreshes; an untyped frame and a reset still do", () => {
    const calls = { refresh: 0 };
    openFeed({ head: 10, refresh: () => calls.refresh++, fail: () => undefined, families: ["job", "commit", "publish.fail"] });
    const es = FakeSource.made[0];
    if (es === undefined) throw new Error("the feed opened no stream");
    es.event(11, "metric.tick");
    es.event(12, "jobs.other");
    es.event(13, "publish.done");
    vi.advanceTimersByTime(COALESCE_MS);
    expect(calls.refresh).toBe(0);
    for (const [seq, type] of [[14, "job.done"], [15, "commit"], [16, "publish.fail.quota"]] as const) {
      es.event(seq, type);
      vi.advanceTimersByTime(COALESCE_MS);
    }
    expect(calls.refresh).toBe(3);
    es.onmessage?.({ data: "{}", lastEventId: "17" });
    vi.advanceTimersByTime(COALESCE_MS);
    expect(calls.refresh).toBe(4);
    es.control("reset", { head: 3 });
    vi.advanceTimersByTime(COALESCE_MS);
    expect(calls.refresh).toBe(5);
  });

  it("a page whose families leave out every event it hears still re-reads on its backstop", () => {
    const calls = { refresh: 0 };
    const refresh = (): void => {
      calls.refresh++;
    };
    openFeed({ head: 10, refresh, fail: () => undefined, families: ["job"] });
    usePollBackstop(refresh, BACKSTOP_MS);
    const es = FakeSource.made[0];
    if (es === undefined) throw new Error("the feed opened no stream");
    for (let i = 0; i < 30; i++) {
      es.event(11 + i, "metric.tick");
      vi.advanceTimersByTime(BACKSTOP_MS / 10);
    }
    // 30 ticks of a tenth of the backstop: three backstop reads, and none from the feed.
    expect(calls.refresh).toBe(3);
  });

  it("after a reset, resumes from the head the server named", () => {
    const { es } = open(900);
    es.control("reset", { head: 40, after: 900 });
    fire("pagehide");
    fire("pageshow");
    expect(FakeSource.made[1]?.url).toBe("/api/events/stream?after=40");
  });
});
