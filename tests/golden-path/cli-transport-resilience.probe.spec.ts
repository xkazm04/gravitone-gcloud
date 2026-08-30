// LANE — THE ENGINE'S ABSENCE IS A VERDICT, NOT A CRASH (dynamic).
//
// lib/claudeCli.ts is the single spawn door for every reasoning call this app
// makes: /api/recalibrate and /api/frames go through it directly, and
// lib/text/router.ts reaches it through lib/text/providers/claudeCli.ts as the
// FIRST rung of its fallback ladder. The ladder's whole promise is that a
// machine without the CLI descends to the metered rung instead of failing.
//
// WHAT WAS WRONG. `runClaude` wrote the prompt to `child.stdin` with no 'error'
// listener on that stream. Stream failures arrive as an EVENT — not as a throw
// at the call site, and not through `child.on("error")`, which reports the spawn
// and not the pipe — and Node re-raises an unhandled 'error' event as an
// uncaughtException. On Windows the spawn goes through `shell: true` (a `.cmd`
// shim Node cannot spawn directly), so a missing binary means cmd starts, exits
// immediately, and the write lands on a closed pipe: `write EOF`, uncaught, the
// server process gone. The carefully-written `not-installed` branch was
// unreachable on the only platform this app is developed on, and the router
// could never descend, because nothing survived to classify anything.
//
// WHAT THIS PROBE DRIVES. The REAL `runClaude`, against a PATH with nothing on
// it, so `claude` cannot resolve on either platform — the same shape a machine
// without the CLI presents. It asserts the promise REJECTS with a CliError and
// that this process is still alive to hear it. Without the stdin listener the
// rejection never arrives: the worker dies first.
import { test, expect } from "@playwright/test";

import { CliError, runClaude } from "@/lib/claudeCli";

/** Run `fn` with nothing on PATH, then put the environment back.
 *
 *  `seatOnlyEnv()` copies `process.env` at spawn time, so emptying it here is
 *  what the child sees. ComSpec is left alone deliberately: Node needs it to
 *  find cmd.exe for the `shell: true` branch, and taking it away would test a
 *  spawn failure rather than the missing-binary case this lane is about. */
async function withEmptyPath<T>(fn: () => Promise<T>): Promise<T> {
  const path = process.env.PATH;
  const Path = process.env.Path;
  try {
    process.env.PATH = "";
    if (Path !== undefined) process.env.Path = "";
    return await fn();
  } finally {
    if (path === undefined) delete process.env.PATH;
    else process.env.PATH = path;
    if (Path === undefined) delete process.env.Path;
    else process.env.Path = Path;
  }
}

test("transport: a missing `claude` REJECTS — it does not take the process down", async () => {
  // A prompt big enough that the write cannot complete in one synchronous
  // chunk, which is the shape a real recalibrate call has: the notebook and
  // three beat chains are far past any argv limit, which is why they go down
  // stdin at all.
  const prompt = "x".repeat(2_000_000);

  const err = await withEmptyPath(async () => {
    // The floor is 30s (MIN_TIMEOUT_MS); nothing here should get near it, but a
    // hang would be its own finding, so the timeout is the real one.
    try {
      await runClaude(prompt);
      return null;
    } catch (e) {
      return e;
    }
  });

  console.log(
    `[cli] missing binary -> ${err instanceof CliError ? `CliError(${err.kind}): ${err.message}` : String(err)}`,
  );
  // The promise settled AND this process is still here to read it. Before the
  // stdin listener existed, the second half is what failed: the worker died with
  // an uncaught `write EOF` and no assertion below ever ran.
  expect(err, "runClaude resolved on a machine with no `claude` — it should refuse").not.toBe(null);
  expect(err instanceof CliError, `expected a CliError, got ${String(err)}`).toBe(true);
  expect((err as CliError).kind).not.toBe("timeout");
});
