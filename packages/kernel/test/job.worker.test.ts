import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { ResourceLane } from "@gt/domain/lane";
import type { Producer } from "../src/job-core.ts";
import { pickWork, type LaneLook } from "../src/job-queue-core.ts";
import { runJob } from "../src/job-run.ts";
import { workLoop } from "../src/job-worker.ts";
import { enqueue, get, list } from "../src/job.ts";
import { must, scratch } from "./helpers.ts";
import { hostA, jobId, LIVE, openWorld, operator, type World } from "./job-fixture.ts";

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
    const loop = workLoop(w.fx, new Map([["text", text.p], ["gpu", gpu.p]]), { signal: stop.signal, holder: hostA, alive: () => true, idleMs: 5, run: { sleep: async () => {} } });
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
    const loop = workLoop(w.fx, new Map([["gpu", render.p]]), { signal: stop.signal, holder: hostA, alive: (pid) => pid !== corpse.pid, idleMs: 5 });
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
