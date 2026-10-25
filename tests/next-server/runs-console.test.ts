// RUNS' PURE RULES (app/(studio)/projects/runs/_runs): which acts the inspector offers on a
// produce job, against the rules the kernel and the port enforce when the act arrives.
//
//   1. An act is offered only where the kernel would take it. The buttons and keys are the
//      cosmetic half of each rule and the job machine (@gt/domain/job.machine) is the enforced
//      half; the cases read the machine rather than a second list, so the two cannot drift
//      apart unseen (hitl-approval: cosmetic-vs-enforced-threshold-invariant).
//   2. A retry's ceiling is the one typed for that job, and the button and T send the same one.
//   3. The header's counts and the inspector's lists count each job once, in the same place.

import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";

import { jobMachine, type JobState } from "@gt/domain/job.machine";

import type { LaneHoldView, ProduceJob } from "../../app/(studio)/projects/_port/contract.ts";
import { canMove, canPause, canReroute, canRetry, ceilingFor, JobActs, retryPress } from "../../app/(studio)/projects/runs/_runs/Acts.tsx";
import { buildRuns, type KernelJobInput } from "../../app/(studio)/projects/runs/_runs/model.ts";
import { failedOf, floorRunsOf, totalsOf } from "../../app/(studio)/projects/runs/_runs/view.ts";

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

describe("2. a retry sends the ceiling typed for its own job", () => {
  it("a ceiling typed on one job is not carried to the next one selected", () => {
    const typed = { job: "job:a", text: "40" };
    expect(ceilingFor(typed, "job:a")).toBe("40");
    expect(ceilingFor(typed, "job:b")).toBe("");
    expect(ceilingFor({ job: null, text: "40" }, null)).toBe("");
  });

  it("a press sends the typed ceiling, nothing for an empty field, and no retry while it does not parse", () => {
    expect(retryPress("12.50")).toEqual({ ceilingUsd: 12.5 });
    expect(retryPress("")).toEqual({ ceilingUsd: undefined });
    expect(retryPress("twelve")).toBeNull();
  });
});

const NOW = Date.parse("2026-10-24T12:00:00.000Z");
const kjob = (state: JobState): KernelJobInput => ({ id: `job:${state}`, title: state, lane: "seat.text", state, progress: { done: 0, total: 1 }, attempt: 1 });
const model = (states: readonly JobState[]) => buildRuns({ now: NOW, live: { jobs: [], weir: [], slots: [], holds: [], failures: [] }, kernel: states.map(kjob), ledger: [] });

describe("3. the header's counts and the inspector's lists agree", () => {
  it("an interrupted job is counted with the failed, as the inspector lists it, and not also as waiting", () => {
    const m = model(["interrupted"]);
    expect(totalsOf(m)).toEqual({ running: 0, waiting: 0, weir: 0, failed: 1 });
    expect(failedOf(m).map((j) => j.state)).toEqual(["interrupted"]);
  });

  it("every open job is counted exactly once across running, waiting and failed", () => {
    const open: JobState[] = jobMachine.states.filter((s) => s !== "done" && s !== "cancelled");
    const t = totalsOf(model(open));
    expect(t.running + t.waiting + t.failed).toBe(open.length);
  });
});

describe("3b. the All lanes row counts floor runs as Plan does", () => {
  it("only the produce jobs no project owns that are not done, whatever else the day-line draws", () => {
    const produce = [job({ id: "job:run:a", state: "done" }), job({ id: "job:run:b", state: "queued" }), job({ id: "job:part:p1:x", state: "queued", projectId: "p1" })];
    const live = { source: "forge", id: "f1", title: "forge f1", lane: "gpu.local", media: "image", state: "running", href: "/floor?lane=image" } as const;
    const m = buildRuns({ now: NOW, live: { jobs: [live], weir: [], slots: [], holds: [], failures: [] }, kernel: [kjob("queued")], ledger: [], produce });
    // projects/page.tsx: jobs.filter((j) => j.projectId === undefined && j.state !== "done").length
    const plan = produce.filter((j) => j.projectId === undefined && j.state !== "done").length;
    expect(floorRunsOf(m)).toBe(plan);
    expect(plan).toBe(1);
  });
});

describe("4. a refusal is drawn as an error", () => {
  it("the port's refusal of the re-route options is an ErrorLine, the error's shape, not faint metadata", () => {
    const words = "seat.text: no other route prices this part";
    const props = { job: job({ state: "failed", reroutable: true }), busy: false, onPause: () => undefined, onResume: () => undefined, onRetry: () => undefined, onMove: () => undefined, retryCeiling: "", onRetryCeiling: () => undefined, options: null, optionsError: words, reading: null, onReroute: () => undefined, altsRef: { current: null }, holds: [] };
    expect(renderToStaticMarkup(h(JobActs, props))).toContain(renderToStaticMarkup(h(ErrorLine, { message: words })));
  });
});
