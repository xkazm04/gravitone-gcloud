import { describe, expect, it } from "vitest";
import { parseAt } from "@gt/domain/door";
import { jobMachine, jobSchema, type Job, type JobState } from "@gt/domain/job";
import { BREAKER_LIMIT, book, claimed, interrupted, move, next, retried, started, stopped, type MissingStep } from "../src/job-core.ts";
import { must } from "./helpers.ts";

// The pure core, exhaustively: every state's next act, the ceiling's edges,
// the breaker and the money stop that must never feed it, and what each
// outcome does to the record. Every Job a function returns is put back through
// the domain door, so a transition that breaks the record's own invariants
// (lease exactly while running, error exactly while failed) fails here.

const AT = "2026-10-15T12:00:00.000Z";
const holder = { bootId: "boot-1", pid: 4242, host: "box" };
const lease = { holder, fence: 3, acquiredAt: AT, heartbeatAt: AT, ttlS: 120 };

function job(over: Partial<Job> = {}): Job {
  const base = { id: "job-1", of: { kind: "run", id: "run-1" }, lane: "gpu.local", state: "queued", attempt: 1, progress: { done: 0, total: 0 }, spend: { usd: 0, unpriced: 0, basis: "reported" }, failStreak: 0 };
  return must(parseAt("job", jobSchema, { ...base, ...over }));
}
const running = (over: Partial<Job> = {}): Job => job({ state: "running", lease, ...over });
const valid = (j: Job): Job => must(parseAt("job", jobSchema, j));

const step = (name: string, usd: number | null = 0.01): MissingStep => ({ name, estimate: usd === null ? { seconds: 1, usd: null, unpricedReason: "local render" } : { seconds: 1, usd } });
const facts = (missing: MissingStep[], ceilingUsd?: number) => ({ missing, breakerLimit: BREAKER_LIMIT, ...(ceilingUsd === undefined ? {} : { ceilingUsd }) });

describe("next", () => {
  it("decides for every state the machine declares", () => {
    const expected: Record<JobState, string> = { planned: "idle", queued: "claim", running: "perform", paused: "idle", failed: "idle", interrupted: "idle", done: "idle", cancelled: "idle" };
    for (const s of jobMachine.states) {
      const j = s === "running" ? running() : s === "failed" ? job({ state: s, error: { code: "internal", message: "x" } }) : s === "interrupted" ? job({ state: s, interruption: { at: AT, holder } }) : job({ state: s });
      expect(next(j, facts([step("a")])).kind, s).toBe(expected[s]);
    }
  });

  it("finishes when nothing is missing, and performs the first missing step otherwise", () => {
    expect(next(running(), facts([]))).toEqual({ kind: "finish" });
    expect(next(running(), facts([step("b"), step("c")]))).toMatchObject({ kind: "perform", step: { name: "b" } });
  });

  it("checks the ceiling BEFORE the unit: a step that would cross it is not taken", () => {
    const spent = running({ spend: { usd: 0.95, unpriced: 0, basis: "reported" } });
    expect(next(spent, facts([step("a", 0.05)], 1)).kind).toBe("perform"); // lands exactly on the line
    expect(next(spent, facts([step("a", 0.050001)], 1))).toMatchObject({ kind: "stop", step: "a", ceilingUsd: 1 });
    expect(next(spent, facts([step("a", 0.06)])).kind).toBe("perform"); // no ceiling, no stop
    expect(next(running({ spend: { usd: 5, unpriced: 0, basis: "reported" } }), facts([step("free", 0)], 1)).kind).toBe("perform");
  });

  it("refuses an unpriced step under a ceiling: a price it cannot see is a ceiling it cannot keep", () => {
    expect(next(running(), facts([step("render", null)], 1))).toMatchObject({ kind: "stop", step: "render" });
    expect(next(running(), facts([step("render", null)])).kind).toBe("perform");
  });

  it("trips at the breaker limit", () => {
    expect(next(running({ failStreak: BREAKER_LIMIT - 1 }), facts([step("a")])).kind).toBe("perform");
    expect(next(running({ failStreak: BREAKER_LIMIT }), facts([step("a")])).kind).toBe("trip");
  });
});

