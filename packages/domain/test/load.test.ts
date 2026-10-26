import { describe, expect, it } from "vitest";

import { LOAD_BAND, LOAD_SAMPLE_MS, LOAD_STRIP_MS, summarizeLoad, type LoadSample } from "../src/load.ts";

// A night's load against the operator's band as a table (spark night-load-band WP-L2): each resource read
// over the samples that READ it, the nearest-rank p95, the share in band, a strip whose empty slots are
// gaps (-1) and not an idle box, the commit charge beside it, and the minutes work waited by resource.

const T0 = Date.parse("2026-10-23T22:00:00.000Z");
const MIN = 60_000;

/** `n` samples a minute apart from T0, each reading `v` on cpu, ram and gpu. */
const flat = (n: number, v: number): LoadSample[] => Array.from({ length: n }, (_, i) => ({ atMs: T0 + i * MIN, load: { cpuBusy: v, gpuBusy: v }, ramUsedGb: v * 64, ramTotalGb: 64 }));
const window = (minutes: number) => ({ fromMs: T0, toMs: T0 + minutes * MIN });

describe("summarizeLoad", () => {
  it("an idle box is never in band", () => {
    const s = summarizeLoad(flat(30, 0.1), window(30));
    expect(s.samples).toBe(30);
    expect(s.band).toEqual(LOAD_BAND);
    for (const r of [s.cpu, s.ram, s.gpu]) expect(r).toMatchObject({ avg: 0.1, p95: 0.1, inBand: 0, read: 30 });
  });

  it("a box held at 70% is in band the whole night", () => {
    const s = summarizeLoad(flat(30, 0.7), window(30));
    for (const r of [s.cpu, s.ram, s.gpu]) expect(r).toMatchObject({ avg: 0.7, p95: 0.7, inBand: 1, read: 30 });
    // Six five-minute slots, each the mean of its five readings.
    expect(s.cpu.strip).toEqual([0.7, 0.7, 0.7, 0.7, 0.7, 0.7]);
  });

  it("both marks are inside the band", () => {
    const at = (v: number, i: number): LoadSample => ({ atMs: T0 + i * MIN, load: { cpuBusy: v } });
    const s = summarizeLoad([at(0.6, 0), at(0.8, 1), at(0.59, 2), at(0.81, 3)], window(5));
    expect(s.cpu.inBand).toBe(0.5);
  });

  it("a 20-minute gap with no samples is four empty slots, not an idle box", () => {
    const before = flat(10, 0.7);
    const after = flat(10, 0.7).map((s) => ({ ...s, atMs: s.atMs + 30 * MIN }));
    const s = summarizeLoad([...before, ...after], window(40));
    expect(s.samples).toBe(20);
    expect(s.cpu.strip).toEqual([0.7, 0.7, -1, -1, -1, -1, 0.7, 0.7]);
    expect(s.cpu.avg).toBe(0.7);
  });

  it("a GPU never read reports read 0 beside readings that were taken", () => {
    const s = summarizeLoad(flat(10, 0.7).map((x) => ({ ...x, load: { cpuBusy: 0.7 } })), window(10));
    expect(s.gpu).toEqual({ avg: 0, p95: 0, inBand: 0, read: 0, strip: [-1, -1] });
    expect(s.cpu.read).toBe(10);
    expect(s.samples).toBe(10);
  });

  it("RAM needs both its halves; a used figure without its total is unread", () => {
    const s = summarizeLoad([{ atMs: T0, load: {}, ramUsedGb: 40 }, { atMs: T0 + MIN, load: {}, ramUsedGb: 32, ramTotalGb: 64 }], window(2));
    expect(s.ram).toMatchObject({ avg: 0.5, read: 1 });
  });

  it("p95 is the nearest rank: the 19th of 20 values, one that was read", () => {
    const values = Array.from({ length: 20 }, (_, i) => (i + 1) / 20);
    const shuffled = [...values.slice(10), ...values.slice(0, 10)];
    const s = summarizeLoad(shuffled.map((v, i) => ({ atMs: T0 + i * MIN, load: { cpuBusy: v } })), window(20));
    expect(s.cpu.p95).toBe(0.95);
    expect(s.cpu.avg).toBe(0.525);
  });

  it("each job seen waiting adds one sample interval to what held it", () => {
    const s = summarizeLoad(
      [
        { atMs: T0, load: {}, waiting: [{ jobId: "job:a", resource: "memory" }] },
        { atMs: T0 + MIN, load: {}, waiting: [{ jobId: "job:a", resource: "memory" }] },
        { atMs: T0 + 2 * MIN, load: {}, waiting: [{ jobId: "job:b", resource: "comfy-queue" }] },
      ],
      window(3),
    );
    expect(s.waited).toEqual({ memory: 2, "comfy-queue": 1 });
    expect(LOAD_SAMPLE_MS).toBe(MIN);
  });

  it("commit: the peak read and the newest limit; absent when never read", () => {
    const s = summarizeLoad(
      [
        { atMs: T0, load: { commitUsedGb: 80 }, commitLimitGb: 100 },
        { atMs: T0 + MIN, load: { commitUsedGb: 96 } },
        { atMs: T0 + 2 * MIN, load: { commitUsedGb: 70 }, commitLimitGb: 116 },
      ],
      window(3),
    );
    expect(s.commit).toEqual({ peakGb: 96, limitGb: 116 });
    expect(summarizeLoad(flat(3, 0.5), window(3)).commit).toEqual({});
  });

  it("clamps a reading outside 0..1 and leaves samples outside the window uncounted", () => {
    const s = summarizeLoad(
      [
        { atMs: T0 - MIN, load: { cpuBusy: 0.9 } },
        { atMs: T0, load: { cpuBusy: 1.4 } },
        { atMs: T0 + MIN, load: { cpuBusy: -0.2 } },
        { atMs: T0 + 3 * MIN, load: { cpuBusy: 0.9 } },
      ],
      window(2),
    );
    expect(s.samples).toBe(2);
    expect(s.cpu).toMatchObject({ avg: 0.5, p95: 1, read: 2 });
  });

  it("zero samples is a summary that says so", () => {
    const s = summarizeLoad([], window(60));
    expect(s.samples).toBe(0);
    expect(s.cpu.read).toBe(0);
    expect(s.cpu.strip).toHaveLength(60 * MIN / LOAD_STRIP_MS);
    expect(s.waited).toEqual({});
  });
});
