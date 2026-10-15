// THE BLIND PAIR'S PURE HALF - which pair is up, how an arm looks once picked, and the
// agreement the summary states. The prototype (index.html :575-622) kept the machine pick in
// the page and compared it locally; here the comparison is the kernel's (`PairView.machine`
// exists only for a pair the operator has judged - the blind EXISTS guard), so the desk
// cannot reveal what the server has not released.

import type { PairView, PickOutcome } from "@gt/domain/board";

/** The pair keys' verbs (bindings.ts board.pair) and the outcome each records. */
export const OUTCOME_OF: Readonly<Record<string, PickOutcome>> = { left: "a", right: "b", tie: "tie", "both-bad": "both-bad" };

/** The first pair without an answer; `pairs.length` when every pair is judged. */
export function currentPair(pairs: readonly PairView[]): number {
  const i = pairs.findIndex((p) => p.outcome === null);
  return i < 0 ? pairs.length : i;
}

export type ArmLook = "open" | "picked" | "dropped" | "bad" | "even";

/** How arm `side` draws once `outcome` is known (prototype `.arm.picked/.dropped/.bad`). */
export function armLook(outcome: PickOutcome | null, side: "a" | "b"): ArmLook {
  if (outcome === null) return "open";
  if (outcome === "both-bad") return "bad";
  if (outcome === "tie") return "even";
  return outcome === side ? "picked" : "dropped";
}

export function outcomeWords(outcome: PickOutcome): string {
  return outcome === "a" ? "left" : outcome === "b" ? "right" : outcome === "tie" ? "tie" : "both bad";
}

/** The machine's agreement over judged pairs. A pick the kernel could not compare (null) is not counted either way. */
export function agreement(pairs: readonly PairView[]): { readonly agree: number; readonly compared: number; readonly total: number } {
  let agree = 0;
  let compared = 0;
  for (const p of pairs) {
    const a = p.machine?.agrees;
    if (a === true || a === false) {
      compared++;
      if (a) agree++;
    }
  }
  return { agree, compared, total: pairs.length };
}
