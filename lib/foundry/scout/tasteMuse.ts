import { readFile } from "node:fs/promises";

import { containedIn } from "../runStore";
import { CHARACTERS_HEADING, FINDINGS_HEADING, MUSE_CHARACTERS_REL, MUSE_TECHNIQUES_REL, knowledgeRoot, type KnowledgeOptions } from "./knowledge";

// THE MUSE WING'S OWN TASTE (spark scout-muse): what its brief reads besides the nights. The nights
// teach a verdict per still; the knowledge files hold what outlived one night - the characters the
// operator kept (each card is restated verbatim when she is drawn again, so the brief carries the card
// whole) and the technique findings kept into techniques.md. Read here, never written: the Board's
// apply is the only writer (./knowledge.ts).

/** The brief's name for techniques.md's `## Scout findings`: in taste.md they are the muse's craft, not the scout's. */
export const MUSE_FINDINGS_HEADING = "## Technique findings";
const NONE_YET = "- none yet";

/** The non-blank lines of `text` under `heading`, verbatim, up to the next `#` or `##` heading. */
export function linesUnder(text: string | null, heading: string): string[] {
  if (text === null) return [];
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((l) => l.trim() === heading);
  if (at < 0) return [];
  const out: string[] = [];
  for (const l of lines.slice(at + 1)) {
    if (/^#{1,2}\s/.test(l)) break;
    if (l.trim() !== "") out.push(l);
  }
  return out;
}

async function readOrNull(rel: string, o: KnowledgeOptions): Promise<string | null> {
  try {
    return await readFile(containedIn(knowledgeRoot(o), rel, false, "knowledge"), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

/** `## Kept characters` (characters.md) and `## Technique findings` (techniques.md's `## Scout findings`); `none yet` when absent. */
export async function museSections(o: KnowledgeOptions = {}): Promise<string[]> {
  const kept = linesUnder(await readOrNull(MUSE_CHARACTERS_REL, o), CHARACTERS_HEADING);
  const found = linesUnder(await readOrNull(MUSE_TECHNIQUES_REL, o), FINDINGS_HEADING);
  return [CHARACTERS_HEADING, "", ...(kept.length === 0 ? [NONE_YET] : kept), "", MUSE_FINDINGS_HEADING, "", ...(found.length === 0 ? [NONE_YET] : found), ""];
}
