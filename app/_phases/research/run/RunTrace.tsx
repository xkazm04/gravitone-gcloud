"use client";

import { PHASE_LABEL, TRACE } from "./trace";
import type { RunState, TraceStep } from "./types";
import { secs } from "./useResearchRun";

const KIND_LABEL: Record<TraceStep["kind"], string> = {
  search: "web",
  judgement: "think",
  write: "write",
};

const KIND_TONE: Record<TraceStep["kind"], string> = {
  search: "text-cyan-300/80",
  judgement: "text-violet-300/80",
  write: "text-white/35",
};

function PhaseHeading({ phase }: { phase: TraceStep["phase"] }) {
  return (
    <p className="font-jetbrains mt-3 mb-1 text-content tracking-[0.16em] text-white/30 uppercase first:mt-0">
      {PHASE_LABEL[phase]}
    </p>
  );
}

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
  /** The step the process died ON. Not in `emitted` — that is what COMPLETED —
   *  so it is drawn here, in its own position in the list. This is what turns
   *  "phase 3" from a number inside an error sentence into a place the reader
   *  can look at. */
  failedStepId?: string;
  className?: string;
}) {
  const running = state.status === "running";
  const died = failedStepId ? TRACE.find((s) => s.id === failedStepId) : undefined;
  const last = emitted[emitted.length - 1];

  return (
    <ol className={`space-y-1 ${className}`}>
      {emitted.map((s, i) => (
        <li key={s.id}>
          {(i === 0 || emitted[i - 1].phase !== s.phase) && <PhaseHeading phase={s.phase} />}
          <div className="flex gap-2.5">
            <span className={`font-jetbrains mt-[3px] shrink-0 text-label ${KIND_TONE[s.kind]}`}>
              {KIND_LABEL[s.kind]}
            </span>
            <span className="min-w-0">
              <span className="text-label text-slate-200">{s.label}</span>
              <span className="font-jetbrains ml-2 text-label text-white/35">{secs(s.ms)}</span>
              <p className="font-jetbrains text-content leading-relaxed text-white/40">{s.detail}</p>
            </span>
          </div>
        </li>
      ))}

      {running && (
        <li className="flex gap-2.5 pt-2">
          <span className="font-jetbrains mt-[3px] shrink-0 text-label text-white/25">···</span>
          <span className="font-jetbrains text-label text-white/45">working</span>
        </li>
      )}

      {/* The step it died on. Its own phase heading, so the run log shows the
          process reaching phase 3 and stopping inside it — and NO detail: the
          fixture's detail describes work that finished, and this step's did not.
          What went wrong and whether re-running resumes is the caller's error
          surface; this row is the WHERE. */}
      {died && (
        <li data-testid="trace-failed-step">
          {(!last || last.phase !== died.phase) && <PhaseHeading phase={died.phase} />}
          <div className="flex gap-2.5">
            <span className="font-jetbrains mt-[3px] shrink-0 text-label text-rose-300/70">
              {KIND_LABEL[died.kind]}
            </span>
            <span className="min-w-0">
              <span className="text-label text-rose-200/80">{died.label}</span>
              <span className="font-jetbrains ml-2 text-label text-rose-300">process ended here</span>
            </span>
          </div>
        </li>
      )}
    </ol>
  );
}
