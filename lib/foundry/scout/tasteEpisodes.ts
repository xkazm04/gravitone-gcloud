import type { Channel, Episode } from "@gt/domain/channel";

import { readChannels } from "./channels";
import { takenEpisodes } from "./episodeTaken";
import type { VerdictedEpisode } from "./episodeVerdict";

// `## Episodes due` (spark project-baseline WP-B) - the night's first work, at the top of the taste brief: every
// episode whose outline the operator kept in session and that no night has taken (./channels.ts episodesDue), per
// channel and oldest first, with everything the seat composes it from - the logline, the five beats in order, the
// spec. A storyboard channel's episode becomes `scout storyboard` with `fromEpisode` (panels from its beats); a reel
// channel's becomes `scout reel` with `fromEpisode`, its brief and approach the seat's (./reelDoor.ts).
//
// A channel with a verdict on its episodes appears here too, due ones or not: each kept and thrown title with the
// reasons and the notes the operator gave (./episodeVerdict.ts), newest first, at most VERDICT_LINES per channel, the
// literal words and never a summary. Channels with due episodes come first, so the night's work stays at the top.
//
// The section is the outline verbatim: the night composes it, never re-decides it. A channel store that does not read
// leaves the section saying so - the brief is advice, and a night must not open on a guess.

export const EPISODES_HEADING = "## Episodes due";

/** The most kept-and-thrown lines one channel carries into the brief; the newest win, a count names what was left out. */
export const VERDICT_LINES = 8;

export type DueChannel = { readonly channel: Channel; readonly episodes: readonly Episode[] };
export type JudgedChannel = { readonly channel: Channel; readonly episodes: readonly VerdictedEpisode[] };

/** Episodes whose outline is kept and that no night has taken, oldest first, per channel; and the ended ones (kept, thrown). */
export function dueAndJudged(files: readonly JudgedChannel[]): { readonly due: DueChannel[]; readonly judged: JudgedChannel[] } {
  const byAt = (a: Episode, b: Episode): number => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1);
  const pick = (f: JudgedChannel, keep: (e: Episode) => boolean, order: (a: Episode, b: Episode) => number): JudgedChannel => ({ channel: f.channel, episodes: f.episodes.filter(keep).sort(order) });
  const ended = (e: Episode): boolean => e.state === "kept" || e.state === "thrown";
  return {
    due: files.map((f) => pick(f, (e) => e.state === "outline-kept", byAt)).filter((d) => d.episodes.length > 0),
    judged: files.map((f) => pick(f, ended, (a, b) => byAt(b, a))).filter((d) => d.episodes.length > 0),
  };
}

function verdictLines(e: VerdictedEpisode): string[] {
  const v = e.verdict;
  return [`- ${e.state} ${e.id} · ${e.title}`, ...(v === undefined || v.reasons.length === 0 ? [] : [`  reasons: ${v.reasons.join("; ")}`]), ...(v?.notes ?? []).map((n) => `  note: ${n}`)];
}

/** The section's lines for `due` and the channels' kept and thrown episodes `judged` (pure). */
export function episodesSection(due: readonly DueChannel[], judged: readonly JudgedChannel[] = []): string[] {
  const out = [EPISODES_HEADING, ""];
  const dueAny = due.filter((d) => d.episodes.length > 0);
  const said = new Map(judged.filter((j) => j.episodes.length > 0).map((j) => [j.channel.id, j]));
  const channels = [...dueAny.map((d) => d.channel), ...judged.map((j) => j.channel).filter((c) => said.has(c.id) && !dueAny.some((d) => d.channel.id === c.id))];
  if (channels.length === 0) return [...out, "- none", ""];
  for (const channel of channels) {
    out.push(`### ${channel.id} ${channel.name} · ${channel.medium}`, "");
    for (const e of dueAny.find((d) => d.channel.id === channel.id)?.episodes ?? []) {
      out.push(`- ${e.id} · ${e.title}`, `  ${e.logline}`, ...e.beats.map((b, i) => `  ${i + 1}. ${b}`), `  spec: ${e.spec}`);
    }
    const eps = said.get(channel.id)?.episodes ?? [];
    for (const e of eps.slice(0, VERDICT_LINES)) out.push(...verdictLines(e));
    if (eps.length > VERDICT_LINES) out.push(`- +${eps.length - VERDICT_LINES} older`);
    out.push("");
  }
  return out;
}

/** `brief` with the section placed first after its title line; `due` a test's, else the channel store's. */
export async function episodesFirst(brief: string, due?: readonly DueChannel[], judged?: readonly JudgedChannel[]): Promise<string> {
  let lines: string[];
  try {
    const started = await takenEpisodes();
    const read = due === undefined ? dueAndJudged((await readChannels()).map((f) => ({ channel: f.channel, episodes: f.episodes.filter((e) => e.state !== "outline-kept" || !started.has(e.id)) }))) : undefined;
    lines = episodesSection(due ?? read?.due ?? [], judged ?? read?.judged ?? []);
  } catch (e) {
    lines = [EPISODES_HEADING, "", `- the channel store did not read: ${e instanceof Error ? e.message : String(e)}`, ""];
  }
  const [title, ...rest] = brief.split("\n");
  const gap = rest[0] === "" ? rest.slice(1) : rest;
  return [title ?? "# Taste", "", ...lines, ...gap].join("\n");
}
