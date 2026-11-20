// The vocabulary a production's takes are judged in, zod-free so a client surface (the street's timeline review)
// and the round's Board packet (./productionRound.ts, server side) read the same list: the scout source's reasons,
// its `videos` group first (craft, motion, style on keys 2-4).
import { reasonVocabulary, reasonsOf, type ReasonVocabulary } from "@gt/domain/source";

/** The row group a round's runs file under. */
export const ROUND_GROUP = "videos";
export const ROUND_SOURCE = "scout";

/** The scout vocabulary with the `videos` group's order. */
export function productionReasons(): ReasonVocabulary {
  const v = reasonVocabulary(ROUND_SOURCE);
  return { ...v, list: reasonsOf(v, ROUND_GROUP) };
}
