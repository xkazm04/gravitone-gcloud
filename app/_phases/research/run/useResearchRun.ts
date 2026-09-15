"use client";

// The run driver. Mocked, and honest about being a LOCAL PROCESS: it takes real
// time, it emits its steps as it goes, it can be stopped, and it can die.
//
// THE CLOCK LIVES ABOVE REACT, in a module-scope registry keyed by project. That
// is the driven-job pattern (lib/jobs.tsx) taken at its word: a driven job has no
// timer of its own and stays `running` until its caller calls `settle`, so the
// caller has to own a clock that actually outlives the click. A clock held in a
// component effect does not — walking off the step would kill the trace and
// strand the job as `running` for ever, and ResearchStep's standing promise
// ("navigating away, even to another project, does not cancel it") would become
// false. So the run outlives the mount and the hook is a subscription to it:
// leave mid-run, come back, and the same trace is still arriving.
//
// There is exactly ONE clock. `lib/jobs` no longer schedules research — the job
// is started `driven`, this engine steps the trace, and the ending it lands on is
// what settles the job and rings the bell.
//
// Timers run at SPEED× so a prototype is drivable, but the elapsed clock counts
// the run's own mocked wall time (the real run was a session, not a spinner) —
// the surfaces label the multiplier rather than pretending 4 seconds of research
// happened.

import { useCallback, useSyncExternalStore } from "react";

import { NO_TENSION_REASON, PROCESS_ERROR, TRACE } from "./trace";
import type { RunOutcome, RunState } from "./types";

export const SPEED = 8;

/** The run's own mocked wall time — the sum of the trace, not the time you wait. */
export const TOTAL_MS = TRACE.reduce((n, s) => n + s.ms, 0);

export const STOPPED =
  "Stopped by you at this step. Everything the run had written is on disk; the notebook is incomplete and cannot be rendered from.";

/** Where each outcome stops — all three endings as positions in one real trace.
 *
 *  NOTHING SETS `outcome` ANY MORE (2026-09-08). The picker that did was a
 *  development affordance and was deleted with the rest of the evaluation panel,
 *  so every simulated run walks to `notebook` and `no-tension` is unreachable
 *  from the UI. The table stays whole rather than collapsing to one number: the
 *  endings are a property of the engine, not of the control that used to choose
 *  between them, and `failed` is still reached every time somebody aborts. */
const STOP_AT: Record<RunOutcome, number> = {
  notebook: TRACE.length,
  "no-tension": 7, // the six searches plus the tension judgement
  "process-failed": 8, // dies inside phase 3, mechanisms unwritten
};

interface Run {
  state: RunState;
  /** Where this run stops. Written once, at `IDLE` — the picker that used to
   *  change it was a development control and is gone (see STOP_AT). */
  outcome: RunOutcome;
  /** THE JOB THIS RUN IS REPORTING TO, held where the clock is.
   *
   *  It used to be React state in ResearchStep, and that is one lifetime too
   *  short. The run outlives the mount on purpose — leave the step, come back,
   *  the same trace is still arriving — but the component's `jobId` did not
   *  come back with it, so Abort after a return called `run.stop()` (which
   *  fires no ending, by design: the caller owns the job) and then found
   *  nothing to cancel. The job sat `running` in the bell for ever, until a
   *  reload rewrote it as `interrupted`.
   *
   *  Cleared by `finish`: a landed run has no live job. */
  jobId?: string;
}

/** What a landing tells whoever started it. Captured at start time and called
 *  once. `jobs.settle` is referentially stable, so a run that lands while the
 *  step is unmounted still closes its job and rings the bell. */
type Ending = (final: RunState) => void;

const IDLE: Run = { state: { status: "idle" }, outcome: "notebook" };

const runs = new Map<string, Run>();
const subs = new Map<string, Set<() => void>>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const endings = new Map<string, Ending>();

const read = (key: string): Run => runs.get(key) ?? IDLE;

function write(key: string, next: Run) {
  runs.set(key, next);
  subs.get(key)?.forEach((f) => f());
}

function subscribe(key: string, f: () => void) {
  let set = subs.get(key);
  if (!set) {
    set = new Set();
    subs.set(key, set);
  }
  set.add(f);
  return () => void set!.delete(f);
}

/** Land the run and tell its starter.
 *
 *  `notify` is false when the USER pulled it — an abort or a clear. The caller is
 *  standing right there and owns the job itself, and firing the ending too would
 *  race its own `cancel` through `jobsRef`. */
