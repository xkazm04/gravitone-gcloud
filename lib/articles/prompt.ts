// BUILDING THE AGENT PROMPT — pipeline/ARTICLE-POST-PROMPT.md, sectioned and
// filled. Server only (it reads the file).
//
// The prompt FILE is code: it is read per call, its sha256 goes into the run's
// `promptRef`, and its slots are filled here and nowhere else. The standard is
// not in the file; it arrives through the STANDARD slot from
// lib/articles/registryRead.ts, so the prompt references the registry by address
// and never carries a copy.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { ArticleError } from "./store";
import { THRESHOLDS } from "./checks";
import type { ArticleTopic } from "./types";

export const PROMPT_FILE = "pipeline/ARTICLE-POST-PROMPT.md" as const;
/** The writer's phases. `critique` (dispositions + decision), `revise-research`
 *  and `revise` are the writer's side of the critique step (scope amendment 1);
 *  `fix` is the turn that meets the deterministic check's failures, after the
 *  draft and after each revision (2026-10-06). */
export type PromptPhase = "research" | "outline" | "draft" | "critique" | "revise-research" | "revise" | "fix";
export const PROMPT_PHASES: readonly PromptPhase[] = ["research", "outline", "draft", "critique", "revise-research", "revise", "fix"];
export const MAX_PATCHES = 3;

/** The reviewers' prompt — one section, `review`, read per call like the
 *  writer's. It inlines the same standard by address. */
export const REVIEW_PROMPT_FILE = "pipeline/ARTICLE-REVIEW-PROMPT.md" as const;

/** Split on `<!-- section: name -->` markers (the lib/sound/hunt.ts shape).
 *  Text before the first marker is the file's own header and is never sent. */
export function sectionsOf(md: string): Record<string, string> {
  const out: Record<string, string> = {};
  const marks = [...md.matchAll(/<!--\s*section:\s*([a-z-]+)\s*-->/g)];
  marks.forEach((m, i) => {
    const start = m.index! + m[0].length;
    const end = i + 1 < marks.length ? marks[i + 1].index! : md.length;
    out[m[1]] = md.slice(start, end).trim();
  });
  return out;
}

export interface PromptFile {
  sha: string;
  sections: Record<string, string>;
}

export async function loadPromptFile(root: string = process.cwd()): Promise<PromptFile> {
  let md: string;
  try {
    md = await readFile(path.join(root, PROMPT_FILE), "utf8");
  } catch {
    throw new ArticleError(`the prompt file ${PROMPT_FILE} is missing — it is part of the code`, 500, "prompt-missing");
  }
  md = md.replace(/\r\n/g, "\n");
  const sections = sectionsOf(md);
  for (const s of ["shared", ...PROMPT_PHASES]) {
    if (!sections[s]) throw new ArticleError(`${PROMPT_FILE} has no "${s}" section`, 500, "prompt-malformed");
  }
  return { sha: createHash("sha256").update(md).digest("hex"), sections };
}

export async function loadReviewPromptFile(root: string = process.cwd()): Promise<PromptFile> {
  let md: string;
  try {
    md = await readFile(path.join(root, REVIEW_PROMPT_FILE), "utf8");
  } catch {
    throw new ArticleError(`the prompt file ${REVIEW_PROMPT_FILE} is missing — it is part of the code`, 500, "prompt-missing");
  }
  md = md.replace(/\r\n/g, "\n");
  const sections = sectionsOf(md);
  if (!sections.review) throw new ArticleError(`${REVIEW_PROMPT_FILE} has no "review" section`, 500, "prompt-malformed");
  return { sha: createHash("sha256").update(md).digest("hex"), sections };
}

export interface PromptContext {
  topic: ArticleTopic;
  /** The subject's golden path when the topic is a registry subject. */
  topicMaterial?: { file: string; text: string };
  /** registryRead.standardText(...) */
  standard: string;
  standardAddress: string;
  today: string;
  /** The critique round the writer is answering (critique / revise phases). */
  round?: number;
  maxRounds?: number;
  /** The check's failures as prompt text (fix phase). */
  checkFailures?: string;
}

/** Fill `{{SLOT}}`s; an unknown slot is left standing so a probe can see it. */
export const fill = (tpl: string, slots: Record<string, string>) =>
  tpl.replace(/\{\{([A-Z_0-9]+)\}\}/g, (all, k: string) => (k in slots ? slots[k] : all));

