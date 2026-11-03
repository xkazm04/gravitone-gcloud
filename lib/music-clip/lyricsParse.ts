// THE LYRICS FILE, read as structure and as lines.
//
// A Suno lyrics sheet is two things at once: a list of lines to sing, and a
// list of bracketed TAGS ([Verse 1], [Pre-Chorus], [Final Chorus]) that is the
// songwriter's own statement of the song's form. The section pass trusts the
// tags for words and the audio for times; this parser keeps both, in file
// order, and gives every sung line one stable id (L001...) so the Gemini turn,
// the snap and the boards all talk about the same line.
//
// Every non-empty, non-tag line appears exactly once. A line before the first
// tag belongs to no tag (tagIndex -1); a tag with no lines under it is kept,
// because it still marks a section (an instrumental [Break]).

import type { SectionLabel } from "./types";

export interface LyricTag {
  /** The tag text as written, without brackets: "Verse 1", "Final Chorus". */
  tag: string;
  /** The section word it names, when it names one. */
  label?: SectionLabel;
  /** Ids of the lines under it, in order. */
  lineIds: string[];
}

export interface LyricLine {
  id: string;
  text: string;
  /** Index into `tags`, -1 before the first tag. */
  tagIndex: number;
}

export interface ParsedLyrics {
  tags: LyricTag[];
  lines: LyricLine[];
}

const TAG = /^\s*\[([^\]]+)\]\s*$/;

/** The section word a tag names. Checked most specific first: "Pre-Chorus"
 *  contains "chorus" and is not one. "Final Chorus" is a chorus. */
export function tagLabel(tag: string): SectionLabel | undefined {
  const t = tag.toLowerCase().replace(/[^a-z]+/g, " ").trim();
  if (/\bpre ?chorus\b|\bprechorus\b|\bbuild ?up\b/.test(t)) return "prechorus";
  if (/\bchorus\b|\bhook\b|\brefrain\b/.test(t)) return "chorus";
  if (/\bverse\b/.test(t)) return "verse";
  if (/\bbridge\b/.test(t)) return "bridge";
  if (/\bbreakdown\b|\bbreak\b|\binstrumental\b|\bdrop\b/.test(t)) return "breakdown";
  if (/\bintro\b/.test(t)) return "intro";
  if (/\boutro\b|\bend\b|\bfade\b/.test(t)) return "outro";
  return undefined;
}

export function parseLyrics(text: string): ParsedLyrics {
  const tags: LyricTag[] = [];
  const lines: LyricLine[] = [];
  for (const rawLine of text.replace(/^﻿/, "").split(/\r?\n/)) {
    const m = TAG.exec(rawLine);
    if (m) {
      const tag = m[1].trim();
      const label = tagLabel(tag);
      tags.push(label ? { tag, label, lineIds: [] } : { tag, lineIds: [] });
      continue;
    }
    const line = rawLine.trim();
    if (line === "") continue;
    const id = `L${String(lines.length + 1).padStart(3, "0")}`;
    lines.push({ id, text: line, tagIndex: tags.length - 1 });
    tags[tags.length - 1]?.lineIds.push(id);
  }
  return { tags, lines };
}
