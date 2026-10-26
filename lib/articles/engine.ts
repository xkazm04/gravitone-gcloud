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
// ONE DRIVER PER RUN. The run is driven by its kernel job (lib/producers/article.ts),
// one step per job step, under the kernel's fenced slot lease on `seat.text`: a
// double-clicked resume or the CLI and the server at once find the job already
// claimed and cannot spend twice. v1's `.driver` pid file is gone (drive.ts).

import {
  runAgent as realRunAgent,
  runReviewer as realRunReviewer,
  type AgentResult,
  type ReviewerCall,
  type RunAgentInput,
} from "@/lib/agent/cliSeam";
import type { RegistryLocation } from "./registryRead";

/* ── dependencies (injectable for the probes) ──────────────────────────────── */

import type { MediumDriver } from "@/lib/medium/types";

export interface EngineDeps {
  runAgent: (input: RunAgentInput) => Promise<AgentResult>;
  /** One reviewer of the critique, through any of REVIEWER_ENGINES. */
  runReviewer: (call: ReviewerCall) => Promise<AgentResult>;
  now: () => Date;
  /** Open a browser for the rendered check items. */
  render: boolean;
  /** Where the prompt file is read from (the repo root). */
  root: string;
  /** Resolved lazily when absent. */
  registry?: RegistryLocation;
  /** The Medium draft driver; resolved from MEDIUM_DRIVER when absent. */
  medium?: MediumDriver;
}

export function defaultDeps(over: Partial<EngineDeps> = {}): EngineDeps {
  return { runAgent: realRunAgent, runReviewer: realRunReviewer, now: () => new Date(), render: true, root: process.cwd(), ...over };
}

/** Fix turns the engine runs for one check label (after the draft, after a revision) before it
 *  stops and lets the post go on with its failures recorded. */
export const MAX_FIX_PASSES = 2;

/** The longest note a human act at the gate carries. */
export { NOTE_MAX_CHARS } from "./types";

// The modules beside this file own the engine's parts. This file re-exports the names callers import.
export { createRun } from "./runCreate";
export { getRun, getRunDetail, listArticleRuns, readPatches } from "./runReads";
export { approveRun, rejectRun } from "./humanActs";
export { reworkCritiqueSection, reworkRun, reworkSection } from "./rework";
export { resumePoint, resumeRun } from "./resume";
export { driveRun, walk, type WalkReport } from "./drive";
export { ensureMediumDraft } from "./mediumDraft";
export { makeReviewerWorkspace, makeWorkspace } from "./agentSteps";
export { validateClaims, validateSources } from "./ingestSources";
export { diffFiles } from "./diffFiles";
export { assertSourcesStable } from "./critiqueWriter";
export { checkLoop, failuresText, mandatoryFailures, readCheckPasses } from "./checkLoop";
