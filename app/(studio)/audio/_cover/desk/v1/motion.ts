"use client";

// THE CONSOLE'S MOTION (prototype v1): three transitions, timed from the design tokens (--dur, --dur-fast, --ease)
// so a re-timed token re-times the desk. A strip folds and unfolds, a take enters as it finishes, a state chip
// crossfades. All of it is entrance or click-gated; nothing repeats. Under prefers-reduced-motion every transition is
// instant and every entrance starts where it ends, so nothing moves at all.
import { useReducedMotion, type Transition } from "motion/react";

import { tokens } from "@gt/ui/tokens";

const secs = (v: string): number => Number.parseFloat(v);

function ease(v: string): [number, number, number, number] {
  const n = (v.match(/-?\d*\.?\d+/g) ?? []).map(Number);
  return [n[0] ?? 0.22, n[1] ?? 1, n[2] ?? 0.36, n[3] ?? 1];
}

const EASE = ease(tokens.ease);
const NONE: Transition = { duration: 0 };

export type MotionKit = {
  /** prefers-reduced-motion: every entrance starts where it ends. */
  readonly still: boolean;
  readonly fold: Transition;
  readonly enter: Transition;
  readonly swap: Transition;
  /** Seconds between two takes entering together. */
  readonly stagger: number;
  /** How far a take rises as it enters, in px (motion's unit for `y`). */
  readonly rise: number;
};

export function useMotionKit(): MotionKit {
  const still = useReducedMotion() === true;
  if (still) return { still, fold: NONE, enter: NONE, swap: NONE, stagger: 0, rise: 0 };
  return {
    still,
    fold: { duration: secs(tokens.dur), ease: EASE },
    enter: { duration: secs(tokens.dur), ease: EASE },
    swap: { duration: secs(tokens["dur-fast"]), ease: "linear" },
    stagger: secs(tokens["dur-fast"]) / 3,
    rise: 4,
  };
}
