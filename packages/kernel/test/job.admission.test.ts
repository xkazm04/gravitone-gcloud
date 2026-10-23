import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { ResourceLane } from "@gt/domain/lane";
import type { MachineLoad, MachineProfile, ResourceCost } from "@gt/domain/resource";
import { blobStore } from "../src/blob.ts";
import { liveEffects, type Effects } from "../src/effects.ts";
import type { Producer } from "../src/job-core.ts";
import { admitPicks, producerKey, type Pick, type Waiting } from "../src/job-queue-core.ts";
import { workLoop } from "../src/job-worker.ts";
import { rowToEvent } from "../src/events.ts";
import { enqueue, get, list } from "../src/job.ts";
import { openKernel } from "../src/kernel.ts";
import { readProfiles, recordProfile } from "../src/resources/profiles.ts";
import type { Store } from "../src/store.ts";
import { must, scratch } from "./helpers.ts";
import { hostA, jobId, operator } from "./job-fixture.ts";

// Admission in the kernel (spark game-3d-assets WP1): the pure filter over a look's picks, the
// engine profiles it charges, and the worker loop that asks it before a drive starts. The safety
// property first - a producer that names no engine is never touched, whatever the machine reads.

const tmp = scratch("admission");
afterAll(() => tmp.dispose());
let n = 0;

const M: MachineProfile = { vramTotalGb: 64, commitLimitGb: 100, cores: 20, memHigh: 0.85, memLow: 0.75, cpuHigh: 0.9 };
const HEAVY: ResourceCost = { vramGb: 0, commitGb: 25, cpuCores: 2 };
const machine = { actor: { kind: "machine", id: "test" } } as const;

function world(): { store: Store; fx: Effects } {
  const file = path.join(tmp.dir, `a-${++n}.sqlite`);
  const k = must(openKernel(file, { snapshotDir: tmp.dir }));
  return { store: k.store, fx: liveEffects(k.store, blobStore(`${file}.blobs`)) };
}

const pick = (lane: ResourceLane, jobId: string, producer: string): Pick => ({ lane, jobId, producer });

describe("admitPicks", () => {
  const engines: Record<string, string> = { mesh: "comfy", bake: "blender", mystery: "unreal" };
  const engineOf = (p: Pick): string | undefined => engines[p.producer];
  const costs = new Map<string, ResourceCost>([["comfy", HEAVY], ["blender", HEAVY]]);

  it("a pick whose producer names no engine is admitted whatever the machine reads - unread, paging, saturated", () => {
    const picks = [pick("seat.text", "t", "article"), pick("box.render", "r", "strips")];
    for (const load of [{}, { commitUsedGb: 99, vramUsedGb: 64, cpuBusy: 1, comfyQueue: 9 }] satisfies MachineLoad[]) {
      for (const tight of [false, true]) {
        const r = admitPicks(picks, engineOf, costs, [{ engine: "unreal" }], load, M, tight);
        expect(r).toEqual({ admitted: picks, waiting: [], tight });
      }
    }
  });

  it("each admitted pick joins the set the next is measured against: two memory-heavy picks in one look, one waits", () => {
    const r = admitPicks([pick("gpu.local", "g", "mesh"), pick("box.blender", "b", "bake")], engineOf, costs, [], { commitUsedGb: 40, vramUsedGb: 2, cpuBusy: 0.1 }, M, false, { commitGb: 40 });
    expect(r.admitted.map((p) => p.jobId)).toEqual(["g"]);
    expect(r.waiting.map((w) => [w.pick.jobId, w.verdict.resource])).toEqual([["b", "memory"]]);
    expect(r.tight).toBe(true);
  });

  it("an unprofiled engine is admitted alone, and nothing engine-bound starts beside it in the same look", () => {
    const r = admitPicks([pick("gpu.local", "u", "mystery"), pick("box.blender", "b", "bake"), pick("seat.text", "t", "article")], engineOf, costs, [], { commitUsedGb: 10, vramUsedGb: 1 }, M, false);
    expect(r.admitted.map((p) => p.jobId)).toEqual(["u", "t"]);
    expect(r.waiting.map((w) => w.verdict.resource)).toEqual(["alone"]);
  });
});

describe("engine profiles", () => {
  it("records a profile with its event, and a re-profile replaces the row and names what it replaced", () => {
    const w = world();
    must(recordProfile(w.store, { engine: "blender", cost: HEAVY, samples: 4, measuredAt: "2026-10-22T10:00:00.000Z", sample: "bake chair" }, machine.actor));
    must(recordProfile(w.store, { engine: "blender", cost: { vramGb: 1, commitGb: 7.5, cpuCores: 9 }, samples: 12, measuredAt: "2026-10-22T11:00:00.000Z", sample: "bake axe" }, machine.actor));
    const all = must(w.store.read((r) => readProfiles(r)));
    expect([...all.keys()]).toEqual(["blender"]);
    expect(all.get("blender")).toEqual({ engine: "blender", cost: { vramGb: 1, commitGb: 7.5, cpuCores: 9 }, samples: 12, measuredAt: "2026-10-22T11:00:00.000Z", sample: "bake axe" });
    const events = must(w.store.read((r) => r.all("SELECT * FROM events WHERE subject_kind = 'engine' ORDER BY seq"))).map((row) => must(rowToEvent(row)));
    expect(events.map((e) => e.type)).toEqual(["engine.profiled", "engine.profiled"]);
    expect(events[1]?.data).toMatchObject({ commitGb: 7.5, replaced: { commitGb: 25 } });
    w.store.close();
  });

  it("refuses a figure that is not one", () => {
    const w = world();
    expect(recordProfile(w.store, { engine: "comfy", cost: { vramGb: Number.NaN, commitGb: 1, cpuCores: 1 }, samples: 1, measuredAt: "2026-10-22T10:00:00.000Z", sample: "x" }, machine.actor).ok).toBe(false);
    expect(recordProfile(w.store, { engine: "Comfy UI", cost: HEAVY, samples: 1, measuredAt: "2026-10-22T10:00:00.000Z", sample: "x" }, machine.actor).ok).toBe(false);
    w.store.close();
  });
});

