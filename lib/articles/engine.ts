// THE ARTICLE ENGINE — one post from a topic to the human gate, and on approval
// into the registry. Server only.
//
//   queued -> researching -> drafting -> critiquing -> checking -> awaiting-approval
//                (research)   (outline, draft) (critique)  (check)        |
//                                                              approved <-+-> rejected
//                                                                 |
//                                                              landing -> landed
//   any working state -> failed -> (resume) back to the state whose step failed
//
// THREE WRITER TURNS, A CRITIQUE, ONE DETERMINISTIC STEP. research (web tools,
// call site `article-research`), outline and draft (no web, call site
// `article-draft`), each a fresh headless session through lib/agent/cliSeam.ts
// in an isolated workspace that holds only `inputs/` and `out/`. Then the
// CRITIQUE (scope amendment 1, below `critiqueStep`): reviewer models from
// every provider read the draft in parallel, blind to each other; the writer
// answers every finding and decides keep | rewrite | research; at most two
// review rounds. The check is code (lib/articles/checks.ts). Landing is code
// (lib/articles/registryWrite.ts) and starts only from `approved`.
//
// THE CLI AND THE ROUTES SHARE THIS MODULE, so they cannot disagree about what
// a run is. Every ArticleRun field is produced here; the CLI
// (pipeline/article.mts) and /articles/[runId] consume it.
//
// ONE DRIVER PER RUN. `driveRun` holds the run's driver lease
// (lib/articles/store.ts) for the whole drive, so a double-clicked resume or
// the CLI and the server at once cannot spend twice.

import { execFile } from "node:child_process";
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  REVIEW_PROMPT_FILE as REVIEW_MD,
  runAgent as realRunAgent,
  runReviewer as realRunReviewer,
  type AgentResult,
  type AgentTool,
  type AgentTurnClass,
  type ReviewerCall,
  type RunAgentInput,
} from "@/lib/agent/cliSeam";
import { cwdBoundGitEnv } from "@/lib/gitEnv";
import { MODEL } from "@/lib/model";

import { runCheck } from "./checks";
import {
  loadPanel,
  readCritiqueDetail,
  roundDir,
  summarizeCritique,
  validateDecision,
  validateDispositions,
  validatePanel,
  validateReview,
  type ReviewerPanel,
} from "./critique";
import { buildMediumPackage } from "./mediumPackage";
import { buildPrompt, buildReviewPrompt, loadPromptFile, loadReviewPromptFile, MAX_PATCHES, PROMPT_FILE, type PromptPhase } from "./prompt";
import {
  resolveRegistryDir,
  resolveStandard,
  resolveTopicSubject,
  standardText,
  type RegistryLocation,
  type ResolvedStandard,
} from "./registryRead";
import { LandingError, landRun, PATCHABLE_ROOTS } from "./registryWrite";
import { uniqueDir } from "./tempDir";
import {
  acquireDriver,
  ArticleError,
  driverAlive,
  freshRunId,
  inRun,
  listRuns,
  readJsonFile,
  readRun,
  readTextFile,
  runDir,
  updateRun,
  writeFileAtomic,
  writeJsonAtomic,
  writeNewRun,
} from "./store";
import {
  EFFORT_LEVELS,
  PATCH_KINDS,
  type ArticleRun,
  type ArticleRunDetail,
  type ArticleStatus,
  type ArticleStep,
  type CheckItem,
  type CheckPassRecord,
  type CheckReport,
  type Claim,
  type CreateRunInput,
  type CritiqueDecisionRecord,
  type EffortLevel,
  type PostMeta,
  type RegistryPatch,
  type Review,
  type ReviewerReceipt,
  type ReviewerSpec,
  type Source,
  type StepName,
} from "./types";

/* ── dependencies (injectable for the probes) ──────────────────────────────── */

export interface EngineDeps {
  runAgent: (input: RunAgentInput) => Promise<AgentResult>;
  /** One reviewer of the critique, any of the four engines. */
  runReviewer: (call: ReviewerCall) => Promise<AgentResult>;
  now: () => Date;
  /** Open a browser for the rendered check items. */
  render: boolean;
  /** Where the prompt file is read from (the repo root). */
  root: string;
  /** Resolved lazily when absent. */
  registry?: RegistryLocation;
}

export function defaultDeps(over: Partial<EngineDeps> = {}): EngineDeps {
  return { runAgent: realRunAgent, runReviewer: realRunReviewer, now: () => new Date(), render: true, root: process.cwd(), ...over };
}

type WriterStep = Exclude<StepName, "check" | "critique">;

const STEP_PLAN: Record<WriterStep, { phase: PromptPhase; turn: AgentTurnClass; tools: AgentTool[]; timeoutMin: number }> = {
  research: { phase: "research", turn: "article-research", tools: ["WebSearch", "WebFetch", "Read", "Write", "Edit"], timeoutMin: 45 },
  outline: { phase: "outline", turn: "article-draft", tools: ["Read", "Write", "Edit"], timeoutMin: 15 },
  draft: { phase: "draft", turn: "article-draft", tools: ["Read", "Write", "Edit"], timeoutMin: 45 },
};

/** The writer's turns inside the critique: answering the reviews (no web),
 *  research again (web), rewrite (no web). */