describe("transitions keep the record valid", () => {
  it("claim, dispatch, stop, interrupt and retry each produce a record the door accepts", () => {
    const run = valid(claimed(job(), lease));
    expect(run).toMatchObject({ state: "running", lease });
    const flying = valid(started(run, "a", 0, 2, "2026-10-15T12:00:05.000Z"));
    expect(flying.progress).toEqual({ done: 0, total: 2, stage: "a" });
    expect(flying.lease?.heartbeatAt).toBe("2026-10-15T12:00:05.000Z");
    const stop = valid(stopped(flying, { ceilingUsd: 1, message: "over" }, AT));
    expect(stop).toMatchObject({ state: "failed", error: { code: "budget" }, stop: { by: "run-ceiling", ceilingUsd: 1 } });
    expect(stop.lease).toBeUndefined();
    const crashed = valid(interrupted(flying, holder, AT));
    expect(crashed.interruption).toEqual({ at: AT, holder, stage: "a" });
    const again = valid(retried(crashed));
    expect(again).toMatchObject({ state: "queued", attempt: 2, failStreak: 0 });
    expect(again.interruption).toBeUndefined();
    expect(again.progress.stage).toBeUndefined();
  });

  it("an interruption between steps names no stage: nothing was in flight", () => {
    expect(interrupted(running(), holder, AT).interruption).toEqual({ at: AT, holder });
  });

  it("refuses an undeclared edge", () => {
    expect(() => move(job({ state: "done" }), "queued")).toThrow(/done -> queued/);
    expect(() => retried(job({ state: "done" }))).toThrow(/not declared/);
  });
});

describe("book", () => {
  const flying = started(running(), "a", 0, 2, AT);

  it("a produced step clears the in-flight stage, counts progress and books its reported cost", () => {
    const b = book(flying, step("a"), { kind: "produced", output: { file: "a.png" }, costUsd: 0.02 }, AT, 3);
    expect(valid(b.job)).toMatchObject({ state: "running", progress: { done: 1, total: 2 }, spend: { usd: 0.02, unpriced: 0, basis: "reported" }, failStreak: 0 });
    expect(b.job.progress.stage).toBeUndefined();
    expect(b).toMatchObject({ output: { file: "a.png" }, cost: { usd: 0.02, src: "real" } });
  });

  it("an unpriced step is booked at its estimate and counted, never as free", () => {
    const b = book(flying, step("a", 0.04), { kind: "produced", output: {} }, AT, 3);
    expect(b.job.spend).toEqual({ usd: 0.04, unpriced: 1, basis: "estimate" });
    expect(b.cost).toEqual({ usd: 0.04, src: "model" });
  });

  it("vendor failures count toward the breaker and trip it at the limit; a success resets it", () => {
    let j = flying;
    for (let i = 1; i < 3; i++) {
      const b = book(j, step("a"), { kind: "vendor-failure", message: `refused ${i}` }, AT, 3);
      expect(b.ended).toBeUndefined();
      j = b.job;
    }
    expect(j.failStreak).toBe(2);
    const tripped = book(j, step("a"), { kind: "vendor-failure", message: "refused 3" }, AT, 3);
    expect(valid(tripped.job)).toMatchObject({ state: "failed", error: { code: "unavailable" } });
    expect(tripped.job.error?.message).toMatch(/3 consecutive vendor failures; the last: refused 3/);
    expect(book(j, step("a"), { kind: "produced", output: {} }, AT, 3).job.failStreak).toBe(0);
  });

  it("a money stop is never a vendor failure: the streak stands where it was", () => {
    const b = book(started(running({ failStreak: 2 }), "a", 0, 1, AT), step("a"), { kind: "money-stop", message: "the spend window is closed" }, AT, 3);
    expect(valid(b.job)).toMatchObject({ state: "failed", failStreak: 2, error: { code: "budget" }, stop: { by: "period-ceiling" } });
    expect(b.ended).toBe("failed");
  });

  it("a fatal outcome fails the job with the producer's sentence verbatim", () => {
    const b = book(flying, step("a"), { kind: "fatal", code: "invalid", message: "the model answered no JSON" }, AT, 3);
    expect(valid(b.job).error).toEqual({ code: "invalid", message: "the model answered no JSON" });
  });

  it("a job paused while its step was in flight keeps the output and the spend, and stays paused", () => {
    const paused = move(flying, "paused");
    const b = book(paused, step("a"), { kind: "produced", output: { file: "a.png" }, costUsd: 0.5 }, AT, 3);
    expect(valid(b.job)).toMatchObject({ state: "paused", spend: { usd: 0.5 }, progress: { done: 1 } });
    expect(b.output).toEqual({ file: "a.png" });
    expect(book(paused, step("a"), { kind: "fatal", code: "internal", message: "x" }, AT, 3).job.state).toBe("paused");
  });
});
