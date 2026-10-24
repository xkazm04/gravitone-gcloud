// ONE ARTICLE SECTION AS A STRIP BRIEF - the adapter between an explainer's ARTICLE record and
// the foundry strip engine (spark explainer-real-article-strips WP-B). Server only (it reads the
// prompt addendum from pipeline/), pure but for that read.
//
// A foundry card is an approach x a brief (pipeline/strips/data/<case>.json: `case, title, beat,
// steps, facts, countable, notes`). An explainer has no hand-researched brief per card; it has the
// article it adopted, cut into sections. So a section IS the brief, with two honest differences
// from a data/ brief, both said in its `notes` so the author turn reads them:
//
//   facts   are the section's own sentences, markdown stripped, each sourced to the section
//           (`article section <id>`). Images, fenced code and table rows are DROPPED, never
//           paraphrased: a code listing is not a sentence a strip may label a step with, and the
//           contract allows on-screen labels from `steps` and `facts` only (CONTRACT.md, edu).
//   steps   are EMPTY. A data/ brief's steps were written by whoever researched it; here the turn
//           derives 3-6 causal steps from the facts (the addendum, pipeline/STRIP-EXPLAINER-PROMPT.md,
//           tells it to), because the section's argument is the article's and only a reader of
//           the whole section can order it. A brief with invented steps would put words on the
//           screen the article never said.
//
// THE CAPTION is the card's narration: the voice part speaks it (lib/cut/explainer.ts `linesOf`,
// `line-<cardId>`). The author turn writes it beside the strip (out/caption.json) so no second
// model call is bought; its door is here, so the turn's lint and the regression read one rule.
// A dry job has no turn, so its stand-in caption is the section's first sentences cut to the
// same ceiling - the section's own words, never a placeholder sentence.

import { readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { parseJsonAt } from "@gt/domain/door";
import { AppError } from "@gt/domain/errors";

import { words } from "../../cut/explainer";

/** One section as the ARTICLE record holds it (packages/domain/src/steps/parts.ts ARTICLE). */
export type ArticleSection = { readonly id: string; readonly heading: string; readonly body: string };

/** The narration's bounds: about 12-24 s at the 2.5 words a second the cut paces a line by. */
export const CAPTION_WORDS = { min: 30, max: 60 } as const;
/** How many causal steps the turn derives from the facts. */
export const DERIVED_STEPS = { min: 3, max: 6 } as const;

/** The file the author turn writes the caption to, inside its workspace's out/. */
export const CAPTION_FILE = "caption.json";
/** The prompt addendum's home: a prompt is code (CLAUDE.md), read here, pinned by its regression. */
export const ADDENDUM_FILE = path.join("pipeline", "STRIP-EXPLAINER-PROMPT.md");

export const caseOf = (sectionId: string): string => `explainer-${sectionId}`;

export type SectionFact = { readonly text: string; readonly source: string; readonly publisher?: string };
export type SectionBrief = {
  readonly case: string;
  readonly title: string;
  readonly beat: string;
  readonly steps: readonly string[];
  readonly facts: readonly SectionFact[];
  readonly countable: readonly string[];
  readonly notes: string;
};

/* ── markdown to sentences ─────────────────────────────────────────────── */

const FENCE_RE = /^\s*(```|~~~)/;
const IMAGE_LINE_RE = /^\s*!\[[^\]]*\]\([^)]*\)\s*$/;
const TABLE_RE = /^\s*\|/;
/** A line that opens its own block: a heading, a list item, a quote. */
const OPENS_RE = /^\s*(#{1,6}\s|[-*+]\s|\d+[.)]\s|>)/;

/** The section's prose blocks: fenced code, image lines and table rows dropped; a blank line, a
 *  heading or a list item ends a block. */
export function blocksOf(md: string): string[] {
  const out: string[] = [];
  let cur: string[] = [];
  let fence: string | null = null;
  const flush = (): void => {
    if (cur.length > 0) out.push(cur.join(" "));
    cur = [];
  };
  for (const line of md.split(/\r?\n/)) {
    const f = FENCE_RE.exec(line);
    if (fence !== null) {
      if (f !== null && f[1] === fence) fence = null;
      continue;
    }
    if (f !== null) {
      flush();
      fence = f[1] ?? "```";
      continue;
    }
    if (line.trim() === "" || TABLE_RE.test(line) || IMAGE_LINE_RE.test(line)) {
      flush();
      continue;
    }
    if (OPENS_RE.test(line)) flush();
    cur.push(line.trim());
  }
  flush();
  return out;
}

/** One block as plain text: images gone, links their text, inline code its text, emphasis and
 *  block markers removed, whitespace collapsed. */