export function promptSlots(phase: PromptPhase, ctx: PromptContext): Record<string, string> {
  const t = ctx.topic;
  return {
    PHASE: phase,
    TOPIC: t.text,
    ANGLE: t.angle ? `\nTHE ANGLE the operator asked for:\n"""\n${t.angle}\n"""` : "",
    TOPIC_MATERIAL: ctx.topicMaterial
      ? `THE TOPIC IS A REGISTRY SUBJECT (${t.bundle}/${t.subject}). Its golden path (${ctx.topicMaterial.file}) is the engineering background to think with. It contains no external facts: every fact the post states about the world comes from the research phase.\n\n"""\n${ctx.topicMaterial.text.trim()}\n"""`
      : "",
    STANDARD: ctx.standard,
    STANDARD_ADDRESS: ctx.standardAddress,
    STANDARD_BUNDLE: "technical-writing",
    TODAY: ctx.today,
    MIN_SOURCES: String(THRESHOLDS.minSources),
    MIN_PRIMARY: String(THRESHOLDS.minPrimary),
    MIN_COUNTER: String(THRESHOLDS.minCounter),
    MIN_FIGURES: String(THRESHOLDS.minFigures),
    MAX_LABEL_WORDS: String(THRESHOLDS.maxFigureLabelWords),
    MIN_BODY_1440: String(THRESHOLDS.minBodyPx1440),
    MIN_BODY_390: String(THRESHOLDS.minBodyPx390),
    MIN_CHROME: String(THRESHOLDS.minChromePx),
    READ_MIN: String(THRESHOLDS.readMinutes[0]),
    READ_MAX: String(THRESHOLDS.readMinutes[1]),
    MAX_PATCHES: String(MAX_PATCHES),
    MAX_WORDS: String(THRESHOLDS.maxWords),
    CHECK_FAILURES: ctx.checkFailures ?? "",
    ROUND: String(ctx.round ?? 1),
    MAX_ROUNDS: String(ctx.maxRounds ?? 2),
    DECISIONS:
      (ctx.round ?? 1) >= (ctx.maxRounds ?? 2)
        ? '"keep" or "rewrite" — this is the LAST round: a rewrite now is final and is not reviewed again, and "research" is not available'
        : '"keep", "rewrite" or "research" — a rewrite or a research is reviewed again in the next round',
  };
}

/** The whole prompt for one phase. Pure over its inputs. */
export function buildPrompt(file: PromptFile, phase: PromptPhase, ctx: PromptContext): string {
  const slots = promptSlots(phase, ctx);
  return `${fill(file.sections.shared, slots)}\n\n${fill(file.sections[phase], slots)}\n`;
}

export interface ReviewPromptContext {
  reviewer: string;
  model: string;
  effort: string;
  round: number;
  maxRounds: number;
  topic: ArticleTopic;
  standard: string;
  standardAddress: string;
  today: string;
  /** post/post.md as the writer wrote it. */
  postMd: string;
  /** sources.json, verbatim. */
  sourcesJson: string;
}

/** One reviewer's prompt. Pure over its inputs. */
export function buildReviewPrompt(file: PromptFile, ctx: ReviewPromptContext): string {
  const slots: Record<string, string> = {
    REVIEWER_ID: ctx.reviewer,
    REVIEWER_MODEL: ctx.model,
    REVIEWER_EFFORT: ctx.effort,
    ROUND: String(ctx.round),
    MAX_ROUNDS: String(ctx.maxRounds),
    ROUND_NOTE: ctx.round > 1 ? `This is review round ${ctx.round}: the writer has revised the post after round ${ctx.round - 1}. Review the post as it stands now, from scratch.` : "This is review round 1: the first draft.",
    TOPIC: ctx.topic.text,
    STANDARD: ctx.standard,
    STANDARD_ADDRESS: ctx.standardAddress,
    TODAY: ctx.today,
    POST_MD: ctx.postMd.trim(),
    SOURCES_JSON: ctx.sourcesJson.trim(),
    MIN_SOURCES: String(THRESHOLDS.minSources),
    MIN_FIGURES: String(THRESHOLDS.minFigures),
  };
  return `${fill(file.sections.review, slots)}\n`;
}
