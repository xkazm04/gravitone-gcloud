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

import { execFile, spawn, type ChildProcess } from "node:child_process";

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

/** Whether this platform needs the shell to resolve `claude` (a `.cmd` shim on
 *  Windows, which Node cannot spawn directly). Exported so the probe drives the
 *  same predicate the spawn does, rather than a copy of it. */
export const USES_SHELL = process.platform === "win32";

/**
 * END THE WHOLE TREE, not the shell in front of it.
 *
 * On Windows the spawn goes through `shell: true`, so `child` is cmd.exe and the
 * real `claude` is its grandchild. `child.kill()` terminates cmd.exe alone —
 * Windows does not cascade a kill down a process tree (next.config.ts learned
 * the same lesson from stranded Turbopack workers) — and the grandchild keeps
 * running, keeps the operator's seat busy, and keeps writing to a pipe nobody
 * reads, for however long the turn would have taken. Measured 2026-09-05 with
 * this exact spawn shape: after `child.kill()` the shell was gone and the
 * grandchild was alive; after `taskkill /T` on the LIVE shell pid, both were
 * gone in under a second. The order matters — once the shell has exited the
 * tree cannot be walked from it any more, so taskkill goes first and the plain
 * signal is the fallback, never the other way round.
 *
 * The registry's agent-cli-transport subject borrows termination-and-reaping
 * from subprocess-lifecycle for exactly this: a timeout that leaves the child
 * running has not enforced anything, it has only stopped listening.
 *
 * Off-shell (POSIX) `child` IS the binary, and the signal reaches it directly.
 */
export function killTree(child: ChildProcess): void {
  if (USES_SHELL && child.pid) {
    execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true }, () => {
      // taskkill could not (the tree was already gone, or this is not the
      // platform the predicate thought). Whatever is still there gets the signal.
      if (child.exitCode === null && !child.killed) child.kill();
    });
    return;
  }
  child.kill();
}

/**
 * ONE VERDICT FOR A NON-ZERO EXIT, shared by the probe and the run.
 *
 * Off-shell, a binary that is not on PATH never produces an exit code at all —
 * the spawn itself fails and `child.on("error")` says `not-installed`. Through
 * a shell it is the SHELL that fails to resolve the name, and the shell says so
 * in its own words on stderr and exits normally. MEASURED 2026-09-05, with this
 * exact spawn shape and a name that resolves to nothing: cmd.exe exits 1 — not
 * the 9009 an interactive prompt shows in %ERRORLEVEL% — with "'x' is not
 * recognized as an internal or external command" on stderr. So the sentence is
 * the signal and the well-known codes (9009, POSIX 127) are kept only as a
 * second door. Until this function existed the run's `close` handler read all
 * of it as an ordinary failure ("The local Claude process exited 1."), so on
 * the only platform this app is developed on a machine without the CLI was
 * classified `failed`, the text provider marked the call as DISPATCHED (a real
 * attempt, not an absence), and the router's descent record named the wrong
 * rung with the wrong remedy — "the engine broke" instead of "install it". The
 * probe had the same blind spot in its own words.
 *
 * `usesShell` is a parameter so the mapping is assertable on either platform;
 * the doors pass the real predicate. Off-shell the shell never spoke, so its
 * sentences and codes are the binary's own and mean nothing special.
 */
const SHELL_NOT_FOUND = /is not recognized as an internal or external command|command not found|: not found\b/i;

export function classifyExit(code: number | null, stderr: string, usesShell: boolean = USES_SHELL): CliError {
  if (usesShell && (SHELL_NOT_FOUND.test(stderr) || code === 9009 || code === 127)) {
    return new CliError("The `claude` CLI is not installed or not on PATH.", "not-installed");
  }
  if (/login|auth|credential/i.test(stderr)) {
    return new CliError("The local Claude CLI is not logged in. Run `claude` once and sign in.", "not-logged-in");
  }
  // The tail of stderr travels WITH the verdict. Until 2026-09-05 this branch
  // said "exited N" and threw the stream away (`void err`), so the one line the
  // engine wrote about why — an unknown model id, a bad flag, a crashed
  // session — reached neither the log line nor the route's answer, and the
  // operator was left to reproduce a minutes-long turn by hand to read it.
  // Whitespace collapsed and capped, because it lands in a log line and a JSON
  // error body, not a terminal.
  const tail = stderr.replace(/\s+/g, " ").trim().slice(-240);
  return new CliError(`The local Claude process exited ${code}.${tail ? ` stderr: ${tail}` : ""}`, "failed");
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
        shell: USES_SHELL,
        env: seatOnlyEnv(),
      });
    } catch {
      return resolve({ ok: false, detail: "The `claude` CLI could not be started on this machine." });
    }

    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      killTree(child);
      resolve({ ok: false, detail: `The \`claude\` CLI did not answer --version within ${Math.round(timeoutMs / 1000)}s.` });
    }, timeoutMs);

    child.stdout?.on("data", (c) => (out += c));
    child.stderr?.on("data", (c) => (err += c));
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ ok: false, detail: "The `claude` CLI is not installed or not on PATH." });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const version = out.trim().split(/\s+/)[0] || undefined;
      if (code !== 0) {
        // Through a shell, "not on PATH" arrives as an exit code — see
        // classifyExit. Say that, not "exited 9009".
        const verdict = classifyExit(code, err);
        return resolve({
          ok: false,
          detail:
            verdict.kind === "not-installed"
              ? verdict.message
              : `The \`claude\` CLI exited ${code} when asked for its version.`,
        });
      }
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

