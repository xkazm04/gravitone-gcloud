// THE SPAWN-AND-BOUND PIECE of the gate runner, kept out of run-gates.mts so a test can import it
// without running the runner (that file executes on import). Not a gate: the name avoids
// LIVENESS_PATTERNS (`check-*`, `*-regression.mts`) on purpose.

import { spawn } from "node:child_process";

import { killTree } from "../lib/agent/envelope.ts";

// ONE TIME LIMIT PER GATE RUN. Measured basis: the slowest gate with a recorded duration is the full unit
// lane, 186 s to 215 s (vitest.config.mts, two runs at 10 workers on this Windows box); `build` and the
// Playwright `probes` lane have no recorded duration. 1800 s is 8x the 215 s, so a loaded machine is
// not killed; it is a limit on a hang, not a budget.
export const GATE_TIMEOUT_MS = 1_800_000;
/** A child that does not close this long after the tree kill no longer holds the runner. */
export const KILL_GRACE_MS = 5_000;

/** GRAVITONE_GATE_TIMEOUT_S overrides the limit (a test sets a short one); anything not positive is ignored. */
export function gateTimeoutMs(env: Record<string, string | undefined> = process.env): number {
  const s = Number(env.GRAVITONE_GATE_TIMEOUT_S);
  return Number.isFinite(s) && s > 0 ? Math.round(s * 1000) : GATE_TIMEOUT_MS;
}

export type BoundOpts = {
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  buffered: boolean;
  onData: (d: Buffer) => void;
  timeoutMs?: number;
  graceMs?: number;
  /** Called exactly once. `note` set means the gate could not run (spawn error or timeout). */
  settle: (code: number | null, signal: string | null, note?: string) => void;
};

export function spawnBounded(o: BoundOpts): void {
  const limit = o.timeoutMs ?? gateTimeoutMs();
  const grace = o.graceMs ?? KILL_GRACE_MS;
  // One command string with shell:true - `npm` is npm.cmd on Windows.
  const child = spawn(o.command, {
    cwd: o.cwd,
    env: o.env,
    shell: true,
    stdio: o.buffered ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  child.stdout?.on("data", o.onData);
  child.stderr?.on("data", o.onData);
  let done = false;
  let note: string | undefined;
  let graceTimer: NodeJS.Timeout | undefined;
  const finish = (code: number | null, signal: string | null, note?: string) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    clearTimeout(graceTimer);
    o.settle(code, signal, note);
  };
  const timer = setTimeout(() => {
    note = `timed out after ${+(limit / 1000).toFixed(1)} s`;
    killTree(child.pid, () => {
      if (child.exitCode === null) child.kill();
    });
    // A child that will not close must not hold the runner; the timer is unref'd so it cannot hold the process either.
    graceTimer = setTimeout(() => finish(null, null, note), grace);
    graceTimer.unref();
  }, limit);
  child.on("error", (e) => finish(null, null, `could not start: ${e.message}`));
  // After a timeout the close is the kill landing: the row keeps the note, so it is could-not-run, never fail.
  child.on("close", (code, signal) => (note ? finish(null, null, note) : finish(code, signal)));
}
