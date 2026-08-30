// STEP 1 (Research) — THE BEAT-VARIANT MODE, for disciplines that have no
// notebook to research.
//
// An educational project researches FACTS: a topic goes in, a notebook comes
// out, and the triage board scopes it. A trailer has nothing to look up — its
// "research" is choosing, per part of the spine, which of several candidate
// beats the cut will be built on. The vocabulary is Script's own
// (`../../script/trailer/types.ts`): a slot IS a Movement, a variant IS a
// TrailerBeat, and what the creator composes here is the spine Script opens on.
//
// Nothing in this file is craft. The rules that make a chain well-formed live
// in `../../script/trailer/structure.ts` and are applied to the CUT, later; this
// module only knows whether every part has a pick.

import type { Discipline } from "@/lib/projects";

import type { Movement, TrailerBeat } from "../../script/trailer/types";
import { GLASS_HARBOR_SLOTS } from "@/app/_studio/trailerFixtures";

/** One part of the spine and the candidates offered for it. The movement is
 *  the real Movement the composed cut will carry — not a label for one. */
export interface BeatSlot {
  id: string;
  movement: Movement;
  variants: BeatVariant[];
}

/** A candidate beat and why a model (or a person) proposed it. `risk` is the
 *  honest downside of this choice; absent means none was named, not none
 *  exists. */
export interface BeatVariant {
  id: string;
  beat: TrailerBeat;
  rationale: string;
  risk?: string;
}

/** The slots a discipline's board draws.
 *
 *  THE FIXTURE SEAM. Both promotional disciplines get the Glass Harbor slots
 *  regardless of the project's own logline — the shape a `pipeline/BEATS-PROMPT.md`
 *  run would emit, hand-written once (n=0). A `free` project has no template
 *  and no craft, so it borrows the trailer spine as the only beat vocabulary
 *  the studio has; the board says so. `educational` has no slots: its research
 *  is the notebook, and returning [] rather than throwing keeps the seam
 *  honest for a caller that asks. */
export function slotsFor(discipline: Discipline): BeatSlot[] {
  return discipline === "educational" ? [] : GLASS_HARBOR_SLOTS;
}

/** Is there a pick in every slot? `missing` names the slots without one, in
 *  spine order, so the footer can count and Script can say what is absent. */
export function spineComplete(
  picks: Record<string, string | null>,
  slots: BeatSlot[],
): { complete: boolean; missing: string[] } {
  const missing = slots
    .filter((s) => {
      const v = picks[s.id];
      return !v || !s.variants.some((x) => x.id === v);
    })
    .map((s) => s.id);
  return { complete: missing.length === 0, missing };
}

/** The picked variant for a slot, or null — a pick naming a variant the slot no
 *  longer offers is treated as absent rather than rendered as something. */
export function pickedVariant(
  slot: BeatSlot,
  picks: Record<string, string | null>,
): BeatVariant | null {
  const id = picks[slot.id];
  return (id && slot.variants.find((v) => v.id === id)) || null;
}
