"use client";

// THE RUN LOG, AS A LEDGER (2026-09-08).
//
// It was a list of flex rows, each one a kind label beside a stacked block of
// label + duration + a <p> of `detail` at `text-content`. Fifteen of those is
// fifteen paragraphs — the operator's "overflowing of text", on the surface a
// creator watches for two minutes with nothing else to do. Nothing in it was
// wrong; it just could not be SCANNED, because no two rows lined up.
//
// So: one row per step, four columns, the same grid template on every row —
//
//     kind        what it did                 what it found            time
//     web         the number                  bitcoin all-time high…    3s
//
// THE COLUMNS ARE FRACTIONS, NOT CONTENT WIDTHS, and that is the load-bearing
// choice rather than a style one. `grid-cols-[auto_auto_…]` would re-measure on
// every tick as rows arrive, so the whole ledger would shift sideways fifteen
// times during one run — worse than the list it replaces. `3.5rem` for the kind
// (the three labels are known and mono), `2.75rem` for the duration (mono,
// tabular, one or two digits plus "s"), and the two prose columns split the rest
// 1 : 1.4. None of those depend on what has arrived, so the alignment is fixed
// from the first row.
//
// WHAT HAPPENED TO `detail`. It is the longest field (60–120 chars) and it is
// also the only column that carries the run's actual FINDINGS — "$126,198.07 on
// 6 Oct 2025", "no AND THEN survived". Dropping it would make the ledger a list
// of fifteen verbs; a disclosure would put the findings behind fifteen clicks.
// So it earns a column, and the column truncates to the row with the full string
// in `title`. That is not a loss for a screen reader — the text is in the DOM in
// full and only clipped by `overflow: hidden` — and the same treatment is
// already how this step handles a pasted-paragraph topic (RunStage's StandInNote).
//
// The phase headings stay, spanning the grid: a run reaching phase 3 and
// stopping inside it is information, and it is the only thing here that says
// what the process is DOING rather than what it did.

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

/** The one template. Every row in the ledger — emitted, running, failed — uses
 *  this string and nothing else, which is what makes the columns line up. */
const ROW = "grid grid-cols-[3.5rem_minmax(0,1fr)_minmax(0,1.4fr)_2.75rem] items-baseline gap-x-3";

/** Stays on the content rung while every row sits on the label rung: with the
 *  ledger flattened, the phase is the one thing here that has to out-rank a row. */
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
    <ol className={className}>
      {emitted.map((s, i) => (
        <li key={s.id}>
          {(i === 0 || emitted[i - 1].phase !== s.phase) && <PhaseHeading phase={s.phase} />}
          <div className={`${ROW} border-b border-white/[0.04] py-1`}>
            <span className={`font-jetbrains text-label ${KIND_TONE[s.kind]}`}>
              {KIND_LABEL[s.kind]}
            </span>
            <span title={s.label} className="truncate text-label text-slate-200">
              {s.label}
            </span>
            <span title={s.detail} className="font-jetbrains truncate text-label text-white/40">
              {s.detail}
            </span>
            <span className="font-jetbrains text-right text-label text-white/35 tabular-nums">
              {secs(s.ms)}
            </span>
          </div>
        </li>
      ))}

      {running && (
        <li className={`${ROW} py-1`}>
          <span className="font-jetbrains text-label text-white/25">···</span>
          <span className="font-jetbrains text-label text-white/45">working</span>
        </li>
      )}

      {/* The step it died on. Its own phase heading, so the run log shows the
          process reaching phase 3 and stopping inside it — and NO detail: the
          fixture's detail describes work that finished, and this step's did not.
          What went wrong and whether re-running resumes is the caller's error
          surface; this row is the WHERE.

          The detail column is not left blank, though: it says what the row is,
          in the place the reader is already scanning for findings. And the time
          column holds an em-dash rather than a figure — a step that did not
          finish has no duration, and drawing one would be the ledger inventing
          a number. Neither of those is colour, which is the point: this row is
          rose AND says "process ended here" AND has no time. */}
      {died && (
        <li data-testid="trace-failed-step">
          {(!last || last.phase !== died.phase) && <PhaseHeading phase={died.phase} />}
          <div className={`${ROW} py-1`}>
            <span className="font-jetbrains text-label text-rose-300/70">
              {KIND_LABEL[died.kind]}
            </span>
            <span title={died.label} className="truncate text-label text-rose-200/80">
              {died.label}
            </span>
            <span className="font-jetbrains truncate text-label text-rose-300">
              process ended here
            </span>
            <span aria-hidden className="font-jetbrains text-right text-label text-rose-300/50">
              —
            </span>
          </div>
        </li>
      )}
    </ol>
  );
}
