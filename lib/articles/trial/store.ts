// THE TRIAL STORE: one directory per trial, beside the article store.
//
//   <store parent>/article-trials/<id>/     (ARTICLES_TRIALS_DIR overrides the root)
//
// A trial is made by an agent with a shell (the article-run skill's subagent), BEFORE any
// article run exists: the engine's writer turns never get a shell (lib/agent/cliSeam.ts).
// The file layout is documented beside the types (lib/articles/types.ts, "the trial").
// Server only.
//
// The plain reads and writes (`trialsRoot`, `trialDir`, `readTrial`, `readTrialDetail`,
// `linkTrialRun`) are the shared contract every package builds on. The verbs that move a
// trial (`openTrial`, `sealTrial`, `execTrial`, `closeTrial`, `listTrials`) are implemented
// in the trial-core package.

import { readFile } from "node:fs/promises";
import path from "node:path";

import { ArticleError, readJsonFile, readTextFile, storeRoot, writeJsonAtomic } from "../store";
import type {
  TrialDetail,
  TrialExecRecord,
  TrialPrereg,
  TrialRecord,
  TrialResults,
  TrialValidity,
  TrialVerdict,
} from "../types";

export const TRIAL_ID_RE = /^[a-z0-9][a-z0-9-]{0,90}$/;

/** The files a trial directory holds, by name. A run's `experiment/` holds the same names. */
export const TRIAL_FILES = {
  record: "trial.json",
  brief: "brief",
  frame: "frame.md",
  validity: "validity.json",
  prereg: "prereg.json",
  seal: "seal.json",
  harness: "harness",
  execs: "exec.jsonl",
  results: "results.json",
  verdict: "verdict.json",
  report: "REPORT.md",
} as const;

export function trialsRoot(): string {
  const env = process.env.ARTICLES_TRIALS_DIR?.trim();
  if (env) return path.resolve(env);
  return path.join(path.dirname(path.resolve(storeRoot())), "article-trials");
}

export function trialDir(id: string): string {
  if (!TRIAL_ID_RE.test(id)) throw new ArticleError(`not a trial id: ${JSON.stringify(id)}`, 400, "bad-trial-id");
  return path.join(trialsRoot(), id);
}

export async function readTrial(id: string): Promise<TrialRecord> {
  const rec = await readJsonFile<TrialRecord | null>(path.join(trialDir(id), TRIAL_FILES.record), null);
  if (!rec) throw new ArticleError(`no trial ${id}`, 404, "no-trial");
  return rec;
}

/** Record the run written around a trial. Refuses a second, different run. */
export async function linkTrialRun(id: string, runId: string, now: Date = new Date()): Promise<TrialRecord> {
  const rec = await readTrial(id);
  if (rec.runId && rec.runId !== runId) throw new ArticleError(`trial ${id} already belongs to run ${rec.runId}`, 409, "trial-taken");
  const next: TrialRecord = { ...rec, runId, updatedAt: now.toISOString() };
  await writeJsonAtomic(path.join(trialDir(id), TRIAL_FILES.record), next);
  return next;
}

/** `exec.jsonl`, oldest first. A line that does not parse throws: the log is evidence. */
export async function readExecs(dir: string): Promise<TrialExecRecord[]> {
  const raw = await readTextFile(path.join(dir, TRIAL_FILES.execs));
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l, i) => {
      try {
        return JSON.parse(l) as TrialExecRecord;
      } catch {
        throw new ArticleError(`${TRIAL_FILES.execs} line ${i + 1} is not JSON`, 500, "corrupt-file");
      }
    });
}

/** The context NAMES in this repo's `.ai/registry-map.json` that a subject governs.
 *  An absent or unreadable map is an empty list: the gate says "none known", never guesses. */
export async function governsHere(slug: string, root: string = process.cwd()): Promise<string[]> {
  let map: { subjectIndex?: Record<string, string[]>; contexts?: { context: string; name: string }[] };
  try {
    map = JSON.parse(await readFile(path.join(root, ".ai", "registry-map.json"), "utf8"));
  } catch {
    return [];
  }
  const ids = map.subjectIndex?.[slug] ?? [];
  const names = new Map((map.contexts ?? []).map((c) => [c.context, c.name]));
  return [...new Set(ids.map((id) => names.get(id)).filter((n): n is string => !!n))].sort();
}

/** A trial's files read back from `dir`: a trial directory or a run's `experiment/`.
 *  `undefined` when the directory holds no verdict (a classic run, an unclosed trial). */
export async function readTrialDetail(dir: string, root: string = process.cwd()): Promise<TrialDetail | undefined> {
  const verdict = await readJsonFile<TrialVerdict | null>(path.join(dir, TRIAL_FILES.verdict), null);
  if (!verdict) return undefined;
  const prereg = await readJsonFile<TrialPrereg | null>(path.join(dir, TRIAL_FILES.prereg), null);
  const results = await readJsonFile<TrialResults | null>(path.join(dir, TRIAL_FILES.results), null);
  if (!prereg || !results) throw new ArticleError(`${dir} has a verdict but no ${!prereg ? TRIAL_FILES.prereg : TRIAL_FILES.results}`, 500, "trial-incomplete");
  const validity = await readJsonFile<TrialValidity | null>(path.join(dir, TRIAL_FILES.validity), null);
  const report = await readTextFile(path.join(dir, TRIAL_FILES.report));
  return {
    prereg,
    verdict,
    results,
    ...(validity ? { validity } : {}),
    execs: await readExecs(dir),
    ...(report !== undefined ? { report } : {}),
    governsHere: await governsHere(prereg.subject.slug, root),
  };
}

/* ── the verbs (trial-core package) ────────────────────────────────────────── */

const notYet = (what: string): never => {
  throw new ArticleError(`${what} is not implemented yet`, 501, "not-implemented");
};

/** `trial open <bundle/slug>`: a new trial directory with `brief/` written from the registry. */
export async function openTrial(subject: { bundle: string; slug: string }, now: Date = new Date()): Promise<TrialRecord> {
  void subject;
  void now;
  return notYet("openTrial");
}

/** Every trial, newest first. */
export async function listTrials(): Promise<TrialRecord[]> {
  return notYet("listTrials");
}

/** Validate prereg.json and write seal.json; the trial becomes `sealed`. */
export async function sealTrial(id: string, now: Date = new Date()): Promise<TrialRecord> {
  void id;
  void now;
  return notYet("sealTrial");
}

/** Run one command in the trial's harness/ under the seat-only, credential-stripped
 *  environment and the wall-time cap; append its record to exec.jsonl. */
export async function execTrial(id: string, cmd: string[], opts: { pilot?: boolean } = {}): Promise<TrialExecRecord> {
  void id;
  void cmd;
  void opts;
  return notYet("execTrial");
}

/** Validate results.json against the sealed prereg, compute and write verdict.json; the trial
 *  becomes `closed`. A `void` verdict appends a registry lead. */
export async function closeTrial(id: string, now: Date = new Date()): Promise<TrialVerdict> {
  void id;
  void now;
  return notYet("closeTrial");
}
