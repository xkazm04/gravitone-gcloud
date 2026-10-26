// THE BASELINE (spark project-baseline, 2026-10-26) - server only. The scout stopped spreading genres and serves
// channels: the nights before it are the pre-baseline archive (./store.ts preBaselineRoot), still read, still
// committed, and the doors that fed the spread - a seed batch, idea artboards and stats ideas, a genre or venture
// proposal, a kept idea brought in as a source, a storyboard of a kept idea - are SHUT on every new night. They
// stay open on an archived night and in a world without the archive (a test's or a rehearsal's redirected root),
// and they reopen only when the operator says so: the sentence below is what each one answers, verbatim.
//
// Exploration and channel work keep theirs: style, scene, asset, finding, watch, plan, reel, and a storyboard or
// reel of an episode (`fromEpisode`).
//
// The taste brief drops the spread's sections on a new night (`dropArchivedSections`): by HEADING, so a section a
// caller hands in (the graph's branches, the backlog, the genre ladder) is dropped where it is assembled, unread.

import { onBaseline } from "./store";
import type { NightId } from "./types";

export const ARCHIVED_DOOR = "archived: the scout now serves channels (spark project-baseline); this door reopens only when the operator says so";

/** The sentence when the door is shut for `id` (absent: a door no night owns, the seed batch), else undefined. */
export function archivedDoor(id?: NightId): string | undefined {
  return onBaseline(id) ? ARCHIVED_DOOR : undefined;
}

/** A storyboard batch naming any `fromIdea` on a new night: shut. A `fromEpisode` brief passes (it is WP-B's door). */
export function archivedFromIdea(id: NightId, input: unknown): string | undefined {
  const fromIdea = Array.isArray(input) && input.some((x) => typeof x === "object" && x !== null && "fromIdea" in x);
  return fromIdea ? archivedDoor(id) : undefined;
}

/** The taste brief's spread sections, by heading: seeds, ideas, branches, backlog, storyboards to make, genre ladder, ventures. */
export const ARCHIVED_SECTIONS: readonly string[] = [
  "## Seeds to develop",
  "## Seeds blocked",
  "## Paused",
  "## Seed genres",
  "## Ideas to develop",
  "## Ideas blocked",
  "## Genres",
  "## Branches",
  "## Backlog",
  "## Storyboards to make",
  "## Genre ladder",
  "## Ventures",
];

/** `lines` without the archived sections: each runs from its heading to the next `#`/`##` heading. */
export function dropArchivedSections(lines: readonly string[]): string[] {
  const out: string[] = [];
  let dropping = false;
  for (const line of lines) {
    if (/^##? /.test(line)) dropping = ARCHIVED_SECTIONS.includes(line.trim());
    if (!dropping) out.push(line);
  }
  return out;
}
