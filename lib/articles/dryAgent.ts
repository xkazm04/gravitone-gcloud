// THE DRY STAND-IN FOR AN AGENT TURN - what a dry article job's turns are answered by.
// Server only.
//
// v1's dry run was an environment trick: point ARTICLES_AGENT_BIN (and the CODEX and AGY
// bins) at tests/fixtures/articles/stub-agent.mjs and every turn the seam spawned was the
// stub. It worked, and it was a property of the PROCESS: leave one variable out and that
// engine was the real CLI on the operator's seat (the /article-run skill had to say so in
// bold). Phase 4 decision 4 makes dry a property of the JOB: a dry article job declares
// every turn as a paid call (packages/producers/src/article/define.ts), the kernel's dry
// port answers it with this stand-in, and the live seam is never entered - whatever the
// process environment says. A dry job and a live job can share a process (seat.text has
// four slots), which is exactly what an env switch could not allow.
//
// The stand-in is ./dryStandIn.mjs - product code: the stub's ordinary answers without
// its test knobs - spawned here with the argv the seam would build (`agentArgs`,
// `reviewerCommand`) and parsed with the seam's own envelope readers, so a dry run still
// exercises the argv fence, the isolated workspace and the envelope parse. A product mode
// no longer rests on a file under tests/. ARTICLES_DRY_AGENT_BIN (`|`-separated argv, as
// the other overrides) replaces it - the probes point it at the fixture for its knobs.
// It never resolves the real CLIs.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { agentArgs, assertIsolatedWorkspace, MIN_TIMEOUT_MIN } from "@/lib/agent/agentArgs";
import type { AgentResult, ReviewerCall, RunAgentInput } from "@/lib/agent/cliSeam";
import { classifyOutcome, killTree, parseEngineEnvelope, parseEnvelope, type ParsedEnvelope } from "@/lib/agent/envelope";
import { reviewerCommand } from "@/lib/agent/reviewerCommand";
import { reviewerEnv } from "@/lib/agent/reviewerEnv";
import { REVIEW_WORKSPACE } from "@/lib/agent/reviewerEngines";
import { seatOnlyEnv } from "@/lib/claudeCli";

/** The stand-in's argv prefix. Never a real CLI: the default is lib/articles/dryStandIn.mjs. */
export function dryAgentBin(env: Record<string, string | undefined> = process.env, root: string = process.cwd()): string[] {
  const o = env["ARTICLES_DRY_AGENT_BIN"]?.trim();
  if (!o) return [process.execPath, path.join(root, "lib", "articles", "dryStandIn.mjs")];
  return o.split("|").map((s) => (s === "node" ? process.execPath : existsSync(path.resolve(s)) ? path.resolve(s) : s));
}

type Spawned = { argv: string[]; stdin: string; cwd: string; env: NodeJS.ProcessEnv; timeoutMin: number; parse: (stdout: string) => ParsedEnvelope };

function standIn(s: Spawned): Promise<AgentResult> {
  const bin = dryAgentBin();
  const started = Date.now();
  const timeoutMs = Math.round(Math.max(MIN_TIMEOUT_MIN, s.timeoutMin) * 60_000);
  return new Promise((resolve) => {
    const [cmd = process.execPath, ...pre] = bin;
    const child = spawn(cmd, [...pre, ...s.argv], { cwd: s.cwd, env: s.env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
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
      spawnError = `the dry stand-in could not be started: ${e.message}`;
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const parsed = s.parse(Buffer.concat(out).toString("utf8"));
      if (spawnError) parsed.errors.unshift(spawnError);
      if (code !== 0 && !parsed.errors.length && !timedOut) parsed.errors.push(`exited ${code}: ${err.replace(/\s+/g, " ").trim().slice(-240)}`);
      const r: AgentResult = {
        outcome: classifyOutcome(parsed, { exit: spawnError ? null : code, timedOut }),
        final: parsed.final,
        turns: parsed.turns,
        durationMs: Date.now() - started,
        exitCode: code,
        errors: timedOut ? [`did not finish within ${s.timeoutMin} min`] : parsed.errors,
      };
      if (parsed.costUsd !== undefined) r.costUsd = parsed.costUsd;
      resolve(r);
    });
    // A closed pipe arrives as an 'error' on stdin (lib/agent/runAgent.ts); the close handler carries the verdict.
    child.stdin.on("error", () => undefined);
    child.stdin.end(s.stdin);
  });
}

/** A writer turn, answered by the stand-in with the seam's argv. */
export function dryRunAgent(input: RunAgentInput): Promise<AgentResult> {
  assertIsolatedWorkspace(input.cwd);
  return standIn({ argv: agentArgs(input), stdin: input.prompt, cwd: input.cwd, env: seatOnlyEnv(), timeoutMin: input.timeoutMin, parse: parseEnvelope });
}

/** A reviewer turn, answered by the stand-in in the engine's envelope. */
export function dryRunReviewer(call: ReviewerCall): Promise<AgentResult> {
  assertIsolatedWorkspace(call.cwd, REVIEW_WORKSPACE);
  const cmd = reviewerCommand(call);
  const as = call.engine === "claude" ? [] : [`--as=${call.engine}`];
  return standIn({ argv: [...as, ...cmd.argv], stdin: cmd.stdin, cwd: call.cwd, env: { ...reviewerEnv(call.engine), ...cmd.env }, timeoutMin: call.timeoutMin, parse: (o) => parseEngineEnvelope(call.engine, o) });
}
