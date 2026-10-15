// THE AGENT SEAM — a headless `claude` run that may use tools. Server only.
//
// lib/claudeCli.ts is the REASONING door: a prompt in, one answer out, every
// tool taken away (`--allowed-tools "" --max-turns 1`). lib/text/types.ts says
// in so many words that an agentic capability "would be a SEPARATE SEAM, not a
// flag on this one", because folding the two into one function with a mode flag
// makes "which mode am I in?" a bug that type-checks. This file is that separate
// seam. It shares exactly one thing with the reasoning door — the environment
// strip (`seatOnlyEnv`), imported rather than copied so the two credential lists
// cannot drift — and nothing else.
//
// WHAT AN AGENT RUN HERE CAN AND CANNOT TOUCH. The article pipeline hands the
// agent untrusted web pages, so the run is fenced by flags, not by asking:
//
//   · tools: a closed allowlist, at most WebSearch WebFetch Read Write Edit.
//     `--tools` limits what EXISTS in the session, `--allowed-tools`
//     pre-approves the same list, `--permission-prompts none` denies anything
//     that would still prompt. No Bash, no PowerShell, no subagents, no MCP.
//   · files: `--restricted` confines the file tools to the working directory,
//     and the working directory is an ISOLATED WORKSPACE that holds only
//     `inputs/` (copies) and `out/` (where the agent writes). `runAgent`
//     refuses a workspace that holds anything else. The registry is never in
//     it; registry writes are deterministic code (lib/articles/registryWrite.ts)
//     that runs only after a human approval.
//   · configuration: `--restricted` ignores user, project and local settings
//     files; `--safe-mode` disables CLAUDE.md, skills, plugins, hooks, MCP
//     servers, custom agents and output styles; `--strict-mcp-config` and
//     `--disable-slash-commands` close the two doors that remain. The operator's
//     own configuration is excluded; their LOGIN is not — the seat is the bill.
//   · credentials: the child gets `seatOnlyEnv()` — the metered-key strip from
//     lib/claudeCli.ts — so a stray ANTHROPIC_API_KEY cannot move the run onto
//     per-token billing.
//
// FLAGS, AND WHAT IS AND IS NOT KNOWN ABOUT THEM. Every flag below was read off
// `claude --help` on 2026-10-05, and the full argv was handed to the installed
// binary with an empty stdin: it parsed (the binary answered "Input must be
// provided", not "unknown option"). That proves the flags exist and parse
// together; it does not prove their combined behaviour, which only a real turn
// shows, and a real turn spends the operator's seat.
//
// OUTCOMES are the contest runner's (ai-registry skills/contest
// scripts/lib/participants.mjs classifyOutcome): `completed | timed-out |
// errored | seat-limit`, plus `unavailable` (scope amendment 1): a 402, a
// model the account does not offer, a CLI that is not installed. A seat limit
// or an unavailable engine is not a failure of the work; it is a run that did
// not happen, and the caller may say so differently.
//
// FOUR ENGINES (scope amendment 1). The article critique runs REVIEWERS through
// the local `claude`, `codex` and `agy` CLIs on the operator's own
// logins — see "Reviewers" in ./reviewerEngines.ts. The writer turns above
// are unchanged and stay claude-only.

/** The closed vocabulary of agent call sites, keyed the same way as
 *  lib/text/types.ts's TurnClass and declared in .ai/use-cases.json as
 *  `text.<class>`. A separate union, not new TurnClass members: TurnClass keys
 *  the reasoning router's plan table, and these turns can never route there. */
export type AgentTurnClass = "article-research" | "article-draft" | "article-review" | "article-critique-writer" | "strip-author";

export const AGENT_TOOLS = ["WebSearch", "WebFetch", "Read", "Write", "Edit"] as const;
export type AgentTool = (typeof AGENT_TOOLS)[number];

export type AgentOutcome = "completed" | "unavailable" | "timed-out" | "errored" | "seat-limit";

export interface RunAgentInput {
  /** The isolated workspace. Must hold nothing but `inputs/` and `out/`. */
  cwd: string;
  prompt: string;
  model: string;
  effort: string;
  /** A subset of AGENT_TOOLS. Defaults to all five. */
  tools?: readonly AgentTool[];
  timeoutMin: number;
  turn: AgentTurnClass;
  /** Passed as `--max-budget-usd` when set. */
  maxBudgetUsd?: number;
}

export interface AgentResult {
  outcome: AgentOutcome;
  /** The agent's final message. The work itself is in `out/`. */
  final: string;
  turns: number;
  costUsd?: number;
  durationMs: number;
  exitCode: number | null;
  /** Why it was not `completed`, scrubbed and one line each. */
  errors: string[];
}

// THE DOOR. Every symbol this file exported before the split is re-exported here
// under the same name and type; the bodies live in the sibling files.

export { agentArgs, assertIsolatedWorkspace, resolveAgentBin } from "./agentArgs";
export { classifyOutcome, earlyUnavailable, parseAgyEnvelope, parseCodexEvents, parseEngineEnvelope, parseEnvelope } from "./envelope";
export type { ParsedEnvelope } from "./envelope";
export { formatAgentLine, runAgent } from "./runAgent";
export { REVIEWER_ENGINE_NAMES, REVIEWER_TOOLS, REVIEW_POINTER, REVIEW_PROMPT_FILE, REVIEW_WORKSPACE } from "./reviewerEngines";
export type { EngineCommand, ReviewerCall, ReviewerEngineName } from "./reviewerEngines";
export { reviewerCommand } from "./reviewerCommand";
export { reviewerEnv } from "./reviewerEnv";
export { resolveEngineBin } from "./resolveEngineBin";
export { runReviewer } from "./runReviewer";
