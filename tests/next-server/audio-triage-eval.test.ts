// THE AUDIO-TRIAGE EVAL HARNESS, ON ITS OWN (pipeline/audio-triage-score.mts, -eval.mts,
// pipeline/audio/corpus.py). The detectors are not under test here - their numbers are the
// eval's output, not its arithmetic. What is: the scoring on a stub answer set whose confusion
// matrix is known by construction, the would-threshold, the gate's sentences, the labels door, the
// CLI's exit codes on a recorded corpus, and the corpus builder's determinism (same seed, same
// labels and the same samples). Nothing here opens a store or calls a vendor; the corpus lanes
// SKIP, saying why, when this box's Python lacks the sidecar's requirements.

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it, vi } from "vitest";

import { TRIAGE_CHECKS, UNITS, type Finding, type Triage, type TriageCheck } from "@gt/domain/audio.triage";
import { err, ok } from "@gt/domain/errors";

import { CORPUS_SCRIPT, FLOORS, GATE_SEED, run } from "../../pipeline/audio-triage-eval.mts";
import { gateFailures, parseLabels, reachedBy, scoreCheck, type Answer, type LabelRow, type Labels } from "../../pipeline/audio-triage-score.mts";

vi.setConfig({ testTimeout: 120_000 });

const tmp = mkdtempSync(path.join(tmpdir(), "audio-triage-eval-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

type Want = "flag" | "pass" | "skip";
type Verdict = Finding["verdict"];

/** A row; every check not named in `expect` is "pass" unless `dontCare` lists it. */
function row(file: string, over: Partial<LabelRow> & { dontCare?: TriageCheck[] } = {}): LabelRow {
  const { dontCare = [], ...rest } = over;
  const expect: Partial<Record<TriageCheck, Want>> = {};
  for (const c of TRIAGE_CHECKS) if (!dontCare.includes(c)) expect[c] = "pass";
  return { file, kind: "music", context: { kind: "music", durationS: 10 }, base: file, defect: null, variant: null, severity: null, amount: null, unit: null, real: false, ...rest, expect: { ...expect, ...rest.expect } };
}
const injected = (file: string, sev: "low" | "medium" | "high", over: Partial<LabelRow> & { dontCare?: TriageCheck[] } = {}): LabelRow =>
  row(file, { defect: "clipping", severity: sev, amount: 4, unit: "dB", ...over, expect: { clipping: "flag", ...over.expect } });

/** An answer whose clipping finding says `v` with `value`; every other check passes. */
function answer(v: Verdict, value: number | null = null, threshold = 3): Answer {
  const findings: Finding[] = TRIAGE_CHECKS.map((c) => ({ check: c, verdict: "pass", value: 0, threshold: 0, unit: UNITS[c] }));
  const i = findings.findIndex((f) => f.check === "clipping");
  findings[i] = { check: "clipping", verdict: v, value, threshold, unit: UNITS.clipping };
  const triage: Triage = { version: 1, findings, flagged: findings.filter((f) => f.verdict === "flag").length };
  return { ok: true, triage };
}

// The known matrix, for `clipping`:
//   medium/high positives  m1 m2 h1 flag, h2 passes            -> TP 3, FN 1 (recall m+h 3/4)
//   low positives          l1 flags, l2 skips                  -> TP 1, FN 1, one skip mismatch
//   clean controls         c1 flags, c2..c5 pass               -> FP 1, TN 4 (FPR clean 1/5)
//   other defects' rows    o1 flags, o2 passes (expect pass)   -> FP 1, TN 1 (FPR all 2/7)
//   a don't-care row       d1 flags                            -> one side flag, never scored
const ROWS: LabelRow[] = [
  injected("m1", "medium"),
  injected("m2", "medium"),
  injected("h1", "high"),
  injected("h2", "high"),
  injected("l1", "low"),
  injected("l2", "low"),
  ...["c1", "c2", "c3", "c4", "c5"].map((f) => row(f)),
  row("o1", { defect: "dead-air", severity: "high", amount: 4, unit: "s", expect: { "dead-air": "flag" } }),
  row("o2", { defect: "dead-air", severity: "high", amount: 4, unit: "s", expect: { "dead-air": "flag" } }),
  row("d1", { defect: "loudness-range", severity: "high", amount: -45, unit: "LUFS", expect: { "loudness-range": "flag" }, dontCare: ["clipping"] }),
];
const ANSWERS: Record<string, Answer> = {
  m1: answer("flag", 10),
  m2: answer("flag", 6),
  h1: answer("flag", 40),
  h2: answer("pass", 2),
  l1: answer("flag", 4),
  l2: answer("skip"),
  c1: answer("flag", 5),
  c2: answer("pass", 0),
  c3: answer("pass", 0),
  c4: answer("pass", 1),
  c5: answer("pass", 0),
  o1: answer("flag", 3),
  o2: answer("pass", 0),
  d1: answer("flag", 9),
};

describe("audio-triage score: a known confusion matrix", () => {
  const s = scoreCheck("clipping", ROWS, ANSWERS);
  it("counts TP/FP/FN/TN, skip mismatches and side flags", () => {
    expect({ tp: s.tp, fp: s.fp, fn: s.fn, tn: s.tn, skip: s.skipMismatch, side: s.sideFlags, errors: s.errors }).toEqual({ tp: 4, fp: 2, fn: 2, tn: 5, skip: 1, side: 1, errors: 0 });
  });
  it("derives precision, recall per severity and at medium+high, and both false-positive rates", () => {
    expect(s.precision).toBeCloseTo(4 / 6, 12);
    expect(s.recall).toEqual({ n: 6, hit: 4, rate: 4 / 6 });
    expect(s.recallBySeverity.low).toEqual({ n: 2, hit: 1, rate: 0.5 });
    expect(s.recallBySeverity.medium).toEqual({ n: 2, hit: 2, rate: 1 });
    expect(s.recallBySeverity.high).toEqual({ n: 2, hit: 1, rate: 0.5 });
    expect(s.recallMH).toEqual({ n: 4, hit: 3, rate: 0.75 });
    expect(s.fprClean).toEqual({ n: 5, hit: 1, rate: 0.2 });
    expect(s.fprAll).toEqual({ n: 7, hit: 2, rate: 2 / 7 });
    expect(s.misses).toEqual(["h2"]);
    expect(s.falseAlarms).toEqual(["c1"]);
  });
  it("a rate with no denominator is null, and an errored answer misses", () => {
    const e = scoreCheck("clipping", [injected("x", "high"), row("y")], { x: { ok: false, error: "audio sidecar triage: boom" } });
    expect(e.recallMH).toEqual({ n: 1, hit: 0, rate: 0 });
    expect(e.fprClean).toEqual({ n: 0, hit: 0, rate: null });
    expect(e.precision).toBeNull();
    expect(e.errors).toBe(2);
  });
  it("names the threshold that would reach recall 0.9 at medium+high, and what it would cost", () => {
    expect(reachedBy([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], "above")).toBe(2);
    expect(reachedBy([-31, -32, -33, -34, -35, -36, -37, -38, -39, -40], "below")).toBe(-32);
    expect(reachedBy([], "above")).toBeNull();
    // m+h values 10, 6, 40, 2: 90 % of four is four, so the would-threshold is the lowest, 2;
    // the clean controls' values 5, 0, 0, 1, 0 reach 2 once.
    const [w] = s.would;
    expect(w).toMatchObject({ kind: "music", variant: null, current: 3, wouldFlagAt: 2, direction: "above", n: 4, nullValues: 0, flaggedByOtherRule: 0 });
    expect(w?.cleanFprAt).toEqual({ n: 5, hit: 1, rate: 0.2 });
  });
  it("the gate names each failing check with its numbers", () => {
    const all = TRIAGE_CHECKS.map((c) => scoreCheck(c, ROWS, ANSWERS));
    const f = gateFailures(all, FLOORS);
    expect(f).toContain("clipping: recall at medium+high 75.0 % (3/4) < floor 0.9 - missed h2");
    expect(f).toContain("clipping: false-positive rate on clean controls 20.0 % (1/5) > floor 0.05 - flagged c1");
    expect(f.some((x) => x.startsWith("dead-air: recall at medium+high 0.0 % (0/2)"))).toBe(true);
    // A check with no positives at all cannot pass by default.
    expect(f).toContain("tempo-instability: no medium/high positives to measure recall on");
  });
});

const LABELS: Labels = { version: 1, seed: GATE_SEED, rate: 44100, real: { asked: false, found: 0, reason: null, skipped: [] }, rows: ROWS };

describe("audio-triage labels door", () => {
  it("reads a well-formed labels file", () => {
    const r = parseLabels(JSON.stringify(LABELS));
    expect(r.ok && r.value.rows.length).toBe(ROWS.length);
  });
  it.each([
    ["a severity without a defect", { ...ROWS[6], severity: "high" }, "rows.0.severity"],
    ["an injected defect not expected to flag", { ...ROWS[0], expect: { ...ROWS[0]?.expect, clipping: "pass" } }, "rows.0.expect.clipping"],
    ["a clean control silent on a check", { ...ROWS[6], expect: { clipping: "pass" } }, "rows.0.expect"],
    ["a check the contract does not have", { ...ROWS[6], expect: { ...ROWS[6]?.expect, hum: "pass" } }, "rows.0.expect"],
    ["a context the door refuses", { ...ROWS[6], context: { kind: "music", bpm: 120 } }, "rows.0.context"],
  ])("refuses %s, naming its path", (_name, bad, at) => {
    const r = parseLabels(JSON.stringify({ ...LABELS, rows: [bad] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message.startsWith(`audio-triage labels: ${at}`)).toBe(true);
  });
});

describe("audio-triage eval CLI on a recorded corpus", () => {
  const corpus = path.join(tmp, "corpus");
  const stub = path.join(tmp, "answers.json");
  mkdirSync(corpus, { recursive: true });
  writeFileSync(path.join(corpus, "labels.json"), JSON.stringify(LABELS), "utf8");
  writeFileSync(stub, JSON.stringify(ANSWERS), "utf8");

  it("writes report.json and report.md and exits 0 outside the gate", async () => {
    const out = path.join(tmp, "out-plain");
    const r = await run(["--corpus", corpus, "--stub", stub, "--out", out]);
    expect(r.code).toBe(0);
    const rep = JSON.parse(readFileSync(path.join(out, "report.json"), "utf8")) as { synthetic: { check: string; tp: number }[]; failures: unknown };
    expect(rep.synthetic.find((s) => s.check === "clipping")?.tp).toBe(4);
    expect(rep.failures).toBeNull();
    expect(readFileSync(path.join(out, "report.md"), "utf8")).toContain("| clipping | 4 | 2 | 2 | 5 |");
  });
  it("exits 1 under --gate, printing the failing check's numbers", async () => {
    const r = await run(["--gate", "--corpus", corpus, "--stub", stub, "--out", path.join(tmp, "out-gate")]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("clipping: recall at medium+high 75.0 % (3/4) < floor 0.9");
  });
  it("exits 2 when not one file got an answer, and refuses a gate off its seed", async () => {
    const down = async () => err<Triage>("unavailable", "audio sidecar triage: python could not start");
    const r = await run(["--corpus", corpus, "--out", path.join(tmp, "out-down")], { triage: down });
    expect(r.code).toBe(2);
    expect(r.out).toContain("not one file got a triage answer; the first said: audio sidecar triage: python could not start");
    expect((await run(["--gate", "--seed", "8"])).code).toBe(2);
  });
  it("drives the triage port once per row, with the row's context", async () => {
    const seen: string[] = [];
    const port = async (file: string, ctx: { kind: string }) => {
      seen.push(`${path.basename(file)}:${ctx.kind}`);
      const a = ANSWERS[path.basename(file)] ?? answer("pass");
      return a.ok ? ok(a.triage) : err<Triage>("unavailable", a.error);
    };
    const r = await run(["--corpus", corpus, "--out", path.join(tmp, "out-port"), "--concurrency", "3"], { triage: port });
    expect(r.code).toBe(0);
    expect(seen.sort()).toEqual(ROWS.map((x) => `${x.file}:music`).sort());
  });
});

// ── the corpus builder (Python) ────────────────────────────────────────────────────────────────

const PY = process.env["PYTHON"] ?? (process.platform === "win32" ? "python" : "python3");
const probe = spawnSync(PY, ["-c", "import numpy, scipy, soundfile, pyloudnorm"], { encoding: "utf8", windowsHide: true });
const NOT_READY = probe.status === 0 ? null : `${PY} lacks the sidecar's requirements: ${(probe.stderr || probe.error?.message || "").trim().split(/\r?\n/).at(-1)}`;
if (NOT_READY !== null) console.warn(`audio-triage corpus lanes skipped: ${NOT_READY}`);

function build(out: string, ...args: string[]): { ok: boolean; rows?: number; files?: number; error?: string } {
  const r = spawnSync(PY, [CORPUS_SCRIPT, "build", "--out", out, "--json", ...args], { encoding: "utf8", windowsHide: true, timeout: 110_000 });
  return JSON.parse((r.stdout ?? "").trim().split(/\r?\n/).at(-1) ?? "{}") as { ok: boolean };
}
const sha = (file: string): string => createHash("sha256").update(readFileSync(file)).digest("hex");

describe.skipIf(NOT_READY !== null)("audio-triage corpus: seeded, deterministic, as specified", () => {
  it("the same seed plans the same labels, which the door reads and which hold the grid", () => {
    const [a, b] = [path.join(tmp, "plan-a"), path.join(tmp, "plan-b")];
    expect(build(a, "--seed", "7", "--plan").ok).toBe(true);
    expect(build(b, "--seed", "7", "--plan").ok).toBe(true);
    const text = readFileSync(path.join(a, "labels.json"), "utf8");
    expect(readFileSync(path.join(b, "labels.json"), "utf8")).toBe(text);
    const labels = parseLabels(text);
    expect(labels.ok).toBe(true);
    if (!labels.ok) return;
    const rows = labels.value.rows;
    expect(new Set(rows.map((r) => r.file)).size).toBe(rows.length);
    // Eight clean controls of each of the five synthetic bases, and every check with at least
    // ten medium+high positives and each severity present.
    expect(rows.filter((r) => r.defect === null).length).toBe(40);
    for (const c of TRIAGE_CHECKS) {
      const pos = rows.filter((r) => r.defect === c);
      expect(pos.filter((r) => r.severity === "medium" || r.severity === "high").length, c).toBeGreaterThanOrEqual(10);
      expect(new Set(pos.map((r) => r.severity)).size, c).toBe(3);
    }
    // A clean control is expected to flag nothing.
    expect(rows.filter((r) => r.defect === null).every((r) => Object.values(r.expect).every((v) => v !== "flag"))).toBe(true);
  });
  it("the same seed renders the same samples; another seed does not", () => {
    const pick = "music-0.clean,voice-1.clipping-medium,sfx-loop-0.loop-seam-level-low,music-0.broken-ending-cut-high";
    const [a, b, c] = [path.join(tmp, "wav-a"), path.join(tmp, "wav-b"), path.join(tmp, "wav-c")];
    const ra = build(a, "--seed", "7", "--only", pick);
    expect(ra).toMatchObject({ ok: true, files: 4 });
    expect(build(b, "--seed", "7", "--only", pick).ok).toBe(true);
    expect(build(c, "--seed", "8", "--only", pick).ok).toBe(true);
    const labels = parseLabels(readFileSync(path.join(a, "labels.json"), "utf8"));
    expect(labels.ok).toBe(true);
    for (const r of labels.ok ? labels.value.rows : []) {
      expect(sha(path.join(b, r.file)), r.file).toBe(sha(path.join(a, r.file)));
      expect(sha(path.join(c, r.file)), r.file).not.toBe(sha(path.join(a, r.file)));
    }
  });
  it("--real reports the absence of real bases rather than failing", () => {
    const out = path.join(tmp, "real-none");
    const r = build(out, "--seed", "7", "--real", "--real-dir", path.join(tmp, "no-such-store"), "--only", "music-0.clean");
    expect(r.ok).toBe(true);
    const labels = JSON.parse(readFileSync(path.join(out, "labels.json"), "utf8")) as Labels;
    expect(labels.real).toMatchObject({ asked: true, found: 0 });
    expect(labels.real.reason).toContain("no files/ or mv/ under");
  });
});
