"use client";

// The /articles pages' data: the run list, and one run, each re-read while a
// driver is working on it.
//
// A RE-READ IS A NEW KEY. Every poll bumps `tick`, so each read is issued for
// `<id>#<tick>` through useLoadFor and a slow answer for an older tick (or for
// the run the page has since navigated away from) is dropped rather than drawn
// over a newer one. The last good answer stays on screen between reads.
//
// THE CADENCE FOLLOWS THE WORK. A run a live driver holds is re-read every
// 2.5 s (its steps and sources are appearing); a working status with no driver
// (stalled, or a drive that is just starting) every 8 s; a run at the gate or
// past it is not re-read at all — nothing changes it but the human.
//
// LINT SHAPE: every setState below runs in a promise callback, an interval or
// an event handler, never synchronously in an effect body
// (lint-baseline.json freezes react-hooks/set-state-in-effect).

import { useCallback, useEffect, useState } from "react";

import { useLoadFor } from "@/app/_phases/_shared/useLoadFor";

import { getRun, listRuns, type Fetched, type RunDetail, type RunList } from "./articlesClient";
import { WORKING } from "./runModel";

function useTicker(periodMs: number | null): [number, () => void] {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (periodMs === null) return;
    const t = setInterval(() => setTick((n) => n + 1), periodMs);
    return () => clearInterval(t);
  }, [periodMs]);
  const bump = useCallback(() => setTick((n) => n + 1), []);
  return [tick, bump];
}

export interface Loaded<T> {
  load: Fetched<T>;
  /** Client clock when the answer arrived — what "how long since the run last
   *  moved" is measured against, read in a callback, never during render. */
  at: number;
}

export function useArticleRuns() {
  const [state, setState] = useState<Loaded<RunList> | null>(null);
  const working = state?.load.ok ? state.load.data.runs.some((r) => WORKING.includes(r.status)) : false;
  const [tick, reload] = useTicker(working ? 5000 : null);
  useLoadFor(`runs#${tick}`, () => listRuns(), (load) => {
    // A failed re-read must not wipe a list that was on screen: keep the last
    // good one and let the next tick try again. The FIRST read's failure is
    // drawn, because there is nothing else to draw.
    setState((cur) => (load.ok || !cur?.load.ok ? { load, at: Date.now() } : cur));
  });
  return { state, reload };
}

/** A run written this recently with no driver yet is a drive STARTING (a route
 *  answers before launchRun has taken the lease), not one that died. */
export const START_GRACE_MS = 15_000;

/** Whether to draw a working run as worked-on: a live lease, or a write within
 *  the grace window. Pure, for the node lane. */
export function liveOf(detail: Pick<RunDetail, "driving" | "run">, at: number): boolean {
  return detail.driving || at - Date.parse(detail.run.updatedAt) < START_GRACE_MS;
}

export function useArticleRun(runId: string) {
  const [state, setState] = useState<(Loaded<RunDetail> & { runId: string }) | null>(null);
  const mine = state && state.runId === runId ? state : null;
  const detail = mine?.load.ok ? mine.load.data : null;
  const live = detail && mine ? liveOf(detail, mine.at) : false;
  const period = detail && WORKING.includes(detail.run.status) ? (live ? 2500 : 8000) : null;
  const [tick, reload] = useTicker(period);
  useLoadFor(`${runId}#${tick}`, () => getRun(runId), (load) => {
    setState((cur) => (load.ok || !(cur?.runId === runId && cur.load.ok) ? { load, at: Date.now(), runId } : cur));
  });
  /** An act's answer (approve, reject, resume) is the run as it now stands:
   *  fold it in at once, then re-read the rest. */
  const adopt = useCallback(
    (run: RunDetail["run"]) => {
      setState((cur) => (cur && cur.runId === runId && cur.load.ok ? { ...cur, load: { ok: true, data: { ...cur.load.data, run } } } : cur));
      reload();
    },
    [runId, reload],
  );
  return { state: mine, live, reload, adopt };
}
