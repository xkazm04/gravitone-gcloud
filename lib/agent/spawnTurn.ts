// THE SHARED LIFECYCLE of a spawned agent turn: spawn, time out, buffer, close,
// classify, log. runAgent.ts (the writer) and runReviewer.ts (the reviewer)
// differ only in the parameters below.

import { spawn } from "node:child_process";

import { oneLine, scrub } from "@/lib/text/log";

import type { AgentResult, AgentTurnClass } from "./cliSeam";
import { classifyOutcome, killTree, type parseEnvelope } from "./envelope";

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

export interface SpawnTurnSpec {
  /** Resolved executable plus its leading args; the turn's argv is appended. */
  bin: string[];
  argv: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdin: string;
  timeoutMs: number;
  timeoutMin: number;
  turn: AgentTurnClass;
  /** The model label written to the log line. */
  label: string;
  promptChars: number;
  /** Message for a spawn 'error' event, given the event's message. */
  spawnErrorMessage: (message: string) => string;
  parse: (stdout: string) => ReturnType<typeof parseEnvelope>;
  /** Inspect a stdout/stderr chunk; a returned line stops the child early and replaces its errors. */
  earlyStop?: (chunk: string) => string | undefined;
}

/** Spawn one turn and collect it. Resolves with an AgentResult; never rejects. */
export function spawnTurn(spec: SpawnTurnSpec): Promise<AgentResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(spec.bin[0], [...spec.bin.slice(1), ...spec.argv], {
      cwd: spec.cwd,
      env: spec.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    const out: Buffer[] = [];
    let err = "";
    let timedOut = false;
    let spawnError: string | undefined;
    let early: string | undefined;
    const kill = () =>
      killTree(child.pid, () => {
        if (child.exitCode === null) child.kill();
      });
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, spec.timeoutMs);
    const watch = (c: Buffer) => {
      if (!spec.earlyStop || early) return;
      const line = spec.earlyStop(c.toString("utf8"));
      if (!line) return;
      early = line;
      kill();
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
      spawnError = spec.spawnErrorMessage(e.message);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const parsed = spec.parse(Buffer.concat(out).toString("utf8"));
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
        errors: (timedOut ? [`did not finish within ${spec.timeoutMin} min`] : parsed.errors).map((e) => oneLine(scrub(e), 400)),
      };
      if (parsed.costUsd !== undefined) r.costUsd = parsed.costUsd;
      const line = formatAgentLine(spec.turn, r, spec.label, spec.promptChars);
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
    child.stdin.end(spec.stdin);
  });
}
