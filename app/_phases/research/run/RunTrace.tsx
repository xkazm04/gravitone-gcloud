"use client";

import { PHASE_LABEL } from "./trace";
import type { RunState, TraceStep } from "./types";
import { secs } from "./useResearchRun";

/** The trace, as it arrives. Grouped by the research prompt's own phases, so
 *  the running state teaches the process instead of hiding it behind a spinner. */
export default function RunTrace({
  emitted,
  state,
  failedStepId,
  className = "",
}: {
  emitted: TraceStep[];
  state: RunState;
  failedStepId?: string;
  className?: string;
}) {
  const running = state.status === "running";
  return (
    <ol className={`space-y-1 ${className}`}>
      {emitted.map((s, i) => {
        const first = i === 0 || emitted[i - 1].phase !== s.phase;
        return (
          <li key={s.id}>
            {first && (
              <p className="font-jetbrains mt-3 mb-1 text-[10px] tracking-[0.16em] text-white/30 uppercase first:mt-0">
                {PHASE_LABEL[s.phase]}
              </p>
            )}
            <div className="flex gap-2.5">
              <span
                className={`font-jetbrains mt-[3px] shrink-0 text-[10px] ${
                  s.kind === "search" ? "text-cyan-300/80" : s.kind === "judgement" ? "text-violet-300/80" : "text-white/35"
                }`}
              >
                {s.kind === "search" ? "web" : s.kind === "judgement" ? "think" : "write"}
              </span>
              <span className="min-w-0">
                <span className="text-[13px] text-slate-200">{s.label}</span>
                <span className="font-jetbrains ml-2 text-[11px] text-white/35">{secs(s.ms)}</span>
                <p className="font-jetbrains text-[11px] leading-relaxed text-white/40">{s.detail}</p>
              </span>
            </div>
          </li>
        );
      })}
      {running && (
        <li className="flex gap-2.5 pt-2">
          <span className="font-jetbrains mt-[3px] shrink-0 text-[10px] text-white/25">···</span>
          <span className="font-jetbrains text-[12px] text-white/45">working</span>
        </li>
      )}
      {failedStepId && (
        <li className="font-jetbrains pt-2 text-[11px] text-rose-300">process ended here</li>
      )}
    </ol>
  );
}
