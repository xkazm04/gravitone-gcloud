// LANE — WHAT A NON-ZERO EXIT MEANS, on both platforms (static + pure).
//
// Registry: llm-agent / agent-cli-transport — availability-probe ("a probe that
// cannot prove something says so; it never pretends") and output-normalization.
//
// Off-shell a missing binary is a spawn failure and never has an exit code.
// Through a shell — the Windows path, `shell: true` for the `.cmd` shim — the
// SHELL fails to resolve the name, says so on stderr, and exits normally.
// MEASURED 2026-09-05 with the engine's exact spawn shape: cmd.exe exits 1 (not
// the 9009 an interactive prompt reports) with "'x' is not recognized as an
// internal or external command". lib/claudeCli.ts read that as an ordinary
// `failed`, so on the only platform this app is developed on a machine without
// the CLI was reported as "The local Claude process exited 1.", the text
// provider marked the call DISPATCHED, and the router's descent record named
// the wrong rung with the wrong remedy. The verdict now lives in one function
// both doors call, and the shell's sentence is the primary signal.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect } from "@playwright/test";

import { classifyExit } from "@/lib/claudeCli";

const CMD_NOT_FOUND = "'claude' is not recognized as an internal or external command,\r\noperable program or batch file.\r\n";

test("exit: the shell's not-found SENTENCE is `not-installed` — as cmd.exe actually exits (code 1)", () => {
  // The measured shape, verbatim: exit 1, the sentence on stderr.
  const cmd = classifyExit(1, CMD_NOT_FOUND, true);
  const sh = classifyExit(127, "sh: 1: claude: not found\n", true);
  const bash = classifyExit(127, "bash: claude: command not found\n", true);
  console.log(`[cli] cmd(1)/shell -> ${cmd.kind}; sh(127)/shell -> ${sh.kind}; bash -> ${bash.kind}`);
  expect(cmd.kind).toBe("not-installed");
  expect(sh.kind).toBe("not-installed");
  expect(bash.kind).toBe("not-installed");
  expect(cmd.message).toMatch(/not installed|not on PATH/);
});

test("exit: the well-known codes still count on their own — 9009 and 127 with a silent shell", () => {
  expect(classifyExit(9009, "", true).kind).toBe("not-installed");
  expect(classifyExit(127, "", true).kind).toBe("not-installed");
});

test("exit: off-shell those numbers are the binary's own and mean nothing special", () => {
  // A spawn that went straight to the binary never sees the shell's codes or
  // sentences for a missing name; a 127 here is whatever the program meant by
  // it, and the sentence can only be the program quoting a shell.
  expect(classifyExit(9009, "", false).kind).toBe("failed");
  expect(classifyExit(127, "", false).kind).toBe("failed");
  expect(classifyExit(1, CMD_NOT_FOUND, false).kind).toBe("failed");
});

test("exit: a login complaint on stderr is `not-logged-in`, anything else is `failed`", () => {
  expect(classifyExit(1, "Not logged in. Please run /login.", true).kind).toBe("not-logged-in");
  expect(classifyExit(1, "Invalid credentials", false).kind).toBe("not-logged-in");
  expect(classifyExit(1, "Error: model does-not-exist is unknown", true).kind).toBe("failed");
  expect(classifyExit(null, "", true).kind).toBe("failed");
});

test("exit: the missing-binary verdict is decided BEFORE stderr is read", () => {
  // cmd's not-found text could one day contain a word the login regex matches;
  // the code decides first, so the remedy cannot flip to "sign in".
  expect(classifyExit(9009, "authorization: 'claude' is not recognized", true).kind).toBe("not-installed");
});

test("doors: the probe and the run both classify through the one function", () => {
  // Source, comments stripped, so a paragraph ABOUT the verdict does not count
  // as the verdict. Two doors, two call sites — the probe's `close` and the
  // run's `close`. A third door added later without it shows up as a count of 2
  // where the file's own header promises the verdict is shared.
  const src = readFileSync(resolve(__dirname, "../../lib/claudeCli.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const calls = src.match(/\bclassifyExit\(code, err\)/g) ?? [];
  console.log(`[cli] classifyExit call sites: ${calls.length}`);
  expect(calls.length).toBe(2);
  // And the old inline verdict is gone from the run.
  expect(src).not.toMatch(/const hint = \/login\|auth\|credential\/i\.test\(err\)/);
});
