import type { Calibration, Candidate } from "@gt/domain/candidate";

// DOES THE GRADER PREDICT THE OPERATOR? - the pure measurement.
//
// Absorbed from lib/foundry/calibration.ts, every threshold kept with its
// reason, and generalised from three hard-coded forge fields to any
// (grader series, field) pair: v1 measured on 2026-10-05 that craft ranked
// kept against rejected BACKWARDS (AUC 0.29) and style sat at chance (0.58),
// while the meters under every tile steered the curator by them. Plan §3.2
// turns that one finding into a rule: every machine score is registered in a
// series and shown only when calibrated.
//
// WHAT IS MEASURED, unchanged: the AUC of "a kept candidate outscores a
// rejected one" over every kept/rejected pair, ties half. Rank, not score -
// vision judges rank reliably and score unreliably, so the scale is noise and
// the ordering is the signal. The CI is a stratified percentile bootstrap
// (keeps and rejects resampled separately, so every resample keeps both
// classes).
//
// UPGRADED: the random source and the resample count are PARAMETERS. v1 fixed
// a seed inside the module (20261005), which made its file byte-stable but
// left no way to ask "is this status an artefact of the seed?". The method's
// defaults are still v1's, so the same labels give the same status.
//
// Status, exactly as v1 decides it (measurement-honesty: minimum-sample-floors,
// unmeasurable-vs-zero):
//   insufficient  fewer than `floor` keeps or rejects ("floor"), or the field
//                 never varied ("constant") - no AUC at all, never a number
//                 that looks like a measurement
//   calibrated    CI above 0.5 AND the AUC clears 0.5 + margin
//   inverted      CI below 0.5 AND the AUC is under 0.5 - margin
//   chance        everything else
// The margin keeps a large, tight, useless AUC (0.52 over ten thousand rows)
// from steering a cull; the floor (eight keeps and eight rejects, v1's) keeps
// a handful of labels from reading as a finding.

export type Method = {
  /** Minimum keeps AND rejects before a field is measured at all. */
  readonly floor: number;
  readonly resamples: number;
  readonly level: number;
  readonly margin: number;
};

/** v1's CALIBRATION_METHOD, kept. */
export const CALIBRATION_METHOD: Method = { floor: 8, resamples: 2000, level: 0.95, margin: 0.1 };
/** v1's fixed seed, kept as the default so a series reads the same as it did. */
export const DEFAULT_SEED = 20261005;

/** mulberry32 (v1's): small, seedable, the same in every JS engine. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round3 = (x: number): number => Math.round(x * 1000) / 1000;

/** P(keep outscores reject), ties half, over index multisets into `win`. */
function aucOf(win: readonly (readonly number[])[], ki: ArrayLike<number>, ri: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < ki.length; i++) {
    const row = win[ki[i] ?? 0];
    if (row === undefined) continue;
    for (let j = 0; j < ri.length; j++) s += row[ri[j] ?? 0] ?? 0;
  }
  return s / (ki.length * ri.length);
}

/**
 * One field's calibration from its labelled values (already oriented: higher
 * predicts keep). `rng` is consumed only past the floor, so an insufficient
 * series costs nothing and draws nothing.
 */
export function measure(keep: readonly number[], reject: readonly number[], rng: () => number, method: Method = CALIBRATION_METHOD): Calibration {
  const nKeep = keep.length;
  const nReject = reject.length;
  if (nKeep < method.floor || nReject < method.floor) return { status: "insufficient", short: "floor", nKeep, nReject };
  if (new Set([...keep, ...reject]).size < 2) return { status: "insufficient", short: "constant", nKeep, nReject };

  const win = keep.map((k) => reject.map((r) => (k > r ? 1 : k === r ? 0.5 : 0)));
  const auc = aucOf(win, keep.map((_, i) => i), reject.map((_, j) => j));
  const ki = new Uint32Array(nKeep);
  const ri = new Uint32Array(nReject);
  const draws: number[] = [];
  for (let b = 0; b < method.resamples; b++) {
    for (let i = 0; i < nKeep; i++) ki[i] = Math.floor(rng() * nKeep);
    for (let j = 0; j < nReject; j++) ri[j] = Math.floor(rng() * nReject);
    draws.push(aucOf(win, ki, ri));
  }
  draws.sort((x, y) => x - y);
  const tail = (1 - method.level) / 2;
  const at = (q: number): number => draws[Math.min(draws.length - 1, Math.max(0, Math.floor(q * draws.length)))] ?? auc;
  const ci: [number, number] = [round3(at(tail)), round3(at(1 - tail))];
  const m = method.margin;
  const a = round3(auc);
  if (ci[0] > 0.5 && auc >= 0.5 + m) return { status: "calibrated", auc: a, ci, nKeep, nReject };
  if (ci[1] < 0.5 && auc <= 0.5 - m) return { status: "inverted", auc: a, ci, nKeep, nReject };
  return { status: "chance", auc: a, ci, nKeep, nReject };
}

