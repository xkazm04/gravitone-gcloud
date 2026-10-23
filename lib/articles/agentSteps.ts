// The writer's three agent steps (research, outline, draft): each one's workspace, prompt,
// turn and ingest, and the reviewer workspace the critique uses. Its own file because each
// step has the same shape: stage inputs, run one agent turn, ingest what it wrote to out/.
// Also what a trial run's turns read of its experiment (`runTrial`, `copyExperimentText`,
// `stageExperimentInputs`): the critique's writer turns and reviewers stage it from here too.

import { copyFile, lstat, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { AgentTool, AgentTurnClass } from "@/lib/agent/cliSeam";

import { copyDir, fileExists } from "./files";
import { ingestDraft } from "./ingestDraft";
import { EXPERIMENT_DIR, EXPERIMENT_SOURCE_FILE, ingestOutline, ingestResearch, readExperimentSource } from "./ingestSources";
import { buildPrompt, loadPromptFile, PROMPT_FILE, type PromptPhase, type PromptTrial, trialTechniquePath } from "./prompt";
import { reworkSection } from "./rework";
import { type RegistryLocation, type ResolvedStandard, resolveRegistryDir, resolveStandard, resolveTopicSubject, standardText } from "./registryRead";
import { readJsonFile, readRun, runDir, updateRun, writeFileAtomic, writeJsonAtomic } from "./store";
import { StepError } from "./stepFailure";
import { uniqueDir } from "./tempDir";
import type { ArticleRun, StepName, TrialPrereg, TrialResults, TrialVerdict } from "./types";
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
  const trial = await runTrial(run, dir);

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
      ...(trial ? { trial } : {}),
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
      if (name === "research") await ingestResearch(ws, dir, trial ? await readExperimentSource(dir) : undefined);
      else if (name === "outline") await ingestOutline(ws, dir);
      else await ingestDraft(ws, dir, registry);
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
  if (run.trial) await stageExperimentInputs(ws, dir);
  if (name === "outline" || name === "draft") {
    await copyFile(path.join(dir, "sources.json"), path.join(inputs, "sources.json"));
    await copyFile(path.join(dir, "claims.json"), path.join(inputs, "claims.json"));
  }
  if (name === "draft") {
    await copyFile(path.join(dir, "outline.md"), path.join(inputs, "outline.md"));
    // A rework's draft reads the post it is replacing (still in post/ until this turn is ingested).
    if (run.rework) await copyDir(path.join(dir, "post"), path.join(inputs, "previous-post"));
    // Read-only reference copies of the registry files a proposal may change, at their registry
    // paths, so a proposed patch names the file it changes. Copies: the agent can never write the
    // registry itself. A classic run gets the writing standard's files. A trial run gets the
    // subject instead (its golden path, the technique under test, its application record when the
    // registry has one): a trial never patches the writing standard (14 proposals against it in
    // 17 runs, none adopted), only the technique it measured.
    if (run.trial && !material) throw new Error(`a trial run's topic is its registry subject; this one has ${JSON.stringify(run.topic.text)}`);
    const files = run.trial && material ? await trialRegistryFiles(run, material.file, registry) : std.files;
    await stageRegistryFiles(ws, files, registry);
  }
}

/** The registry files a trial run may amend, as the draft and a revision both read them: the
 *  subject's golden path, the technique under test, and its application record when it exists. */
async function trialRegistryFiles(run: ArticleRun, subjectFile: string, registry: RegistryLocation): Promise<string[]> {
  if (!run.trial) return [];
  return [subjectFile, ...(await presentIn(registry.dir, [trialTechniquePath(run.trial), run.trial.applicationPath]))];
}

/** Read-only copies of registry files at their registry paths under `inputs/registry/`. Copies:
 *  the agent can never write the registry itself. */
async function stageRegistryFiles(ws: string, files: string[], registry: RegistryLocation): Promise<void> {
  for (const rel of files) {
    const to = path.join(ws, "inputs", "registry", ...rel.split("/"));
    await mkdir(path.dirname(to), { recursive: true });
    const text = (await readFile(path.join(registry.dir, ...rel.split("/")), "utf8")).replace(/\r\n/g, "\n");
    await writeFile(to, text, "utf8");
  }
}

