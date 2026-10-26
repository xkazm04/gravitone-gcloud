// THE MACHINE PROBE AND THE PROFILE JOB (spark game-3d-assets WP1) - fake readings, a fake
// command, a temp kernel store: no PowerShell, no nvidia-smi, no ComfyUI, no engine run.
//   · the probe's parsers read this box's real answers (an NPU line of `[N/A]` beside the GPU),
//     and a reading that fails is ABSENT, never zero and never a throw;
//   · the machine profile takes totals from the reading and marks from the environment;
//   · a profile job runs its command under the probe and records the peaks over the baseline,
//     re-profiling replaces, a failed command and an unread commit charge record nothing.

import { afterAll, describe, expect, it } from "vitest";

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { MachineLoad } from "@gt/domain/resource";
import { openKernel } from "@gt/kernel/kernel";
import { readProfiles, recordProfile } from "@gt/kernel/resources/profiles";
import type { Store } from "@gt/kernel/store";
import type { ProfilePorts } from "@gt/producers/profile/define";

import { driveProfile, launchProfile } from "../../lib/producers/profile.ts";
import { comfyFree } from "../../lib/resources/comfyFree.ts";
import { busyBetween, machineAdmission, machineProbe, machineProfile, parseCim, parseQueue, parseSmi, type ProbePorts } from "../../lib/resources/probe.ts";

const DIR = mkdtempSync(path.join(tmpdir(), "gt-resources-"));
afterAll(() => rmSync(DIR, { recursive: true, force: true }));
let n = 0;
const operator = { kind: "operator", id: "test" } as const;

function store(): { store: Store; location: string } {
  const location = path.join(DIR, `k-${++n}.sqlite`);
  const k = openKernel(location, { snapshotDir: DIR });
  if (!k.ok) throw k.error;
  return { store: k.value.store, location };
}

describe("the probe's parsers", () => {
  it("reads the CIM line in KB as GB, and refuses anything else", () => {
    expect(parseCim("106840040 49390536 36575000 67100000")).toEqual({ commitLimitGb: 101.89, commitUsedGb: 54.79, ramFreeGb: 34.88, ramTotalGb: 63.99 });
    expect(parseCim(undefined)).toBeUndefined();
    expect(parseCim("")).toBeUndefined();
    expect(parseCim("1 2 3")).toBeUndefined();
    expect(parseCim("a b c d")).toBeUndefined();
  });

  it("sums the devices that report memory and skips the ones that report [N/A] (archemond's NPU)", () => {
    expect(parseSmi("1788, 64000\r\n[N/A], [N/A]\r\n")).toEqual({ vramUsedGb: 1.75, vramTotalGb: 62.5 });
    expect(parseSmi("1788, 64000, 12\r\n[N/A], [N/A], [N/A]\r\n")).toEqual({ vramUsedGb: 1.75, vramTotalGb: 62.5, gpuBusy: 0.12 });
    expect(parseSmi("[N/A], [N/A]")).toBeUndefined();
    expect(parseSmi(undefined)).toBeUndefined();
  });

  it("reads the card's utilisation as gpuBusy, absent when the device says [N/A] (spark night-load-band)", () => {
    // MiB over 1024: 13690 MiB is 13.37 GB.
    expect(parseSmi("13690, 64000, 5")).toEqual({ vramUsedGb: 13.37, vramTotalGb: 62.5, gpuBusy: 0.05 });
    // A device with no memory of its own is skipped whole, its utilisation with it.
    expect(parseSmi("[N/A], [N/A], 0")).toBeUndefined();
    expect(parseSmi("13690, 64000, [N/A]")).toEqual({ vramUsedGb: 13.37, vramTotalGb: 62.5 });
    expect(parseSmi("13690, 64000, 5\r\n[N/A], [N/A], 0\r\n")).toEqual({ vramUsedGb: 13.37, vramTotalGb: 62.5, gpuBusy: 0.05 });
    // The busiest device that answered; a percentage off the scale is unread, not clamped.
    expect(parseSmi("1024, 8192, 30\n1024, 8192, 90")).toEqual({ vramUsedGb: 2, vramTotalGb: 16, gpuBusy: 0.9 });
    expect(parseSmi("1024, 8192, 130")).toEqual({ vramUsedGb: 1, vramTotalGb: 8 });
    expect(parseSmi("1024, 8192, 5, 9")).toBeUndefined();
  });

  it("counts ComfyUI's running and pending prompts, and nothing that is not its queue", () => {
    expect(parseQueue({ queue_running: [[1]], queue_pending: [[2], [3]] })).toBe(3);
    expect(parseQueue({ queue_running: [], queue_pending: [] })).toBe(0);
    expect(parseQueue({ error: "nope" })).toBeUndefined();
    expect(parseQueue(undefined)).toBeUndefined();
  });

  it("reads CPU busy between two samples", () => {
    const t = (idle: number, user: number) => ({ times: { user, nice: 0, sys: 0, idle, irq: 0 } });
    expect(busyBetween([t(100, 100), t(100, 100)], [t(150, 150), t(200, 100)])).toBe(0.25);
    expect(busyBetween([], [])).toBeUndefined();
  });
});

