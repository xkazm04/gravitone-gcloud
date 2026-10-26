import { AppError } from "@gt/domain/errors";
import type { Estimate } from "@gt/domain/estimate";
import type { MissingStep, Outputs } from "@gt/kernel/job-core";

// THE ARTICLE JOB'S PLAN, PURE - which job a run's act is, and which of its steps are
// still missing. Absorbed from lib/articles/drive.ts (v1 driveRun): research, outline,
// draft, critique and check in that order, each run at most once by the manifest's own
// record (skip-if-done stays in the walk, lib/articles/drive.ts `walk`), and the human
// gate OUTSIDE the job - a run's job ends at `awaiting-approval`.
//
// THREE ACTS, THREE JOBS, ONE RUN. v1 had one drive per run that a route restarted with
// an un-awaited promise after each human act. Here each act that spends or acts outward
// is its own job serving the same Run (`of: {kind: "run", id}`):
//   gate      job:run:<runId>             create, research, outline, draft, critique, check
//   rework n  job:run:<runId>:rework-<n>  draft, critique, check   (the operator sent it back)
//   landing   job:run:<runId>:landing     land                     (approve's continuation)
// The gate job's id is the one L26 `launchRun` mints for a Run, so a Floor launch and a
// CLI or route launch are the same record. A rework is numbered by v1's own rework count,
// so re-delivering the same return finds the job it already enqueued (hitl-approval:
// resume-after-decision, "runs the staged action exactly once"); a landing is one per run,
// because an approval is.

export type ArticleAct = { readonly kind: "gate" } | { readonly kind: "rework"; readonly n: number } | { readonly kind: "landing" };
export type ArticleJob = { readonly runId: string; readonly act: ArticleAct };

/** The five steps of v1's drive. */
export const WORK_STEPS = ["research", "outline", "draft", "critique", "check"] as const;
export type WorkStep = (typeof WORK_STEPS)[number];
export type ArticleStep = "create" | WorkStep | "land";

const PREFIX = "job:run:";
/** lib/articles/store.ts RUN_ID_RE: a run id never carries a colon, so the suffix is unambiguous. */
const RUN_ID_RE = /^[a-z0-9][a-z0-9-]{0,90}$/;

export function articleJobId(runId: string, act: ArticleAct): string {
  if (!RUN_ID_RE.test(runId)) throw new AppError("invalid", `not an article run id: ${JSON.stringify(runId)}`);
  if (act.kind === "gate") return `${PREFIX}${runId}`;
  if (act.kind === "landing") return `${PREFIX}${runId}:landing`;
  // The same bound parseArticleJob reads (`rework-[1-9][0-9]{0,3}`): an id minted past it is one no plan can read.
  if (!Number.isInteger(act.n) || act.n < 1 || act.n > 9999) throw new AppError("invalid", `a rework is numbered from 1 to 9999; got ${act.n}`);
  return `${PREFIX}${runId}:rework-${act.n}`;
}

/** The act a job id names; refused for an id this producer never minted. */
export function parseArticleJob(jobId: string): ArticleJob {
  const bad = (): AppError => new AppError("invalid", `job ${jobId} is not an article job (job:run:<runId>[:rework-<n>|:landing])`);
  if (!jobId.startsWith(PREFIX)) throw bad();
  const [runId = "", suffix, ...rest] = jobId.slice(PREFIX.length).split(":");
  if (!RUN_ID_RE.test(runId) || rest.length > 0) throw bad();
  if (suffix === undefined) return { runId, act: { kind: "gate" } };
  if (suffix === "landing") return { runId, act: { kind: "landing" } };
  const m = /^rework-([1-9][0-9]{0,3})$/.exec(suffix);
  if (m === null) throw bad();
  return { runId, act: { kind: "rework", n: Number(m[1]) } };
}

/**
 * What each step is estimated at - the figure the job ceiling is checked against BEFORE
 * the step runs (kernel job-core `next`). Measured, not modelled: a run cost $47-92 of
 * reported spend with a median of $70 on 2026-10 (lib/articles/types.ts RUN_COST_HINT),
 * and the critique was 75-80% of it (four runs, 2026-10-14, .claude/skills/article-run).
 * The split below sums to the median; seconds are the same runs' wall time.
 * `create`, `check` and `land` run no agent turn, so they are priced at zero, not unpriced:
 * a ceiling over them has nothing to refuse.
 */
export const STEP_ESTIMATE: { readonly [S in ArticleStep]: Estimate } = {
  create: { seconds: 5, usd: 0 },
  research: { seconds: 900, usd: 8 },
  outline: { seconds: 180, usd: 2 },
  draft: { seconds: 900, usd: 6 },
  critique: { seconds: 3600, usd: 54, usdRange: [35, 72] },
  check: { seconds: 60, usd: 0 },
  land: { seconds: 300, usd: 0 },
};

export function stepsOf(act: ArticleAct): readonly ArticleStep[] {
  if (act.kind === "gate") return ["create", ...WORK_STEPS];
  if (act.kind === "rework") return ["draft", "critique", "check"];
  return ["land"];
}

/** The plan IS the missing outputs (v1 MV): a step runs while its output is not booked. */
export function planArticle(jobId: string, outputs: Outputs): readonly MissingStep[] {
  const { act } = parseArticleJob(jobId);
  return stepsOf(act)
    .filter((s) => !outputs.has(s))
    .map((name) => ({ name, estimate: STEP_ESTIMATE[name] }));
}

export const isWorkStep = (s: string): s is WorkStep => (WORK_STEPS as readonly string[]).includes(s);
