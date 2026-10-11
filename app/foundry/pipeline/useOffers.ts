"use client";

// WHICH DELIBERATE MOVE THE AUTHORITY WANTS AN ANSWER FOR.
//
// The board's own routes — a drag, a Shift+arrow, the move map — are for the
// moves a gesture can express. This is the other kind: a move that needs a
// SENTENCE or a CONFIRMATION, offered as buttons inside the item's own detail
// dialog, where there is room to say what it will cost.
//
// `admits()` IS ASKED ONCE PER CANDIDATE COLUMN when the detail opens, which is
// the same cardinality the canvas uses when the move map opens — never per
// render of the pane. That is the contract the engine keeps too, and breaking it
// here would be invisible until an adapter started charging for `admits`.
//
// WHAT IS FILTERED OUT, and why each:
//   · the column the item is already in — a move to where you are is not a move;
//   · anything that is not `needs` — a plain `ok` belongs to a gesture, and a
//     `refused` is not an offer;
//   · `needs: "label"` — a label is a property of the item, not an order, so it
//     has no place among buttons that spend money.

import { useMemo } from "react";

import type { CanonStage, PipelineEntry, PipelineSource } from "@/lib/board/pipeline";

import type { OfferedMove } from "../pipelineModals";
import type { PipelineSkin } from "./types";

export function useOffers(open: PipelineEntry | null, source: PipelineSource, skin: PipelineSkin): OfferedMove[] {
  return useMemo<OfferedMove[]>(() => {
    if (!open) return [];
    const word = (s: CanonStage) => skin.stageLabel?.[s] ?? s;
    const out: OfferedMove[] = [];
    for (const stage of source.stages) {
      const bands = source.bands[stage];
      for (const band of bands && bands.length ? bands.map((b) => b.id) : [null]) {
        if (stage === open.placement.stage && band === open.placement.band) continue;
        const offer = source.admits(open.item, stage, band);
        if (offer.kind !== "needs" || offer.needs === "label") continue;
        out.push({
          to: stage,
          band,
          needs: offer.needs,
          prompt: offer.prompt,
          ...(offer.cost ? { cost: offer.cost } : {}),
          verb: band ? `${word(stage)} · ${band}` : word(stage),
        });
      }
    }
    return out;
  }, [open, source, skin]);
}