function finish(key: string, state: RunState, notify = true) {
  const t = timers.get(key);
  if (t) clearTimeout(t);
  timers.delete(key);
  write(key, { ...read(key), state, jobId: undefined });
  const end = endings.get(key);
  endings.delete(key);
  if (notify) end?.(state);
}

/** One tick of the process: emit the next step, or land on the ending this run
 *  was started for. */
function advance(key: string) {
  const cur = read(key);
  if (cur.state.status !== "running") return;
  const i = cur.state.done;
  const elapsedMs = cur.state.elapsedMs;

  if (i >= STOP_AT[cur.outcome]) {
    finish(
      key,
      cur.outcome === "notebook"
        ? { status: "done", elapsedMs }
        : cur.outcome === "no-tension"
          ? { status: "no-tension", elapsedMs, reason: NO_TENSION_REASON }
          : { status: "failed", elapsedMs, atStep: i, error: PROCESS_ERROR },
    );
    return;
  }

  const step = TRACE[i];
  timers.set(
    key,
    setTimeout(() => {
      const now = read(key);
      // Stopped, cleared or restarted while this tick was in the air.
      if (now.state.status !== "running" || now.state.done !== i) return;
      write(key, {
        ...now,
        state: { status: "running", done: i + 1, elapsedMs: now.state.elapsedMs + step.ms },
      });
      advance(key);
    }, step.ms / SPEED),
  );
}

/** One run per project — different topics are independent, and a creator who
 *  wants three subjects investigated at once should get three. */
export function useResearchRun(projectId: string) {
  const run = useSyncExternalStore(
    useCallback((f: () => void) => subscribe(projectId, f), [projectId]),
    useCallback(() => read(projectId), [projectId]),
    () => IDLE,
  );

  /** Start the run and own it until it lands. Returns false if one is already
   *  live here, so the caller never opens a job nothing will settle.
   *
   *  `jobId` is frozen at click time rather than read off state later — it has
   *  to still be here when the step is not. */
  const start = useCallback((jobId: string, onEnd: Ending) => {
    const cur = read(projectId);
    if (cur.state.status === "running") return false;
    endings.set(projectId, onEnd);
    write(projectId, { ...cur, jobId, state: { status: "running", done: 0, elapsedMs: 0 } });
    advance(projectId);
    return true;
  }, [projectId]);

  const stop = useCallback(() => {
    const cur = read(projectId);
    if (cur.state.status !== "running") return;
    finish(
      projectId,
      { status: "failed", elapsedMs: cur.state.elapsedMs, atStep: cur.state.done, error: STOPPED },
      false,
    );
  }, [projectId]);

  const reset = useCallback(() => finish(projectId, { status: "idle" }, false), [projectId]);

  /** Adopt a notebook this project already has, without replaying the run.
   *
   *  IT IS NO LONGER AN EVALUATION AFFORDANCE. The "load saved run" button that
   *  also called this was deleted on 2026-09-08 with the rest of the development
   *  panel; the ONE caller left is hydration (guided/useEducationalResearch.ts —
   *  `if (saved?.researched) run.load()`), which is a product path: a project
   *  whose record says it was researched opens on its notebook rather than on an
   *  empty field pretending nothing happened.
   *
   *  Refuses mid-run for that exact reason — adopting a saved result over a live
   *  run would throw the run away. */
  const load = useCallback(() => {
    if (read(projectId).state.status === "running") return;
    write(projectId, { outcome: "notebook", state: { status: "done", elapsedMs: TOTAL_MS } });
  }, [projectId]);

  /** Steps emitted so far — the trace a surface renders. On a failure this is
   *  what COMPLETED; the step it died on is `failedStepId`. */
  const done =
    run.state.status === "running"
      ? run.state.done
      : run.state.status === "done"
        ? TRACE.length
        : run.state.status === "no-tension"
          ? STOP_AT["no-tension"]
          : run.state.status === "failed"
            ? run.state.atStep
            : 0;

  /** The step the process died ON — the one after everything that completed.
   *  A position in the trace, which is what makes "phase 3" something the user
   *  can look at rather than a number in a sentence. */
  const failedStepId = run.state.status === "failed" ? TRACE[run.state.atStep]?.id : undefined;

  return {
    state: run.state,
    /** The job a LIVE run is reporting to, for the caller that has to cancel
     *  it. Survives leaving the step, which is the whole point. */
    jobId: run.jobId,
    start,
    stop,
    reset,
    load,
    done,
    failedStepId,
    emitted: TRACE.slice(0, done),
  };
}

export const secs = (ms: number) => `${Math.round(ms / 1000)}s`;