const fakePorts = (over: Partial<ProbePorts> = {}): ProbePorts & { runs: string[] } => {
  const runs: string[] = [];
  return {
    runs,
    run: async (cmd) => {
      runs.push(cmd);
      return cmd === "powershell" ? "106840040 49390536 36575000 67100000" : "1788, 64000, 7\n[N/A], [N/A], [N/A]";
    },
    getJson: async () => ({ queue_running: [], queue_pending: [[1]] }),
    cpus: () => [{ times: { user: 1, nice: 0, sys: 0, idle: 1, irq: 0 } }],
    sleep: async () => {},
    now: () => 0,
    env: {},
    ...over,
  };
};

describe("machineProbe", () => {
  it("reads every channel, and caches the CIM call", async () => {
    const ports = fakePorts();
    const p = machineProbe(ports);
    const r = await p.read();
    expect(r.load).toEqual({ vramUsedGb: 1.75, gpuBusy: 0.07, commitUsedGb: 54.79, comfyQueue: 1 });
    expect(r.totals).toMatchObject({ commitLimitGb: 101.89, vramTotalGb: 62.5, cores: 1 });
    await p.probe();
    expect(ports.runs.filter((c) => c === "powershell")).toHaveLength(1);
  });

  it("a channel that fails is absent - not zero, not a throw", async () => {
    const p = machineProbe(fakePorts({ run: async () => undefined, getJson: async () => undefined, cpus: () => [] }));
    expect(await p.probe()).toEqual({});
  });

  it("the worker's source probes nothing until asked, and takes its profile from the first reading", async () => {
    const ports = fakePorts();
    const a = machineAdmission(ports);
    expect(ports.runs).toEqual([]);
    expect(a.machine).toMatchObject({ commitLimitGb: 0, vramTotalGb: 0 });
    expect(await a.probe()).toMatchObject({ commitUsedGb: 54.79 });
    expect(a.machine).toMatchObject({ commitLimitGb: 101.89, vramTotalGb: 62.5, memHigh: 0.85 });
  });

  it("the machine profile takes totals from the reading and marks from the environment", () => {
    const { profile, unread } = machineProfile({ commitLimitGb: 101.89, cores: 20 }, { MACHINE_MEM_HIGH: "0.8", MACHINE_MEM_LOW: "0.9", MACHINE_VRAM_GB: "64" });
    expect(profile).toEqual({ commitLimitGb: 101.89, vramTotalGb: 64, cores: 20, memHigh: 0.8, memLow: 0.8, cpuHigh: 0.9 });
    expect(unread).toEqual([]);
    expect(machineProfile({ cores: 4 }, {}).unread).toEqual(["commit", "vram"]);
  });
});

describe("the held-head clocks and the ComfyUI unload (spark scout-vision S6)", () => {
  it("reads GPU_SKIP_AHEAD_MS and COMFY_UNLOAD_AFTER_MS beside the marks; unset or not a whole number leaves the kernel's default", () => {
    const set = machineAdmission(fakePorts({ env: { GPU_SKIP_AHEAD_MS: "120000", COMFY_UNLOAD_AFTER_MS: "300000" } }), async () => {});
    expect([set.skipAheadMs, set.unloadAfterMs]).toEqual([120_000, 300_000]);
    const bad = machineAdmission(fakePorts({ env: { GPU_SKIP_AHEAD_MS: "ten", COMFY_UNLOAD_AFTER_MS: "-5" } }), async () => {});
    expect([bad.skipAheadMs, bad.unloadAfterMs]).toEqual([undefined, undefined]);
  });

  it("POSTs /free with unload_models and free_memory at COMFY_URL, and refuses while a prompt is queued or the answer is not 2xx", async () => {
    const posts: [string, unknown][] = [];
    let queue: unknown = { queue_running: [], queue_pending: [] };
    let status: number | undefined = 200;
    const free = comfyFree({ COMFY_URL: "http://comfy.test:9000/" }, {
      getJson: async () => queue,
      postJson: async (url, body) => (posts.push([url, body]), status),
    });
    await free();
    expect(posts).toEqual([["http://comfy.test:9000/free", { unload_models: true, free_memory: true }]]);
    queue = { queue_running: [[1]], queue_pending: [] };
    await expect(free()).rejects.toThrow(/1 prompt\(s\) queued/);
    queue = undefined;
    await expect(free()).rejects.toThrow(/did not answer/);
    queue = { queue_running: [], queue_pending: [] };
    status = 500;
    await expect(free()).rejects.toThrow(/answered \/free with 500/);
    expect(posts).toHaveLength(2);
  });
});

