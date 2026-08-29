"use client";

// SCOPE — the creator's decisions about the notebook.
//
// A notebook is what the research FOUND. A scope is what the creator decided to
// carry forward — and those are different documents. Splitting them is what lets
// a person disagree with the research without re-running it.
//
// Three signals per card, and they do different jobs:
//   · verdict  — kept | descoped. Changes what the script may use. Consequential.
//   · liked    — a preference signal. Changes NOTHING in this render; it is the
//                training data for TONE.md's learning loop (knowledge/TONE.md §4).
//   · deepen   — a request for more research. Routes BACKWARD, to a next run.
//
// The separation matters: `liked` must never silently alter the current script,
// or the creator cannot tell which of their actions did what.
//
// The CARDS themselves are not here — they are the notebook flattened, which
// Step 2 reads too, so they live with the contract in
// _shared/notebook/cards.ts.

import { CONCLUSIONS } from "../_shared/notebook/conclusions";
import { buildCards, type Card } from "../_shared/notebook/cards";
import { DIMENSIONS } from "../_shared/notebook/dimensions";

export { buildCards, DIMENSIONS };
export type { Card };
export type { Dimension, DimensionId } from "../_shared/notebook/dimensions";

/* ----------------------------------------------------------- scope state */

export interface CardState { descoped: boolean; liked: boolean; deepen: boolean }
export type Scope = Record<string, CardState>;

export const EMPTY: CardState = { descoped: false, liked: false, deepen: false };
/** Opt-in cards (conclusions) read as descoped until the creator takes them. */
export const OPT_IN_DEFAULT: CardState = { descoped: true, liked: false, deepen: false };

export function stateOf(s: Scope, id: string): CardState {
  const explicit = s[id];
  if (explicit) return explicit;
  return OPT_IN_IDS.has(id) ? OPT_IN_DEFAULT : EMPTY;
}

/** Ids that default to OUT of scope. Computed once from the conclusion set. */
export const OPT_IN_IDS = new Set(CONCLUSIONS.map((c) => c.id));

/** A card that is descoped, or whose support has been descoped out from under it. */
export interface Wound {
  cardId: string;
  /** Ids this card needed that are now gone. */
  missing: string[];
  severity: "broken" | "weakened";
}

/** What the scope decisions actually cost. This is the whole reason the step
 *  exists as a review rather than a checkbox list: the notebook is a graph, and
 *  removing a fact can silently disarm a turn three beats away. */
export function woundsOf(cards: Card[], scope: Scope): Wound[] {
  const gone = new Set(cards.filter((c) => stateOf(scope, c.id).descoped).map((c) => c.id));
  const out: Wound[] = [];
  for (const c of cards) {
    if (gone.has(c.id) || !c.dependsOn.length) continue;
    const missing = c.dependsOn.filter((d) => gone.has(d));
    if (!missing.length) continue;
    // A reversal with NO surviving evidence cannot be argued at all.
    const survivors = c.dependsOn.length - missing.length;
    out.push({ cardId: c.id, missing, severity: survivors === 0 ? "broken" : "weakened" });
  }
  return out;
}

/** Rollup for the header and for the Script step's gate.
 *
 *  CUT AND NEVER-TAKEN ARE COUNTED SEPARATELY, and the split is not cosmetic.
 *  `descoped` used to be `total - kept`, which folded in the seven conclusions
 *  that read as out of scope BY DEFAULT (OPT_IN_DEFAULT) — so a board nobody
 *  had touched opened with an amber "descoped 7" and a notice announcing that
 *  seven cards were out of scope. Both were reports of decisions the creator
 *  had not made. An alarm that is lit on arrival is an alarm nobody reads, on
 *  the one surface whose entire subject is what you chose to cut.
 *
 *  The test is the card's own `optIn`, which is exactly the test CardTile's
 *  ScopeChip already applies to word itself "not taken" rather than "descoped".
 *  The two surfaces now cannot disagree. `kept` and the gate are unchanged:
 *  neither kind goes to the Script step. */
export function scopeSummary(cards: Card[], scope: Scope) {
  const kept = cards.filter((c) => !stateOf(scope, c.id).descoped);
  const out = cards.filter((c) => stateOf(scope, c.id).descoped);
  const wounds = woundsOf(cards, scope);
  const requiredGone = cards.filter((c) => c.required && stateOf(scope, c.id).descoped);
  const byDim = DIMENSIONS.map((d) => ({
    ...d,
    total: cards.filter((c) => c.dimension === d.id).length,
    kept: kept.filter((c) => c.dimension === d.id).length,
  }));
  return {
    kept: kept.length,
    total: cards.length,
    /** Cards the creator CUT. Opt-ins are not here — see `notTaken`. */
    descoped: out.filter((c) => !c.optIn).length,
    /** Opt-in cards not taken into scope. The default state, not a decision. */
    notTaken: out.filter((c) => c.optIn).length,
    /** Everything the Script step will not see, however it got that way. */
    outOfScope: out.length,
    liked: cards.filter((c) => stateOf(scope, c.id).liked).length,
    deepen: cards.filter((c) => stateOf(scope, c.id).deepen).length,
    wounds,
    broken: wounds.filter((w) => w.severity === "broken").length,
    requiredGone,
    byDim,
    /** The Script step may proceed, but not silently, if anything is wounded. */
    blocked: requiredGone.length > 0,
  };
}
