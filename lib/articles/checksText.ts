// THE CHECK, TEXT HELPERS — pure string readers for the article check.
//
// Split out of checks.ts (the door) so that file stays under the 200-line limit.
// Everything here takes a string and returns a string, a count or a list: no
// page, no file, no browser. decode, htmlProse and mdProse turn the post's HTML
// or Markdown into the prose a reader reads; the rest count words, find
// first-person words and cited source numbers, and hold the reading-time
// pattern and the ISO date shape that the static checks test against.

/* ── text helpers ──────────────────────────────────────────────────────────── */

export const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)));

/** The prose of an HTML page: no scripts, styles, code, SVG or tags. */
export function htmlProse(html: string, opts: { dropQuotes?: boolean } = {}): string {
  let s = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|pre|code|svg|template)\b[\s\S]*?<\/\1>/gi, " ");
  if (opts.dropQuotes) s = s.replace(/<(blockquote|q)\b[\s\S]*?<\/\1>/gi, " ");
  return decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/** The prose of a Markdown post: no fenced or inline code, optionally no
 *  blockquotes; the trailing Sources section dropped. */
export function mdProse(md: string, opts: { dropQuotes?: boolean; dropSources?: boolean } = {}): string {
  let s = md.replace(/\r\n/g, "\n").replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1\s*$/gm, " ").replace(/`[^`\n]*`/g, " ");
  if (opts.dropSources) s = s.replace(/^#{1,3}\s+Sources\b[\s\S]*$/im, " ");
  if (opts.dropQuotes) s = s.replace(/^>.*$/gm, " ");
  return s;
}

const dropQuoted = (s: string) => s.replace(/“[^”]*”/g, " ").replace(/"[^"\n]*"/g, " ").replace(/«[^»]*»/g, " ");

const FIRST_PERSON = /\b(I|me|my|mine|myself|we|us|our|ours|ourselves)\b/gi;

/** First-person words in prose, with a little context each. "I" counts only
 *  as a capital standing alone (not "I/O"); "US" in capitals is the country. */
export function firstPersonHits(prose: string): string[] {
  const text = dropQuoted(prose).replace(/https?:\/\/\S+/g, " ");
  const hits: string[] = [];
  for (const m of text.matchAll(FIRST_PERSON)) {
    const w = m[0];
    const i = m.index!;
    if (w.toLowerCase() === "i" && (w !== "I" || /^[/\-.]/.test(text.slice(i + 1, i + 2)))) continue;
    if (w === "US") continue;
    hits.push(`…${text.slice(Math.max(0, i - 30), i + w.length + 30).replace(/\s+/g, " ").trim()}…`);
  }
  return hits;
}

/** Every number cited as `[n]`, `[n, m]` or `[n–m]`. */
export function citedNumbers(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/\[(\d{1,3}(?:\s*[,–-]\s*\d{1,3})*)\]/g)) {
    for (const part of m[1].split(/\s*,\s*/)) {
      const r = /^(\d+)\s*[–-]\s*(\d+)$/.exec(part);
      if (r) {
        const a = Number(r[1]);
        const b = Number(r[2]);
        for (let k = Math.min(a, b); k <= Math.max(a, b) && k - a < 50; k++) out.push(k);
      } else out.push(Number(part));
    }
  }
  return out;
}

export const wordCount = (s: string) => (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;

/** A Markdown image, alt text allowed one level of brackets (a caption's [n]). */
export const MD_IMAGE = /!\[(?:[^[\]]|\[[^\]]*\])*\]\([^)]*\)/g;

/** The words a reader reads: the post's prose without code, images or the
 *  Sources list. The read-time check and publication.json both count this. */
export const postWords = (md: string) => wordCount(mdProse(md, { dropSources: true }).replace(MD_IMAGE, " "));

export const ISO_DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

/** A reading time, a word count at a reading speed, or the speed itself. The owner's rule
 *  (2026-10-06): a post never states its own length; Medium shows one. */
export const STATED_READ_TIME = /\b\d+\s*(?:-|–)?\s*min(?:ute)?s?\s+read\b|\bwords?\s+(?:a|per)\s+minute\b|\bwpm\b|\bread(?:ing)?\s+time\b/i;
