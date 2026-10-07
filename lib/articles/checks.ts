// THE CHECK — deterministic measurements of a drafted post. Server only.
//
// No model judges anything here: every item is a count, a regex or a computed
// style read out of a real browser, and every item says what it measured and
// the bar it was held to. The owner's seven dimensions are the frame; five of
// them can be measured in part, and `storytelling` and `depth` cannot — those
// are reported as NOT MEASURED, never as passed, because a green row nobody
// measured reads exactly like a green row somebody did.
//
// The `critique` item (dimension truth, lib/articles/critique.ts) reads the
// critique's files: at least the quorum of reviewers completed every round, and
// every blocker factual finding has a disposition with a reason.
//
// A failed item does not stop the run. The report is shown at the human gate,
// failures first, and the human decides. (The registry's own publications gate
// re-checks the mechanical rules at landing, and that one does block.)
//
// RENDERED MEASUREMENTS use the repo's Playwright (already a dependency; the
// browser lane and lib/musicVideoExport.ts use it). The page is opened from
// disk with every http(s) request aborted and counted, at 390 and 1440 px.
// When no browser can be launched, those items are `not-measured` with the
// reason — the static items still stand.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { critiqueCheckItem, readCritiqueDetail } from "./critique";
import type { CheckDimension, CheckItem, CheckReport, Claim, Source } from "./types";
import { CHECK_DIMENSIONS } from "./types";

/** The bars. One table, read by the checks AND by the prompt (lib/articles/
 *  prompt.ts fills the prompt's numbers from here), so the agent is asked for
 *  exactly what it will be measured against. The source floor matches the
 *  registry publications gate (ai-registry docs/publications-lane.md). */
export const THRESHOLDS = {
  minSources: 8,
  minPrimary: 3,
  minCounter: 1,
  minFigures: 5,
  maxFigureLabelWords: 12,
  minBodyPx1440: 18,
  minBodyPx390: 17,
  minChromePx: 13,
  readMinutes: [8, 14] as [number, number],
  wordsPerMinute: 230,
  /** The hard ceiling on the post's words as `postWords` counts them (prose, table cells and
   *  captions; not code, images or Sources). The outline budgets the writer to about
   *  `readMinutes[1]` minutes; this is the line a post may not cross at all. Set 2026-10-06
   *  above the longest accepted post (6,942 on the first run) and below runaway growth: the
   *  second run drifted to 6,497 raw words after accepting 94 of 98 findings. */
  maxWords: 7000,
  /** Words before the first `## ` section of post.md, the content preview included (title,
   *  subtitle and byline excluded). The owner's skim readers read the opening and the ending.
   *  Calibrated 2026-10-07 on the eight posts of the first three days: 316 to 642 words, the
   *  five over 450 being the ones the reflections called a wall before the first section. */
  maxWordsBeforeFirstSection: 450,
  /** Words of consecutive prose between two visuals. The paragraph-count cadence rule is met by
   *  splitting a paragraph; this one is not. The same eight posts ran 190 to 364 words between
   *  visuals; 300 catches the two longest. */
  maxProseRunWords: 300,
  /** A prose paragraph of at most `maxPaddingWords` words in one sentence is a one-liner; no more
   *  than this share of the prose may be one-liners (one overnight post had 46 percent). */
  maxPaddingWords: 40,
  maxPaddingShare: 0.3,
  /** Words in one list item of the closing section. */
  maxClosingListItemWords: 50,
} as const;

/* ── text helpers ──────────────────────────────────────────────────────────── */

const decode = (s: string) =>
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

const ISO_DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

/* ── the static items ──────────────────────────────────────────────────────── */

export interface StaticInput {
  html?: string;
  md?: string;
  sources: Source[];
  claims: Claim[];
  /** post/figures/* — name and SVG text. */
  figures: { name: string; svg: string }[];
  /** Every file under post/, post-relative with forward slashes. */
  postFiles: Set<string>;
}

const item = (dimension: CheckDimension, id: string, label: string, pass: boolean, extra: Partial<CheckItem> = {}): CheckItem => ({
  id,
  dimension,
  label,
  status: pass ? "pass" : "fail",
  ...extra,
});

