// Driving: the walk that moves a run from one status to the next, one step at a time. Its own
// file because it is the one module that calls every step; the step modules never import it.
//
// WHO DRIVES (Phase 4, L30). The walk is the engine's; the RUNNER is the kernel job
// (packages/producers/src/article, bound in lib/producers/article.ts), which performs one
// step per `walk(id, deps, step)` under the kernel's fenced seat.text slot lease. v1 held
// a `.driver` pid file for the whole drive and a route started it as an un-awaited promise
// (`launchRun`); both are gone. The lease that says "one driver per run" is now the job's
// slot fence, and a second process that tries to drive the same job is refused at the
// claim (its state is no longer `queued`). `driveRun` stays as the walk to the end, for
// the probes that test the engine's steps with no kernel underneath; production drives
// only through the job.

import { readRun, updateRun } from "./store";
import type { ArticleRun, ArticleStatus, ArticleStep, StepName } from "./types";
import { defaultDeps, type EngineDeps } from "./engine";
import { agentStep } from "./agentSteps";
import { checkedBetween } from "./checkLoop";
import { checkStep } from "./checkStep";
import { critiqueStep } from "./critiqueStep";
import { land } from "./landing";
import { resumed } from "./resume";
import { draftAtGate } from "./mediumDraft";
import { StepError } from "./stepFailure";

/** What one walk to a step reports: it finished (or was already done), or the run failed with its sentence. */
export type WalkReport = { readonly ok: true; readonly run: ArticleRun; readonly skipped: boolean } | { readonly ok: false; readonly run: ArticleRun; readonly message: string };

/** The status a step runs in. `outline` and `draft` share `drafting`. */
const PHASE: Record<StepName, ArticleStatus> = { research: "researching", outline: "drafting", draft: "drafting", critique: "critiquing", check: "checking" };
const ORDER: readonly ArticleStatus[] = ["queued", "researching", "drafting", "critiquing", "checking", "awaiting-approval"];

const doneIn = (run: ArticleRun, name: StepName): boolean => run.steps.some((s) => s.name === name && s.status === "done");

/**
 * Drive a run as far as it can go on its own: to `awaiting-approval` from the
 * working states, to `landed` from `approved`. Returns the run as it stands
 * when the drive stops. No lease: a caller that is not a probe drives through
 * the kernel job (lib/producers/article.ts), which holds one.
 */
export async function driveRun(id: string, deps: EngineDeps = defaultDeps()): Promise<ArticleRun> {
  return (await walk(id, deps)).run;
}

/**
 * Walk the run's own status machine (v1 driveRun's switch, unchanged in what it
 * does at each status) until `until` has finished - or, with no `until`, as far as
 * the run goes on its own.
 *
 * SKIP-IF-DONE, BY THE MANIFEST (delivery-guarantees: marker-certifies-what-was-done).
 * A step whose run.json record says `done` is never run again, whoever asks: the job
 * that did not get to book it (a crash between the step and its booking) walks past
 * it for nothing. The early return reads the step's COMPLETION, and it is refused
 * while the run still sits in that step's own status - a check that finished and
 * died before `checking -> awaiting-approval` would otherwise be skipped forever and
 * the run left at `checking` with its job `done`.
 */
export async function walk(id: string, deps: EngineDeps, until?: StepName | "land"): Promise<WalkReport> {
  const first = await readRun(id);
  if (until !== undefined && until !== "land" && doneIn(first, until) && first.status !== PHASE[until]) return { ok: true, run: first, skipped: true };
  if (until === "land" && first.status === "landed") return { ok: true, run: first, skipped: true };
  let ran = false;
  const failed = async (): Promise<WalkReport> => {
    const run = await readRun(id);
    return { ok: false, run, message: run.error ?? `${until ?? "the drive"} failed` };
  };
  const ok = async (): Promise<WalkReport> => ({ ok: true, run: await readRun(id), skipped: !ran });
  /** Run one step unless it is already done; `ran` records whether anything was performed. */
  const run1 = async (name: StepName): Promise<boolean> => {
    const r = await step(id, name, deps);
    ran ||= r.ran;
    return r.done;
  };
  for (;;) {
    const run = await readRun(id);
    if (until !== undefined && until !== "land" && ORDER.indexOf(run.status) > ORDER.indexOf(PHASE[until]) && !doneIn(run, until)) {
      return { ok: false, run, message: `run ${id} is ${run.status} but its ${until} step never finished` };
    }
    switch (run.status) {
      case "queued":
        await setStatus(id, "researching", deps);
        continue;
      case "failed":
        // v1 resumeRun's rule, now the job's retry: back to the state whose step did not finish.
        if (until === undefined) return { ok: true, run, skipped: !ran };
        await updateRun(id, resumed, deps.now);
        continue;
      case "researching":
        if (!(await run1("research"))) return failed();
        await setStatus(id, "drafting", deps);
        if (until === "research") return ok();
        continue;
      case "drafting":
        if (!(await run1("outline"))) return failed();
        if (until === "outline") return ok();
        if (!(await run1("draft"))) return failed();
        await checkedBetween(id, "draft", "draft", deps);
        await setStatus(id, "critiquing", deps);
        if (until === "draft") return ok();
        continue;
      case "critiquing":
        if (!(await run1("critique"))) return failed();
        await setStatus(id, "checking", deps);
        if (until === "critique") return ok();
        continue;
      case "checking":
        if (!(await run1("check"))) return failed();
        await setStatus(id, "awaiting-approval", deps);
        await draftAtGate(id, deps);
        if (until === "check") return ok();
        continue;
      case "approved":
        if (until !== undefined && until !== "land") return ok();
        await setStatus(id, "landing", deps);
        continue;
      case "landing": {
        if (until !== undefined && until !== "land") return ok();
        ran = true;
        await land(id, deps);
        const after = await readRun(id);
        return after.status === "landed" ? { ok: true, run: after, skipped: false } : { ok: false, run: after, message: after.error ?? "landing failed" };
      }
      default:
        return until !== "land" ? { ok: true, run, skipped: !ran } : { ok: false, run, message: `run ${id} is ${run.status}; only an approved run lands` };
    }
  }
}

const setStatus = (id: string, status: ArticleStatus, deps: EngineDeps) => updateRun(id, (r) => ({ ...r, status }), deps.now);

/** Run one step unless it is already done. `done` when it is done; `ran` when this call performed it. */
async function step(id: string, name: StepName, deps: EngineDeps): Promise<{ done: boolean; ran: boolean }> {
  const before = await readRun(id);
  const prior = before.steps.find((s) => s.name === name);
  if (prior?.status === "done") return { done: true, ran: false };
  const startedAt = deps.now().toISOString();
  await updateRun(id, (r) => withStep(r, { name, status: "running", startedAt, ...(prior?.costUsd !== undefined ? { costUsd: prior.costUsd } : {}) }), deps.now);
  try {
    const cost = name === "check" ? await checkStep(id, deps) : name === "critique" ? await critiqueStep(id, deps) : await agentStep(id, name, deps);
    await updateRun(id, (r) => withStep(r, finish(r, name, "done", deps, cost)), deps.now);
    return { done: true, ran: true };
  } catch (e) {
    const cost = e instanceof StepError ? e.costUsd : undefined;
    const msg = `${name}: ${(e as Error).message}`;
    await updateRun(id, (r) => ({ ...withStep(r, finish(r, name, "failed", deps, cost)), status: "failed", error: msg }), deps.now);
    return { done: false, ran: true };
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
