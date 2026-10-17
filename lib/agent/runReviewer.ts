// THE REVIEWER'S SPAWN: one reviewer run to completion, the read-only twin of
// runAgent.ts.
//
// Split out of cliSeam.ts (the door, which re-exports this) because it is the
// reviewer's spawner, with its own early-stop watch for an engine that can sit
// idle after a start-up failure. It shares formatAgentLine with runAgent.ts and
// the outcome classification with envelope.ts.

import { spawn } from "node:child_process";

import { oneLine, scrub } from "@/lib/text/log";

import type { AgentResult, ReviewerCall } from "./cliSeam";
import { MIN_TIMEOUT_MIN, assertIsolatedWorkspace } from "./agentArgs";
import { classifyOutcome, earlyUnavailable, killTree, parseEngineEnvelope } from "./envelope";
import { reviewerCommand } from "./reviewerCommand";
import { resolveEngineBin } from "./resolveEngineBin";
import { reviewerEnv } from "./reviewerEnv";
import { REVIEW_WORKSPACE } from "./reviewerEngines";
import { formatAgentLine } from "./runAgent";

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
    let early: string | undefined;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid, () => {
        if (child.exitCode === null) child.kill();
      });
    }, timeoutMs);
    const watch = (c: Buffer) => {
      if (early) return;
      const line = earlyUnavailable(call.engine, c.toString("utf8"));
      if (!line) return;
      early = line;
      killTree(child.pid, () => {
        if (child.exitCode === null) child.kill();
      });
    };

    child.stdout.on("data", (c: Buffer) => {
      out.push(c);
      watch(c);
    });
    child.stderr.on("data", (c: Buffer) => {
      if (err.length < 20_000) err += c.toString("utf8");
      watch(c);
    });
    child.on("error", (e) => {
      spawnError = `the ${call.engine} CLI could not be started: ${e.message}`;
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const parsed = parseEngineEnvelope(call.engine, Buffer.concat(out).toString("utf8"));
      if (spawnError) parsed.errors.unshift(spawnError);
      if (early) parsed.errors = [early];
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
