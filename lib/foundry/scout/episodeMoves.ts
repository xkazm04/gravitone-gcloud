import type { Channel, Episode, EpisodeState } from "@gt/domain/channel";

import { cellVerdict, reelCell } from "./reelTaste";
import { readNight } from "./store";
import { storyboardVerdict } from "./storyboardKept";
import type { Night, NightId, ReelCandidate, StoryboardCandidate } from "./types";

// AN EPISODE FOLLOWS ITS CANDIDATE (spark project-baseline WP-B).
//
// A night never decides an episode; it makes one. The channel store (./channels.ts) holds the episode's state, the
// night holds the candidate that makes it (`fromEpisode` on a storyboard or a reel), and this file keeps the first
// following the second:
//
//   candidate pending           -> in-production   (`candidate: <night>/<c-id>`)
//   candidate rendered          -> made
//   candidate failed            -> outline-kept    (only while the episode is still this candidate's: a failed one frees it)
//   kept on the night's packet  -> kept
//   rejected on it              -> thrown
//
// The move is DERIVED, never remembered: `followEpisodes` reads the night as it stands and walks each episode along the
// store's state machine to where its candidate says it is, so it is idempotent and a step missed by a crash (a launch
// that died before its move, a render settled by the worker while no one waited) is made up the next time anyone
// follows. It is called after every write that changes such a candidate - the launch, a failed launch, the job's
// ending, a collect - and after the operator's commit of the night's packet.
//
// IT NEVER FAILS ITS CALLER. A channel store that refuses (an episode it does not hold, a move its machine forbids, the
// WP-A stub) is said on stderr and the night goes on: a render or a commit is never lost to the channel's bookkeeping.
//
// A DRY NIGHT MOVES NOTHING. Its storyboards are words only and its verdicts were over stand-ins (./storyboardKept.ts),
// so a rehearsal never takes, makes or ends an operator's episode.

/** The channel store as the night reads and moves it; a test hands its own (`setEpisodeDoorForTests`). */
export type EpisodeDoor = {
  readonly episodeOf: (id: string) => Promise<{ readonly channel: Channel; readonly episode: Episode } | undefined>;
  readonly setEpisodeState: (id: string, next: EpisodeState, patch?: { readonly candidate?: string }) => Promise<Episode>;
};

// Loaded on first use, so a producer that imports this file does not pull the channel store's graph in with it.
const CHANNELS: EpisodeDoor = {
  episodeOf: async (id) => (await import("./channels")).episodeOf(id),
  setEpisodeState: async (id, next, patch) => (await import("./channels")).setEpisodeState(id, next, patch),
};

let door: EpisodeDoor = CHANNELS;

export const episodeDoor = (): EpisodeDoor => door;

/** A test's channel store in place of ./channels.ts; null restores it. */
export function setEpisodeDoorForTests(d: EpisodeDoor | null): void {
  door = d ?? CHANNELS;
}

type Made = StoryboardCandidate | ReelCandidate;
const isMade = (c: { readonly kind: string }): c is Made => c.kind === "storyboard" || c.kind === "reel";

/** Where the candidate says its episode is, or undefined on a dry night. A failed candidate frees it whatever was said of it. */
export function episodeTarget(n: Night, c: Made): EpisodeState | undefined {
  if (n.dry) return undefined;
  if (c.status === "failed") return "outline-kept";
  const verdict = c.kind === "storyboard" ? storyboardVerdict(n, c) : cellVerdict(n, reelCell(c.id));
  if (verdict === "kept") return "kept";
  if (verdict === "rejected") return "thrown";
  return c.status === "rendered" ? "made" : "in-production";
}

const RANK: Readonly<Record<EpisodeState, number>> = { "outline-kept": 0, "in-production": 1, made: 2, kept: 3, thrown: 3 };
const FORWARD: readonly EpisodeState[] = ["outline-kept", "in-production", "made"];

/**
 * The store's moves that take `e` to `target` for the candidate `ref`, in order; none when it is there already, when it
 * has ended (kept and thrown are final), or when another candidate holds it.
 */
export function movesTo(e: Pick<Episode, "state" | "candidate">, target: EpisodeState, ref: string): EpisodeState[] {
  if (e.state === target) return [];
  if (target === "outline-kept") return e.state === "in-production" && e.candidate === ref ? ["outline-kept"] : [];
  if (e.state === "kept" || e.state === "thrown") return [];
  if (e.state !== "outline-kept" && e.candidate !== undefined && e.candidate !== ref) return [];
  if (RANK[e.state] >= RANK[target]) return [];
  return [...FORWARD.slice(RANK[e.state] + 1, RANK[target] + 1), ...(RANK[target] === 3 ? [target] : [])];
}

const say = (s: string): void => {
  console.error(`episode: ${s}`);
};

/** Walk every episode the night's candidates make (only `cids`, when given) to where its candidate says it is. Never throws. */
export async function followNight(n: Night, cids?: readonly string[]): Promise<void> {
  if (n.dry) return;
  const only = cids === undefined ? undefined : new Set(cids);
  for (const c of n.candidates) {
    if (!isMade(c) || c.fromEpisode === undefined || (only !== undefined && !only.has(c.id))) continue;
    const target = episodeTarget(n, c);
    if (target === undefined) continue;
    const ref = `${n.id}/${c.id}`;
    try {
      const got = await door.episodeOf(c.fromEpisode);
      if (got === undefined) {
        say(`${c.fromEpisode} (${ref}) is not in the channel store; it stays where it is`);
        continue;
      }
      // Only the take names the candidate; the store refuses a later move that tries to change it.
      for (const next of movesTo(got.episode, target, ref)) await door.setEpisodeState(c.fromEpisode, next, next === "in-production" ? { candidate: ref } : {});
    } catch (e) {
      say(`${c.fromEpisode} -> ${target} for ${ref} was refused: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

/** `followNight` over the night as it stands now. Never throws: a night that does not read is said and left. */
export async function followEpisodes(id: NightId, cids?: readonly string[]): Promise<void> {
  let n: Night;
  try {
    n = await readNight(id);
  } catch (e) {
    say(`night ${id} did not read: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  await followNight(n, cids);
}
