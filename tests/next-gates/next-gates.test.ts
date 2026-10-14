// Liveness for pipeline/next-gates.mts: a gate that has never been seen to fail is a
// guess. Each fixture under fixtures/ is a minimal fake repo holding exactly ONE seeded
// violation (or none, for a clean twin); the real script runs over it in a child process
// and its exit code and output are the assertion. A clean twin carries the near-misses a
// check must not flag, so a gate that flags everything fails here too.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";

vi.setConfig({ testTimeout: 30_000 });

const ROOT = path.resolve(import.meta.dirname, "../..");
const SCRIPT = path.join(ROOT, "pipeline", "next-gates.mts");
const FIXTURES = path.join(import.meta.dirname, "fixtures");

function gate(fixture: string, extra: string[] = []): { code: number | null; out: string } {
  const r = spawnSync(process.execPath, [SCRIPT, "--root", path.join(FIXTURES, fixture), ...extra], { encoding: "utf8" });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

const seeded: ReadonlyArray<readonly [fixture: string, file: string, line: number]> = [
  ["boundaries--app-import", "packages/domain/src/a.ts", 1],
  ["boundaries--alias-import", "packages/domain/src/a.ts", 1],
  ["boundaries--upward-layer", "packages/domain/src/a.ts", 1],
  ["boundaries--ui-other-package", "packages/ui/src/e.ts", 1],
  ["boundaries--relative-out", "packages/kernel/src/k.ts", 1],
  ["cycles--cycle", "packages/domain/src/a.ts", 1],
  ["hygiene--as-unknown-as", "packages/domain/src/a.ts", 1],
  ["hygiene--any", "packages/domain/src/a.ts", 1],
  ["hygiene--json-parse", "packages/domain/src/a.ts", 1],
  ["hygiene--keydown", "packages/domain/src/a.ts", 1],
  ["hygiene--catch-empty", "packages/domain/src/a.ts", 4],
  ["hygiene--catch-comment-only", "packages/domain/src/a.ts", 4],
  ["hygiene--catch-console-only", "packages/domain/src/a.ts", 4],
  ["hygiene--catch-bare-return", "packages/domain/src/a.ts", 4],
  ["size--over", "packages/domain/src/big.ts", 401],
];

describe("seeded violations are refused", () => {
  test.each(seeded)("%s -> exit 1 naming file:line", (fixture, file, line) => {
    const { code, out } = gate(fixture);
    expect(code).toBe(1);
    expect(out).toContain(`${file}:${line}`);
  });
});

describe("clean twins pass", () => {
  test.each(["boundaries--clean", "cycles--clean", "hygiene--clean", "size--clean"])("%s -> exit 0", (fixture) => {
    const { code, out } = gate(fixture);
    expect(out).toContain("next-structure: clean");
    expect(code).toBe(0);
  });
});

describe("a walk that saw nothing is could-not-run, never green", () => {
  test("packages/ with no package is exit 2", () => {
    expect(gate("empty--no-packages").code).toBe(2);
  });
  test("source-dir files but zero .ts walked is exit 2", () => {
    expect(gate("empty--no-source-walked").code).toBe(2);
  });
  test("a root with no packages/ is exit 2", () => {
    expect(gate("does-not-exist").code).toBe(2);
  });
});

describe("flags", () => {
  test("--only scopes the run: a hygiene violation is invisible to --only size", () => {
    expect(gate("hygiene--any", ["--only", "size"]).code).toBe(0);
    expect(gate("hygiene--any", ["--only", "hygiene"]).code).toBe(1);
  });
  test("an unknown check name is exit 2", () => {
    expect(gate("hygiene--clean", ["--only", "nope"]).code).toBe(2);
  });
  test("every check prints its denominator", () => {
    const { out } = gate("boundaries--clean");
    for (const c of ["boundaries", "cycles", "hygiene", "size"]) expect(out).toMatch(new RegExp(c + String.raw`: walked \d+, checked \d+, skipped \d+`));
  });
});
