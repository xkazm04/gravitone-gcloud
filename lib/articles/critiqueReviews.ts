// The reviewers' round: every reviewer of the panel reads the post, blind to the others,
// once each, with one retry when its answer is not a review. Its own file because it is the
// only part of the critique that runs more than one agent at a time.

import { copyFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { REVIEW_PROMPT_FILE as REVIEW_MD } from "@/lib/agent/cliSeam";
import { REVIEW_EXPERIMENT_DIR } from "@/lib/agent/reviewerEngines";

import { readCritiqueDetail, roundDir, summarizeCritique, type ReviewerPanel, validateReview } from "./critique";
import { copyDir, fileExists } from "./files";
import { standardForPrompt } from "./critiqueTurn";
import { copyExperimentText, makeReviewerWorkspace, runTrial } from "./agentSteps";
import { buildReviewPrompt, loadReviewPromptFile } from "./prompt";
import { readJsonFile, readRun, readTextFile, runDir, updateRun, writeFileAtomic, writeJsonAtomic } from "./store";
import { StepError, sumCost } from "./stepFailure";
import type { Review, ReviewerReceipt, ReviewerSpec } from "./types";
import type { EngineDeps } from "./engine";

/** Fewer reviewers completed a round than the panel's quorum. */
class QuorumError extends StepError {}

export async function syncCritiqueSummary(id: string, deps: EngineDeps): Promise<void> {
  const summary = summarizeCritique(await readCritiqueDetail(runDir(id)));
  if (summary) await updateRun(id, (r) => ({ ...r, critique: summary }), deps.now);
}

/** Every file under a directory with its size and mtime — what a reviewer's
 *  workspace held before it ran, to say what it wrote. */
async function snapshotTree(root: string, rel = ""): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(path.join(root, rel), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const child = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) for (const [k, v] of await snapshotTree(root, child)) out.set(k, v);
    else {
      const s = await stat(path.join(root, child)).catch(() => null);
      out.set(child, s ? `${s.size}:${s.mtimeMs}` : "?");
    }
  }
  return out;
}

export async function reviewRound(id: string, round: number, panel: ReviewerPanel, deps: EngineDeps): Promise<number | undefined> {
  const dir = runDir(id);
  const rd = path.join(dir, ...roundDir(round).split("/"));
  const run = await readRun(id);
  const std = await standardForPrompt(id, deps);
  const file = await loadReviewPromptFile(deps.root);
  const postMd = (await readTextFile(path.join(dir, "post", "post.md"))) ?? "";
  const sourcesJson = (await readTextFile(path.join(dir, "sources.json"))) ?? "[]";
  if (!postMd.trim()) throw new StepError("there is no post/post.md to review");
  // A trial run's reviewers judge the measurement too: the METHOD lens, and the experiment's
  // text files in each workspace.
  const trial = await runTrial(run, dir);

  const pending: ReviewerSpec[] = [];
  for (const spec of panel.reviewers) if (!(await fileExists(path.join(rd, "reviews", `${spec.id}.json`)))) pending.push(spec);
  const costs = await Promise.all(
    pending.map((spec) =>
      reviewOnce(
        id,
        round,
        spec,
        deps,
        (note) =>
          buildReviewPrompt(file, {
            reviewer: spec.id,
            model: spec.model,
            effort: spec.effort,
            round,
            maxRounds: panel.maxCritiqueRounds,
            topic: run.topic,
            standard: std.text,
            standardAddress: std.address,
            today: deps.now().toISOString().slice(0, 10),
            postMd,
            sourcesJson,
            ...(trial ? { trial } : {}),
          }) + note,
        !!trial,
      ),
    ),
  );
  const cost = costs.reduce<number | undefined>((a, c) => sumCost(a, c), undefined);

  const completed: string[] = [];
  for (const spec of panel.reviewers) if (await fileExists(path.join(rd, "reviews", `${spec.id}.json`))) completed.push(spec.id);
  await syncCritiqueSummary(id, deps);
  if (completed.length < panel.minCompleted) {
    const why: string[] = [];
    for (const spec of panel.reviewers) {
      if (completed.includes(spec.id)) continue;
      const r = await readJsonFile<ReviewerReceipt | null>(path.join(rd, "receipts", `${spec.id}.json`), null);
      why.push(`${spec.id} ${r?.outcome ?? "did not run"}${r?.errors[0] ? `: ${r.errors[0]}` : ""}`);
    }
    throw new QuorumError(`critique-quorum: round ${round}: ${completed.length} of ${panel.reviewers.length} reviewers completed, ${panel.minCompleted} needed (${why.join("; ")})`, cost);
  }
  await writeJsonAtomic(path.join(rd, "closed.json"), { round, at: deps.now().toISOString(), completed });
  return cost;
}

