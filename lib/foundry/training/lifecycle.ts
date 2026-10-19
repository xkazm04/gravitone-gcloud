// THE DOJO LIFECYCLE — pure. A gated improvement's state is derived, never stored,
// from its ledger row plus two injected facts: whether a sha is an ancestor of main
// (git, answered by the caller) and whether a pin still holds on its surface (the
// filesystem, likewise). The Next server never shells out for either.

import type { TrainingLedgerRowV2, TrainingPin } from "./types";

export type LifecycleState = "closed-no-edit" | "owed" | "proposed" | "merged" | "pinned" | "live";

export interface LifecycleFacts {
  isAncestor: (sha: string) => boolean;
  pinPasses: (pin: TrainingPin) => boolean;
}

/** reject → closed-no-edit. approve → owed; a reflection sha → proposed; that sha an
 *  ancestor of main → merged; pins that exist and pass: some → pinned, all → live. */
export function lifecycleState(
  row: Pick<TrainingLedgerRowV2, "human" | "reflection" | "pins">,
  { isAncestor, pinPasses }: LifecycleFacts,
): LifecycleState {
  if (row.human !== "approve") return "closed-no-edit";
  if (!row.reflection?.sha) return "owed";
  if (!isAncestor(row.reflection.sha)) return "proposed";
  const passing = row.pins.filter(pinPasses).length;
  if (!passing) return "merged";
  return passing === row.pins.length ? "live" : "pinned";
}
