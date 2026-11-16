import { channelOfEpisode, CHANNEL_ID_RE, EPISODE_ID_RE } from "@gt/domain/channel";
import { errorMessage } from "@gt/domain/errors";
import type { Venture } from "@gt/domain/genre";
import { LESSON_DIMENSIONS, type Production, type ProductionLesson } from "@gt/domain/production";
import { acceptedLessons } from "@gt/kernel/productions/lessons";
import { listVentures } from "@gt/kernel/ventures/store";

import { kernel } from "../../kernelProcess.ts";
import { readChannels } from "./channels";

// `## Accepted lessons` (spark concept-casting-stages S6): what the operator accepted of a finished production's proposed
// lessons, in the taste brief, per project. A production's project is its venture when it has one (a channel-imported
// venture files under its channel id), else the channel of the episode it came from. A lesson with neither has no
// project to feed yet and is not shown.
//
// THE SECTION IS ONLY ADDED: no accepted lessons, no heading, and the brief is byte for byte what it was. It reads the kernel the
// way ./episodeTaken.ts does: a shell that moved the channel or night store and named no kernel store must not open the operator's.

export const LESSONS_HEADING = "## Accepted lessons";
/** The most lessons one project carries into the brief; the newest win, a count names what was left out. */
export const LESSON_LINES = 12;

export type AcceptedRow = { readonly lesson: ProductionLesson; readonly production: Production };
export type LessonWorld = { readonly rows: readonly AcceptedRow[]; readonly ventures: readonly Venture[] };

const NOTHING: LessonWorld = { rows: [], ventures: [] };

function fromKernel(): LessonWorld {
  const moved = (process.env["SCOUT_CHANNELS_DIR"]?.trim() ?? "") !== "" || (process.env["SCOUT_STORE_DIR"]?.trim() ?? "") !== "";
  if (moved && (process.env["GRAVITONE_STORE_PATH"]?.trim() ?? "") === "") return NOTHING;
  const k = kernel();
  if (!k.ok) throw new Error(k.error.message);
  const r = k.value.store.read((x) => ({ rows: acceptedLessons(x), ventures: listVentures(x) }));
  if (!r.ok) throw new Error(errorMessage(r.error));
  return r.value;
}

type Project = { readonly key: string; readonly heading: string };

/** The project a production's lessons feed, or undefined when it has none yet. */
function projectOf(p: Production, ventures: readonly Venture[], names: ReadonlyMap<string, string>): Project | undefined {
  if (p.ventureId !== undefined) {
    const v = ventures.find((x) => x.id === p.ventureId);
    const channel = v?.channelId;
    if (channel !== undefined) return { key: channel, heading: `${channel} ${names.get(channel) ?? v?.name ?? channel}` };
    return { key: p.ventureId, heading: `${p.ventureId} ${v?.name ?? p.ventureId}` };
  }
  if (p.source.kind === "episode" && EPISODE_ID_RE.test(p.source.ref)) {
    const channel = channelOfEpisode(p.source.ref);
    if (CHANNEL_ID_RE.test(channel)) return { key: channel, heading: `${channel} ${names.get(channel) ?? channel}` };
  }
  return undefined;
}

const DIMENSION_WORDS: Readonly<Record<(typeof LESSON_DIMENSIONS)[number], string>> = { beats: "beats", "art-style": "art style", technique: "technique" };

/** The section's lines for accepted lessons (pure). `names` is a channel id's display name. */
export function lessonsSection(world: LessonWorld, names: ReadonlyMap<string, string>): string[] {
  const groups = new Map<string, { project: Project; rows: AcceptedRow[] }>();
  for (const row of world.rows) {
    const project = projectOf(row.production, world.ventures, names);
    if (project === undefined) continue;
    const g = groups.get(project.key);
    if (g === undefined) groups.set(project.key, { project, rows: [row] });
    else g.rows.push(row);
  }
  if (groups.size === 0) return [];
  const out = [LESSONS_HEADING, "", "What the operator accepted from finished productions, to plan this project's next work with.", ""];
  for (const { project, rows } of groups.values()) {
    out.push(`### ${project.heading}`, "");
    for (const { lesson, production } of rows.slice(0, LESSON_LINES)) out.push(`- ${DIMENSION_WORDS[lesson.dimension]} (${production.title}): ${lesson.text}`);
    if (rows.length > LESSON_LINES) out.push(`- +${rows.length - LESSON_LINES} older`);
    out.push("");
  }
  return out;
}

/** The section for this process's kernel and channels; a store that will not read says so, it never reads as no lessons. */
export async function tasteLessons(world?: LessonWorld): Promise<string[]> {
  try {
    const w = world ?? fromKernel();
    if (w.rows.length === 0) return [];
    const names = new Map((await readChannels()).map((f) => [f.channel.id, f.channel.name]));
    return lessonsSection(w, names);
  } catch (e) {
    return [LESSONS_HEADING, "", `- the accepted lessons did not read: ${errorMessage(e)}`, ""];
  }
}
