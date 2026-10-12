// The writer's answers to a round's reviews, and the revision that follows its decision (a
// rewrite, after a research turn when the decision asks for one). Its own file because these
// are the writer's decisions; the reviewers and the turn plumbing are in their own files.

import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { roundDir, type ReviewerPanel, validateDecision, validateDispositions } from "./critique";
import { copyDir, fileExists } from "./files";
import { critiqueTurn } from "./critiqueTurn";
import { ingestPost } from "./ingestDraft";
import { readOutJson, validateClaims, validateSources } from "./ingestSources";
import { readJsonFile, runDir, writeJsonAtomic } from "./store";
import { StepError, sumCost } from "./stepFailure";
import type { CritiqueDecisionRecord, Review, Source } from "./types";
import type { EngineDeps } from "./engine";

/** Copy the run's critique material into a writer workspace's inputs/. */
async function stageCritiqueInputs(ws: string, dir: string, round: number, reviews: Review[], extra: ("outline" | "answers")[]): Promise<void> {
  const inputs = path.join(ws, "inputs");
  const rd = path.join(dir, ...roundDir(round).split("/"));
  await copyDir(path.join(dir, "post"), path.join(inputs, "post"));
  await copyFile(path.join(dir, "sources.json"), path.join(inputs, "sources.json"));
  await copyFile(path.join(dir, "claims.json"), path.join(inputs, "claims.json"));
  await mkdir(path.join(inputs, "reviews"), { recursive: true });
  for (const r of reviews) await writeFile(path.join(inputs, "reviews", `${r.reviewer}.json`), `${JSON.stringify(r, null, 2)}\n`, "utf8");
  if (extra.includes("outline")) await copyFile(path.join(dir, "outline.md"), path.join(inputs, "outline.md"));
  if (extra.includes("answers")) {
    await copyFile(path.join(rd, "dispositions.json"), path.join(inputs, "dispositions.json"));
    await copyFile(path.join(rd, "decision.json"), path.join(inputs, "decision.json"));
  }
}

async function roundReviews(dir: string, round: number, panel: ReviewerPanel): Promise<Review[]> {
  const rd = path.join(dir, ...roundDir(round).split("/"));
  const out: Review[] = [];
  for (const spec of panel.reviewers) {
    const r = await readJsonFile<Review | null>(path.join(rd, "reviews", `${spec.id}.json`), null);
    if (r) out.push(r);
  }
  return out;
}

export async function writerAnswers(id: string, round: number, panel: ReviewerPanel, last: boolean, deps: EngineDeps): Promise<{ cost: number | undefined; decision: CritiqueDecisionRecord }> {
  const dir = runDir(id);
  const rd = path.join(dir, ...roundDir(round).split("/"));
  const reviews = await roundReviews(dir, round, panel);
  let decision: CritiqueDecisionRecord | undefined;
  const cost = await critiqueTurn(
    id,
    round,
    "critique",
    panel,
    deps,
    (ws) => stageCritiqueInputs(ws, dir, round, reviews, []),
    async (ws) => {
      const dispositions = validateDispositions(await readOutJson(path.join(ws, "out", "dispositions.json"), "out/dispositions.json"), reviews);
      const d = validateDecision(await readOutJson(path.join(ws, "out", "decision.json"), "out/decision.json"), round, last);
      await writeJsonAtomic(path.join(rd, "dispositions.json"), dispositions);
      await writeJsonAtomic(path.join(rd, "decision.json"), d);
      decision = d;
    },
  );
  return { cost, decision: decision! };
}

/** A critique research keeps every source's number and URL: the post, the
 *  claims and any registry patch cite them by number. */
export function assertSourcesStable(before: Source[], after: Source[]): void {
  const now = new Map(after.map((s) => [s.n, s]));
  const moved = before.filter((s) => now.get(s.n)?.url !== s.url).map((s) => `[${s.n}]`);
  if (moved.length) throw new Error(`out/sources.json dropped or renumbered ${moved.join(" ")}: existing sources keep their number and URL`);
}

export async function revise(id: string, round: number, panel: ReviewerPanel, decision: CritiqueDecisionRecord, deps: EngineDeps): Promise<number | undefined> {
  const dir = runDir(id);
  const rd = path.join(dir, ...roundDir(round).split("/"));
  const reviews = await roundReviews(dir, round, panel);
  const research = decision.decision === "research";
  let cost: number | undefined;
  try {
    if (research && !(await fileExists(path.join(rd, "researched.json")))) {
      const stage = (ws: string) => stageCritiqueInputs(ws, dir, round, reviews, ["answers"]);
      const ingest = async (ws: string) => {
        const before = await readJsonFile<Source[]>(path.join(dir, "sources.json"), []);
        const sources = validateSources(await readOutJson(path.join(ws, "out", "sources.json"), "out/sources.json"));
        assertSourcesStable(before, sources);
        const claims = validateClaims(await readOutJson(path.join(ws, "out", "claims.json"), "out/claims.json"), sources);
        await writeJsonAtomic(path.join(dir, "sources.json"), sources);
        await writeJsonAtomic(path.join(dir, "claims.json"), claims);
        await writeJsonAtomic(path.join(rd, "researched.json"), { at: deps.now().toISOString(), sources: sources.length, added: sources.length - before.length });
      };
      cost = sumCost(cost, await critiqueTurn(id, round, "revise-research", panel, deps, stage, ingest));
    }
    const stage = (ws: string) => stageCritiqueInputs(ws, dir, round, reviews, ["outline", "answers"]);
    const ingest = async (ws: string) => {
      await ingestPost(ws, dir);
      await writeJsonAtomic(path.join(rd, "revised.json"), { at: deps.now().toISOString(), research });
    };
    cost = sumCost(cost, await critiqueTurn(id, round, "revise", panel, deps, stage, ingest));
    return cost;
  } catch (e) {
    // the research turn's cost survives a failed rewrite
    throw new StepError((e as Error).message, sumCost(cost, e instanceof StepError ? e.costUsd : undefined));
  }
}
