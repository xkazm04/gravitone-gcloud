// LANE 3 — QUALITY-GATE HONESTY: a check that examined nothing must not count
// as enforcement (dynamic).
//
// gate.ts states its ONE honesty rule at the top: "The gate may never report
// `pass` for something it did not check." checkTraceability breaks it in the
// no-digit case. When a render states every figure in words (which the function
// itself notes "a spoken script states most of its figures this way"), the
// digit matcher finds nothing, so `out` is empty and the function pushes a
// synthetic `pass` — "Every digit-form figure in the render traces…" — that
// tested zero figures. runGate then counts that vacuous pass toward
// enforced = (passes+violations)/(passes+violations+unmeasured), overstating how
// much of the render was really checked.
//
// This probe feeds the ACTUAL checkTraceability three crafted renders and pins
// the corrected contract: a `pass` only when a digit-form figure was actually
// matched and cleared; when there are no digits, a `not-engaged` (which is not
// in the enforced denominator) rather than a vacuous `pass`.
import { test, expect } from "@playwright/test";
import { checkTraceability, type GateSubject } from "@/app/_phases/script/gate";
import type { Beat } from "@/app/_phases/script/types";
import type { Fact } from "@/app/_phases/_shared/notebook/types";

const beat = (text: string): Beat => ({
  at: "0:04",
  kind: "movement",
  connector: null,
  label: "beat",
  text,
});

const subject = (texts: string[]): GateSubject => ({ id: "probe-render", beats: texts.map(beat) });

const fact = (claim: string): Fact =>
  ({ id: "f1", claim, loadBearing: true, source: "probe", confidence: "high", asOf: "2026-08-18" } as unknown as Fact);

const passes = (fs: ReturnType<typeof checkTraceability>) =>
  fs.filter((f) => f.rule === "traceability" && f.verdict === "pass");
const notEngaged = (fs: ReturnType<typeof checkTraceability>) =>
  fs.filter((f) => f.rule === "traceability" && f.verdict === "not-engaged");

test("Lane3: an all-spelled-out render emits NO vacuous traceability `pass` (examined nothing)", () => {
  // No digit-form figures anywhere — the matcher finds nothing to check.
  const r = subject(["forty percent of two hundred people said yes", "one thousand and rising"]);
  const findings = checkTraceability(r, []);
  console.log(`[Lane3] no-digit render -> passes=${passes(findings).length}, not-engaged=${notEngaged(findings).length}`);
  // THE DEFECT: current code pushes a `pass` here for figures it never matched.
  expect(passes(findings)).toHaveLength(0);
  // The honest verdict for "there was nothing to trace" is not-engaged, which
  // runGate keeps OUT of the enforced denominator.
  expect(notEngaged(findings)).toHaveLength(1);
});

test("Lane3: a render whose digit-form figures all trace still earns a real `pass`", () => {
  const r = subject(["growth reached 42 percent this year"]);
  const findings = checkTraceability(r, [fact("measured growth was 42 points over the window")]);
  console.log(`[Lane3] traceable-digit render -> passes=${passes(findings).length}`);
  // A digit WAS matched and cleared: the pass is earned, not vacuous.
  expect(passes(findings)).toHaveLength(1);
  expect(notEngaged(findings)).toHaveLength(0);
});

test("Lane3: an untraceable digit is still a violation (no pass, no regression)", () => {
  const r = subject(["the figure 99 is spoken and appears in no fact"]);
  const findings = checkTraceability(r, []);
  const violations = findings.filter((f) => f.rule === "traceability" && f.verdict === "violation");
  console.log(`[Lane3] untraceable-digit render -> violations=${violations.length}, passes=${passes(findings).length}`);
  expect(violations.length).toBeGreaterThanOrEqual(1);
  expect(passes(findings)).toHaveLength(0);
});

test("Lane3: the spelled-out `unmeasured` row is always present (unchanged)", () => {
  const withDigit = checkTraceability(subject(["42 percent"]), [fact("42 points")]);
  const noDigit = checkTraceability(subject(["forty percent"]), []);
  const unmeasured = (fs: ReturnType<typeof checkTraceability>) =>
    fs.filter((f) => f.rule === "traceability" && f.verdict === "unmeasured");
  expect(unmeasured(withDigit)).toHaveLength(1);
  expect(unmeasured(noDigit)).toHaveLength(1);
});
