import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { ResourceLane } from "@gt/domain/lane";
import type { Producer } from "../src/job-core.ts";
import { pickWork, producerKey, type LaneLook } from "../src/job-queue-core.ts";
import type { Effects } from "../src/effects.ts";
import { claimIn } from "../src/lease.ts";
import { runJob } from "../src/job-run.ts";
import { workLoop } from "../src/job-worker.ts";
import { enqueue, get, list } from "../src/job.ts";
import { must, scratch } from "./helpers.ts";
import { hostA, hostB, jobId, LIVE, openWorld, operator, type World } from "./job-fixture.ts";

// The worker loop: the pure pick (which lane, which job), and the driver that
// recovers first, fills every lane's free slots in order, and parks its drives
// at a step boundary when told to stop.

const tmp = scratch("jobworker");
afterAll(() => tmp.dispose());
let n = 0;
const world = (): World => openWorld(path.join(tmp.dir, `w-${++n}.sqlite`));

const look = (lane: ResourceLane, over: Partial<LaneLook> = {}): LaneLook => ({ lane, capacity: 1, running: 0, held: false, head: { id: `${lane}-head`, producer: "p" }, ...over });

describe("pickWork", () => {
  it("one pick per lane with a free slot, its head; a held or full lane takes nothing", () => {
    const r = pickWork(
      [look("gpu.local"), look("seat.text", { capacity: 4, running: 3 }), look("box.chrome", { held: true }), look("cloud.google", { capacity: 3, running: 3 }), { lane: "box.render", capacity: 1, running: 0, held: false }],
      () => true,
      new Map(),
    );
    expect(r.picks.map((p) => p.lane)).toEqual(["gpu.local", "seat.text"]);
  });

  it("counts this worker's unclaimed starts against the slots, and never picks a head it already started", () => {
    const mine = new Map<ResourceLane, string[]>([["seat.text", ["a", "b"]], ["gpu.local", ["gpu.local-head"]]]);
    expect(pickWork([look("seat.text", { capacity: 2 }), look("gpu.local", { capacity: 2 })], () => true, mine).picks).toEqual([]);
  });

  it("a head whose producer this worker does not carry is named, and the line behind it waits", () => {
    const r = pickWork([look("box.render", { head: { id: "x", producer: "strips" } })], (p) => p !== "strips", new Map());
    expect(r).toEqual({ picks: [], orphans: [{ lane: "box.render", jobId: "x", producer: "strips" }] });
  });
});

describe("pickWork per lane (L41)", () => {
  it("a name carried on one lane is not carried on another: the other lane's head is an orphan, never a pick runJob would refuse", () => {
    const looks = [look("cloud.google", { capacity: 3, head: { id: "dg", producer: "dojo" } }), look("gpu.local", { head: { id: "dl", producer: "dojo" } })];
    const bound = new Set([producerKey("dojo", "cloud.google")]);
    const r = pickWork(looks, (name, lane) => bound.has(producerKey(name, lane)), new Map());
    expect(r).toEqual({ picks: [{ lane: "cloud.google", jobId: "dg", producer: "dojo" }], orphans: [{ lane: "gpu.local", jobId: "dl", producer: "dojo" }] });
  });

  it("an unhealthy producer cools on its own lane only", () => {
    const looks = [look("seat.text", { head: { id: "rt", producer: "research" } }), look("cloud.google", { head: { id: "rg", producer: "research" } })];
    const r = pickWork(looks, () => true, new Map(), { lanes: new Set(), producers: new Set([producerKey("research", "seat.text")]) });
    expect(r.picks.map((p) => p.jobId)).toEqual(["rg"]);
  });
});

describe("pickWork cooling", () => {
  it("a cooling lane or producer takes nothing, and its head is waited for, not named an orphan", () => {
    const looks = [look("gpu.local"), look("seat.text", { head: { id: "t", producer: "article" } }), look("box.render")];
    const r = pickWork(looks, () => true, new Map(), { lanes: new Set(["gpu.local"]), producers: new Set([producerKey("article", "seat.text")]) });
    expect(r).toEqual({ picks: [{ lane: "box.render", jobId: "box.render-head", producer: "p" }], orphans: [] });
  });
});

