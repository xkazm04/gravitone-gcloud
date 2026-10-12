// The foundry's numbers and tones: how a score is spelled as a percentage, the
// three grade thresholds, and the tone each state and grade draws in.
//
// Split out of ui.tsx, which re-exports it, so the door stays under the 200-line
// cap. No JSX here on purpose: this is the Tone type every other foundry leaf
// imports, and a .ts file keeps it free of any component.

import type { TallyTone } from "@/components/ui/signal";

import type { PlantState } from "./parts";

/* ── Numbers ──────────────────────────────────────────────────────────────── */

/** A score as a percentage, or an em dash when it was never measured. */
export function pct(v: number | null | undefined): string {
  return typeof v === "number" ? `${Math.round(v * 100)}%` : "—";
}

export type Grade = "held" | "partial" | "missed" | "ungraded";

/** The thresholds every score on this route is read against — the same three
 *  the kit's ScoreChip used (components/kit/Magnitude.tsx), so a number did not
 *  change meaning when its drawing did. */
export function gradeOf(v: number | null | undefined): Grade {
  return typeof v !== "number" ? "ungraded" : v >= 0.75 ? "held" : v >= 0.5 ? "partial" : "missed";
}

export const GRADE_SPOKEN: Record<Grade, string> = { held: "held", partial: "partly held", missed: "did not hold", ungraded: "not graded" };

/* ── Tones ────────────────────────────────────────────────────────────────── */

export type Tone = TallyTone;

/** A plant state's tone: cyan is the forge at work, amber is a human's turn,
 *  rose is broken, emerald is finished. */
export const STATE_TONE: Record<PlantState, Tone> = {
  live: "cyan",
  ready: "amber",
  inc: "amber",
  gate: "amber",
  failed: "rose",
  committed: "emerald",
};

export const DOT: Record<Tone, string> = {
  neutral: "bg-white/40",
  cyan: "bg-cyan-300",
  emerald: "bg-emerald-300",
  amber: "bg-amber-300",
  rose: "bg-rose-400",
};

export const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-white/60",
  cyan: "text-cyan-200",
  emerald: "text-emerald-200",
  amber: "text-amber-200",
  rose: "text-rose-200",
};

export const GRADE_TONE: Record<Grade, Tone> = { held: "emerald", partial: "amber", missed: "rose", ungraded: "neutral" };

export const GRADE_FILL: Record<Grade, string> = {
  held: "bg-emerald-300/80",
  partial: "bg-amber-300/80",
  missed: "bg-rose-400/80",
  ungraded: "bg-transparent",
};
