// THE SCOUT'S KNOWLEDGE WRITER - server only. What a kept finding and a kept
// watch line become once the Board commits a night (lib/decision/v1/sources/
// scout.ts is the only caller that writes):
//
//   a finding    one line under `## Scout findings` in
//                knowledge/templates/<template>/steps/<step>/PATTERNS.md
//   a watch line one line under `## Proposed by the scout` in
//                knowledge/scout/watchlist.md
//   a storyboard's technique (spark scout-vision) the finding's line exactly, under the
//                same heading in the same PATTERNS.md, marked with the storyboard's id
//
// APPEND-ONLY, AND ONCE. Every line ends in a marker,
// `<!-- scout:<nightId>/<candidateId> -->`; a file that already holds the
// marker is left byte for byte as it was, so a second apply - a redelivery,
// a retry after a crash between two writes - writes nothing. No other line of
// the file is ever rewritten: the section is found (or appended at the end
// when absent) and the new line goes at the end of that section. A step whose
// directory does not exist yet (most templates have only 01-script) is made,
// with a one-line title, because the template directory always exists and a
// finding about 02-frames is still a finding about this template's frames.
//
// The root is injectable (SCOUT_KNOWLEDGE_DIR, read per call, or the `root`
// option), so a test writes a temp tree and never the checkout's knowledge/.
// The files are committed to git by the next night's skill run, not here.

import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { FoundryError, containedIn } from "../runStore";
import type { CandidateId, FindingCandidate, IdeaCandidate, NightId, StoryboardCandidate, StoryboardTechnique, WatchCandidate } from "./types";
import { WING_KNOWLEDGE_DIR, type ScoutWing } from "./wing";
import { activeWing } from "./wingScope";

export const FINDINGS_HEADING = "## Scout findings";
export const WATCH_HEADING = "## Proposed by the scout";
/** A template or step directory name: what knowledge/templates holds, nothing that climbs. */
const NAME_RE = /^[a-z0-9][a-z0-9._-]{0,80}$/;

export type KnowledgeOptions = { readonly root?: string };

/** A finding's template and step, as every door that takes one spells them (./sources.ts findings, ./storyboard.ts techniques). */
export const TEMPLATE_NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
export const TEMPLATE_RULE = "a template is a knowledge/templates directory name";
export const STEP_NAME_RE = /^\d{2}-[a-z][a-z-]*$/;
export const STEP_RULE = "a step is NN-name (02-frames, 05-cut)";

/**
 * Why a finding naming `template` has nowhere to land, or undefined. The scout wing's must name an existing
 * knowledge/templates/<template>/ directory under `root` (the step's PATTERNS.md is made on a keep); a muse finding
 * lands in its techniques.md and serves no template step (findingRelOf).
 */
export async function templateProblem(template: string, root: string = knowledgeRoot()): Promise<string | undefined> {
  if (activeWing() !== "scout") return undefined;
  const dir = path.join(root, "templates", template);
  return (await stat(dir).catch(() => null))?.isDirectory() === true ? undefined : `there is no knowledge/templates/${template}/`;
}

/** SCOUT_KNOWLEDGE_DIR, else `<cwd>/knowledge`. Read per call. */
export function knowledgeRoot(o: KnowledgeOptions = {}): string {
  return path.resolve(o.root ?? (process.env["SCOUT_KNOWLEDGE_DIR"]?.trim() || path.join(process.cwd(), "knowledge")));
}

/** The marker that makes a line's second write a no-op. */
export const markerOf = (night: NightId, candidate: CandidateId): string => `<!-- scout:${night}/${candidate} -->`;

/** Root-relative, forward slashes: the path a consequence names and the CLI's commit stages. */
export function patternsRel(template: string, step: string): string {
  if (!NAME_RE.test(template)) throw new FoundryError(`That is not a template directory name: ${template}.`, 400);
  if (!NAME_RE.test(step)) throw new FoundryError(`That is not a step directory name: ${step}.`, 400);
  return `templates/${template}/steps/${step}/PATTERNS.md`;
}

export const WATCHLIST_REL = "scout/watchlist.md";

/** A wing's watchlist (spark scout-muse): `scout/watchlist.md`, `scout-muse/watchlist.md`. */
export const watchlistRelOf = (wing: ScoutWing): string => `${WING_KNOWLEDGE_DIR[wing]}/watchlist.md`;

/** The muse wing's craft notes and kept characters (knowledge/scout-muse/). */
export const MUSE_TECHNIQUES_REL = "scout-muse/techniques.md";
export const MUSE_CHARACTERS_REL = "scout-muse/characters.md";
export const CHARACTERS_HEADING = "## Kept characters";

/** Where a kept finding lands: the scout wing's step PATTERNS.md; the muse wing's techniques.md (it serves no template step). */
export function findingRelOf(wing: ScoutWing, template: string, step: string): string {
  return wing === "scout" ? patternsRel(template, step) : MUSE_TECHNIQUES_REL;
}

/** One line, whatever the skill's text held: a newline inside a claim would split the bullet. */
const flat = (s: string): string => s.replace(/\s+/g, " ").trim();

/** One line that ends as a sentence: a card's look runs straight into "Plays:" otherwise. */
const sentence = (s: string): string => {
  const t = flat(s);
  return /[.!?]$/.test(t) ? t : `${t}.`;
};

/**
 * A finding that RESTATES one an earlier night kept is its second observation: `n=2`, and the line
 * cites the earlier line's marker so a reader can walk from one to the other. The earlier line is
 * never touched (append-only); the Board's apply hands a `restates` here only once it read that
 * the earlier finding was kept on a committed night (lib/foundry/scout/leadEvents.ts).
 */
