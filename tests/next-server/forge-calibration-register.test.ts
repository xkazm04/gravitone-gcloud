import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { labelsOf, measureRegistered } from "@gt/kernel/calibration/series";
import { openPacket, patchMany } from "@gt/kernel/decision/driver";

import { forgeDecisionKey, registerRunGrades, scoresOfRun } from "../../lib/foundry/calibrationRegister.ts";
import { seriesKey } from "../../lib/foundry/calibration.ts";
import type { Candidate, Grade } from "../../lib/foundry/types.ts";
import { agent, MODULES, operator, packet, pid } from "../../packages/kernel/test/decision.fixtures.ts";
import { must, steppingClock, templateStores } from "../../packages/kernel/test/helpers.ts";

// STAGE 1 OF foundry-forge-A: a forge commit registers the run's grades in the kernel's
// calibration series (lib/foundry/calibrationRegister.ts), keyed by the Board's decision
// keys. The grader is a fixture; nothing is spent and no v1 file is touched.

const tpl = templateStores(MODULES, { clock: steppingClock() });
afterAll(() => tpl.dispose());

const RUN = "2026-10-19-fixture";
const PACKET = `pkt:forge:${RUN}`;
const GRADER = { grader: "qwen3-vl", grader_digest: "abc123" };
const SERIES = "qwen3-vl@abc123";

const grade = (craft: number | null, style: number | null, hasText: boolean | null, stamp: Partial<Grade> = GRADER): Grade => ({
  grader: "qwen3-vl",
  at: "2026-10-19T10:00:00.000Z",
  craft: craft === null ? null : { score: craft, per_field: {}, annotation: {} },
  style: style === null ? null : { score: style, per_field: {}, readback: {} as never },
  veto: hasText === null ? null : { has_text: hasText },
  unmeasured: [],
  ...stamp,
});
const cand = (id: string, status: Candidate["status"], g: Grade | null): Candidate => ({ id, scene: "s1", style: "painted-3d", mechanism: "text", seed: 7, file: `${id}.png`, sidecar: `${id}.json`, status, grade: g, error: null });

const a = "s1/a--text--s7";
const b = "s1/b--text--s7";
const candidates = [cand(a, "graded", grade(0.9, 0.7, false)), cand(b, "graded", grade(0.2, 0.4, true))];
const run = (over: { candidates?: Candidate[]; forge?: { skip_grade?: boolean } } = {}) => ({ id: RUN, candidates, ...over });

function opened() {
  const s = tpl.fresh();
  must(s.tx((t) => openPacket(t, { packet: packet(PACKET, "matrix-cull", [{ id: a, row: "s1" }, { id: b, row: "s1" }]) }, agent)));
  return s;
}

describe("a forge commit registers its grades in the calibration series", () => {
  it("registers one score per gradable field per candidate, under the grader's series, on the Board's decision key", () => {
    const s = opened();
    expect(seriesKey(GRADER)).toBe(SERIES);
    expect(must(s.tx((t) => registerRunGrades(t, run(), "operator")))).toEqual({ registered: 6, unchanged: 0 });
    const rows = must(s.read((r) => r.all("SELECT series, field, packet_id, candidate_id, value, stratum FROM calibration_scores ORDER BY field, candidate_id")));
    expect(rows).toHaveLength(6);
    expect(new Set(rows.map((r) => r["series"]))).toEqual(new Set([SERIES]));
    expect(rows.filter((r) => r["candidate_id"] === a).map((r) => [r["field"], r["value"]])).toEqual([["craft", 0.9], ["has_text", 0], ["style_score", 0.7]]);
    expect(forgeDecisionKey(RUN, a)).toBe(`${PACKET}::${a}`);
    expect(rows.every((r) => r["packet_id"] === PACKET && r["stratum"] === "text")).toBe(true);
  });

  it("settling the same run again registers nothing new and does not throw", () => {
    const s = opened();
    must(s.tx((t) => registerRunGrades(t, run(), "operator")));
    expect(must(s.tx((t) => registerRunGrades(t, run(), "operator")))).toEqual({ registered: 0, unchanged: 6 });
    expect(must(s.read((r) => r.get("SELECT count(*) AS n FROM calibration_scores")))?.["n"]).toBe(6);
  });

  it("a re-grade by a changed grader is a new series; the same grader with another value is a typed conflict", () => {
    const s = opened();
    must(s.tx((t) => registerRunGrades(t, run(), "operator")));
    const regraded = run({ candidates: [cand(a, "graded", grade(0.1, 0.7, false, { grader_digest: "def456" })), candidates[1]!] });
    expect(must(s.tx((t) => registerRunGrades(t, regraded, "operator"))).registered).toBe(3);
    const drifted = run({ candidates: [cand(a, "graded", grade(0.5, 0.7, false)), candidates[1]!] });
    const r = s.tx((t) => registerRunGrades(t, drifted, "operator"));
    expect(!r.ok && r.error.code).toBe("conflict");
  });

  it("an operator verdict makes a label; an agent's verdict does not", () => {
    const s = opened();
    must(s.tx((t) => registerRunGrades(t, run(), "operator")));
    must(s.tx((t) => patchMany(t, { ...agent, packetId: pid(PACKET), baseRev: 0, changes: [{ key: forgeDecisionKey(RUN, b), verdict: "keep" }] })));
    expect(must(s.read((r) => labelsOf(r, SERIES, "craft")))).toEqual([]);
    must(s.tx((t) => patchMany(t, { ...operator, packetId: pid(PACKET), baseRev: 1, changes: [{ key: forgeDecisionKey(RUN, a), verdict: "keep" }] })));
    expect(must(s.read((r) => labelsOf(r, SERIES, "craft")))).toEqual([{ value: 0.9, verdict: "keep", stratum: "text" }]);
    expect(must(s.read((r) => measureRegistered(r, { series: SERIES, field: "craft", polarity: 1 }))).all.status).toBe("insufficient");
  });

  it("registers nothing for a skip_grade run, an unmeasured or failed plate, or a null score", () => {
    const s = opened();
    expect(scoresOfRun(run({ forge: { skip_grade: true } }))).toEqual([]);
    expect(must(s.tx((t) => registerRunGrades(t, run({ forge: { skip_grade: true } }), "operator")))).toEqual({ registered: 0, unchanged: 0 });
    const odd = run({ candidates: [cand(a, "unmeasured", grade(0.9, 0.7, false)), cand(b, "failed", null), cand("s1/c--text--s7", "graded", grade(0.4, null, null))] });
    expect(scoresOfRun(odd).map((x) => `${x.key.split("::")[1]}:${x.field}`)).toEqual(["s1/c--text--s7:craft"]);
    expect(must(s.read((r) => r.get("SELECT count(*) AS n FROM calibration_scores")))?.["n"]).toBe(0);
  });
});
