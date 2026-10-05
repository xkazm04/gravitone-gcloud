// LANE — THE RETRIEVAL RUNG'S FENCE IS ACTUALLY APPLIED (research-run-engine-B, case 1).
//
// The reasoning door (lib/claudeCli.ts) takes every tool away. The retrieval
// rung (lib/text/providers/claudeCliRetrieve.ts) hands back exactly two —
// WebSearch and WebFetch — and nothing that reads, writes or runs anything on
// this machine. A fetched page is untrusted text, and a model reading it can be
// talked into things; the allow-list is what decides what "things" can mean.
//
// The same two places cli-sandbox-args asserts, for the same reason: the array
// can be right and the shell can still eat it (lib/claudeCli.ts:256-273 records
// the Windows command line that silently dropped `--allowed-tools ""`). So:
//
//   1. the array itself, in BOTH forms (shell and non-shell), carries the
//      allow-list, a numeric turn cap and the stream format — and no workspace
//      tool anywhere in it;
//   2. the allow-list survives the retrieval door's OWN spawn, on this
//      platform's shell setting, measured by the stand-in engine that received
//      it (tests/_engine/fake-claude.mjs via withFakeEngine).
import { test, expect } from "@playwright/test";

import { USES_SHELL } from "@/lib/claudeCli";
import { RETRIEVE_TOOLS, retrieveArgs, runClaudeRetrieve } from "@/lib/text/providers/claudeCliRetrieve";

import { FAKE_ENGINE_ENV, keepEnv, loadCassette, withFakeEngine } from "./_helpers";

keepEnv(FAKE_ENGINE_ENV);

/** The value the CLI ends up seeing for a flag, or `undefined` if it is absent. */
const valueOf = (argv: readonly string[], flag: string): string | undefined => {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
};

/** The tools that would let a fetched page reach this machine. Matched as
 *  whole tool names inside every comma-joined argv element, case-insensitive,
 *  so `Bash(git:*)` and `bash` are caught as surely as `Bash`. */
const WORKSPACE_TOOLS = ["bash", "read", "edit", "write", "powershell", "notebookedit", "multiedit", "task", "agent"];

function workspaceToolsIn(argv: readonly string[]): string[] {
  const hits: string[] = [];
  for (const a of argv) {
    if (a.startsWith("--")) continue; // a flag name, not a tool list
    for (const part of a.replace(/"/g, "").split(/[,\s]+/)) {
      const name = part.replace(/\(.*$/, "").trim().toLowerCase();
      if (WORKSPACE_TOOLS.includes(name)) hits.push(part);
    }
  }
  return hits;
}

for (const shell of [false, true]) {
  test(`retrieve args (${shell ? "shell" : "non-shell"} form): exactly WebSearch,WebFetch, a numeric turn cap, stream-json`, () => {
    const argv = retrieveArgs(shell);
    console.log(`[retrieve-argv] shell=${shell} argv=${JSON.stringify(argv)}`);

    // The allow-list, exactly. The shell form is quoted (cmd.exe treats a comma
    // as a parameter separator for %1..%9), and the quotes are cmd's to strip.
    const unquote = (v: string | undefined) => (shell ? v?.replace(/^"(.*)"$/, "$1") : v);
    expect(unquote(valueOf(argv, "--allowed-tools"))).toBe("WebSearch,WebFetch");
    expect([...RETRIEVE_TOOLS].join(",")).toBe("WebSearch,WebFetch");
    // And it is the ONLY tool list: `--tools` limits what exists in the session
    // to the same two, so the allow-list is not the only fence.
    expect(unquote(valueOf(argv, "--tools"))).toBe("WebSearch,WebFetch");

    // A bounded run: a numeric cap, and not the reasoning door's single turn —
    // a search-then-fetch run needs more than one.
    const turns = valueOf(argv, "--max-turns");
    expect(turns, "--max-turns is missing or swallowed").toMatch(/^\d+$/);
    expect(Number(turns)).toBeGreaterThan(1);
    expect(Number(turns)).toBeLessThanOrEqual(60);

    // The stream the receipts are read from. `--verbose` is the CLI's own
    // precondition for stream-json under --print.
    expect(valueOf(argv, "--output-format")).toBe("stream-json");
    expect(argv).toContain("--verbose");
    expect(argv).toContain("-p");

    // Never a workspace tool, never a permission bypass.
    expect(workspaceToolsIn(argv), "a workspace tool is in the retrieval argv").toEqual([]);
    expect(argv.some((a) => /dangerously|bypass/i.test(a))).toBe(false);
    // No empty argument anywhere: the one shape Windows has already eaten.
    expect(argv.every((a) => a.length > 0)).toBe(true);
  });
}

test("retrieve args: the fence survives the retrieval door's own spawn, on this platform's shell setting", async () => {
  const cassette = loadCassette("research-retrieve");
  await withFakeEngine(cassette, async (engine) => {
    await runClaudeRetrieve("# RETRIEVE door\n");
    const [turn] = engine.turns();
    const argv = turn!.argv;
    console.log(`[retrieve-argv] door shell=${USES_SHELL} argv=${JSON.stringify(argv)}`);

    expect(valueOf(argv, "--allowed-tools"), "--allowed-tools did not arrive as WebSearch,WebFetch").toBe(
      "WebSearch,WebFetch",
    );
    expect(valueOf(argv, "--tools")).toBe("WebSearch,WebFetch");
    expect(valueOf(argv, "--max-turns"), "--max-turns did not survive as a flag").toMatch(/^\d+$/);
    expect(valueOf(argv, "--output-format")).toBe("stream-json");
    expect(workspaceToolsIn(argv)).toEqual([]);
  });
});
