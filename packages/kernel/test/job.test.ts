import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { AppError } from "@gt/domain/errors";
import { verify } from "../src/events.ts";
import { runJob, recover, type RunOptions } from "../src/job-run.ts";
import { cancel, enqueue, get, list, pause, resume, retry } from "../src/job.ts";
import { claimIn, statusIn } from "../src/lease.ts";
import type { SpendClass } from "../src/spend/core.ts";
import { reservationOf, reserve } from "../src/spend/ledger.ts";
import { must, scratch } from "./helpers.ts";
import { agent, count, eventTypes, hostA, hostB, jobId, LIVE, openWorld, operator, producer, type World } from "./job-fixture.ts";

const tmp = scratch("job");
afterAll(() => tmp.dispose());
let n = 0;
const world = (): World => openWorld(path.join(tmp.dir, `j-${++n}.sqlite`));
const opts: RunOptions = { holder: hostA, alive: () => true, sleep: async () => {} };
const J = jobId("job-1");

function queued(w: World, ceilingUsd?: number): void {
  must(enqueue(w.store, { id: "job-1", of: { kind: "run", id: "run-1" }, producer: "test", lane: "gpu.local", mode: LIVE, ...(ceilingUsd === undefined ? {} : { ceilingUsd }) }, operator));
}

describe("enqueue and the operator's acts", () => {
  it("enqueue writes a queued record and its event, and never performs", async () => {
    const w = world();
    const { p, calls } = producer("gpu.local", ["a", "b"]);
    void p;
    queued(w);
    expect(must(get(w.store, J)).job).toMatchObject({ state: "queued", attempt: 1, spend: { usd: 0 } });
    expect(calls.size).toBe(0);
    expect(eventTypes(w.store, "job-1")).toEqual(["job.enqueued"]);
    expect(enqueue(w.store, { id: "job-1", of: { kind: "run", id: "run-1" }, producer: "test", lane: "gpu.local" }, operator)).toMatchObject({ ok: false, error: { code: "conflict" } });
    w.store.close();
  });

  it("refuses a ceiling it would have to clamp", () => {
    const w = world();
    expect(enqueue(w.store, { id: "x", of: { kind: "run", id: "r" }, producer: "test", lane: "gpu.local", ceilingUsd: 20_000 }, operator)).toMatchObject({ ok: false, error: { code: "invalid" } });
    expect(enqueue(w.store, { id: "x", of: { kind: "run", id: "r" }, producer: "test", lane: "gpu.local", ceilingUsd: 0 }, operator)).toMatchObject({ ok: false, error: { code: "invalid" } });
    w.store.close();
  });

  it("lists by lane and state in enqueue order; pause, resume and cancel go through the machine", () => {
    const w = world();
    for (const [id, lane] of [["j1", "gpu.local"], ["j2", "seat.text"], ["j3", "gpu.local"]] as const) must(enqueue(w.store, { id, of: { kind: "run", id: "r" }, producer: "test", lane }, operator));
    expect(must(list(w.store, { lane: "gpu.local" })).map((j) => j.id)).toEqual(["j1", "j3"]);
    must(pause(w.store, jobId("j1"), operator));
    expect(must(list(w.store, { state: "paused" })).map((j) => j.id)).toEqual(["j1"]);
    expect(must(resume(w.store, jobId("j1"), operator)).state).toBe("queued");
    expect(must(cancel(w.store, jobId("j3"), operator)).state).toBe("cancelled");
    expect(resume(w.store, jobId("j3"), operator)).toMatchObject({ ok: false, error: { code: "refused" } });
    expect(get(w.store, jobId("nope"))).toMatchObject({ ok: false, error: { code: "not-found" } });
    w.store.close();
  });
});

