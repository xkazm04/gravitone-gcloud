"use client";

// THE STEPPER — one row, numbers and titles only.
//
// It used to be a wrapping grid of cards: each step carried a lowercase
// subtitle ("topic → notebook → scope") and a sentence of state ("2 on film · 1
// rejected · 1 rendering · 1 blocked"), which cost three lines of height and
// pushed the actual step surface below the fold on a laptop. The state belongs
// to the surface you are standing on, not to the rail you navigate with.
//
// What survives from that card rail is the ONE thing a rail should say without
// words: the number is tinted by the project's own progress, so "where am I"
// and "what is finished" are the same glance. No extra element, no extra line.

import { PHASE_STATE_WORD, type PhaseKey, type PhaseState } from "@/lib/projects";

import { STEPS } from "./phases";

/** Number-badge treatment per state. Selection outranks state — the step you
 *  are standing on is always the cyan one, whatever shape it is in. */
const BADGE: Record<PhaseState, string> = {
  done: "border-emerald-300/50 bg-emerald-300/10 text-emerald-200",
  working: "border-cyan-300/35 text-cyan-200/80",
  review: "border-amber-300/45 text-amber-200",
  blocked: "border-rose-300/45 text-rose-200",
  empty: "border-white/15 text-white/45",
};

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
              title={`${s.title} — ${PHASE_STATE_WORD[state]}`}
              className={`flex w-full cursor-pointer items-center justify-center gap-2 px-3 py-2.5 transition ${
                on ? "bg-cyan-400/[0.09]" : "hover:bg-white/[0.04]"
              }`}
            >
              <span
                className={`font-jetbrains grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px] ${
                  on ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-200" : BADGE[state]
                }`}
              >
                {s.n}
              </span>
              <span
                className={`truncate text-sm ${on ? "font-medium text-white" : "text-white/60"}`}
              >
                {s.title}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
