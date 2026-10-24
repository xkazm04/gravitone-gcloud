// THE AUDIO-TRIAGE EVAL - every detector of the sidecar's `triage` verb scored against a corpus
// whose defects were injected on purpose (spark audio-triage, WP2).
//
//   npx tsx pipeline/audio-triage-eval.mts [--out <dir>] [--seed N] [--real [--real-dir D]]
//   npx tsx pipeline/audio-triage-eval.mts --corpus <dir> [--stub <answers.json>] [--out <dir>]
//   npx tsx pipeline/audio-triage-eval.mts --gate [--corpus <dir built at seed 7>] [--keep]
//
// 1. THE CORPUS. pipeline/audio/corpus.py builds it (clean bases, ten defects at three
//    severities, clean controls, labels.json) into <out>/corpus - or `--corpus` reads one already
//    built. `--real` adds real kept takes as bases, discovered read-only (corpus.py's header).
// 2. THE ANSWERS. lib/audio/sidecar.ts `triageFile` over every file, a few at a time, each judged
//    against its row's context - or `--stub` reads recorded answers ({file: {ok, triage|error}}),
//    which is how the harness's own test drives it without Python.
// 3. THE SCORE. pipeline/audio-triage-score.mts: per check TP/FP/FN/TN, precision, recall
//    (overall, per severity, at medium+high), the false-positive rate on clean controls and on
//    every negative, the threshold that would reach recall 0.9. SYNTHETIC and REAL rows are scored
//    apart: a kept take may carry a real defect of its own, so its numbers are reported, never
//    gated. Written to <out>/report.json and <out>/report.md, beside <out>/answers.json - every
//    file's answer in `--stub`'s shape, so a run can be re-scored (or a threshold replayed)
//    without spawning the sidecar again.
//
// THE GATE (`--gate`): synthetic bases only, seed GATE_SEED, offline (no vendor, no network, no
// store - the sidecar is a local process), and FLOORS below per check. Exit codes, as
// pipeline/gates.mts "012" reads them: 0 every floor holds; 1 a floor failed, each failing check
// printed with its numbers; 2 COULD NOT RUN - the corpus did not build, the labels did not parse,
// or not one file got a triage answer (the instrument is broken, and a verdict would be invented).
// The gate builds into a temp dir and removes the corpus's WAVs afterwards (`--keep` keeps them);
// the report stays, and its path is printed.
//
// The floors are DATA, per check, so the Director can set one from the eval's numbers without
// touching the arithmetic; the corpus is fixed physical amounts, so moving a threshold in
// @gt/domain/audio.triage moves the scores and never the corpus.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { Triage, TriageCheck, TriageContext } from "@gt/domain/audio.triage";
import type { Result } from "@gt/domain/errors";

import { gateFailures, parseAnswers, parseLabels, scoreAll, toMarkdown, type Answer, type CheckScore, type Floor, type LabelRow } from "./audio-triage-score.mts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const CORPUS_SCRIPT = path.join(ROOT, "pipeline", "audio", "corpus.py");
export const GATE_SEED = 7;
export const REPORT_VERSION = 1;

/** Per check: recall at medium+high at least `recallMH`, clean-control FPR at most `fprClean`. */
export const FLOORS: Readonly<Record<TriageCheck, Floor | null>> = {
  clipping: { recallMH: 0.9, fprClean: 0.05 },
  "true-peak-over": { recallMH: 0.9, fprClean: 0.05 },
  "loudness-range": { recallMH: 0.9, fprClean: 0.05 },
  "dead-air": { recallMH: 0.9, fprClean: 0.05 },
  duration: { recallMH: 0.9, fprClean: 0.05 },
  "broken-ending": { recallMH: 0.9, fprClean: 0.05 },
  "tempo-instability": { recallMH: 0.9, fprClean: 0.05 },
  // Experimental (@gt/domain/audio.triage EXPERIMENTAL_CHECKS): reported, not gated - 2026-10-24 eval
  // recall m+h 0.40, clean FPR 0.13.
  "section-boundary": null,
  "loop-seam": { recallMH: 0.9, fprClean: 0.05 },
  "mono-fold": { recallMH: 0.9, fprClean: 0.05 },
};

export type TriageFn = (file: string, context: TriageContext) => Promise<Result<Triage>>;
export type RunDeps = { readonly triage?: TriageFn; readonly log?: (line: string) => void };
export type RunResult = { readonly code: 0 | 1 | 2; readonly out: string; readonly report?: Report };

export type Report = {
  readonly version: number;
  readonly seed: number;
  readonly gate: boolean;
  readonly corpus: { readonly dir: string; readonly rows: number; readonly synthetic: number; readonly real: unknown };
  readonly answered: number;
  readonly failedFiles: readonly { readonly file: string; readonly error: string }[];
  readonly floors: Readonly<Record<TriageCheck, Floor | null>>;
  readonly synthetic: readonly CheckScore[];
  readonly real: readonly CheckScore[] | null;
  readonly failures: readonly string[] | null;
};