function gated(lane: ResourceLane, engine?: string): { p: Producer; open: () => void; seen: string[] } {
  let open!: () => void;
  const gate = new Promise<void>((r) => (open = r));
  const seen: string[] = [];
  const p: Producer = {
    lane,
    ...(engine === undefined ? {} : { engine }),
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

const waitingEvents = (s: Store, id: string): string[] =>
  must(s.read((r) => r.all("SELECT * FROM events WHERE type = 'job.waiting' AND subject_id = ? ORDER BY seq", id))).map((row) => String(must(rowToEvent(row)).data["resource"]));

describe("workLoop with admission", () => {
  it("does not drive a refused pick, tells onWait every look, and appends job.waiting once per change of reason", async () => {
    const w = world();
    must(recordProfile(w.store, { engine: "comfy", cost: HEAVY, samples: 3, measuredAt: "2026-10-22T10:00:00.000Z", sample: "fake" }, machine.actor));
    must(recordProfile(w.store, { engine: "blender", cost: HEAVY, samples: 3, measuredAt: "2026-10-22T10:00:00.000Z", sample: "fake" }, machine.actor));
    must(enqueue(w.store, { id: "g1", of: { kind: "run", id: "g1" }, producer: "mesh", lane: "gpu.local" }, operator));
    must(enqueue(w.store, { id: "b1", of: { kind: "run", id: "b1" }, producer: "bake", lane: "box.blender" }, operator));
    must(enqueue(w.store, { id: "t1", of: { kind: "run", id: "t1" }, producer: "text", lane: "seat.text" }, operator));
    const mesh = gated("gpu.local", "comfy");
    const bake = gated("box.blender", "blender");
    const text = gated("seat.text");
    text.open();
    let load: MachineLoad = { commitUsedGb: 70, vramUsedGb: 2, cpuBusy: 0.1, comfyQueue: 0 };
    let probes = 0;
    const waits: [string, string][] = [];
    const stop = new AbortController();
    const loop = workLoop(
      w.fx,
      new Map([[producerKey("mesh", "gpu.local"), mesh.p], [producerKey("bake", "box.blender"), bake.p], [producerKey("text", "seat.text"), text.p]]),
      {
        signal: stop.signal, holder: hostA, alive: () => true, idleMs: 5,
        admission: { machine: M, probe: async () => (probes++, load) },
        onWait: (p, v) => void waits.push([p.jobId, v.resource]),
      },
    );
    // 70 + 25 crosses the 85 mark: both engine jobs wait; the text job, which names no engine, runs.
    await until(() => must(get(w.store, jobId("t1"))).job.state === "done" && waits.filter(([id]) => id === "g1").length >= 5);
    expect(mesh.seen).toEqual([]);
    expect(bake.seen).toEqual([]);
    expect(waitingEvents(w.store, "g1")).toEqual(["memory"]);
    // The reading goes dark: a new reason, one new event.
    load = { cpuBusy: 0.1 };
    const seenSoFar = waits.length;
    await until(() => waits.length >= seenSoFar + 6);
    expect(waitingEvents(w.store, "g1")).toEqual(["memory", "unread"]);
    // Room again (40 + 25 is under the low mark): the mesh starts, and the bake waits for it, measured
    // on the baseline the running mesh sits on (40 + 25 + 25 = 90).
    load = { commitUsedGb: 40, vramUsedGb: 2, cpuBusy: 0.1, comfyQueue: 0 };
    await until(() => mesh.seen.length === 1);
    await until(() => waitingEvents(w.store, "b1").length === 3);
    expect(waitingEvents(w.store, "b1")).toEqual(["memory", "unread", "memory"]);
    expect(bake.seen).toEqual([]);
    mesh.open();
    await until(() => bake.seen.length === 1);
    bake.open();
    await until(() => must(list(w.store, { state: "done" })).length === 3);
    stop.abort();
    must(await loop);
    expect(probes).toBeGreaterThan(5);
    w.store.close();
  }, 20_000);

  it("never probes when no pick names an engine", async () => {
    const w = world();
    must(enqueue(w.store, { id: "t1", of: { kind: "run", id: "t1" }, producer: "text", lane: "seat.text" }, operator));
    const text = gated("seat.text");
    text.open();
    let probes = 0;
    const waited: Waiting[] = [];
    const stop = new AbortController();
    const loop = workLoop(w.fx, new Map([[producerKey("text", "seat.text"), text.p]]), {
      signal: stop.signal, holder: hostA, alive: () => true, idleMs: 5,
      admission: { machine: M, probe: async () => (probes++, {}) },
      onWait: (p, verdict) => void waited.push({ pick: p, verdict }),
    });
    await until(() => must(get(w.store, jobId("t1"))).job.state === "done");
    stop.abort();
    must(await loop);
    expect(probes).toBe(0);
    expect(waited).toEqual([]);
    w.store.close();
  }, 20_000);
});
