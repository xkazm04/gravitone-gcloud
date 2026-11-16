import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { Producer } from "../src/job-core.ts";
import { runJob } from "../src/job-run.ts";
import { enqueue, list } from "../src/job.ts";
import { claimIn, releaseIn } from "../src/lease.ts";
import { workerVerdict, type WorkerPulse } from "../src/worker-pulse-core.ts";
import { workerPulseIn } from "../src/worker-pulse.ts";
import { must, scratch } from "./helpers.ts";
import { hostA, hostB, openWorld, operator, type World } from "./job-fixture.ts";

// IS ANYTHING DRIVING THE QUEUE (./worker-pulse-core.ts): the verdict over each branch, and the
// read that gathers its facts from the leases and the jobs a real store holds. hostB is on another
// host, so only its TTL can make its lease stale - the same rule the screens read under.

const tmp = scratch("workerpulse");
afterAll(() => tmp.dispose());
let n = 0;
const world = (): World => openWorld(path.join(tmp.dir, `w-${++n}.sqlite`));
const TIMERS = ["timer:publish-tick", "timer:metrics-refresh"];
const pulse = (w: World): WorkerPulse => must(w.store.read((r) => workerPulseIn(r, TIMERS, hostA, () => true)));
const T0 = "2026-10-15T12:00:00.000Z";

const queue = (w: World, id: string): void => void must(enqueue(w.store, { id, of: { kind: "run", id }, producer: "p", lane: "cloud.google" }, operator));
const claim = (w: World, resource: string, ttlS = 120): void => void must(w.store.tx((t) => claimIn(t, { resource, holder: hostB, ticket: `t-${resource}`, ttlS, wait: false }, () => true)));

describe("workerVerdict", () => {
  const base: WorkerPulse = { at: T0, queued: 0, queuedSince: null, timerBeating: false, driving: 0, lastBeat: null };
  it("nothing queued is quiet, whatever beats", () => {
    expect(workerVerdict(base)).toEqual({ kind: "quiet" });
    expect(workerVerdict({ ...base, timerBeating: true })).toEqual({ kind: "quiet" });
  });
  it("queued work with a timer beating, or a drive in flight, is alive", () => {
    expect(workerVerdict({ ...base, queued: 2, timerBeating: true })).toEqual({ kind: "alive" });
    expect(workerVerdict({ ...base, queued: 2, driving: 1 })).toEqual({ kind: "alive" });
  });
  it("queued work and no beat is none, carrying the queue's age and the last beat", () => {
    expect(workerVerdict({ ...base, queued: 3, queuedSince: T0, lastBeat: "2026-10-15T11:00:00.000Z" })).toEqual({ kind: "none", queued: 3, queuedSince: T0, lastBeat: "2026-10-15T11:00:00.000Z" });
  });
});

describe("workerPulseIn", () => {
  it("an empty store: nothing queued, nothing ever beat", () => {
    const w = world();
    expect(pulse(w)).toEqual({ at: T0, queued: 0, queuedSince: null, timerBeating: false, driving: 0, lastBeat: null });
    w.store.close();
  });

  it("a queued job and no lease: none, queued since its enqueue", () => {
    const w = world();
    queue(w, "a");
    w.clock.ms += 60_000;
    queue(w, "b");
    const p = pulse(w);
    expect(p).toMatchObject({ queued: 2, queuedSince: T0, timerBeating: false, driving: 0, lastBeat: null });
    expect(workerVerdict(p).kind).toBe("none");
    w.store.close();
  });

  it("a timer the worker beats within its TTL: alive; past its TTL: none, last beat its heartbeat", () => {
    const w = world();
    queue(w, "a");
    claim(w, "timer:publish-tick");
    expect(workerVerdict(pulse(w)).kind).toBe("alive");
    w.clock.ms += 121_000;
    const p = pulse(w);
    expect(p).toMatchObject({ timerBeating: false, lastBeat: T0 });
    expect(workerVerdict(p).kind).toBe("none");
    w.store.close();
  });

  it("a lease the worker does not hold says nothing: an unnamed timer, a bare lane (the v1 GPU broker)", () => {
    const w = world();
    queue(w, "a");
    claim(w, "timer:not-ours");
    claim(w, "gpu.local");
    const p = pulse(w);
    expect(p).toMatchObject({ timerBeating: false, driving: 0, lastBeat: null });
    expect(workerVerdict(p).kind).toBe("none");
    w.store.close();
  });

  it("a released timer is not beating; its release is the last beat", () => {
    const w = world();
    queue(w, "a");
    claim(w, "timer:publish-tick");
    w.clock.ms += 30_000;
    expect(must(w.store.tx((t) => releaseIn(t, "timer:publish-tick", 1)))).toBe(true);
    const p = pulse(w);
    expect(p).toMatchObject({ timerBeating: false, lastBeat: "2026-10-15T12:00:30.000Z" });
    w.store.close();
  });

  it("a job in flight holds its slot fresh: driving, alive, though no timer beats", async () => {
    const w = world();
    queue(w, "a");
    queue(w, "b");
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    const p: Producer = { lane: "cloud.google", plan: (_j, o) => (o.has("x") ? [] : [{ name: "x", estimate: { seconds: 1, usd: 0 } }]), perform: async () => (await gate, { kind: "produced", output: {} }) };
    const drive = runJob(w.fx, p, "a", { holder: hostA, alive: () => true, sleep: async () => {} });
    for (let i = 0; i < 400 && must(list(w.store, { state: "running" })).length === 0; i++) await new Promise((r) => setTimeout(r, 5));
    const mid = pulse(w);
    expect(mid).toMatchObject({ queued: 1, driving: 1, timerBeating: false });
    expect(workerVerdict(mid).kind).toBe("alive");
    open();
    must(await drive);
    expect(pulse(w)).toMatchObject({ queued: 1, driving: 0 });
    w.store.close();
  }, 20_000);
});
