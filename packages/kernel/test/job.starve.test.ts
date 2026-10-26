import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { ResourceLane } from "@gt/domain/lane";
import type { MachineLoad, MachineProfile, ResourceCost } from "@gt/domain/resource";
import { blobStore } from "../src/blob.ts";
import { liveEffects, type Effects } from "../src/effects.ts";
import { rowToEvent } from "../src/events.ts";
import type { Producer } from "../src/job-core.ts";
import { admitPicks, producerKey, type Pick } from "../src/job-queue-core.ts";
import { workLoop } from "../src/job-worker.ts";
import { enqueue } from "../src/job.ts";
import { openKernel } from "../src/kernel.ts";
import { recordProfile } from "../src/resources/profiles.ts";
import { markFreed, nextHolds, skipDue, unloadDue, type Holds } from "../src/resources/starve.ts";
import type { Store } from "../src/store.ts";
import { must, scratch } from "./helpers.ts";
import { hostA, operator } from "./job-fixture.ts";

// gpu.local starvation (spark scout-vision S6, WP-B): a head admission holds past skipAheadMs lets
// the next fitting job on its lane run, and a gpu.local head held on commit charge past
// unloadAfterMs asks ComfyUI to unload once per episode. The clock is the test's; the unload is a
// counter - nothing here reaches a ComfyUI.

const tmp = scratch("starve");
afterAll(() => tmp.dispose());
let n = 0;

const M: MachineProfile = { vramTotalGb: 64, commitLimitGb: 100, cores: 20, memHigh: 0.85, memLow: 0.75, cpuHigh: 0.9 };
const HEAVY: ResourceCost = { vramGb: 0, commitGb: 25, cpuCores: 2 };
const LIGHT: ResourceCost = { vramGb: 0, commitGb: 0, cpuCores: 0 };
const MIN = 60_000;
const machine = { kind: "machine", id: "test" } as const;
const pick = (lane: ResourceLane, jobId: string, producer: string): Pick => ({ lane, jobId, producer });

describe("starve, pure", () => {
  it("an episode begins at the first refusal, carries over a look the head was not asked, and ends when it leaves the head", () => {
    let h: Holds = nextHolds(new Map(), new Set(["g1"]), [], [{ jobId: "g1", lane: "gpu.local", resource: "memory" }], 0);
    h = nextHolds(h, new Set(["g1"]), [], [], 5 * MIN);
    expect(h.get("g1")).toEqual({ lane: "gpu.local", since: 0, reason: "memory", reasonSince: 0, freed: false });
    expect(skipDue(h, "g1", 10 * MIN - 1, 10 * MIN)).toBe(false);
    expect(skipDue(h, "g1", 10 * MIN, 10 * MIN)).toBe(true);
    expect(nextHolds(h, new Set(["g2"]), [], [], 6 * MIN).has("g1")).toBe(false);
    expect(nextHolds(h, new Set(["g1"]), ["g1"], [], 6 * MIN).has("g1")).toBe(false);
  });

  it("a new reason is a new unload episode but keeps the skip-ahead clock", () => {
    let h: Holds = nextHolds(new Map(), new Set(["g1"]), [], [{ jobId: "g1", lane: "gpu.local", resource: "memory" }], 0);
    h = markFreed(h, "g1");
    h = nextHolds(h, new Set(["g1"]), [], [{ jobId: "g1", lane: "gpu.local", resource: "unread" }], 20 * MIN);
    h = nextHolds(h, new Set(["g1"]), [], [{ jobId: "g1", lane: "gpu.local", resource: "memory" }], 21 * MIN);
    expect(h.get("g1")).toEqual({ lane: "gpu.local", since: 0, reason: "memory", reasonSince: 21 * MIN, freed: false });
  });

  it("an unload is due only on gpu.local, only for commit charge, only once, and never while the lane runs", () => {
    const held = (resource: "memory" | "vram" | "cpu", lane: ResourceLane = "gpu.local"): Holds => nextHolds(new Map(), new Set(["g1"]), [], [{ jobId: "g1", lane, resource }], 0);
    expect(unloadDue(held("memory"), 0, 15 * MIN - 1, 15 * MIN)).toBeUndefined();
    expect(unloadDue(held("memory"), 0, 15 * MIN, 15 * MIN)).toBe("g1");
    expect(unloadDue(held("memory"), 1, 60 * MIN, 15 * MIN)).toBeUndefined();
    expect(unloadDue(held("vram"), 0, 60 * MIN, 15 * MIN)).toBeUndefined();
    expect(unloadDue(held("cpu"), 0, 60 * MIN, 15 * MIN)).toBeUndefined();
    expect(unloadDue(held("memory", "box.blender"), 0, 60 * MIN, 15 * MIN)).toBeUndefined();
    expect(unloadDue(markFreed(held("memory"), "g1"), 0, 60 * MIN, 15 * MIN)).toBeUndefined();
  });
});

