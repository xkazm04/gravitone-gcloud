import { describe, expect, it } from "vitest";

import { TRIAGE_CHECKS, TRIAGE_THRESHOLDS, UNITS, triageAnswerSchema, triageContextSchema, type Finding, type Triage } from "../src/audio.triage.ts";
import { triageWords } from "../src/audio.triage.words.ts";
import { accept, refuse } from "./_records.ts";

const f = (check: Finding["check"], verdict: Finding["verdict"], value: number | null, extra: Partial<Finding> = {}): Finding => ({ check, verdict, value, threshold: null, unit: UNITS[check], ...extra });
const triage = (findings: Finding[]): Triage => ({ version: 1, findings, flagged: findings.filter((x) => x.verdict === "flag").length });

describe("triageWords", () => {
  it("says only what flagged, each in its unit and at its place", () => {
    const t = triage([
      f("clipping", "flag", 12, { atS: 3.25 }),
      f("true-peak-over", "flag", 0.8),
      f("dead-air", "flag", 3.1, { atS: 41 }),
      f("loudness-range", "pass", -14),
      f("tempo-instability", "skip", null, { note: "not music" }),
      f("mono-fold", "flag", 5),
    ]);
    expect(triageWords(t)).toBe("clipped run 12 at 3.3 s · true peak +0.8 dBTP · dead air 3.1 s at 41.0 s · mono -5.0 dB");
  });

  it("is null when nothing flagged - a clean take carries no line", () => {
    expect(triageWords(triage([f("clipping", "pass", 0), f("loop-seam", "skip", null)]))).toBeNull();
  });

  it("names an unmeasured loudness rather than printing a number", () => {
    expect(triageWords(triage([f("loudness-range", "flag", null)]))).toBe("loudness not measured");
  });
});

describe("the triage contract", () => {
  it("has a unit and a threshold row for every check, for every kind", () => {
    expect(Object.keys(UNITS).sort()).toEqual([...TRIAGE_CHECKS].sort());
    for (const k of Object.keys(TRIAGE_THRESHOLDS) as (keyof typeof TRIAGE_THRESHOLDS)[]) expect(Object.keys(TRIAGE_THRESHOLDS[k]).length).toBe(12);
  });

  it("refuses a context that invents a key, and a finding for a check that does not exist", () => {
    accept(triageContextSchema, { kind: "sfx", loop: true, durationS: 8 });
    refuse(triageContextSchema, { kind: "sfx", loopy: true }, "(root)");
    refuse(triageAnswerSchema, { ok: true, triage: { version: 1, flagged: 0, findings: [{ check: "vibes", verdict: "pass", value: 1, threshold: null, unit: "x" }] } }, "triage.findings.0.check");
  });
});
