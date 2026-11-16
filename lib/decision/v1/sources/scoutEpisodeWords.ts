import type { RowWords } from "@gt/ui/board/port";

import { episodeDoor } from "../../../foundry/scout/episodeMoves.ts";
import type { Night, StoryboardCandidate } from "../../../foundry/scout/types.ts";

// A CHANNEL EPISODE'S OUTLINE ON THE PACKET (perfect 2026-11-08, outline-beside-frames) - beside ./scoutPlan.ts.
//
// The operator judges whether a storyboard delivered its episode, so the channel's name, the episode's logline and its
// five beats ride on the run's row: the card names the channel, the opened run shows the three (RunModal). They are
// the work's own words, verbatim.
//
// WHERE THEY ARE READ. `build` is synchronous and takes a loaded ScoutV1, so `episodesOf` runs where ScoutV1 is
// loaded (./scout.ts `read`) and the plan only looks the words up. The store is read through the same door the
// night's episode moves use (`episodeDoor`, which a test replaces). A channel store that is damaged, or an episode it
// does not hold, leaves that episode's words out: the row still draws, as an idea's does.

export type EpisodeWords = { readonly channel: string; readonly logline: string; readonly beats: readonly string[] };

/** By episode id (`F1-09`): the words of each episode a storyboard or reel of the night was made from. */
export async function episodesOf(night: Night): Promise<{ readonly episodes?: Readonly<Record<string, EpisodeWords>> }> {
  const ids = new Set<string>();
  for (const c of night.candidates) if ((c.kind === "storyboard" || c.kind === "reel") && c.fromEpisode !== undefined) ids.add(c.fromEpisode);
  const episodes: Record<string, EpisodeWords> = {};
  for (const id of ids) {
    try {
      const got = await episodeDoor().episodeOf(id);
      if (got !== undefined) episodes[id] = { channel: got.channel.name, logline: got.episode.logline, beats: got.episode.beats };
    } catch {
      // A damaged store never fails the packet; the episode's words are absent.
    }
  }
  return Object.keys(episodes).length === 0 ? {} : { episodes };
}

/** The row fields of a candidate made from an episode: none when it was not, or when its words were not read. */
export function episodeRow(fromEpisode: string | undefined, episodes: Readonly<Record<string, EpisodeWords>> | undefined): Pick<RowWords, "channel" | "logline" | "beats"> {
  const e = fromEpisode === undefined ? undefined : episodes?.[fromEpisode];
  return e === undefined ? {} : { channel: e.channel, logline: e.logline, beats: e.beats };
}

/** What a kept storyboard does made from no episode (an archived path: the idea chain), as the preview says it. */
export const STORYBOARD_VERDICT = { keep: "ready for a full video", reject: "refused: no full video grows from it" } as const;

/**
 * What a verdict on a storyboard does, as the preview says it (perfect 2026-11-08, keep-states-real-effect). Made from a
 * channel episode, the commit ends the episode - kept, or thrown (lib/foundry/scout/episodeMoves.ts `episodeTarget`) -
 * and no full video follows, so that is what the line says; on a dry night nothing moves, and it says that. A board from an
 * idea keeps the shared words: that chain is archived and nothing distinguishes it from the one it was written for.
 */
export function storyboardVerdictLine(night: Pick<Night, "dry">, c: Pick<StoryboardCandidate, "fromEpisode">, verdict: "keep" | "reject"): string {
  if (c.fromEpisode === undefined) return STORYBOARD_VERDICT[verdict];
  if (night.dry === true) return verdict === "keep" ? "kept; a dry night moves no episode" : "refused; a dry night moves no episode";
  return verdict === "keep" ? "the episode ends kept" : "refused: the episode ends thrown";
}
