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
// the local `claude`, `codex`, `grok` and `agy` CLIs on the operator's own
// logins — see "Reviewers" at the bottom of this file. The writer turns above
// are unchanged and stay claude-only.

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
export type AgentTurnClass = "article-research" | "article-draft" | "article-review" | "article-critique-writer";

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

/** The workspace rule, checked before every spawn. A writer turn's workspace
 *  holds `inputs/` and `out/`; a reviewer's holds REVIEW_WORKSPACE. */
export function assertIsolatedWorkspace(cwd: string, allowed: readonly string[] = ["inputs", "out"]): void {
  const entries = readdirSync(cwd);
  const extra = entries.filter((e) => !allowed.includes(e));
  if (extra.length) throw new Error(`the agent workspace must hold only ${allowed.map((a) => (a.includes(".") ? a : `${a}/`)).join(" and ")}, found: ${extra.join(", ")}`);
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

/** An engine that cannot serve this call at all: no balance (402), a model the
 *  account does not offer, a CLI that is not installed. Measured texts:
 *  grok 1.0.40 on 2026-10-05 answered "API error (status 402 Payment Required):
 *  Grok Build usage balance exhausted"; codex lists the models it supports and
 *  refuses others as "not supported". */
const UNAVAILABLE = /\b402\b|payment required|balance (is )?exhausted|insufficient (credit|balance|funds)|not supported|unsupported model|model[^.;]{0,60}(not found|does not exist|is not available|not available)|cli was not found|could not be started/;
/** A seat or rate limit: the contest runner's pattern, plus HTTP 429. */
const SEAT_LIMIT = /\b429\b|too many requests|usage limit|rate limit|quota|out of (extra )?usage|resource.?exhausted|seat/;

/** A refusal or a seat limit is not a score of zero; it is a run that did not
 *  happen. The contest runner's verdicts and order, with `unavailable` checked
 *  first so that a 402 is never read as a seat limit. */
export function classifyOutcome(parsed: ParsedEnvelope, run: { exit: number | null; timedOut: boolean }): AgentOutcome {
  if (run.timedOut) return "timed-out";
  if (parsed.errors.length) {
    const text = parsed.errors.join(" ").toLowerCase();
    if (UNAVAILABLE.test(text)) return "unavailable";
    if (SEAT_LIMIT.test(text)) return "seat-limit";
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
 *
 * CREDENTIALS. Every reviewer gets `reviewerEnv()`: the writer's metered-key
 * strip, then every variable whose NAME looks like a credential removed. A
 * reviewer reads untrusted pages with a model that can be talked into things;
 * codex's read-only sandbox still runs read-only shell commands, and an
 * environment variable is one `echo` away from a search query. The CLIs
 * authenticate from their own login files, which this does not touch.
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
const agyTier = (effort: string) => (effort === "xhigh" || effort === "max" ? "high" : effort);
/** codex has no `max`; its top reasoning effort is `xhigh`. */
const codexEffort = (effort: string) => (effort === "max" ? "xhigh" : effort);

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

/** A variable NAME that looks like a credential. */
const CREDENTIAL_NAME = /(API_?KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL|PRIVATE_?KEY|AUTH)/i;

/** The reviewer environment: the metered-key strip, then every credential-
 *  looking variable removed, then the engine's own extras. */
export function reviewerEnv(engine: ReviewerEngineName, base: NodeJS.ProcessEnv = seatOnlyEnv()): NodeJS.ProcessEnv {
  const env = { ...base };
  for (const k of Object.keys(env)) if (CREDENTIAL_NAME.test(k)) delete env[k];
  return { ...env, ...reviewerCommand({ engine, model: "m", effort: "high", cwd: ".", prompt: "", timeoutMin: 1 }).env };
}

/** `ARTICLES_<ENGINE>_BIN` overrides one engine's binary (`|`-separated argv);
 *  claude reviewers use the writer's ARTICLES_AGENT_BIN. */
const ENGINE_BIN_VAR = { codex: "ARTICLES_CODEX_BIN", grok: "ARTICLES_GROK_BIN", agy: "ARTICLES_AGY_BIN" } as const;

const splitOverride = (o: string) => o.split("|").map((s) => (s === "node" ? process.execPath : existsSync(path.resolve(s)) ? path.resolve(s) : s));

/** The binary for one engine, as an argv prefix, spawned WITHOUT a shell. An
 *  npm `.cmd` shim cannot be spawned without one, so codex runs as
 *  `node <package>/bin/codex.js` (the contest runner's resolver). */
export function resolveEngineBin(engine: ReviewerEngineName, env: Record<string, string | undefined> = process.env): string[] {
  if (engine === "claude") return resolveAgentBin(env);
  const variable = ENGINE_BIN_VAR[engine];
  const override = env[variable]?.trim();
  if (override) return splitOverride(override);

  const win = process.platform === "win32";
  const exts = win ? [".exe", ".cmd", ""] : [""];
  const dirs = (env.PATH ?? env.Path ?? "").split(path.delimiter).filter(Boolean);
  const home = os.homedir();
  const local = env.LOCALAPPDATA ?? path.join(home, "AppData", "Local");
  const fallbacks: Record<typeof engine, string[]> = {
    codex: [],
    grok: [path.join(home, ".grok", "bin", win ? "grok.exe" : "grok")],
    agy: [path.join(local, "agy", "bin", "agy.exe"), path.join(home, ".local", "bin", "agy")],
  };
  const candidates: string[] = [];
  for (const d of dirs) for (const e of exts) candidates.push(path.join(d, `${engine}${e}`));
  candidates.push(...fallbacks[engine]);
  for (const c of candidates) {
    if (!existsSync(c)) continue;
    if (win && (/\.cmd$/i.test(c) || !path.extname(c))) {
      const script = engine === "codex" ? path.join(path.dirname(c), "node_modules", "@openai", "codex", "bin", "codex.js") : "";
      if (script && existsSync(script)) return [process.execPath, script];
      continue;
    }
    return [c];
  }
  throw new Error(`The \`${engine}\` CLI was not found on PATH (set ${variable} to point at it).`);
}

/* ── envelopes ─────────────────────────────────────────────────────────────── */

/** codex `exec --json`: one event per line. The final message is the last
 *  `agent_message`; an `error` or `turn.failed` event is an error (codex's own
 *  "Reconnecting…" notices are not). No cost is reported. */
export function parseCodexEvents(stdout: string): ParsedEnvelope {
  let final = "";
  let turns = 0;
  const errors: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    let v: Record<string, unknown>;
    try {
      v = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (v.type === "item.completed") {
      const it = (v.item ?? {}) as Record<string, unknown>;
      if (it.type === "agent_message" && typeof it.text === "string") final = it.text;
    } else if (v.type === "turn.completed") turns += 1;
    else if (v.type === "error" || v.type === "turn.failed") {
      const msg = v.message ?? (v.error as Record<string, unknown> | undefined)?.message;
      if (msg && !String(msg).startsWith("Reconnecting")) errors.push(String(msg).slice(0, 300));
    }
  }
  if (!final && !errors.length && !turns) errors.push("no codex events on stdout");
  return { final, errors, turns };
}

/** agy: `{status, response, error, num_turns, denied_actions}`. A SUCCESS with
 *  an empty response and denied actions is a run that could not use its tools
 *  (probed: read_url denied without --dangerously-skip-permissions). */
export function parseAgyEnvelope(stdout: string): ParsedEnvelope {
  const v = lastJsonObject(stdout);
  if (!v) return { final: "", errors: ["no JSON envelope on stdout"], turns: 0 };
  const errors: string[] = [];
  if (v.status && v.status !== "SUCCESS") errors.push(`${String(v.status)}: ${String(v.error ?? v.response ?? "").slice(0, 300)}`);
  const final = String(v.response ?? "");
  const denied = Array.isArray(v.denied_actions) ? (v.denied_actions as { action?: unknown }[]).map((d) => String(d?.action ?? "?")) : [];
  if (!errors.length && !final.trim() && denied.length) errors.push(`denied: ${denied.join(", ")} (headless mode could not prompt for it)`);
  return { final, errors, turns: typeof v.num_turns === "number" ? v.num_turns : 0 };
}

/** grok: success `{text, stopReason, num_turns, total_cost_usd}` (the contest
 *  runner's reading — not observed here, the account is at 402); failure
 *  `{type:"error", message, http_status}` (observed). */
export function parseGrokEnvelope(stdout: string): ParsedEnvelope {
  const v = lastJsonObject(stdout);
  if (!v) return { final: "", errors: ["no JSON envelope on stdout"], turns: 0 };
  if (v.type === "error") {
    const status = typeof v.http_status === "number" ? ` (http ${v.http_status})` : "";
    return { final: "", errors: [`${String(v.message ?? "error").slice(0, 300)}${status}`], turns: 0 };
  }
  const stop = v.stopReason ?? v.stop_reason ?? "unknown";
  const final = String(v.text ?? v.result ?? "");
  const out: ParsedEnvelope = { final, errors: stop === "end_turn" ? [] : [`${String(stop)}: ${final.slice(0, 300)}`], turns: typeof v.num_turns === "number" ? v.num_turns : 0 };
  if (typeof v.total_cost_usd === "number") out.costUsd = v.total_cost_usd;
  return out;
}

export function parseEngineEnvelope(engine: ReviewerEngineName, stdout: string): ParsedEnvelope {
  if (engine === "codex") return parseCodexEvents(stdout);
  if (engine === "agy") return parseAgyEnvelope(stdout);
  if (engine === "grok") return parseGrokEnvelope(stdout);
  return parseEnvelope(stdout);
}

/**
 * Run one reviewer to completion. Like runAgent, it never throws for an
 * outcome — a missing CLI is `unavailable`, a 402 is `unavailable`, a usage
 * limit is `seat-limit` — and throws only for a caller error (a workspace that
 * holds anything but REVIEW_WORKSPACE).
 */
export function runReviewer(call: ReviewerCall): Promise<AgentResult> {
  assertIsolatedWorkspace(call.cwd, REVIEW_WORKSPACE);
  const cmd = reviewerCommand(call);
  const timeoutMs = Math.round(Math.max(MIN_TIMEOUT_MIN, Number.isFinite(call.timeoutMin) ? call.timeoutMin : MIN_TIMEOUT_MIN) * 60_000);
  const started = Date.now();
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

    const child = spawn(bin[0], [...bin.slice(1), ...cmd.argv], {
      cwd: call.cwd,
      env: reviewerEnv(call.engine),
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
      spawnError = `the ${call.engine} CLI could not be started: ${e.message}`;
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const parsed = parseEngineEnvelope(call.engine, Buffer.concat(out).toString("utf8"));
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
        errors: (timedOut ? [`did not finish within ${call.timeoutMin} min`] : parsed.errors).map((e) => oneLine(scrub(e), 400)),
      };
      if (parsed.costUsd !== undefined) r.costUsd = parsed.costUsd;
      const line = formatAgentLine("article-review", r, label, call.prompt.length);
      if (outcome === "completed") console.log(line);
      else console.error(line);
      resolve(r);
    });

    child.stdin.on("error", () => {
      // deliberately silent — see runAgent
    });
    child.stdin.end(cmd.stdin);
  });
}