/** +1: a higher value predicts keep. -1: a veto (v1 `has_text`), so a higher
 *  value predicts reject. A series declares it; it is never inferred, or an
 *  inverted field would be "corrected" into a calibrated one. */
export type Polarity = 1 | -1;

/** v1's orientation: `1 - v` keeps a 0/1 veto on the 0/1 scale and reverses
 *  the rank of any other number, which is all an AUC reads. */
export const orient = (v: number, polarity: Polarity): number => (polarity === 1 ? v : 1 - v);

/** One labelled observation: the grader's value, the operator's verdict on it,
 *  and an optional stratum (v1's mechanism). */
export type Labelled = { readonly value: number; readonly verdict: "keep" | "reject"; readonly stratum?: string };

export type SeriesReport = {
  readonly all: Calibration;
  /** Per stratum, each measured on its own rows. */
  readonly byStratum: ReadonlyMap<string, Calibration>;
};

/**
 * A series' calibration, pooled and per stratum. Each bucket draws from a
 * fresh `rngFor()`, so a bucket's CI does not depend on which buckets were
 * measured before it (v1: "seeded per field, not per process").
 */
export function measureSeries(rows: readonly Labelled[], polarity: Polarity, rngFor: () => () => number, method: Method = CALIBRATION_METHOD): SeriesReport {
  const split = (rs: readonly Labelled[]): Calibration => {
    const keep: number[] = [];
    const reject: number[] = [];
    for (const r of rs) (r.verdict === "keep" ? keep : reject).push(orient(r.value, polarity));
    return measure(keep, reject, rngFor(), method);
  };
  const strata = [...new Set(rows.flatMap((r) => (r.stratum === undefined ? [] : [r.stratum])))].sort();
  const byStratum = new Map<string, Calibration>();
  for (const s of strata) byStratum.set(s, split(rows.filter((r) => r.stratum === s)));
  return { all: split(rows), byStratum };
}

/**
 * The status a Candidate's grade is stamped with: the stratum's own bucket
 * when it is measured, the pooled one when that bucket is too thin to say
 * (v1 `fieldStatus`). An `inverted` bucket is NOT replaced by a calibrated
 * pool - v1's risk note was that an inversion can be one mechanism's artefact,
 * and the pool would hide exactly that.
 */
export function gradeStatus(report: SeriesReport, stratum?: string): Calibration {
  const own = stratum === undefined ? undefined : report.byStratum.get(stratum);
  return own !== undefined && own.status !== "insufficient" ? own : report.all;
}

/**
 * The order a cull visits candidates in: best first, by CALIBRATED grades only
 * (the status each grade carries). An inverted or chance grade contributes
 * nothing - reading an inverted craft score as "better" is the steer v1 was
 * built to stop. A candidate with no calibrated grade keeps its place after the
 * scored ones; with nothing calibrated the packet's own order comes back.
 */
export function cullOrder(candidates: readonly Pick<Candidate, "id" | "grades">[], polarity: (field: string) => Polarity = () => 1): string[] {
  const scored = candidates.map((c, i) => {
    let sum = 0;
    let n = 0;
    for (const g of c.grades) {
      if (g.calibration.status !== "calibrated") continue;
      sum += orient(g.value, polarity(g.field));
      n++;
    }
    return { id: c.id, i, score: n > 0 ? sum / n : null };
  });
  scored.sort((a, b) => {
    if (a.score === null || b.score === null) return a.score === null && b.score === null ? a.i - b.i : a.score === null ? 1 : -1;
    return b.score - a.score || a.i - b.i;
  });
  return scored.map((s) => s.id);
}
