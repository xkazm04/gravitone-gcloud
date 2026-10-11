// The writer's three agent steps (research, outline, draft): each one's workspace, prompt,
// turn and ingest, and the reviewer workspace the critique uses. Its own file because each
// step has the same shape: stage inputs, run one agent turn, ingest what it wrote to out/.

import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { AgentTool, AgentTurnClass } from "@/lib/agent/cliSeam";

import { copyDir } from "./files";
import { ingestDraft } from "./ingestDraft";
import { ingestOutline, ingestResearch } from "./ingestSources";
import { buildPrompt, loadPromptFile, PROMPT_FILE, type PromptPhase } from "./prompt";
import { reworkSection } from "./rework";
import { type RegistryLocation, type ResolvedStandard, resolveRegistryDir, resolveStandard, resolveTopicSubject, standardText } from "./registryRead";
import { readRun, runDir, updateRun, writeFileAtomic, writeJsonAtomic } from "./store";
import { StepError } from "./stepFailure";
import { uniqueDir } from "./tempDir";
import type { ArticleRun, StepName } from "./types";
import type { EngineDeps } from "./engine";

type WriterStep = Exclude<StepName, "check" | "critique">;

const STEP_PLAN: Record<WriterStep, { phase: PromptPhase; turn: AgentTurnClass; tools: AgentTool[]; timeoutMin: number }> = {
  research: { phase: "research", turn: "article-research", tools: ["WebSearch", "WebFetch", "Read", "Write", "Edit"], timeoutMin: 45 },
  outline: { phase: "outline", turn: "article-draft", tools: ["Read", "Write", "Edit"], timeoutMin: 15 },
  draft: { phase: "draft", turn: "article-draft", tools: ["Read", "Write", "Edit"], timeoutMin: 45 },
};

/* ── the agent steps ───────────────────────────────────────────────────────── */

export async function makeWorkspace(id: string, name: string, now: Date): Promise<string> {
  const ws = await uniqueDir(path.join(os.tmpdir(), "gravitone-article-ws"), `${id}-${name}-${now.getTime()}`);
  await mkdir(path.join(ws, "inputs"), { recursive: true });
  await mkdir(path.join(ws, "out"), { recursive: true });
  return ws;
}

/** A reviewer's workspace: the post and its sources, no inputs/ or out/. */
export async function makeReviewerWorkspace(id: string, round: number, specId: string, attempt: number, now: Date): Promise<string> {
  return uniqueDir(path.join(os.tmpdir(), "gravitone-article-ws"), `${id}-r${round}-${specId}-${attempt}-${now.getTime()}`);
}

