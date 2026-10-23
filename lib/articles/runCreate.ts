// Creating a run: a topic in, a run on disk out. Reads and the human's acts live in
// their own files; creation is the only one that starts a run from nothing.
//
// A RUN WRITTEN AROUND A TRIAL (`input.trial`, 2026-10-18). The trial was measured before
// the run exists, by an agent with a shell, in its own directory (lib/articles/trial/store.ts).
// Creation validates it BEFORE anything is written (a bad trial creates nothing), then copies
// it to `<run>/experiment/`, writes the source the post cites as [1]
// (`<run>/experiment-source.json`), sets `run.trial` and links the trial to the run. If any of
// that fails, the run directory is removed again: a half-made trial run would otherwise be
// resumable as a classic post about a measurement it cannot cite.

import { copyFile, lstat, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { MODEL } from "@/lib/model";

import { EXPERIMENT_DIR, EXPERIMENT_SOURCE_FILE } from "./ingestSources";
import { loadPromptFile, PROMPT_FILE } from "./prompt";
import { resolveRegistryDir, resolveRegistryRemote, resolveStandard, resolveTopicSubject } from "./registryRead";
import { ArticleError, freshRunId, RUN_ID_RE, runDir, updateRun, writeJsonAtomic, writeNewRun } from "./store";
import { experimentSource, trialApplicationPath } from "./trial/record";
import { linkTrialRun, readTrial, readTrialDetail, trialDir } from "./trial/store";
import { type ArticleRun, type ArticleTopic, type ArticleTrialRef, type CreateRunInput, EFFORT_LEVELS, type EffortLevel, type Source } from "./types";
import { defaultDeps, type EngineDeps } from "./engine";

/* ── create ────────────────────────────────────────────────────────────────── */

const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9.\-[\]_]{0,63}$/;

/**
 * `opts.id` names the run instead of minting one: a Run launched from the Floor composer
 * already has its id (L26 `launchRun`), and its job's create step makes the manifest under
 * that same id (lib/producers/article.ts), so the Run, its job and run.json are one name.
 */
export async function createRun(input: CreateRunInput, deps: EngineDeps = defaultDeps(), opts: { id?: string } = {}): Promise<ArticleRun> {
  if (opts.id !== undefined && !RUN_ID_RE.test(opts.id)) throw new ArticleError(`not a run id: ${JSON.stringify(opts.id)}`, 400, "bad-id");
  const t = input.topic;
  if (!t || (t.kind !== "subject" && t.kind !== "free")) throw new ArticleError("topic.kind must be subject or free", 400, "bad-topic");
  const model = (input.model ?? MODEL).trim();
  if (!MODEL_RE.test(model)) throw new ArticleError(`not a model id: ${JSON.stringify(input.model)}`, 400, "bad-model");
  const effort: EffortLevel = input.effort ?? "high";
  if (!EFFORT_LEVELS.includes(effort)) throw new ArticleError(`effort must be one of ${EFFORT_LEVELS.join(", ")}`, 400, "bad-effort");
  // A trial is validated in full before anything exists: a void, unclosed, taken or mismatched
  // trial creates no run directory.
  const trial = input.trial !== undefined ? await prepareTrial(input.trial, t, deps) : undefined;
  const asked = t.angle?.trim() || trial?.question.trim();
  const angle = asked ? asked.slice(0, 600) : undefined;

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

  const id = opts.id ?? (await freshRunId(topic.subject ?? topic.text, now));
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
  if (!trial) return run;

  try {
    await copyTrialBundle(trial.dir, path.join(runDir(id), EXPERIMENT_DIR));
    await writeJsonAtomic(path.join(runDir(id), EXPERIMENT_SOURCE_FILE), trial.source);
    const linked = await updateRun(id, (r) => ({ ...r, trial: trial.ref }), deps.now);
    await linkTrialRun(trial.ref.id, id, now);
    return linked;
  } catch (e) {
    await rm(runDir(id), { recursive: true, force: true, maxRetries: 3 }).catch(() => undefined);
    throw e;
  }
}

/* ── the trial a run is written around ─────────────────────────────────────── */

interface PreparedTrial {
  /** The trial's own directory. */
  dir: string;
  ref: ArticleTrialRef;
  /** Source 1 of the run, cited as the post's first-hand measurement. */
  source: Source;
  /** The prereg's question: the run's angle unless the caller gave one. */
  question: string;
}

/**
 * The trial named by `createRun({trial})`, checked in the order a caller can act on: it exists
 * (404 `no-trial`), it is closed (409 `trial-not-closed`), it measured something (400
 * `trial-void`, also for a trial with no verdict at all), no other run holds it (409
 * `trial-taken`), and the topic is its subject (400 `trial-mismatch`). Its files must agree with
 * its manifest (500 `trial-incomplete`), and the registry must have a GitHub remote to cite the
 * record at (500 `no-registry-remote`, from `experimentSource`).
 */
