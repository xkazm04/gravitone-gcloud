// A KILLED CODEX DRAW (review 2026-11-08 P2). Over fake binaries only: no live Codex, no paid call.
//   (a) a timed-out seat whose wrapper has a sleeping grandchild returns in bounded time, nothing left alive;
// Every store is a temp directory set before any lib/ module loads.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-codex-recovery-"));
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "scout");
  process.env["SCOUT_MUSE_STORE_DIR"] = path.join(dir, "scout-muse");
  process.env["SCOUT_CHANNELS_DIR"] = path.join(dir, "scout-channels");
  process.env["SCOUT_SEED_STORE_DIR"] = path.join(dir, "seeds");
  process.env["EXTRACT_STORE_DIR"] = path.join(dir, "extract");
  process.env["MESH_STORE_DIR"] = path.join(dir, "mesh");
  process.env["STRIPS_STORE_DIR"] = path.join(dir, "strips");
  process.env["IDEA_LOOP_STORE_DIR"] = path.join(dir, "loop");
  process.env["FOUNDRY_DIR"] = path.join(dir, "catalogue");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["AI_REGISTRY_DIR"] = path.join(dir, "no-registry");
  process.env["SPEND_STORE"] = "memory";
  fs.mkdirSync(path.join(dir, "catalogue"), { recursive: true });
  fs.writeFileSync(path.join(dir, "catalogue", "styles.json"), JSON.stringify({ styles: [] }), "utf8");
  return dir;
});

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { runCodex } from "../../lib/foundry/scout/codexExec.ts";

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
};

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

describe("a timed-out codex seat", { timeout: 60_000 }, () => {
  it("returns in bounded time and leaves no grandchild", async () => {
    const pidFile = path.join(ROOT, "grandchild.pid");
    const fake = path.join(ROOT, "fake-sleeper.mjs");
    writeFileSync(
      fake,
      `import { spawn } from "node:child_process"; import fs from "node:fs";
const g = spawn(process.execPath, ["-e", "setTimeout(()=>{}, 25000)"], { stdio: "inherit" });
fs.writeFileSync(${JSON.stringify(pidFile)}, String(g.pid));
setTimeout(() => {}, 25000);
`,
    );
    const t0 = Date.now();
    const run = await runCodex("p", { timeoutS: 1, base: { ...process.env, ARTICLES_CODEX_BIN: `node|${fake}` } });
    const seconds = (Date.now() - t0) / 1000;
    console.log(`timed-out seat returned after ${seconds}s, exit ${String(run.exit)}`);
    expect(seconds).toBeLessThan(10);
    expect(existsSync(pidFile)).toBe(true);
    const gpid = Number(readFileSync(pidFile, "utf8"));
    await new Promise((r) => setTimeout(r, 500));
    expect(alive(gpid)).toBe(false);
    if (alive(gpid)) process.kill(gpid);
  });
});
