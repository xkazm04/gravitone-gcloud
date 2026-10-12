// WHAT EACH STAGE LOOKS LIKE — the one table the heads, the cells and the cards read.
//
// `gate` is the only stage waiting on the human, and lib/board/pipeline.ts
// STAGE_MEANS requires a skin to tell it from `working` in KIND, not merely by
// its place on the X axis: so gate alone gets a heavier border, a heavier
// weight and a warm ground, where working is a cool tint and proposed and done
// are quiet. Tailwind utilities only — amber has no token and stays a utility.

import type { CanonStage } from "@/lib/board/pipeline";

export interface StageTone {
  /** The stage's word in its head, and its count. */
  head: string;
  /** The cell's resting ground. */
  cell: string;
  /** A card sitting in this stage. */
  card: string;
  /** The dot beside the word. */
  dot: string;
}

export const STAGE_TONE: Record<CanonStage, StageTone> = {
  proposed: {
    head: "text-white/65",
    cell: "border-white/[0.06] bg-white/[0.015]",
    card: "border-white/12 bg-white/[0.045]",
    dot: "bg-white/35",
  },
  working: {
    head: "text-cyan-200/85",
    cell: "border-cyan-300/[0.08] bg-cyan-300/[0.02]",
    card: "border-cyan-300/22 bg-cyan-300/[0.05]",
    dot: "bg-cyan-300/70",
  },
  gate: {
    head: "font-semibold text-amber-200",
    cell: "border-amber-300/30 bg-amber-300/[0.045]",
    card: "border-amber-300/45 bg-amber-300/[0.09]",
    dot: "bg-amber-300",
  },
  done: {
    head: "text-emerald-200/80",
    cell: "border-emerald-300/[0.08] bg-emerald-300/[0.02]",
    card: "border-emerald-300/20 bg-emerald-300/[0.035]",
    dot: "bg-emerald-300/60",
  },
};
