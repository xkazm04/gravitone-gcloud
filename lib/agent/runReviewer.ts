// THE REVIEWER'S SPAWN: one reviewer run to completion, the read-only twin of
// runAgent.ts.
//
// Split out of cliSeam.ts (the door, which re-exports this) because it is the
// reviewer's spawner, with its own early-stop watch for an engine that can sit
// idle after a start-up failure. It shares formatAgentLine with runAgent.ts and
// the outcome classification with envelope.ts.

import type { AgentResult, ReviewerCall } from "./cliSeam";
import { MIN_TIMEOUT_MIN, assertIsolatedWorkspace } from "./agentArgs";
import { earlyUnavailable, parseEngineEnvelope } from "./envelope";
import { reviewerCommand } from "./reviewerCommand";
import { resolveEngineBin } from "./resolveEngineBin";
import { reviewerEnv } from "./reviewerEnv";
import { REVIEW_WORKSPACE } from "./reviewerEngines";
import { formatAgentLine, spawnTurn } from "./spawnTurn";

/**
 * Run one reviewer to completion. Like runAgent, it never throws for an
 * outcome — a missing CLI is `unavailable`, a 402 is `unavailable`, a usage
 * limit is `seat-limit` — and throws only for a caller error (a workspace that
 * holds anything but REVIEW_WORKSPACE: the post, its sources, REVIEW.md and,
 * on a trial run, the text-only `experiment/`).
 */
export function runReviewer(call: ReviewerCall): Promise<AgentResult> {
  assertIsolatedWorkspace(call.cwd, REVIEW_WORKSPACE);
  const cmd = reviewerCommand(call);
  const timeoutMs = Math.round(Math.max(MIN_TIMEOUT_MIN, Number.isFinite(call.timeoutMin) ? call.timeoutMin : MIN_TIMEOUT_MIN) * 60_000);
  const label = `${call.engine}:${call.model}`;

  return new Promise((resolve) => {
    let bin: string[];
    try {
      bin = resolveEngineBin(call.engine);
    } catch (e) {
      const r: AgentResult = { outcome: "unavailable", final: "", turns: 0, durationMs: 0, exitCode: null, errors: [(e as Error).message] };
      console.error(formatAgentLine("article-review", r, label, call.prompt.length));
      return resolve(r);
    }

    resolve(
      spawnTurn({
        bin,
        argv: cmd.argv,
        cwd: call.cwd,
        env: reviewerEnv(call.engine),
        stdin: cmd.stdin,
        timeoutMs,
        timeoutMin: call.timeoutMin,
        turn: "article-review",
        label,
        promptChars: call.prompt.length,
        spawnErrorMessage: (m) => `the ${call.engine} CLI could not be started: ${m}`,
        parse: (stdout) => parseEngineEnvelope(call.engine, stdout),
        earlyStop: (chunk) => earlyUnavailable(call.engine, chunk),
      }),
    );
  });
}