export function findingLine(night: NightId, c: FindingCandidate, sourceUrl: string | undefined): string {
  const again = c.restates === undefined ? [] : [`restates scout:${c.restates}`];
  const where = [again.length === 0 ? "n=1" : "n=2", `scout ${night}`, ...again, ...(sourceUrl === undefined ? [] : [sourceUrl])].join(", ");
  return `- ${flat(c.claim)} - "${flat(c.quote)}" (${where}) ${markerOf(night, c.id)}`;
}

/** A storyboard's technique as the finding it is: its claim, its quote, its page as the source. */
export const techniqueFinding = (c: Pick<StoryboardCandidate, "id">, t: StoryboardTechnique): FindingCandidate => ({
  id: c.id,
  kind: "finding",
  sourceIds: [],
  status: "rendered",
  template: t.template,
  step: t.step,
  claim: t.claim,
  quote: t.quote,
});

export function watchLine(night: NightId, c: WatchCandidate): string {
  return `- ${flat(c.entry)} - ${flat(c.why)} ${markerOf(night, c.id)}`;
}

/**
 * Pure: `text` with `line` at the end of the `heading` section (the heading
 * appended at the end when absent), or null when `marker` is already there.
 * `title` opens a file that does not exist yet (`text` null).
 */
export function appendUnder(text: string | null, heading: string, line: string, marker: string, title: string): string | null {
  if (text !== null && text.includes(marker)) return null;
  const eol = text?.includes("\r\n") === true ? "\r\n" : "\n";
  const lines = text === null ? [title, ""] : text.split(/\r?\n/);
  // A trailing newline splits into a last empty string; it is put back at the end.
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const at = lines.findIndex((l) => l.trim() === heading);
  if (at < 0) {
    while (lines.length > 0 && lines[lines.length - 1]?.trim() === "") lines.pop();
    lines.push("", heading, "", line);
    return `${lines.join(eol)}${eol}`;
  }
  // The section runs to the next heading of the same or a higher level.
  let end = lines.length;
  for (let i = at + 1; i < lines.length; i++) {
    if (/^#{1,2}\s/.test(lines[i] ?? "")) {
      end = i;
      break;
    }
  }
  // After the section's last non-blank line (the heading itself when the section is empty).
  let last = at;
  for (let i = at + 1; i < end; i++) if ((lines[i] ?? "").trim() !== "") last = i;
  const insert = last === at ? ["", line] : [line];
  lines.splice(last + 1, 0, ...insert);
  return `${lines.join(eol)}${eol}`;
}

async function readOrNull(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

/** Write-then-rename, so a crash leaves the old file or the new one, never half of either. */
async function writeTextAtomic(file: string, text: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, text, "utf8");
  await rename(tmp, file);
}

export type Appended = { readonly file: string; readonly rel: string; readonly wrote: boolean; readonly created: boolean };

async function appendTo(rel: string, heading: string, line: string, marker: string, title: string, o: KnowledgeOptions): Promise<Appended> {
  const root = knowledgeRoot(o);
  const file = containedIn(root, rel, false, "knowledge");
  const before = await readOrNull(file);
  const next = appendUnder(before, heading, line, marker, title);
  if (next !== null) await writeTextAtomic(file, next);
  return { file, rel, wrote: next !== null, created: before === null };
}

/** A kept finding into its step's PATTERNS.md (the muse wing: its techniques.md). */
export function appendFinding(night: NightId, c: FindingCandidate, sourceUrl: string | undefined, o: KnowledgeOptions = {}): Promise<Appended> {
  return appendTo(findingRelOf(activeWing(), c.template, c.step), FINDINGS_HEADING, findingLine(night, c, sourceUrl), markerOf(night, c.id), `# ${c.template} - ${c.step}`, o);
}

/** A kept storyboard's technique into its step's PATTERNS.md: a finding's line, under the finding's heading, with the storyboard's marker. */
export function appendTechnique(night: NightId, c: Pick<StoryboardCandidate, "id">, t: StoryboardTechnique, o: KnowledgeOptions = {}): Promise<Appended> {
  return appendFinding(night, techniqueFinding(c, t), t.url, o);
}

/** A kept watch line into the active wing's watchlist. */
export function appendWatch(night: NightId, c: WatchCandidate, o: KnowledgeOptions = {}): Promise<Appended> {
  return appendTo(watchlistRelOf(activeWing()), WATCH_HEADING, watchLine(night, c), markerOf(night, c.id), "# Scout watchlist", o);
}

/** A kept character's card, one line: `- **Name**, aged 34 - look. Plays: personality. <marker>`. */
export function characterLine(night: NightId, c: Pick<IdeaCandidate, "id" | "card">): string {
  if (c.card === undefined) throw new FoundryError(`${c.id} carries no character card.`, 400);
  return `- **${flat(c.card.name)}**, aged ${c.card.age} - ${sentence(c.card.look)} Plays: ${sentence(c.card.personality)} ${markerOf(night, c.id)}`;
}

/** A kept character idea (muse wing) into knowledge/scout-muse/characters.md. */
export function appendCharacter(night: NightId, c: Pick<IdeaCandidate, "id" | "card">, o: KnowledgeOptions = {}): Promise<Appended> {
  return appendTo(MUSE_CHARACTERS_REL, CHARACTERS_HEADING, characterLine(night, c), markerOf(night, c.id), "# Muse characters", o);
}

/** For a consequence: whether the file a line would land in exists, and whether it already holds the line. */
export async function knowledgeState(rel: string, marker: string, o: KnowledgeOptions = {}): Promise<{ readonly exists: boolean; readonly holds: boolean }> {
  const text = await readOrNull(containedIn(knowledgeRoot(o), rel, false, "knowledge"));
  return { exists: text !== null, holds: text !== null && text.includes(marker) };
}
