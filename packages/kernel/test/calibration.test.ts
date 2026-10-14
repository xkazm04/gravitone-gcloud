import { afterAll, describe, expect, it } from "vitest";
import { calibrationSchema, type Candidate } from "@gt/domain/candidate";
import { parseAt } from "@gt/domain/door";
import { CALIBRATION_METHOD, cullOrder, DEFAULT_SEED, gradeStatus, measure, measureSeries, seededRng, type Labelled } from "../src/calibration/core.ts";
import { labelsOf, measureRegistered, registerScore } from "../src/calibration/series.ts";
import { openPacket, patchMany } from "../src/decision/driver.ts";
import { agent, cid, cull, MODULES, operator, pid } from "./decision.fixtures.ts";
import { must, steppingClock, templateStores } from "./helpers.ts";

const tpl = templateStores(MODULES, { clock: steppingClock() });
afterAll(() => tpl.dispose());

// The parity pin: lib/foundry/calibration.ts `calibrate` run on 2026-10-15 over
// these exact values (field craft, one mechanism, v1's method and seed) gave
// {auc 0.818, ci [0.609, 0.964], calibrated} and, with the verdicts swapped,
// {auc 0.182, ci [0.027, 0.382], inverted}. The kernel must give the same bytes.
const KEEP = [0.81, 0.62, 0.77, 0.55, 0.9, 0.71, 0.66, 0.48, 0.83, 0.59];
const REJECT = [0.52, 0.61, 0.44, 0.7, 0.38, 0.57, 0.49, 0.65, 0.41, 0.6, 0.53];
const v1Rng = () => seededRng(DEFAULT_SEED);

describe("kernel/calibration - the measurement (v1's method, kept)", () => {
  it("reproduces v1's numbers byte for byte with v1's seed", () => {
    expect(measure(KEEP, REJECT, v1Rng())).toEqual({ status: "calibrated", auc: 0.818, ci: [0.609, 0.964], nKeep: 10, nReject: 11 });
    expect(measure(REJECT, KEEP, v1Rng())).toEqual({ status: "inverted", auc: 0.182, ci: [0.027, 0.382], nKeep: 11, nReject: 10 });
  });

  it("every status it returns is a valid domain Calibration", () => {
    for (const c of [measure(KEEP, REJECT, v1Rng()), measure(REJECT, KEEP, v1Rng()), measure([1], [0], v1Rng()), measure(Array(8).fill(1), Array(8).fill(1), v1Rng())]) {
      expect(parseAt("t", calibrationSchema, c).ok, JSON.stringify(c)).toBe(true);
    }
  });

  it("insufficient carries no AUC: below the floor of 8, or a field that never varied", () => {
    expect(measure(KEEP.slice(0, 7), REJECT, v1Rng())).toEqual({ status: "insufficient", short: "floor", nKeep: 7, nReject: 11 });
    expect(measure(Array(9).fill(0.5), Array(9).fill(0.5), v1Rng())).toEqual({ status: "insufficient", short: "constant", nKeep: 9, nReject: 9 });
  });

  it("the margin keeps a tight but useless AUC from calibrating: CI above 0.5, AUC under 0.6 is chance", () => {
    const n = 300;
    const keep = Array.from({ length: n }, (_, i) => i / n + 0.07);
    const reject = Array.from({ length: n }, (_, i) => i / n);
    const c = measure(keep, reject, v1Rng(), { ...CALIBRATION_METHOD, resamples: 300 });
    expect(c.status).toBe("chance");
    expect(c.status !== "insufficient" && c.ci[0]).toBeGreaterThan(0.5);
    expect(c.status !== "insufficient" && c.auc).toBeLessThan(0.6);
  });

  it("the RNG and the resample count are parameters: same seed, same bytes; another seed, another CI", () => {
    expect(measure(KEEP, REJECT, seededRng(7))).toEqual(measure(KEEP, REJECT, seededRng(7)));
    expect(measure(KEEP, REJECT, seededRng(7))).not.toEqual(measure(KEEP, REJECT, v1Rng()));
  });

  it("a stratum's own bucket decides when measured; a thin one falls back to the pool, an inverted one is never pooled away", () => {
    const rows: Labelled[] = [
      ...KEEP.map((value) => ({ value, verdict: "keep" as const, stratum: "ref-early" })),
      ...REJECT.map((value) => ({ value, verdict: "reject" as const, stratum: "ref-early" })),
      ...REJECT.map((value) => ({ value, verdict: "keep" as const, stratum: "ref-late" })),
      ...KEEP.map((value) => ({ value, verdict: "reject" as const, stratum: "ref-late" })),
      { value: 0.9, verdict: "keep", stratum: "thin" },
    ];
    const rep = measureSeries(rows, 1, v1Rng);
    expect(gradeStatus(rep, "ref-early").status).toBe("calibrated");
    expect(gradeStatus(rep, "ref-late").status).toBe("inverted");
    expect(gradeStatus(rep, "thin")).toEqual(rep.all);
    // A veto field (v1 has_text) declares polarity -1: the same values read backwards.
    expect(measureSeries(rows.filter((r) => r.stratum === "ref-late"), -1, v1Rng).all.status).toBe("calibrated");
  });
});

