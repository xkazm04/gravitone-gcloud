import { describe, expect, it } from "vitest";

import { admit, peaksOver, type Baseline, type Costed, type MachineLoad, type MachineProfile } from "../src/resource.ts";

// Admission's rules as a table (spark game-3d-assets WP1): measured resources overlap when they
// fit, memory serialises, an unprofiled engine runs alone, the memory gate holds between its two
// marks, an unread reading is never zero, and the shared ComfyUI's queue holds ComfyUI work only.

// archemond's shape: 64 GB the GPU and CPU share, a ~102 GB commit limit, 20 cores.
const M: MachineProfile = { vramTotalGb: 64, commitLimitGb: 100, cores: 20, memHigh: 0.85, memLow: 0.75, cpuHigh: 0.9 };
const IDLE: MachineLoad = { vramUsedGb: 2, commitUsedGb: 50, cpuBusy: 0.2, comfyQueue: 0 };

const comfy: Costed = { engine: "comfy", cost: { vramGb: 13, commitGb: 25, cpuCores: 1 } };
const BASE: Baseline = { commitGb: 50, vramGb: 2 };
const blender: Costed = { engine: "blender", cost: { vramGb: 1, commitGb: 6, cpuCores: 8 } };
const ffmpeg: Costed = { engine: "ffmpeg", cost: { vramGb: 0, commitGb: 1, cpuCores: 4 } };
const heavy = (engine: string): Costed => ({ engine, cost: { vramGb: 0, commitGb: 25, cpuCores: 2 } });

describe("admit: what overlaps", () => {
  it("a GPU-bound and a CPU-bound profiled job run side by side", () => {
    // ComfyUI at its peak (50 + 25), Blender's 6 GB beside it: 81 of 100, under the 85 mark.
    expect(admit(blender, [comfy], { ...IDLE, commitUsedGb: 75, vramUsedGb: 15 }, M, false, BASE)).toEqual({ ok: true, tight: false });
    expect(admit(comfy, [blender], IDLE, M, false, BASE).ok).toBe(true);
  });

  it("two memory-heavy jobs serialise: the second would cross the high mark", () => {
    expect(admit(heavy("a"), [], { ...IDLE, commitUsedGb: 50 }, M, false).ok).toBe(true);
    // `a` has not peaked yet (60 of its 75): 50 + 25 + 25 = 100 is what the pool will hold.
    const second = admit(heavy("b"), [heavy("a")], { ...IDLE, commitUsedGb: 60 }, M, false, BASE);
    expect(second).toMatchObject({ ok: false, resource: "memory", tight: true });
  });

  it("without a baseline the running peaks add to the reading: an over-count, never an under-count", () => {
    // 75 already holds comfy's 25; added again it reads 106 and Blender waits a look it need not.
    expect(admit(blender, [comfy], { ...IDLE, commitUsedGb: 75, vramUsedGb: 15 }, M, false)).toMatchObject({ ok: false, resource: "memory" });
    // Against the contract's first reading, max(reading, peaks): 60 vs 25 projects 85 and admits a 100 GB pool.
    expect(admit(heavy("b"), [heavy("a")], { ...IDLE, commitUsedGb: 60 }, M, false).ok).toBe(false);
  });

  it("charges the running set's peaks when the reading has not caught up with them yet", () => {
    // The reading says 52 GB, but the job admitted a moment ago will peak at 25 over a 30 GB base.
    const v = admit(heavy("b"), [heavy("a")], { ...IDLE, commitUsedGb: 52 }, M, false, { commitGb: 30 });
    expect(v.ok).toBe(true);
    const crowded = admit(heavy("c"), [heavy("a"), heavy("b")], { ...IDLE, commitUsedGb: 52 }, M, false, { commitGb: 30 });
    expect(crowded).toMatchObject({ ok: false, resource: "memory" });
  });

  it("checks GPU memory too: on unified memory it is the same pool seen from the card", () => {
    const v = admit(comfy, [], { ...IDLE, vramUsedGb: 45 }, M, false);
    expect(v).toMatchObject({ ok: false, resource: "vram", tight: true });
  });
});

describe("admit: an engine with no profile runs alone", () => {
  const unknown: Costed = { engine: "unreal" };
  it("starts only on an empty machine", () => {
    expect(admit(unknown, [], IDLE, M, false)).toEqual({ ok: true, tight: false });
    expect(admit(unknown, [ffmpeg], IDLE, M, false)).toMatchObject({ ok: false, resource: "alone" });
  });
  it("and while it runs, nothing else starts, however small", () => {
    expect(admit(ffmpeg, [unknown], IDLE, M, false)).toMatchObject({ ok: false, resource: "alone" });
    expect(admit({ engine: "other" }, [unknown], IDLE, M, false)).toMatchObject({ ok: false, resource: "alone" });
  });
  it("is admitted alone even on an unread machine: nothing it could crowd is running", () => {
    expect(admit(unknown, [], {}, M, false).ok).toBe(true);
  });
});