const CRITIQUE_PLAN: Record<"critique" | "revise-research" | "revise" | "fix", { turn: AgentTurnClass; tools: AgentTool[]; timeoutMin: number; label: string }> = {
  critique: { turn: "article-critique-writer", tools: ["Read", "Write", "Edit"], timeoutMin: 30, label: "writer" },
  "revise-research": { turn: "article-research", tools: ["WebSearch", "WebFetch", "Read", "Write", "Edit"], timeoutMin: 45, label: "research" },
  revise: { turn: "article-critique-writer", tools: ["Read", "Write", "Edit"], timeoutMin: 45, label: "revise" },
  fix: { turn: "article-critique-writer", tools: ["Read", "Write", "Edit"], timeoutMin: 30, label: "fix" },
};

/** Fix turns the engine runs for one check label (after the draft, after a revision) before it
 *  stops and lets the post go on with its failures recorded. */
export const MAX_FIX_PASSES = 2;

class StepError extends Error {
  constructor(
    message: string,
    readonly costUsd?: number,
  ) {
    super(message);
  }
}

/* ── create ────────────────────────────────────────────────────────────────── */

const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9.\-[\]_]{0,63}$/;

export async function createRun(input: CreateRunInput, deps: EngineDeps = defaultDeps()): Promise<ArticleRun> {
  const t = input.topic;
  if (!t || (t.kind !== "subject" && t.kind !== "free")) throw new ArticleError("topic.kind must be subject or free", 400, "bad-topic");
  const angle = t.angle?.trim() ? t.angle.trim().slice(0, 600) : undefined;
  const model = (input.model ?? MODEL).trim();
  if (!MODEL_RE.test(model)) throw new ArticleError(`not a model id: ${JSON.stringify(input.model)}`, 400, "bad-model");
  const effort: EffortLevel = input.effort ?? "high";
  if (!EFFORT_LEVELS.includes(effort)) throw new ArticleError(`effort must be one of ${EFFORT_LEVELS.join(", ")}`, 400, "bad-effort");

  const prompt = await loadPromptFile(deps.root);
  const now = deps.now();
  let error: string | undefined;
  let topic: ArticleRun["topic"];
  let standard: ArticleRun["standard"] = { recipe: "technical-blog-post-authoring", bundle: "technical-writing", subjects: [] };

  try {
    const registry = deps.registry ?? resolveRegistryDir();
    if (t.kind === "subject") {
      const address = t.bundle && t.subject ? `${t.bundle}/${t.subject}` : (t.subject ?? "");
      const s = await resolveTopicSubject(address, registry);
      topic = { kind: "subject", bundle: s.bundle, subject: s.subject, text: t.text?.trim() || s.title };
    } else {
      const text = t.text?.trim();
      if (!text) throw new ArticleError("a free topic needs text", 400, "bad-topic");
      topic = { kind: "free", text: text.slice(0, 600) };
    }
    standard = (await resolveStandard(registry)).standard;
  } catch (e) {
    // Bad input is the caller's problem and creates nothing. An unreachable
    // registry creates a FAILED run, so the failure is visible and resumable.
    if (!(e instanceof ArticleError) || e.status < 500) throw e;
    error = e.message;
    topic =
      t.kind === "subject"
        ? { kind: "subject", ...(t.bundle ? { bundle: t.bundle } : {}), ...(t.subject ? { subject: t.subject } : {}), text: t.text?.trim() || `${t.bundle ?? ""}/${t.subject ?? ""}` }
        : { kind: "free", text: (t.text ?? "").trim().slice(0, 600) };
  }
  if (angle) topic.angle = angle;

  const id = await freshRunId(topic.subject ?? topic.text, now);
  const run: ArticleRun = {
    id,
    status: error ? "failed" : "queued",
    topic,
    promptRef: { file: PROMPT_FILE, sha: prompt.sha },
    standard,
    model,
    effort,
    steps: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...(error ? { error } : {}),
  };
  await writeNewRun(run);
  return run;
}

/* ── reads ─────────────────────────────────────────────────────────────────── */

export const getRun = readRun;

export async function listArticleRuns(): Promise<{ runs: ArticleRun[]; damaged: string[] }> {
  return listRuns();
}

export async function readPatches(id: string): Promise<RegistryPatch[]> {
  return readJsonFile<RegistryPatch[]>(inRun(id, "patches.json"), []);
}

export async function getRunDetail(id: string): Promise<ArticleRunDetail> {
  const run = await readRun(id);
  const [sources, claims, outline, meta, check, patches, critique, checkPasses] = await Promise.all([
    readJsonFile<Source[]>(inRun(id, "sources.json"), []),
    readJsonFile<Claim[]>(inRun(id, "claims.json"), []),
    readTextFile(inRun(id, "outline.md")),
    readJsonFile<PostMeta | null>(inRun(id, "post/meta.json"), null),
    readJsonFile<CheckReport | null>(inRun(id, "check.json"), null),
    readPatches(id),
    readCritiqueDetail(runDir(id)),
    readCheckPasses(runDir(id)),
  ]);
  const withDiffs = await Promise.all(patches.map(async (p) => ({ ...p, diff: (await readTextFile(inRun(id, p.patchFile))) ?? "" })));
  const post = await stat(inRun(id, "post/index.html")).then(() => "post/index.html", () => undefined);
  return {
    run,
    sources,
    claims,
    patches: withDiffs,
    ...(outline !== undefined ? { outline } : {}),
    ...(meta ? { meta } : {}),
    ...(check ? { check } : {}),
    ...(checkPasses.length ? { checkPasses } : {}),
    ...(post ? { post } : {}),
    ...(critique ? { critique } : {}),
  };
}

/* ── the human's acts ──────────────────────────────────────────────────────── */

