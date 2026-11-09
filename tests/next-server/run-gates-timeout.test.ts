// A gate that hangs ends as could-not-run at the time limit, with its whole process tree gone.
// Drives pipeline/gate-bound.mts (the spawn-and-bound piece run-gates.mts uses) with fake gates:
// one that spawns a sleeping grandchild, one that passes, one that fails.

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { gateTimeoutMs, GATE_TIMEOUT_MS, spawnBounded } from "../../pipeline/gate-bound.mts";

type Settled = { code: number | null; signal: string | null; note?: string; ms: number };
const dirs: string[] = [];
const pids: number[] = [];
afterEach(() => {
  for (const p of pids.splice(0)) {
    try {
      process.kill(p, "SIGKILL");
    } catch {
      // already gone
    }
  }
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function run(command: string, timeoutMs: number, graceMs = 3000): Promise<Settled> {
  const t0 = Date.now();
  return new Promise((resolve) =>
    spawnBounded({
      command,
      cwd: process.cwd(),
      env: process.env,
      buffered: true,
      onData: () => {},
      timeoutMs,
      graceMs,
      settle: (code, signal, note) => resolve({ code, signal, note, ms: Date.now() - t0 }),
    }),
  );
}

/** A command: node spawns a sleeping grandchild (pid written to a file), then sleeps itself. */
function hangingCommand(dir: string): { command: string; pidFile: string } {
  const pidFile = path.join(dir, "grandchild.pid");
  const script = path.join(dir, "hang.cjs");
  const gc = `require('fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));setInterval(()=>{},1000)`;
  const body = `require('child_process').spawn(process.execPath,['-e',${JSON.stringify(gc)}],{stdio:'ignore'});setInterval(()=>{},1000)`;
  writeFileSync(script, body);
  return { command: `node "${script}"`, pidFile };
}

describe("gate time limit", () => {
  it("a hung gate with a grandchild ends as a note within limit + grace, tree gone", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "gate-bound-"));
    dirs.push(dir);
    const { command, pidFile } = hangingCommand(dir);
    const settled = run(command, 2500);
    // the grandchild exists before the limit
    for (let i = 0; i < 40 && !existsSync(pidFile); i++) await sleep(100);
    const gc = Number(readFileSync(pidFile, "utf8"));
    pids.push(gc);
    expect(alive(gc)).toBe(true);
    const r = await settled;
    expect(r.note).toMatch(/^timed out after 2\.5 s$/);
    expect(r.code).toBeNull();
    expect(r.ms).toBeGreaterThanOrEqual(2400);
    expect(r.ms).toBeLessThan(2500 + 3000);
    await sleep(500);
    expect(alive(gc)).toBe(false);
  }, 30_000);

  it("a pass and a fail keep their exit codes, with no note", async () => {
    const ok = await run(`node -e "process.exit(0)"`, 20_000);
    const bad = await run(`node -e "process.exit(1)"`, 20_000);
    expect([ok.code, ok.note]).toEqual([0, undefined]);
    expect([bad.code, bad.note]).toEqual([1, undefined]);
  }, 60_000);

  it("the timer does not keep the process alive after a normal gate", async () => {
    const script = `
      import { spawnBounded } from ${JSON.stringify(pathToFileURL(path.resolve("pipeline/gate-bound.mts")).href)};
      spawnBounded({ command: 'node -e "0"', cwd: process.cwd(), env: process.env, buffered: true,
        onData() {}, timeoutMs: 600000, settle: (c) => console.log("settled", c) });`;
    const t0 = Date.now();
    const out = await new Promise<string>((resolve) => {
      const p = spawn(process.execPath, ["--input-type=module", "-e", script], { stdio: ["ignore", "pipe", "inherit"] });
      let s = "";
      p.stdout.on("data", (d) => (s += d));
      p.on("close", () => resolve(s));
    });
    expect(out).toContain("settled 0");
    expect(Date.now() - t0).toBeLessThan(20_000);
  }, 30_000);

  it("the limit is one named constant, overridable by env", () => {
    expect(GATE_TIMEOUT_MS).toBeGreaterThanOrEqual(3 * 215_000);
    expect(gateTimeoutMs({})).toBe(GATE_TIMEOUT_MS);
    expect(gateTimeoutMs({ GRAVITONE_GATE_TIMEOUT_S: "2" })).toBe(2000);
    expect(gateTimeoutMs({ GRAVITONE_GATE_TIMEOUT_S: "0" })).toBe(GATE_TIMEOUT_MS);
  });
});
