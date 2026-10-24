// THE AUDIO-TRIAGE SCORE - what the eval harness (pipeline/audio-triage-eval.mts) computes from a
// corpus's labels and the triage answers, as pure functions: no file, no spawn, no clock, so the
// arithmetic is pinned by tests/next-server/audio-triage-eval.test.ts on a stub answer set whose
// confusion matrix is known by construction.
//
// THE LABELS are pipeline/audio/corpus.py's labels.json, read through the one door. Per row and
// check, `expect` is "flag" (the injected defect), "pass" (untouched by the injection), "skip"
// (the context does not commit what the check needs) or ABSENT (a side effect the injection
// cannot avoid - a hard clip also lifts the true peak - which is never scored).
//
// PER CHECK, against what the sidecar answered:
//   expect flag  -> TP if it flagged, else FN (a pass, a skip, a missing finding or an error all
//                   miss the defect);
//   expect pass  -> FP if it flagged, TN if it passed; a skip is not a TN (it judged nothing),
//                   it is counted as a skip mismatch;
//   expect skip  -> anything but a skip is a skip mismatch (the check judged what the contract
//                   says it cannot);
//   absent       -> a flag there is counted as a side flag, for information.
// precision = TP/(TP+FP); recall = TP/(TP+FN), overall, per severity and at medium+high (the
// gated one); the false-positive rate FP/(FP+TN) on the CLEAN CONTROLS (defect null - the gated
// one) and over every negative. A rate with no denominator is null, never 0 or 1.
//
// THE THRESHOLD THAT WOULD REACH RECALL 0.9: per check, kind and variant, from the values the
// detector MEASURED on the medium+high positives - the value 90 % of them reach (the sidecar's
// rule is `value >= threshold`; loudness flags BELOW its floor, so its rule is read downwards),
// beside the threshold it applied and the clean-control FPR that value would cost. Positives that
// flagged although their value did not reach the threshold were flagged by another rule of the
// same check (broken-ending's silent tail) - counted, so the would-threshold is not misread.

import { z } from "zod";

import { TRIAGE_CHECKS, TRIAGE_KINDS, triageContextSchema, triageSchema, type Finding, type Triage, type TriageCheck } from "@gt/domain/audio.triage";
import { parseJsonAt } from "@gt/domain/door";
import type { Result } from "@gt/domain/errors";

export const SEVERITIES = ["low", "medium", "high"] as const;
export type Severity = (typeof SEVERITIES)[number];
export const LABELS_VERSION = 1;
export const RECALL_AT = 0.9;

const expectSchema = z.enum(["flag", "pass", "skip"]);

export const labelRowSchema = z
  .strictObject({
    file: z.string().min(1),
    kind: z.enum(TRIAGE_KINDS),
    context: triageContextSchema,
    base: z.string().min(1),
    defect: z.enum(TRIAGE_CHECKS).nullable(),
    variant: z.string().min(1).nullable(),
    severity: z.enum(SEVERITIES).nullable(),
    amount: z.number().nullable(),
    unit: z.string().nullable(),
    real: z.boolean(),
    expect: z.partialRecord(z.enum(TRIAGE_CHECKS), expectSchema),
  })
  .superRefine((r, ctx) => {
    if ((r.defect === null) !== (r.severity === null)) ctx.addIssue({ code: "custom", path: ["severity"], message: "a severity goes with a defect, and only with one" });
    if (r.defect !== null && r.expect[r.defect] !== "flag") ctx.addIssue({ code: "custom", path: ["expect", r.defect], message: "the injected defect must be expected to flag" });
    if (r.defect === null && TRIAGE_CHECKS.some((c) => r.expect[c] === undefined)) ctx.addIssue({ code: "custom", path: ["expect"], message: "a clean control states every check" });
  });
export type LabelRow = z.output<typeof labelRowSchema>;

