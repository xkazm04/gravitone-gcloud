"use client";

// The run driver. Mocked, and honest about being a LOCAL PROCESS: it takes real
// time, it emits its steps as it goes, it can be stopped, and it can die.
//
// Timers run at SPEED× so a prototype is drivable, but the elapsed clock counts
// the run's own mocked wall time (the real run was a session, not a spinner) —
// the surfaces label the multiplier rather than pretending 4 seconds of research
// happened.

import { useCallback, useEffect, useState } from "react";

import { NO_TENSION_REASON, PROCESS_ERROR, TRACE } from "./trace";
import type { RunOutcome, RunState } from "./types";

export const SPEED = 8;

/** The run's own mocked wall time — the sum of the trace, not the time you wait. */
export const TOTAL_MS = TRACE.reduce((n, s) => n + s.ms, 0);

/** Shown next to the load control. The honesty requirement: a surface that
 *  fakes a completed run must say that is what it did. */
export const LOAD_NOTE =
  "Loads the real 2026-08-11 Bitcoin notebook and its three renders, without the simulated run. Same data the run produces — the research already happened; only the waiting is skipped.";

/** Where each non-notebook outcome stops. */
const STOP_AT: Record<RunOutcome, number> = {
  notebook: TRACE.length,
  "no-tension": 7, // the six searches plus the tension judgement
  "process-failed": 8, // dies inside phase 3, mechanisms unwritten
};

export function useResearchRun(initial: RunState = { status: "idle" }) {
  const [state, setState] = useState<RunState>(initial);
  const [outcome, setOutcome] = useState<RunOutcome>("notebook");

  useEffect(() => {
    if (state.status !== "running") return;
    const i = state.done;
    const stop = STOP_AT[outcome];

    if (i >= stop) {
      if (outcome === "notebook") setState({ status: "done", elapsedMs: state.elapsedMs });
      else if (outcome === "no-tension")
        setState({ status: "no-tension", elapsedMs: state.elapsedMs, reason: NO_TENSION_REASON });
      else
        setState({
          status: "failed",
          elapsedMs: state.elapsedMs,
          atStep: i,
          error: PROCESS_ERROR,
        });
      return;
    }

    const step = TRACE[i];
    const t = setTimeout(
      () => setState({ status: "running", done: i + 1, elapsedMs: state.elapsedMs + step.ms }),
      step.ms / SPEED,
    );
    return () => clearTimeout(t);
  }, [state, outcome]);

  const run = useCallback(() => setState({ status: "running", done: 0, elapsedMs: 0 }), []);
  const reset = useCallback(() => setState({ status: "idle" }), []);

  /** Jump straight to the finished notebook, skipping the simulated run.
   *
   *  The trace is 41s of mocked process time, which is ~5s of real waiting at
   *  SPEED×. That is the right cost when you are reviewing the RUNNING state; it
   *  is pure friction when you are reviewing everything downstream of it, which
   *  is most of the surface and all of the layout. This is an evaluation
   *  affordance, not a product one — see LOAD_NOTE. */
  const load = useCallback(() => {
    setOutcome("notebook");
    setState({ status: "done", elapsedMs: TOTAL_MS });
  }, []);
  const stop = useCallback(
    () =>
      setState((s) =>
        s.status === "running"
          ? { status: "failed", elapsedMs: s.elapsedMs, atStep: s.done, error: STOPPED }
          : s,
      ),
    [],
  );

  /** Steps emitted so far — the trace a surface renders. */
  const done =
    state.status === "running"
      ? state.done
      : state.status === "done"
        ? TRACE.length
        : state.status === "no-tension"
          ? STOP_AT["no-tension"]
          : state.status === "failed"
            ? state.atStep
            : 0;

  return { state, outcome, setOutcome, run, stop, reset, load, done, emitted: TRACE.slice(0, done) };
}

const STOPPED =
  "Stopped by you at this step. Everything the run had written is on disk; the notebook is incomplete and cannot be rendered from.";

export const secs = (ms: number) => `${Math.round(ms / 1000)}s`;
