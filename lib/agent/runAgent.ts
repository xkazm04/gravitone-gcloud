// THE WRITER'S SPAWN: one headless `claude` agent turn, run to completion.
//
// Split out of cliSeam.ts (the door, which re-exports these) because this is the
// function that spawns a writer turn. Its reviewer twin is runReviewer.ts, which
// shares formatAgentLine below. The argv comes from agentArgs.ts and the outcome
// from envelope.ts.

import { spawn } from "node:child_process";

import { seatOnlyEnv } from "@/lib/claudeCli";
import { oneLine, scrub } from "@/lib/text/log";

import type { AgentResult, AgentTurnClass, RunAgentInput } from "./cliSeam";
import { MIN_TIMEOUT_MIN, agentArgs, assertIsolatedWorkspace, resolveAgentBin } from "./agentArgs";
import { classifyOutcome, killTree, parseEnvelope } from "./envelope";

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