async function prepareTrial(trialId: string, topic: ArticleTopic, deps: EngineDeps): Promise<PreparedTrial> {
  const rec = await readTrial(trialId);
  if (rec.status !== "closed") throw new ArticleError(`trial ${trialId} is ${rec.status}; only a closed trial is written up`, 409, "trial-not-closed");
  if (!rec.verdict || rec.verdict === "void") {
    throw new ArticleError(`trial ${trialId} ${rec.verdict ? "is void: a control failed or an arm fell short of n, so nothing was measured" : "has no verdict"}; it becomes a lead, not a post`, 400, "trial-void");
  }
  if (rec.runId) throw new ArticleError(`trial ${trialId} already belongs to run ${rec.runId}`, 409, "trial-taken");
  const subject = `${rec.subject.bundle}/${rec.subject.slug}`;
  const named = topic.kind === "subject" ? (topic.bundle && topic.subject ? `${topic.bundle}/${topic.subject}` : (topic.subject ?? "")) : "";
  if (named !== subject) throw new ArticleError(`trial ${trialId} measured ${subject}; the topic must be that subject, not ${JSON.stringify(named || topic.text)}`, 400, "trial-mismatch");

  const dir = trialDir(trialId);
  const detail = await readTrialDetail(dir, deps.root);
  if (!detail) throw new ArticleError(`trial ${trialId} is closed ${rec.verdict} but holds no verdict.json`, 500, "trial-incomplete");
  const { prereg, verdict } = detail;
  if (verdict.verdict !== rec.verdict) throw new ArticleError(`trial ${trialId}: trial.json says ${rec.verdict}, verdict.json says ${verdict.verdict}`, 500, "trial-incomplete");
  if (`${prereg.subject.bundle}/${prereg.subject.slug}` !== subject) throw new ArticleError(`trial ${trialId}: trial.json is on ${subject}, prereg.json on ${prereg.subject.bundle}/${prereg.subject.slug}`, 500, "trial-incomplete");
  // The agent's account of the experiment is the writer's and the reviewers' only view of what
  // happened beyond the numbers (anomalies, grading artifacts, the prior). The agent harness
  // refuses a subagent's report file, so the ORCHESTRATOR saves it from the agent's reply; a rule
  // that must always hold is a gate, not a line in the skill (agent-instruction-files/
  // enforcement-demotion). Measured: 2 of 2 trials on 2026-10-18 reached here without one.
  if (!detail.report?.trim()) {
    throw new ArticleError(`trial ${trialId} has no REPORT.md: save the RUN agent's report (the text after its "=== REPORT.md ===" line) into the trial directory first`, 409, "trial-no-report");
  }

  const ref: ArticleTrialRef = {
    id: rec.id,
    verdict: rec.verdict,
    technique: prereg.technique,
    alternative: prereg.alternative.name,
    metric: prereg.metric.label,
    n: prereg.n,
    sourceN: 1,
    applicationPath: trialApplicationPath(rec.subject.file, prereg.stack, prereg.technique),
  };
  const source = experimentSource(ref, prereg, verdict, resolveRegistryRemote(process.env, deps.root));
  return { dir, ref, source, question: prereg.question };
}

/** What a trial directory may hold that a run does not copy: environments, caches and history
 *  (a harness can install a whole interpreter beside its code). */
const SKIP_NAMES = new Set(["node_modules", ".venv", "venv", "__pycache__", ".git"]);
/** A file over this is left in the trial directory: the run keeps the measurement's record and
 *  its code, not its datasets or model outputs. */
const MAX_COPY_BYTES = 1024 * 1024;

/** Copy a trial directory into `<run>/experiment/`. What was left behind is listed in
 *  `SKIPPED.txt` there (absent when nothing was), so the gate can tell a file the trial never
 *  had from one the run did not take. */
async function copyTrialBundle(from: string, to: string): Promise<void> {
  const skipped: string[] = [];
  const walk = async (rel: string): Promise<void> => {
    const names = (await readdir(path.join(from, rel))).sort();
    await mkdir(path.join(to, rel), { recursive: true });
    for (const name of names) {
      const child = rel ? `${rel}/${name}` : name;
      const s = await lstat(path.join(from, child));
      if (SKIP_NAMES.has(name)) skipped.push(`${child}${s.isDirectory() ? "/" : ""} (${name})`);
      else if (s.isSymbolicLink()) skipped.push(`${child} (a symbolic link)`);
      else if (s.isDirectory()) await walk(child);
      else if (!s.isFile()) skipped.push(`${child} (not a regular file)`);
      else if (s.size > MAX_COPY_BYTES) skipped.push(`${child} (${s.size} bytes, over ${MAX_COPY_BYTES})`);
      else await copyFile(path.join(from, child), path.join(to, child));
    }
  };
  await walk("");
  if (skipped.length) await writeFile(path.join(to, "SKIPPED.txt"), `${skipped.join("\n")}\n`, "utf8");
}
