"use client";

// The controls around a run: what you feed it, where it has got to, what a real
// run would bill, and the standing note about what the engine actually is.
//
// ── THE EVALUATION PANEL IS GONE (2026-09-08) ──────────────────────────────
//
// `OutcomePicker` — the "prototype · drive the ending" pills and the "load saved
// run" control beside them — used to live here. It was gated to
// `NODE_ENV === "development"` earlier the same day; the operator's ruling is
// that development affordances leave the product rather than hide inside it, so
// it is DELETED, at all three of its call sites, with `OUTCOMES` and `LOAD_NOTE`
// which existed only to feed it.
//
// WHAT THE DELETION COSTS, stated rather than discovered later: `outcome` had no
// other writer, so the simulated run now always walks to a notebook and the
// `no-tension` ending is unreachable from the UI. The `failed` ending is NOT —
// Abort still lands there (`useResearchRun#stop`) — and every branch that
// renders either one is untouched, because a run can still end badly for real.
//
// THE `replay 8×` CHIP STAYS, and it was never part of the panel. It is not a
// control and it drives nothing: it is the DISCLOSURE that the run a creator is
// watching is a replay of somebody else's. Removing the controls must not remove
// the disclosure — a creator watching a fake run with nothing on screen saying so
// is the opposite of what this surface is for.

import { CHIP_CLASS, Hint, TALLY_TONE } from "@/components/ui/signal";

import { spendNote, type Preflight } from "./live";
import type { RunState } from "./types";
import { secs } from "./useResearchRun";

/** The topic field. One string, one button — no engine picker, no duration, no
 *  tone: those are decisions the notebook has not earned yet. */
export function TopicField({
  topic,
  setTopic,
  disabled,
  maxLength,
  placeholder = "a topic — “Why Bitcoin price does not rise”",
  className = "",
}: {
  topic: string;
  setTopic: (v: string) => void;
  disabled?: boolean;
  /** The real engine's own budget, served on the pre-flight rather than written
   *  here (/api/research::MAX_TOPIC_CHARS). Undefined until the pre-flight
   *  lands, and undefined for good on a deployment that cannot reach it — the
   *  field is then uncapped and the route still refuses, which is the right way
   *  round: a client-side cap is a courtesy, never a control. */
  maxLength?: number;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      value={topic}
      onChange={(e) => setTopic(e.target.value)}
      disabled={disabled}
      maxLength={maxLength}
      placeholder={placeholder}
      aria-label="Topic"
      className={`font-hanken w-full rounded-xl border border-white/12 bg-white/[0.03] px-4 py-3 text-content text-white placeholder:text-white/25 focus-visible:border-cyan-400/40 disabled:opacity-50 ${className}`}
    />
  );
}

/** THE SECOND PATH, AND ITS PRICE — the one control on this step that spends
 *  real money, with what it will spend written beside it before it is pressed.
 *
 *  THE ORDER IS THE POINT. "Spend and its consent" is not a dialog after the
 *  click; it is a sentence that is already on screen when the creator decides.
 *  So the note and the button are one row, the note is rendered whether or not
 *  the button can be pressed, and the button is DISABLED — with the reason in
 *  the note — when no engine could serve. A spend control that fails after the
 *  click, having told you nothing before it, is the shape this avoids.
 *
 *  The manner is `app/library/Playground.tsx` and `app/_phases/score/
 *  ScoreSpotting.tsx`: a plain span beside the action, never a modal;
 *  `font-jetbrains text-label`; white/40 when the figure is known and amber when
 *  it is not; the long form in the native `title`. A creator who has learned
 *  what that grey line means under an image render reads this one for free.
 *
 *  IT IS NOT THE PRIMARY BUTTON, and it is not styled like one. `Research this`
 *  next door stays the default and stays free — it is the only path that works
 *  with no engine configured, and it is what the operator demos with. */
export function RealRunControl({
  preflight,
  onStart,
  onAbort,
  running,
  disabled,
  className = "",
}: {
  preflight: Preflight | null | undefined;
  onStart: () => void;
  onAbort: () => void;
  running: boolean;
  /** No topic typed. The note still renders — knowing the price does not
   *  require having decided the subject. */
  disabled?: boolean;
  className?: string;
}) {
  const note = spendNote(preflight);
  const reachable = !!preflight?.serving;

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${className}`}>
      {running ? (
        <button
          type="button"
          data-testid="abort-live-research"
          onClick={onAbort}
          className="font-jetbrains rounded-full border border-white/20 px-3.5 py-1.5 text-label text-white/70 transition hover:border-white/35 hover:text-white/90"
        >
          stop the real run
        </button>
      ) : (
        <button
          type="button"
          data-testid="run-research-live"
          onClick={onStart}
          disabled={disabled || !reachable}
          className="font-jetbrains rounded-full border border-violet-400/35 bg-violet-400/[0.07] px-3.5 py-1.5 text-label text-violet-200 transition hover:border-violet-400/55 hover:bg-violet-400/[0.12] disabled:opacity-40 disabled:hover:border-violet-400/35 disabled:hover:bg-violet-400/[0.07]"
        >
          run this for real
        </button>
      )}
      <span
        data-testid="real-run-spend"
        title={note.title}
        className={`font-jetbrains text-label ${note.tone === "warn" ? "text-amber-300/70" : "text-white/40"}`}
      >
        {note.text}
      </span>
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
      className={`font-jetbrains text-label tracking-[0.14em] uppercase ${STATUS_TONE[state.status]}`}
    >
      {statusOf(state)}
    </span>
  );
}

/** What the engine actually is — a stamp, not a paragraph.
 *
 *  It was two sentences under the run button on BOTH faces: "research runs as a
 *  local Claude Code process — minutes, not milliseconds, and it can exit
 *  non-zero. Prototype: the trace is replayed at 8× from run 1 and nothing is
 *  executed." Everything in it that is the WORK survives here — the replay
 *  factor is drawn as the chip itself, and the runtime it is a replay OF sits
 *  behind the chip's disclosure. What went is the app narrating: "nothing is
 *  executed" is what the word `replay` means, and the fact that a run can exit
 *  non-zero is not a note, it is the `failed` ending the log renders in rose
 *  when it happens. */
export function LocalProcessNote({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <span className={`${CHIP_CLASS} ${TALLY_TONE.neutral}`}>
        <span aria-hidden className="opacity-50">replay</span>
        <span className="sr-only">replayed at</span>
        8×
      </span>
      <Hint label="What a real run is">
        a local Claude Code process — minutes, not milliseconds
      </Hint>
    </div>
  );
}
