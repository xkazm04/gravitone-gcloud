// The agreement report's arithmetic (pipeline/audio-triage-agreement.mts): a person's label per check
// is "rejected AND named this check's defect"; a skip is no claim; kappa is agreement beyond chance.
import { describe, expect, it } from "vitest";

import { UNITS, type Finding, type Triage, type TriageCheck } from "@gt/domain/audio.triage";

import { agreement, kappa, type JudgedTake } from "../../pipeline/audio-triage-agreement.mts";

const f = (check: TriageCheck, verdict: Finding["verdict"], value: number | null = 1): Finding => ({ check, verdict, value, threshold: null, unit: UNITS[check] });
const tri = (...fs: Finding[]): Triage => ({ version: 1, findings: fs, flagged: fs.filter((x) => x.verdict === "flag").length });
const take = (id: string, verdict: "kept" | "rejected", reasons: string[] = []): JudgedTake => ({ id, title: id, kind: "music", verdict, reasons });

describe("agreement", () => {
  const takes = [take("a", "rejected", ["clipping"]), take("b", "kept"), take("c", "rejected", ["broken-ending"]), take("d", "kept"), take("e", "rejected", ["clipping"])];
  const triage = new Map<string, Triage>([
    ["a", tri(f("clipping", "flag", 12), f("broken-ending", "pass"))],
    ["b", tri(f("clipping", "flag", 4), f("broken-ending", "pass"))],
    ["c", tri(f("clipping", "pass", 0), f("broken-ending", "flag"))],
    ["d", tri(f("clipping", "pass", 0), f("broken-ending", "skip", null), f("section-boundary", "flag"))],
  ]);
  const a = agreement(takes, triage);

  it("scores each check against the defect it evidences, a skip excluded", () => {
    const clip = a.checks.find((x) => x.check === "clipping");
    expect(clip?.c).toEqual({ tp: 1, fp: 1, fn: 0, tn: 2 });
    expect(clip?.precision).toBe(0.5);
    expect(clip?.recall).toBe(1);
    expect(clip?.disagreements).toEqual([{ take: "b", title: "b", said: "flag", person: "no defect", value: 4 }]);
    const end = a.checks.find((x) => x.check === "broken-ending");
    expect([end?.n, end?.skipped, end?.c.tp]).toEqual([3, 1, 1]);
  });

  it("lists a judged take with no triage record instead of guessing it", () => {
    expect(a.withoutTriage).toEqual(["e"]);
  });

  it("at verdict level, an experimental flag is not a finding", () => {
    // a flag+rejected, b flag+kept, c flag+rejected, d (only section-boundary) no flag + kept
    expect(a.verdict.c).toEqual({ tp: 2, fp: 1, fn: 0, tn: 1 });
  });

  it("kappa: 1 for perfect agreement, 0 at chance, null when a rater never varies", () => {
    expect(kappa({ tp: 5, fp: 0, fn: 0, tn: 5 })).toBe(1);
    expect(kappa({ tp: 1, fp: 1, fn: 1, tn: 1 })).toBe(0);
    expect(kappa({ tp: 0, fp: 0, fn: 0, tn: 4 })).toBeNull();
  });
});
