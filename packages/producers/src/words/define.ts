import { ok, type Result } from "@gt/domain/errors";
import type { ResourceLane } from "@gt/domain/lane";
import type { Producer } from "@gt/kernel/job-core";
import { definePartAct, refuse, unitOf, type ActPlan, type PartActPorts, type UnitPrice } from "../research/partAct.ts";

// THE WORDS PRODUCER (Phase 4 wave C, L37) - an album part's title, description and tags as ONE
// `mv-metadata` turn (v1 lib/sound/mv/metadata.ts `writeMetadata`, which the mv worker ran as its
// `metadata` step). The answer passes v1's own fitter (`fitMetadata`: the YouTube byte limits,
// the chapters from the analysis) before it is booked. The words record exists since L43
// (@gt/domain/steps/parts.ts WORDS, whose `written` field is "what the metadata turn wrote"); the
// binding's `land` writes it (lib/producers/words.ts) and the answer stays the job's output too,
// where the album render reads it.
//
// UNITS: one turn, whatever the recipe's `words` units say (2 in album-video: the prototype's
// guess of title + description) - v1 writes all three fields in one turn, and paying for two
// turns to get what one returns would be inventing spend.

export const WORDS_ACTS = ["write-words"] as const;

export type WordsView = { readonly title: string; readonly analysed: boolean; readonly dry: boolean };

export function wordsPlan(v: WordsView, act: string | null, price: UnitPrice): Result<ActPlan> {
  const a = act ?? "write-words";
  if (a !== "write-words") return refuse(`${a} is not an act of a words part`);
  if (v.title.trim() === "") return refuse("words need a track title");
  // Live words are written against the track's analysis (its chapters, its energy); a dry job
  // stands in without one.
  if (!v.analysed && !v.dry) return refuse(`words need an analysed track: no music-video record is titled "${v.title}"`);
  return ok({ act: a, units: [unitOf("metadata", price, { title: v.title })] });
}

export const defineWords = (lane: ResourceLane, ports: PartActPorts): Producer => definePartAct(lane, ports);
