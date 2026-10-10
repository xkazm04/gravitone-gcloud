"use client";

// The project's next move as one press on its title line — the shelf's verb
// ("Decide Frames", "Unblock Score"), tinted by the target step's state the way
// the race sheet's "Up next" button is, with an arrow so the hue never carries
// the meaning alone. The accessible name is the verb itself. No hint, no
// subtitle: a verb and a step name are the work.

import { ArrowRight } from "lucide-react";

import type { NextAction } from "@/app/_projects/shelf";
import type { PhaseKey, PhaseState } from "@/lib/projects";

/** Same tints as RaceSheet's CTA, keyed by the target step's state. */
const TINT: Record<PhaseState, string> = {
  review: "border-amber-400/45 bg-amber-400/10 text-amber-100 hover:bg-amber-400/20",
  blocked: "border-rose-400/45 bg-rose-400/10 text-rose-100 hover:bg-rose-400/20",
  working: "border-cyan-400/40 bg-cyan-400/[0.07] text-cyan-100 hover:bg-cyan-400/15",
  empty: "border-white/15 text-white/65 hover:bg-white/[0.05]",
  done: "border-emerald-400/30 text-emerald-200/85 hover:bg-emerald-400/10",
};

export default function NextMoveChip({
  move,
  state,
  shortcut,
  onGo,
}: {
  move: NextAction | null;
  /** The target step's state — sets the tint. */
  state: PhaseState;
  /** The key bound to the same press; exposed as aria-keyshortcuts. */
  shortcut: string;
  onGo: (step: PhaseKey) => void;
}) {
  if (!move) return null;
  return (
    <button
      type="button"
      data-testid="studio-next-move"
      data-step={move.step}
      data-tone={move.tone}
      aria-keyshortcuts={shortcut}
      onClick={() => onGo(move.step)}
      className={`font-jetbrains flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-label transition ${TINT[state]}`}
    >
      {move.verb}
      <ArrowRight className="h-4 w-4" aria-hidden />
    </button>
  );
}
