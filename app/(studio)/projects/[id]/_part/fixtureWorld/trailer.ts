import "server-only";

import { recipeById } from "@gt/catalog/recipes";
import { templateOf } from "@gt/catalog/projects";
import type { BeatSlot } from "@/lib/research/beats";
import { trailerChain, type PictureUnit } from "@/lib/frames/picture/unit";
import { pictureFromUnits } from "@/lib/score/picture";
import { proposeSpots } from "@/lib/score/spots";
import { composeCut } from "@/lib/script/trailer/cut";
import { derive, newLog } from "@/lib/script/trailer/ops";
import { GLASS_HARBOR_BUDGET, GLASS_HARBOR_CUE, GLASS_HARBOR_SLOTS } from "@/lib/studio/trailerFixtures";

// THE TRAILERS' PICTURE, ONCE (fixture-self-consistency: every fixture in the demo world projects
// from one source). A seeded trailer's Plan states how many plates, shots and score prompts it
// planned; its Frames, Motion and Score editors derive their units from the cut Script composed
// over the beat board Research dealt. Those were two literals that disagreed (the Plan's 24 plates
// against the editor's 30 shots, 2026-11-09). Now the Plan's units are COUNTED here, by the same
// v1 functions the editors call over the same inputs - the board's first picks, which is the spine
// the research seed confirms (../fixtureResearch.ts) - so one cut produces both numbers.
//
// The boards are the Glass Harbor film's, hand-written (lib/studio/trailerFixtures.ts, n=0). The
// teaser is a cut of the same film, so it reads the same board; no other project may.

export type TrailerSeed = { readonly id: string; readonly title: string; readonly recipe: string };

/** The projects whose research deals a beat board, and the board each deals. */
export const BEAT_BOARDS: Readonly<Record<string, readonly BeatSlot[]>> = {
  "glass-harbor-trailer": GLASS_HARBOR_SLOTS,
  "glass-harbor-teaser": GLASS_HARBOR_SLOTS,
};

/** The spine a seeded board confirms: every slot's first variant. */
export function firstPicks(slots: readonly BeatSlot[]): Record<string, string> {
  return Object.fromEntries(slots.flatMap((s) => (s.variants[0] === undefined ? [] : [[s.id, s.variants[0].id] as const])));
}

/** The units the editors derive for a seeded trailer, and the cues Score proposes on them. */
export function trailerPicture(seed: TrailerSeed): { readonly units: readonly PictureUnit[]; readonly cues: number } {
  const slots = BEAT_BOARDS[seed.id] ?? [];
  const template = recipeById(seed.recipe)?.template ?? "trailer";
  const durationS = templateOf(template).defaultS;
  const cut = derive(newLog(composeCut({ projectId: seed.id, title: seed.title, picks: firstPicks(slots), slots: [...slots], cue: GLASS_HARBOR_CUE }), GLASS_HARBOR_BUDGET)).cut;
  const units = trailerChain(cut, { template, durationS }).units;
  return { units, cues: proposeSpots(cut, pictureFromUnits(units, durationS).scenes).spots.length };
}

/** A seeded trailer's Plan units: a plate per derived shot, a clip per shot (a trailer's units are
 *  shots, and every one moves), and a score prompt per cue Score spots. */
export function trailerUnits(seed: TrailerSeed): { readonly plates: number; readonly shots: number; readonly prompts: number } {
  const p = trailerPicture(seed);
  return { plates: p.units.length, shots: p.units.length, prompts: p.cues };
}
