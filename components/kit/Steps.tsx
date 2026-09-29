"use client";

// THE STUDIO'S STEPS, as a meridian: Research, Script, Frames, Score, Cut.
//
// A dotted rule runs the width of the rail and each step is a star on it. The rule
// is inked in gold up to the current step and stays dotted after it, so progress is
// a property of the line. Where you are is a RING around a star; what a step has
// come to is the star's own shape:
//
//   done      a white disc with a check cut out (the step is locked)
//   review    a gold lozenge standing on its point (a call is waiting)
//   blocked   an Antares triangle (it stopped)
//   working   a gold ring with a lit core (open)
//   empty     a small ash dot: the honest absence, so the steps with news stand out
//
// Selection and state are two questions and are drawn in two channels: the ring is
// the one, the star the other, so a blocked step you are standing on shows both.
// The names are white on the current step and vellum on the rest; nothing is dimmed.
// A step that cannot be opened yet takes a dashed edge, not a greyer word.
//
// The state words (`in progress`, `needs a call`) ride `sr-only`, and `aria-current`
// marks the step. There is no subtitle slot: an "N of M" belongs on the step's
// `tally`, which sits under its name.

import { Tally } from "@/components/ui/signal";

export type StepState = "empty" | "working" | "review" | "done" | "blocked";

const WORD: Record<StepState, string> = {
  empty: "not started",
  working: "in progress",
  review: "needs a call",
  done: "locked",
  blocked: "blocked",
};

export interface StepDef {
  id: string;
  label: string;
  state?: StepState;
  /** The step's own count: frames kept of frames drawn. */
  tally?: { value: number; of?: number; label?: string };
  /** Reachable by keyboard, not selectable; drawn with a dashed edge. */
  locked?: boolean;
  testId?: string;
}

/** The five, in production order. Callers set `state` and `tally`. */
export const STUDIO_STEPS: readonly StepDef[] = [
  { id: "research", label: "Research" },
  { id: "script", label: "Script" },
  { id: "frames", label: "Frames" },
  { id: "score", label: "Score" },
  { id: "cut", label: "Cut" },
];

function Star({ state }: { state: StepState }) {
  return (
    <svg className="k-step__star" viewBox="-12 -12 24 24" aria-hidden="true">
      {state === "done" && (
        <>
          <circle r="6" className="k-f-white k-s-none" />
          <path d="M-2.8 0.2 L-0.8 2.4 L3 -2.2" className="k-s-deep k-f-none" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {state === "review" && <path d="M0 -6.6 L6.6 0 L0 6.6 L-6.6 0 Z" className="k-f-gold k-s-none" />}
      {state === "blocked" && <path d="M0 -6.4 L6.6 5.2 H-6.6 Z" className="k-s-ant k-f-none" strokeWidth="1.8" strokeLinejoin="round" />}
      {state === "working" && (
        <>
          <circle r="6" className="k-s-gold k-f-none" strokeWidth="1.6" />
          <circle r="2.2" className="k-f-gold k-s-none" />
        </>
      )}
      {state === "empty" && <circle r="2.2" className="k-f-ash k-s-none" />}
    </svg>
  );
}

export function Steps({
  label,
  steps,
  current,
  onSelect,
}: {
  /** The rail's accessible name: "studio steps". */
  label: string;
  steps: readonly StepDef[];
  current: string;
  onSelect?: (id: string) => void;
}) {
  // A `current` that names no step (a rail seen from outside the studio) rings none.
  const at = steps.findIndex((s) => s.id === current);
  return (
    <ol className="k-steps" aria-label={label}>
      {steps.map((s, i) => {
        const state = s.state ?? "empty";
        const on = i === at;
        const open = !s.locked && onSelect;
        return (
          <li key={s.id} className={`k-step${i < at ? " k-step--past" : ""}${on ? " k-step--on" : ""}${s.locked ? " k-step--locked" : ""}`}>
            <button
              type="button"
              data-testid={s.testId}
              aria-current={on ? "step" : undefined}
              aria-disabled={s.locked || undefined}
              onClick={() => open && onSelect(s.id)}
            >
              <span className="k-step__node" data-state={state}>
                <Star state={state} />
              </span>
              <span className="k-step__name k-caps">{s.label}</span>
              {s.tally && <Tally value={s.tally.value} of={s.tally.of} label={s.tally.label} />}
              <span className="sr-only"> — {WORD[state]}{s.locked ? ", not open yet" : ""}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
