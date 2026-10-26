import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { err, ok, type Result } from "@gt/domain/errors";
import type { Holder } from "@gt/domain/job";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { METRICS_REFRESH, PUBLISH_TICK, timerStatusIn, type TimerSpec } from "@gt/producers/publish/timers";

import { delayAfter, FRESH, gapOf, QUARANTINE_AT, settle, type TickEnd, type TimerState } from "../../workers/timers-core.ts";
import { timerRoster, type TimerEntry, type TimerLine, type Worked } from "../../workers/timers.ts";

// THE WORKER'S TIMER ROSTER (workers/timers.ts over ./timers-core.ts): the envelope's decisions
// (six outcomes, backoff, quarantine, recovery, the gap), and the driver's promises - a throwing
// tick costs one tick, never its loop and never the other timer; two workers on one store run each
// timer once; a stopped roster lets go of its timers; what the store says about a timer is what
// the Runs calendar row reads.

const dir = mkdtempSync(path.join(tmpdir(), "gt-timers-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const T0 = Date.parse("2026-10-05T12:00:00.000Z");
const iso = (ms: number): string => new Date(ms).toISOString();
const end = (outcome: TickEnd["outcome"], over: Partial<TickEnd> = {}): TickEnd => ({ outcome, at: iso(T0), ms: 5, ...over });

describe("the envelope, decided", () => {
  it("a first failure is a transition, the next ones are not; a success after them is a recovery naming the first error", () => {
    let s: TimerState = FRESH;
    const a = settle(s, end("failed", { error: "store busy" }));
    expect(a.transition).toEqual({ kind: "fail", outcome: "failed", error: "store busy" });
    s = a.state;
    const b = settle(s, end("crashed", { error: "boom" }));
    expect(b.transition).toBeUndefined();
    expect(b.state.failing).toBe(2);
    const c = settle(b.state, end("succeeded-empty"));
    expect(c.transition).toEqual({ kind: "recover", after: 2, error: "store busy" });
    expect(c.state).toMatchObject({ failing: 0, runs: 3, quarantined: false });
  });
  it("a skip is a non-fire, counted, never a failure", () => {
    const s = settle(settle(FRESH, end("failed")).state, end("skipped", { error: "held by box/9" }));
    expect(s.state).toMatchObject({ failing: 1, skips: 1, runs: 1 });
    expect(s.transition).toBeUndefined();
  });
  it("backs off on consecutive failures, capped, and parks the timer at the quarantine line - loudly, once", () => {
    let s: TimerState = FRESH;
    const delays: (number | undefined)[] = [];
    const kinds: string[] = [];
    for (let i = 0; i < QUARANTINE_AT + 1; i++) {
      const r = settle(s, end("timed-out"));
      s = r.state;
      if (r.transition !== undefined) kinds.push(r.transition.kind);
      delays.push(delayAfter(s, 30_000));
    }
    expect(delays.slice(0, 4)).toEqual([60_000, 120_000, 240_000, 480_000]);
    expect(delays[QUARANTINE_AT - 2]).toBe(30 * 60_000);
    expect(delays[QUARANTINE_AT - 1]).toBeUndefined();
    expect(kinds).toEqual(["fail", "quarantine"]);
  });
  it("wakes at the next due item, never past the cadence and never under the floor", () => {
    const at = (wakeInMs: number): number | undefined => delayAfter(settle(FRESH, end("succeeded", { wakeInMs })).state, 30_000);
    expect(at(4_000)).toBe(4_000);
    expect(at(90_000)).toBe(30_000);
    expect(at(0)).toBe(1_000);
    expect(delayAfter(FRESH, 30_000)).toBe(30_000);
  });
  it("calls more than two cadences of silence a gap; a beat in the future (a clock set back) is none", () => {
    expect(gapOf(undefined, iso(T0), 30_000)).toBeUndefined();
    expect(gapOf(iso(T0 - 60_000), iso(T0), 30_000)).toBeUndefined();
    expect(gapOf(iso(T0 - 60_001), iso(T0), 30_000)).toEqual({ from: iso(T0 - 60_001), to: iso(T0) });
    expect(gapOf(iso(T0 + 3_600_000), iso(T0), 30_000)).toBeUndefined();
  });
});

let n = 0;
function store(clock?: () => Date): Kernel {
  const k = openKernel(path.join(dir, `r-${++n}.sqlite`), { busyTimeoutMs: 30_000, ...(clock === undefined ? {} : { clock }) });
  if (!k.ok) throw k.error;
  return k.value;
}
const A: Holder = { bootId: "boot-a", pid: 8001, host: "render-box" };
const B: Holder = { bootId: "boot-b", pid: 8002, host: "render-box" };
const fast = (spec: TimerSpec, everyMs = 15): TimerSpec => ({ ...spec, everyMs, firstDelayMs: 0, deadlineMs: 2_000 });
const worked = (count = 1): Result<Worked> => ok({ count, what: "things done" });
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const events = (k: Kernel, type: string): string[] => {
  const r = k.store.read((rd) => rd.all("SELECT subject_id FROM events WHERE type = ? ORDER BY seq", type).map((x) => String(x["subject_id"])));
  if (!r.ok) throw r.error;
  return r.value;
};

describe("the roster", () => {
  it("a tick that throws costs that tick: its loop keeps firing, and the other timer never notices", async () => {
    const k = store();
    let throws = 0;
    let fine = 0;
    const entries: TimerEntry[] = [
      {
        spec: fast(PUBLISH_TICK),
        tick: () => {
          throws++;
          throw new Error("a malformed row");
        },
      },
      {
        spec: fast(METRICS_REFRESH),
        tick: () => {
          fine++;
          return Promise.resolve(worked());
        },
      },
    ];
    const lines: TimerLine[] = [];
    const r = timerRoster(entries, { store: k.store, holder: A, alive: () => true, clock: () => new Date(), say: (l) => lines.push(l) });
    r.start();
    // Until the counts, not for a fixed 400 ms: 8 ticks at a 15 ms cadence is ~120 ms alone, and a
    // fixed window under the full suite's load measured 5.
    const until = Date.now() + 10_000;
    while ((throws < 3 || fine < 8) && Date.now() < until) await sleep(25);
    expect(await r.stop(1_000)).toEqual([]);
    expect(throws).toBeGreaterThanOrEqual(3);
    expect(fine).toBeGreaterThanOrEqual(8);
    expect(r.state("publish-tick")).toMatchObject({ failing: throws, quarantined: false });
    expect(r.state("metrics-refresh")).toMatchObject({ failing: 0 });
    expect(lines.find((l) => l.timer === "publish-tick")).toMatchObject({ outcome: "crashed", error: "a malformed row" });
    expect(events(k, "timer.fail")).toEqual(["timer:publish-tick"]);
    // Stopped: no timer fires again.
    const before = fine;
    await sleep(60);
    expect(fine).toBe(before);
    k.close();
  }, 60_000);

  it("an answered error is `failed`, a hang past the deadline is `timed-out` and abandoned, and the loop goes on", async () => {
    const k = store();
    let calls = 0;
    const entries: TimerEntry[] = [
      {
        spec: { ...fast(PUBLISH_TICK, 10), deadlineMs: 40 },
        tick: (ctx) => {
          calls++;
          if (calls === 1) return Promise.resolve(err("unavailable", "store is held by another writer"));
          if (calls === 2) return new Promise<Result<Worked>>((resolve) => ctx.signal.addEventListener("abort", () => resolve(worked(0))));
          return Promise.resolve(worked());
        },
      },
    ];
    const lines: TimerLine[] = [];
    const r = timerRoster(entries, { store: k.store, holder: A, alive: () => true, clock: () => new Date(), say: (l) => lines.push(l) });
    r.start();
    const until = Date.now() + 10_000;
    while (lines.length < 3 && Date.now() < until) await sleep(25);
    await r.stop(500);
    expect(lines.map((l) => l.outcome).slice(0, 3)).toEqual(["failed", "timed-out", "succeeded"]);
    expect(events(k, "timer.recover")).toEqual(["timer:publish-tick"]);
    k.close();
  }, 60_000);

  it("two workers on one store run each timer once: the second stands down, naming the holder, until the first lets go", async () => {
    const k = store();
    let ticks = 0;
    const entry: TimerEntry = {
      spec: PUBLISH_TICK,
      tick: () => {
        ticks++;
        return Promise.resolve(worked());
      },
    };
    const a = timerRoster([entry], { store: k.store, holder: A, alive: () => true, clock: () => new Date(), say: () => undefined });
    const b = timerRoster([entry], { store: k.store, holder: B, alive: () => true, clock: () => new Date(), say: () => undefined });
    expect((await a.once()).map((l) => l.outcome)).toEqual(["succeeded"]);
    const second = await b.once();
    expect(second.map((l) => [l.outcome, l.error])).toEqual([["skipped", "held by render-box/8001"]]);
    expect(ticks).toBe(1);
    await a.stop(0);
    expect((await b.once()).map((l) => l.outcome)).toEqual(["succeeded"]);
    expect(ticks).toBe(2);
    await b.stop(0);
    k.close();
  });

  it("tells the Runs row who runs a timer, when it last ran and when it is due; a failure stands until a recovery - across a restart", async () => {
    let t = T0;
    const clock = (): Date => new Date(t);
    const k = store(clock);
    const status = () => {
      const r = k.store.read((rd) => timerStatusIn(rd, PUBLISH_TICK, A, () => true));
      if (!r.ok) throw r.error;
      return r.value;
    };
    expect(status()).toMatchObject({ lastRunAt: null, nextDueAt: null, failing: null });
    let fail = true;
    const entry: TimerEntry = { spec: PUBLISH_TICK, tick: () => Promise.resolve(fail ? err("unavailable", "the export disk is gone") : worked()) };
    const first = timerRoster([entry], { store: k.store, holder: A, alive: () => true, clock, say: () => undefined });
    await first.once();
    expect(status()).toMatchObject({ holder: A, lastRunAt: iso(T0), nextDueAt: iso(T0 + 30_000), failing: { since: iso(T0), error: "the export disk is gone" } });
    await first.stop(0);
    expect(status()).toMatchObject({ lastRunAt: iso(T0), nextDueAt: null });
    // A restart: a fresh roster knows nothing in memory, and still clears the standing failure.
    t = T0 + 40_000;
    fail = false;
    const again = timerRoster([entry], { store: k.store, holder: A, alive: () => true, clock, say: () => undefined });
    await again.once();
    expect(status()).toMatchObject({ failing: null, lastRunAt: iso(T0 + 40_000) });
    await again.stop(0);
    k.close();
  });

  it("starts once: a stopped roster cannot be revived behind the stop", async () => {
    const k = store();
    const r = timerRoster([], { store: k.store, holder: A, alive: () => true, clock: () => new Date(), say: () => undefined });
    r.start();
    await r.stop(0);
    expect(() => r.start()).toThrow(/starts once/);
    k.close();
  });
});