export async function approveRun(id: string, patchIds: string[], deps: EngineDeps = defaultDeps()): Promise<ArticleRun> {
  const known = new Set((await readPatches(id)).map((p) => p.id));
  const ids = [...new Set(patchIds.map((p) => String(p).trim()).filter(Boolean))];
  const unknown = ids.filter((p) => !known.has(p));
  if (unknown.length) throw new ArticleError(`no such patch on run ${id}: ${unknown.join(", ")}`, 400, "bad-patch");
  return updateRun(
    id,
    (r) => {
      if (r.status !== "awaiting-approval") throw new ArticleError(`only a run awaiting approval can be approved; ${id} is ${r.status}`, 409, "bad-transition");
      return { ...r, status: "approved", approval: { at: deps.now().toISOString(), patches: ids } };
    },
    deps.now,
  );
}

export async function rejectRun(id: string, note: string, deps: EngineDeps = defaultDeps()): Promise<ArticleRun> {
  const text = note?.trim();
  if (!text) throw new ArticleError("a rejection needs a note", 400, "bad-note");
  return updateRun(
    id,
    (r) => {
      if (r.status !== "awaiting-approval") throw new ArticleError(`only a run awaiting approval can be rejected; ${id} is ${r.status}`, 409, "bad-transition");
      return { ...r, status: "rejected", rejection: { at: deps.now().toISOString(), note: text.slice(0, 2000) } };
    },
    deps.now,
  );
}

/** Where a failed run goes back to: the state whose step did not finish. */
export function resumePoint(run: ArticleRun): ArticleStatus {
  const done = (n: StepName) => run.steps.some((s) => s.name === n && s.status === "done");
  if (run.approval) return "approved";
  if (!done("research")) return run.steps.length ? "researching" : "queued";
  if (!done("outline") || !done("draft")) return "drafting";
  if (!done("critique")) return "critiquing";
  return "checking";
}

const RESUMABLE: ArticleStatus[] = ["queued", "researching", "drafting", "critiquing", "checking", "approved", "landing"];

/** Make a run drivable again. A `failed` run goes back to its resume point; a
 *  run left mid-step by a driver that died is resumable as it stands. The
 *  caller then drives it (`driveRun`, or `launchRun` from a route). */
export async function resumeRun(id: string, deps: EngineDeps = defaultDeps()): Promise<ArticleRun> {
  if (await driverAlive(id)) throw new ArticleError(`run ${id} is being driven right now`, 409, "busy");
  return updateRun(
    id,
    (r) => {
      if (r.status === "failed") {
        const next = resumePoint(r);
        const out: ArticleRun = { ...r, status: next };
        delete out.error;
        return out;
      }
      if (RESUMABLE.includes(r.status)) return r;
      throw new ArticleError(`a run that is ${r.status} cannot be resumed`, 409, "bad-transition");
    },
    deps.now,
  );
}

/* ── driving ───────────────────────────────────────────────────────────────── */

/** Start driving without waiting — for a route handler. The drive's own
 *  failures land on the run as `failed`; anything else is logged. */
export function launchRun(id: string, deps: EngineDeps = defaultDeps()): void {
  void driveRun(id, deps).catch((e) => {
    console.error(`[articles] drive ${id} stopped: ${(e as Error).message}`);
  });
}

/**
 * Drive a run as far as it can go on its own: to `awaiting-approval` from the
 * working states, to `landed` from `approved`. Returns the run as it stands
 * when the drive stops. Throws only when the run cannot be driven at all (no
 * such run, another live driver).
 */
export async function driveRun(id: string, deps: EngineDeps = defaultDeps()): Promise<ArticleRun> {
  const lease = await acquireDriver(id);
  try {
    for (;;) {
      const run = await readRun(id);
      switch (run.status) {
        case "queued":
          await setStatus(id, "researching", deps);
          continue;
        case "researching":
          if (!(await step(id, "research", deps))) return readRun(id);
          await setStatus(id, "drafting", deps);
          continue;
        case "drafting":
          if (!(await step(id, "outline", deps))) return readRun(id);
          if (!(await step(id, "draft", deps))) return readRun(id);
          await checkedBetween(id, "draft", "draft", deps);
          await setStatus(id, "critiquing", deps);
          continue;
        case "critiquing":
          if (!(await step(id, "critique", deps))) return readRun(id);
          await setStatus(id, "checking", deps);
          continue;
        case "checking":
          if (!(await step(id, "check", deps))) return readRun(id);
          await setStatus(id, "awaiting-approval", deps);
          continue;
        case "approved":
          await setStatus(id, "landing", deps);
          continue;
        case "landing":
          await land(id, deps);
          return readRun(id);
        default:
          return run;
      }
    }
  } finally {
    await lease.release();
  }
}

const setStatus = (id: string, status: ArticleStatus, deps: EngineDeps) => updateRun(id, (r) => ({ ...r, status }), deps.now);

/** Run one step unless it is already done. True when it is done. */
async function step(id: string, name: StepName, deps: EngineDeps): Promise<boolean> {
  const before = await readRun(id);
  const prior = before.steps.find((s) => s.name === name);
  if (prior?.status === "done") return true;
  const startedAt = deps.now().toISOString();
  await updateRun(id, (r) => withStep(r, { name, status: "running", startedAt, ...(prior?.costUsd !== undefined ? { costUsd: prior.costUsd } : {}) }), deps.now);
  try {
    const cost = name === "check" ? await checkStep(id, deps) : name === "critique" ? await critiqueStep(id, deps) : await agentStep(id, name, deps);
    await updateRun(id, (r) => withStep(r, finish(r, name, "done", deps, cost)), deps.now);
    return true;
  } catch (e) {
    const cost = e instanceof StepError ? e.costUsd : undefined;
    const msg = `${name}: ${(e as Error).message}`;
    await updateRun(id, (r) => ({ ...withStep(r, finish(r, name, "failed", deps, cost)), status: "failed", error: msg }), deps.now);
    return false;
  }
}

