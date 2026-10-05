// DOES THE GRADER PREDICT THE HUMAN?
//
// The forge grades every candidate before the cull (pipeline/foundry/grade.py)
// and the cull draws those grades under every tile. The README calls grading
// "a pre-filter, never a verdict", and calls the ledger "how we learn whether
// the grader predicts the human" -- but until this module nothing measured
// that across runs. findings.md prints kept-vs-rejected MEANS for one run,
// which cannot say whether a field RANKS the two apart, and ranking is the
// only thing a pre-filter does.
//
// Measured 2026-10-05 on the 87 rows of pipeline/foundry/ledger.json: craft
// ranks kept against rejected BACKWARDS (AUC 0.29, and inverted inside each
// mechanism too, so it is not a ref-early artifact alone), style sits at
// chance (0.58), and has_text has never once been true. The meters under
// every tile were steering the curator the wrong way.
//
// WHAT IS MEASURED. Per grade field, the AUC of "a kept candidate outscores a
// rejected one" -- the probability, over every kept/rejected pair, that the
// field orders them the way the human did (ties count half). Rank, not score,
// on purpose: the registry's two-grader rule records that vision judges "rank
// reliably but score unreliably", so the scale of a craft number is noise and
// its ordering is the signal. 0.5 is a coin; above is a predictor; below is a
// field that points the wrong way.
//
// A STATUS, NOT JUST A NUMBER, because n=87 from two runs is small and a point
// estimate reads as a finding. The CI is a stratified percentile bootstrap
// (keeps and rejects resampled separately, so every resample keeps both
// classes) with a FIXED seed: the same ledger gives byte-identical output,
// which is what lets grader-calibration.json be a tracked, diffable file.
//
//   insufficient  fewer than `floor` keeps or rejects, or the field never
//                 varied -- no AUC is reported at all, never a number that
//                 looks like a measurement
//   calibrated    CI above 0.5 AND the AUC clears 0.5 + margin
//   inverted      CI below 0.5 AND the AUC is under 0.5 - margin
//   chance        everything else
//
// The margin keeps a large, tight, useless AUC (0.52 on ten thousand rows)
// from steering a cull.
//
// SPLIT BY MECHANISM, mandatorily: the moonshot card's own risk note is that
// an inversion could be one mechanism's artifact (`ref-early` copies the
// source, scores high on craft, and gets rejected). A reader asks for the
// field's status FOR a mechanism (`fieldStatus`) and gets the pooled status
// only when that mechanism's own bucket is too thin to say.
//
// SERIES. A grade is the grader's model plus its schema and prompts, which
// grade.py hashes into `grader_digest` and forge.py stamps on every grade.
// Rows from another grader are a different instrument; pooling them would let
// a grader change hide inside the drift it is meant to detect. Rows written
// before the stamp existed form the `unstamped` series.
//
// Pure: no Node, no fetch -- the /foundry page runs this over the catalogue's
// ledger in the browser, and pipeline/foundry/calibrate.mts runs it to write
// pipeline/foundry/grader-calibration.json.

import type { Candidate, LedgerRow } from "./types";

export type GradeField = "craft" | "style_score" | "has_text";
export const GRADE_FIELDS: readonly GradeField[] = ["craft", "style_score", "has_text"];

/** +1: a higher value predicts keep. -1: a veto, so TRUE predicts reject. */
const POLARITY: Record<GradeField, 1 | -1> = { craft: 1, style_score: 1, has_text: -1 };

export type CalibrationStatus = "calibrated" | "inverted" | "chance" | "insufficient";

export const CALIBRATION_METHOD = {
  metric: "auc",
  /** Minimum keeps AND rejects before a field is measured at all. */
  floor: 8,
  resamples: 2000,
  seed: 20261005,
  level: 0.95,
  margin: 0.1,
} as const;

export type CalibrationRow = Pick<LedgerRow, "mechanism" | "verdict" | "craft" | "style_score" | "has_text"> & {
  grader?: string | null;
  grader_digest?: string | null;
};

export interface FieldCalibration {
  n_keep: number;
  n_reject: number;
  /** Null whenever the status is `insufficient`. */
  auc: number | null;
  ci: [number, number] | null;
  status: CalibrationStatus;
  /** Why `insufficient`: below the floor, or the field never varied. */
  short?: "floor" | "constant";
}

