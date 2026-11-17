// The decision stack's springs, one place (prototype dock-package, "cards"): every movement of the stack is one of
// these, so a card folding, an edge rising and a value settling share one physics. Under reduced motion a caller
// passes `INSTANT` instead (and drops `layout`).
import type { Transition } from "motion/react";

/** A card folding into the finished stack, an edge rising into focus, the progress cursor moving. */
export const FOLD: Transition = { type: "spring", stiffness: 340, damping: 32, mass: 0.9 };
/** A card's content arriving once its shell has mostly risen (earlier, the edges below still sliding down show
 *  through the half-grown shell). */
export const ARRIVE: Transition = { type: "spring", stiffness: 300, damping: 30, delay: 0.14 };
/** A value accepted into the card. */
export const SETTLE: Transition = { type: "spring", stiffness: 520, damping: 28 };
export const INSTANT: Transition = { duration: 0 };