describe("admitPicks with a line behind the head", () => {
  const engines: Record<string, string> = { mesh: "comfy", tag: "ollama" };
  const engineOf = (p: Pick): string | undefined => engines[p.producer];
  const costs = new Map<string, ResourceCost>([["comfy", HEAVY], ["ollama", LIGHT]]);
  const full: MachineLoad = { commitUsedGb: 70, vramUsedGb: 2, cpuBusy: 0.1, comfyQueue: 0 };

  it("a refused head lets the first job behind it that admit passes run, and never one admit refuses", () => {
    const behind = new Map([["gpu.local" as const, [pick("gpu.local", "g2", "mesh"), pick("gpu.local", "o1", "tag"), pick("gpu.local", "o2", "tag")]]]);
    const r = admitPicks([pick("gpu.local", "g1", "mesh")], engineOf, costs, [], full, M, false, {}, behind);
    expect(r.admitted.map((p) => p.jobId)).toEqual(["o1"]);
    expect(r.skipped).toEqual([{ pick: pick("gpu.local", "o1", "tag"), over: "g1" }]);
    expect(r.waiting.map((w) => w.pick.jobId)).toEqual(["g1"]);
  });

  it("a head that fits runs; the line behind it is not asked", () => {
    const behind = new Map([["gpu.local" as const, [pick("gpu.local", "o1", "tag")]]]);
    const r = admitPicks([pick("gpu.local", "g1", "mesh")], engineOf, costs, [], { ...full, commitUsedGb: 30 }, M, false, {}, behind);
    expect(r.admitted.map((p) => p.jobId)).toEqual(["g1"]);
    expect(r.skipped).toEqual([]);
  });

  it("when nothing behind fits, nothing runs", () => {
    const behind = new Map([["gpu.local" as const, [pick("gpu.local", "g2", "mesh")]]]);
    const r = admitPicks([pick("gpu.local", "g1", "mesh")], engineOf, costs, [], full, M, false, {}, behind);
    expect(r.admitted).toEqual([]);
    expect(r.skipped).toEqual([]);
  });
});

function world(): { store: Store; fx: Effects } {
  const file = path.join(tmp.dir, `s-${++n}.sqlite`);
  const k = must(openKernel(file, { snapshotDir: tmp.dir }));
  return { store: k.store, fx: liveEffects(k.store, blobStore(`${file}.blobs`)) };
}

function gated(lane: ResourceLane, engine: string): { p: Producer; open: () => void; seen: string[] } {
  let open!: () => void;
  const gate = new Promise<void>((r) => (open = r));
  const seen: string[] = [];
  const p: Producer = {
    lane,
    engine,
    plan: (_j, o) => ["a"].filter((s) => !o.has(s)).map((name) => ({ name, estimate: { seconds: 1, usd: 0 } })),
    perform: async (_step, ctx) => {
      seen.push(ctx.job.id);
      await gate;
      return { kind: "produced", output: {} };
    },
  };
  return { p, open, seen };
}