type Opts = { out?: string; corpus?: string; seed: number; seedGiven: boolean; real: boolean; realDir?: string; stub?: string; gate: boolean; keep: boolean; concurrency: number };

function parseArgs(argv: readonly string[]): Opts | string {
  const o: Opts = { seed: GATE_SEED, seedGiven: false, real: false, gate: false, keep: false, concurrency: Math.max(1, Math.min(6, Math.floor(os.availableParallelism() / 2))) };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = (): string | undefined => argv[++i];
    if (a === "--out") o.out = next();
    else if (a === "--corpus") o.corpus = next();
    else if (a === "--seed") {
      o.seed = Number(next());
      o.seedGiven = true;
    } else if (a === "--real") o.real = true;
    else if (a === "--real-dir") o.realDir = next();
    else if (a === "--stub") o.stub = next();
    else if (a === "--gate") o.gate = true;
    else if (a === "--keep") o.keep = true;
    else if (a === "--concurrency") o.concurrency = Number(next());
    else return `unknown argument ${a}`;
  }
  if (!Number.isInteger(o.seed)) return "--seed takes an integer";
  if (!Number.isInteger(o.concurrency) || o.concurrency < 1) return "--concurrency takes a positive integer";
  if (o.gate && (o.real || (o.seedGiven && o.seed !== GATE_SEED))) return `--gate holds the synthetic corpus at seed ${GATE_SEED}: no --real, no other --seed`;
  return o;
}

const python = (): string => process.env["PYTHON"] ?? (process.platform === "win32" ? "python" : "python3");

/** Build the corpus; the builder's own sentence on failure. */
function buildCorpus(dir: string, o: Opts): string | null {
  const args = [CORPUS_SCRIPT, "build", "--out", dir, "--seed", String(o.seed), "--json", ...(o.real ? ["--real"] : []), ...(o.realDir === undefined ? [] : ["--real-dir", o.realDir])];
  const r = spawnSync(python(), args, { encoding: "utf8", windowsHide: true, timeout: 15 * 60_000, maxBuffer: 16 * 1024 * 1024 });
  if (r.error !== undefined) return `${python()} could not start: ${r.error.message}`;
  const last = (r.stdout ?? "").trim().split(/\r?\n/).at(-1) ?? "";
  try {
    const doc = JSON.parse(last) as { ok?: boolean; error?: string };
    if (doc.ok === true && r.status === 0) return null;
    return doc.error ?? `corpus.py exited ${String(r.status)}`;
  } catch {
    return `corpus.py answered no JSON (exit ${String(r.status)}): ${(r.stderr ?? "").trim().split(/\r?\n/).slice(-3).join(" | ")}`;
  }
}

