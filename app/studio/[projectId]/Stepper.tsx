"use client";

// THE STEPPER — one row, five titles, and the state of each one drawn on it.
//
// ── THE NUMBERS ARE GONE (operator, 2026-09-09) ────────────────────────────
//
// Every step wore a circled ordinal, and the circle was doing two jobs badly.
// As a NUMBER it was noise: the steps are already left-to-right in production
// order, they are named, and nobody navigates a five-item rail by counting. As
// a STATE indicator it was the only thing carrying progress, tinted per state
// with no other signal — so "done" and "blocked" differed by hue inside a ring
// that looked identical, which is the one-signal-in-one-channel shape this
// repo's law forbids, and it read as five badges competing with five titles.
//
// What replaced it is a MARK PER STATE, and the mark is the signal:
//
//   done     ✓ (a real check, drawn)   the step is locked
//   review   ◆ a filled lozenge        it needs a call
//   blocked  ▲ a triangle              it stopped, and why is on the surface
//   working  ◦ a hollow ring           in progress
//   empty    ·  nothing at all         not started — the honest absence
//
// `empty` renders NO glyph on purpose. A rail where every step wears a mark is
// a rail where the marks mean nothing; the absence IS the state, and it leaves
// the untouched steps quiet so the ones with news stand out. Colour still
// agrees with each mark, and never decides alone — every one of these survives
// a greyscale screenshot, which the tinted numerals did not.
//
// The state is the project's OWN progress record, which each step surface
// derives and reports (usePhaseReport). It is not a guess made here.
//
// What this rail still refuses to do, unchanged from the card rail it replaced:
// carry a subtitle or a sentence of counts. "2 on film · 1 rejected · 1
// rendering" belongs to the surface you are standing on, not to the control you
// navigate with, and it cost three lines of height that pushed the step itself
// below the fold.

import { Check } from "lucide-react";

import { PHASE_STATE_WORD, type PhaseKey, type PhaseState } from "@/lib/projects";

import { STEPS } from "./phases";

/** The tone each state is drawn in — applied to the mark AND the title, so the
 *  two read as one statement about one step rather than a chip beside a word. */
const TONE: Record<PhaseState, string> = {
  done: "text-emerald-300/90",
  review: "text-amber-300/90",
  blocked: "text-rose-300/90",
  working: "text-cyan-300/85",
  empty: "text-white/30",
};

/** The mark, per state. `empty` is deliberately nothing — see the header. */
function StateMark({ state }: { state: PhaseState }) {
  if (state === "empty") return null;
  if (state === "done") return <Check className="h-4 w-4" aria-hidden strokeWidth={2.5} />;
  return (
    <svg viewBox="0 0 12 12" aria-hidden className="h-3 w-3" fill="none" stroke="currentColor">
      {state === "review" ? (
        // the lozenge — a decision standing on its point, waiting to be made
        <path d="M6 1 L11 6 L6 11 L1 6 Z" fill="currentColor" stroke="none" />
      ) : state === "blocked" ? (
        // the triangle — the road sign, and the only mark here with a hard edge
        <path d="M6 1.5 L11 10.5 H1 Z" strokeWidth={1.6} strokeLinejoin="round" />
      ) : (
        // working — the hollow ring, a thing still open
        <circle cx={6} cy={6} r={4.2} strokeWidth={1.8} />
      )}
    </svg>
  );
}

export default function Stepper({
  active,
  progress,
  onPick,
}: {
  active: PhaseKey;
  progress: Record<PhaseKey, PhaseState>;
  onPick: (key: PhaseKey) => void;
}) {
  return (
    <ol className="scroll-x flex overflow-hidden rounded-xl border border-white/8 bg-white/[0.02]">
      {STEPS.map((s, i) => {
        const on = s.key === active;
        const state = progress[s.key];
        return (
          <li key={s.key} className={`min-w-0 flex-1 ${i > 0 ? "border-l border-white/8" : ""}`}>
            <button
              onClick={() => onPick(s.key)}
              // Named for the step's ROLE in the production, never for its
              // position: the rail is reordered by editing STEPS in phases.ts,
              // and `step-3` would then point at a different surface while every
              // harness journey went on passing. See the test-identifier
              // contract in lib/harness/protocol.ts — this attribute exists to
              // be found, and renaming it is a breaking change made WITH
              // tests/live/.
              data-testid={`step-${s.key}`}
              aria-current={on ? "step" : undefined}
              // THE TITLE NO LONGER REPEATS THE LABEL. It read "Research —
              // working", and the word before the dash is printed on the button
              // three inches to the right. What is left is the state, which the
              // mark draws and nothing else spelled — so it also goes into the
              // accessible name below, where a shape cannot go.
              title={PHASE_STATE_WORD[state]}
              className={`relative flex w-full cursor-pointer items-center justify-center gap-2 px-3 py-2.5 transition ${
                on ? "bg-cyan-400/[0.09]" : "hover:bg-white/[0.04]"
              }`}
            >
              {/* WHERE YOU ARE, as a rule under the step — not as a colour on
                  the mark. Selection and state are two different questions and
                  they used to share one channel: the active step's badge went
                  cyan, overwriting whatever the step's own state was, so you
                  could not see that the step you were standing on was blocked.
                  They are separate signals now, and both are always visible. */}
              {on && (
                <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-cyan-300/70" />
              )}
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center ${TONE[state]}`}>
                <StateMark state={state} />
              </span>
              <span
                className={`truncate text-label ${on ? "font-medium text-white" : "text-white/60"}`}
              >
                {s.title}
              </span>
              <span className="sr-only"> — {PHASE_STATE_WORD[state]}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
