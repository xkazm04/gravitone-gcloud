// THE CRITIQUE'S RECORD — the reviewer panel, the validation of everything a
// model hands back, and the reading of a run's critique/ files. Server only.
//
// Scope amendment 1 (operator, 2026-10-05): once the first draft exists, models
// from every provider the operator has a login for review it, blind to each
// other; the WRITER reads every review, records a disposition for every
// finding, and decides keep | rewrite | research. At most two review rounds.
// lib/articles/engine.ts drives that; this file is what it reads and checks:
//
//   pipeline/article-reviewers.json     the panel (ARTICLES_REVIEWERS_FILE overrides)
//   critique/reviewers.json             the panel as the run snapshotted it
//   critique/round-<n>/receipts/<id>.json   what happened to each reviewer
//   critique/round-<n>/reviews/<id>.json    a validated review (completed only)
//   critique/round-<n>/closed.json          the round reached quorum
//   critique/round-<n>/dispositions.json    the writer, one per finding
//   critique/round-<n>/decision.json        the writer, one per round
//   critique/round-<n>/revised.json         the writer revised the post
//
// EVERYTHING A MODEL RETURNS IS UNTRUSTED INPUT. A review is parsed out of a
// final message and held to the schema before it is kept; a malformed one is
// the engine's to retry once. The dispositions are held to the reviews they
// answer: every finding exactly one disposition, every disposition a reason.
//
// The same files feed three readers that must not disagree: the run's summary
// (`ArticleRun.critique`), the check's `critique` item, and the registry
// write-back (publication.json `critique` plus publications/<slug>/critique/).

import { readdir } from "node:fs/promises";
import path from "node:path";

import { ArticleError, readJsonFile } from "./store";
import {
  CRITIQUE_DECISIONS,
  DISPOSITIONS,
  EFFORT_LEVELS,
  FINDING_KINDS,
  FINDING_SEVERITIES,
  REVIEW_VERDICTS,
  REVIEWER_ENGINES,
  REVIEWER_OUTCOMES,
  type ArticleCritique,
  type CheckItem,
  type CritiqueCounts,
  type CritiqueDecisionRecord,
  type CritiqueDetail,
  type CritiqueReviewer,
  type CritiqueRoundDetail,
  type EffortLevel,
  type FindingDisposition,
  type Review,
  type ReviewerReceipt,
  type ReviewerSpec,
  type ReviewFinding,
} from "./types";

/* ── the panel ─────────────────────────────────────────────────────────────── */

export const REVIEWERS_FILE = "pipeline/article-reviewers.json" as const;
/** Scope amendment 1's cost bound. */
export const MAX_CRITIQUE_ROUNDS = 2;
/** Fewer completed reviewers than this in a round is `critique-quorum`. */
export const MIN_COMPLETED = 2;
const DEFAULT_TIMEOUT_MIN = 25;
/** The registry's publications gate allows 1 to 8 reviewers. */
const MAX_PANEL = 8;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9.\-[\]_]{0,63}$/;

export interface ReviewerPanel {
  schema: "article-reviewers/1";
  maxCritiqueRounds: number;
  minCompleted: number;
  reviewers: ReviewerSpec[];
}

/** Where the panel is read from: ARTICLES_REVIEWERS_FILE (the CLI's
 *  `--reviewers` sets it), else pipeline/article-reviewers.json. */
export function reviewersFile(root: string, env: Record<string, string | undefined> = process.env): string {
  const o = env.ARTICLES_REVIEWERS_FILE?.trim();
  return o ? path.resolve(root, o) : path.join(root, REVIEWERS_FILE);
}

