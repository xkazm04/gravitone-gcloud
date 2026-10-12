// Driving: the loop that moves a run from one status to the next under the driver lease,
// one step at a time. Its own file because it is the one module that calls every step; the
// step modules never import it.

import { acquireDriver, readRun, updateRun } from "./store";
import type { ArticleRun, ArticleStatus, ArticleStep, StepName } from "./types";
import { defaultDeps, type EngineDeps } from "./engine";
import { agentStep } from "./agentSteps";
import { checkedBetween } from "./checkLoop";
import { checkStep } from "./checkStep";
import { critiqueStep } from "./critiqueStep";
import { land } from "./landing";
import { StepError } from "./stepFailure";

/* ── driving ───────────────────────────────────────────────────────────────── */

/** Start driving without waiting — for a route handler. The drive's own
 *  failures land on the run as `failed`; anything else is logged. */
export function launchRun(id: string, deps: EngineDeps = defaultDeps()): void {
  void driveRun(id, deps).catch((e) => {
    console.error(`[articles] drive ${id} stopped: ${(e as Error).message}`);
  });
}

/**
 * Drive a run as far as it can go on its own: to `awaiting-approval` from the
 * working states, to `landed` from `approved`. Returns the run as it stands
 * when the drive stops. Throws only when the run cannot be driven at all (no
 * such run, another live driver).
 */
export async function driveRun(id: string, deps: EngineDeps = defaultDeps()): Promise<ArticleRun> {
  const lease = await acquireDriver(id);
  try {
    for (;;) {
      const run = await readRun(id);
      switch (run.status) {
        case "queued":
          await setStatus(id, "researching", deps);
          continue;
        case "researching":
          if (!(await step(id, "research", deps))) return readRun(id);
          await setStatus(id, "drafting", deps);
          continue;
        case "drafting":
          if (!(await step(id, "outline", deps))) return readRun(id);
          if (!(await step(id, "draft", deps))) return readRun(id);
          await checkedBetween(id, "draft", "draft", deps);
          await setStatus(id, "critiquing", deps);
          continue;
        case "critiquing":
          if (!(await step(id, "critique", deps))) return readRun(id);
          await setStatus(id, "checking", deps);
          continue;
        case "checking":
          if (!(await step(id, "check", deps))) return readRun(id);
          await setStatus(id, "awaiting-approval", deps);
          continue;
        case "approved":
          await setStatus(id, "landing", deps);
          continue;
        case "landing":
          await land(id, deps);
          return readRun(id);
        default:
          return run;
      }
    }
  } finally {
    await lease.release();
  }
}

const setStatus = (id: string, status: ArticleStatus, deps: EngineDeps) => updateRun(id, (r) => ({ ...r, status }), deps.now);

/** Run one step unless it is already done. True when it is done. */
async function step(id: string, name: StepName, deps: EngineDeps): Promise<boolean> {
  const before = await readRun(id);
  const prior = before.steps.find((s) => s.name === name);
  if (prior?.status === "done") return true;
  const startedAt = deps.now().toISOString();
  await updateRun(id, (r) => withStep(r, { name, status: "running", startedAt, ...(prior?.costUsd !== undefined ? { costUsd: prior.costUsd } : {}) }), deps.now);
  try {
    const cost = name === "check" ? await checkStep(id, deps) : name === "critique" ? await critiqueStep(id, deps) : await agentStep(id, name, deps);
    await updateRun(id, (r) => withStep(r, finish(r, name, "done", deps, cost)), deps.now);
    return true;
  } catch (e) {
    const cost = e instanceof StepError ? e.costUsd : undefined;
    const msg = `${name}: ${(e as Error).message}`;
    await updateRun(id, (r) => ({ ...withStep(r, finish(r, name, "failed", deps, cost)), status: "failed", error: msg }), deps.now);
    return false;
  }
}

function withStep(run: ArticleRun, s: ArticleStep): ArticleRun {
  const steps = run.steps.filter((x) => x.name !== s.name);
  steps.push(s);
  const order = ["research", "outline", "draft", "critique", "check"];
  steps.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  return { ...run, steps };
}

/** Close a step. A retried step's cost ACCUMULATES: the field is what the step
 *  has cost, across every attempt that reported a figure. */
function finish(run: ArticleRun, name: StepName, status: "done" | "failed", deps: EngineDeps, cost?: number): ArticleStep {
  const cur = run.steps.find((s) => s.name === name)!;
  const out: ArticleStep = { name, status, startedAt: cur.startedAt, endedAt: deps.now().toISOString() };
  const total = (cur.costUsd ?? 0) + (cost ?? 0);
  if (cur.costUsd !== undefined || cost !== undefined) out.costUsd = Math.round(total * 1_000_000) / 1_000_000;
  return out;
}
