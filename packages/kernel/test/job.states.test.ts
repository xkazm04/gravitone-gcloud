import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { jobMachine, type JobState } from "@gt/domain/job";
import { failed, interrupted, move } from "../src/job-core.ts";
import { holdLaneIn, laneHold } from "../src/job-queue.ts";
import { recover, runJob } from "../src/job-run.ts";
import { cancel, enqueue, get, loadJob, pause, putJob, resume, retry } from "../src/job.ts";
import { must, scratch } from "./helpers.ts";
import { eventTypes, hostA, jobId, LIVE, openWorld, operator, producer, type World } from "./job-fixture.ts";

// Recovery-state enumeration over the job record (the leaf half of the recovery-prefix
// technique): job.crash.test.ts enumerates the EFFECT prefixes of one scenario, so it can
// only reopen the states that scenario passes through (queued, running, interrupted, done).
// This file derives its cases from the machine's own state list instead. For each state it
// constructs the durable record directly, closes the store, reopens it from disk, runs the
// restart sweep, offers the job to the driver, and asserts the next transition the table
// allows. A state added to jobMachine without a case below fails the coverage test.

const tmp = scratch("job-states");
afterAll(() => tmp.dispose());
let n = 0;
const J = jobId("job-1");
const LANE = "seat.text";

/** The durable record in `state`, built by the same transition helpers the kernel writes with. */
function construct(w: World, state: JobState): void {
  must(enqueue(w.store, { id: "job-1", of: { kind: "part", id: "part-1" }, producer: "test", lane: LANE, mode: LIVE, ...(state === "planned" ? { state: "planned" } : {}) }, operator));
  if (state === "planned" || state === "queued") return;
  must(
    w.store.tx((t) => {
      const q = loadJob(t, "job-1").job;
      if (state === "paused") return putJob(t, move(q, "paused"));
      if (state === "cancelled") return putJob(t, move(q, "cancelled"));
      // running is the one state a lease and a slot make: it is reached by the driver, not built.
      const run = { ...q, state: "running" as const };
      if (state === "failed") return putJob(t, failed(run, "internal", "the vendor refused"));
      if (state === "interrupted") {
        const dead = interrupted({ ...run, progress: { ...run.progress, stage: "a" } }, hostA, t.at);
        putJob(t, dead);
        holdLaneIn(t, dead, operator);
        return;
      }
      throw new Error(`construct: ${state} is not built directly`);
    }),
  );
}

function reopened(state: JobState): World {
  const file = path.join(tmp.dir, `s-${++n}.sqlite`);
  const first = openWorld(file, undefined, tmp.dir);
  construct(first, state);
  first.store.close();
  return openWorld(file, first.clock, tmp.dir);
}

const driver = (steps = ["a", "b"]) => producer(LANE, steps);

// Direct construction covers every state but `done`, which is built by a completed drive, and
// `running`, which the crash-prefix test owns; both are asserted as such so the list stays total.
const DIRECT: readonly JobState[] = ["planned", "queued", "paused", "failed", "interrupted", "cancelled"];
const BY_OTHER_TEST: Readonly<Record<string, string>> = { running: "job.crash.test.ts (every prefix is a reopened running record)", done: "reached below by a completed drive" };

describe("job states under close, reopen, sweep, drive", () => {
  it("every state of the machine has a case here or a named owner", () => {
    const covered = new Set<string>([...DIRECT, ...Object.keys(BY_OTHER_TEST)]);
    expect([...jobMachine.states].filter((s) => !covered.has(s))).toEqual([]);
  });

  it("planned: the sweep and the driver leave it alone; only the upstream's release queues it", async () => {
    const w = reopened("planned");
    expect(must(recover(w.fx))).toEqual([]);
    expect(must(await runJob(w.fx, driver().p, "job-1"))).toMatchObject({ outcome: "not-queued" });
    expect(must(get(w.store, J)).job.state).toBe("planned");
    expect(pause(w.store, J, operator).ok).toBe(false);
    w.store.close();
  });

  it("queued: the driver finishes it with one output per step", async () => {
    const w = reopened("queued");
    expect(must(recover(w.fx))).toEqual([]);
    expect(must(await runJob(w.fx, driver().p, "job-1"))).toMatchObject({ outcome: "done", job: { attempt: 1, progress: { done: 2 } } });
    w.store.close();
  });

  it("paused: the driver will not take it, resume queues it, and then it finishes", async () => {
    const w = reopened("paused");
    expect(must(recover(w.fx))).toEqual([]);
    expect(must(await runJob(w.fx, driver().p, "job-1"))).toMatchObject({ outcome: "not-queued" });
    must(resume(w.store, J, operator));
    expect(must(await runJob(w.fx, driver().p, "job-1")).outcome).toBe("done");
    w.store.close();
  });

  it("failed: it stays failed through the sweep and the driver; only an operator's retry re-queues it", async () => {
    const w = reopened("failed");
    expect(must(recover(w.fx))).toEqual([]);
    expect(must(await runJob(w.fx, driver().p, "job-1"))).toMatchObject({ outcome: "not-queued" });
    expect(must(get(w.store, J)).job).toMatchObject({ state: "failed", error: { code: "internal" } });
    expect(must(w.store.read((r) => laneHold(r, LANE)))).toBeUndefined();
    expect(retry(w.store, J, { kind: "agent", id: "claude" }).ok).toBe(false);
    must(retry(w.store, J, operator));
    expect(must(await runJob(w.fx, driver().p, "job-1"))).toMatchObject({ outcome: "done", job: { attempt: 2 } });
    w.store.close();
  });

  it("interrupted: the paid lane stays held across the reopen, the sweep does not re-interrupt it, and retry waits on the ack", async () => {
    const w = reopened("interrupted");
    expect(must(recover(w.fx))).toEqual([]);
    expect(must(w.store.read((r) => laneHold(r, LANE)))).toMatchObject({ jobId: "job-1", stage: "a" });
    expect(must(await runJob(w.fx, driver().p, "job-1"))).toMatchObject({ outcome: "not-queued" });
    must(retry(w.store, J, operator));
    expect(must(await runJob(w.fx, driver().p, "job-1"))).toMatchObject({ outcome: "held" });
    expect(eventTypes(w.store, "job-1").filter((t) => t === "job.interrupted")).toHaveLength(0);
    w.store.close();
  });

  it.each(["cancelled", "done"] as const)("%s: terminal - readable after reopen, never driven, never retried or resumed", async (state) => {
    const w = state === "cancelled" ? reopened("cancelled") : await (async () => {
      const file = path.join(tmp.dir, `s-${++n}.sqlite`);
      const first = openWorld(file, undefined, tmp.dir);
      construct(first, "queued");
      must(await runJob(first.fx, driver().p, "job-1"));
      first.store.close();
      return openWorld(file, first.clock, tmp.dir);
    })();
    expect(must(recover(w.fx))).toEqual([]);
    expect(must(get(w.store, J)).job.state).toBe(state);
    expect(must(await runJob(w.fx, driver().p, "job-1"))).toMatchObject({ outcome: "not-queued" });
    expect(retry(w.store, J, operator).ok).toBe(false);
    expect(resume(w.store, J, operator).ok).toBe(false);
    expect(cancel(w.store, J, operator).ok).toBe(false);
    expect(must(get(w.store, J)).job.state).toBe(state);
    w.store.close();
  });
});
