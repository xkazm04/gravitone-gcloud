// WHAT WILL THE OPERATOR KEEP? (idea loop, stage 2)
//
// The prediction is the operator's keep on the Board and nothing else: never an audience, never a platform number.
// The training data is `night.committed` over idea artboards, the only idea-level human verdicts this product records.
//
// THE SCORER. Word evidence from the kept and thrown ideas: per word, how much likelier it is among keeps than
// throws, summed as log-odds and squashed to 0..1. With no verdict every idea scores 0.5, which is the honest answer.
// The class prior is deliberately not in the score: how often the operator keeps says nothing about THIS idea.
//
// THE BAR is measured the way lib/foundry/calibration.ts measures a grader, and through it, so the status vocabulary
// and the floor (8 keeps AND 8 throws) cannot drift. Each verdict is scored by a model that never saw it: five
// stratified folds rather than leave-one-out, because taking ONE keep out of the counts makes the model lean against
// that very keep, and on uninformative data leave-one-out reads as a confident inversion.
//
// Only `calibrated` earns a measured bar. `insufficient`, `chance` and `inverted` all get PROVISIONAL_BAR labelled
// provisional: a pass under it says only that the idea cleared a coin, and the human triage is the real gate.

import { calibrate, CALIBRATION_METHOD, type CalibrationRow, type CalibrationStatus } from "../../calibration";
import { cellId, type IdeaCandidate, type Night } from "../types";

export type IdeaWords = { readonly title: string; readonly text: string };
export type IdeaVerdict = IdeaWords & { readonly ref: string; readonly verdict: "keep" | "reject"; readonly reasons: readonly string[] };

/** Every human keep and throw of an idea artboard. A dry night's are left out: its artboards were stand-ins. */
export function ideaVerdicts(nights: readonly Night[]): IdeaVerdict[] {
  const out: IdeaVerdict[] = [];
  for (const n of nights) {
    const record = n.committed;
    if (record === undefined || record.dry || n.dry) continue;
    for (const c of n.candidates) {
      if (c.kind !== "idea") continue;
      const cell = cellId(c.id, "board");
      const verdict = record.kept.includes(cell) ? "keep" : record.rejected.includes(cell) ? "reject" : undefined;
      if (verdict !== undefined) out.push({ ref: `${n.id}/${c.id}`, verdict, title: c.title, text: wordsOf(c), reasons: record.reasons[cell] ?? [] });
    }
  }
  return out.sort((a, b) => a.ref.localeCompare(b.ref));
}

const wordsOf = (c: IdeaCandidate): string => [c.title, c.genre ?? "", c.prompt].join(" ");

const STOP = new Set(["the", "and", "with", "for", "from", "that", "this", "into", "over", "under", "its", "his", "her", "their", "are", "was", "were", "has", "have", "one", "each", "then", "while"]);

function tokens(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/\p{L}{3,}/gu) ?? []).filter((w) => !STOP.has(w)));
}

type Model = { readonly kept: Map<string, number>; readonly thrown: Map<string, number>; readonly nKept: number; readonly nThrown: number };

function train(verdicts: readonly (IdeaWords & { readonly verdict: string })[]): Model {
  const kept = new Map<string, number>();
  const thrown = new Map<string, number>();
  let nKept = 0;
  let nThrown = 0;
  for (const v of verdicts) {
    const into = v.verdict === "keep" ? kept : thrown;
    if (v.verdict === "keep") nKept++;
    else nThrown++;
    for (const t of tokens(`${v.title} ${v.text}`)) into.set(t, (into.get(t) ?? 0) + 1);
  }
  return { kept, thrown, nKept, nThrown };
}

function predict(m: Model, idea: IdeaWords): number {
  let logOdds = 0;
  for (const t of tokens(`${idea.title} ${idea.text}`)) {
    const k = m.kept.get(t) ?? 0;
    const r = m.thrown.get(t) ?? 0;
    if (k + r === 0) continue;
    logOdds += Math.log((k + 1) / (m.nKept + 2)) - Math.log((r + 1) / (m.nThrown + 2));
  }
  return 1 / (1 + Math.exp(-logOdds));
}

