import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { LANE_CAPACITY, PAID_LANES, FREE_LANES, RESOURCE_LANES, laneSlots, type ResourceLane } from "@gt/domain/lane";
import { ackLane, laneHold, move, nextClaimable, queueOf, queuePosition } from "../src/job-queue.ts";
import { recover, runJob, type RunOptions } from "../src/job-run.ts";
import { steerSchema, type Steer as DomainSteer } from "@gt/domain/job";
import { enqueue, enqueueIn, get, list, pause, release, releaseIn, reroute, resume, retry, routerSteer } from "../src/job.ts";
import type { RouteOutcome, Steer } from "../src/router/types.ts";
import { must, scratch } from "./helpers.ts";
import { agent, count, eventTypes, hostA, hostB, jobId, LIVE, openWorld, operator, producer, type World } from "./job-fixture.ts";

// Jobs v2 (Phase 4, L25): enqueue inside a caller's transaction, the queue
// order and the computed position, lane slots, the paid-lane hold a crash
// leaves, the re-route the router judges, and the correlation keys every job
// event carries.

const tmp = scratch("jobq");
afterAll(() => tmp.dispose());
let n = 0;
const world = (): World => openWorld(path.join(tmp.dir, `q-${++n}.sqlite`));
const opts: RunOptions = { holder: hostA, alive: () => true, sleep: async () => {} };

function put(w: World, id: string, lane: ResourceLane, extra: Record<string, unknown> = {}): void {
  must(enqueue(w.store, { id, of: { kind: "run", id: `run-${id}` }, producer: "test", lane, mode: LIVE, ...extra }, operator));
}
const ids = (jobs: readonly { id: string }[]): string[] => jobs.map((j) => j.id);

describe("enqueueIn", () => {
  it("writes inside the caller's transaction: a rollback leaves no job and no event", () => {
    const w = world();
    const r = w.store.tx((t) => {
      enqueueIn(t, { id: "j1", of: { kind: "part", id: "p1" }, producer: "frames", lane: "gpu.local" }, operator);
      throw new Error("the Run row that should have gone with it failed");
    });
    expect(r.ok).toBe(false);
    expect(must(list(w.store))).toEqual([]);
    expect(count(w.store, "SELECT count(*) AS n FROM events")).toBe(0);
    w.store.close();
  });

  it("an absent mode is dry; the record carries mode, producer, ceiling, steer and correlation", () => {
    const w = world();
    const job = must(w.store.tx((t) => enqueueIn(t, { id: "j1", of: { kind: "part", id: "p1" }, producer: "frames", lane: "gpu.local", ceilingUsd: 2, steer: { prefer: "google" }, correlation: { projectId: "prj-1" } }, operator)));
    expect(job).toMatchObject({ mode: { kind: "dry" }, producer: "frames", ceilingUsd: 2, steer: { prefer: "google" }, correlation: { projectId: "prj-1" } });
    expect(must(get(w.store, jobId("j1"))).terms).toEqual({ ceilingUsd: 2 });
    w.store.close();
  });

  it("every job event fills the ledger's project_id and run_id columns", async () => {
    const w = world();
    put(w, "j1", "gpu.local", { correlation: { projectId: "prj-7", runId: "run-7" } });
    put(w, "j2", "gpu.local");
    const { p } = producer("gpu.local", ["a"]);
    must(await runJob(w.fx, p, "j1", opts));
    const rows = must(w.store.read((r) => r.all("SELECT type, project_id, run_id FROM events WHERE subject_id = 'j1' ORDER BY seq")));
    expect(rows.length).toBeGreaterThan(3);
    for (const row of rows) expect(row, String(row["type"])).toMatchObject({ project_id: "prj-7", run_id: "run-7" });
    // A Run's job is about its run even when nobody said so.
    expect(must(w.store.read((r) => r.get("SELECT run_id FROM events WHERE subject_id = 'j2'")))).toEqual({ run_id: "run-j2" });
    w.store.close();
  });
});

