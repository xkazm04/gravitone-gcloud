import { z } from "zod";

import { parseAt } from "@gt/domain/door";
import { err, ok, type Result } from "@gt/domain/errors";
import { jobIdSchema } from "@gt/domain/ids";
import { RESOURCE_LANES } from "@gt/domain/lane";
import { isFreeReceipt } from "@gt/domain/mcp";
import type { Receipt } from "@gt/domain/produce";
import { get } from "@gt/kernel/job";

import { defineOp, DESTROYS, READS, WRITES, wrap, type McpToolSpec, type Obj, type ToolCtx } from "../op.ts";

// gt_job - the Runs acts on one job (pause, resume, retry, earlier/later, re-route, cancel) and the
// acknowledgement of a held lane, each the kernel's own verb with the agent as its actor; the
// kernel's refusals (an operator-only retry, a job past its route) come back in its own words.
//
// A LIVE JOB IS THE OPERATOR'S. A job carrying a LiveArm (@gt/domain/job `mode.kind === "live"`)
// was armed to spend by a person; a retry or a re-route of it would spend again on the agent's
// word, so both are refused by name before the kernel is asked. A re-route whose receipt reads live
// and is not free is refused the same way (a dry job's re-route is priced dry and spends nothing).

export const LIVE_JOB_IS_OPERATORS = "retry of a live job is the operator's (Runs)";

const jobId = z.string().min(1).max(400);
const job = z.object({ jobId }).strict();
const runsView = (id: string): string => `/projects/runs?job=${encodeURIComponent(id)}`;

/** Is this job armed live? Read from the kernel's record; a job the kernel does not hold is the Runs view's. */
function isLive(ctx: ToolCtx, raw: string): Result<boolean> {
  const id = parseAt("job id", jobIdSchema, raw);
  const s = ctx.deps.store();
  if (id.ok && s.ok) {
    const j = get(s.value, id.value);
    if (j.ok) return ok(j.value.job.mode.kind === "live");
    if (j.error.code !== "not-found") return j;
  }
  const listed = ctx.deps.produce().listJobs();
  if (!listed.ok) return listed;
  const view = listed.value.find((x) => x.id === raw);
  return view === undefined ? err("not-found", `no job ${raw}`) : ok(view.mode === "live");
}

const spendsLive = (r: Receipt): boolean => r.mode === "live" && !isFreeReceipt(r);
const refuseLive = (raw: string, verb: "retry" | "re-route"): Result<never> => err("refused", verb === "retry" ? LIVE_JOB_IS_OPERATORS : `re-route of live job ${raw} is the operator's (Runs)`, { detail: "live-job" });

export const JOB_OPS: readonly McpToolSpec[] = [
  defineOp({
    family: "job",
    op: "status",
    title: "Job status",
    description: "One job as Runs shows it: lane, state, mode (dry|live), attempt, stage, progress, queue place, error and price.",
    input: job,
    annotations: READS,
    writes: false,
    run: ({ jobId: raw }, ctx) => {
      const listed = ctx.deps.produce().listJobs();
      if (!listed.ok) return listed;
      const view = listed.value.find((x) => x.id === raw);
      if (view !== undefined) return ok({ job: view, view: runsView(raw) });
      const id = parseAt("job id", jobIdSchema, raw);
      if (!id.ok) return id;
      const s = ctx.deps.store();
      if (!s.ok) return s;
      const j = get(s.value, id.value);
      return j.ok ? ok({ job: j.value.job, view: runsView(raw) }) : j;
    },
  }),
  defineOp({
    family: "job",
    op: "pause",
    title: "Pause a job",
    description: "Hold a queued or running job between steps; the step in flight finishes and is booked.",
    input: job,
    annotations: WRITES,
    writes: true,
    run: (i, { deps, agent }) => wrap(deps.produce().pauseJob(i, agent.who), "act", { view: runsView(i.jobId) }),
  }),
  defineOp({
    family: "job",
    op: "resume",
    title: "Resume a job",
    description: "Put a paused job back in its lane's queue.",
    input: job,
    annotations: WRITES,
    writes: true,
    run: (i, { deps, agent }) => wrap(deps.produce().resumeJob(i, agent.who), "act", { view: runsView(i.jobId) }),
  }),
  defineOp({
    family: "job",
    op: "retry",
    title: "Retry a job",
    description: "Queue a failed or interrupted dry job again with its outputs kept. A live job's retry is the operator's.",
    input: job,
    annotations: WRITES,
    writes: true,
    run: (i, ctx) => {
      const live = isLive(ctx, i.jobId);
      if (!live.ok) return live;
      if (live.value) return refuseLive(i.jobId, "retry");
      return wrap(ctx.deps.produce().retryJob(i, ctx.agent.who), "act", { view: runsView(i.jobId) });
    },
  }),
  defineOp({
    family: "job",
    op: "move",
    title: "Move a job",
    description: "Swap a queued job with its neighbour on the lane: earlier or later.",
    input: z.object({ jobId, dir: z.enum(["earlier", "later"]) }).strict(),
    annotations: WRITES,
    writes: true,
    run: (i, { deps, agent }) => wrap(deps.produce().moveJob(i, agent.who), "act", { view: runsView(i.jobId) }),
  }),
  defineOp({
    family: "job",
    op: "reroute_options",
    title: "Re-route options",
    description: "The other ways a job's work can be made: each option's provider, model, lane and estimate.",
    input: job,
    annotations: READS,
    writes: false,
    run: (i, { deps }) => wrap(deps.produce().rerouteOptions(i), "options", { view: runsView(i.jobId) }),
  }),
  defineOp({
    family: "job",
    op: "reroute",
    title: "Re-route a job",
    description: "Move a dry job onto another option: without a token answers the receipt; with that receipt's token confirms. A live job's re-route is the operator's.",
    input: z.object({ jobId, option: z.string().min(1).max(200), token: z.string().min(8).max(200).optional() }).strict(),
    annotations: WRITES,
    writes: true,
    run: (i, ctx) => {
      const live = isLive(ctx, i.jobId);
      if (!live.ok) return live;
      if (live.value) return refuseLive(i.jobId, "re-route");
      const produce = ctx.deps.produce();
      // The receipt is read first whatever the agent carries, so a priced live receipt is never confirmed.
      const priced = produce.reroute({ jobId: i.jobId, option: i.option }, ctx.agent.who);
      if (!priced.ok) return priced;
      if (priced.value.kind === "receipt" && spendsLive(priced.value.receipt)) return refuseLive(i.jobId, "re-route");
      if (i.token === undefined) return ok({ ...priced.value, view: runsView(i.jobId) } as Obj);
      return wrap(produce.reroute(i, ctx.agent.who), "result", { view: runsView(i.jobId) });
    },
  }),
  defineOp({
    family: "job",
    op: "cancel",
    title: "Cancel a job",
    description: "Cancel a job that has not ended: nothing more of it runs, and what it booked stays booked.",
    input: job,
    annotations: DESTROYS,
    writes: true,
    run: (i, { deps, agent }) => wrap(deps.produce().cancelJob(i, agent.who), "act", { view: runsView(i.jobId) }),
  }),
  defineOp({
    family: "job",
    op: "ack_lane",
    title: "Acknowledge a held lane",
    description: "Acknowledge the hold a crash left on a lane, so its queue moves again.",
    input: z.object({ lane: z.enum(RESOURCE_LANES) }).strict(),
    annotations: WRITES,
    writes: true,
    run: (i, { deps, agent }) => wrap(deps.produce().ackLane(i, agent.who), "act", { view: "/projects/runs" }),
  }),
];
