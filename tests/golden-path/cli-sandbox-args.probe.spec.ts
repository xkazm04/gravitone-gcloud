// LANE — THE ENGINE'S SANDBOX IS ACTUALLY APPLIED (dynamic).
//
// lib/claudeCli.ts calls `--allowed-tools ""` and `--max-turns 1` load-bearing:
// the recalibration engine is a pure reasoning call over a notebook handed to it,
// and an engine that could read the filesystem or search the web could source a
// figure the notebook does not contain — the one thing RECALIBRATE-PROMPT.md
// forbids absolutely.
//
// It was not applied on Windows. `spawn(..., { shell: true })` — which this app
// needs there, because `claude` is a `.cmd` shim Node cannot spawn directly —
// concatenates argv into a command line WITHOUT escaping, and a zero-length
// argument leaves no trace. `--allowed-tools` then took `--max-turns` as its
// value and `1` became a stray positional, so both restrictions were absent on
// the only platform this app is developed on, while the source comment described
// a sandbox.
//
// Nothing could see that from inside the app: `cliArgs()` returned a correct
// array and the loss happened in the shell, after the array stopped existing. So
// this probe asserts in two places, and the second is the one that matters:
//
//   1. the array itself carries a tool restriction and a turn cap;
//   2. those two survive an ACTUAL `spawn` through the ACTUAL shell setting,
//      measured against an argv echo rather than reasoned about.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { cliArgs, USES_SHELL } from "@/lib/claudeCli";

/** A stand-in for the `claude` binary that reports exactly what argv it received. */
function argvEcho(): string {
  const dir = mkdtempSync(join(tmpdir(), "gravitone-argv-"));
  const file = join(dir, "echo.mjs");
  writeFileSync(file, 'console.log("ARGV=" + JSON.stringify(process.argv.slice(2)));\n');
  return file;
}

/** Spawn the echo with `args`, through `shell`, and return the argv it saw. */
function received(args: string[], shell: boolean): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [argvEcho(), ...args], {
      stdio: ["pipe", "pipe", "pipe"],
      shell,
    });
    let out = "";
    child.stdout.on("data", (c) => (out += c));
    child.stderr.on("data", (c) => (out += c));
    child.on("error", reject);
    child.on("close", () => {
      const m = /ARGV=(\[.*\])/.exec(out);
      if (!m) return reject(new Error(`echo produced no ARGV line: ${out.slice(0, 300)}`));
      resolve(JSON.parse(m[1]!) as string[]);
    });
    child.stdin.end();
  });
}

/** The value the CLI ends up seeing for a flag, or `undefined` if the flag is absent. */
const valueOf = (argv: string[], flag: string): string | undefined => {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
};

test("engine args: the array declares a tool restriction and a single turn", () => {
  const args = cliArgs(false);
  expect(valueOf(args, "--allowed-tools")).toBe("");
  expect(valueOf(args, "--max-turns")).toBe("1");
});

test("engine args: BOTH restrictions survive the real spawn, on this platform's shell setting", async () => {
  const argv = await received(cliArgs(), USES_SHELL);
  console.log(`[cli] shell=${USES_SHELL} argv=${JSON.stringify(argv)}`);

  // The turn cap is the assertion that fails loudest against the defect: under
  // the old code `--max-turns` was consumed AS the value of `--allowed-tools`,
  // so it was not a flag at all and this returns undefined.
  expect(valueOf(argv, "--max-turns"), "--max-turns did not survive as a flag").toBe("1");

  // And the tool restriction must be an EMPTY allow-list, not the next flag.
  expect(valueOf(argv, "--allowed-tools"), "--allowed-tools swallowed the next flag").toBe("");
});

test("engine args: a bare empty string is lost by the shell — the reason the branch exists", async () => {
  // Pins the platform behaviour the fix is built on, so a future reader does not
  // have to take the comment's word for it, and so a maintainer who "simplifies"
  // the branch away sees this go red rather than the sandbox go quiet.
  test.skip(!USES_SHELL, "the loss is a cmd.exe concatenation behaviour");
  const naive = ["--allowed-tools", "", "--max-turns", "1"];
  const argv = await received(naive, true);
  console.log(`[cli] naive-through-shell argv=${JSON.stringify(argv)}`);
  expect(valueOf(argv, "--allowed-tools")).toBe("--max-turns");
});