const absent = (dimension: CheckDimension, id: string, label: string, why: string): CheckItem => ({
  id,
  dimension,
  label,
  status: "not-measured",
  detail: [why],
});

/** A reading time, a word count at a reading speed, or the speed itself. The owner's rule
 *  (2026-10-06): a post never states its own length; Medium shows one. */
export const STATED_READ_TIME = /\b\d+\s*(?:-|–)?\s*min(?:ute)?s?\s+read\b|\bwords?\s+(?:a|per)\s+minute\b|\bwpm\b|\bread(?:ing)?\s+time\b/i;

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

export function staticItems(input: StaticInput): CheckItem[] {
  const { html, md, sources, claims, figures, postFiles } = input;
  const items: CheckItem[] = [];
  const nums = new Set(sources.map((s) => s.n));

  // ── structure
  if (html) {
    const at = html.search(/data-role=["']content-preview["']/i);
    const firstH2 = html.search(/<h2\b/i);
    if (at < 0) items.push(item("structure", "content-preview", "Content preview present", false, { value: "none", expected: 'an element with data-role="content-preview" before the first <h2>' }));
    else {
      const block = html.slice(at, firstH2 > at ? firstH2 : at + 6000);
      const readTime = STATED_READ_TIME.exec(htmlProse(`<x ${block}`));
      const entries = (block.match(/<li\b/gi) ?? []).length;
      const problems = [
        ...(firstH2 >= 0 && at > firstH2 ? ["it comes after the first <h2>"] : []),
        ...(readTime ? [`it states a read time ("${readTime[0]}"); the platform shows its own`] : []),
        ...(entries >= 3 ? [] : [`lists ${entries} sections (≥ 3)`]),
      ];
      items.push(item("structure", "content-preview", "Content preview present", !problems.length, { value: problems.length ? "incomplete" : `${entries} sections`, expected: "before the first <h2>, ≥ 3 sections, no stated read time", ...(problems.length ? { detail: problems } : {}) }));
    }
  } else items.push(absent("structure", "content-preview", "Content preview present", "post/index.html is missing"));

  if (html || md) {
    const hay = `${html ? htmlProse(html) : ""}\n${md ? mdProse(md, { dropSources: true }) : ""}`;
    const hits = [...new Set([...hay.matchAll(new RegExp(STATED_READ_TIME.source, "gi"))].map((m) => m[0]))];
    items.push(item("structure", "read-time", "No stated reading time", !hits.length, { value: hits.length, expected: "0 (the platform shows its own read time)", ...(hits.length ? { detail: hits.slice(0, 6) } : {}) }));
  }

  const corpus = `${html ? htmlProse(html) : ""}\n${md ?? ""}`;
  const placeholders = [...corpus.matchAll(/lorem ipsum|\[(?:insert|placeholder|tbd|todo)[^\]]*\]|\bTODO\b|\bTBD\b/gi)].map((m) => m[0]);
  items.push(item("structure", "no-placeholders", "No placeholders", !placeholders.length, { value: placeholders.length, expected: "0", ...(placeholders.length ? { detail: [...new Set(placeholders)].slice(0, 10) } : {}) }));

  // ── figures
  if (html) {
    const blocks = [...html.matchAll(/<figure\b[\s\S]*?<\/figure>/gi)].map((m) => m[0]);
    items.push(item("figures", "figure-count", "Figures", blocks.length >= THRESHOLDS.minFigures, { value: blocks.length, expected: `≥ ${THRESHOLDS.minFigures}` }));
    const uncaptioned: string[] = [];
    const unsourced: string[] = [];
    const missingFiles: string[] = [];
    blocks.forEach((b, i) => {
      const cap = /<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i.exec(b);
      const capText = cap ? htmlProse(cap[1]) : "";
      if (!capText) uncaptioned.push(`figure ${i + 1}`);
      else {
        const cited = citedNumbers(capText);
        if (!cited.length || cited.some((n) => !nums.has(n))) unsourced.push(`figure ${i + 1}: ${capText.slice(0, 80)}`);
      }
      for (const m of b.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
        const src = m[1];
        if (/^[a-z]+:/i.test(src) || !postFiles.has(path.posix.normalize(src.replace(/^\.\//, "")))) missingFiles.push(src);
      }
    });
    items.push(item("figures", "figure-captions", "Every figure captioned", !uncaptioned.length && blocks.length > 0, { value: `${blocks.length - uncaptioned.length}/${blocks.length}`, expected: "all", ...(uncaptioned.length ? { detail: uncaptioned } : {}) }));
    items.push(item("figures", "figure-caption-sources", "Captions name their sources", !unsourced.length && blocks.length > 0, { value: `${blocks.length - unsourced.length}/${blocks.length}`, expected: "every caption cites a source that exists", ...(unsourced.length ? { detail: unsourced } : {}) }));
    items.push(item("figures", "figure-files", "Figure images resolve inside the post", !missingFiles.length, { value: missingFiles.length, expected: "0 missing", ...(missingFiles.length ? { detail: missingFiles } : {}) }));
  } else items.push(absent("figures", "figure-count", "Figures", "post/index.html is missing"));

  if (figures.length) {
    let worst = 0;
    const long: string[] = [];
    for (const f of figures) {
      for (const m of f.svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/gi)) {
        const words = wordCount(decode(m[1].replace(/<[^>]+>/g, " ")));
        worst = Math.max(worst, words);
        if (words > THRESHOLDS.maxFigureLabelWords) long.push(`${f.name}: ${words} words`);
      }
    }
    items.push(item("figures", "figure-label-length", "Text inside figures is label-length", !long.length, { value: `longest ${worst} words`, expected: `≤ ${THRESHOLDS.maxFigureLabelWords} words per text run`, ...(long.length ? { detail: long.slice(0, 10) } : {}) }));
  }

  if (md) {
    const { longest, runs } = proseRuns(md);
    items.push(item("figures", "visual-cadence", "A visual at least after every second paragraph", longest <= 2, { value: `longest run ${longest} prose paragraphs`, expected: "≤ 2 consecutive prose paragraphs without a figure, table, code block or callout", ...(runs.length ? { detail: runs.slice(0, 12).map((r) => `run of 3+ reaching: "${r}"`) } : {}) }));
    const body = md.split(/^## Sources\b/m)[0];
    const sections = body.split(/^## /m);
    const last = sections.length > 1 ? sections[sections.length - 1] : body;
    const hasTable = /^\|.+\|\s*$\n^\|\s*:?-{2,}/m.test(last);
    const words = postWords(md);
    const stats = proseStats(md);
    items.push(item("figures", "prose-run-words", "No long stretch of prose between visuals", stats.longestRunWords <= THRESHOLDS.maxProseRunWords, { value: `longest ${stats.longestRunWords} words`, expected: `≤ ${THRESHOLDS.maxProseRunWords} words of prose between two visuals (counted in words so that splitting a paragraph does not meet it)`, ...(stats.longestRunWords > THRESHOLDS.maxProseRunWords ? { detail: [`the stretch starting at: "${stats.runExcerpt}"`] } : {}) }));
    items.push(item("figures", "padding-paragraphs", "Few one-line paragraphs", stats.share <= THRESHOLDS.maxPaddingShare, { value: `${stats.oneLiners} of ${stats.paragraphs} prose paragraphs (${Math.round(stats.share * 100)} percent)`, expected: `≤ ${Math.round(THRESHOLDS.maxPaddingShare * 100)} percent of the prose in one-sentence paragraphs of ≤ ${THRESHOLDS.maxPaddingWords} words (do not split paragraphs to make room for visuals)` }));
    const pre = wordsBeforeFirstSection(md);
    items.push(item("structure", "pre-section-words", "A short opening before the first section", pre <= THRESHOLDS.maxWordsBeforeFirstSection, { value: `${pre} words`, expected: `≤ ${THRESHOLDS.maxWordsBeforeFirstSection} words before the first section, the content preview included (one concrete incident, then the preview as one line per section)` }));
    const longItems = closingListItemWords(md).filter((n) => n > THRESHOLDS.maxClosingListItemWords);
    items.push(item("structure", "closing-list-items", "Closing list items are short", !longItems.length, { value: longItems.length ? `${longItems.length} over (longest ${Math.max(...longItems)} words)` : "all short", expected: `≤ ${THRESHOLDS.maxClosingListItemWords} words per list item in the closing section` }));
    const lp = sourceListProblems(md);
    const srcNums = sources.map((s) => s.n);
    const srcGaps: number[] = [];
    for (let k = 1; k <= Math.max(0, ...srcNums); k++) if (!srcNums.includes(k)) srcGaps.push(k);
    const numberingOk = !lp.gaps.length && !lp.repeats.length && !srcGaps.length;
    items.push(item("truth", "source-numbering", "Sources are numbered without gaps", numberingOk, { value: numberingOk ? `${lp.listed} listed` : `gaps in the list: ${lp.gaps.join(", ") || "none"}; repeats: ${lp.repeats.join(", ") || "none"}; gaps in sources.json: ${srcGaps.join(", ") || "none"}`, expected: "post.md's Sources list and sources.json numbered 1 to N with no number missing or repeated (renumber the citations when a source is dropped)" }));
    items.push(item("structure", "length-ceiling", "The post stays under its word ceiling", words <= THRESHOLDS.maxWords, { value: `${words} words`, expected: `≤ ${THRESHOLDS.maxWords} words (replacement, not addition: cut or tighten before adding)` }));
    items.push(item("structure", "closing-table", "The close carries a summary table", hasTable, { value: hasTable ? "table present" : "none", expected: "a Markdown table in the last section before Sources (skim readers read the opening and the ending)" }));
  }

  // ── voice
  const fp = [
    ...(md ? firstPersonHits(mdProse(md, { dropQuotes: true, dropSources: true })) : []),
    ...(html ? firstPersonHits(htmlProse(html, { dropQuotes: true })) : []),
  ];
  if (md || html) items.push(item("voice", "first-person", "No first person in prose", !fp.length, { value: fp.length, expected: "0", ...(fp.length ? { detail: fp.slice(0, 12) } : {}) }));
  if (md || html) {
    const where: string[] = [];
    const scan = (label: string, text: string) => {
      const n = (text.match(/[\u2014\u2013]/g) ?? []).length;
      if (n) where.push(`${label}: ${n}`);
    };
    scan("post.md", md ?? "");
    scan("index.html", html ?? "");
    for (const f of figures) scan(f.name, f.svg);
    items.push(item("voice", "no-em-dash", "No em or en dash", !where.length, { value: where.length ? where.join(", ") : 0, expected: "0 (house rule: ranges use \"to\"; use a period, comma, colon or parentheses)", ...(where.length ? { detail: where } : {}) }));
  }

  // ── medium fidelity (static half)
  if (html) {
    const external = [
      ...html.matchAll(/<(?:img|script|iframe|video|audio|source|embed)\b[^>]*\bsrc=["'](https?:)?\/\/[^"']*["']/gi),
      ...html.matchAll(/<link\b[^>]*\bhref=["'](https?:)?\/\/[^"']*["']/gi),
      ...html.matchAll(/@import\s+(?:url\()?["']?(https?:)?\/\//gi),
      ...html.matchAll(/url\(\s*["']?https?:\/\//gi),
    ].map((m) => m[0].slice(0, 100));
    items.push(item("medium-fidelity", "offline", "No network resources", !external.length, { value: external.length, expected: "0", ...(external.length ? { detail: external.slice(0, 10) } : {}) }));
    const pres = [...html.matchAll(/<pre\b[\s\S]*?<\/pre>/gi)].map((m) => m[0]);
    const plain = pres.filter((p) => !/<span\b[^>]*\b(class|style)=/i.test(p));
    items.push(item("medium-fidelity", "code-highlighted", "Code blocks highlighted", !plain.length, { value: `${pres.length - plain.length}/${pres.length}`, expected: "every <pre> carries highlight spans" }));
    const dark = /prefers-color-scheme\s*:\s*dark/i.test(html);
    items.push(item("medium-fidelity", "dark-mode", "Light and dark", dark, { value: dark ? "prefers-color-scheme: dark present" : "none", expected: "a dark scheme" }));
  }

  // ── truth
  const primary = sources.filter((s) => s.primary).length;
  const counter = sources.filter((s) => s.counter).length;
  items.push(item("truth", "source-count", "Sources", sources.length >= THRESHOLDS.minSources, { value: sources.length, expected: `≥ ${THRESHOLDS.minSources}` }));
  items.push(item("truth", "source-primary", "Primary sources", primary >= THRESHOLDS.minPrimary, { value: primary, expected: `≥ ${THRESHOLDS.minPrimary}` }));
  items.push(item("truth", "source-counter", "Counter-evidence", counter >= THRESHOLDS.minCounter, { value: counter, expected: `≥ ${THRESHOLDS.minCounter}` }));
  const undated = sources.filter((s) => !ISO_DATE.test(String(s.date ?? ""))).map((s) => `[${s.n}] ${s.title || s.url}: date ${JSON.stringify(s.date ?? null)}`);
  const badUrl = sources.filter((s) => !/^https?:\/\/[^\s/]+\.[^\s]+$/.test(String(s.url ?? ""))).map((s) => `[${s.n}] url ${JSON.stringify(s.url ?? null)}`);
  const dated = sources.map((s) => s.date).filter((d) => ISO_DATE.test(String(d))).sort();
  items.push(item("truth", "source-dates", "Every source dated, with a working URL shape", !undated.length && !badUrl.length && sources.length > 0, { value: dated.length ? `oldest ${dated[0]}, newest ${dated[dated.length - 1]}` : "no dates", expected: "a date and an http(s) URL on every source", ...(undated.length || badUrl.length ? { detail: [...undated, ...badUrl].slice(0, 12) } : {}) }));

  const cited = [
    ...(md ? citedNumbers(mdProse(md, { dropSources: true })) : []),
    ...(html ? citedNumbers(htmlProse(html)) : []),
  ];
  const unresolved = [...new Set(cited.filter((n) => !nums.has(n)))].sort((a, b) => a - b);
  const anchors = html ? [...html.matchAll(/href=["']#src-(\d+)["']/gi)].map((m) => Number(m[1])) : [];
  const missingTargets = html ? [...new Set(anchors)].filter((n) => !new RegExp(`id=["']src-${n}["']`).test(html)) : [];
  const uncited = sources.filter((s) => !cited.includes(s.n)).map((s) => s.n);
  if (md || html)
    items.push(
      item("truth", "citation-resolution", "Every citation resolves", cited.length > 0 && !unresolved.length && !missingTargets.length, {
        value: `${new Set(cited).size} cited of ${sources.length}`,
        expected: "every [n] names a source; every #src-n link has its target",
        ...(unresolved.length || missingTargets.length || uncited.length
          ? {
              detail: [
                ...(unresolved.length ? [`unresolved: ${unresolved.map((n) => `[${n}]`).join(" ")}`] : []),
                ...(missingTargets.length ? [`links without a target: ${missingTargets.map((n) => `#src-${n}`).join(" ")}`] : []),
                ...(uncited.length ? [`sources never cited: ${uncited.map((n) => `[${n}]`).join(" ")}`] : []),
              ],
            }
          : {}),
      }),
    );
  const orphanClaims = claims.filter((c) => !nums.has(c.source)).map((c) => `${c.text.slice(0, 80)} -> [${c.source}]`);
  items.push(item("truth", "claims-resolve", "Every research claim has its source", !orphanClaims.length, { value: `${claims.length - orphanClaims.length}/${claims.length}`, expected: "all", ...(orphanClaims.length ? { detail: orphanClaims.slice(0, 10) } : {}) }));

  return items;
}

/* ── the rendered items ────────────────────────────────────────────────────── */

/** A body paragraph is a <p> or <li> outside figure/nav/header/footer/sources
 *  chrome that carries at least this many characters — a byline or a date line
 *  is chrome however it is tagged, and a real paragraph is longer than one. */
const BODY_MIN_CHARS = 80;

/**
 * Runs in the page. A STRING, not a function: a function literal compiled by
 * tsx gains `__name(...)` helper calls that do not exist in the browser, and
 * the CLI runs under tsx.
 */
const MEASURE = `(() => {
  const EXCL = 'figure, figcaption, footer, nav, header, aside, #sources, pre, code, [data-role="content-preview"], h1, h2, h3, h4, h5, h6, blockquote';
  let body = Infinity, bodyAt = '', chrome = Infinity, chromeAt = '', bodyCount = 0;
  const all = document.body ? document.body.querySelectorAll('*') : [];
  for (const el of all) {
    let own = false;
    for (const n of el.childNodes) { if (n.nodeType === 3 && n.textContent.trim().length > 0) { own = true; break; } }
    if (!own) continue;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none') continue;
    const px = parseFloat(cs.fontSize);
    const tag = el.tagName.toLowerCase();
    const where = tag + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(/\\s+/)[0] : '');
    if (tag !== 'sup' && tag !== 'sub' && px < chrome) { chrome = px; chromeAt = where; }
    if ((tag === 'p' || tag === 'li') && !el.closest(EXCL) && el.textContent.trim().length >= ${BODY_MIN_CHARS}) {
      bodyCount++;
      if (px < body) { body = px; bodyAt = where; }
    }
  }
  return { body: isFinite(body) ? body : null, bodyAt, chrome: isFinite(chrome) ? chrome : null, chromeAt, bodyCount,
    overflow: document.documentElement.scrollWidth - window.innerWidth };
})()`;

interface Measured {
  body: number | null;
  bodyAt: string;
  chrome: number | null;
  chromeAt: string;
  bodyCount: number;
  overflow: number;
}

const RENDERED = [
  ["body-font-1440", "Body type at 1440 px"],
  ["body-font-390", "Body type at 390 px"],
  ["chrome-font", "Captions and chrome type"],
  ["no-overflow-390", "No sideways scroll at 390 px"],
  ["offline-rendered", "No network requests when rendered"],
] as const;

export async function renderedItems(postDir: string, shotDir: string): Promise<{ items: CheckItem[]; screenshots: string[] }> {
  const index = path.join(postDir, "index.html");
  const items: CheckItem[] = [];
  const screenshots: string[] = [];
  const unmeasured = (why: string) => ({
    items: RENDERED.map(([id, label]) => absent("medium-fidelity", id, label, why)),
    screenshots: [] as string[],
  });
  let browser: import("playwright").Browser | undefined;
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch();
  } catch (e) {
    return unmeasured(`no browser could be launched: ${(e as Error).message.split("\n")[0]}`);
  }
  try {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(shotDir, { recursive: true });
    const requests: string[] = [];
    const results: Record<number, Measured> = {};
    for (const width of [1440, 390]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light" });
      const page = await ctx.newPage();
      await page.route("**/*", (route) => {
        const u = route.request().url();
        if (/^https?:/i.test(u)) {
          requests.push(u);
          return route.abort();
        }
        return route.continue();
      });
      await page.goto(pathToFileURL(index).href, { waitUntil: "load" });
      results[width] = (await page.evaluate(MEASURE)) as Measured;
      const shot = path.join(shotDir, `screenshot-${width}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      screenshots.push(shot);
      if (width === 1440) {
        await page.emulateMedia({ colorScheme: "dark" });
        const dark = path.join(shotDir, `screenshot-${width}-dark.png`);
        await page.screenshot({ path: dark, fullPage: true });
        screenshots.push(dark);
      }
      await ctx.close();
    }
    const px = (v: number | null) => (v === null ? "none found" : `${v}px`);
    for (const [width, min] of [
      [1440, THRESHOLDS.minBodyPx1440],
      [390, THRESHOLDS.minBodyPx390],
    ] as const) {
      const r = results[width];
      items.push(
        item("medium-fidelity", `body-font-${width}`, `Body type at ${width} px`, r.body !== null && r.body >= min, {
          value: px(r.body),
          expected: `≥ ${min}px`,
          detail: [r.body === null ? "no body paragraphs were found" : `smallest at ${r.bodyAt} across ${r.bodyCount} paragraphs and list items`],
        }),
      );
    }
    const chrome = Math.min(results[1440].chrome ?? Infinity, results[390].chrome ?? Infinity);
    items.push(
      item("medium-fidelity", "chrome-font", "Captions and chrome type", isFinite(chrome) && chrome >= THRESHOLDS.minChromePx, {
        value: isFinite(chrome) ? `${chrome}px` : "none found",
        expected: `≥ ${THRESHOLDS.minChromePx}px`,
        detail: [`smallest at ${(results[1440].chrome ?? Infinity) <= (results[390].chrome ?? Infinity) ? `${results[1440].chromeAt} (1440)` : `${results[390].chromeAt} (390)`}`],
      }),
    );
    items.push(item("medium-fidelity", "no-overflow-390", "No sideways scroll at 390 px", results[390].overflow <= 1, { value: `${Math.max(0, results[390].overflow)}px wider than the viewport`, expected: "0px" }));
    items.push(item("medium-fidelity", "offline-rendered", "No network requests when rendered", !requests.length, { value: requests.length, expected: "0", ...(requests.length ? { detail: [...new Set(requests)].slice(0, 10) } : {}) }));
  } catch (e) {
    // A page that crashes the renderer, or a goto that times out, is a
    // measurement that could not be taken: said so, never read as a pass.
    return unmeasured(`the render failed: ${(e as Error).message.split("\n")[0]}`);
  } finally {
    await browser.close();
  }
  return { items, screenshots };
}

/* ── the report ────────────────────────────────────────────────────────────── */

export function summarize(items: CheckItem[], at: string, screenshots: string[]): CheckReport {
  const dimensions: CheckReport["dimensions"] = {};
  const notMeasured: CheckDimension[] = [];
  for (const d of CHECK_DIMENSIONS) {
    const measured = items.filter((i) => i.dimension === d && i.status !== "not-measured");
    if (!measured.length) notMeasured.push(d);
    else dimensions[d] = measured.some((i) => i.status === "fail") ? "fail" : "pass";
  }
  // failures first — the order the human gate reads them in
  const rank = { fail: 0, "not-measured": 1, pass: 2 } as const;
  const sorted = [...items].sort((a, b) => rank[a.status] - rank[b.status]);
  return { schema: "article-check/1", at, dimensions, notMeasured, items: sorted, screenshots };
}

async function readMaybe(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch {
    return undefined;
  }
}

async function walk(dir: string, rel = ""): Promise<string[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(path.join(dir, rel), { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    const child = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await walk(dir, child)));
    else out.push(child);
  }
  return out;
}

/** Check one run directory. `render: false` skips the browser (the static
 *  items still run); the rendered items are then `not-measured`. */
export async function runCheck(
  runDir: string,
  opts: { render?: boolean; now?: () => Date } = {},
): Promise<CheckReport> {
  const postDir = path.join(runDir, "post");
  const [html, md] = await Promise.all([readMaybe(path.join(postDir, "index.html")), readMaybe(path.join(postDir, "post.md"))]);
  const sources = JSON.parse((await readMaybe(path.join(runDir, "sources.json"))) ?? "[]") as Source[];
  const claims = JSON.parse((await readMaybe(path.join(runDir, "claims.json"))) ?? "[]") as Claim[];
  const postFiles = new Set(await walk(postDir));
  const figures: { name: string; svg: string }[] = [];
  for (const f of [...postFiles].filter((p) => /^figures\/[^/]+\.svg$/i.test(p)).sort()) {
    figures.push({ name: f.slice("figures/".length), svg: (await readMaybe(path.join(postDir, f))) ?? "" });
  }
  const items = staticItems({ html, md, sources, claims, figures, postFiles });
  // The multi-model critique (scope amendment 1): quorum held in every round,
  // every blocker factual finding answered with a reason.
  items.push(critiqueCheckItem(await readCritiqueDetail(runDir)));
  let screenshots: string[] = [];
  if (html && opts.render !== false) {
    const r = await renderedItems(postDir, path.join(runDir, "check"));
    items.push(...r.items);
    screenshots = r.screenshots.map((s) => path.relative(runDir, s).split(path.sep).join("/"));
  } else {
    items.push(absent("medium-fidelity", "rendered", "Rendered measurements", html ? "rendering was switched off for this check" : "post/index.html is missing"));
  }
  return summarize(items, (opts.now ?? (() => new Date()))().toISOString(), screenshots);
}