export async function agentStep(id: string, name: WriterStep, deps: EngineDeps): Promise<number | undefined> {
  const plan = STEP_PLAN[name];
  const run = await readRun(id);
  const dir = runDir(id);

  // The standard, resolved NOW — never a stale copy. An unreachable registry
  // fails the step with the resolver's named error.
  const registry = deps.registry ?? resolveRegistryDir();
  const std = await resolveStandard(registry);
  if (std.standard.version !== run.standard.version || std.standard.bundleHash !== run.standard.bundleHash) {
    await updateRun(id, (r) => ({ ...r, standard: std.standard }), deps.now);
  }
  const material = run.topic.kind === "subject" && run.topic.bundle && run.topic.subject
    ? await resolveTopicSubject(`${run.topic.bundle}/${run.topic.subject}`, registry)
    : undefined;

  const now = deps.now();
  const ws = await makeWorkspace(id, name, now);
  try {
    await stageInputs(ws, dir, name, std, registry, material ? { file: material.file, text: material.text } : undefined, run);
    const file = await loadPromptFile(deps.root);
    if (file.sha !== run.promptRef.sha) await updateRun(id, (r) => ({ ...r, promptRef: { file: PROMPT_FILE, sha: file.sha } }), deps.now);
    const base = buildPrompt(file, plan.phase, {
      topic: run.topic,
      ...(material ? { topicMaterial: { file: material.file, text: material.text } } : {}),
      standard: standardText(std),
      standardAddress: `recipes/index.json#${std.recipe.slug}@${std.recipe.version}, knowledge/${std.standard.bundle}/index.json ${std.standard.bundleHash}`,
      today: now.toISOString().slice(0, 10),
    });
    // A reworked run's draft turn carries the operator's instruction as its own section.
    const prompt = name === "draft" && run.rework ? `${base}${reworkSection(run.rework)}` : base;
    await writeFileAtomic(path.join(dir, "agent", `${name}-prompt.md`), prompt);

    const result = await deps.runAgent({ cwd: ws, prompt, model: run.model, effort: run.effort, tools: plan.tools, timeoutMin: plan.timeoutMin, turn: plan.turn });
    await writeJsonAtomic(path.join(dir, "agent", `${name}.json`), {
      turn: plan.turn,
      outcome: result.outcome,
      turns: result.turns,
      durationMs: result.durationMs,
      exitCode: result.exitCode,
      ...(result.costUsd !== undefined ? { costUsd: result.costUsd } : {}),
      errors: result.errors,
      final: result.final.slice(0, 4000),
    });
    if (result.outcome !== "completed") {
      await keepOut(ws, dir, name);
      throw new StepError(`the agent ${result.outcome}${result.errors.length ? `: ${result.errors.join("; ")}` : ""}`, result.costUsd);
    }
    try {
      if (name === "research") await ingestResearch(ws, dir);
      else if (name === "outline") await ingestOutline(ws, dir);
      else await ingestDraft(ws, dir);
    } catch (e) {
      await keepOut(ws, dir, name);
      throw new StepError((e as Error).message, result.costUsd);
    }
    return result.costUsd;
  } finally {
    await rm(ws, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** On a failed turn the agent's out/ is kept under the run for inspection. */
export async function keepOut(ws: string, dir: string, name: string): Promise<void> {
  await copyDir(path.join(ws, "out"), path.join(dir, "agent", `${name}-out`)).catch(() => undefined);
}

async function stageInputs(
  ws: string,
  dir: string,
  name: WriterStep,
  std: ResolvedStandard,
  registry: RegistryLocation,
  material: { file: string; text: string } | undefined,
  run: ArticleRun,
): Promise<void> {
  const inputs = path.join(ws, "inputs");
  const topic = [
    `# Topic`,
    "",
    run.topic.text,
    ...(run.topic.angle ? ["", "## Angle", "", run.topic.angle] : []),
    ...(material ? ["", `## Registry subject ${run.topic.bundle}/${run.topic.subject} (${material.file})`, "", material.text] : []),
  ].join("\n");
  await writeFile(path.join(inputs, "topic.md"), `${topic}\n`, "utf8");
  if (name === "outline" || name === "draft") {
    await copyFile(path.join(dir, "sources.json"), path.join(inputs, "sources.json"));
    await copyFile(path.join(dir, "claims.json"), path.join(inputs, "claims.json"));
  }
  if (name === "draft") {
    await copyFile(path.join(dir, "outline.md"), path.join(inputs, "outline.md"));
    // A rework's draft reads the post it is replacing (still in post/ until this turn is ingested).
    if (run.rework) await copyDir(path.join(dir, "post"), path.join(inputs, "previous-post"));
    // Read-only reference copies of the standard's files, at their registry
    // paths, so a proposed patch names the file it changes. Copies: the agent
    // can never write the registry itself.
    for (const rel of std.files) {
      const to = path.join(inputs, "registry", ...rel.split("/"));
      await mkdir(path.dirname(to), { recursive: true });
      const text = (await readFile(path.join(registry.dir, ...rel.split("/")), "utf8")).replace(/\r\n/g, "\n");
      await writeFile(to, text, "utf8");
    }
  }
}