async function answerAll(rows: readonly LabelRow[], dir: string, triage: TriageFn, concurrency: number, log: (s: string) => void): Promise<Record<string, Answer>> {
  const out: Record<string, Answer> = {};
  let next = 0;
  let done = 0;
  const worker = async (): Promise<void> => {
    while (next < rows.length) {
      const row = rows[next++];
      if (row === undefined) return;
      const r = await triage(path.join(dir, row.file), row.context);
      out[row.file] = r.ok ? { ok: true, triage: r.value } : { ok: false, error: r.error.message };
      if (++done % 25 === 0 || done === rows.length) log(`triaged ${done}/${rows.length}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, worker));
  return out;
}

const pct = (v: number | null): string => (v === null ? "   -  " : `${(v * 100).toFixed(1).padStart(5)}%`);

function summary(title: string, scores: readonly CheckScore[]): string[] {
  const lines = [title, `${"check".padEnd(18)} recall m+h   FPR clean  precision`];
  for (const s of scores) lines.push(`${s.check.padEnd(18)} ${pct(s.recallMH.rate)} ${`(${s.recallMH.hit}/${s.recallMH.n})`.padEnd(7)} ${pct(s.fprClean.rate)} ${`(${s.fprClean.hit}/${s.fprClean.n})`.padEnd(7)} ${pct(s.precision)}`);
  return lines;
}

export async function run(argv: readonly string[], deps: RunDeps = {}): Promise<RunResult> {
  const lines: string[] = [];
  const say = (s: string): void => {
    lines.push(s);
    deps.log?.(s);
  };
  const done = (code: 0 | 1 | 2, report?: Report): RunResult => ({ code, out: lines.join("\n"), ...(report === undefined ? {} : { report }) });
  const o = parseArgs(argv);
  if (typeof o === "string") {
    say(`audio-triage eval: ${o}`);
    return done(2);
  }
  const out = path.resolve(o.out ?? mkdtempSync(path.join(os.tmpdir(), "audio-triage-eval-")));
  mkdirSync(out, { recursive: true });
  const built = o.corpus === undefined;
  const dir = path.resolve(o.corpus ?? path.join(out, "corpus"));
  if (built) {
    say(`building the corpus (seed ${o.seed}${o.real ? ", with real bases" : ""}) into ${dir}`);
    const why = buildCorpus(dir, o);
    if (why !== null) {
      say(`audio-triage eval COULD NOT RUN: the corpus did not build: ${why}`);
      return done(2);
    }
  }
  let text: string;
  try {
    text = readFileSync(path.join(dir, "labels.json"), "utf8");
  } catch (e) {
    say(`audio-triage eval COULD NOT RUN: ${e instanceof Error ? e.message : String(e)}`);
    return done(2);
  }
  const labels = parseLabels(text);
  if (!labels.ok) {
    say(`audio-triage eval COULD NOT RUN: ${labels.error.message}`);
    return done(2);
  }
  if (o.gate && labels.value.seed !== GATE_SEED) {
    say(`audio-triage eval COULD NOT RUN: the gate is held at seed ${GATE_SEED}; ${dir} was built at seed ${labels.value.seed}`);
    return done(2);
  }
  const rows = labels.value.rows;
  let answers: Record<string, Answer>;
  if (o.stub !== undefined) {
    const a = parseAnswers(readFileSync(o.stub, "utf8"));
    if (!a.ok) {
      say(`audio-triage eval COULD NOT RUN: ${a.error.message}`);
      return done(2);
    }
    answers = a.value;
  } else {
    const triage = deps.triage ?? (await import("../lib/audio/sidecar.ts")).triageFile;
    answers = await answerAll(rows, dir, triage, o.concurrency, say);
  }
  const failedFiles = rows.flatMap((r) => {
    const a = answers[r.file];
    if (a === undefined) return [{ file: r.file, error: "no answer" }];
    return a.ok ? [] : [{ file: r.file, error: a.error }];
  });
  const synthetic = rows.filter((r) => !r.real);
  const realRows = rows.filter((r) => r.real);
  const scores = scoreAll(synthetic, answers);
  const realScores = realRows.length === 0 ? null : scoreAll(realRows, answers);
  const failures = o.gate ? gateFailures(scores, FLOORS) : null;
  const report: Report = {
    version: REPORT_VERSION,
    seed: labels.value.seed,
    gate: o.gate,
    corpus: { dir, rows: rows.length, synthetic: synthetic.length, real: labels.value.real },
    answered: rows.length - failedFiles.length,
    failedFiles,
    floors: FLOORS,
    synthetic: scores,
    real: realScores,
    failures,
  };
  const md = [
    `# Audio triage eval - seed ${labels.value.seed}`,
    "",
    `${rows.length} files (${synthetic.length} synthetic, ${realRows.length} real); ${report.answered} answered.`,
    ...(labels.value.real.asked ? [`Real bases: ${labels.value.real.found} found${labels.value.real.reason === null ? "" : ` - ${labels.value.real.reason}`}.`] : []),
    ...failedFiles.slice(0, 10).map((f) => `- no triage for ${f.file}: ${f.error}`),
    "",
    toMarkdown("Synthetic bases (gated)", scores, failures),
    ...(realScores === null ? [] : [toMarkdown("Real bases (reported, never gated)", realScores, null)]),
  ].join("\n");
  if (o.stub === undefined) writeFileSync(path.join(out, "answers.json"), `${JSON.stringify(answers)}
`, "utf8");
  writeFileSync(path.join(out, "report.json"), `${JSON.stringify(report, null, 1)}\n`, "utf8");
  writeFileSync(path.join(out, "report.md"), md, "utf8");
  for (const l of summary("synthetic bases", scores)) say(l);
  if (realScores !== null) for (const l of summary("real bases (not gated)", realScores)) say(l);
  say(`report: ${path.join(out, "report.md")}`);
  if (o.gate && built && !o.keep) rmSync(dir, { recursive: true, force: true });
  if (rows.length > 0 && failedFiles.length === rows.length) {
    say(`audio-triage eval COULD NOT RUN: not one file got a triage answer; the first said: ${failedFiles[0]?.error ?? "?"}`);
    return done(2, report);
  }
  if (failures !== null && failures.length > 0) {
    say(`audio-triage gate FAILED - ${failures.length} problem(s):`);
    for (const f of failures) say(`  ${f}`);
    return done(1, report);
  }
  if (failures !== null) say(`audio-triage gate: every floor holds over ${synthetic.length} synthetic files (seed ${labels.value.seed}).`);
  return done(0, report);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.chdir(ROOT); // lib/audio/sidecar.ts resolves the sidecar script against the cwd
  const r = await run(process.argv.slice(2), { log: (s) => console.log(s) });
  process.exit(r.code);
}