describe("planned jobs wait on upstream work", () => {
  it("a planned job is never claimed or counted in line, cannot be paused, and releaseIn queues it once", async () => {
    const w = world();
    put(w, "up", "gpu.local");
    put(w, "down", "gpu.local", { state: "planned" });
    expect(must(get(w.store, jobId("down"))).job.state).toBe("planned");
    expect(ids(must(w.store.read((r) => queueOf(r, "gpu.local"))))).toEqual(["up"]);
    expect(must(w.store.read((r) => queuePosition(r, "down")))).toBeUndefined();
    const { p, calls } = producer("gpu.local", ["x"]);
    expect(must(await runJob(w.fx, p, "down", opts)).outcome).toBe("not-queued");
    expect(calls.size).toBe(0);
    expect(pause(w.store, jobId("down"), operator)).toMatchObject({ ok: false, error: { code: "refused" } });
    expect(resume(w.store, jobId("down"), operator)).toMatchObject({ ok: false, error: { code: "refused" } });
    must(pause(w.store, jobId("up"), operator));
    // paused -> queued is a legal edge, and still not `release`'s: that is resume, the operator's act.
    expect(release(w.store, jobId("up"), operator)).toMatchObject({ ok: false, error: { code: "refused" } });
    must(resume(w.store, jobId("up"), operator));
    expect(must(w.store.tx((t) => releaseIn(t, "down", operator))).state).toBe("queued");
    expect(eventTypes(w.store, "down")).toEqual(["job.enqueued", "job.released"]);
    expect(release(w.store, jobId("down"), operator)).toMatchObject({ ok: false, error: { code: "refused" } });
    expect(ids(must(w.store.read((r) => queueOf(r, "gpu.local"))))).toEqual(["up", "down"]);
    w.store.close();
  });
});

describe("queue order and position", () => {
  it("queueOf follows the order column; an explicit order places a job; position counts running slots ahead", async () => {
    const w = world();
    put(w, "a", "gpu.local");
    put(w, "b", "gpu.local");
    put(w, "c", "gpu.local", { order: 0.5 });
    expect(ids(must(w.store.read((r) => queueOf(r, "gpu.local"))))).toEqual(["c", "a", "b"]);
    expect(must(w.store.read((r) => queuePosition(r, "b")))).toMatchObject({ position: 3, ahead: 2, running: 0, capacity: 1 });
    // c runs (and stays running, its producer blocked): it is ahead of everyone left in line.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { p } = producer("gpu.local", ["x"], async () => {
      await gate;
      return { kind: "produced", output: {} };
    });
    const drive = runJob(w.fx, p, "c", opts);
    await new Promise((r) => setTimeout(r, 20));
    expect(must(w.store.read((r) => queuePosition(r, "a")))).toMatchObject({ position: 2, running: 1 });
    expect(must(w.store.read((r) => queuePosition(r, "c")))).toBeUndefined();
    release();
    must(await drive);
    w.store.close();
  });

  it("move swaps with the lane neighbour, stays put at an edge, and is refused for a job not waiting", () => {
    const w = world();
    for (const id of ["a", "b", "c"]) put(w, id, "seat.text");
    put(w, "other", "gpu.local");
    must(move(w.store, jobId("c"), "earlier", operator));
    expect(ids(must(w.store.read((r) => queueOf(r, "seat.text"))))).toEqual(["a", "c", "b"]);
    must(move(w.store, jobId("a"), "earlier", operator));
    expect(ids(must(w.store.read((r) => queueOf(r, "seat.text"))))).toEqual(["a", "c", "b"]);
    must(move(w.store, jobId("a"), "later", operator));
    expect(ids(must(w.store.read((r) => queueOf(r, "seat.text"))))).toEqual(["c", "a", "b"]);
    expect(eventTypes(w.store, "a")).toEqual(["job.enqueued", "job.reordered"]);
    expect(ids(must(list(w.store, { lane: "seat.text" })))).toEqual(["c", "a", "b"]);
    must(w.store.tx((t) => t.run("UPDATE jobs SET state = 'paused', record = json_set(record, '$.state', 'paused') WHERE id = 'b'")));
    expect(move(w.store, jobId("b"), "earlier", operator)).toMatchObject({ ok: false, error: { code: "refused" } });
    w.store.close();
  });

  it("two jobs given the same order still swap", () => {
    const w = world();
    put(w, "a", "gpu.local", { order: 1 });
    put(w, "b", "gpu.local", { order: 1 });
    must(move(w.store, jobId("b"), "earlier", operator));
    expect(ids(must(w.store.read((r) => queueOf(r, "gpu.local"))))).toEqual(["b", "a"]);
    w.store.close();
  });
});

