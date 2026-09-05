// LANE — THE TIMEOUT ENDS THE WHOLE TREE (dynamic, real processes).
//
// Registry: llm-agent / agent-cli-transport, borrowing
// subprocess-lifecycle / termination-and-reaping.
//
// lib/claudeCli.ts spawns `claude` through `shell: true` on Windows, so the
// child Node holds is cmd.exe and the engine is its GRANDCHILD. Its two
// timeouts used to call `child.kill()`, which on Windows ends the shell and
// nothing below it: the engine kept running — and kept the operator's seat busy
// — for as long as the turn would have taken, after the caller had already been
// told it timed out. Measured 2026-09-05: after `child.kill()` the shell was
// gone and the grandchild alive; after `taskkill /T` on the live shell, both
// gone in under a second.
//
// This probe drives the real door (`killTree`) against a real tree of the same
// shape — Node, spawned exactly as the engine is, running a sleeper that reports
// its own pid — and asserts the sleeper is dead afterwards. The second test is
// the NEGATIVE CONTROL: it shows the plain `child.kill()` leaves the sleeper
// alive on the shell platform, so a future "simplification" back to it goes red
// here rather than stranding processes on an operator's machine.

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { USES_SHELL, killTree } from "@/lib/claudeCli";

/** A process that writes its own pid to `pidFile` and then lives until killed. */
function sleeper(): { script: string; pidFile: string } {
  const dir = mkdtempSync(join(tmpdir(), "gravitone-killtree-"));
  const script = join(dir, "sleeper.cjs");
  const pidFile = join(dir, "pid");
  writeFileSync(
    script,
    'require("fs").writeFileSync(process.argv[2], String(process.pid)); setInterval(() => {}, 1000);\n',
  );
  return { script, pidFile };
}

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Spawn the sleeper THE WAY THE ENGINE IS SPAWNED and wait until it has
 *  reported its pid — the pid of the process at the bottom of the tree. */
async function spawnTree(): Promise<{ child: ChildProcess; bottom: number }> {
  const { script, pidFile } = sleeper();
  const child = spawn("node", [script, pidFile], { stdio: ["pipe", "pipe", "pipe"], shell: USES_SHELL });
  child.stdin.end();
  for (let i = 0; i < 100 && !existsSync(pidFile); i++) await wait(50);
  expect(existsSync(pidFile), "the sleeper never reported its pid — the spawn itself failed").toBe(true);
  const bottom = Number(readFileSync(pidFile, "utf8"));
  expect(alive(bottom)).toBe(true);
  return { child, bottom };
}

async function settle(bottom: number): Promise<boolean> {
  // Give the kill up to three seconds; taskkill walks a tree in well under one.
  for (let i = 0; i < 60; i++) {
    if (!alive(bottom)) return false;
    await wait(50);
  }
  return alive(bottom);
}

test("killTree: the process at the BOTTOM of the tree is dead afterwards", async () => {
  const { child, bottom } = await spawnTree();
  const closed = new Promise<void>((r) => child.on("close", () => r()));
  killTree(child);
  await closed;
  const still = await settle(bottom);
  console.log(`[cli] killTree shell=${USES_SHELL} shellPid=${child.pid} bottomPid=${bottom} bottomAlive=${still}`);
  expect(still, "killTree ended the shell and left the engine running").toBe(false);
});

test("negative control: plain child.kill() strands the grandchild on the shell platform", async () => {
  test.skip(!USES_SHELL, "off-shell the child IS the engine, so there is no tree to strand");
  const { child, bottom } = await spawnTree();
  // `exit`, not `close`: the stranded grandchild inherits the shell's pipes and
  // holds them open, so `close` never fires while it lives — which is one more
  // way the defect shows. (The test above waits on `close` for exactly that
  // reason: it fires only once nothing is left holding the pipes.)
  const exited = new Promise<void>((r) => child.on("exit", () => r()));
  child.kill();
  await exited;
  const still = await settle(bottom);
  console.log(`[cli] child.kill() shellPid=${child.pid} bottomPid=${bottom} bottomAlive=${still}`);
  // The defect, pinned: this is WHY killTree exists. If the platform ever starts
  // cascading kills, this goes red and the helper can be simplified — knowingly.
  expect(still).toBe(true);
  // Do not leave the evidence running on the operator's machine.
  killTree({ pid: bottom, exitCode: null, killed: false, kill: () => process.kill(bottom) } as unknown as ChildProcess);
  expect(await settle(bottom)).toBe(false);
});
