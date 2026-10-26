import type { Channel, Episode } from "@gt/domain/channel";

import { Refusal } from "./acts";
import { episodeDoor } from "./episodeMoves";
import { AIM_MAX, USE_MAX, type Night, type NightId, type ReelCandidate, type StoryboardCandidate } from "./types";

// A CHANNEL EPISODE AT THE NIGHT'S DOORS (spark project-baseline WP-B) - what ./storyboard.ts and ./reel.ts read when a
// brief names `fromEpisode` instead of `fromIdea`.
//
// An episode reaches a night only as an ACCEPTED OUTLINE (`outline-kept` in ./channels.ts): its five beats and its spec
// were decided in session, so the night composes it and never re-decides it. A brief for an episode in any other state
// is refused naming that state - in production on some night, made and waiting for its verdict, kept, thrown - and so
// is one for an episode the store does not hold.
//
// ONE LIVE CANDIDATE PER EPISODE, ACROSS NIGHTS: the storyboard rule for ideas (./storyboardKept.ts storyboardOf) read
// by episode - any storyboard (or, for a reel channel, any reel) some night holds for it that has not failed. The
// state check and this one say the same thing twice on purpose: the channel store can lag a crash, the nights cannot.
//
// The channel lends what the seat left out: `use` is `<channel name>: <episode title>` and `aim` the channel's promise,
// each cut to its field's length.

export type EpisodeHeld = { readonly channel: Channel; readonly episode: Episode };

/** The storyboard some night already holds for episode `id` (any status but failed). */
export function episodeBoardOf(nights: readonly Night[], id: string): { readonly night: NightId; readonly candidate: StoryboardCandidate } | undefined {
  for (const n of nights) for (const c of n.candidates) if (c.kind === "storyboard" && c.fromEpisode === id && c.status !== "failed") return { night: n.id, candidate: c };
  return undefined;
}

/** The reel some night already holds for episode `id` (any status but failed). */
export function episodeReelOf(nights: readonly Night[], id: string): { readonly night: NightId; readonly candidate: ReelCandidate } | undefined {
  for (const n of nights) for (const c of n.candidates) if (c.kind === "reel" && c.fromEpisode === id && c.status !== "failed") return { night: n.id, candidate: c };
  return undefined;
}

/** The episode `id` with its channel, ready for a night: held by the store and `outline-kept`. Refused otherwise, at `at`. */
export async function dueEpisode(at: string, id: string): Promise<EpisodeHeld> {
  let got: EpisodeHeld | undefined;
  try {
    got = await episodeDoor().episodeOf(id);
  } catch (e) {
    throw new Refusal(`${at}: fromEpisode: ${id}: the channel store did not read: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (got === undefined) throw new Refusal(`${at}: fromEpisode: no episode ${id} in the channel store`);
  const { episode } = got;
  if (episode.state !== "outline-kept") {
    const where = episode.candidate === undefined ? "" : ` (${episode.candidate})`;
    throw new Refusal(`${at}: fromEpisode: ${id} is ${episode.state}${where}; only an episode whose outline is kept and that no night has taken is made`);
  }
  return got;
}

const cut = (s: string, max: number): string => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);

/** The candidate's `use` and `aim`: the seat's when it wrote them, else the channel's. */
export function episodeUseAim(held: EpisodeHeld, said: { readonly use?: string; readonly aim?: string }): { readonly use: string; readonly aim: string } {
  return {
    use: said.use ?? cut(`${held.channel.name}: ${held.episode.title}`, USE_MAX),
    aim: said.aim ?? cut(held.channel.promise, AIM_MAX),
  };
}