export const labelsSchema = z.strictObject({
  version: z.literal(LABELS_VERSION),
  seed: z.number().int(),
  rate: z.number().int().positive(),
  real: z.strictObject({
    asked: z.boolean(),
    found: z.number().int().nonnegative(),
    reason: z.string().nullable(),
    skipped: z.array(z.strictObject({ sha: z.string(), reason: z.string() })),
  }),
  rows: z.array(labelRowSchema).min(1),
});
export type Labels = z.output<typeof labelsSchema>;

export const LABELS_DOOR = "audio-triage labels";
export const parseLabels = (text: string): Result<Labels> => parseJsonAt(LABELS_DOOR, labelsSchema, text) as Result<Labels>;

/** One file's answer: the sidecar's triage, or its error verbatim. */
export type Answer = { readonly ok: true; readonly triage: Triage } | { readonly ok: false; readonly error: string };
export const answersSchema = z.record(z.string(), z.union([z.strictObject({ ok: z.literal(true), triage: triageSchema }), z.strictObject({ ok: z.literal(false), error: z.string() })]));
export const parseAnswers = (text: string): Result<Record<string, Answer>> => parseJsonAt("audio-triage answers", answersSchema, text) as Result<Record<string, Answer>>;

export type Rate = { readonly n: number; readonly hit: number; readonly rate: number | null };
const rate = (hit: number, n: number): Rate => ({ n, hit, rate: n === 0 ? null : hit / n });

export type Would = {
  readonly kind: string;
  readonly variant: string | null;
  /** The threshold the detector applied (the most common one on these findings). */
  readonly current: number | null;
  /** A threshold at or past this value (rule `value >= t`; loudness `value <= t`) flags >= 90 %. */
  readonly wouldFlagAt: number | null;
  readonly direction: "above" | "below";
  readonly n: number;
  readonly nullValues: number;
  /** Flagged although the value did not reach the threshold: another rule of the check fired. */
  readonly flaggedByOtherRule: number;
  /** Clean controls of this kind whose value reaches `wouldFlagAt`. */
  readonly cleanFprAt: Rate;
};

export type CheckScore = {
  readonly check: TriageCheck;
  readonly tp: number;
  readonly fp: number;
  readonly fn: number;
  readonly tn: number;
  readonly skipMismatch: number;
  readonly missing: number;
  readonly errors: number;
  readonly sideFlags: number;
  readonly precision: number | null;
  readonly recall: Rate;
  readonly recallBySeverity: Readonly<Record<Severity, Rate>>;
  readonly recallMH: Rate;
  readonly fprClean: Rate;
  readonly fprAll: Rate;
  /** Medium/high positives the check missed, and clean controls it flagged (file names). */
  readonly misses: readonly string[];
  readonly falseAlarms: readonly string[];
  readonly would: readonly Would[];
};

type Outcome = "flag" | "pass" | "skip" | "missing" | "error";

function findingOf(a: Answer | undefined, check: TriageCheck): { outcome: Outcome; finding?: Finding } {
  if (a === undefined || !a.ok) return { outcome: "error" };
  const f = a.triage.findings.find((x) => x.check === check);
  return f === undefined ? { outcome: "missing" } : { outcome: f.verdict, finding: f };
}

const isMH = (r: LabelRow): boolean => r.severity === "medium" || r.severity === "high";

function mode(xs: readonly number[]): number | null {
  const count = new Map<number, number>();
  for (const x of xs) count.set(x, (count.get(x) ?? 0) + 1);
  let best: number | null = null;
  let most = 0;
  for (const [x, k] of count) if (k > most) [best, most] = [x, k];
  return best;
}

/** The value 90 % of `values` reach, read in `direction` (null for none). */
export function reachedBy(values: readonly number[], direction: "above" | "below", at = RECALL_AT): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => (direction === "above" ? b - a : a - b));
  return sorted[Math.ceil(at * sorted.length) - 1] ?? null;
}

