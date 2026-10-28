import { readFile } from "node:fs/promises";

import { containedIn } from "../runStore";
import { keptCharacters, type KeptCharacter, type RootedNight } from "./characters";
import { alreadyDrawn } from "./ideaRepeat";
import { CHARACTERS_HEADING, FINDINGS_HEADING, MUSE_TECHNIQUES_REL, knowledgeRoot, type KnowledgeOptions } from "./knowledge";

// THE CHARACTER SECTIONS OF THE ONE TASTE BRIEF (spark scout-vision S3; until then the muse wing's own brief, spark
// scout-muse). The wings merged: every night reads one brief, and the characters join it from both roots - the scout
// nights and the muse ARCHIVE - read here, never written:
//
//   ## Kept characters      keptCharacters over both roots, one line each: name, age, look, audience and kind, and whether
//                           her reference sheet is kept (a cast brief restates her card verbatim, ./characters.ts)
//   ## Technique findings   knowledge/scout-muse/techniques.md's `## Scout findings`, read as legacy (a new night's
//                           findings land in the scout homes, ./knowledge.ts)
//   ## Already drawn        every character idea of both roots (./ideaRepeat.ts alreadyDrawn): the names the next author
//                           must not draw again unless she was kept
//
// knowledge/scout-muse/characters.md stays the file a keep appends to (./knowledge.ts appendCharacter); the brief reads the
// nights instead, where her sheet and her newest card are.

/** The brief's name for techniques.md's `## Scout findings`: in taste.md they are the character craft, not a template's. */
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

const flat = (s: string): string => s.replace(/\s+/g, " ").trim().replace(/\.$/, "");

/** One kept character: `- Mara Venn, aged 34 - auburn bob · adult · original · sheet kept (2026-10-26/c-04)`. A muse card reads as an original adult. */
export function keptCharacterLine(k: KeptCharacter): string {
  const c = k.card;
  const kind = c.kind === "parody" && c.origin !== undefined ? `parody of ${flat(c.origin)}` : (c.kind ?? "original");
  const sheet = k.sheet === undefined ? "no sheet yet" : `sheet kept (${k.sheet.ref})`;
  return `- ${flat(c.name)}, aged ${c.age} - ${flat(c.look)} · ${c.audience ?? "adult"} · ${kind}${c.render === undefined ? "" : ` · ${c.render}`} · ${sheet} · last kept ${k.portrait.ref}`;
}

/** `## Kept characters`, `## Technique findings` and `## Already drawn`, each `none yet` when empty. */
export async function characterSections(nights: readonly RootedNight[], o: KnowledgeOptions = {}): Promise<string[]> {
  const kept = keptCharacters(nights).map(keptCharacterLine);
  const found = linesUnder(await readOrNull(MUSE_TECHNIQUES_REL, o), FINDINGS_HEADING);
  return [
    CHARACTERS_HEADING,
    "",
    ...(kept.length === 0 ? [NONE_YET] : kept),
    "",
    MUSE_FINDINGS_HEADING,
    "",
    ...(found.length === 0 ? [NONE_YET] : found),
    "",
    ...alreadyDrawn(nights.map((r) => r.night)),
  ];
}
