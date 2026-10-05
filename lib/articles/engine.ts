// THE ARTICLE ENGINE — one post from a topic to the human gate, and on approval
// into the registry. Server only.
//
//   queued -> researching -> drafting -> checking -> awaiting-approval
//                (research)   (outline, draft) (check)        |
//                                                  approved <-+-> rejected
//                                                     |
//                                                  landing -> landed
//   any working state -> failed -> (resume) back to the state whose step failed
//
// THREE AGENT TURNS, ONE DETERMINISTIC STEP. research (web tools, call site
// `article-research`), outline and draft (no web, call site `article-draft`),
// each a fresh headless session through lib/agent/cliSeam.ts in an isolated
// workspace that holds only `inputs/` and `out/`. The check is code
// (lib/articles/checks.ts). Landing is code (lib/articles/registryWrite.ts) and
// starts only from `approved`.
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

import { runAgent as realRunAgent, type AgentResult, type AgentTool, type AgentTurnClass, type RunAgentInput } from "@/lib/agent/cliSeam";
import { MODEL } from "@/lib/model";

import { runCheck } from "./checks";
import { buildMediumPackage } from "./mediumPackage";
import { buildPrompt, loadPromptFile, MAX_PATCHES, PROMPT_FILE, type PromptPhase } from "./prompt";
import {
  resolveRegistryDir,
  resolveStandard,
  resolveTopicSubject,
  standardText,
  type RegistryLocation,
  type ResolvedStandard,
} from "./registryRead";
import { LandingError, landRun, PATCHABLE_ROOTS } from "./registryWrite";
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
  type CheckReport,
  type Claim,
  type CreateRunInput,
  type EffortLevel,
  type PostMeta,
  type RegistryPatch,
  type Source,
  type StepName,
} from "./types";

/* ── dependencies (injectable for the probes) ──────────────────────────────── */

export interface EngineDeps {
  runAgent: (input: RunAgentInput) => Promise<AgentResult>;
  now: () => Date;
  /** Open a browser for the rendered check items. */
  render: boolean;
  /** Where the prompt file is read from (the repo root). */
  root: string;
  /** Resolved lazily when absent. */
  registry?: RegistryLocation;
}

export function defaultDeps(over: Partial<EngineDeps> = {}): EngineDeps {
  return { runAgent: realRunAgent, now: () => new Date(), render: true, root: process.cwd(), ...over };
}

const STEP_PLAN: Record<Exclude<StepName, "check">, { phase: PromptPhase; turn: AgentTurnClass; tools: AgentTool[]; timeoutMin: number }> = {
  research: { phase: "research", turn: "article-research", tools: ["WebSearch", "WebFetch", "Read", "Write", "Edit"], timeoutMin: 45 },
  outline: { phase: "outline", turn: "article-draft", tools: ["Read", "Write", "Edit"], timeoutMin: 15 },
  draft: { phase: "draft", turn: "article-draft", tools: ["Read", "Write", "Edit"], timeoutMin: 45 },
};

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
  const [sources, claims, outline, meta, check, patches] = await Promise.all([
    readJsonFile<Source[]>(inRun(id, "sources.json"), []),
    readJsonFile<Claim[]>(inRun(id, "claims.json"), []),
    readTextFile(inRun(id, "outline.md")),
    readJsonFile<PostMeta | null>(inRun(id, "post/meta.json"), null),
    readJsonFile<CheckReport | null>(inRun(id, "check.json"), null),
    readPatches(id),
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
    ...(post ? { post } : {}),
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
  return "checking";
}

const RESUMABLE: ArticleStatus[] = ["queued", "researching", "drafting", "checking", "approved", "landing"];

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
    const cost = name === "check" ? await checkStep(id, deps) : await agentStep(id, name, deps);
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
  const order = ["research", "outline", "draft", "check"];
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

async function makeWorkspace(id: string, name: string, now: Date): Promise<string> {
  const ws = path.join(os.tmpdir(), "gravitone-article-ws", `${id}-${name}-${now.getTime()}`);
  await rm(ws, { recursive: true, force: true });
  await mkdir(path.join(ws, "inputs"), { recursive: true });
  await mkdir(path.join(ws, "out"), { recursive: true });
  return ws;
}

async function agentStep(id: string, name: Exclude<StepName, "check">, deps: EngineDeps): Promise<number | undefined> {
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
  name: Exclude<StepName, "check">,
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

async function ingestDraft(ws: string, dir: string): Promise<void> {
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

  // A redraft replaces the previous post wholesale.
  await rm(path.join(dir, "post"), { recursive: true, force: true });
  await rm(path.join(dir, "patches"), { recursive: true, force: true });
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
        { cwd: tmp, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
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