describe("runJob", () => {
  it("runs every missing step once, books each with its event, and finishes", async () => {
    const w = world();
    queued(w);
    const { p, calls } = producer("gpu.local", ["a", "b"]);
    const r = must(await runJob(w.fx, p, "job-1", opts));
    expect(r.outcome).toBe("done");
    expect(r.job).toMatchObject({ state: "done", progress: { done: 2, total: 2 }, spend: { usd: 0.02, unpriced: 2, basis: "estimate" } });
    expect([...calls]).toEqual([["a", 1], ["b", 1]]);
    expect(count(w.store, "SELECT count(*) AS n FROM job_outputs")).toBe(2);
    expect(eventTypes(w.store, "job-1")).toEqual(["job.enqueued", "job.claimed", "job.step-started", "job.step-done", "job.step-started", "job.step-done", "job.done"]);
    const lane = must(w.store.read((t) => statusIn(t, "gpu.local#1", hostA, () => true)));
    expect(lane.holder).toBeUndefined();
    expect(must(verify(w.store)).state).toBe("intact");
    w.store.close();
  });

  it("refuses a producer whose lane is not the job's declared lane, before taking any lease", async () => {
    const w = world();
    queued(w);
    const { p, calls } = producer("cloud.google", ["a"]);
    expect(await runJob(w.fx, p, "job-1", opts)).toMatchObject({ ok: false, error: { code: "refused" } });
    expect(calls.size).toBe(0);
    expect(count(w.store, "SELECT count(*) AS n FROM leases")).toBe(0);
    w.store.close();
  });

  it("an unhealthy driver claims nothing and fails nothing", async () => {
    const w = world();
    queued(w);
    const { p } = producer("gpu.local", ["a"]);
    const r = must(await runJob(w.fx, { ...p, health: async () => ({ ok: false, reason: "studio browser closed" }) }, "job-1", opts));
    expect(r).toEqual({ outcome: "unhealthy", reason: "studio browser closed" });
    expect(must(get(w.store, J)).job.state).toBe("queued");
    w.store.close();
  });

  it("a busy lane leaves the job queued", async () => {
    const w = world();
    queued(w);
    must(w.store.tx((t) => claimIn(t, { resource: "gpu.local#1", holder: hostB, ticket: "t", ttlS: 120, wait: false }, () => true)));
    const { p, calls } = producer("gpu.local", ["a"]);
    expect(must(await runJob(w.fx, p, "job-1", opts)).outcome).toBe("busy");
    expect(calls.size).toBe(0);
    expect(must(get(w.store, J)).job.state).toBe("queued");
    w.store.close();
  });

  it("three consecutive vendor failures trip the breaker; the operator's retry resumes at the missing step", async () => {
    const w = world();
    queued(w);
    const flaky = producer("gpu.local", ["a", "b"], (s, call) => (s.name === "b" && call <= 3 ? { kind: "vendor-failure", message: `502 on try ${call}` } : { kind: "produced", output: { made: s.name } }));
    const slept: number[] = [];
    const r = must(await runJob(w.fx, flaky.p, "job-1", { ...opts, sleep: async (ms) => void slept.push(ms), backoffMs: (s) => s * 100 }));
    expect(r.job).toMatchObject({ state: "failed", failStreak: 3, error: { code: "unavailable" } });
    expect(slept).toEqual([100, 200]);
    expect(retry(w.store, J, agent)).toMatchObject({ ok: false, error: { code: "refused" } });
    must(retry(w.store, J, operator));
    const again = must(await runJob(w.fx, flaky.p, "job-1", opts));
    expect(again.job).toMatchObject({ state: "done", attempt: 2, failStreak: 0 });
    expect([...flaky.calls]).toEqual([["a", 1], ["b", 4]]);
    w.store.close();
  });

  it("stops for its ceiling before the unit, and a retry with a raised ceiling continues", async () => {
    const w = world();
    queued(w, 0.015);
    const { p, calls } = producer("gpu.local", ["a", "b"]);
    const r = must(await runJob(w.fx, p, "job-1", opts));
    expect(r.job).toMatchObject({ state: "failed", error: { code: "budget" }, stop: { by: "run-ceiling", ceilingUsd: 0.015, spentUsd: 0.01 } });
    expect(calls.get("b")).toBeUndefined();
    must(retry(w.store, J, operator, { ceilingUsd: 1 }));
    expect(must(await runJob(w.fx, p, "job-1", opts)).outcome).toBe("done");
    expect(must(get(w.store, J)).terms).toEqual({ ceilingUsd: 1 });
    w.store.close();
  });

  it("a money stop from the spend window fails the job as budget, not as a vendor failure", async () => {
    const w = world();
    queued(w);
    const { p } = producer("gpu.local", ["a"], () => ({ kind: "money-stop", message: "period ceiling reached" }));
    const r = must(await runJob(w.fx, p, "job-1", opts));
    expect(r.job).toMatchObject({ state: "failed", failStreak: 0, error: { code: "budget", message: "period ceiling reached" }, stop: { by: "period-ceiling" } });
    w.store.close();
  });

  it("a producer's throw fails the job with its sentence verbatim", async () => {
    const w = world();
    queued(w);
    const { p } = producer("gpu.local", ["a"], () => {
      throw new Error("ffmpeg exited 1: moov atom not found");
    });
    expect(must(await runJob(w.fx, p, "job-1", opts)).job?.error).toEqual({ code: "internal", message: "ffmpeg exited 1: moov atom not found" });
    w.store.close();
  });

  // The one drive error that DOES leave a job running: the store refused the write that would
  // have failed it. The caller must hear that, not only the error that came first.
  it("a drive whose failure cannot be recorded says the job was left running, with both sentences", async () => {
    const w = world();
    queued(w);
    const { p } = producer("gpu.local", ["a"]);
    const fx: World["fx"] = { ...w.fx, tx: (name, fn) => (name === "next" || name === "abandon" ? { ok: false, error: new AppError("unavailable", `${name}: database is locked`) } : w.fx.tx(name, fn)) };
    const r = await runJob(fx, p, "job-1", opts);
    expect(r).toMatchObject({ ok: false, error: { code: "unavailable" } });
    if (r.ok) throw new Error("expected the drive's error");
    expect(r.error.message).toContain("next: database is locked");
    expect(r.error.message).toContain("abandon: database is locked");
    expect(r.error.message).toContain("left running");
    expect(must(get(w.store, J)).job.state).toBe("running");
    w.store.close();
  });

  it("a pause during a step lets the step finish and book, then releases the lane", async () => {
    const w = world();
    queued(w);
    const { p, calls } = producer("gpu.local", ["a", "b"], (s) => {
      if (s.name === "a") must(pause(w.store, J, operator));
      return { kind: "produced", output: { made: s.name } };
    });
    const r = must(await runJob(w.fx, p, "job-1", opts));
    expect(r.outcome).toBe("stopped");
    expect(r.job).toMatchObject({ state: "paused", progress: { done: 1 }, spend: { usd: 0.01 } });
    expect(calls.get("b")).toBeUndefined();
    expect(must(w.store.read((t) => statusIn(t, "gpu.local#1", hostA, () => true))).holder).toBeUndefined();
    must(resume(w.store, J, operator));
    expect(must(await runJob(w.fx, p, "job-1", opts)).outcome).toBe("done");
    expect([...calls]).toEqual([["a", 1], ["b", 1]]);
    w.store.close();
  });

  it("at its deadline a drive yields between steps: the job is queued again and the lane is free", async () => {
    const w = world();
    queued(w);
    let t = 0;
    const { p, calls } = producer("gpu.local", ["a", "b"]);
    const r = must(await runJob(w.fx, p, "job-1", { ...opts, deadlineMs: 1, now: () => t++ }));
    expect(r).toMatchObject({ outcome: "yielded", job: { state: "queued", progress: { done: 1 } } });
    expect([...calls]).toEqual([["a", 1]]);
    expect(must(await runJob(w.fx, p, "job-1", opts)).outcome).toBe("done");
    expect(eventTypes(w.store, "job-1")).toContain("job.yielded");
    w.store.close();
  });
});

