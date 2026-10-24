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
import type { ArticleTopic, ArticleTrialRef, TrialPrereg, TrialResults, TrialVerdict } from "./types";

export const PROMPT_FILE = "pipeline/ARTICLE-POST-PROMPT.md" as const;
/** The writer's phases. `critique` (dispositions + decision), `revise-research`
 *  and `revise` are the writer's side of the critique step (scope amendment 1);
 *  `fix` is the turn that meets the deterministic check's failures, after the
 *  draft and after each revision (2026-10-06). */
export type PromptPhase = "research" | "outline" | "draft" | "critique" | "revise-research" | "revise" | "fix";
export const PROMPT_PHASES: readonly PromptPhase[] = ["research", "outline", "draft", "critique", "revise-research", "revise", "fix"];
export const MAX_PATCHES = 3;

/** THE TRIAL SECTIONS. A run written around a trial (`run.trial`) gets one more section after
 *  its phase's: the experiment is the post's spine and the research its supplement (17 of 17
 *  classic posts disclaimed any first-hand measurement in their preview). A classic run never
 *  gets one, so what a classic prompt sends is byte for byte what it sent before trials. */
export const TRIAL_SECTIONS = ["trial-research", "trial-outline", "trial-draft", "trial-writer"] as const;
export type TrialSection = (typeof TRIAL_SECTIONS)[number];
export const TRIAL_SECTION_OF: Record<PromptPhase, TrialSection> = {
  research: "trial-research",
  outline: "trial-outline",
  draft: "trial-draft",
  critique: "trial-writer",
  "revise-research": "trial-writer",
  revise: "trial-writer",
  fix: "trial-writer",
};

/** The reviewers' prompt — one section, `review`, read per call like the
 *  writer's. It inlines the same standard by address. A trial run's reviewers
 *  also get `trial-review`, the METHOD lens. */
export const REVIEW_PROMPT_FILE = "pipeline/ARTICLE-REVIEW-PROMPT.md" as const;
export const REVIEW_TRIAL_SECTION = "trial-review" as const;

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
  for (const s of ["shared", ...PROMPT_PHASES, ...TRIAL_SECTIONS]) {
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
  for (const s of ["review", REVIEW_TRIAL_SECTION]) {
    if (!sections[s]) throw new ArticleError(`${REVIEW_PROMPT_FILE} has no "${s}" section`, 500, "prompt-malformed");
  }
  return { sha: createHash("sha256").update(md).digest("hex"), sections };
}

/* ── the trial, as prompt text ─────────────────────────────────────────────── */

/** What a prompt needs of the run's trial: the reference on the run and the three files under
 *  `<run>/experiment/` the verdict was computed from. */
export interface PromptTrial {
  ref: ArticleTrialRef;
  prereg: TrialPrereg;
  verdict: TrialVerdict;
  results: TrialResults;
}

/** `knowledge/<...>/<subject>` out of `<subject dir>/applications/<stack>--<technique>.md`. */
export function trialSubjectDir(ref: Pick<ArticleTrialRef, "applicationPath">): string {
  const p = ref.applicationPath.replace(/\\/g, "/");
  const at = p.lastIndexOf("/applications/");
  if (at <= 0 || !p.startsWith("knowledge/")) throw new Error(`run.trial.applicationPath ${JSON.stringify(ref.applicationPath)} is not <subject dir>/applications/<file>`);
  return p.slice(0, at);
}

/** `<subject dir>/techniques/<technique>.md`, from the application path the run carries (both sit
 *  beside the subject's golden path, the registry's own layout). The subject directory is
 *  `trialSubjectDir`'s, so the path the writer is shown and the scope a trial patch is held to
 *  (ingestDraft.ts `trialPatchProblem`) are read off the application path one way. */
export function trialTechniquePath(ref: Pick<ArticleTrialRef, "applicationPath" | "technique">): string {
  return `${trialSubjectDir(ref)}/techniques/${ref.technique}.md`;
}

/** A number as the files hold it, without float noise (0.30000000000000004 -> 0.3). */
const num = (x: number) => (Number.isInteger(x) ? String(x) : String(Number(x.toPrecision(6))));

/** THE TRIAL SUMMARY the `{{TRIAL}}` slot carries: rendered by code from prereg.json,
 *  verdict.json and results.json, so the writer and the reviewers read the measurement as the
 *  files hold it rather than as a model retold it. Pure. */