function withStep(run: ArticleRun, s: ArticleStep): ArticleRun {
  const steps = run.steps.filter((x) => x.name !== s.name);
  steps.push(s);
  const order = ["research", "outline", "draft", "critique", "check"];
  steps.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  return { ...run, steps };
}

/** Close a step. A retried step's cost ACCUMULATES: the field is what the step
 *  has cost, across every attempt that reported a figure. */
function finish(run: ArticleRun, name: StepName, status: "done" | "failed", deps: EngineDeps, cost?: number): ArticleStep {
  const cur = run.steps.find((s) => s.name === name)!;
  const out: ArticleStep = { name, status, startedAt: cur.startedAt, endedAt: deps.now().toISOString() };
  const total = (cur.costUsd ?? 0) + (cost ?? 0);
  if (cur.costUsd !== undefined || cost !== undefined) out.costUsd = Math.round(total * 1_000_000) / 1_000_000;
  return out;
}

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

async function agentStep(id: string, name: WriterStep, deps: EngineDeps): Promise<number | undefined> {
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
    const prompt = buildPrompt(file, plan.phase, {
      topic: run.topic,
      ...(material ? { topicMaterial: { file: material.file, text: material.text } } : {}),
      standard: standardText(std),
      standardAddress: `recipes/index.json#${std.recipe.slug}@${std.recipe.version}, knowledge/${std.standard.bundle}/index.json ${std.standard.bundleHash}`,
      today: now.toISOString().slice(0, 10),
    });
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
async function keepOut(ws: string, dir: string, name: string): Promise<void> {
  await copyDir(path.join(ws, "out"), path.join(dir, "agent", `${name}-out`)).catch(() => undefined);
}

async function copyDir(from: string, to: string): Promise<string[]> {
  const out: string[] = [];
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(from, { withFileTypes: true });
  } catch {
    return out;
  }
  await mkdir(to, { recursive: true });
  for (const e of entries) {
    if (e.isDirectory()) out.push(...(await copyDir(path.join(from, e.name), path.join(to, e.name))).map((p) => `${e.name}/${p}`));
    else if (e.isFile()) {
      await copyFile(path.join(from, e.name), path.join(to, e.name));
      out.push(e.name);
    }
  }
  return out;
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

/* ── ingestion: the agent's out/ is untrusted input ────────────────────────── */

async function readOutJson<T>(file: string, what: string): Promise<T> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    throw new Error(`the agent did not write ${what}`);
  }
  try {
    return JSON.parse(raw.replace(/^﻿/, "")) as T;
  } catch (e) {
    throw new Error(`${what} is not valid JSON (${(e as Error).message})`);
  }
}

export function validateSources(raw: unknown): Source[] {
  if (!Array.isArray(raw) || !raw.length) throw new Error("sources.json must be a non-empty array");
  const seen = new Set<number>();
  const problems: string[] = [];
  const out: Source[] = raw.map((r, i) => {
    const o = (r ?? {}) as Record<string, unknown>;
    const n = Number(o.n);
    if (!Number.isInteger(n) || n < 1) problems.push(`entry ${i + 1}: n is not a positive integer`);
    else if (seen.has(n)) problems.push(`entry ${i + 1}: n ${n} repeats`);
    seen.add(n);
    for (const k of ["url", "title", "publisher", "date", "took"]) if (typeof o[k] !== "string" || !(o[k] as string).trim()) problems.push(`[${n}] has no ${k}`);
    return {
      n,
      url: String(o.url ?? "").trim(),
      title: String(o.title ?? "").trim(),
      publisher: String(o.publisher ?? "").trim(),
      date: String(o.date ?? "").trim(),
      primary: o.primary === true,
      counter: o.counter === true,
      took: String(o.took ?? "").trim(),
    };
  });
  if (problems.length) throw new Error(`sources.json: ${problems.slice(0, 8).join("; ")}`);
  return out.sort((a, b) => a.n - b.n);
}

export function validateClaims(raw: unknown, sources: Source[]): Claim[] {
  if (!Array.isArray(raw)) throw new Error("claims.json must be an array");
  const nums = new Set(sources.map((s) => s.n));
  const problems: string[] = [];
  const out = raw.map((r, i) => {
    const o = (r ?? {}) as Record<string, unknown>;
    const source = Number(o.source);
    if (typeof o.text !== "string" || !o.text.trim()) problems.push(`claim ${i + 1} has no text`);
    if (!nums.has(source)) problems.push(`claim ${i + 1} cites [${String(o.source)}], which is not a source`);
    return { text: String(o.text ?? "").trim(), source };
  });
  if (problems.length) throw new Error(`claims.json: ${problems.slice(0, 8).join("; ")}`);
  return out;
}

async function ingestResearch(ws: string, dir: string): Promise<void> {
  const sources = validateSources(await readOutJson(path.join(ws, "out", "sources.json"), "out/sources.json"));
  const claims = validateClaims(await readOutJson(path.join(ws, "out", "claims.json"), "out/claims.json"), sources);
  await writeJsonAtomic(path.join(dir, "sources.json"), sources);
  await writeJsonAtomic(path.join(dir, "claims.json"), claims);
}

