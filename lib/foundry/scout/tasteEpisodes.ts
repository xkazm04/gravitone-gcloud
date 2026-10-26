import type { Channel, Episode } from "@gt/domain/channel";

import { episodesDue } from "./channels";

// `## Episodes due` (spark project-baseline WP-B) - the night's first work, at the top of the taste brief: every
// episode whose outline the operator kept in session and that no night has taken (./channels.ts episodesDue), per
// channel and oldest first, with everything the seat composes it from - the logline, the five beats in order, the
// spec. A storyboard channel's episode becomes `scout storyboard` with `fromEpisode` (panels from its beats); a reel
// channel's becomes `scout reel` with `fromEpisode`, its brief and approach the seat's (./reelDoor.ts).
//
// The section is the outline verbatim: the night composes it, never re-decides it. A channel store that does not read
// leaves the section saying so - the brief is advice, and a night must not open on a guess.

export const EPISODES_HEADING = "## Episodes due";

export type DueChannel = { readonly channel: Channel; readonly episodes: readonly Episode[] };

/** The section's lines for `due` (pure). */
export function episodesSection(due: readonly DueChannel[]): string[] {
  const out = [EPISODES_HEADING, ""];
  const any = due.filter((d) => d.episodes.length > 0);
  if (any.length === 0) return [...out, "- none", ""];
  for (const { channel, episodes } of any) {
    out.push(`### ${channel.id} ${channel.name} · ${channel.medium}`, "");
    for (const e of episodes) {
      out.push(`- ${e.id} · ${e.title}`, `  ${e.logline}`, ...e.beats.map((b, i) => `  ${i + 1}. ${b}`), `  spec: ${e.spec}`);
    }
    out.push("");
  }
  return out;
}

/** `brief` with the section placed first after its title line; `due` a test's, else the channel store's. */
export async function episodesFirst(brief: string, due?: readonly DueChannel[]): Promise<string> {
  let lines: string[];
  try {
    lines = episodesSection(due ?? (await episodesDue()));
  } catch (e) {
    lines = [EPISODES_HEADING, "", `- the channel store did not read: ${e instanceof Error ? e.message : String(e)}`, ""];
  }
  const [title, ...rest] = brief.split("\n");
  const gap = rest[0] === "" ? rest.slice(1) : rest;
  return [title ?? "# Taste", "", ...lines, ...gap].join("\n");
}
