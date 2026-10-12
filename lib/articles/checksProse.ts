// THE CHECK, PROSE SHAPE — how the post's prose is laid out, read from its Markdown.
//
// Split out of checks.ts (the door) for the 200-line limit. These measure the
// visual rhythm of post.md: runs of prose between visuals, one-line paragraphs,
// the words before the first section, the numbering of the Sources list and the
// list items of the closing section. They read the Markdown, not the page.

import { THRESHOLDS } from "./checks";
import { MD_IMAGE, mdProse, wordCount } from "./checksText";

/** Longest run of consecutive prose paragraphs with no visual element, over post.md before
 *  its Sources list. A visual is an image, a table, a fenced code block or a blockquote
 *  callout; headings, lists, figure captions and italic-only lines (the subtitle, a byline)
 *  neither count as prose nor end a run. Exported for the probe. */
type ProseBlock = { kind: "prose" | "visual" | "neutral"; text: string };

function proseBlocks(md: string): ProseBlock[] {
  let body = md.split(/^## Sources\b/m)[0];
  // The content preview, fenced by two horizontal rules before the first section, renders as a
  // boxed element on the page; it counts as one visual here.
  const firstH2 = body.search(/^## /m);
  const box = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*$/m.exec(body);
  if (box && (firstH2 < 0 || box.index < firstH2 + 1) && body.slice(0, box.index).split(/\r?\n/).filter((l) => /^## /.test(l)).length === 0) {
    body = `${body.slice(0, box.index)}> content preview${body.slice(box.index + box[0].length)}`;
  }
  const lines = body.split(/\r?\n/);
  type Kind = "prose" | "visual" | "neutral";
  const blocks: { kind: Kind; text: string }[] = [];
  let cur: string[] = [];
  let fence = false;
  const flush = () => {
    if (!cur.length) return;
    const text = cur.join(" ").trim();
    cur = [];
    let kind: Kind = "prose";
    if (/^#{1,6}\s/.test(text) || /^(?:---|\*\*\*)$/.test(text)) kind = "neutral";
    else if (/^!\[|^<figure\b|^<svg\b/i.test(text) || /^\|.+\|/.test(text) || text.startsWith(">")) kind = "visual";
    else if (/^(?:[-*+]|\d+[.)])\s/.test(text)) kind = "neutral";
    else if (/^\*{1,2}(?:Figure|Fig\.|Table|Diagram)\s*\d/i.test(text) || /^\*[^*][^]*\*$/.test(text) || /^_[^_][^]*_$/.test(text)) kind = "neutral";
    blocks.push({ kind, text });
  };
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      if (!fence) {
        flush();
        fence = true;
        blocks.push({ kind: "visual", text: "```" });
      } else fence = false;
      continue;
    }
    if (fence) continue;
    if (!line.trim()) flush();
    else cur.push(line.trim());
  }
  flush();
  return blocks;
}

export function proseRuns(md: string): { longest: number; runs: string[] } {
  const blocks = proseBlocks(md);
  let run = 0;
  let longest = 0;
  const runs: string[] = [];
  for (const b of blocks) {
    if (b.kind === "visual") run = 0;
    else if (b.kind === "prose") {
      run++;
      longest = Math.max(longest, run);
      if (run === 3) runs.push(b.text.slice(0, 70));
    }
  }
  return { longest, runs };
}

const SENTENCE_END = /[.!?]["')\]*_]*\s+(?=[A-Z0-9`*\[(])/g;
const plainWords = (s: string) => wordCount(s.replace(MD_IMAGE, " ").replace(/\[(\d{1,3}(?:\s*[,–-]\s*\d{1,3})*)\]/g, " "));

/** What the paragraph-count cadence rule cannot see: words of prose between visuals, and the
 *  share of the prose that is one-line paragraphs (a long paragraph split to make room for a
 *  visual shows up here, not in proseRuns). Over post.md before its Sources list. */
export function proseStats(md: string): { longestRunWords: number; runExcerpt: string; paragraphs: number; oneLiners: number; share: number } {
  const blocks = proseBlocks(md);
  let run = 0;
  let longestRunWords = 0;
  let runExcerpt = "";
  let startText = "";
  let paragraphs = 0;
  let oneLiners = 0;
  for (const b of blocks) {
    if (b.kind === "visual") {
      run = 0;
      startText = "";
    } else if (b.kind === "prose") {
      const words = plainWords(b.text);
      paragraphs++;
      if (words <= THRESHOLDS.maxPaddingWords && (b.text.match(SENTENCE_END) ?? []).length === 0) oneLiners++;
      if (!run) startText = b.text.slice(0, 60);
      run += words;
      if (run > longestRunWords) {
        longestRunWords = run;
        runExcerpt = startText;
      }
    }
  }
  return { longestRunWords, runExcerpt, paragraphs, oneLiners, share: paragraphs ? oneLiners / paragraphs : 0 };
}

/** Words before the first `## ` section: the opening and the content preview. The title, the
 *  italic subtitle or byline and the rules that fence a preview do not count. */
export function wordsBeforeFirstSection(md: string): number {
  const at = md.search(/^## /m);
  const head = (at < 0 ? md : md.slice(0, at))
    .split(/\r?\n/)
    .filter((l) => !/^#\s/.test(l) && !/^(?:---|\*\*\*)\s*$/.test(l) && !/^\s*[*_][^*_].*[*_]\s*$/.test(l))
    .join("\n");
  return plainWords(mdProse(head, {}));
}

/** The numbers of post.md's Sources list: gaps from 1 to the largest, repeats. */
export function sourceListProblems(md: string): { listed: number; gaps: number[]; repeats: number[] } {
  const at = md.search(/^## Sources\b/m);
  if (at < 0) return { listed: 0, gaps: [], repeats: [] };
  const nums = [...md.slice(at).matchAll(/^\s*(\d{1,3})\.\s/gm)].map((m) => Number(m[1]));
  const seen = new Set<number>();
  const repeats: number[] = [];
  for (const n of nums) {
    if (seen.has(n)) repeats.push(n);
    seen.add(n);
  }
  const max = Math.max(0, ...nums);
  const gaps: number[] = [];
  for (let k = 1; k <= max; k++) if (!seen.has(k)) gaps.push(k);
  return { listed: nums.length, gaps, repeats };
}

/** Word counts of the list items in the closing section (the last `## ` before Sources). */
export function closingListItemWords(md: string): number[] {
  const body = md.split(/^## Sources\b/m)[0];
  const sections = body.split(/^## /m);
  const last = sections.length > 1 ? sections[sections.length - 1] : "";
  const out: number[] = [];
  let cur: string[] | null = null;
  for (const line of last.split(/\r?\n/)) {
    if (/^\s*(?:[-*+]|\d+[.)])\s/.test(line)) {
      if (cur) out.push(plainWords(cur.join(" ")));
      cur = [line.replace(/^\s*(?:[-*+]|\d+[.)])\s/, "")];
    } else if (cur && /^\s+\S/.test(line)) cur.push(line.trim());
    else {
      if (cur) out.push(plainWords(cur.join(" ")));
      cur = null;
    }
  }
  if (cur) out.push(plainWords(cur.join(" ")));
  return out;
}