describe("admit: hysteresis", () => {
  // A 25 GB job on a 100 GB limit: the high mark (85) is crossed above a 60 GB reading, the low
  // mark (75) is cleared below a 50 GB one.
  const job = heavy("a");
  it("refuses above the high mark, keeps refusing between the marks, admits below the low mark", () => {
    const above = admit(job, [], { ...IDLE, commitUsedGb: 70 }, M, false);
    expect(above).toMatchObject({ ok: false, resource: "memory", tight: true });
    // 58 + 25 = 83 is under the high mark, but not under the low one: the gate has not released.
    const between = admit(job, [], { ...IDLE, commitUsedGb: 58 }, M, above.tight);
    expect(between).toMatchObject({ ok: false, resource: "memory", tight: true });
    const below = admit(job, [], { ...IDLE, commitUsedGb: 48 }, M, between.tight);
    expect(below).toEqual({ ok: true, tight: false });
  });

  it("does not flap on a reading that wobbles across the high mark", () => {
    let tight = false;
    const seen: boolean[] = [];
    for (const used of [61, 59, 61, 59, 61, 59]) {
      const v = admit(job, [], { ...IDLE, commitUsedGb: used }, M, tight);
      tight = v.tight;
      seen.push(v.ok);
    }
    expect(seen).toEqual([false, false, false, false, false, false]);
    // Without the carried state the same readings alternate - the flap the marks exist to stop.
    expect([61, 59].map((used) => admit(job, [], { ...IDLE, commitUsedGb: used }, M, false).ok)).toEqual([false, true]);
  });

  it("a job that costs no memory is never held by it, and leaves the gate as it found it", () => {
    const light: Costed = { engine: "probe", cost: { vramGb: 0, commitGb: 0, cpuCores: 1 } };
    expect(admit(light, [], { ...IDLE, commitUsedGb: 99 }, M, true)).toEqual({ ok: true, tight: true });
  });
});

describe("admit: an unread reading is not zero", () => {
  it("refuses a memory-costly job when the commit charge is unread", () => {
    expect(admit(blender, [], { cpuBusy: 0.1 }, M, false)).toMatchObject({ ok: false, resource: "unread" });
  });
  it("refuses a GPU-costly job when GPU memory is unread", () => {
    expect(admit(comfy, [], { commitUsedGb: 40, cpuBusy: 0.1, comfyQueue: 0 }, M, false)).toMatchObject({ ok: false, resource: "unread" });
  });
  it("an unread CPU defers nothing: saturation heals itself, and the probe saying nothing is not saturation", () => {
    expect(admit(ffmpeg, [], { vramUsedGb: 2, commitUsedGb: 40 }, M, false).ok).toBe(true);
  });
});

describe("admit: CPU and the shared ComfyUI queue defer", () => {
  it("a CPU-costly job waits while the CPU is past its mark", () => {
    expect(admit(blender, [], { ...IDLE, cpuBusy: 0.95 }, M, false)).toMatchObject({ ok: false, resource: "cpu", tight: false });
    expect(admit(blender, [], { ...IDLE, cpuBusy: 0.85 }, M, false).ok).toBe(true);
  });
  it("ComfyUI's queue holds ComfyUI work only", () => {
    const busy = { ...IDLE, comfyQueue: 2 };
    expect(admit(comfy, [], busy, M, false)).toMatchObject({ ok: false, resource: "comfy-queue" });
    expect(admit(blender, [], busy, M, false).ok).toBe(true);
    // ComfyUI down: no queue to wait on (the producer's health answers for the engine).
    expect(admit(comfy, [], { vramUsedGb: 2, commitUsedGb: 40, cpuBusy: 0.1 }, M, false).ok).toBe(true);
  });
});

describe("peaksOver", () => {
  it("records each peak over the baseline, never below zero, and names what it never read", () => {
    const base: MachineLoad = { commitUsedGb: 50, vramUsedGb: 2, cpuBusy: 0.1 };
    const r = peaksOver(base, [{ commitUsedGb: 60, vramUsedGb: 1, cpuBusy: 0.35 }, { commitUsedGb: 72.5, cpuBusy: 0.6 }], 20);
    expect(r.cost).toEqual({ commitGb: 22.5, vramGb: 0, cpuCores: 10 });
    expect(r.unread).toEqual([]);
    expect(peaksOver({ cpuBusy: 0.1 }, [{ cpuBusy: 0.2 }], 20).unread).toEqual(["commit", "vram"]);
  });
});
