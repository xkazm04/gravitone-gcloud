// THE ENGINE — a local Claude Code process, driven headlessly.
//
// This is the engine the app's own copy has claimed since the first prototype
// ("research runs as a local Claude Code process — minutes, not milliseconds,
// and it can exit non-zero"). It is now literally true for recalibration.
//
// Why the CLI and not the SDK: it authenticates with the machine's logged-in
// Claude subscription, so there is no API key to hold, rotate, or leak — the
// reason the earlier SDK path needed a key at all. The trade is real and stated
// below.
//
// SERVER ONLY. This spawns a process; it cannot and must not be imported from a
// component.

import { spawn } from "node:child_process";

import { MODEL } from "./model";

export interface CliResult {
  text: string;
  sessionId?: string;
  costUsd?: number;
  durationMs?: number;
}

export class CliError extends Error {
  constructor(
    message: string,
    readonly kind: "not-installed" | "not-logged-in" | "failed" | "timeout",
  ) {
    super(message);
  }
}

/** Run one headless turn and return its text.
 *
 *  `--allowed-tools ""` and `--max-turns 1` are load-bearing: this is a pure
 *  reasoning call over JSON that is handed to it, and an engine that could read
 *  the filesystem or search the web could quietly source a figure the notebook
 *  does not contain — which is the one thing RECALIBRATE-PROMPT.md forbids
 *  absolutely. Take the tools away rather than asking it not to use them. */
export function runClaude(prompt: string, timeoutMs = 600_000): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "claude",
      [
        "-p",
        "--output-format", "json",
        "--model", MODEL,
        "--effort", "high",
        "--allowed-tools", "",
        "--max-turns", "1",
      ],
      { stdio: ["pipe", "pipe", "pipe"], shell: process.platform === "win32" },
    );

    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new CliError(`The local Claude process did not finish within ${Math.round(timeoutMs / 1000)}s.`, "timeout"));
    }, timeoutMs);

    child.stdout.on("data", (c) => (out += c));
    child.stderr.on("data", (c) => (err += c));
    child.on("error", () => {
      clearTimeout(timer);
      reject(new CliError("The `claude` CLI is not installed or not on PATH.", "not-installed"));
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const hint = /login|auth|credential/i.test(err)
          ? "not-logged-in"
          : "failed";
        return reject(
          new CliError(
            hint === "not-logged-in"
              ? "The local Claude CLI is not logged in. Run `claude` once and sign in."
              : `The local Claude process exited ${code}.`,
            hint,
          ),
        );
      }
      try {
        const j = JSON.parse(out);
        if (j.is_error || j.subtype !== "success")
          return reject(new CliError(j.result || `The run ended as ${j.subtype}.`, "failed"));
        resolve({
          text: String(j.result ?? ""),
          sessionId: j.session_id,
          costUsd: j.total_cost_usd,
          durationMs: j.duration_ms,
        });
      } catch {
        reject(new CliError("The local Claude process returned output that was not JSON.", "failed"));
      }
      void err;
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}
