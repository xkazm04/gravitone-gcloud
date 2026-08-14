"use client";

// The controls around a run: what you feed it, which ending to drive, where it
// has got to, and the standing note about what the engine actually is.

import { OUTCOMES } from "./trace";
import type { RunOutcome, RunState } from "./types";
import { LOAD_NOTE, secs } from "./useResearchRun";

/** The topic field. One string, one button — no engine picker, no duration, no
 *  tone: those are decisions the notebook has not earned yet. */
export function TopicField({
  topic,
  setTopic,
  disabled,
  placeholder = "a topic — “Why Bitcoin price does not rise”",
  className = "",
}: {
  topic: string;
  setTopic: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      value={topic}
      onChange={(e) => setTopic(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      aria-label="Topic"
      className={`font-hanken w-full rounded-xl border border-white/12 bg-white/[0.03] px-4 py-3 text-base text-white placeholder:text-white/25 focus-visible:border-cyan-400/40 disabled:opacity-50 ${className}`}
    />
  );
}

/** Which ending to drive. Prototype scaffolding, and labelled as such — the
 *  three outcomes are real states the surface has to render, so they must be
 *  reachable without waiting for a bad day. */
export function OutcomePicker({
  outcome,
  setOutcome,
  disabled,
  onLoad,
  loaded,
}: {
  outcome: RunOutcome;
  setOutcome: (o: RunOutcome) => void;
  disabled?: boolean;
  /** Jump straight to the finished notebook, skipping the simulated run. */
  onLoad?: () => void;
  loaded?: boolean;
}) {
  return (
    <div className="font-jetbrains flex flex-wrap items-center gap-1.5 text-[10px]">
      <span className="tracking-[0.16em] text-white/25 uppercase">prototype · drive the ending</span>
      {OUTCOMES.map((o) => (
        <button
          key={o.key}
          onClick={() => setOutcome(o.key)}
          disabled={disabled}
          title={o.hint}
          className={`rounded-full border px-2.5 py-1 tracking-[0.1em] transition disabled:opacity-40 ${
            outcome === o.key
              ? "border-white/25 bg-white/[0.06] text-white/80"
              : "border-white/10 text-white/35 hover:text-white/70"
          }`}
        >
          {o.label}
        </button>
      ))}

      {/* Load the saved run. Separated by a hairline because it is a different
          KIND of control: the outcome pills choose which ending the mocked run
          walks to, this one skips the walk entirely. Cyan — it is the only
          affordance here that is doing you a favour. */}
      {onLoad && (
        <>
          <span aria-hidden className="mx-1 h-3 w-px bg-white/10" />
          {/* Disabled mid-run for the same reason the pills are: this jumps the
              state straight to a finished notebook, and doing that while the
              engine is stepping would abandon a run whose job is still open. */}
          <button
            onClick={onLoad}
            data-testid="load-saved-run"
            disabled={disabled}
            title={LOAD_NOTE}
            className="rounded-full border border-cyan-400/30 bg-cyan-400/5 px-2.5 py-1 tracking-[0.1em] text-cyan-300/90 transition hover:border-cyan-400/50 hover:bg-cyan-400/10 hover:text-cyan-200 disabled:opacity-40 disabled:hover:border-cyan-400/30 disabled:hover:bg-cyan-400/5"
          >
            load saved run
          </button>
          {loaded && (
            <span className="text-white/30" data-testid="load-saved-note">
              saved research · not re-run
            </span>
          )}
        </>
      )}
    </div>
  );
}

const STATUS_TONE: Record<RunState["status"], string> = {
  idle: "text-white/30",
  running: "text-cyan-300/80",
  done: "text-white/35",
  "no-tension": "text-amber-300/80",
  failed: "text-rose-300/80",
};

function statusOf(state: RunState): string {
  switch (state.status) {
    case "running":
      return `running · ${secs(state.elapsedMs)}`;
    case "done":
      return `complete · ${secs(state.elapsedMs)}`;
    case "no-tension":
      return `no tension · ${secs(state.elapsedMs)}`;
    case "failed":
      return `ended early · ${secs(state.elapsedMs)}`;
    default:
      return "";
  }
}

/** Where the run has got to, in one line beside the log's title.
 *
 *  This replaced a percentage box: the job is driven, so `progress` means
 *  nothing on it, and a fraction over a replayed fixture was never the answer to
 *  "how far along" anyway — the trace is. The clock here is the run's OWN mocked
 *  wall time, the same units the per-step durations are in, so it agrees with
 *  the list underneath it rather than competing with it. `aria-live` because the
 *  ending is the part a reader must not have to poll for. */
export function RunStatus({ state }: { state: RunState }) {
  return (
    <span
      data-testid="run-status"
      aria-live="polite"
      className={`font-jetbrains text-[10px] tracking-[0.14em] uppercase ${STATUS_TONE[state.status]}`}
    >
      {statusOf(state)}
    </span>
  );
}

/** The honest line about what the engine actually is. Every surface carries it. */
export function LocalProcessNote({ className = "" }: { className?: string }) {
  return (
    <p className={`font-jetbrains text-[11px] leading-relaxed text-white/35 ${className}`}>
      research runs as a local Claude Code process — minutes, not milliseconds, and it can exit
      non-zero. Prototype: the trace is replayed at 8× from run 1 and nothing is executed.
    </p>
  );
}