/** A fake engine: the command runs for `ticks` probe readings, the readings climb then fall. */
function fakeEngine(readings: readonly MachineLoad[], exit: { code: number | null; tail: string } = { code: 0, tail: "" }): ProfilePorts & { argv: string[][] } {
  const argv: string[][] = [];
  let i = 0;
  let finish: (() => void) | undefined;
  return {
    argv,
    cores: 20,
    probe: async () => {
      const r = readings[Math.min(i, readings.length - 1)] ?? {};
      i++;
      if (i >= readings.length) finish?.();
      return r;
    },
    spawn: (a) => {
      argv.push([...a]);
      return { done: new Promise((resolve) => (finish = () => resolve(exit))) };
    },
    sleep: () => new Promise((r) => setImmediate(r)),
    now: () => Date.parse("2026-10-22T12:00:00.000Z"),
  };
}

describe("the profile job", () => {
  const BASE: MachineLoad = { commitUsedGb: 50, vramUsedGb: 2, cpuBusy: 0.1, comfyQueue: 0 };

  it("runs the command under the probe and records its peaks over the baseline; a re-profile replaces", async () => {
    const { store: s, location } = store();
    const ports = fakeEngine([BASE, { commitUsedGb: 60, vramUsedGb: 3, cpuBusy: 0.5 }, { commitUsedGb: 58, vramUsedGb: 3.5, cpuBusy: 0.6 }]);
    const launched = launchProfile(s, { engine: "blender", argv: ["blender", "-b", "--python", "bake.py"], label: "bake chair" }, operator, new Date("2026-10-22T12:00:00.000Z"));
    if (!launched.ok) throw launched.error;
    expect(launched.value).toMatchObject({ lane: "box.blender", runId: "profile:blender:20261022-120000000Z" });
    const r = await driveProfile(s, location, launched.value.jobId, launched.value.lane, { ports });
    if (!r.ok) throw r.error;
    expect(r.value.job?.state).toBe("done");
    expect(ports.argv).toEqual([["blender", "-b", "--python", "bake.py"]]);
    const p = s.read((rd) => readProfiles(rd).get("blender"));
    if (!p.ok) throw p.error;
    expect(p.value).toEqual({ engine: "blender", cost: { commitGb: 10, vramGb: 1.5, cpuCores: 10 }, samples: 2, measuredAt: "2026-10-22T12:00:00.000Z", sample: "bake chair" });

    const again = launchProfile(s, { engine: "blender", argv: ["blender", "-b"], label: "bake axe" }, operator, new Date("2026-10-22T13:00:00.000Z"));
    if (!again.ok) throw again.error;
    const r2 = await driveProfile(s, location, again.value.jobId, again.value.lane, { ports: fakeEngine([BASE, { commitUsedGb: 54, vramUsedGb: 2, cpuBusy: 0.2 }]) });
    if (!r2.ok) throw r2.error;
    const all = s.read((rd) => [...readProfiles(rd).values()]);
    if (!all.ok) throw all.error;
    expect(all.value).toEqual([{ engine: "blender", cost: { commitGb: 4, vramGb: 0, cpuCores: 2 }, samples: 1, measuredAt: "2026-10-22T12:00:00.000Z", sample: "bake axe" }]);
    s.close();
  });

  it("a command that exits non-zero records nothing, and the job fails with its last lines", async () => {
    const { store: s, location } = store();
    const launched = launchProfile(s, { engine: "ffmpeg", argv: ["ffmpeg", "-i", "x"] }, operator);
    if (!launched.ok) throw launched.error;
    const r = await driveProfile(s, location, launched.value.jobId, launched.value.lane, { ports: fakeEngine([BASE, BASE], { code: 1, tail: "x: No such file or directory" }) });
    if (!r.ok) throw r.error;
    expect(r.value.job?.state).toBe("failed");
    expect(r.value.job?.error?.message).toContain("No such file or directory");
    const p = s.read((rd) => readProfiles(rd).size);
    expect(p.ok && p.value).toBe(0);
    s.close();
  });

  it("a run whose commit charge was never read records nothing", async () => {
    const { store: s, location } = store();
    const launched = launchProfile(s, { engine: "comfy", argv: ["python", "queue_prompt.py"] }, operator);
    if (!launched.ok) throw launched.error;
    expect(launched.value.lane).toBe("gpu.local");
    const r = await driveProfile(s, location, launched.value.jobId, launched.value.lane, { ports: fakeEngine([{ vramUsedGb: 2 }, { vramUsedGb: 14 }]) });
    if (!r.ok) throw r.error;
    expect(r.value.job?.error?.message).toContain("commit charge was never read");
    s.close();
  });

  it("refuses an engine with no lane, an empty command, and the profiler itself", () => {
    const { store: s } = store();
    expect(launchProfile(s, { engine: "maya", argv: ["maya"] }, operator).ok).toBe(false);
    expect(launchProfile(s, { engine: "blender", argv: [] }, operator).ok).toBe(false);
    expect(recordProfile(s, { engine: "profile", cost: { vramGb: 0, commitGb: 1, cpuCores: 1 }, samples: 1, measuredAt: "2026-10-22T12:00:00.000Z", sample: "x" }, operator).ok).toBe(false);
    const none = s.read((rd) => rd.get("SELECT count(*) AS c FROM jobs")?.["c"]);
    expect(none.ok && none.value).toBe(0);
    s.close();
  });
});
