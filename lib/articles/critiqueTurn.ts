// One writer turn of the critique, and the plan that says what each phase of it may do
// (tools, timeout, turn class). Its own file because every writer turn of the critique,
// and the fix turns of the check loop, go through this one turn.

import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

import type { AgentTool, AgentTurnClass } from "@/lib/agent/cliSeam";

import { roundDir, type ReviewerPanel } from "./critique";
import { makeWorkspace, keepOut, runTrial, stageExperimentInputs } from "./agentSteps";
import { copyDir } from "./files";
import { buildPrompt, loadPromptFile } from "./prompt";
import { resolveRegistryDir, resolveStandard, standardText } from "./registryRead";
import { readRun, runDir, updateRun, writeFileAtomic, writeJsonAtomic } from "./store";
import { StepError, sumCost } from "./stepFailure";
import type { EngineDeps } from "./engine";

/** The writer's turns inside the critique: answering the reviews (no web),
 *  research again (web), rewrite (no web). */
const CRITIQUE_PLAN: Record<"critique" | "revise-research" | "revise" | "fix", { turn: AgentTurnClass; tools: AgentTool[]; timeoutMin: number; label: string }> = {
  critique: { turn: "article-critique-writer", tools: ["Read", "Write", "Edit"], timeoutMin: 30, label: "writer" },
  "revise-research": { turn: "article-research", tools: ["WebSearch", "WebFetch", "Read", "Write", "Edit"], timeoutMin: 45, label: "research" },
  revise: { turn: "article-critique-writer", tools: ["Read", "Write", "Edit"], timeoutMin: 45, label: "revise" },
  fix: { turn: "article-critique-writer", tools: ["Read", "Write", "Edit"], timeoutMin: 30, label: "fix" },
};

/** The run's standard, re-resolved now (never a stale copy), as prompt text. */
export async function standardForPrompt(id: string, deps: EngineDeps): Promise<{ text: string; address: string }> {
  const run = await readRun(id);
  const registry = deps.registry ?? resolveRegistryDir();
  const std = await resolveStandard(registry);
  if (std.standard.version !== run.standard.version || std.standard.bundleHash !== run.standard.bundleHash) {
    await updateRun(id, (r) => ({ ...r, standard: std.standard }), deps.now);
  }
  return {
    text: standardText(std),
    address: `recipes/index.json#${std.recipe.slug}@${std.recipe.version}, knowledge/${std.standard.bundle}/index.json ${std.standard.bundleHash}`,
  };
}