function gated(lane: ResourceLane): { p: Producer; open: () => void; seen: string[] } {
  let open!: () => void;
  const gate = new Promise<void>((r) => (open = r));
  const seen: string[] = [];
  const p: Producer = {
    lane,
    plan: (_j, o) => ["a", "b"].filter((s) => !o.has(s)).map((name) => ({ name, estimate: { seconds: 1, usd: 0 } })),
    perform: async (step, ctx) => {
      seen.push(`${ctx.job.id}:${step.name}`);
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

describe("workLoop", () => {
  it("fills each lane to its capacity in queue order, runs every job to done, and names a head it cannot make", async () => {
    const w = world();
    for (const id of ["t1", "t2", "t3", "t4", "t5"]) must(enqueue(w.store, { id, of: { kind: "run", id }, producer: "text", lane: "seat.text", mode: LIVE }, operator));
    must(enqueue(w.store, { id: "g1", of: { kind: "run", id: "g1" }, producer: "gpu", lane: "gpu.local" }, operator));
    must(enqueue(w.store, { id: "s1", of: { kind: "run", id: "s1" }, producer: "strips", lane: "box.render" }, operator));
    const text = gated("seat.text");
    const gpu = gated("gpu.local");
    const stop = new AbortController();
    const loop = workLoop(w.fx, new Map([[producerKey("text", "seat.text"), text.p], [producerKey("gpu", "gpu.local"), gpu.p]]), { signal: stop.signal, holder: hostA, alive: () => true, idleMs: 5, run: { sleep: async () => {} } });
    await until(() => text.seen.length === 4 && gpu.seen.length === 1);
    // Four text sessions at once and the fifth waits; one GPU job.
    expect(text.seen.map((s) => s.split(":")[0]).sort()).toEqual(["t1", "t2", "t3", "t4"]);
    expect(must(list(w.store, { state: "running" })).length).toBe(5);
    text.open();
    gpu.open();
    await until(() => must(list(w.store, { state: "done" })).length === 6);
    stop.abort();
    const summary = must(await loop);
    expect(summary.started).toBe(6);
    expect(summary.orphans).toEqual([{ lane: "box.render", jobId: "s1", producer: "strips" }]);
    expect(must(get(w.store, jobId("s1"))).job.state).toBe("queued");
    w.store.close();
  }, 20_000);

  it("drives one name on two lanes with the producer bound for each lane, and leaves a lane it has no binding for queued", async () => {
    const w = world();
    must(enqueue(w.store, { id: "rt", of: { kind: "run", id: "rt" }, producer: "research", lane: "seat.text" }, operator));
    must(enqueue(w.store, { id: "rg", of: { kind: "run", id: "rg" }, producer: "research", lane: "cloud.google" }, operator));
    must(enqueue(w.store, { id: "rl", of: { kind: "run", id: "rl" }, producer: "research", lane: "gpu.local" }, operator));
    const text = gated("seat.text");
    const google = gated("cloud.google");
    text.open();
    google.open();
    const stop = new AbortController();
    const loop = workLoop(w.fx, new Map([[producerKey("research", "seat.text"), text.p], [producerKey("research", "cloud.google"), google.p]]), { signal: stop.signal, holder: hostA, alive: () => true, idleMs: 5 });
    await until(() => must(list(w.store, { state: "done" })).length === 2);
    stop.abort();
    const summary = must(await loop);
    expect(text.seen.map((s) => s.split(":")[0])).toEqual(["rt", "rt"]);
    expect(google.seen.map((s) => s.split(":")[0])).toEqual(["rg", "rg"]);
    expect(summary.reports.every((r) => r.report.ok && r.report.value.outcome === "done")).toBe(true);
    expect(summary.orphans).toEqual([{ lane: "gpu.local", jobId: "rl", producer: "research" }]);
    expect(must(get(w.store, jobId("rl"))).job.state).toBe("queued");
    w.store.close();
  }, 20_000);

  // L27 measured the loop spinning: a head that comes back busy/held/unhealthy changed nothing, and
  // the next look picked it again at once. Each such answer now cools its lane (or producer) for an
  // idle period, so over ~300 ms at idleMs 60 a refused head is tried a handful of times, not thousands.
  it("cools a producer that answers unhealthy for one idle period instead of asking it again at once", async () => {
    const w = world();
    must(enqueue(w.store, { id: "u1", of: { kind: "run", id: "u1" }, producer: "sick", lane: "gpu.local" }, operator));
    let asked = 0;
    const sick: Producer = {
      lane: "gpu.local",
      plan: () => [],
      perform: async () => ({ kind: "produced", output: {} }),
      health: async () => {
        asked++;
        return { ok: false, reason: "ComfyUI is not answering" };
      },
    };
    const stop = new AbortController();
    const loop = workLoop(w.fx, new Map([[producerKey("sick", "gpu.local"), sick]]), { signal: stop.signal, holder: hostA, alive: () => true, idleMs: 60 });
    await new Promise((r) => setTimeout(r, 300));
    stop.abort();
    const summary = must(await loop);
    expect(asked).toBeGreaterThan(0);
    expect(asked).toBeLessThanOrEqual(8);
    expect(summary.started).toBe(asked);
    expect(must(get(w.store, jobId("u1"))).job.state).toBe("queued");
    w.store.close();
  }, 20_000);

  it("cools a lane whose every slot another holder keeps (busy) instead of re-claiming in a tight loop", async () => {
    const w = world();
    // A lease the job table does not show: a v1 GPU shim's holder on the card's one slot.
    must(w.store.tx((t) => claimIn(t, { resource: "gpu.local#1", holder: hostB, ticket: "v1-shim", ttlS: 600, wait: false }, () => true)));
    must(enqueue(w.store, { id: "b1", of: { kind: "run", id: "b1" }, producer: "gpu", lane: "gpu.local" }, operator));
    let claims = 0;
    const fx: Effects = {
      ...w.fx,
      tx: (name, fn) => {
        if (name === "claim") claims++;
        return w.fx.tx(name, fn);
      },
    };
    const gpu = gated("gpu.local");
    const stop = new AbortController();
    const loop = workLoop(fx, new Map([[producerKey("gpu", "gpu.local"), gpu.p]]), { signal: stop.signal, holder: hostA, alive: () => true, idleMs: 60 });
    await new Promise((r) => setTimeout(r, 300));
    stop.abort();
    const summary = must(await loop);
    expect(claims).toBeGreaterThan(0);
    expect(claims).toBeLessThanOrEqual(8);
    expect(summary.reports.every((r) => r.report.ok && r.report.value.outcome === "busy")).toBe(true);
    expect(gpu.seen).toEqual([]);
    w.store.close();
  }, 20_000);

  // A drive that comes back as an ERROR changed nothing either: a dry-only worker refuses a live
  // head at the claim, the head stays first in line, and the next look picked it again at once.
  it("cools a lane whose head the claim refuses (a live job under dry-only) instead of re-driving it at the speed of the loop", async () => {
    const w = world();
    must(enqueue(w.store, { id: "l1", of: { kind: "run", id: "l1" }, producer: "gpu", lane: "gpu.local", mode: LIVE }, operator));
    let claims = 0;
    const fx: Effects = {
      ...w.fx,
      tx: (name, fn) => {
        if (name === "claim") claims++;
        return w.fx.tx(name, fn);
      },
    };
    const gpu = gated("gpu.local");
    const stop = new AbortController();
    const loop = workLoop(fx, new Map([[producerKey("gpu", "gpu.local"), gpu.p]]), { signal: stop.signal, holder: hostA, alive: () => true, idleMs: 60, run: { dryOnly: true } });
    await new Promise((r) => setTimeout(r, 300));
    stop.abort();
    const summary = must(await loop);
    expect(claims).toBeGreaterThan(0);
    expect(claims).toBeLessThanOrEqual(8);
    expect(summary.reports.every((r) => !r.report.ok && r.report.error.detail === "dry-only")).toBe(true);
    expect(must(get(w.store, jobId("l1"))).job.state).toBe("queued");
    w.store.close();
  }, 20_000);

  it("recovers first, and on stop parks a drive at its next step boundary: the step booked, the job back in the queue", async () => {
    const w = world();
    must(enqueue(w.store, { id: "dead", of: { kind: "run", id: "dead" }, producer: "gpu", lane: "gpu.local" }, operator));
    must(enqueue(w.store, { id: "j1", of: { kind: "run", id: "j1" }, producer: "gpu", lane: "box.render" }, operator));
    // A job a dead process left running.
    const corpse = { bootId: "boot-gone", pid: 9_998, host: hostA.host };
    void runJob(w.fx, { lane: "gpu.local", plan: () => [{ name: "x", estimate: { seconds: 1, usd: 0 } }], perform: () => new Promise(() => {}) }, "dead", { holder: corpse, alive: () => true, heartbeatMs: 3_600_000 });
    await until(() => must(get(w.store, jobId("dead"))).job.state === "running");
    const render = gated("box.render");
    const stop = new AbortController();
    const loop = workLoop(w.fx, new Map([[producerKey("gpu", "box.render"), render.p]]), { signal: stop.signal, holder: hostA, alive: (pid) => pid !== corpse.pid, idleMs: 5 });
    await until(() => render.seen.length === 1);
    expect(must(get(w.store, jobId("dead"))).job.state).toBe("interrupted");
    stop.abort();
    render.open();
    const summary = must(await loop);
    expect(summary.recovered).toBe(1);
    const { job } = must(get(w.store, jobId("j1")));
    expect(job).toMatchObject({ state: "queued", progress: { done: 1 } });
    expect(summary.reports.map((r) => r.report.ok && r.report.value.outcome)).toEqual(["yielded"]);
    w.store.close();
  }, 20_000);
});
