import type { Channel, Episode, EpisodeState } from "@gt/domain/channel";

import { Refusal } from "./acts";

// THE CHANNELS' STORE (spark project-baseline) - WP-0 CONTRACT STUB, filled by WP-A.
//
// One JSON file per channel, `<channelsDir>/<id>.json` = `{channel, episodes}`, written under a lock like night.json.
// The directory is `SCOUT_CHANNELS_DIR`, else `foundry-out/scout-channels/`. Nothing here spends.

export type ChannelFile = { readonly channel: Channel; readonly episodes: readonly Episode[] };

/** What `episodes import` reads: the session's outlines (a JSON array of channels with items) and the pasted
 *  outline-triage report (lines `  F1-03 keep · Title · note`). Only `keep` lines import. */
export type ImportInput = { readonly outlines: unknown; readonly report: string };
export type ImportResult = { readonly imported: readonly string[]; readonly skipped: readonly { readonly id: string; readonly why: string }[] };

export function channelsDir(): string {
  throw new Refusal("channels: not built yet (spark project-baseline WP-A)");
}

export async function readChannels(): Promise<readonly ChannelFile[]> {
  return [];
}

export async function readChannel(_id: string): Promise<ChannelFile> {
  throw new Refusal("channels: not built yet (spark project-baseline WP-A)");
}

/** The episode by id, with its channel; undefined when unknown. */
export async function episodeOf(_id: string): Promise<{ readonly channel: Channel; readonly episode: Episode } | undefined> {
  return undefined;
}

/** Move one episode; the store refuses a move its state machine does not allow (outline-kept -> in-production ->
 *  made -> kept | thrown; in-production -> outline-kept when the night's candidate failed). */
export async function setEpisodeState(_id: string, _next: EpisodeState, _patch: { readonly candidate?: string } = {}): Promise<Episode> {
  throw new Refusal("channels: not built yet (spark project-baseline WP-A)");
}

/** Import the accepted outlines; idempotent (an episode already present keeps its state). */
export async function importEpisodes(_input: ImportInput): Promise<ImportResult> {
  throw new Refusal("episodes import: not built yet (spark project-baseline WP-A)");
}

/** Episodes whose outline is kept and that no night has taken, oldest import first, per channel. */
export async function episodesDue(): Promise<readonly { readonly channel: Channel; readonly episodes: readonly Episode[] }[]> {
  return [];
}
