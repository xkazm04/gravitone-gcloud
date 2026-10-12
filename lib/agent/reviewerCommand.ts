// THE REVIEWER'S ARGV: the argv, stdin and extra environment for one reviewer
// engine, as a pure function.
//
// Split out of cliSeam.ts (the door, which re-exports this) so that each engine's
// fence can be asserted by a probe without spawning anything. The claude case
// reuses agentArgs.ts, so the claude reviewer fence is the writer's fence with
// the reviewer tool list.

import { agentArgs } from "./agentArgs";
import { REVIEWER_TOOLS, REVIEW_POINTER, agyTier, codexEffort } from "./reviewerEngines";
import type { EngineCommand, ReviewerCall } from "./reviewerEngines";

/** The argv, stdin and extra env for one reviewer. Pure, so a probe can
 *  assert each engine's fence. */
export function reviewerCommand(call: Pick<ReviewerCall, "engine" | "model" | "effort" | "cwd" | "prompt" | "timeoutMin">): EngineCommand {
  switch (call.engine) {
    case "claude":
      return { argv: agentArgs({ model: call.model, effort: call.effort, tools: REVIEWER_TOOLS }), stdin: call.prompt, env: {} };
    case "codex":
      return {
        argv: [
          "exec", "--json", "--skip-git-repo-check", "--ephemeral", "--ignore-user-config", "--ignore-rules",
          "-C", call.cwd,
          "--sandbox", "read-only",
          "-m", call.model,
          "-c", `model_reasoning_effort="${codexEffort(call.effort)}"`,
          "-c", 'web_search="live"',
          "-",
        ],
        stdin: call.prompt,
        env: {},
      };
    case "agy": {
      const slug = /-(low|medium|high)$/.test(call.model) ? call.model : `${call.model}-${agyTier(call.effort)}`;
      const minutes = Math.max(1, Math.ceil(Number.isFinite(call.timeoutMin) ? call.timeoutMin : 1));
      return {
        argv: ["-p", REVIEW_POINTER, "--model", slug, "--output-format", "json", "--dangerously-skip-permissions", "--sandbox", "--disable-slash-commands", "--print-timeout", `${minutes}m`],
        stdin: "",
        env: {},
      };
    }
    case "grok":
      return {
        argv: ["-p", REVIEW_POINTER, "-m", call.model, "--effort", call.effort, "--output-format", "json", "--cwd", call.cwd, "--permission-mode", "plan", "--no-subagents"],
        stdin: "",
        env: { GROK_MEMORY: "0", GROK_AGENT_DASHBOARD: "0" },
      };
  }
}