const until = async (cond: () => boolean, ms = 10_000): Promise<void> => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("condition not reached");
    await new Promise((r) => setTimeout(r, 5));
  }
};

// A lane that is full is not looked at by admission (nothing is picked there), so no probe counts its time.
const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const events = (s: Store, type: string): { subject: string; data: Record<string, unknown> }[] =>
  must(s.read((r) => r.all("SELECT * FROM events WHERE type = ? ORDER BY seq", type))).map((row) => {
    const e = must(rowToEvent(row));
    return { subject: e.subject.id, data: e.data };
  });

type Rig = { store: Store; mesh: ReturnType<typeof gated>; tag: ReturnType<typeof gated>; clock: { ms: number }; probes: () => number; frees: () => number; setLoad: (l: MachineLoad) => void; looks: (k?: number) => Promise<void>; stop: () => Promise<void> };

function rig(jobs: readonly [string, "mesh" | "tag"][], o: { skipAheadMs?: number; unloadAfterMs?: number; free?: () => Promise<void>; load?: MachineLoad } = {}): Rig {
  const w = world();
  must(recordProfile(w.store, { engine: "comfy", cost: HEAVY, samples: 3, measuredAt: "2026-10-26T00:00:00.000Z", sample: "fake" }, machine));
  must(recordProfile(w.store, { engine: "ollama", cost: LIGHT, samples: 3, measuredAt: "2026-10-26T00:00:00.000Z", sample: "fake" }, machine));
  for (const [id, producer] of jobs) must(enqueue(w.store, { id, of: { kind: "run", id }, producer, lane: "gpu.local" }, operator));
  const mesh = gated("gpu.local", "comfy");
  const tag = gated("gpu.local", "ollama");
  const clock = { ms: 0 };
  let load: MachineLoad = o.load ?? { commitUsedGb: 70, vramUsedGb: 2, cpuBusy: 0.1, comfyQueue: 0 };
  let probes = 0;
  let frees = 0;
  const free = o.free ?? (async () => void frees++);
  const ac = new AbortController();
  const loop = workLoop(w.fx, new Map([[producerKey("mesh", "gpu.local"), mesh.p], [producerKey("tag", "gpu.local"), tag.p]]), {
    signal: ac.signal, holder: hostA, alive: () => true, idleMs: 5, now: () => clock.ms,
    admission: {
      machine: M, probe: async () => (probes++, load), free,
      ...(o.skipAheadMs === undefined ? {} : { skipAheadMs: o.skipAheadMs }),
      ...(o.unloadAfterMs === undefined ? {} : { unloadAfterMs: o.unloadAfterMs }),
    },
  });
  return {
    store: w.store, mesh, tag, clock,
    probes: () => probes,
    frees: () => frees,
    setLoad: (l) => void (load = l),
    looks: async (k = 3) => {
      const p0 = probes;
      await until(() => probes >= p0 + k);
    },
    stop: async () => {
      mesh.open();
      tag.open();
      ac.abort();
      must(await loop);
      w.store.close();
    },
  };
}

describe("workLoop: skip-ahead", () => {
  it("passes a held head only after skipAheadMs, with the first fitting job behind it, once, and the head runs first the moment it fits", async () => {
    const r = rig([["g1", "mesh"], ["g2", "mesh"], ["o1", "tag"], ["o2", "tag"]], { unloadAfterMs: 10 * 24 * 60 * MIN });
    await r.looks();
    r.clock.ms = 10 * MIN - 1;
    await r.looks();
    expect(r.tag.seen).toEqual([]);
    r.clock.ms = 10 * MIN;
    await until(() => r.tag.seen.length === 1);
    await pause(100);
    // g2 sits ahead of o1 but admission refuses it as it refuses g1; o2 waits behind the running o1.
    expect(r.mesh.seen).toEqual([]);
    expect(r.tag.seen).toEqual(["o1"]);
    expect(events(r.store, "job.skipped-ahead").map((e) => [e.subject, e.data["jobId"], e.data["over"]])).toEqual([["o1", "o1", "g1"]]);
    // Room again while o1 still holds the slot; when it finishes, the head takes it, not o2.
    r.setLoad({ commitUsedGb: 30, vramUsedGb: 2, cpuBusy: 0.1, comfyQueue: 0 });
    r.tag.open();
    await until(() => r.mesh.seen.length === 1);
    expect(r.mesh.seen).toEqual(["g1"]);
    expect(r.tag.seen).toEqual(["o1"]);
    expect(events(r.store, "job.skipped-ahead")).toHaveLength(1);
    await r.stop();
  }, 20_000);
});