describe("lane slots (decision 5)", () => {
  it("the capacity table is the decision's, and every lane has that many slots", () => {
    expect(LANE_CAPACITY).toEqual({ "gpu.local": 1, "box.render": 1, "box.chrome": 1, "seat.text": 4, "cloud.google": 3, "cloud.elevenlabs": 2, "cloud.leonardo": 2, "cloud.qwen": 1 });
    for (const l of RESOURCE_LANES) expect(laneSlots(l)).toHaveLength(LANE_CAPACITY[l]);
    expect([...PAID_LANES, ...FREE_LANES].sort()).toEqual([...RESOURCE_LANES].sort());
    expect(FREE_LANES).toEqual(["gpu.local", "box.render"]);
  });

  it("two cloud.elevenlabs jobs run at once on two slots; a third is busy and stays queued", async () => {
    const w = world();
    for (const id of ["a", "b", "c"]) put(w, id, "cloud.elevenlabs");
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { p } = producer("cloud.elevenlabs", ["x"], async () => {
      await gate;
      return { kind: "produced", output: {} };
    });
    const one = runJob(w.fx, p, "a", opts);
    const two = runJob(w.fx, p, "b", { ...opts, holder: hostB });
    await new Promise((r) => setTimeout(r, 20));
    const running = must(list(w.store, { state: "running" }));
    expect(running.map((j) => j.slot).sort()).toEqual(["cloud.elevenlabs#1", "cloud.elevenlabs#2"]);
    expect(must(await runJob(w.fx, p, "c", opts))).toMatchObject({ outcome: "busy" });
    expect(must(get(w.store, jobId("c"))).job.state).toBe("queued");
    release();
    expect(must(await one).outcome).toBe("done");
    expect(must(await two).outcome).toBe("done");
    expect(must(await runJob(w.fx, p, "c", opts)).outcome).toBe("done");
    w.store.close();
  });
});

describe("crash policy: a paid lane holds (decision 6)", () => {
  async function crashOn(lane: ResourceLane): Promise<World> {
    const w = world();
    put(w, "a", lane);
    put(w, "b", lane);
    const dead = { bootId: "boot-dead", pid: 9_999, host: hostA.host };
    const { p } = producer(lane, ["x"], () => new Promise(() => {})); // never returns: the process "dies" mid-step
    void runJob(w.fx, p, "a", { ...opts, holder: dead, heartbeatMs: 3_600_000 });
    await new Promise((r) => setTimeout(r, 20));
    must(recover(w.fx, { holder: hostA, alive: (pid) => pid !== dead.pid }));
    return w;
  }

  it("an interruption on seat.text holds the lane: nothing is claimed until an operator acknowledges", async () => {
    const w = await crashOn("seat.text");
    const held = must(w.store.read((r) => laneHold(r, "seat.text")));
    expect(held).toMatchObject({ jobId: "a", stage: "x" });
    expect(must(w.store.read((r) => nextClaimable(r, "seat.text")))).toBeUndefined();
    const { p } = producer("seat.text", ["x"]);
    expect(must(await runJob(w.fx, p, "b", opts))).toMatchObject({ outcome: "held" });
    expect(ackLane(w.store, "seat.text", agent)).toMatchObject({ ok: false, error: { code: "refused" } });
    const acked = must(ackLane(w.store, "seat.text", operator));
    expect(acked).toEqual([expect.objectContaining({ jobId: "a", stage: "x" })]);
    const ev = must(w.store.read((r) => r.get("SELECT data FROM events WHERE type = 'lane.acknowledged'")));
    expect(String(ev?.["data"])).toContain("job a at x");
    expect(must(w.store.read((r) => nextClaimable(r, "seat.text")))?.id).toBe("b");
    expect(must(await runJob(w.fx, p, "b", opts)).outcome).toBe("done");
    expect(ackLane(w.store, "seat.text", operator)).toMatchObject({ ok: false, error: { code: "refused" } });
    w.store.close();
  });

  it("a free lane does not hold: the GPU carries on after a crash", async () => {
    const w = await crashOn("gpu.local");
    expect(must(get(w.store, jobId("a"))).job.state).toBe("interrupted");
    expect(must(w.store.read((r) => laneHold(r, "gpu.local")))).toBeUndefined();
    expect(must(w.store.read((r) => nextClaimable(r, "gpu.local")))?.id).toBe("b");
    w.store.close();
  });
});

