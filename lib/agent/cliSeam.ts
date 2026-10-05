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
// errored | seat-limit`. A seat limit is not a failure of the work; it is a run
// that did not happen, and the caller may say so differently.

import { execFile, spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { seatOnlyEnv } from "@/lib/claudeCli";
import { oneLine, scrub } from "@/lib/text/log";

/** The closed vocabulary of agent call sites, keyed the same way as
 *  lib/text/types.ts's TurnClass and declared in .ai/use-cases.json as
 *  `text.<class>`. A separate union, not new TurnClass members: TurnClass keys
 *  the reasoning router's plan table, and these turns can never route there. */
export type AgentTurnClass = "article-research" | "article-draft";

export const AGENT_TOOLS = ["WebSearch", "WebFetch", "Read", "Write", "Edit"] as const;
export type AgentTool = (typeof AGENT_TOOLS)[number];

export type AgentOutcome = "completed" | "timed-out" | "errored" | "seat-limit";

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

/** The floor under `timeoutMin` — three seconds, so a zero or a negative is
 *  never read as "kill at once" (lib/claudeCli.ts floorTimeout's reasoning),
 *  while a probe can still watch a timeout fire without waiting a minute. */
const MIN_TIMEOUT_MIN = 0.05;

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

/** The workspace rule, checked before every spawn. */
export function assertIsolatedWorkspace(cwd: string): void {
  const entries = readdirSync(cwd);
  const extra = entries.filter((e) => e !== "inputs" && e !== "out");
  if (extra.length) throw new Error(`the agent workspace must hold only inputs/ and out/, found: ${extra.join(", ")}`);
}

/** The last JSON object on stdout (a banner line before it is tolerated). */
function lastJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  try {
    return JSON.parse(text.slice(start));
  } catch {
    // fall through to the backwards scan
  }
  for (let i = text.lastIndexOf("{"); i >= 0; i = text.lastIndexOf("{", i - 1)) {
    try {
      return JSON.parse(text.slice(i));
    } catch {
      // keep looking
    }
  }
  return null;
}

export interface ParsedEnvelope {
  final: string;
  errors: string[];
  turns: number;
  costUsd?: number;
}

export function parseEnvelope(stdout: string): ParsedEnvelope {
  const v = lastJsonObject(stdout);
  if (!v) return { final: "", errors: ["no JSON envelope on stdout"], turns: 0 };
  const errors: string[] = [];
  if (v.is_error || (v.subtype && v.subtype !== "success")) errors.push(`${String(v.subtype ?? "error")}: ${String(v.result ?? "").slice(0, 300)}`);
  return {
    final: String(v.result ?? ""),
    errors,
    turns: typeof v.num_turns === "number" ? v.num_turns : 0,
    costUsd: typeof v.total_cost_usd === "number" ? v.total_cost_usd : undefined,
  };
}

/** A refusal or a seat limit is not a score of zero; it is a run that did not
 *  happen. Same verdicts, same order, as the contest runner. */
export function classifyOutcome(parsed: ParsedEnvelope, run: { exit: number | null; timedOut: boolean }): AgentOutcome {
  if (run.timedOut) return "timed-out";
  if (parsed.errors.length) {
    const text = parsed.errors.join(" ").toLowerCase();
    if (/usage limit|rate limit|quota|out of (extra )?usage|seat/.test(text)) return "seat-limit";
    return "errored";
  }
  if (run.exit !== 0) return "errored";
  return "completed";
}

/** End the whole tree: a timed-out agent that keeps running keeps spending. */
function killTree(pid: number | undefined, kill: () => void): void {
  if (process.platform === "win32" && pid) {
    execFile("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true }, () => kill());
    return;
  }
  kill();
}

export function formatAgentLine(turn: AgentTurnClass, r: AgentResult, model: string, promptChars: number): string {
  const f = [
    "[agent]",
    turn,
    r.outcome,
    `model=${model}`,
    `ms=${r.durationMs}`,
    `turns=${r.turns}`,
    `in=${promptChars}c`,
    `cost=${r.costUsd === undefined ? "unpriced" : `$${r.costUsd.toFixed(4)}`}`,
  ];
  if (r.errors.length) f.push(`msg="${oneLine(scrub(r.errors.join("; ")))}"`);
  return f.join(" ");
}

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
  const started = Date.now();

  return new Promise((resolve) => {
    let bin: string[];
    try {
      bin = resolveAgentBin();
    } catch (e) {
      const r: AgentResult = { outcome: "errored", final: "", turns: 0, durationMs: 0, exitCode: null, errors: [(e as Error).message] };
      console.error(formatAgentLine(input.turn, r, input.model, input.prompt.length));
      return resolve(r);
    }

    const child = spawn(bin[0], [...bin.slice(1), ...args], {
      cwd: input.cwd,
      env: seatOnlyEnv(),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    const out: Buffer[] = [];
    let err = "";
    let timedOut = false;
    let spawnError: string | undefined;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid, () => {
        if (child.exitCode === null) child.kill();
      });
    }, timeoutMs);

    child.stdout.on("data", (c: Buffer) => out.push(c));
    child.stderr.on("data", (c: Buffer) => {
      if (err.length < 20_000) err += c.toString("utf8");
    });
    child.on("error", (e) => {
      spawnError = `the agent could not be started: ${e.message}`;
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const parsed = parseEnvelope(Buffer.concat(out).toString("utf8"));
      if (spawnError) parsed.errors.unshift(spawnError);
      if (code !== 0 && !parsed.errors.length && !timedOut) {
        const tail = err.replace(/\s+/g, " ").trim().slice(-240);
        parsed.errors.push(`exited ${code}${tail ? `: ${tail}` : ""}`);
      }
      const outcome = classifyOutcome(parsed, { exit: spawnError ? null : code, timedOut });
      const r: AgentResult = {
        outcome,
        final: parsed.final,
        turns: parsed.turns,
        durationMs: Date.now() - started,
        exitCode: code,
        errors: (timedOut ? [`did not finish within ${input.timeoutMin} min`] : parsed.errors).map((e) => oneLine(scrub(e), 400)),
      };
      if (parsed.costUsd !== undefined) r.costUsd = parsed.costUsd;
      const line = formatAgentLine(input.turn, r, input.model, input.prompt.length);
      if (outcome === "completed") console.log(line);
      else console.error(line);
      resolve(r);
    });

    // A closed pipe arrives as an 'error' event on stdin; unhandled, Node
    // re-raises it as an uncaughtException (lib/claudeCli.ts measured this on
    // 2026-08-29). The close handler above carries the verdict.
    child.stdin.on("error", () => {
      // deliberately silent — see above
    });
    child.stdin.end(input.prompt);
  });
}