describe("recover", () => {
  it("interrupts a running job whose same-host holder is dead, naming the step in flight; nothing resumes it", async () => {
    const w = world();
    queued(w);
    let die = (): void => {};
    const dispatched = new Promise<void>((r) => (die = r));
    const hung = new Promise<never>(() => {});
    const { p } = producer("gpu.local", ["a"], () => {
      die();
      return hung;
    });
    // The drive never returns: its process "dies" inside the step.
    void runJob(w.fx, p, "job-1", { ...opts, heartbeatMs: 3_600_000 });
    await dispatched;
    const me = { ...hostA, bootId: "boot-a-restarted", pid: 777 };
    expect(must(recover(w.fx, { holder: me, alive: () => true }))).toEqual([]); // holder pid 501 still alive
    const out = must(recover(w.fx, { holder: me, alive: (pid) => pid !== 501 }));
    expect(out.map((j) => j.interruption)).toEqual([{ at: "2026-10-15T12:00:00.000Z", holder: hostA, stage: "a" }]);
    expect(must(get(w.store, J)).job.state).toBe("interrupted");
    const again = producer("gpu.local", ["a"]);
    expect(must(await runJob(w.fx, again.p, "job-1", { ...opts, holder: me })).outcome).toBe("not-queued");
    w.store.close();
  });

  it("lapses the dead drive's spend holds: a call whose outcome is unknown keeps counting", async () => {
    const w = world();
    queued(w);
    const cls: SpendClass = { id: "leonardo", unit: "usd", windowMs: 86_400_000, ceiling: 10 };
    let dispatched = (): void => {};
    const inFlight = new Promise<void>((r) => (dispatched = r));
    const { p } = producer("gpu.local", ["a"], (_s, _n) => new Promise<never>(() => {}));
    const paying = {
      ...p,
      perform: (step: Parameters<typeof p.perform>[0], ctx: Parameters<typeof p.perform>[1]) => {
        const held = must(w.store.tx((t) => reserve(t, cls, { id: "res-1", amount: 0.04, owner: ctx.owner })));
        expect(held.ok).toBe(true);
        dispatched();
        return p.perform(step, ctx);
      },
    };
    void runJob(w.fx, paying, "job-1", { ...opts, heartbeatMs: 3_600_000 });
    await inFlight;
    const me = { ...hostA, bootId: "boot-a-restarted" };
    expect(must(recover(w.fx, { holder: me, alive: () => true, spendClasses: [cls] })).map((j) => j.id)).toEqual(["job-1"]);
    expect(must(w.store.read((r) => reservationOf(r, "res-1")))?.state).toBe("lapsed");
    w.store.close();
  });

  it("leaves a holder on another host alone inside its TTL, and interrupts it after", async () => {
    const w = world();
    queued(w);
    const hung = new Promise<never>(() => {});
    let started = (): void => {};
    const dispatched = new Promise<void>((r) => (started = r));
    const { p } = producer("gpu.local", ["a"], () => {
      started();
      return hung;
    });
    void runJob(w.fx, p, "job-1", { ...opts, holder: hostB, ttlS: 60, heartbeatMs: 3_600_000 });
    await dispatched;
    w.clock.ms += 60_000;
    expect(must(recover(w.fx, { holder: hostA, alive: () => false }))).toEqual([]);
    w.clock.ms += 1_000;
    expect(must(recover(w.fx, { holder: hostA, alive: () => false })).map((j) => j.id)).toEqual(["job-1"]);
    w.store.close();
  });
});
