// THE PAD'S TWO CUTS, AS TOGGLES (AIO-B). The recalibrate assembler withholds
// two kinds of material — renders no note reaches, and conclusions no note names
// — and the pre-flight manifest lists both. Each withheld item, and each one the
// creator already put back, is a toggle on the strip under Recalibrate.
//
// A forced item has moved from the manifest's withheld set into its sent set,
// so it is re-added from the creator's own list or it would vanish the moment
// it was turned on. The order is the source's (RENDERS, its conclusions), not the
// manifest's, for the same reason: a toggle must not jump when it is pressed.
//
// Pure, so the probe lane can hold it without rendering anything.

import type { DispatchToggle } from "../_shared/ui/DispatchStrip";
import type { Conclusion } from "../_shared/notebook/conclusions";
import type { PreviewOutcome } from "@/lib/turns/client";

import { RENDERS } from "./renders";

/** A conclusion's id is the only short name it has — its card title is the
 *  whole claim. `c-one-time-rerating` → `one time rerating`. */
export const conclusionLabel = (id: string) => id.replace(/^c-/, "").replace(/-/g, " ");

export function dispatchToggles(
  outcome: PreviewOutcome | null,
  forceRenders: readonly string[],
  forceConclusions: readonly string[],
  conclusions: readonly Pick<Conclusion, "id">[],
): DispatchToggle[] {
  const manifest = outcome?.ok ? outcome.preview.manifest : null;
  const notSent = new Set([...(manifest?.renders?.notSent ?? []), ...forceRenders]);
  const held = new Set([...(manifest?.conclusions?.held ?? []), ...forceConclusions]);
  return [
    ...RENDERS.filter((r) => notSent.has(r.id)).map((r) => ({
      id: r.id,
      label: r.engineLabel,
      on: forceRenders.includes(r.id),
      group: "renders",
    })),
    ...conclusions.filter((c) => held.has(c.id)).map((c) => ({
      id: c.id,
      label: conclusionLabel(c.id),
      on: forceConclusions.includes(c.id),
      group: "conclusions",
    })),
  ];
}