export function plainOf(block: string): string {
  return block
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/^\s*(#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s?)/, "")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])/g, "$1")
    .replace(/(?<![\w_])_(?!\s)(.+?)(?<!\s)_(?![\w_])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** The section's sentences, in order. A heading or a list item without a full stop is one. */
export function sentencesOf(md: string): string[] {
  return blocksOf(md)
    .map(plainOf)
    .filter((b) => b !== "")
    .flatMap((b) => b.split(/(?<=[.!?])\s+(?=["“‘(]?[A-Z0-9])/))
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

/* ── the brief ─────────────────────────────────────────────────────────── */

export function sectionBrief(sec: ArticleSection, articleTitle: string | null): SectionBrief {
  const sentences = sentencesOf(sec.body);
  const source = `article section ${sec.id}`;
  const of = articleTitle === null || articleTitle.trim() === "" ? "the explainer's article" : `the article "${articleTitle}"`;
  return {
    case: caseOf(sec.id),
    title: sec.heading,
    beat: sentences[0] ?? sec.heading,
    steps: [],
    facts: sentences.map((text): SectionFact => ({ text, source, ...(articleTitle === null ? {} : { publisher: articleTitle }) })),
    countable: [],
    notes:
      `This strip explains ONE section of ${of}: "${sec.heading}" (section ${sec.id}). ` +
      `The facts are that section's own sentences; images, code listings and tables were left out. ` +
      `steps is empty on purpose: derive ${DERIVED_STEPS.min}-${DERIVED_STEPS.max} causal steps from the facts, as the prompt's explainer section says.`,
  };
}

/** A dry card's caption: the section's first sentences while they fit the ceiling, else the
 *  first sentence cut to it; the heading when the section has no prose at all. */
export function standInCaption(sec: ArticleSection): string {
  const out: string[] = [];
  let n = 0;
  for (const s of sentencesOf(sec.body)) {
    const w = words(s);
    if (n + w > CAPTION_WORDS.max) {
      if (out.length === 0) return s.split(/\s+/).slice(0, CAPTION_WORDS.max).join(" ");
      break;
    }
    out.push(s);
    n += w;
  }
  return out.length > 0 ? out.join(" ") : sec.heading;
}

/* ── the caption's door ────────────────────────────────────────────────── */

const captionSchema = z.strictObject({ caption: z.string().trim().min(1) });

/** Markdown a spoken line cannot carry: emphasis, code, links, headings, list markers. */
const MARKDOWN_RE = /(\*\*|__|`|\[[^\]]*\]\(|^#{1,6}\s|^\s*[-*+]\s)/m;
/** A line that points at the picture instead of saying the thing: narration is heard, not read. */
const POINTING_RE = /\b(figure|fig\.|diagram (above|below)|(shown|see) (above|below)|on (the )?screen)\b/i;

export type CaptionRead = { readonly caption?: string; readonly findings: readonly string[] };

/** What the turn wrote to out/caption.json, through its door: the caption, or every reason it is
 *  refused (a finding is a lint error: the fix round is shown it and redoes the caption). */
export function captionOf(json: string | undefined): CaptionRead {
  if (json === undefined) return { findings: [`caption: out/${CAPTION_FILE} was not written`] };
  const p = parseJsonAt("strip caption", captionSchema, json);
  if (!p.ok) return { findings: [`caption: ${p.error.message}`] };
  const caption = p.value.caption.replace(/\s+/g, " ");
  const findings: string[] = [];
  const n = words(caption);
  if (n < CAPTION_WORDS.min || n > CAPTION_WORDS.max) findings.push(`caption: ${n} words, the bar is ${CAPTION_WORDS.min}-${CAPTION_WORDS.max}`);
  if (MARKDOWN_RE.test(caption)) findings.push("caption: carries markdown; it is spoken, so plain sentences only");
  const pointing = POINTING_RE.exec(caption);
  if (pointing !== null) findings.push(`caption: points at the picture ("${pointing[0]}"); say the thing instead`);
  return { caption, findings };
}

/* ── the prompt addendum ───────────────────────────────────────────────── */

// A checkout under core.autocrlf hands the prompt over with CRLF line ends; every reader of it
// (the worked-example blocks, the stage lines, the model) expects LF, so line ends are normalised
// first. Measured 2026-10-24: on a CRLF checkout the voice-fx regression found 0 worked examples.
export const stripComments = (md: string): string => md.replace(/\r\n?/g, "\n").replace(/<!--[\s\S]*?-->/g, "").trim();

/** The explainer section appended to the author and fix prompts (author.ts `prepareTurn`). */
export async function explainerAddendum(root: string = process.cwd()): Promise<string> {
  try {
    return stripComments(await readFile(path.join(root, ADDENDUM_FILE), "utf8"));
  } catch {
    throw new AppError("unavailable", `the prompt file ${ADDENDUM_FILE.replace(/\\/g, "/")} is missing - it is part of the code`);
  }
}

/** A prepared prompt with the addendum after it: the contract's rules stand, this section adds. */
export const withAddendum = (prompt: string, addendum: string): string => `${prompt}\n\n${addendum}`;
