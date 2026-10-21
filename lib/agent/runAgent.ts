// THE WRITER'S SPAWN: one headless `claude` agent turn, run to completion.
//
// Split out of cliSeam.ts (the door, which re-exports these) because this is the
// function that spawns a writer turn. Its reviewer twin is runReviewer.ts, which
// shares formatAgentLine below. The argv comes from agentArgs.ts and the outcome
// from envelope.ts.

import { seatOnlyEnv } from "@/lib/claudeCli";

import type { AgentResult, RunAgentInput } from "./cliSeam";
import { MIN_TIMEOUT_MIN, agentArgs, assertIsolatedWorkspace, resolveAgentBin } from "./agentArgs";
import { parseEnvelope } from "./envelope";
import { formatAgentLine, spawnTurn } from "./spawnTurn";

export { formatAgentLine };

/**
 * Run one agent turn to completion. Never throws for an outcome: a spawn
 * failure, a timeout or a seat limit all come back as an AgentResult, because
 * the caller records every turn it paid for (or tried to). It throws only for a
 * caller error — a workspace that is not isolated, a tool outside the list.
 */
export function runAgent(input: RunAgentInput): Promise<AgentResult> {
  assertIsolatedWorkspace(input.cwd);
  const args = agentArgs(input);
  const timeoutMs = Math.round(Math.max(MIN_TIMEOUT_MIN, Number.isFinite(input.timeoutMin) ? input.timeoutMin : MIN_TIMEOUT_MIN) * 60_000);

  return new Promise((resolve) => {
    let bin: string[];
    try {
      bin = resolveAgentBin();
    } catch (e) {
      const r: AgentResult = { outcome: "errored", final: "", turns: 0, durationMs: 0, exitCode: null, errors: [(e as Error).message] };
      console.error(formatAgentLine(input.turn, r, input.model, input.prompt.length));
      return resolve(r);
    }

    resolve(
      spawnTurn({
        bin,
        argv: args,
        cwd: input.cwd,
        env: seatOnlyEnv(),
        stdin: input.prompt,
        timeoutMs,
        timeoutMin: input.timeoutMin,
        turn: input.turn,
        label: input.model,
        promptChars: input.prompt.length,
        spawnErrorMessage: (m) => `the agent could not be started: ${m}`,
        parse: parseEnvelope,
      }),
    );
  });
}
