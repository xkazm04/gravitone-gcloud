// RUNS' PURE RULES (app/(studio)/projects/runs/_runs): which acts the inspector offers on a
// produce job, against the rules the kernel and the port enforce when the act arrives.
//
//   1. An act is offered only where the kernel would take it. The buttons and keys are the
//      cosmetic half of each rule and the job machine (@gt/domain/job.machine) is the enforced
//      half; the cases read the machine rather than a second list, so the two cannot drift
//      apart unseen (hitl-approval: cosmetic-vs-enforced-threshold-invariant).

import { describe, expect, it } from "vitest";

import { jobMachine, type JobState } from "@gt/domain/job.machine";

import type { LaneHoldView, ProduceJob } from "../../app/(studio)/projects/_port/contract.ts";
import { canMove, canPause, canReroute, canRetry } from "../../app/(studio)/projects/runs/_runs/Acts.tsx";

const job = (over: Partial<ProduceJob> = {}): ProduceJob => ({
  id: "job:part:p1:research",
  title: "research",
  lane: "seat.text",
  state: "queued",
  after: [],
  s: 0,
  e: 0,
  queuePos: 1,
  blocked: false,
  held: false,
  attempt: 1,
  model: "claude",
  units: 1,
  noun: "turn",
  seconds: 60,
  usd: 0,
  src: "model",
  mode: "dry",
  reroutable: false,
  ...over,
});

describe("1. an act is offered only where the kernel takes it", () => {
  it("pause is offered on exactly the states the job machine lets go to paused", () => {
    for (const state of jobMachine.states) expect([state, canPause(job({ state }))]).toEqual([state, jobMachine.can(state, "paused")]);
  });

  it("retry is offered on failed and interrupted jobs, the machine's way back to the queue that is not a resume or a release", () => {
    const retried: JobState[] = jobMachine.states.filter((s) => s !== "paused" && s !== "planned" && jobMachine.can(s, "queued"));
    for (const state of jobMachine.states) expect([state, canRetry(job({ state }))]).toEqual([state, retried.includes(state)]);
  });

  it("a move is offered on a waiting job that is not behind a stuck part", () => {
    expect(jobMachine.states.filter((state) => canMove(job({ state })))).toEqual(["planned", "queued"]);
    expect(canMove(job({ blocked: true }))).toBe(false);
  });

  // real.ts retryJob and realReroute.ts confirm refuse "<lane> is on hold for this job: acknowledge
  // the hold first", and fixtureActs.ts retryJob the same: the hold is looked at before the work.
  it("the job its lane holds for is offered neither a retry nor a re-route until the hold is acknowledged", () => {
    const crashed = job({ state: "interrupted", reroutable: true });
    const hold: LaneHoldView = { lane: "seat.text", jobId: crashed.id, title: crashed.title, since: "2026-10-24T09:00:00.000Z" };
    expect([canRetry(crashed, [hold]), canReroute(crashed, [hold])]).toEqual([false, false]);
    expect([canRetry(crashed, []), canReroute(crashed, [])]).toEqual([true, true]);
    const other = { ...hold, jobId: "job:part:p2:research" };
    expect([canRetry(crashed, [other]), canReroute(crashed, [other])]).toEqual([true, true]);
  });
});