/** Five folds, each holding the same share of keeps and throws. */
function foldsOf(verdicts: readonly IdeaVerdict[]): number[] {
  const seen = { keep: 0, reject: 0 };
  return verdicts.map((v) => seen[v.verdict]++ % 5);
}

function outOfFoldRows(verdicts: readonly IdeaVerdict[]): (CalibrationRow & { readonly score: number })[] {
  const folds = foldsOf(verdicts);
  return verdicts.map((v, i) => {
    const score = predict(train(verdicts.filter((_, j) => folds[j] !== folds[i])), v);
    return { mechanism: "idea-loop", verdict: v.verdict, craft: score, style_score: null, has_text: null, score } as CalibrationRow & { readonly score: number };
  });
}

/** The cut that best separates the out-of-fold scores (Youden's J); the highest such cut on a tie. */
function bestCut(rows: readonly { readonly verdict: string; readonly score: number }[]): number {
  const sorted = [...new Set(rows.map((r) => r.score))].sort((a, b) => a - b);
  const keeps = rows.filter((r) => r.verdict === "keep");
  const throws = rows.filter((r) => r.verdict !== "keep");
  let best = PROVISIONAL_BAR;
  let bestJ = -Infinity;
  for (let i = 1; i < sorted.length; i++) {
    const cut = ((sorted[i - 1] ?? 0) + (sorted[i] ?? 0)) / 2;
    const j = keeps.filter((r) => r.score >= cut).length / keeps.length - throws.filter((r) => r.score >= cut).length / throws.length;
    if (j >= bestJ) {
      bestJ = j;
      best = cut;
    }
  }
  return best;
}

export const PROVISIONAL_BAR = 0.5;

export type IdeaBar = {
  readonly n: number;
  readonly nKept: number;
  readonly nThrown: number;
  /** The floor both classes must reach before anything is measured. */
  readonly floor: number;
  readonly status: CalibrationStatus;
  readonly auc: number | null;
  readonly ci: readonly [number, number] | null;
  readonly value: number;
  /** True unless the status is `calibrated`. */
  readonly provisional: boolean;
};

export type IdeaScorer = { readonly bar: IdeaBar; readonly predictedKeep: (idea: IdeaWords) => number; readonly passes: (idea: IdeaWords) => boolean };

/** The bar the verdicts support, and a scorer trained on all of them. */
export function scorerFrom(verdicts: readonly IdeaVerdict[]): IdeaScorer {
  const rows = outOfFoldRows(verdicts);
  const measured = calibrate(rows).fields.craft.all;
  const calibrated = measured.status === "calibrated";
  const value = calibrated ? bestCut(rows) : PROVISIONAL_BAR;
  const bar: IdeaBar = {
    n: verdicts.length,
    nKept: verdicts.filter((v) => v.verdict === "keep").length,
    nThrown: verdicts.filter((v) => v.verdict === "reject").length,
    floor: CALIBRATION_METHOD.floor,
    status: measured.status,
    auc: measured.auc,
    ci: measured.ci,
    value,
    provisional: !calibrated,
  };
  const model = train(verdicts);
  return { bar, predictedKeep: (idea) => predict(model, idea), passes: (idea) => predict(model, idea) >= value };
}

/** One line for a human, saying what the bar is and is not. */
export function barLine(b: IdeaBar): string {
  const measure = b.auc === null ? "not measured" : `AUC ${b.auc} [${b.ci?.[0]}, ${b.ci?.[1]}]`;
  return `bar ${b.value.toFixed(3)}${b.provisional ? " (provisional)" : ""} · ${b.status} · n=${b.n} (${b.nKept} kept, ${b.nThrown} thrown; floor ${b.floor} each) · ${measure}`;
}