/**
 * The argv handed to the CLI.
 *
 * `--allowed-tools ""` and `--max-turns 1` are load-bearing: this is a pure
 * reasoning call over JSON that is handed to it, and an engine that could read
 * the filesystem or search the web could quietly source a figure the notebook
 * does not contain — which is the one thing RECALIBRATE-PROMPT.md forbids
 * absolutely. Take the tools away rather than asking it not to use them.
 *
 * ── THE EMPTY ARGUMENT IS QUOTED, AND ON WINDOWS IT HAS TO BE (2026-08-27) ──
 *
 * `spawn(..., { shell: true })` CONCATENATES argv into one command line without
 * escaping it, so a zero-length argument leaves no trace at all. Measured, with
 * this exact array against an argv echo:
 *
 *   shell:false -> [… "--allowed-tools", "",          "--max-turns", "1"]
 *   shell:true  -> [… "--allowed-tools", "--max-turns", "1"]          ← both gone
 *
 * On Windows the CLI was therefore receiving `--allowed-tools` with `--max-turns`
 * as its VALUE and a stray positional `1` — so BOTH load-bearing restrictions
 * were silently absent on the only platform this app is developed on. The engine
 * ran unrestricted and multi-turn while the comment above described a sandbox.
 *
 * Passing the two-character literal `""` survives cmd's parsing and arrives as a
 * genuine empty string; off-shell it must stay a real empty string, because
 * there the two characters would be a literal tool name. Hence the branch — and
 * hence the probe, because the failure is invisible from inside this process.
 */
export function cliArgs(usesShell: boolean = USES_SHELL): string[] {
  return [
    "-p",
    "--output-format", "json",
    "--model", MODEL,
    "--effort", "high",
    "--allowed-tools", usesShell ? '""' : "",
    "--max-turns", "1",
  ];
}

/** Run one headless turn and return its text. */
export function runClaude(prompt: string, timeoutMs = 600_000): Promise<CliResult> {
  // Floored, never taken literally: a zero or a garbage value here would kill
  // every turn in milliseconds and route the whole product to its fallback with
  // a probe that still reads green. See floorTimeout.
  const ceiling = floorTimeout(timeoutMs, 600_000);
  return new Promise((resolve, reject) => {
    const child = spawn("claude", cliArgs(), {
      stdio: ["pipe", "pipe", "pipe"],
      shell: USES_SHELL,
      // The seat, never a metered key. See seatOnlyEnv — this is the single
      // door, and it is the only place the strip can be guaranteed.
      env: seatOnlyEnv(),
    });

    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      // The tree, not the shell — see killTree. A timeout that left `claude`
      // running would keep spending the seat after the caller had been told
      // the turn was over.
      killTree(child);
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
      // The verdict is shared with the probe — see classifyExit — so the two
      // doors cannot disagree about what a missing binary looks like.
      if (code !== 0) return reject(classifyExit(code, err));
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
    });

    // THE PROMPT WRITE IS A DOOR OUT OF THIS PROCESS, AND IT HAD NO HANDLER.
    //
    // `child.stdin` is a stream, so its failures arrive as an 'error' EVENT. They
    // do not throw at the call site below, and they do not reach `child.on
    // ("error")` — that one reports the SPAWN, not the pipe. An 'error' event with
    // no listener is re-raised by Node as an uncaughtException, which in a route
    // handler is the SERVER going down, not this promise rejecting.
    //
    // Measured 2026-08-29 on Windows, with this exact shape and a binary that is
    // not on PATH: `shell: true` starts cmd, cmd exits immediately because
    // `claude` does not resolve, and the write lands on a closed pipe —
    // `Error: write EOF`, uncaught, process gone. So on the only platform this app
    // is developed on, a machine without the CLI could never reach the
    // `not-installed` branch above, and lib/text/router.ts could never descend to
    // its metered rung: nothing survived long enough to classify anything.
    //
    // The child is gone by definition when this fires, so the verdict stays with
    // `close`/`error` above, which have the exit code and the stderr to classify
    // from. This listener's whole job is to keep the failure inside the promise.
    child.stdin.on("error", () => {
      // Deliberately silent: the pipe closing IS the child ending, and the
      // handlers above say what that means.
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}
