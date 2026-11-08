"use client";

// THE SHEET'S MOTION, in one place: the columns settle once on load, a line's value crossfades when the record
// moves it (the brief's state, the job's state), a take or a winner arrives into its row, and a history row slides
// to its new group on a re-read. Entrance and click-gated only, never a loop. Under prefers-reduced-motion every
// one of them is off - not shortened: `initial={false}`, no exit, no layout - so the sheet is drawn where it ends.
import { useReducedMotion, type Transition } from "motion/react";

// tokens.css `--ease` and `--dur` / `--dur-fast`, as numbers motion reads.
const EASE = [0.22, 1, 0.36, 1] as const;
const DUR = 0.3;
const DUR_FAST = 0.15;

export type Moves = {
  readonly reduced: boolean;
  /** The two columns, once, on load; `i` staggers the right column behind the left. */
  readonly settle: (i: number) => { readonly initial: false | { readonly opacity: number; readonly y: number }; readonly animate: { readonly opacity: number; readonly y: number }; readonly transition: Transition };
  /** A value replaced in place: keyed by what it shows, inside AnimatePresence mode="wait". */
  readonly swap: { readonly initial: false | { readonly opacity: number }; readonly animate: { readonly opacity: number }; readonly exit: { readonly opacity: number }; readonly transition: Transition };
  /** Something that arrives (a take done, the winner, the transport): inside AnimatePresence. */
  readonly arrive: { readonly initial: false | { readonly opacity: number; readonly y: number }; readonly animate: { readonly opacity: number; readonly y: number }; readonly exit: { readonly opacity: number }; readonly transition: Transition };
  /** A list row's layout animation (the history regrouping). */
  readonly layout: boolean;
};

export function useMoves(): Moves {
  const reduced = useReducedMotion() === true;
  const none: Transition = { duration: 0 };
  return {
    reduced,
    settle: (i) =>
      reduced
        ? { initial: false, animate: { opacity: 1, y: 0 }, transition: none }
        : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: DUR, ease: EASE, delay: i * 0.06 } },
    swap: reduced
      ? { initial: false, animate: { opacity: 1 }, exit: { opacity: 1 }, transition: none }
      : { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: DUR_FAST, ease: EASE } },
    arrive: reduced
      ? { initial: false, animate: { opacity: 1, y: 0 }, exit: { opacity: 1 }, transition: none }
      : { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 }, transition: { duration: DUR, ease: EASE } },
    layout: !reduced,
  };
}
