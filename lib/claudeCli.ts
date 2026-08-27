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

/**
 * THE SINGLE SPAWN DOOR'S ENVIRONMENT — and the one thing it takes away.
 *
 * The child inherits this process's environment, and the tools in this class
 * PREFER a metered API key over the logged-in seat session when both are
 * visible. So an `ANTHROPIC_API_KEY` sitting in the environment for an unrelated
 * reason — a sibling project's .env, a shell profile, a CI secret injected for
 * something else entirely — would silently move every recalibration and every
 * frames run from the operator's flat-rate subscription onto per-token billing.
 * Nothing would break. The bill would just change shape, quietly, and the
 * receipt this app shows the creator would still say `local-claude-code`.
 *
 * The strip therefore lives HERE, at the one door every spawn goes through,
 * rather than at the call sites — the registry's subscription-auth-selection
 * technique is explicit that it belongs at the spawn door "so no call site can
 * forget it", and there are already three call sites (two routes and a pipeline
 * script) with more coming.
 *
 * `CLAUDE_CODE_USE_SEAT=0` is deliberately NOT honoured as an escape hatch. If
 * this app is ever to run on a metered Anthropic key, that is a second provider
 * behind lib/text/router.ts with its own pricing row and its own provenance —
 * not this one wearing a disguise.
 */
const METERED_AUTH_VARS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_CUSTOM_HEADERS",
] as const;

function seatOnlyEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const v of METERED_AUTH_VARS) delete env[v];
  return env;
}

/**
 * The floor under `timeoutMs`.
 *
 * A knob, not an outage, is the subtlest route to a product's bottom rung: a
 * timeout read as "kill instantly" fails every call in milliseconds and routes
 * everything to the fallback — permanently, quietly, with a healthy-looking
 * probe. A nonsensical ceiling is MISCONFIGURATION and is floored, never
 * interpreted as "immediately". Thirty seconds because the fastest real turn
 * this app makes is tens of seconds; anything under it cannot be a considered
 * setting.
 */
export const MIN_TIMEOUT_MS = 30_000;

export function floorTimeout(ms: number | undefined, fallback: number): number {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < MIN_TIMEOUT_MS) return fallback;
  return ms;
}

/**
 * IS THE BINARY THERE, AND IS IT AUTHORISED TO ANSWER — without spending
 * anything.
 *
 * `claude --version` runs the binary and prints a version without starting a
 * session, so it is genuinely zero-token. What it CANNOT prove is authorisation:
 * a machine with the binary installed and nobody logged in answers this happily.
 * The registry's availability-probe technique requires a probe that cannot prove
 * authorisation to say so rather than pretend, which is what `freeToRun: true`
 * plus a `not-installed`-only verdict does here — the login state is discovered
 * on the first real call, where `runClaude` already classifies it from stderr.
 *
 * The alternative — a one-token real turn — would prove authorisation and cost
 * money on every health check, on an engine whose turns are minutes. Not worth
 * it. The honest shape is a cheap probe that names its own ceiling.
 */
export function probeClaude(timeoutMs = 10_000): Promise<{ ok: boolean; version?: string; detail: string }> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn("claude", ["--version"], {
        stdio: ["ignore", "pipe", "pipe"],
        shell: process.platform === "win32",
        env: seatOnlyEnv(),
      });
    } catch {
      return resolve({ ok: false, detail: "The `claude` CLI could not be started on this machine." });
    }

    let out = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, detail: `The \`claude\` CLI did not answer --version within ${Math.round(timeoutMs / 1000)}s.` });
    }, timeoutMs);

    child.stdout?.on("data", (c) => (out += c));
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ ok: false, detail: "The `claude` CLI is not installed or not on PATH." });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const version = out.trim().split(/\s+/)[0] || undefined;
      if (code !== 0)
        return resolve({ ok: false, detail: `The \`claude\` CLI exited ${code} when asked for its version.` });
      resolve({
        ok: true,
        version,
        // The ceiling, stated. This probe proves the binary runs; it does not
        // prove there is a usable credential behind it.
        detail: `claude ${version ?? "(unknown version)"} is installed. Login state is not proven by this probe — it is discovered on the first real turn.`,
      });
    });
  });
}

/** Run one headless turn and return its text.
 *
 *  `--allowed-tools ""` and `--max-turns 1` are load-bearing: this is a pure
 *  reasoning call over JSON that is handed to it, and an engine that could read
 *  the filesystem or search the web could quietly source a figure the notebook
 *  does not contain — which is the one thing RECALIBRATE-PROMPT.md forbids
 *  absolutely. Take the tools away rather than asking it not to use them. */
export function runClaude(prompt: string, timeoutMs = 600_000): Promise<CliResult> {
  // Floored, never taken literally: a zero or a garbage value here would kill
  // every turn in milliseconds and route the whole product to its fallback with
  // a probe that still reads green. See floorTimeout.
  const ceiling = floorTimeout(timeoutMs, 600_000);
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
      {
        stdio: ["pipe", "pipe", "pipe"],
        shell: process.platform === "win32",
        // The seat, never a metered key. See seatOnlyEnv — this is the single
        // door, and it is the only place the strip can be guaranteed.
        env: seatOnlyEnv(),
      },
    );

    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new CliError(`The local Claude process did not finish within ${Math.round(ceiling / 1000)}s.`, "timeout"));
    }, ceiling);

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