/** A trial run's revision may correct the amendment it proposed (2026-10-18: the critique caught a
 *  reversed mechanism in the post, and the draft's amendment, never reviewed, kept it). It gets the
 *  registry files the draft had, and the amendments as they stand (`inputs/amendments/<id>.patch`). */
export async function stageTrialAmendmentInputs(ws: string, dir: string, run: ArticleRun, registry: RegistryLocation): Promise<void> {
  if (!run.trial || !run.topic.bundle || !run.topic.subject) return;
  const material = await resolveTopicSubject(`${run.topic.bundle}/${run.topic.subject}`, registry);
  await stageRegistryFiles(ws, await trialRegistryFiles(run, material.file, registry), registry);
  await copyAmendments(dir, path.join(ws, "inputs", "amendments"));
}

/** The run's proposed amendments (every patch but a required one), as diffs, into `to`. Returns
 *  the ids copied. Reviewers read them too: they are the text that would land in the standard. */
export async function copyAmendments(dir: string, to: string): Promise<string[]> {
  const patches = await readJsonFile<{ id: string; required?: true; patchFile: string }[]>(path.join(dir, "patches.json"), []);
  const ids: string[] = [];
  for (const p of patches) {
    if (p.required) continue;
    const diff = await readFile(path.join(dir, ...p.patchFile.split("/")), "utf8").catch(() => undefined);
    if (diff === undefined) continue;
    await mkdir(to, { recursive: true });
    await writeFile(path.join(to, `${p.id}.patch`), diff, "utf8");
    ids.push(p.id);
  }
  return ids;
}

/** The registry-relative paths that exist in the registry. */
async function presentIn(registryDir: string, rels: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const rel of rels) if (await fileExists(path.join(registryDir, ...rel.split("/")))) out.push(rel);
  return out;
}

/* ── the trial: what a writer and a reviewer read of the experiment ────────── */

/** The trial a run is written around, as its prompts carry it: `run.trial` and the three files
 *  under `experiment/` the verdict was computed from. Undefined for a classic run. A trial run
 *  whose experiment is missing a file fails the turn by name rather than write a post about a
 *  measurement nobody can read. */
export async function runTrial(run: ArticleRun, dir: string): Promise<PromptTrial | undefined> {
  if (!run.trial) return undefined;
  const at = (f: string) => path.join(dir, EXPERIMENT_DIR, f);
  const prereg = await readJsonFile<TrialPrereg | null>(at("prereg.json"), null);
  const verdict = await readJsonFile<TrialVerdict | null>(at("verdict.json"), null);
  const results = await readJsonFile<TrialResults | null>(at("results.json"), null);
  const missing = [!prereg && "prereg.json", !verdict && "verdict.json", !results && "results.json"].filter(Boolean);
  if (!prereg || !verdict || !results) throw new Error(`the run is written around trial ${run.trial.id} but ${EXPERIMENT_DIR}/ has no ${missing.join(", ")}`);
  return { ref: run.trial, prereg, verdict, results };
}

/** Text a reader of the experiment can open: data, notes, the exec logs and the harness's
 *  source. A binary is left out (the run's own copy keeps it). */
export const EXPERIMENT_TEXT_FILE = /\.(json|jsonl|md|txt|log|csv|tsv|py|ipynb|js|mjs|cjs|ts|mts|cts|tsx|jsx|sh|bash|ps1|rs|go|java|kt|rb|php|lua|r|jl|c|h|cc|cpp|hpp|cs|swift|sql|toml|ya?ml|ini|cfg|html|css)$|(^|\/)(Makefile|Dockerfile|requirements[\w.-]*)$/i;

/** At most this much experiment text goes into one workspace, so a harness that logged its
 *  observations to a large file cannot crowd a reviewer's context out of the post. */