/** Validate a panel. Throws an ArticleError naming every problem. */
export function validatePanel(raw: unknown, where: string = REVIEWERS_FILE): ReviewerPanel {
  const o = (raw ?? {}) as Record<string, unknown>;
  const problems: string[] = [];
  const rounds = o.maxCritiqueRounds === undefined ? MAX_CRITIQUE_ROUNDS : Number(o.maxCritiqueRounds);
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > MAX_CRITIQUE_ROUNDS) problems.push(`maxCritiqueRounds must be 1..${MAX_CRITIQUE_ROUNDS}`);
  const min = o.minCompleted === undefined ? MIN_COMPLETED : Number(o.minCompleted);
  if (!Number.isInteger(min) || min < MIN_COMPLETED) problems.push(`minCompleted must be an integer ≥ ${MIN_COMPLETED} (the quorum is the amendment's, not the config's)`);
  const list = Array.isArray(o.reviewers) ? o.reviewers : [];
  if (!list.length || list.length > MAX_PANEL) problems.push(`reviewers must hold 1..${MAX_PANEL} entries`);
  const seen = new Set<string>();
  const reviewers: ReviewerSpec[] = list.map((r, i) => {
    const x = (r ?? {}) as Record<string, unknown>;
    const id = String(x.id ?? "");
    if (!SLUG.test(id)) problems.push(`reviewers[${i}].id must be a kebab-case slug`);
    else if (seen.has(id)) problems.push(`reviewers[${i}].id "${id}" repeats`);
    seen.add(id);
    if (!(REVIEWER_ENGINES as readonly string[]).includes(String(x.engine))) problems.push(`reviewers[${i}].engine must be one of ${REVIEWER_ENGINES.join(", ")}`);
    if (!MODEL_ID.test(String(x.model ?? ""))) problems.push(`reviewers[${i}].model is not a model id`);
    const effort = String(x.effort ?? "high");
    if (!EFFORT_LEVELS.includes(effort as EffortLevel)) problems.push(`reviewers[${i}].effort must be one of ${EFFORT_LEVELS.join(", ")}`);
    const timeoutMin = x.timeoutMin === undefined ? DEFAULT_TIMEOUT_MIN : Number(x.timeoutMin);
    if (!(timeoutMin > 0 && timeoutMin <= 180)) problems.push(`reviewers[${i}].timeoutMin must be a number of minutes in (0, 180]`);
    return { id, engine: x.engine as ReviewerSpec["engine"], model: String(x.model ?? ""), effort: effort as EffortLevel, timeoutMin };
  });
  if (reviewers.length && min > reviewers.length) problems.push(`minCompleted ${min} is more than the ${reviewers.length} reviewers`);
  if (problems.length) throw new ArticleError(`${where}: ${problems.join("; ")}`, 500, "reviewers-malformed");
  return { schema: "article-reviewers/1", maxCritiqueRounds: rounds, minCompleted: min, reviewers };
}

export async function loadPanel(root: string, env: Record<string, string | undefined> = process.env): Promise<ReviewerPanel> {
  const file = reviewersFile(root, env);
  const raw = await readJsonFile<unknown>(file, undefined);
  if (raw === undefined) throw new ArticleError(`the reviewer panel ${file} is missing — it is part of the code`, 500, "reviewers-missing");
  return validatePanel(raw, file);
}

/* ── a review out of a final message ───────────────────────────────────────── */

/** The JSON object in a final message: the whole message, else a fenced block,
 *  else the span from the first `{` to the last `}`. */
export function extractJsonObject(text: string): unknown {
  const t = text.replace(/^﻿/, "").trim();
  const tries = [t];
  const fence = /```(?:json)?\s*\n([\s\S]*?)\n\s*```/i.exec(t);
  if (fence) tries.push(fence[1]);
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a >= 0 && b > a) tries.push(t.slice(a, b + 1));
  for (const s of tries) {
    try {
      const v = JSON.parse(s) as unknown;
      if (v && typeof v === "object" && !Array.isArray(v)) return v;
    } catch {
      // next shape
    }
  }
  throw new Error("the final message holds no JSON object");
}

