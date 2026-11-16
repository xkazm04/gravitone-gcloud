import type { Episode } from "@gt/domain/channel";

import { parseCellId, type Night, type ReelCandidate, type StoryboardCandidate } from "./types";

// WHAT THE OPERATOR SAID WHEN A CHANNEL'S EPISODE ENDED (perfect verdicts-steer-channel).
//
// A keep or a throw ends an episode (./channels.ts: kept and thrown are final) and, until now, took the reasons with
// it: they stayed on the night's `committed`, grouped by night, where the writer of the channel's next episodes never
// looks. The record below rides the terminal move itself - one store write, the state and what was said of it - and
// the taste brief (./tasteEpisodes.ts) hands it back under the channel it came from.
//
// The Episode type lives in @gt/domain/channel, outside this lot's reach, so the field is added here as a widening of
// it. The store's door reads it as optional: every episode file written before it still parses.

export type EpisodeVerdict = {
  /** The reasons given on the candidate's rejected cells, merged, each once, in the order the commit holds them. */
  readonly reasons: readonly string[];
  /** The notes the operator wrote on any of the candidate's cells, verbatim, each once. */
  readonly notes: readonly string[];
};

export type VerdictedEpisode = Episode & { readonly verdict?: EpisodeVerdict };

const unique = (xs: readonly string[]): string[] => [...new Set(xs)];

/**
 * The verdict a committed night holds for candidate `c`, or undefined when it holds no words about it. Every cell of
 * the candidate counts: a note is keyed by cell id, and a run's note may sit on any frame or on the words cell, never
 * on one a reader can assume.
 */
export function verdictOf(n: Night, c: StoryboardCandidate | ReelCandidate): EpisodeVerdict | undefined {
  const k = n.committed;
  if (k === undefined) return undefined;
  const mine = (cell: string): boolean => parseCellId(cell)?.candidate === c.id;
  const reasons = unique(
    Object.entries(k.reasons)
      .filter(([cell]) => mine(cell))
      .flatMap(([, rs]) => rs.map((r) => r.trim()))
      .filter((r) => r !== ""),
  );
  const notes = unique(
    Object.entries(k.notes)
      .filter(([cell]) => mine(cell))
      .map(([, note]) => note.trim())
      .filter((note) => note !== ""),
  );
  return reasons.length === 0 && notes.length === 0 ? undefined : { reasons, notes };
}
