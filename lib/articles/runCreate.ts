// Creating a run: a topic in, a run on disk out. Reads and the human's acts live in
// their own files; creation is the only one that starts a run from nothing.

import { MODEL } from "@/lib/model";

import { loadPromptFile, PROMPT_FILE } from "./prompt";
import { resolveRegistryDir, resolveStandard, resolveTopicSubject } from "./registryRead";
import { ArticleError, freshRunId, RUN_ID_RE, writeNewRun } from "./store";
import { type ArticleRun, type CreateRunInput, EFFORT_LEVELS, type EffortLevel } from "./types";
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
  return run;
}