/** The registry gate's URL rule: http(s), a real host with a TLD. */
export function isWebUrl(s: unknown): s is string {
  if (typeof s !== "string" || /\s/.test(s)) return false;
  try {
    const u = new URL(s);
    return (u.protocol === "http:" || u.protocol === "https:") && /\.[a-z]{2,}$/i.test(u.hostname);
  } catch {
    return false;
  }
}

/** A machine home path never leaves this machine in a review: the registry's
 *  privacy rule fails a publication that carries one, and a reviewer may quote
 *  its workspace path. Replaced, not rejected — the content stays. */
export function scrubHomePaths(s: string): string {
  return s
    .replace(/(?<![A-Za-z])[A-Za-z]:[\\/]{1,2}Users[\\/]{1,2}[^\\/\s`'"<>|:*?]+[\\/]/g, "~/")
    .replace(/(?<![\w.~:-])\/(?:home|Users)\/[^/\s`'"<>|:*?]+\//g, "~/");
}

const MAX_FINDINGS = 40;
const str = (v: unknown) => (typeof v === "string" ? scrubHomePaths(v.trim()) : "");

/**
 * Hold a reviewer's final message to the review schema. The reviewer's own
 * `reviewer`/`model`/`effort` are ignored: the panel says who reviewed. An
 * evidence entry that is not an http(s) URL is DROPPED and counted (the
 * finding stands); anything else wrong rejects the review with every problem
 * named, for the engine's one retry.
 */
export function validateReview(finalMessage: string, spec: Pick<ReviewerSpec, "id" | "model" | "effort">): { review: Review; dropped: number } {
  const o = extractJsonObject(finalMessage) as Record<string, unknown>;
  const problems: string[] = [];
  if (!(REVIEW_VERDICTS as readonly string[]).includes(String(o.verdict))) problems.push(`verdict must be one of ${REVIEW_VERDICTS.join(", ")}`);
  const summary = str(o.summary);
  if (!summary) problems.push("summary must be a non-empty string");
  if (!Array.isArray(o.findings)) problems.push("findings must be an array (empty when there is nothing to find)");
  let dropped = 0;
  const ids = new Set<string>();
  const findings: ReviewFinding[] = (Array.isArray(o.findings) ? o.findings : []).slice(0, MAX_FINDINGS).map((f, i) => {
    const x = (f ?? {}) as Record<string, unknown>;
    const at = `findings[${i}]`;
    const id = str(x.id);
    if (!id) problems.push(`${at}.id is empty`);
    else if (ids.has(id)) problems.push(`${at}.id "${id}" repeats`);
    ids.add(id);
    if (!(FINDING_KINDS as readonly string[]).includes(String(x.kind))) problems.push(`${at}.kind must be one of ${FINDING_KINDS.join(", ")}`);
    if (!(FINDING_SEVERITIES as readonly string[]).includes(String(x.severity))) problems.push(`${at}.severity must be one of ${FINDING_SEVERITIES.join(", ")}`);
    for (const k of ["location", "claim", "suggestion"]) if (!str(x[k])) problems.push(`${at}.${k} is empty`);
    if (x.evidence !== undefined && !Array.isArray(x.evidence)) problems.push(`${at}.evidence must be an array of URLs`);
    const raw = Array.isArray(x.evidence) ? x.evidence : [];
    const evidence = [...new Set(raw.filter(isWebUrl))];
    dropped += raw.length - raw.filter(isWebUrl).length;
    return {
      id,
      kind: x.kind as ReviewFinding["kind"],
      severity: x.severity as ReviewFinding["severity"],
      location: str(x.location),
      claim: str(x.claim),
      evidence,
      suggestion: str(x.suggestion),
    };
  });
  if (problems.length) throw new Error(`the review does not match the schema: ${problems.slice(0, 10).join("; ")}`);
  return { review: { reviewer: spec.id, model: spec.model, effort: spec.effort, verdict: o.verdict as Review["verdict"], summary, findings }, dropped };
}

/* ── the writer's answer ───────────────────────────────────────────────────── */

const findingKey = (reviewer: string, id: string) => `${reviewer}#${id}`;

/** Every finding of every review in the round gets exactly one disposition
 *  with a non-empty reason; a disposition of a finding that does not exist is
 *  refused. Unknown keys are dropped; `action` is kept only when non-empty. */
export function validateDispositions(raw: unknown, reviews: Review[]): FindingDisposition[] {
  if (!Array.isArray(raw)) throw new Error("dispositions.json must be an array");
  const expected = new Map<string, number>();
  for (const r of reviews) for (const f of r.findings) expected.set(findingKey(r.reviewer, f.id), 0);
  const problems: string[] = [];
  const out: FindingDisposition[] = raw.map((d, i) => {
    const x = (d ?? {}) as Record<string, unknown>;
    const reviewer = String(x.reviewer ?? "");
    const findingId = String(x.findingId ?? "");
    const key = findingKey(reviewer, findingId);
    if (!expected.has(key)) problems.push(`[${i}] disposes of ${reviewer}/${findingId}, which no review in this round holds`);
    else expected.set(key, expected.get(key)! + 1);
    if (!(DISPOSITIONS as readonly string[]).includes(String(x.disposition))) problems.push(`[${i}].disposition must be one of ${DISPOSITIONS.join(", ")}`);
    const reason = str(x.reason);
    if (!reason) problems.push(`[${i}] (${reviewer}/${findingId}) has an empty reason`);
    const action = str(x.action);
    return { reviewer, findingId, disposition: x.disposition as FindingDisposition["disposition"], reason, ...(action ? { action } : {}) };
  });
  for (const [key, n] of expected) {
    if (n === 0) problems.push(`finding ${key.replace("#", "/")} has no disposition`);
    else if (n > 1) problems.push(`finding ${key.replace("#", "/")} has ${n} dispositions`);
  }
  if (problems.length) throw new Error(`dispositions: ${problems.slice(0, 10).join("; ")}`);
  return out;
}

/** The writer's decision for a round. In the last round the post is either
 *  kept or rewritten once more, without re-review: `research` is refused. */
export function validateDecision(raw: unknown, round: number, last: boolean): CritiqueDecisionRecord {
  const o = (raw ?? {}) as Record<string, unknown>;
  const allowed = last ? CRITIQUE_DECISIONS.filter((d) => d !== "research") : CRITIQUE_DECISIONS;
  const problems: string[] = [];
  if (!(allowed as readonly string[]).includes(String(o.decision))) problems.push(`decision must be one of ${allowed.join(", ")}${last ? " (this is the last round)" : ""}`);
  const rationale = str(o.rationale);
  if (!rationale) problems.push("rationale is empty");
  if (problems.length) throw new Error(`decision.json: ${problems.join("; ")}`);
  return { round, decision: o.decision as CritiqueDecisionRecord["decision"], rationale };
}

/* ── reading a run's critique/ ─────────────────────────────────────────────── */

export const roundDir = (n: number) => `critique/round-${n}`;

async function jsonFilesIn<T>(dir: string): Promise<T[]> {
  let names: string[] = [];
  try {
    names = (await readdir(dir)).filter((n) => /^[a-z0-9-]+\.json$/.test(n)).sort();
  } catch {
    return [];
  }
  const out: T[] = [];
  for (const n of names) {
    const v = await readJsonFile<T | null>(path.join(dir, n), null);
    if (v) out.push(v);
  }
  return out;
}

/** The critique as its files hold it, rounds in order, each reviewer list in
 *  panel order. Undefined when the critique never started. */
export async function readCritiqueDetail(runDirAbs: string): Promise<CritiqueDetail | undefined> {
  const panel = await readJsonFile<ReviewerPanel | null>(path.join(runDirAbs, "critique", "reviewers.json"), null);
  if (!panel) return undefined;
  const order = (id: string) => {
    const i = panel.reviewers.findIndex((r) => r.id === id);
    return i < 0 ? panel.reviewers.length : i;
  };
  const rounds: CritiqueRoundDetail[] = [];
  for (let n = 1; n <= panel.maxCritiqueRounds; n++) {
    const dir = path.join(runDirAbs, ...roundDir(n).split("/"));
    const receipts = (await jsonFilesIn<ReviewerReceipt>(path.join(dir, "receipts"))).sort((a, b) => order(a.id) - order(b.id));
    const reviews = (await jsonFilesIn<Review>(path.join(dir, "reviews"))).sort((a, b) => order(a.reviewer) - order(b.reviewer));
    const closed = await readJsonFile<{ at: string } | null>(path.join(dir, "closed.json"), null);
    const dispositions = await readJsonFile<FindingDisposition[] | null>(path.join(dir, "dispositions.json"), null);
    const decision = await readJsonFile<CritiqueDecisionRecord | null>(path.join(dir, "decision.json"), null);
    const revised = await readJsonFile<{ at: string; research: boolean } | null>(path.join(dir, "revised.json"), null);
    if (!receipts.length && !reviews.length && !closed) break;
    rounds.push({
      round: n,
      receipts,
      reviews,
      closed: !!closed,
      ...(dispositions ? { dispositions } : {}),
      ...(decision ? { decision } : {}),
      ...(revised ? { revised } : {}),
    });
  }
  return { reviewers: panel.reviewers, maxRounds: panel.maxCritiqueRounds, minCompleted: panel.minCompleted, rounds };
}

/** Counts over every round's dispositions — the registry gate requires the
 *  block's counts to equal the flattened dispositions.json. */
export function countDispositions(rounds: Pick<CritiqueRoundDetail, "dispositions">[]): CritiqueCounts {
  const c: CritiqueCounts = { total: 0, accepted: 0, rejected: 0, deferred: 0 };
  for (const r of rounds) for (const d of r.dispositions ?? []) {
    c.total++;
    c[d.disposition]++;
  }
  return c;
}

const round6 = (n: number) => Math.round(n * 1_000_000) / 1_000_000;

/** `ArticleRun.critique` from the files. A reviewer's outcome is its outcome
 *  in the LAST round it ran; its cost is summed over every round that
 *  reported one (omitted when none did). Undefined until a receipt exists. */
export function summarizeCritique(detail: CritiqueDetail | undefined): ArticleCritique | undefined {
  if (!detail) return undefined;
  const ran = detail.rounds.filter((r) => r.receipts.length);
  if (!ran.length) return undefined;
  const reviewers: CritiqueReviewer[] = [];
  for (const spec of detail.reviewers) {
    const mine = ran.map((r) => r.receipts.find((x) => x.id === spec.id)).filter((x): x is ReviewerReceipt => !!x);
    if (!mine.length) continue;
    const last = mine[mine.length - 1];
    const costs = mine.map((m) => m.costUsd).filter((c): c is number => typeof c === "number");
    reviewers.push({
      id: spec.id,
      engine: spec.engine,
      model: spec.model,
      effort: spec.effort,
      outcome: last.outcome,
      ...(costs.length ? { costUsd: round6(costs.reduce((a, b) => a + b, 0)) } : {}),
      ...(last.outcome !== "completed" && last.errors[0] ? { error: last.errors[0] } : {}),
    });
  }
  const decided = [...detail.rounds].reverse().find((r) => r.decision);
  return {
    rounds: ran.length,
    reviewers,
    findings: countDispositions(detail.rounds),
    ...(decided?.decision ? { decision: decided.decision.decision } : {}),
  };
}

/* ── the check's `critique` item ───────────────────────────────────────────── */

/**
 * Pass only if EVERY round that ran had at least the quorum of completed
 * reviewers, and every `blocker` `factual` finding of every round has a
 * disposition with a reason (scope amendment 1). Dimension `truth`: a blocker
 * factual finding left unanswered is a truth problem, and the owner's seven
 * dimensions stay seven.
 */
export function critiqueCheckItem(detail: CritiqueDetail | undefined): CheckItem {
  const base = { id: "critique", dimension: "truth" as const, label: "Multi-model critique answered" };
  const expected = `≥ ${detail?.minCompleted ?? MIN_COMPLETED} reviewers completed per round; every blocker factual finding disposed with a reason`;
  if (!detail || !detail.rounds.length) return { ...base, status: "fail", value: "no critique record", expected };
  const problems: string[] = [];
  const perRound = detail.rounds.map((r) => {
    const done = r.receipts.filter((x) => x.outcome === "completed").length;
    if (done < detail.minCompleted) problems.push(`round ${r.round}: ${done} of ${detail.reviewers.length} reviewers completed`);
    return `r${r.round} ${done}/${detail.reviewers.length}`;
  });
  let blockers = 0;
  for (const r of detail.rounds) {
    for (const rv of r.reviews) {
      for (const f of rv.findings) {
        if (f.severity !== "blocker" || f.kind !== "factual") continue;
        blockers++;
        const d = r.dispositions?.find((x) => x.reviewer === rv.reviewer && x.findingId === f.id);
        if (!d || !d.reason.trim()) problems.push(`round ${r.round}: blocker factual ${rv.reviewer}/${f.id} has no disposition with a reason`);
      }
    }
  }
  return {
    ...base,
    status: problems.length ? "fail" : "pass",
    value: `${perRound.join(", ")}; ${blockers} blocker factual`,
    expected,
    ...(problems.length ? { detail: problems.slice(0, 12) } : {}),
  };
}

/* ── the registry's shapes (ai-registry docs/publications-lane.md) ─────────── */

export interface RegistryCritique {
  /** publication.json `critique`. */
  block: { rounds: number; reviewers: { id: string; engine: string; model: string; effort: string; outcome: string; costUsd?: number }[]; findings: CritiqueCounts; decision: string };
  /** publications/<slug>/critique/reviews.json — every round, every review. */
  reviews: (Review & { round: number })[];
  /** publications/<slug>/critique/dispositions.json — every round. */
  dispositions: (FindingDisposition & { round: number })[];
}

/**
 * The registry's critique record from a run's files: rounds flattened into two
 * arrays, each entry carrying its `round`, key order as the registry documents
 * it; the block's counts from those same dispositions, so the gate's
 * cross-check holds by construction. Undefined when there is no decided
 * critique (a run that never critiqued writes no block).
 */
export function registryCritique(detail: CritiqueDetail | undefined): RegistryCritique | undefined {
  const summary = summarizeCritique(detail);
  if (!detail || !summary?.decision) return undefined;
  const reviews = detail.rounds.flatMap((r) =>
    r.reviews.map((rv) => ({ reviewer: rv.reviewer, round: r.round, model: rv.model, effort: rv.effort, verdict: rv.verdict, summary: rv.summary, findings: rv.findings })),
  );
  const dispositions = detail.rounds.flatMap((r) =>
    (r.dispositions ?? []).map((d) => ({ reviewer: d.reviewer, round: r.round, findingId: d.findingId, disposition: d.disposition, reason: d.reason, ...(d.action ? { action: d.action } : {}) })),
  );
  return {
    block: {
      rounds: summary.rounds,
      reviewers: summary.reviewers.map((r) => ({ id: r.id, engine: r.engine, model: r.model, effort: r.effort, outcome: r.outcome, ...(r.costUsd !== undefined ? { costUsd: r.costUsd } : {}) })),
      findings: summary.findings,
      decision: summary.decision,
    },
    reviews,
    dispositions,
  };
}

/** Outcomes, re-exported for the probes. */
export { REVIEWER_OUTCOMES };