async function ingestOutline(ws: string, dir: string): Promise<void> {
  const md = (await readTextFile(path.join(ws, "out", "outline.md")))?.trim();
  if (!md) throw new Error("the agent did not write out/outline.md");
  if (!/^##\s+\S/m.test(md)) throw new Error("out/outline.md has no sections");
  await writeFileAtomic(path.join(dir, "outline.md"), `${md.replace(/\r\n/g, "\n")}\n`);
}

const PATCH_ID = /^p\d{1,2}$/;

/** The post files out of a draft or a critique rewrite. Validated before the
 *  previous post is touched; then the previous post is replaced wholesale. */
async function ingestPost(ws: string, dir: string): Promise<void> {
  const out = path.join(ws, "out");
  const html = await readTextFile(path.join(out, "post", "index.html"));
  const md = await readTextFile(path.join(out, "post", "post.md"));
  if (!html?.trim()) throw new Error("the agent did not write out/post/index.html");
  if (!md?.trim()) throw new Error("the agent did not write out/post/post.md");
  const metaRaw = await readOutJson<Record<string, unknown>>(path.join(out, "post", "meta.json"), "out/post/meta.json");
  if (typeof metaRaw.title !== "string" || !metaRaw.title.trim()) throw new Error("out/post/meta.json has no title");
  const meta: PostMeta = {
    title: metaRaw.title.trim(),
    subtitle: typeof metaRaw.subtitle === "string" ? metaRaw.subtitle.trim() : "",
    tags: Array.isArray(metaRaw.tags) ? metaRaw.tags.filter((t): t is string => typeof t === "string" && !!t.trim()).map((t) => t.trim()).slice(0, 5) : [],
  };

  await rm(path.join(dir, "post"), { recursive: true, force: true });
  await writeFileAtomic(path.join(dir, "post", "index.html"), html);
  await writeFileAtomic(path.join(dir, "post", "post.md"), md);
  await writeJsonAtomic(path.join(dir, "post", "meta.json"), meta);
  let figs: string[] = [];
  try {
    figs = (await readdir(path.join(out, "post", "figures"))).filter((f) => /^[\w.-]+\.svg$/i.test(f));
  } catch {
    // no figures directory: the check counts zero and says so
  }
  for (const f of figs) await writeFileAtomic(path.join(dir, "post", "figures", f), await readFile(path.join(out, "post", "figures", f)));
}

async function ingestDraft(ws: string, dir: string): Promise<void> {
  const out = path.join(ws, "out");
  // A redraft replaces the previous post and its patches wholesale.
  await ingestPost(ws, dir);
  await rm(path.join(dir, "patches"), { recursive: true, force: true });

  // Patches: proposals in, diffs out — computed here, never typed by the model.
  const sources = await readJsonFile<Source[]>(path.join(dir, "sources.json"), []);
  const nums = new Set(sources.map((s) => s.n));
  let proposed: unknown = [];
  try {
    proposed = await readOutJson<unknown>(path.join(out, "patches.json"), "out/patches.json");
  } catch {
    proposed = [];
  }
  const accepted: RegistryPatch[] = [];
  const rejected: { entry: unknown; reason: string }[] = [];
  for (const entry of Array.isArray(proposed) ? proposed.slice(0, MAX_PATCHES * 2) : []) {
    const o = (entry ?? {}) as Record<string, unknown>;
    const reason = patchProblem(o, nums, accepted);
    if (reason) {
      rejected.push({ entry, reason });
      continue;
    }
    if (accepted.length >= MAX_PATCHES) {
      rejected.push({ entry, reason: `more than ${MAX_PATCHES} proposals` });
      continue;
    }
    const id = String(o.id);
    const target = String(o.target);
    const proposal = path.join(out, "proposals", id, ...target.split("/"));
    const original = path.join(ws, "inputs", "registry", ...target.split("/"));
    let diff: string;
    try {
      diff = await diffFiles(original, proposal, target);
    } catch (e) {
      rejected.push({ entry, reason: (e as Error).message });
      continue;
    }
    if (!diff.trim()) {
      rejected.push({ entry, reason: "the proposed file is identical to the registry's" });
      continue;
    }
    const patchFile = `patches/${id}.patch`;
    await writeFileAtomic(path.join(dir, patchFile), diff);
    accepted.push({
      id,
      target,
      kind: o.kind as RegistryPatch["kind"],
      rationale: String(o.rationale).trim().slice(0, 600),
      sources: (o.sources as number[]).map(Number),
      patchFile,
    });
  }
  await writeJsonAtomic(path.join(dir, "patches.json"), accepted);
  if (rejected.length) await writeJsonAtomic(path.join(dir, "patches.rejected.json"), rejected);
  else await rm(path.join(dir, "patches.rejected.json"), { force: true });
}

function patchProblem(o: Record<string, unknown>, nums: Set<number>, accepted: RegistryPatch[]): string | undefined {
  if (typeof o.id !== "string" || !PATCH_ID.test(o.id)) return "id must be p1, p2, …";
  if (accepted.some((p) => p.id === o.id)) return `id ${o.id} repeats`;
  if (typeof o.target !== "string" || !PATCHABLE_ROOTS.some((r) => (o.target as string).startsWith(r))) return `target must be under ${PATCHABLE_ROOTS.join(" or ")}`;
  if (/(^|\/)\.\.(\/|$)|\\|^\//.test(o.target as string) || !/\.(md|json)$/.test(o.target as string)) return "target must be a relative .md or .json path with no ..";
  if (!PATCH_KINDS.includes(o.kind as RegistryPatch["kind"])) return `kind must be one of ${PATCH_KINDS.join(", ")}`;
  if (typeof o.rationale !== "string" || !o.rationale.trim()) return "a rationale is required";
  if (!Array.isArray(o.sources) || !o.sources.length || o.sources.some((n) => !nums.has(Number(n)))) return "sources must name at least one source that exists";
  return undefined;
}

/** `git diff --no-index` between the registry's copy (or nothing) and the
 *  proposal, rewritten to registry-relative `a/` `b/` paths for `git apply`. */
export async function diffFiles(original: string, proposal: string, target: string): Promise<string> {
  const proposed = await readTextFile(proposal);
  if (proposed === undefined) throw new Error(`no proposed file at out/proposals/<id>/${target}`);
  const base = await readTextFile(original);
  const tmp = path.join(os.tmpdir(), "gravitone-article-diff", `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  try {
    const a = path.join(tmp, "a", ...target.split("/"));
    const b = path.join(tmp, "b", ...target.split("/"));
    await mkdir(path.dirname(b), { recursive: true });
    await writeFile(b, proposed.replace(/\r\n/g, "\n"), "utf8");
    if (base !== undefined) {
      await mkdir(path.dirname(a), { recursive: true });
      await writeFile(a, base.replace(/\r\n/g, "\n"), "utf8");
    }
    const left = base !== undefined ? `a/${target}` : "/dev/null";
    const diff = await new Promise<string>((resolve, reject) => {
      execFile(
        "git",
        ["-c", "core.autocrlf=false", "-c", "core.safecrlf=false", "diff", "--no-index", "--no-color", "--no-prefix", "--", left, `b/${target}`],
        { cwd: tmp, env: cwdBoundGitEnv(), maxBuffer: 16 * 1024 * 1024, windowsHide: true },
        (err, stdout, stderr) => {
          // exit 1 = "there are differences", which is the point
          const code = err ? (err as unknown as { code?: number }).code : 0;
          if (code === 0 || code === 1) resolve(String(stdout));
          else reject(new Error(`git diff failed: ${String(stderr).trim().slice(0, 300)}`));
        },
      );
    });
    // A new file's header names b/ twice; git apply wants a/ on the left.
    return diff.replace(/^diff --git b\/(\S+) b\/(\S+)$/m, "diff --git a/$1 b/$2");
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

/* ── the critique step (scope amendment 1) ─────────────────────────────────── */
//
//   round n:  every reviewer of the panel, in parallel, blind to each other,
//             each in its own read-only workspace (a copy of post/, sources.json
//             and REVIEW.md) -> critique/round-n/reviews/<id>.json
//             fewer than `minCompleted` completed -> `critique-quorum`, failed
//             -> the WRITER (the draft's model) answers every finding and
//             decides: critique/round-n/{dispositions,decision}.json
//             keep -> the step is done
//             rewrite -> a rewrite turn replaces post/
//             research -> a research turn (web) updates sources/claims, then
//             the rewrite turn
//             -> round n+1 reviews the revision; in the LAST round the writer
//             may only keep or rewrite, and a last rewrite is not re-reviewed.
//
// RESUMABLE AT EVERY FILE. A reviewer whose review file exists never runs
// again; a round with closed.json runs no reviewer at all; a round with its
// decision runs no writer turn; a round with revised.json is not revised
// again. A killed or failed run resumes inside the step from the first file
// that is missing.
//
// COST BOUND, in agent turns: per round, one per reviewer plus at most one
// retry each for a malformed review, one writer turn plus at most one retry
// for an invalid answer, and at most two revision turns (research, rewrite).
// With the four-reviewer panel and two rounds: 8 turns at the least (round 1
// and keep, plus the three writer turns before it: 3 + 4 + 1), 26 at the most
// (3 + round 1: 4+4+1+1+2 + round 2: 4+4+1+1+1).

/** Fewer reviewers completed a round than the panel's quorum. */
class QuorumError extends StepError {}

const sumCost = (a: number | undefined, b: number | undefined) => (a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0));
const fileExists = (f: string) => stat(f).then(() => true, () => false);

/** The panel this run is reviewed by: the snapshot taken when its critique
 *  began, so a resume (or the UI) never meets a panel the run did not start
 *  with. The first call reads pipeline/article-reviewers.json (or
 *  ARTICLES_REVIEWERS_FILE) and writes the snapshot. */
async function critiquePanel(dir: string, deps: EngineDeps): Promise<ReviewerPanel> {
  const snap = path.join(dir, "critique", "reviewers.json");
  const held = await readJsonFile<unknown>(snap, undefined);
  if (held !== undefined) return validatePanel(held, snap);
  const panel = await loadPanel(deps.root);
  await writeJsonAtomic(snap, panel);
  return panel;
}

async function syncCritiqueSummary(id: string, deps: EngineDeps): Promise<void> {
  const summary = summarizeCritique(await readCritiqueDetail(runDir(id)));
  if (summary) await updateRun(id, (r) => ({ ...r, critique: summary }), deps.now);
}

async function critiqueStep(id: string, deps: EngineDeps): Promise<number | undefined> {
  const dir = runDir(id);
  let cost: number | undefined;
  try {
    const panel = await critiquePanel(dir, deps);
    for (let round = 1; round <= panel.maxCritiqueRounds; round++) {
      const last = round === panel.maxCritiqueRounds;
      const rd = path.join(dir, ...roundDir(round).split("/"));

      if (!(await fileExists(path.join(rd, "closed.json")))) cost = sumCost(cost, await reviewRound(id, round, panel, deps));

      let decision = await readJsonFile<CritiqueDecisionRecord | null>(path.join(rd, "decision.json"), null);
      if (!decision || !(await fileExists(path.join(rd, "dispositions.json")))) {
        const answered = await writerAnswers(id, round, panel, last, deps);
        cost = sumCost(cost, answered.cost);
        decision = answered.decision;
      }
      await syncCritiqueSummary(id, deps);
      if (decision.decision === "keep") return cost;

      if (!(await fileExists(path.join(rd, "revised.json")))) cost = sumCost(cost, await revise(id, round, panel, decision, deps));
      // The revision is checked before anyone reviews it again (or before the gate):
      // the check's failures go back to the writer as mandatory fixes. Idempotent on resume.
      cost = sumCost(cost, await checkLoop(id, `round-${round}`, deps).catch(noteCheckError));
      if (last) return cost;
    }
    return cost;
  } catch (e) {
    await syncCritiqueSummary(id, deps).catch(() => undefined);
    // A thrown StepError carries the cost of the turns that ran inside the
    // failing call; the rounds before it are in `cost`.
    throw new StepError((e as Error).message, sumCost(cost, e instanceof StepError ? e.costUsd : undefined));
  }
}

/** The run's standard, re-resolved now (never a stale copy), as prompt text. */
async function standardForPrompt(id: string, deps: EngineDeps): Promise<{ text: string; address: string }> {
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

async function reviewRound(id: string, round: number, panel: ReviewerPanel, deps: EngineDeps): Promise<number | undefined> {
  const dir = runDir(id);
  const rd = path.join(dir, ...roundDir(round).split("/"));
  const run = await readRun(id);
  const std = await standardForPrompt(id, deps);
  const file = await loadReviewPromptFile(deps.root);
  const postMd = (await readTextFile(path.join(dir, "post", "post.md"))) ?? "";
  const sourcesJson = (await readTextFile(path.join(dir, "sources.json"))) ?? "[]";
  if (!postMd.trim()) throw new StepError("there is no post/post.md to review");

  const pending: ReviewerSpec[] = [];
  for (const spec of panel.reviewers) if (!(await fileExists(path.join(rd, "reviews", `${spec.id}.json`)))) pending.push(spec);
  const costs = await Promise.all(
    pending.map((spec) =>
      reviewOnce(id, round, spec, deps, (note) =>
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
        }) + note,
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
 *  reviewer's sake: a reviewer that fails is an outcome. */
async function reviewOnce(id: string, round: number, spec: ReviewerSpec, deps: EngineDeps, prompt: (note: string) => string): Promise<number | undefined> {
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

/** One writer turn of the critique; its receipt is agent/critique-r<n>-<label>.json. */
async function critiqueTurn(
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

async function writerAnswers(id: string, round: number, panel: ReviewerPanel, last: boolean, deps: EngineDeps): Promise<{ cost: number | undefined; decision: CritiqueDecisionRecord }> {
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

async function revise(id: string, round: number, panel: ReviewerPanel, decision: CritiqueDecisionRecord, deps: EngineDeps): Promise<number | undefined> {
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

/* ── the check between writer turns ───────────────────────────────────────── */

/** The check's failures the writer must meet between turns. The critique item is excluded:
 *  it cannot pass until the critique is over. Items not measured are not failures. */
export function mandatoryFailures(report: CheckReport): CheckItem[] {
  return report.items.filter((i) => i.status === "fail" && i.id !== "critique");
}

/** The failures as the fix prompt carries them. */
export function failuresText(failed: CheckPassRecord["failed"]): string {
  return failed
    .map((f) => `- \`${f.id}\` (${f.dimension}): ${f.label}. Measured: ${f.value ?? "n/a"}. Required: ${f.expected ?? "see the label"}.${f.detail?.length ? `\n${f.detail.slice(0, 12).map((d) => `    - ${d}`).join("\n")}` : ""}`)
    .join("\n");
}

const passFile = (dir: string, r: Pick<CheckPassRecord, "label" | "pass">) => path.join(dir, "checks", `${r.label}-${r.pass}.json`);

export async function readCheckPasses(dir: string, label?: string): Promise<CheckPassRecord[]> {
  let files: string[];
  try {
    files = (await readdir(path.join(dir, "checks"))).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const out: CheckPassRecord[] = [];
  for (const f of files) {
    const r = await readJsonFile<CheckPassRecord | null>(path.join(dir, "checks", f), null);
    if (r && (label === undefined || r.label === label)) out.push(r);
  }
  return out.sort((a, b) => (label === undefined ? a.at.localeCompare(b.at) || a.pass - b.pass : a.pass - b.pass));
}

/** A check that could not run is not a reason to stop a run that has spent an hour; the final
 *  check step runs it again and fails by name if the problem is real. */
function noteCheckError(e: unknown): undefined {
  console.error(`[articles] the between-turn check could not run: ${(e as Error).message}`);
  return undefined;
}

/**
 * Check the post as the writer left it; when items fail, hand them to the writer as mandatory
 * fixes and check again, at most MAX_FIX_PASSES times. Failures that remain are recorded in
 * `checks/<label>-<pass>.json` and the run goes on; the final check step reports them to the
 * human. A failed fix turn is recorded (`fixError`) and ends the loop; the post is untouched.
 * State is the pass files alone, so a resume carries on where the last drive stopped.
 */
export async function checkLoop(id: string, label: string, deps: EngineDeps): Promise<number | undefined> {
  const dir = runDir(id);
  let cost: number | undefined;
  for (;;) {
    const held = await readCheckPasses(dir, label);
    let rec = held[held.length - 1];
    if (!rec || rec.fixed) {
      const report = await runCheck(dir, { render: deps.render, now: deps.now });
      rec = {
        label,
        pass: held.length + 1,
        at: report.at,
        failed: mandatoryFailures(report).map((i) => ({ id: i.id, dimension: i.dimension, label: i.label, ...(i.value !== undefined ? { value: i.value } : {}), ...(i.expected ? { expected: i.expected } : {}), ...(i.detail?.length ? { detail: i.detail.slice(0, 12) } : {}) })),
        fixed: false,
      };
      await writeJsonAtomic(passFile(dir, rec), rec);
    }
    if (!rec.failed.length || rec.pass > MAX_FIX_PASSES) return cost;
    try {
      cost = sumCost(cost, await fixTurn(id, rec, deps));
    } catch (e) {
      cost = sumCost(cost, e instanceof StepError ? e.costUsd : undefined);
      await writeJsonAtomic(passFile(dir, rec), { ...rec, fixed: true, fixError: (e as Error).message });
      return cost;
    }
    await writeJsonAtomic(passFile(dir, rec), { ...rec, fixed: true });
  }
}

/** One fix turn: the post and its failures in, the post out, edited in place. */
async function fixTurn(id: string, rec: CheckPassRecord, deps: EngineDeps): Promise<number | undefined> {
  const dir = runDir(id);
  const stage = async (ws: string) => {
    const inputs = path.join(ws, "inputs");
    await copyDir(path.join(dir, "post"), path.join(inputs, "post"));
    await copyFile(path.join(dir, "sources.json"), path.join(inputs, "sources.json"));
    await copyFile(path.join(dir, "claims.json"), path.join(inputs, "claims.json"));
    await writeFile(path.join(inputs, "check-failures.json"), `${JSON.stringify(rec.failed, null, 2)}\n`, "utf8");
    // The post is also seeded into out/post: the fix edits it in place and every paragraph
    // the check did not flag is carried over byte for byte (a fix that rewrote the whole post
    // cost $4 a pass and changed text nobody had flagged).
    await copyDir(path.join(dir, "post"), path.join(ws, "out", "post"));
  };
  return critiqueTurn(id, 0, "fix", { maxCritiqueRounds: 2 }, deps, stage, (ws) => ingestPost(ws, dir), { name: `fix-${rec.label}-${rec.pass}`, checkFailures: failuresText(rec.failed) });
}

/** Run the loop outside a step and put what it cost on `stepName`'s record. */
async function checkedBetween(id: string, label: string, stepName: StepName, deps: EngineDeps): Promise<void> {
  const cost = await checkLoop(id, label, deps).catch(noteCheckError);
  if (!cost) return;
  await updateRun(id, (r) => ({ ...r, steps: r.steps.map((s) => (s.name === stepName ? { ...s, costUsd: Math.round(((s.costUsd ?? 0) + cost) * 1_000_000) / 1_000_000 } : s)) }), deps.now);
}

/* ── the check step ────────────────────────────────────────────────────────── */

async function checkStep(id: string, deps: EngineDeps): Promise<undefined> {
  const dir = runDir(id);
  await rm(path.join(dir, "check"), { recursive: true, force: true });
  const report = await runCheck(dir, { render: deps.render, now: deps.now });
  await writeJsonAtomic(path.join(dir, "check.json"), report);
  return undefined;
}

/* ── landing ───────────────────────────────────────────────────────────────── */

async function land(id: string, deps: EngineDeps): Promise<void> {
  const run = await readRun(id);
  const dir = runDir(id);
  try {
    if (!run.approval) throw new ArticleError("a run with no recorded approval cannot land", 409, "not-approved");
    const patches = (await readPatches(id)).filter((p) => run.approval!.patches.includes(p.id));
    const meta = await readJsonFile<PostMeta | null>(path.join(dir, "post", "meta.json"), null);
    if (!meta) throw new ArticleError("the post has no meta.json", 409, "no-post");
    await rm(path.join(dir, "medium"), { recursive: true, force: true });
    const pkg = await buildMediumPackage(dir, meta);
    if (pkg.failedFigures.length) console.error(`[articles] ${id}: figures that did not render to PNG: ${pkg.failedFigures.join(", ")}`);
    const landing = await landRun({
      runDir: dir,
      run,
      approvedPatches: patches,
      ...(deps.registry ? { registry: deps.registry } : {}),
      now: deps.now,
      progress: (l) => updateRun(id, (r) => ({ ...r, landing: { ...l, medium: "medium" } }), deps.now).then(() => undefined),
    });
    await updateRun(id, (r) => ({ ...r, status: "landed", landing: { ...landing, medium: "medium" } }), deps.now);
  } catch (e) {
    const err = e as Error;
    if (e instanceof LandingError && e.output) await writeFile(path.join(dir, "landing.log"), e.output, "utf8").catch(() => undefined);
    await updateRun(
      id,
      (r) => {
        const out: ArticleRun = { ...r, status: "failed", error: `landing: ${err.message}` };
        if (e instanceof LandingError && e.landing.branch) out.landing = { ...e.landing, medium: "medium" };
        return out;
      },
      deps.now,
    );
  }
}