describe("reroute: the router is the judge", () => {
  const routed = (provider: string, steerDropped?: string): RouteOutcome => ({
    kind: "routed",
    planKey: "generate",
    chain: ["google", "leonardo"],
    choice: { provider, model: `${provider}-m`, lane: "cloud.google", transport: "cloud", rung: "preferred", quote: { usd: 0.04, basis: "estimated", note: "table rate" }, seconds: 1 },
    trail: [],
    ...(steerDropped === undefined ? {} : { steerDropped }),
  });
  const judge = (s: Steer | undefined): RouteOutcome =>
    s?.pin === "nobody"
      ? { kind: "refused", reason: "not-permitted", code: "refused", message: "nobody is not in the plan", trail: [] }
      : s?.prefer === "agy"
        ? routed("google", "agy cannot serve generate")
        : routed(s?.prefer ?? s?.pin ?? "google");

  it("the record's steer and the router's are one vocabulary, key for key", () => {
    const sameKeys: [Exclude<keyof Steer, keyof DomainSteer> | Exclude<keyof DomainSteer, keyof Steer>] extends [never] ? true : false = true;
    expect(sameKeys).toBe(true);
    expect(Object.keys(steerSchema.shape).sort()).toEqual(["exclude", "pin", "prefer"]);
    expect(routerSteer({ prefer: "google" })).toEqual({ prefer: "google" });
  });

  it("a queued job takes the steer in place; the event names the old and new choice", () => {
    const w = world();
    put(w, "a", "cloud.google");
    const r = must(reroute(w.store, jobId("a"), { prefer: "leonardo" }, operator, judge));
    expect(r.job).toMatchObject({ state: "queued", attempt: 1, steer: { prefer: "leonardo" } });
    const ev = must(w.store.read((x) => x.get("SELECT json_extract(data, '$.was.provider') AS was, json_extract(data, '$.now.provider') AS now FROM events WHERE type = 'job.rerouted'")));
    expect(ev).toEqual({ was: "google", now: "leonardo" });
    w.store.close();
  });

  it("a dropped preference is reported, a refused steer is refused, and a running or done job is not re-routed", () => {
    const w = world();
    put(w, "a", "cloud.google");
    expect(must(reroute(w.store, jobId("a"), { prefer: "agy" }, operator, judge)).steerDropped).toBe("agy cannot serve generate");
    expect(reroute(w.store, jobId("a"), { pin: "nobody" }, operator, judge)).toMatchObject({ ok: false, error: { code: "refused" } });
    expect(must(get(w.store, jobId("a"))).job.steer).toEqual({ prefer: "agy" });
    must(w.store.tx((t) => t.run("UPDATE jobs SET state = 'done', record = json_set(record, '$.state', 'done') WHERE id = 'a'")));
    expect(reroute(w.store, jobId("a"), { prefer: "leonardo" }, operator, judge)).toMatchObject({ ok: false, error: { code: "refused" } });
    w.store.close();
  });

  it("a failed job is re-queued with attempt++, by an operator only", async () => {
    const w = world();
    put(w, "a", "cloud.google");
    const { p } = producer("cloud.google", ["x"], () => ({ kind: "fatal", code: "unavailable", message: "google 503" }));
    must(await runJob(w.fx, p, "a", opts));
    expect(reroute(w.store, jobId("a"), { exclude: ["google"] }, agent, judge)).toMatchObject({ ok: false, error: { code: "refused" } });
    const r = must(reroute(w.store, jobId("a"), { exclude: ["google"] }, operator, judge));
    expect(r.job).toMatchObject({ state: "queued", attempt: 2, steer: { exclude: ["google"] } });
    expect(r.job.error).toBeUndefined();
    expect(retry(w.store, jobId("a"), operator)).toMatchObject({ ok: false, error: { code: "refused" } });
    w.store.close();
  });
});
