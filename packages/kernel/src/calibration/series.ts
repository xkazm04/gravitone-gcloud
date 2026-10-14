import { z } from "zod";
import { parseAt } from "@gt/domain/door";
import { AppError } from "@gt/domain/errors";
import { append } from "../events.ts";
import type { ModuleMigrations } from "../migrate.ts";
import type { Reader, Tx } from "../store.ts";
import { splitKey } from "../decision/schema.ts";
import { CALIBRATION_METHOD, DEFAULT_SEED, measureSeries, seededRng, type Labelled, type Method, type Polarity, type SeriesReport } from "./core.ts";

// THE CALIBRATION SERIES - where a machine score is registered, and where its
// labels come from.
//
// v1 measured calibration over pipeline/foundry/ledger.json, a file the forge
// commit rewrote with each run's verdicts copied beside its grades
// (lib/foundry/store.ts commitRun: `craft`, `style_score`, `has_text` per
// row). Two copies of the operator's verdict - the gate's map and the
// ledger's row - each correct only as long as the commit kept them in step.
//
// UPGRADED: a score is registered once, keyed by the decision key it grades,
// and its LABEL is read live from the decisions log - the operator's newest
// verdict on that key. An agent's verdict is never a label: a grader measured
// against another machine is measured against nothing (v1 `humanKeep`: "a
// model's keep is evidence, never a vote"). An undecided key is not a label
// either; it is simply not in the series yet.
//
// A score is a measurement and does not change: registering the same key again
// with the same value is a no-op, with another value a conflict. A grader that
// re-grades is a new series (v1 `seriesKey`: model @ schema/prompt digest), so
// a grader change can never hide inside the drift it is meant to detect.
//
// Depends on the decision module's tables: migrate `decisionMigrations` first.

export const calibrationMigrations: ModuleMigrations = {
  module: "calibration",
  steps: [
    {
      version: 1,
      sql: `
CREATE TABLE calibration_scores (
  series TEXT NOT NULL,
  field TEXT NOT NULL,
  packet_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  value REAL NOT NULL,
  stratum TEXT,
  at TEXT NOT NULL,
  PRIMARY KEY (series, field, packet_id, candidate_id)
) WITHOUT ROWID;`,
    },
  ],
};

const FIELD_RE = /^[a-z][a-z0-9_]*$/;

export type ScoreInput = {
  /** The grader series: model @ schema/prompt digest. */
  readonly series: string;
  readonly field: string;
  /** The decision key the score grades: `<packetId>::<candidateId>`. */
  readonly key: string;
  readonly value: number;
  /** v1's mechanism: a bucket measured on its own (core.ts gradeStatus). */
  readonly stratum?: string;
};

/** Register one machine score. Returns false when it was already registered. */
export function registerScore(t: Tx, input: ScoreInput, who: string): boolean {
  if (input.series.length === 0) throw new AppError("invalid", "calibration: a score names its grader series");
  if (!FIELD_RE.test(input.field)) throw new AppError("invalid", `calibration: field "${input.field}" is not snake_case`);
  if (!Number.isFinite(input.value)) throw new AppError("invalid", `calibration: ${input.series}/${input.field} on ${input.key} is not a finite number`);
  const k = splitKey(input.key);
  if (k === undefined) throw new AppError("invalid", `calibration: ${input.key} is not <packetId>::<candidateId>`);
  const prior = t.get("SELECT value, stratum FROM calibration_scores WHERE series = ? AND field = ? AND packet_id = ? AND candidate_id = ?", input.series, input.field, k.packet, k.candidate);
  if (prior !== undefined) {
    if (prior["value"] === input.value && (prior["stratum"] ?? undefined) === input.stratum) return false;
    throw new AppError("conflict", `calibration: ${input.series}/${input.field} on ${input.key} is already ${String(prior["value"])}; a re-grade is a new series`);
  }
  t.run("INSERT INTO calibration_scores (series, field, packet_id, candidate_id, value, stratum, at) VALUES (?, ?, ?, ?, ?, ?, ?)", input.series, input.field, k.packet, k.candidate, input.value, input.stratum ?? null, t.at);
  append(t, {
    actor: { kind: "machine", id: who },
    type: "calibration.scored",
    subject: { kind: "candidate", id: input.key },
    data: { series: input.series, field: input.field, value: input.value, ...(input.stratum === undefined ? {} : { stratum: input.stratum }) },
  });
  return true;
}

const labelRow = z.object({ value: z.number(), verdict: z.enum(["keep", "reject"]), stratum: z.string().nullable() });

/** The series' labelled observations: each score beside the operator's newest
 *  verdict on its key. */
export function labelsOf(r: Reader, series: string, field: string): Labelled[] {
  const out: Labelled[] = [];
  for (const row of r.all(
    `SELECT s.value AS value, s.stratum AS stratum, d.verdict AS verdict
       FROM calibration_scores s
       JOIN decisions d ON d.packet_id = s.packet_id AND d.candidate_id = s.candidate_id
      WHERE s.series = ? AND s.field = ? AND d.by = 'operator' AND d.verdict IS NOT NULL
        AND d.seq = (SELECT max(d2.seq) FROM decisions d2
                      WHERE d2.packet_id = s.packet_id AND d2.candidate_id = s.candidate_id AND d2.by = 'operator')
      ORDER BY s.packet_id, s.candidate_id`,
    series,
    field,
  )) {
    const p = parseAt("calibration label", labelRow, row);
    if (!p.ok) throw p.error;
    out.push(p.value.stratum === null ? { value: p.value.value, verdict: p.value.verdict } : { value: p.value.value, verdict: p.value.verdict, stratum: p.value.stratum });
  }
  return out;
}

export type SeriesSpec = { readonly series: string; readonly field: string; readonly polarity: Polarity };
export type MeasureOptions = { readonly rngFor?: () => () => number; readonly method?: Method };

/** Measure a series now. With no options it is v1's method and v1's seed, so
 *  the same labels give the same bytes. */
export function measureRegistered(r: Reader, spec: SeriesSpec, opts: MeasureOptions = {}): SeriesReport {
  const rngFor = opts.rngFor ?? (() => seededRng(DEFAULT_SEED));
  return measureSeries(labelsOf(r, spec.series, spec.field), spec.polarity, rngFor, opts.method ?? CALIBRATION_METHOD);
}