/** One writer turn of the critique; its receipt is agent/critique-r<n>-<label>.json. */
export async function critiqueTurn(
  id: string,
  round: number,
  phase: keyof typeof CRITIQUE_PLAN,
  panel: Pick<ReviewerPanel, "maxCritiqueRounds">,
  deps: EngineDeps,
  stage: (ws: string) => Promise<void>,
  ingest: (ws: string) => Promise<void>,
  opts: { name?: string; checkFailures?: string } = {},
): Promise<number | undefined> {
  const plan = CRITIQUE_PLAN[phase];
  const dir = runDir(id);
  const run = await readRun(id);
  const std = await standardForPrompt(id, deps);
  const file = await loadPromptFile(deps.root);
  // A trial run's every writer turn here (the answer, the re-research, the rewrite, the fix)
  // reads the experiment and carries the trial-writer section: a method finding is answered
  // from the experiment's files, never by changing a number about the arms.
  const trial = await runTrial(run, dir);
  const base = buildPrompt(file, phase, {
    topic: run.topic,
    standard: std.text,
    standardAddress: std.address,
    today: deps.now().toISOString().slice(0, 10),
    round,
    maxRounds: panel.maxCritiqueRounds,
    ...(opts.checkFailures !== undefined ? { checkFailures: opts.checkFailures } : {}),
    ...(trial ? { trial } : {}),
  })
    // The writer's answer must cover every finding of every review. The prompt said so and the
    // writer still dropped one reviewer whole, twice in a row, in two runs (2026-10-14 `gemini`,
    // 2026-10-18 `gemini4`: two seats with near-identical names). What must be complete is now
    // counted by code and stated, so the agent works from a list instead of a directory listing.
    + (phase === "critique" ? await reviewManifest(path.join(dir, roundDir(round), "reviews")) : "");
  const name = opts.name ?? `critique-r${round}-${plan.label}`;
  const who = opts.name ?? `round ${round} ${plan.label}`;
  await writeFileAtomic(path.join(dir, "agent", `${name}-prompt.md`), base);
  let cost: number | undefined;
  let note = "";
  // The writer's answer, a fix and a re-research are retried once (an invalid answer is the
  // writer's to correct); a revision that fails its ingest fails the step. A rejected
  // re-research costs a whole web turn, so its retry starts from the files it just wrote
  // and is told only what was wrong (2026-10-07: one source with no url threw away a turn
  // three times across two runs).
  const attempts = phase === "critique" || phase === "fix" || phase === "revise-research" ? 2 : 1;
  let seed: string | undefined;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const ws = await makeWorkspace(id, `${name}-${attempt}`, deps.now());
    try {
      await stage(ws);
      if (trial) await stageExperimentInputs(ws, dir);
      if (seed) await copyDir(seed, path.join(ws, "out"));
      const result = await deps.runAgent({ cwd: ws, prompt: base + note, model: run.model, effort: run.effort, tools: plan.tools, timeoutMin: plan.timeoutMin, turn: plan.turn });
      cost = sumCost(cost, result.costUsd);
      await writeJsonAtomic(path.join(dir, "agent", `${name}.json`), {
        turn: plan.turn,
        outcome: result.outcome,
        turns: result.turns,
        durationMs: result.durationMs,
        exitCode: result.exitCode,
        attempts: attempt,
        ...(result.costUsd !== undefined ? { costUsd: result.costUsd } : {}),
        errors: result.errors,
        final: result.final.slice(0, 4000),
      });
      if (result.outcome !== "completed") {
        await keepOut(ws, dir, name);
        throw new StepError(`${who}: the agent ${result.outcome}${result.errors.length ? `: ${result.errors.join("; ")}` : ""}`, cost);
      }
      try {
        await ingest(ws);
        return cost;
      } catch (e) {
        await keepOut(ws, dir, name);
        if (attempt === attempts) throw new StepError(`${who}: ${(e as Error).message}`, cost);
        if (phase === "revise-research") {
          seed = path.join(dir, "agent", `${name}-out`);
          note = `\n\nYOUR PREVIOUS ANSWER WAS REJECTED: ${(e as Error).message}. Your previous files are already in out/ (sources.json and claims.json). Correct only what the rejection names, keep every existing source's number and url exactly, and write both files again complete. Do not start the research over.\n`;
        } else if (phase === "critique") {
          // A retry that starts over re-answers everything and drops the same reviewer again
          // (2026-10-18: 53 of 65 both times, $3.28). It starts from its own files and adds
          // only what the rejection names.
          seed = path.join(dir, "agent", `${name}-out`);
          note = `\n\nYOUR PREVIOUS ANSWER WAS REJECTED: ${(e as Error).message}. Your previous dispositions.json and decision.json are already in out/. Keep every disposition already there, add exactly the ones the rejection names (read that reviewer's file in inputs/reviews/), check the count against THE FINDINGS TO ANSWER above, and write both files again complete.\n`;
        } else note = `\n\nYOUR PREVIOUS ANSWER WAS REJECTED: ${(e as Error).message}. Write both files again, correctly.\n`;
      }
    } finally {
      await rm(ws, { recursive: true, force: true }).catch(() => undefined);
    }
  }
  return cost;
}

/** The findings a critique answer must cover, counted from the round's review files: one line per
 *  reviewer (its id is the file name) with its finding ids, and the total. Empty when the round
 *  holds no reviews. */
async function reviewManifest(reviewsDir: string): Promise<string> {
  const files = (await readdir(reviewsDir).catch(() => [] as string[])).filter((f) => f.endsWith(".json")).sort();
  const rows: string[] = [];
  let total = 0;
  for (const f of files) {
    const review = JSON.parse(await readFile(path.join(reviewsDir, f), "utf8")) as { findings?: { id?: string }[] };
    const ids = (review.findings ?? []).map((x) => x.id).filter((x): x is string => typeof x === "string");
    total += ids.length;
    rows.push(`- \`${f.replace(/\.json$/, "")}\` (inputs/reviews/${f}): ${ids.length ? ids.join(", ") : "no findings"} (${ids.length})`);
  }
  if (!rows.length) return "";
  return `\n\nTHE FINDINGS TO ANSWER, counted by code from inputs/reviews/: ${total} dispositions in total, one per item below. Each reviewer id is its file name; reviewers with similar names (\`gemini\` and \`gemini4\`) are different reviewers, and each needs its own dispositions.\n${rows.join("\n")}\n`;
}