export interface FieldReport {
  all: FieldCalibration;
  by_mechanism: Record<string, FieldCalibration>;
}

export interface Calibration {
  series: string;
  /** Rows in this series. */
  n: number;
  fields: Record<GradeField, FieldReport>;
  /** Rows left out because another grader graded them, per series. */
  other_graders: Record<string, number>;
}

export interface GraderCalibrationFile {
  method: typeof CALIBRATION_METHOD;
  ledger_rows: number;
  series: Record<string, Calibration>;
}

export const UNSTAMPED = "unstamped";

/** The grader a row was graded by: model and schema/prompt digest. */
export function seriesKey(row: { grader?: string | null; grader_digest?: string | null }): string {
  return row.grader_digest ? `${row.grader ?? "?"}@${row.grader_digest}` : UNSTAMPED;
}

/* ── the measurement ─────────────────────────────────────────────────────── */

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** mulberry32: small, seedable, and the same in every JS engine. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** P(keep outscores reject), ties half, over index multisets into `win`. */
function aucOf(win: number[][], ki: ArrayLike<number>, ri: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < ki.length; i++) {
    const row = win[ki[i]];
    for (let j = 0; j < ri.length; j++) s += row[ri[j]];
  }
  return s / (ki.length * ri.length);
}

function measure(keep: number[], reject: number[], floor: number, resamples: number, seed: number): FieldCalibration {
  const base = { n_keep: keep.length, n_reject: reject.length };
  if (keep.length < floor || reject.length < floor) return { ...base, auc: null, ci: null, status: "insufficient", short: "floor" };
  if (new Set([...keep, ...reject]).size < 2) return { ...base, auc: null, ci: null, status: "insufficient", short: "constant" };

  // win[i][j]: what keep i against reject j contributes. Computed once; every
  // resample is then a sum over sampled indices.
  const win = keep.map((k) => reject.map((r) => (k > r ? 1 : k === r ? 0.5 : 0)));
  const auc = aucOf(
    win,
    keep.map((_, i) => i),
    reject.map((_, j) => j),
  );

  // Seeded per field, not per process: a bucket's CI must not depend on which
  // buckets happened to be computed before it.
  const rand = prng(seed);
  const ki = new Uint32Array(keep.length);
  const ri = new Uint32Array(reject.length);
  const draws: number[] = [];
  for (let b = 0; b < resamples; b++) {
    for (let i = 0; i < ki.length; i++) ki[i] = Math.floor(rand() * keep.length);
    for (let j = 0; j < ri.length; j++) ri[j] = Math.floor(rand() * reject.length);
    draws.push(aucOf(win, ki, ri));
  }
  draws.sort((x, y) => x - y);
  const tail = (1 - CALIBRATION_METHOD.level) / 2;
  const at = (q: number) => draws[Math.min(draws.length - 1, Math.max(0, Math.floor(q * draws.length)))];
  const ci: [number, number] = [round3(at(tail)), round3(at(1 - tail))];

  const m = CALIBRATION_METHOD.margin;
  const status: CalibrationStatus =
    ci[0] > 0.5 && auc >= 0.5 + m ? "calibrated" : ci[1] < 0.5 && auc <= 0.5 - m ? "inverted" : "chance";
  return { ...base, auc: round3(auc), ci, status };
}

/** A field's value on a row, oriented so that higher always predicts keep. */
function oriented(row: CalibrationRow, f: GradeField): number | null {
  return orient(row[f], f);
}

function orient(v: number | boolean | null | undefined, f: GradeField): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "boolean" ? (v ? 1 : 0) : v;
  return POLARITY[f] === 1 ? n : 1 - n;
}

function report(rs: CalibrationRow[], f: GradeField, floor: number, resamples: number, seed: number): FieldCalibration {
  const keep: number[] = [];
  const reject: number[] = [];
  for (const r of rs) {
    const v = oriented(r, f);
    if (v === null) continue;
    (r.verdict === "keep" ? keep : reject).push(v);
  }
  return measure(keep, reject, floor, resamples, seed);
}