export const EXPERIMENT_TEXT_BUDGET = 2 * 1024 * 1024;

/** The trial's own records first, in the order a reader needs them; the rest after, by path. */
const EXPERIMENT_FIRST = ["prereg.json", "verdict.json", "results.json", "validity.json", "REPORT.md", "exec.jsonl", "trial.json", "seal.json", "frame.md", "SKIPPED.txt"];

/** The files a writer turn reads: the records, the report, the exec log and the harness. */
const WRITER_EXPERIMENT = (rel: string) => ["prereg.json", "results.json", "verdict.json", "validity.json", "REPORT.md", "exec.jsonl"].includes(rel) || rel.startsWith("harness/");

async function listTree(root: string, rel = ""): Promise<{ rel: string; size: number }[]> {
  let names: string[];
  try {
    names = await readdir(path.join(root, rel));
  } catch {
    return [];
  }
  const out: { rel: string; size: number }[] = [];
  for (const name of names.sort()) {
    const child = rel ? `${rel}/${name}` : name;
    const s = await lstat(path.join(root, child)).catch(() => null);
    if (!s || s.isSymbolicLink()) continue;
    if (s.isDirectory()) out.push(...(await listTree(root, child)));
    else if (s.isFile()) out.push({ rel: child, size: s.size });
  }
  return out;
}

/**
 * Copy the run's `experiment/` into `to`: text files only, the trial's records first, at most
 * EXPERIMENT_TEXT_BUDGET in total. What was left out is named in `to/OMITTED.txt` (absent when
 * nothing was), so a reader can tell a file that does not exist from one it was not given.
 */
export async function copyExperimentText(dir: string, to: string, keep: (rel: string) => boolean = () => true): Promise<{ copied: string[]; omitted: string[] }> {
  const from = path.join(dir, EXPERIMENT_DIR);
  const rank = (rel: string) => (EXPERIMENT_FIRST.includes(rel) ? EXPERIMENT_FIRST.indexOf(rel) : EXPERIMENT_FIRST.length);
  const files = (await listTree(from)).filter((f) => keep(f.rel)).sort((a, b) => rank(a.rel) - rank(b.rel) || a.rel.localeCompare(b.rel));
  const copied: string[] = [];
  const omitted: string[] = [];
  let total = 0;
  for (const f of files) {
    if (!EXPERIMENT_TEXT_FILE.test(f.rel)) omitted.push(`${f.rel} (not text)`);
    else if (total + f.size > EXPERIMENT_TEXT_BUDGET) omitted.push(`${f.rel} (${f.size} bytes, past the ${EXPERIMENT_TEXT_BUDGET} byte text budget)`);
    else {
      total += f.size;
      const dest = path.join(to, ...f.rel.split("/"));
      await mkdir(path.dirname(dest), { recursive: true });
      await copyFile(path.join(from, ...f.rel.split("/")), dest);
      copied.push(f.rel);
    }
  }
  await mkdir(to, { recursive: true });
  if (omitted.length) await writeFile(path.join(to, "OMITTED.txt"), `${omitted.slice(0, 200).join("\n")}${omitted.length > 200 ? `\n... and ${omitted.length - 200} more` : ""}\n`, "utf8");
  return { copied, omitted };
}

/** A trial run's writer turn (every phase, the critique's and the fix's included) reads the
 *  experiment at `inputs/experiment/` and its record at `inputs/experiment-source.json`. */
export async function stageExperimentInputs(ws: string, dir: string): Promise<void> {
  const inputs = path.join(ws, "inputs");
  if (!(await fileExists(path.join(dir, EXPERIMENT_SOURCE_FILE)))) throw new Error(`the run is written around a trial but holds no ${EXPERIMENT_SOURCE_FILE}`);
  await copyExperimentText(dir, path.join(inputs, EXPERIMENT_DIR), WRITER_EXPERIMENT);
  await copyFile(path.join(dir, EXPERIMENT_SOURCE_FILE), path.join(inputs, EXPERIMENT_SOURCE_FILE));
}