describe("workLoop: unload", () => {
  const free = { unloadAfterMs: 15 * MIN, skipAheadMs: 10 * 24 * 60 * MIN };

  it("asks once per episode after unloadAfterMs of commit hold, and again only in a new episode", async () => {
    const r = rig([["g1", "mesh"]], free);
    await r.looks();
    r.clock.ms = 15 * MIN - 1;
    await r.looks();
    expect(r.frees()).toBe(0);
    r.clock.ms = 15 * MIN;
    await until(() => r.frees() === 1);
    r.clock.ms = 60 * MIN;
    await r.looks(5);
    expect(r.frees()).toBe(1);
    expect(events(r.store, "resource.freed").map((e) => [e.subject, e.data["lane"], e.data["reason"], e.data["jobId"]])).toEqual([["gpu.local", "gpu.local", "memory", "g1"]]);
    // The reading goes dark (a new reason), then memory again: a new episode, timed from its start.
    r.setLoad({ cpuBusy: 0.1 });
    await r.looks();
    r.setLoad({ commitUsedGb: 70, vramUsedGb: 2, cpuBusy: 0.1, comfyQueue: 0 });
    await r.looks();
    r.clock.ms = 75 * MIN - 1;
    await r.looks();
    expect(r.frees()).toBe(1);
    r.clock.ms = 75 * MIN;
    await until(() => r.frees() === 2);
    expect(events(r.store, "resource.freed")).toHaveLength(2);
    await r.stop();
  }, 20_000);

  it("never asks in the look a gpu.local job is admitted, nor while it runs, and asks once it has finished", async () => {
    // Both clocks fall due in one look: the job that skips ahead is admitted in it, so nothing is freed under it.
    const r = rig([["g1", "mesh"], ["o1", "tag"]], { unloadAfterMs: 15 * MIN, skipAheadMs: 15 * MIN });
    await r.looks();
    r.clock.ms = 15 * MIN;
    await until(() => r.tag.seen.length === 1);
    r.clock.ms = 60 * MIN;
    await pause(100);
    expect(r.frees()).toBe(0);
    r.tag.open();
    await until(() => r.frees() === 1);
    await r.stop();
  }, 20_000);

  it("a head held on an unread reading is not held on commit charge: nothing is freed", async () => {
    const r = rig([["g1", "mesh"]], { ...free, load: { cpuBusy: 0.1, comfyQueue: 0 } });
    await r.looks();
    expect(events(r.store, "job.waiting").map((e) => e.data["resource"])).toEqual(["unread"]);
    r.clock.ms = 60 * MIN;
    await r.looks(5);
    expect(r.frees()).toBe(0);
    await r.stop();
  }, 20_000);

  it("a refused unload appends nothing and is not asked again in the episode", async () => {
    let asked = 0;
    const r = rig([["g1", "mesh"]], { ...free, free: async () => {
      asked++;
      throw new Error("ComfyUI at http://127.0.0.1:8188 has 1 prompt(s) queued; its models are in use");
    } });
    await r.looks();
    r.clock.ms = 15 * MIN;
    await until(() => asked === 1);
    r.clock.ms = 60 * MIN;
    await r.looks(5);
    expect(asked).toBe(1);
    expect(events(r.store, "resource.freed")).toEqual([]);
    await r.stop();
  }, 20_000);
});
