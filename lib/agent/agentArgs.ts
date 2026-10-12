// THE AGENT SEAM'S FENCE AND BINARY: the argv a writer turn is spawned with,
// the resolver that finds the `claude` binary, and the isolated-workspace check.
//
// Split out of cliSeam.ts (the door, which re-exports these) so the fence can be
// read on its own: agentArgs is where the agent's argv, its tool list and its
// permission flags are built. resolveAgentBin and assertIsolatedWorkspace are the
// two checks that run before every spawn, which is why they sit beside it.
// agentArgs is pure, so a probe can assert it.

import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { AGENT_TOOLS, type RunAgentInput } from "./cliSeam";

/** The floor under `timeoutMin` — three seconds, so a zero or a negative is
 *  never read as "kill at once" (lib/claudeCli.ts floorTimeout's reasoning),
 *  while a probe can still watch a timeout fire without waiting a minute. */
export const MIN_TIMEOUT_MIN = 0.05;

/** The argv after the binary. Pure, so a probe can assert the fence. */
export function agentArgs(input: Pick<RunAgentInput, "model" | "effort" | "tools" | "maxBudgetUsd">): string[] {
  const tools = [...new Set(input.tools?.length ? input.tools : AGENT_TOOLS)];
  for (const t of tools) {
    if (!(AGENT_TOOLS as readonly string[]).includes(t)) throw new Error(`tool not allowed through the agent seam: ${t}`);
  }
  // Comma-joined: one argv element, never an empty one, so no shell quoting
  // question arises (lib/claudeCli.ts's header records what an empty argument
  // did on Windows). There is no shell here anyway — see resolveAgentBin.
  const list = tools.join(",");
  const args = [
    "-p",
    "--output-format", "json",
    "--model", input.model,
    "--effort", input.effort,
    "--restricted",
    "--safe-mode",
    "--tools", list,
    "--allowed-tools", list,
    "--permission-mode", "dontAsk",
    "--permission-prompts", "none",
    "--strict-mcp-config",
    "--disable-slash-commands",
    "--no-session-persistence",
  ];
  if (typeof input.maxBudgetUsd === "number" && input.maxBudgetUsd > 0) args.push("--max-budget-usd", String(input.maxBudgetUsd));
  return args;
}

/**
 * The binary, as an argv prefix, spawned WITHOUT a shell.
 *
 * `ARTICLES_AGENT_BIN` overrides it (`|`-separated argv, e.g.
 * `node|tests/fixtures/articles/stub-agent.mjs`) — that is how the probes and
 * the CLI dry run drive a stub instead of spending a seat.
 *
 * Otherwise PATH is searched. On Windows the npm install puts a `claude.cmd`
 * shim on PATH, and a .cmd cannot be spawned without a shell; current packages
 * ship a native binary beside it, which can. That is the contest runner's
 * resolver (ai-registry contest 1.9.0, "native claude.exe resolver").
 */
export function resolveAgentBin(env: Record<string, string | undefined> = process.env): string[] {
  const override = env.ARTICLES_AGENT_BIN?.trim();
  // A relative path is resolved against THIS process's cwd: the child runs in
  // the workspace, where the same relative path would name nothing.
  if (override)
    return override
      .split("|")
      .map((s) => (s === "node" ? process.execPath : existsSync(path.resolve(s)) ? path.resolve(s) : s));

  const win = process.platform === "win32";
  const exts = win ? [".exe", ".cmd", ""] : [""];
  const dirs = (env.PATH ?? env.Path ?? "").split(path.delimiter).filter(Boolean);
  const candidates: string[] = [];
  for (const d of dirs) for (const e of exts) candidates.push(path.join(d, `claude${e}`));
  candidates.push(path.join(os.homedir(), ".local", "bin", win ? "claude.exe" : "claude"));
  for (const c of candidates) {
    if (!existsSync(c)) continue;
    if (win && (/\.cmd$/i.test(c) || !path.extname(c))) {
      const native = path.join(path.dirname(c), "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe");
      if (existsSync(native)) return [native];
      continue;
    }
    return [c];
  }
  throw new Error("The `claude` CLI was not found on PATH (set ARTICLES_AGENT_BIN to point at it).");
}

/** The workspace rule, checked before every spawn. A writer turn's workspace
 *  holds `inputs/` and `out/`; a reviewer's holds REVIEW_WORKSPACE. */
export function assertIsolatedWorkspace(cwd: string, allowed: readonly string[] = ["inputs", "out"]): void {
  const entries = readdirSync(cwd);
  const extra = entries.filter((e) => !allowed.includes(e));
  if (extra.length) throw new Error(`the agent workspace must hold only ${allowed.map((a) => (a.includes(".") ? a : `${a}/`)).join(" and ")}, found: ${extra.join(", ")}`);
}