function wouldFor(check: TriageCheck, rows: readonly LabelRow[], answers: Readonly<Record<string, Answer>>): Would[] {
  const direction = check === "loudness-range" ? "below" : "above";
  const reaches = (v: number, t: number): boolean => (direction === "above" ? v >= t : v <= t);
  const groups = new Map<string, LabelRow[]>();
  for (const r of rows) {
    if (r.expect[check] !== "flag" || !isMH(r)) continue;
    const key = `${r.kind}\u0000${r.variant ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const out: Would[] = [];
  for (const [key, group] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const [kind = "", variant = ""] = key.split("\u0000");
    const found = group.map((r) => findingOf(answers[r.file], check).finding).filter((f): f is Finding => f !== undefined);
    const values = found.map((f) => f.value).filter((v): v is number => v !== null);
    const current = mode(found.map((f) => f.threshold).filter((t): t is number => t !== null));
    const t = reachedBy(values, direction);
    const clean = rows
      .filter((r) => r.defect === null && r.kind === kind && r.expect[check] === "pass")
      .map((r) => findingOf(answers[r.file], check).finding?.value)
      .filter((v): v is number => typeof v === "number");
    out.push({
      kind,
      variant: variant === "" ? null : variant,
      current,
      wouldFlagAt: t,
      direction,
      n: group.length,
      nullValues: found.length - values.length + (group.length - found.length),
      flaggedByOtherRule: found.filter((f) => f.verdict === "flag" && f.value !== null && f.threshold !== null && !reaches(f.value, f.threshold)).length,
      cleanFprAt: t === null ? rate(0, 0) : rate(clean.filter((v) => reaches(v, t)).length, clean.length),
    });
  }
  return out;
}

export function scoreCheck(check: TriageCheck, rows: readonly LabelRow[], answers: Readonly<Record<string, Answer>>): CheckScore {
  let tp = 0, fp = 0, fn = 0, tn = 0, skipMismatch = 0, missing = 0, errors = 0, sideFlags = 0;
  let cleanFp = 0, cleanTn = 0;
  const sev: Record<Severity, { n: number; hit: number }> = { low: { n: 0, hit: 0 }, medium: { n: 0, hit: 0 }, high: { n: 0, hit: 0 } };
  const misses: string[] = [];
  const falseAlarms: string[] = [];
  for (const r of rows) {
    const want = r.expect[check];
    const { outcome } = findingOf(answers[r.file], check);
    if (outcome === "missing") missing++;
    if (outcome === "error") errors++;
    if (want === undefined) {
      if (outcome === "flag") sideFlags++;
      continue;
    }
    if (want === "skip") {
      if (outcome !== "skip") skipMismatch++;
      continue;
    }
    if (outcome === "skip") skipMismatch++;
    if (want === "flag") {
      const hit = outcome === "flag";
      if (hit) tp++;
      else fn++;
      if (r.severity !== null) {
        sev[r.severity].n++;
        if (hit) sev[r.severity].hit++;
      }
      if (!hit && isMH(r)) misses.push(r.file);
      continue;
    }
    if (outcome === "flag") {
      fp++;
      if (r.defect === null) {
        cleanFp++;
        falseAlarms.push(r.file);
      }
    } else if (outcome === "pass") {
      tn++;
      if (r.defect === null) cleanTn++;
    }
  }
  return {
    check,
    tp,
    fp,
    fn,
    tn,
    skipMismatch,
    missing,
    errors,
    sideFlags,
    precision: tp + fp === 0 ? null : tp / (tp + fp),
    recall: rate(tp, tp + fn),
    recallBySeverity: { low: rate(sev.low.hit, sev.low.n), medium: rate(sev.medium.hit, sev.medium.n), high: rate(sev.high.hit, sev.high.n) },
    recallMH: rate(sev.medium.hit + sev.high.hit, sev.medium.n + sev.high.n),
    fprClean: rate(cleanFp, cleanFp + cleanTn),
    fprAll: rate(fp, fp + tn),
    misses,
    falseAlarms,
    would: wouldFor(check, rows, answers),
  };
}

export const scoreAll = (rows: readonly LabelRow[], answers: Readonly<Record<string, Answer>>): CheckScore[] => TRIAGE_CHECKS.map((c) => scoreCheck(c, rows, answers));

/** The floors one check is held to: recall at medium+high, and the clean-control FPR. */
export type Floor = { readonly recallMH: number; readonly fprClean: number };

/** One sentence per failing check, with its numbers; empty when every floor holds. */
export function gateFailures(scores: readonly CheckScore[], floors: Readonly<Record<TriageCheck, Floor>>): string[] {
  const out: string[] = [];
  const pct = (r: Rate): string => (r.rate === null ? "n/a" : `${(r.rate * 100).toFixed(1)} % (${r.hit}/${r.n})`);
  for (const s of scores) {
    const f = floors[s.check];
    if (s.errors > 0) out.push(`${s.check}: ${s.errors} file(s) answered no triage`);
    if (s.recallMH.rate === null) out.push(`${s.check}: no medium/high positives to measure recall on`);
    else if (s.recallMH.rate < f.recallMH) out.push(`${s.check}: recall at medium+high ${pct(s.recallMH)} < floor ${f.recallMH} - missed ${s.misses.slice(0, 5).join(", ")}`);
    if (s.fprClean.rate === null) out.push(`${s.check}: no judged clean controls to measure false positives on`);
    else if (s.fprClean.rate > f.fprClean) out.push(`${s.check}: false-positive rate on clean controls ${pct(s.fprClean)} > floor ${f.fprClean} - flagged ${s.falseAlarms.slice(0, 5).join(", ")}`);
  }
  return out;
}

const num = (v: number | null, digits = 2): string => (v === null ? "-" : v.toFixed(digits));
const r2 = (r: Rate): string => (r.rate === null ? "-" : `${r.rate.toFixed(2)} (${r.hit}/${r.n})`);

/** The report's markdown: the per-check table, then the would-thresholds, then the misses. */
export function toMarkdown(title: string, scores: readonly CheckScore[], failures: readonly string[] | null): string {
  const lines = [`## ${title}`, "", "| check | TP | FP | FN | TN | precision | recall | low | medium | high | recall m+h | FPR clean | FPR all | skip mismatch | side flags |", "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"];
  for (const s of scores)
    lines.push(`| ${s.check} | ${s.tp} | ${s.fp} | ${s.fn} | ${s.tn} | ${num(s.precision)} | ${r2(s.recall)} | ${r2(s.recallBySeverity.low)} | ${r2(s.recallBySeverity.medium)} | ${r2(s.recallBySeverity.high)} | ${r2(s.recallMH)} | ${r2(s.fprClean)} | ${r2(s.fprAll)} | ${s.skipMismatch} | ${s.sideFlags} |`);
  lines.push("", "### Threshold that would reach recall 0.9 at medium+high", "", "| check | kind | variant | current | would flag at | rule | n | null values | other rule | clean FPR there |", "|---|---|---|---|---|---|---|---|---|---|");
  for (const s of scores)
    for (const w of s.would)
      lines.push(`| ${s.check} | ${w.kind} | ${w.variant ?? "-"} | ${num(w.current)} | ${num(w.wouldFlagAt)} | value ${w.direction === "above" ? ">=" : "<="} t | ${w.n} | ${w.nullValues} | ${w.flaggedByOtherRule} | ${r2(w.cleanFprAt)} |`);
  const missed = scores.filter((s) => s.misses.length > 0 || s.falseAlarms.length > 0);
  if (missed.length > 0) {
    lines.push("", "### Misses (medium/high) and false alarms (clean controls)", "");
    for (const s of missed) {
      if (s.misses.length > 0) lines.push(`- ${s.check} missed: ${s.misses.join(", ")}`);
      if (s.falseAlarms.length > 0) lines.push(`- ${s.check} flagged clean: ${s.falseAlarms.join(", ")}`);
    }
  }
  if (failures !== null) lines.push("", "### Gate", "", ...(failures.length === 0 ? ["every floor holds"] : failures.map((f) => `- FAIL ${f}`)));
  return `${lines.join("\n")}\n`;
}
