// THE UNIT MUTANT REGISTRY STAYS TRUE (static, cheap; inside `npm run test:unit`).
//
// tests/mutants-unit/registry.ts declares defects `node pipeline/unit-mutants.mts`
// seeds to prove the packages' Vitest files can fail. The v1 twin of this check
// (tests/golden-path/mutant-registry.probe.spec.ts) is kept in shape and upgraded:
//   - every entry's `find` occurs exactly once in its file (a moved `find` would be
//     STALE and the runner would prove nothing, so it is red here, by name);
//   - ids are unique, `replace` differs from `find`, `why` is not empty;
//   - every entry names a test file that exists AND is collected by the unit rung;
//   - the budget is per test FILE and starts at 0, not at a legacy 249: every
//     packages/*/test/**/*.test.ts has at least one mutant. Helpers and fixtures
//     that are not *.test.ts are exempt; they guard nothing on their own.
//
// The population is the files ON DISK, not `git ls-files`: a new test file is
// unguarded the moment it exists, and the commit that adds it must add its mutant.
// Whether each mutant actually goes red is NOT checked here (minutes); that is the
// runner's measured property, recorded in tests/mutants-unit/ledger.json.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { MUTANTS, UNGUARDED_TEST_BUDGET, type UnitMutant } from "../mutants-unit/registry.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");
const PACKAGES = path.join(ROOT, "packages");

const occurrences = (hay: string, needle: string) => (needle ? hay.split(needle).length - 1 : 0);

/** Pure so the failure cases can be driven without touching the registry. */
function problems(mutants: readonly UnitMutant[], read: (file: string) => string | null, testFiles: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of mutants) {
    if (seen.has(m.id)) out.push(`${m.id}: duplicate id`);
    seen.add(m.id);
    const src = read(m.file);
    if (src === null) out.push(`${m.id}: ${m.file} does not exist`);
    else {
      const n = occurrences(src, m.find);
      if (n !== 1) out.push(`${m.id}: find occurs ${n}x in ${m.file} (must be exactly 1)`);
    }
    if (m.find === m.replace) out.push(`${m.id}: replace equals find`);
    if (!m.why.trim()) out.push(`${m.id}: no why`);
    if (!testFiles.includes(m.test)) out.push(`${m.id}: ${m.test} is not a unit-rung test file on disk`);
  }
  return out;
}

const unguarded = (testFiles: readonly string[], mutants: readonly UnitMutant[]) => {
  const guarded = new Set(mutants.map((m) => m.test));
  return testFiles.filter((f) => !guarded.has(f)).sort();
};

/** Every *.test.ts under `dir`, repo-relative with forward slashes. */
function walkDir(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = path.join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(".test.ts")) out.push(path.relative(ROOT, p).split(path.sep).join("/"));
    }
  };
  if (existsSync(dir)) walk(dir);
  return out.sort();
}

/** Every packages/<pkg>/test/**\/*.test.ts, repo-relative with forward slashes. */
function walkTests(packagesDir: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(".test.ts")) out.push(path.relative(ROOT, p).split(path.sep).join("/"));
    }
  };
  for (const pkg of readdirSync(packagesDir)) {
    const t = path.join(packagesDir, pkg, "test");
    if (existsSync(t) && statSync(t).isDirectory()) walk(t);
  }
  return out.sort();
}

// Line endings normalised: with core.autocrlf a checkout writes CRLF where an agent
// wrote LF, and a multi-line `find` (written with a bare LF) must not read as stale on one
// machine and live on another. pipeline/unit-mutants.mts applies the same rule.
const readRepo = (file: string) => {
  const p = path.join(ROOT, file);
  return existsSync(p) ? readFileSync(p, "utf8").replaceAll("\r\n", "\n") : null;
};
// The budget is per PACKAGE test file; an entry may also name a tests/next-server
// file, which the unit rung collects too (vitest.config.mts) and the runner can drive.
const testFiles = walkTests(PACKAGES);
const collected = [...testFiles, ...walkDir(path.join(ROOT, "tests", "next-server"))];

describe("the unit mutant registry", () => {
  test("the walk saw the package suites (an empty population is not a clean one)", () => {
    expect(testFiles.length).toBeGreaterThan(0);
    expect(MUTANTS.length).toBeGreaterThan(0);
  });

  test("every entry is live: find exactly once, unique id, a real test file", () => {
    const found = problems(MUTANTS, readRepo, collected);
    expect(found, `registry problems:\n  ${found.join("\n  ")}`).toEqual([]);
  });

  test(`every package test file has a mutant (budget ${UNGUARDED_TEST_BUDGET})`, () => {
    const open = unguarded(testFiles, MUTANTS);
    expect(
      open.length,
      `${open.length} test file(s) have no mutant - add an entry to tests/mutants-unit/registry.ts that breaks what each guards:\n  ${open.join("\n  ")}`,
    ).toBeLessThanOrEqual(UNGUARDED_TEST_BUDGET);
  });
});

describe("the registry check is not vacuous", () => {
  const mk = (id: string, find: string, over: Partial<UnitMutant> = {}): UnitMutant => ({
    id,
    test: "packages/x/test/a.test.ts",
    file: "f.ts",
    find,
    replace: `${find}!`,
    why: "w",
    ...over,
  });
  const read = (f: string) => (f === "f.ts" ? "alpha beta alpha" : null);
  const files = ["packages/x/test/a.test.ts"];

  test("a live entry passes", () => {
    expect(problems([mk("once", "beta")], read, files)).toEqual([]);
  });

  test("duplicated, absent and missing-file finds are each named", () => {
    expect(problems([mk("twice", "alpha")], read, files)).toEqual(["twice: find occurs 2x in f.ts (must be exactly 1)"]);
    expect(problems([mk("gone", "gamma")], read, files)).toEqual(["gone: find occurs 0x in f.ts (must be exactly 1)"]);
    expect(problems([mk("nofile", "beta", { file: "nope.ts" })], read, files)).toEqual(["nofile: nope.ts does not exist"]);
  });

  test("a toothless, unexplained, duplicate or misaddressed entry is named", () => {
    expect(problems([mk("same", "beta", { replace: "beta" })], read, files)).toEqual(["same: replace equals find"]);
    expect(problems([mk("mute", "beta", { why: " " })], read, files)).toEqual(["mute: no why"]);
    expect(problems([mk("d", "beta"), mk("d", "beta")], read, files)).toEqual(["d: duplicate id"]);
    expect(problems([mk("lost", "beta", { test: "packages/x/test/gone.test.ts" })], read, files)).toEqual([
      "lost: packages/x/test/gone.test.ts is not a unit-rung test file on disk",
    ]);
  });

  test("a new test file with no entry is unguarded", () => {
    const two = [...files, "packages/x/test/new.test.ts"];
    expect(unguarded(files, [mk("a", "beta")])).toEqual([]);
    expect(unguarded(two, [mk("a", "beta")])).toEqual(["packages/x/test/new.test.ts"]);
  });

  test("the walk finds nested test files and skips helpers", () => {
    const nested = testFiles.filter((f) => f.split("/").length > 4);
    expect(nested.length, "no nested test file seen - did the walk stop recursing?").toBeGreaterThan(0);
    expect(testFiles.every((f) => f.endsWith(".test.ts"))).toBe(true);
  });
});
