// One writer turn of the critique, and the plan that says what each phase of it may do
// (tools, timeout, turn class). Its own file because every writer turn of the critique,
// and the fix turns of the check loop, go through this one turn.

import { rm } from "node:fs/promises";
import path from "node:path";

import type { AgentTool, AgentTurnClass } from "@/lib/agent/cliSeam";

import type { ReviewerPanel } from "./critique";
import { makeWorkspace, keepOut } from "./agentSteps";
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
  const base = buildPrompt(file, phase, {
    topic: run.topic,
    standard: std.text,
    standardAddress: std.address,
    today: deps.now().toISOString().slice(0, 10),
    round,
    maxRounds: panel.maxCritiqueRounds,
    ...(opts.checkFailures !== undefined ? { checkFailures: opts.checkFailures } : {}),
  });
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
        } else note = `\n\nYOUR PREVIOUS ANSWER WAS REJECTED: ${(e as Error).message}. Write both files again, correctly.\n`;
      }
    } finally {
      await rm(ws, { recursive: true, force: true }).catch(() => undefined);
    }
  }
  return cost;
}