/** Calibrate one grader series against the human verdicts in `rows`. */
export function calibrate(
  rows: readonly CalibrationRow[],
  opts: { series?: string; floor?: number; resamples?: number; seed?: number } = {},
): Calibration {
  const series = opts.series ?? UNSTAMPED;
  const floor = opts.floor ?? CALIBRATION_METHOD.floor;
  const resamples = opts.resamples ?? CALIBRATION_METHOD.resamples;
  const seed = opts.seed ?? CALIBRATION_METHOD.seed;

  const mine: CalibrationRow[] = [];
  const other_graders: Record<string, number> = {};
  for (const r of rows) {
    const k = seriesKey(r);
    if (k === series) mine.push(r);
    else other_graders[k] = (other_graders[k] ?? 0) + 1;
  }

  const mechanisms = [...new Set(mine.map((r) => r.mechanism))].sort();
  const fields = {} as Record<GradeField, FieldReport>;
  for (const f of GRADE_FIELDS) {
    const by_mechanism: Record<string, FieldCalibration> = {};
    for (const m of mechanisms)
      by_mechanism[m] = report(
        mine.filter((r) => r.mechanism === m),
        f,
        floor,
        resamples,
        seed,
      );
    fields[f] = { all: report(mine, f, floor, resamples, seed), by_mechanism };
  }
  return { series, n: mine.length, fields, other_graders };
}

/** Every series the ledger holds, each measured on its own rows -- the shape of
 *  pipeline/foundry/grader-calibration.json. No timestamp, deliberately: the
 *  same ledger must give the same bytes. */
export function calibrationFile(rows: readonly CalibrationRow[]): GraderCalibrationFile {
  const keys = [...new Set(rows.map(seriesKey))].sort();
  const series: Record<string, Calibration> = {};
  for (const k of keys) series[k] = calibrate(rows, { series: k });
  return { method: CALIBRATION_METHOD, ledger_rows: rows.length, series };
}

/* ── the readers ─────────────────────────────────────────────────────────── */

/** A field's status for one mechanism: that mechanism's own bucket when it is
 *  measured, the pooled one when the bucket is too thin to say. */
export function fieldStatus(cal: Calibration | null | undefined, f: GradeField, mechanism?: string): CalibrationStatus {
  if (!cal) return "insufficient";
  const own = mechanism ? cal.fields[f].by_mechanism[mechanism] : undefined;
  return own && own.status !== "insufficient" ? own.status : cal.fields[f].all.status;
}

/** Whether a meter should still be drawn as a measurement. An inverted or
 *  chance field is measured and known not to predict; an insufficient one is
 *  simply unknown, and stays drawn. */
export function misleads(status: CalibrationStatus | undefined): boolean {
  return status === "inverted" || status === "chance";
}

/** A candidate's value on a field, as the ledger row would carry it. */
function valueOf(c: Candidate, f: GradeField): number | boolean | null {
  const g = c.grade;
  if (!g) return null;
  if (f === "craft") return g.craft?.score ?? null;
  if (f === "style_score") return g.style?.score ?? null;
  return g.veto ? g.veto.has_text : null;
}

/**
 * The order a cull should visit candidates in: best first, by the CALIBRATED
 * fields only. An inverted or chance field contributes nothing -- reading an
 * inverted craft score as "better" is precisely the steer this module exists
 * to stop. A candidate with no calibrated value keeps its place after the
 * scored ones; with nothing calibrated at all the run's own order is returned
 * untouched.
 */
export function cullOrder(candidates: readonly Candidate[], cal: Calibration | null | undefined): string[] {
  const scored = candidates.map((c, i) => {
    let sum = 0;
    let n = 0;
    for (const f of GRADE_FIELDS) {
      if (fieldStatus(cal, f, c.mechanism) !== "calibrated") continue;
      const v = orient(valueOf(c, f), f);
      if (v === null) continue;
      sum += v;
      n++;
    }
    return { id: c.id, i, score: n ? sum / n : null };
  });
  scored.sort((a, b) => {
    if (a.score === null || b.score === null) return a.score === null && b.score === null ? a.i - b.i : a.score === null ? 1 : -1;
    return b.score - a.score || a.i - b.i;
  });
  return scored.map((s) => s.id);
}