/** One reviewer, once — plus one retry when its answer is not a review. Writes
 *  its receipt, and its review when it completed. Never throws for the
 *  reviewer's sake: a reviewer that fails is an outcome. `experiment`: the
 *  workspace also gets the trial's text files (a trial run). */
async function reviewOnce(id: string, round: number, spec: ReviewerSpec, deps: EngineDeps, prompt: (note: string) => string, experiment = false): Promise<number | undefined> {
  const dir = runDir(id);
  const rd = path.join(dir, ...roundDir(round).split("/"));
  let cost: number | undefined;
  let turns = 0;
  let durationMs = 0;
  let note = "";
  const wrote = new Set<string>();
  let receipt: ReviewerReceipt | undefined;

  for (let attempt = 1; attempt <= 2 && !receipt; attempt++) {
    const text = prompt(note);
    if (attempt === 1) await writeFileAtomic(path.join(rd, "prompts", `${spec.id}.md`), text);
    let ws = "";
    try {
      ws = await makeReviewerWorkspace(id, round, spec.id, attempt, deps.now());
      await copyDir(path.join(dir, "post"), path.join(ws, "post"));
      await copyFile(path.join(dir, "sources.json"), path.join(ws, "sources.json"));
      if (experiment) await copyExperimentText(dir, path.join(ws, REVIEW_EXPERIMENT_DIR));
      await writeFile(path.join(ws, REVIEW_MD), text, "utf8");
      const before = await snapshotTree(ws);
      const result = await deps.runReviewer({ engine: spec.engine, cwd: ws, prompt: text, model: spec.model, effort: spec.effort, timeoutMin: spec.timeoutMin });
      for (const [k, v] of await snapshotTree(ws)) if (before.get(k) !== v) wrote.add(k);
      cost = sumCost(cost, result.costUsd);
      turns += result.turns;
      durationMs += result.durationMs;
      const base = {
        id: spec.id,
        engine: spec.engine,
        model: spec.model,
        effort: spec.effort,
        round,
        attempts: attempt,
        turns,
        durationMs,
        ...(cost !== undefined ? { costUsd: Math.round(cost * 1_000_000) / 1_000_000 } : {}),
        ...(wrote.size ? { wrote: [...wrote].sort().slice(0, 20) } : {}),
      };
      if (result.outcome !== "completed") {
        receipt = { ...base, outcome: result.outcome, errors: result.errors.length ? result.errors : [`the reviewer ${result.outcome}`] };
        break;
      }
      try {
        const { review, dropped } = validateReview(result.final, spec);
        await writeJsonAtomic(path.join(rd, "reviews", `${spec.id}.json`), review satisfies Review);
        receipt = { ...base, outcome: "completed", errors: [], ...(dropped ? { dropped } : {}) };
      } catch (e) {
        const msg = (e as Error).message;
        if (attempt === 2) receipt = { ...base, outcome: "errored", errors: [`malformed review twice: ${msg}`] };
        else note = `\n\nYOUR PREVIOUS ANSWER WAS REJECTED: ${msg}. Answer again. Your whole final message is ONE JSON object matching OUTPUT above, and nothing else.\n`;
      }
    } catch (e) {
      receipt = { id: spec.id, engine: spec.engine, model: spec.model, effort: spec.effort, round, attempts: attempt, turns, durationMs, outcome: "errored", errors: [(e as Error).message] };
    } finally {
      if (ws) await rm(ws, { recursive: true, force: true }).catch(() => undefined);
    }
  }
  if (receipt) await writeJsonAtomic(path.join(rd, "receipts", `${spec.id}.json`), receipt);
  return cost;
}
