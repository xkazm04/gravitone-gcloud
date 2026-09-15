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

import { useEffect, useRef } from "react";

import { reportPhase, type PhaseKey, type PhaseState } from "@/lib/projects";

import { reportStorageTrouble } from "./stepStore";

export type ReportedState = Exclude<PhaseState, "empty"> | null;

export function usePhaseReport(projectId: string, phase: PhaseKey, reported: ReportedState): void {
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!reported) return;
    const stamp = `${projectId}:${phase}:${reported}`;
    if (last.current === stamp) return;
    last.current = stamp;
    void reportPhase(projectId, phase, reported).catch((e: unknown) => {
      reportStorageTrouble("write", projectId, `${phase} · progress`, e);
    });
  }, [projectId, phase, reported]);
}
