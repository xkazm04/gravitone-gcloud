// THE REVIEWER ENGINES: which four CLIs a reviewer may run through, and the
// per-engine profile each one is spawned with.
//
// Split out of cliSeam.ts (the door, which re-exports these) because the reviewer
// half is its own seam: the engine names, the read-only tool set, the workspace a
// reviewer is allowed, and the argv each engine takes. reviewerCommand.ts turns a
// call into that argv, and runReviewer.ts spawns it.

import type { AgentTool } from "./cliSeam";

/* ══ Reviewers — four engines, one read-only profile ═════════════════════════
 *
 * Scope amendment 1: a drafted post is reviewed by models from every provider
 * the operator has a login for, through the local CLIs on those logins. A
 * reviewer READS: the post, its sources, the pages it cites. It never writes:
 * the review comes back as ONE JSON object in its final message, and nothing a
 * reviewer leaves on disk is ever read back (lib/articles/engine.ts records it
 * as a fence breach).
 *
 * The workspace holds only REVIEW_WORKSPACE — a copy of `post/`, `sources.json`
 * and `REVIEW.md` (the full prompt). claude and codex also get the full prompt
 * on stdin; agy and grok take the prompt as an argument, so they get a short
 * pointer at REVIEW.md, which keeps the argv far under Windows' command-line
 * ceiling (the contest runner's shape).
 *
 * PER ENGINE, AND WHAT IS PROVEN (2026-10-05, one-line probes):
 *
 *   claude  the writer's fenced profile above, tools WebSearch WebFetch Read
 *           (no Write, no Edit). Flags proven to parse with an empty prompt.
 *   codex   `exec --json --skip-git-repo-check --ephemeral --ignore-user-config
 *           --ignore-rules -C <ws> --sandbox read-only -m <model>
 *           -c model_reasoning_effort="<e>" -c web_search="live" -`, prompt on
 *           stdin. PROBED (codex-cli 0.160.0, gpt-6-astra): the page was opened
 *           through the web_search tool AND a file write was "rejected: blocked
 *           by policy" in the same session. Reports no cost.
 *   agy     `-p <pointer> --model <slug> --output-format json
 *           --dangerously-skip-permissions --sandbox --disable-slash-commands
 *           --print-timeout <n>m`, stdin closed empty, cwd = the workspace. The
 *           slug carries the effort (`gemini-3.8-flash-high`). PROBED: without
 *           --dangerously-skip-permissions headless mode auto-DENIES read_url
 *           (empty response, `denied_actions: read_url`), so web research needs
 *           it; with it, `--sandbox` combines and the run succeeds, but neither
 *           `--sandbox` nor `--mode plan` stopped a file write INSIDE the
 *           workspace. agy is therefore read-only by isolation, not by flag:
 *           a throwaway copy, nothing read back, writes recorded. The narrower
 *           alternative (a per-tool `permissions.allow` rule for read_url in the
 *           operator's agy settings.json) edits the operator's own
 *           configuration and is left to the operator. Reports no cost.
 *   grok    `-p <pointer> -m <model> --effort <e> --output-format json
 *           --cwd <ws> --permission-mode plan --no-subagents`, env GROK_MEMORY=0
 *           GROK_AGENT_DASHBOARD=0. ARGV UNPROVEN AGAINST A LIVE SESSION: the
 *           account answers 402 Payment Required (probed; the envelope is
 *           `{"type":"error","message":"…402 Payment Required…","http_status":402}`,
 *           exit 1). Whether plan mode permits web search is not known. grok
 *           1.0.40 also imports claude/cursor skills, MCP servers and hooks
 *           ("harness compatibility") and offers no headless switch to refuse
 *           them, so the operator's configuration is NOT excluded for grok.
 */

export type ReviewerEngineName = "claude" | "codex" | "grok" | "agy";
export const REVIEWER_ENGINE_NAMES: readonly ReviewerEngineName[] = ["claude", "codex", "grok", "agy"];

/** A claude reviewer's tools: research and read, never write. */
export const REVIEWER_TOOLS: readonly AgentTool[] = ["WebSearch", "WebFetch", "Read"];
export const REVIEW_PROMPT_FILE = "REVIEW.md";
export const REVIEW_WORKSPACE: readonly string[] = ["post", "sources.json", REVIEW_PROMPT_FILE];
export const REVIEW_POINTER =
  "Read REVIEW.md in the current directory and do exactly what it says. You are read-only: do not create, edit or delete any file. Your whole final message is the one JSON object REVIEW.md asks for.";

export interface ReviewerCall {
  engine: ReviewerEngineName;
  /** The isolated workspace: REVIEW_WORKSPACE and nothing else. */
  cwd: string;
  /** The full review prompt (also written to REVIEW.md by the caller). */
  prompt: string;
  model: string;
  effort: string;
  timeoutMin: number;
}

export interface EngineCommand {
  /** The argv after the binary. */
  argv: string[];
  /** Written to stdin, then stdin is closed ("" = closed empty). */
  stdin: string;
  /** Added to the reviewer environment. */
  env: Record<string, string>;
}

/** The three-tier effort a Gemini slug carries. */
export const agyTier = (effort: string) => (effort === "xhigh" || effort === "max" ? "high" : effort);
/** codex has no `max`; its top reasoning effort is `xhigh`. */
export const codexEffort = (effort: string) => (effort === "max" ? "xhigh" : effort);
