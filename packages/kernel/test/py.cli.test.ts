import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
  });
});
