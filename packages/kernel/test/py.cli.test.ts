import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { findPython } from "./helpers.ts";

// The command lines of packages/kernel/py, asked wrong. Every module there that runs as a script
// answers a bad argv with exit 2 and its own usage line on stderr - the line its docstring
// carries, so the sentence an operator reads and the one a reader of the file reads are one.
// The population is walked off the directory (every file whose top level opens a __main__ guard;
// a commented-out one does not match `^if`), never listed, so a new script is held to this the
// day it lands.

const here = path.dirname(fileURLToPath(import.meta.url));
const pyDir = path.join(here, "..", "py");
const python = findPython();
if (python === undefined) console.warn("[py.cli] SKIPPED: no Python 3 on PATH; the kernel's Python command lines did not run");

const MAIN = /^if __name__ == "__main__":/m;
const scripts = readdirSync(pyDir)
  .filter((f) => f.endsWith(".py"))
  .filter((f) => MAIN.test(readFileSync(path.join(pyDir, f), "utf8")))
  .sort();

describe("the population", () => {
  it("is walked off the directory and is not empty", () => {
    // job, job_spec, lease, lease_contend, lease_spec, styles_spec, verify_events on 2026-10-24.
    expect(scripts.length).toBeGreaterThanOrEqual(7);
  });
});

describe.skipIf(python === undefined)("a kernel Python script asked with no arguments", () => {
  it.each(scripts)("%s exits 2 with its usage line on stderr", (file) => {
    const r = spawnSync(python ?? "python", ["-I", path.join(pyDir, file)], { encoding: "utf8", input: "", timeout: 30_000 });
    const lines = r.stderr.split(/\r?\n/).filter((l) => l.trim() !== "");
    expect({ status: r.status, stdout: r.stdout, traceback: r.stderr.includes("Traceback") }).toEqual({ status: 2, stdout: "", traceback: false });
    expect(lines.length, `stderr: ${JSON.stringify(r.stderr)}`).toBeGreaterThan(0);
    for (const line of lines) expect(line).toMatch(new RegExp(`^python (-I )?(packages/kernel/py/)?${file.replace(".", "\\.")} `));
  }, 30_000);
});

describe("findPython under CI", () => {
  // A child process with only node on PATH: no interpreter answers. Off CI the suites skip with a
  // warning; on CI the lookup itself fails, so a runner image without python3 cannot read as green.
  const lookup = (ci: string | undefined) =>
    spawnSync(process.execPath, ["-e", `import(${JSON.stringify(pathToFileURL(path.join(here, "helpers.ts")).href)}).then((m) => console.log(String(m.findPython())))`], {
      encoding: "utf8",
      // NODE_NO_WARNINGS: node 24 prints an ExperimentalWarning for node:sqlite on stderr.
      env: { NODE_NO_WARNINGS: "1", PATH: path.dirname(process.execPath), SystemRoot: process.env.SystemRoot, ...(ci === undefined ? {} : { CI: ci }) },
    });

  it("throws when CI is set and no Python 3 answers", () => {
    const r = lookup("1");
    expect(r.status, r.stderr).not.toBe(0);
    expect(r.stderr).toMatch(/findPython: CI is set/);
  });

  it("answers undefined off CI so a laptop without Python still runs the rest", () => {
    const r = lookup(undefined);
    expect(r.stderr).toBe("");
    expect(r.stdout.trim()).toBe("undefined");
  });
});