describe("kernel/calibration - cullOrder ranks by calibrated grades only", () => {
  const cand = (id: string, grades: { field: string; value: number; status: "calibrated" | "inverted" }[]): Pick<Candidate, "id" | "grades"> => ({
    id: cid(id),
    grades: grades.map((g) => ({
      field: g.field,
      value: g.value,
      series: "s",
      calibration: g.status === "calibrated" ? { status: "calibrated", auc: 0.8, ci: [0.6, 0.9], nKeep: 9, nReject: 9 } : { status: "inverted", auc: 0.29, ci: [0.1, 0.4], nKeep: 9, nReject: 9 },
    })),
  });
  it("an inverted grade contributes nothing; an ungraded candidate keeps its place after the scored ones", () => {
    const order = cullOrder([
      cand("a", [{ field: "craft", value: 0.99, status: "inverted" }]),
      cand("b", [{ field: "style_score", value: 0.4, status: "calibrated" }]),
      cand("c", [{ field: "style_score", value: 0.8, status: "calibrated" }, { field: "craft", value: 0.01, status: "inverted" }]),
      cand("d", []),
    ]);
    expect(order).toEqual(["c", "b", "a", "d"]);
    expect(cullOrder([cand("x", []), cand("y", [])])).toEqual(["x", "y"]);
  });
});

describe("kernel/calibration - the registered series", () => {
  const P = pid("run-0412");
  function graded() {
    const s = tpl.fresh();
    must(s.tx((t) => openPacket(t, { packet: cull() }, agent)));
    const values: Record<string, number> = { "s1/a": 0.9, "s1/b": 0.2, "s1/c": 0.6, "s2/a": 0.8, "s2/b": 0.1, "s2/c": 0.5 };
    must(s.tx((t) => {
      for (const [c, v] of Object.entries(values)) registerScore(t, { series: "gemini@abc123", field: "craft", key: `run-0412::${c}`, value: v }, "grader");
    }));
    return s;
  }

  it("labels are the OPERATOR's newest verdicts; an agent's verdict and an undecided key are not labels", () => {
    const s = graded();
    must(s.tx((t) => patchMany(t, { ...agent, packetId: P, baseRev: 0, changes: [{ key: "run-0412::s1/a", verdict: "reject" }, { key: "run-0412::s1/c", verdict: "keep" }] })));
    must(s.tx((t) => patchMany(t, { ...operator, packetId: P, baseRev: 1, changes: [{ key: "run-0412::s1/a", verdict: "keep" }, { key: "run-0412::s1/b", verdict: "reject" }] })));
    expect(must(s.read((r) => labelsOf(r, "gemini@abc123", "craft")))).toEqual([
      { value: 0.9, verdict: "keep" },
      { value: 0.2, verdict: "reject" },
    ]);
    expect(must(s.read((r) => measureRegistered(r, { series: "gemini@abc123", field: "craft", polarity: 1 }))).all.status).toBe("insufficient");
  });

  it("a score is a measurement: the same again is a no-op, another value is a conflict (a re-grade is a new series)", () => {
    const s = graded();
    expect(must(s.tx((t) => registerScore(t, { series: "gemini@abc123", field: "craft", key: "run-0412::s1/a", value: 0.9 }, "grader")))).toBe(false);
    const again = s.tx((t) => registerScore(t, { series: "gemini@abc123", field: "craft", key: "run-0412::s1/a", value: 0.3 }, "grader"));
    expect(!again.ok && again.error.code).toBe("conflict");
    expect(s.tx((t) => registerScore(t, { series: "g", field: "craft", key: "run-0412::s1/a", value: Number.NaN }, "grader")).ok).toBe(false);
  });
});