export function trialSummary(t: PromptTrial): string {
  const { ref, prereg: p, verdict: v, results: r } = t;
  const unit = p.metric.unit ? ` ${p.metric.unit}` : "";
  const band = p.minEffect.kind === "absolute" ? `${num(p.minEffect.value)}${unit}` : `${num(p.minEffect.value * 100)} percent of the golden arm's mean`;
  const arm = (id: string) => p.arms.find((a) => a.id === id);
  const control = (c: { id: string; statement: string }) => {
    const held = r.controls.find((x) => x.id === c.id);
    return `  - ${c.id}: ${c.statement} (${held ? `${held.held ? "held" : "NOT held"}: ${held.evidence}` : "no result recorded"})`;
  };
  const guards = (id: string) => {
    const g = r.arms.find((a) => a.id === id)?.guards ?? {};
    const kv = Object.entries(g).map(([k, x]) => `${k} ${num(x)}`);
    return kv.length ? kv.join(", ") : "none";
  };
  const rows = v.arms.map((a) => `| ${a.id} (${arm(a.id)?.label ?? a.id}) | ${a.n} | ${num(a.mean)} | ${num(a.sd)} | ${a.guardsCleared ? "cleared" : "NOT cleared"}: ${guards(a.id)} |`);
  return [
    `THE TRIAL ${ref.id}, measured first-hand before this run existed. Everything below is rendered by code from its prereg.json, results.json and verdict.json; its record is source [1].`,
    `- Subject: ${p.subject.bundle}/${p.subject.slug}. Technique under test: ${p.technique} (${trialTechniquePath(ref)}). The measurement's application record: ${ref.applicationPath}.`,
    `- Claim under test: "${p.claim}"`,
    `- Alternative: ${p.alternative.name}: ${p.alternative.description} (source: ${p.alternative.source.title}, ${p.alternative.source.date}, ${p.alternative.source.url})`,
    `- Prior, declared before the first search: ${p.prior}`,
    `- Question: ${p.question}`,
    ...p.arms.map((a) => `- Arm ${a.id}: ${a.label}: ${a.description}`),
    `- Metric, the one optimized: ${p.metric.label} (${p.metric.id}${unit ? `, in${unit}` : ""}); ${p.metric.direction} is better.`,
    `- Band, the smallest difference that counts: ${band}, resolved to ${num(v.band)}${unit}.`,
    `- Guards each arm must clear to win: ${p.thresholds.length ? p.thresholds.map((g) => `${g.label} (${g.metric} ${g.op} ${num(g.value)})`).join("; ") : "none"}.`,
    `- n per arm, also the floor: ${p.n}.`,
    `- Controls, held across both arms:`,
    ...(p.controls.length ? p.controls.map(control) : ["  - none declared"]),
    `- Verdict: ${v.verdict.toUpperCase()}. ${v.reason}`,
    `- Delta, alternative mean minus golden mean, signed so that above 0 favours the alternative: ${num(v.delta)}${unit}. Bootstrap 95 percent interval (reported, never decisive): ${v.deltaCi95 ? `${num(v.deltaCi95[0])} to ${num(v.deltaCi95[1])}${unit}` : "none"}.`,
    `- Model calls the harness made: ${r.modelCalls} of ${p.budget.modelCalls} budgeted.`,
    "",
    `| arm | n | mean | sd | guards |`,
    `|---|---|---|---|---|`,
    ...rows,
  ].join("\n");
}

/** The slots only a trial section reads. Empty for a classic run, whose sections name none. */
function trialSlots(t: PromptTrial | undefined): Record<string, string> {
  if (!t) return { TRIAL: "", TRIAL_N: "", TRIAL_VERDICT: "", TRIAL_TECHNIQUE_PATH: "", TRIAL_APPLICATION_PATH: "" };
  return {
    TRIAL: trialSummary(t),
    TRIAL_N: String(t.ref.n),
    TRIAL_VERDICT: t.verdict.verdict,
    TRIAL_TECHNIQUE_PATH: trialTechniquePath(t.ref),
    TRIAL_APPLICATION_PATH: t.ref.applicationPath,
  };
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
  /** The run's trial; absent on a classic run, whose prompt then carries no trial section. */
  trial?: PromptTrial;
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
    MAX_PRE_WORDS: String(THRESHOLDS.maxWordsBeforeFirstSection),
    MAX_RUN_WORDS: String(THRESHOLDS.maxProseRunWords),
    MAX_PADDING_WORDS: String(THRESHOLDS.maxPaddingWords),
    PADDING_PERCENT: String(Math.round(THRESHOLDS.maxPaddingShare * 100)),
    MAX_CLOSING_ITEM_WORDS: String(THRESHOLDS.maxClosingListItemWords),
    SKIM_MIN_WORDS: String(THRESHOLDS.skimMinParagraphWords),
    SKIM_SPAN_MIN: String(THRESHOLDS.skimSpanWords[0]),
    SKIM_SPAN_MAX: String(THRESHOLDS.skimSpanWords[1]),
    SKIM_MAX_PERCENT: String(Math.round(THRESHOLDS.skimMaxShare * 100)),
    CHECK_FAILURES: ctx.checkFailures ?? "",
    ROUND: String(ctx.round ?? 1),
    MAX_ROUNDS: String(ctx.maxRounds ?? 2),
    DECISIONS:
      (ctx.round ?? 1) >= (ctx.maxRounds ?? 2)
        ? '"keep" or "rewrite" — this is the LAST round: a rewrite now is final and is not reviewed again, and "research" is not available'
        : '"keep", "rewrite" or "research" — a rewrite or a research is reviewed again in the next round',
    ...trialSlots(ctx.trial),
  };
}

/** The whole prompt for one phase. Pure over its inputs. A trial run's prompt is the classic
 *  prompt with the phase's trial section appended, so the trial rules come last and win. */
export function buildPrompt(file: PromptFile, phase: PromptPhase, ctx: PromptContext): string {
  const slots = promptSlots(phase, ctx);
  const base = `${fill(file.sections.shared, slots)}\n\n${fill(file.sections[phase], slots)}\n`;
  return ctx.trial ? `${base}\n${fill(file.sections[TRIAL_SECTION_OF[phase]], slots)}\n` : base;
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
  /** The run's trial: the review then also carries the METHOD lens. */
  trial?: PromptTrial;
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
    MAX_PRE_WORDS: String(THRESHOLDS.maxWordsBeforeFirstSection),
    MAX_RUN_WORDS: String(THRESHOLDS.maxProseRunWords),
    MAX_CLOSING_ITEM_WORDS: String(THRESHOLDS.maxClosingListItemWords),
    ...trialSlots(ctx.trial),
  };
  const base = `${fill(file.sections.review, slots)}\n`;
  return ctx.trial ? `${base}\n${fill(file.sections[REVIEW_TRIAL_SECTION], slots)}\n` : base;
}
