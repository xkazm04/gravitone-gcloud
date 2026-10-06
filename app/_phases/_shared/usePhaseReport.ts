"use client";

// ONE REPORTER FOR EVERY STEP — the effect frames/useFrames.ts wrote for itself,
// lifted so Research and Script can say what they have got to.
//
// WHY (2026-09-05, uat compose-from-scratch). `reportPhase` in lib/projects.ts
// is the one door `Project.progress` opens through, and for a year Frames was
// its only caller. So a project whose notebook had landed, whose scope was
// confirmed and whose candidate was adopted still read "Research — not started ·
// Script — not started" on the shelf and on the rail. Ten Characters walked
// the journey; ten found it. The mechanism existed; two steps never called it.
//
// THE RULE IS THE FRAMES RULE, restated: derive, never assert. A step computes
// the word from its own records and reports it only when it CHANGES; `null`
// means nothing to say and writes nothing (a fresh step must not light up merely
// by being opened). A failed write stays silent in the surface and reaches the
// bell through the shared trouble channel, exactly as Frames does it.

import { useEffect, useRef, useState } from "react";

import { reportPhase, type PhaseKey, type PhaseState } from "@/lib/projects";

import { reportStorageTrouble } from "./stepStore";

export type ReportedState = Exclude<PhaseState, "empty"> | null;

/** Waits before each re-attempt of a write that was refused. Bounded on purpose:
 *  a transient refusal (a blocked upgrade, a tab racing for the store) clears in
 *  seconds, a full quota does not, and a permanent failure must reach the bell
 *  once instead of spinning for the life of the session. */
export const REPORT_RETRY_MS: readonly number[] = [1000, 4000, 15000];

// The stamp is taken BEFORE the write so a re-render cannot fire it twice, which
// means a refused write has to give the stamp back — and the effect only re-runs
// when its deps move, so giving it back is not enough: `retry` is the dep that
// moves. Only the LAST refusal reaches the bell; the ones that recover were never
// a finding.
export function usePhaseReport(projectId: string, phase: PhaseKey, reported: ReportedState): void {
  const last = useRef<string | null>(null);
  const failures = useRef<{ stamp: string; n: number }>({ stamp: "", n: 0 });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!reported) return;
    const stamp = `${projectId}:${phase}:${reported}`;
    if (last.current === stamp) return;
    last.current = stamp;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    reportPhase(projectId, phase, reported).then(
      () => {
        if (failures.current.stamp === stamp) failures.current = { stamp: "", n: 0 };
      },
      (e: unknown) => {
        if (!live) return;
        const n = (failures.current.stamp === stamp ? failures.current.n : 0) + 1;
        failures.current = { stamp, n };
        if (n > REPORT_RETRY_MS.length) {
          reportStorageTrouble("write", projectId, `${phase} · progress`, e);
          return;
        }
        last.current = null;
        timer = setTimeout(() => setRetry((t) => t + 1), REPORT_RETRY_MS[n - 1]);
      },
    );
    return () => {
      live = false;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [projectId, phase, reported, retry]);
}
