// THE GATE REGISTRY AND ITS RUNNER (moonshot card pipeline-scripts-A, 2026-10-05).
//
// pipeline/gates.mts declares every gate once; pipeline/run-gates.mts runs them
// and is what `npm run verify` calls. The `&&` chain it replaced had three
// defects this file pins, each against the real runner in a child process:
//
//   - it STOPPED AT THE FIRST FAILURE, so one run showed one verdict;
//   - it FLATTENED exit 2 (could-not-run: the gate found its own instrument
//     broken) into "failed", though four gates document the difference;
//   - nothing noticed a gate that existed and ran nowhere - gate-regression.mts
//     for weeks, assets-tree-regression.mts until this card.
//
// The stub cases run the runner over a throwaway root whose package.json
// scripts are `node stub.mjs <exit> <ms>`, so every verdict and timestamp is
// one this file chose. The real-tree cases read the registry through the
// runner's own `--list --json`, never a hand copy.
//
// Parity with gates.yml lives in verify-ci-parity.probe.spec.ts.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { test, expect } from "@playwright/test";

const ROOT = path.resolve(__dirname, "../..");
const RUNNER = path.join(ROOT, "pipeline", "run-gates.mts");

type Verdict = "pass" | "fail" | "could-not-run" | "blocked";
type Row = { id: string; verdict: Verdict; exitCode: number | null; startedAt: number | null; endedAt: number | null };
type Report = { exitCode: number; gates: Row[] };
type ListedGate = { id: string; npmScript: string; class: "blocking" | "advisory"; needs: string[]; outcomes: "012" | "01" };

// The outer `npm test` exports npm_* (npm_package_json, npm_config_*) that
// would point a nested `npm run` at THIS repo's package.json. Each stub root
// must be its own project, so none of them cross.
const childEnv = () =>
  Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^npm_/i.test(k))) as NodeJS.ProcessEnv;

function runner(args: string[], cwd = ROOT) {
  const r = spawnSync(process.execPath, [RUNNER, ...args], { cwd, env: childEnv(), encoding: "utf8", timeout: 90_000 });
  return { status: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}`, stdout: r.stdout ?? "" };
}

// ── stub roots ───────────────────────────────────────────────────────────────
type Stub = { id: string; exit: number; ms?: number; outcomes?: "012" | "01"; needs?: string[]; cls?: "blocking" | "advisory" };

function stubRoot(stubs: Stub[], extra: { pipelineFiles?: string[]; unregistered?: Record<string, string>; scriptFor?: Record<string, string> } = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "gate-registry-"));
  mkdirSync(path.join(dir, "pipeline"));
  writeFileSync(
    path.join(dir, "stub.mjs"),
    "const [code, ms] = process.argv.slice(2).map(Number);\nsetTimeout(() => process.exit(code), ms || 0);\n",
  );
  const scripts: Record<string, string> = {};
  for (const s of stubs) scripts[`gate:${s.id}`] = `node stub.mjs ${s.exit} ${s.ms ?? 0}`;
  Object.assign(scripts, extra.scriptFor ?? {});
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "stub", private: true, scripts }, null, 2));
  for (const f of extra.pipelineFiles ?? []) writeFileSync(path.join(dir, "pipeline", f), "// stub\n");
  const gates = stubs.map((s) => ({
    id: s.id,
    npmScript: `gate:${s.id}`,
    class: s.cls ?? "blocking",
    outcomes: s.outcomes ?? "012",
    needs: s.needs,
    rationale: "stub",
  }));
  writeFileSync(
    path.join(dir, "gates.mts"),
    `export const GATES = ${JSON.stringify(gates)};\n` +
      `export const LIVENESS_PATTERNS = [/^[^/]+-regression\\.mts$/, /^check-[^/]+$/];\n` +
      `export const UNREGISTERED = ${JSON.stringify(extra.unregistered ?? {})};\n`,
  );
  const report = path.join(dir, "report.json");
  return {
    dir,
    run: (...args: string[]) => {
      const r = runner(["--root", dir, "--registry", path.join(dir, "gates.mts"), "--report", report, ...args], dir);
      let rep: Report | null = null;
      try {
        rep = JSON.parse(readFileSync(report, "utf8")) as Report;
      } catch {
        rep = null;
      }
      return { ...r, report: rep };
    },
    done: () => rmSync(dir, { recursive: true, force: true }),
  };
}

const row = (rep: Report | null, id: string) => {
  const r = rep?.gates.find((g) => g.id === id);
  expect(r, `no report row for gate "${id}"`).toBeTruthy();
  return r!;
};

// ── case 2: every verdict, and could-not-run kept apart from fail ────────────
test.describe("run-gates reports every verdict", () => {
  test.setTimeout(120_000);

  test("two failing gates are BOTH reported, the gates after them still run, and the run exits 1", () => {
    const s = stubRoot([
      { id: "first-fail", exit: 1 },
      { id: "second-fail", exit: 1 },
      { id: "after", exit: 0 },
    ]);
    try {
      const r = s.run();
      expect(r.status, r.out).toBe(1);
      expect(row(r.report, "first-fail").verdict).toBe("fail");
      expect(row(r.report, "second-fail").verdict).toBe("fail");
      expect(row(r.report, "after").verdict, "the && chain stopped here; the runner must not").toBe("pass");
      expect(r.report!.exitCode).toBe(1);
      expect(r.out).toMatch(/first-fail[^\n]*fail/);
      expect(r.out).toMatch(/second-fail[^\n]*fail/);
    } finally {
      s.done();
    }
  });

  test("a lone exit 2 from a three-outcome gate is could-not-run, and the run exits 2", () => {
    const s = stubRoot([
      { id: "fine", exit: 0 },
      { id: "no-instrument", exit: 2, outcomes: "012" },
    ]);
    try {
      const r = s.run();
      expect(r.status, r.out).toBe(2);
      expect(row(r.report, "no-instrument").verdict).toBe("could-not-run");
      expect(row(r.report, "fine").verdict).toBe("pass");
    } finally {
      s.done();
    }
  });

  test("exit 2 from a two-outcome gate (tsc exits 2 on type errors) is a FAIL, and fail outranks could-not-run", () => {
    const s = stubRoot([
      { id: "tsc-like", exit: 2, outcomes: "01" },
      { id: "no-instrument", exit: 2, outcomes: "012" },
    ]);
    try {
      const r = s.run();
      expect(row(r.report, "tsc-like").verdict).toBe("fail");
      expect(row(r.report, "no-instrument").verdict).toBe("could-not-run");
      expect(r.status, r.out).toBe(1);
    } finally {
      s.done();
    }
  });

  test("advisory gates stay out of the default (blocking) run", () => {
    const s = stubRoot([
      { id: "binding", exit: 0 },
      { id: "advice", exit: 1, cls: "advisory" },
    ]);
    try {
      const r = s.run();
      expect(r.status, r.out).toBe(0);
      expect(r.report!.gates.map((g) => g.id)).not.toContain("advice");
    } finally {
      s.done();
    }
  });
});

// ── case 3: `needs` ordering, and overlap under --parallel ───────────────────
test.describe("run-gates respects needs", () => {
  test.setTimeout(120_000);

  test("under --parallel a gate that needs build never starts before build ends, and independent gates overlap", () => {
    const s = stubRoot([
      { id: "build", exit: 0, ms: 1500 },
      { id: "solo-a", exit: 0, ms: 1500 },
      { id: "solo-b", exit: 0, ms: 1500 },
      { id: "bundle", exit: 0, ms: 50, needs: ["build"] },
    ]);
    try {
      const r = s.run("--parallel", "--jobs", "4");
      expect(r.status, r.out).toBe(0);
      const build = row(r.report, "build");
      const bundle = row(r.report, "bundle");
      const a = row(r.report, "solo-a");
      const b = row(r.report, "solo-b");
      expect(bundle.startedAt!).toBeGreaterThanOrEqual(build.endedAt!);
      const overlaps = (x: Row, y: Row) => x.startedAt! < y.endedAt! && y.startedAt! < x.endedAt!;
      expect(overlaps(a, build), "independent gates ran one after another").toBe(true);
      expect(overlaps(a, b), "independent gates ran one after another").toBe(true);
    } finally {
      s.done();
    }
  });

  test("a gate whose need failed is reported blocked and never started", () => {
    const s = stubRoot([
      { id: "build", exit: 1, outcomes: "01" },
      { id: "bundle", exit: 0, needs: ["build"] },
    ]);
    try {
      for (const mode of [[], ["--parallel"]]) {
        const r = s.run(...mode);
        expect(r.status, r.out).toBe(1);
        const bundle = row(r.report, "bundle");
        expect(bundle.verdict).toBe("blocked");
        expect(bundle.startedAt).toBeNull();
      }
    } finally {
      s.done();
    }
  });

  test("a registry whose need is unknown or declared later is refused as could-not-run before anything runs", () => {
    const s = stubRoot([
      { id: "bundle", exit: 0, needs: ["build"] },
      { id: "build", exit: 0 },
    ]);
    try {
      const r = s.run();
      expect(r.status, r.out).toBe(2);
      expect(r.out).toMatch(/bundle[^\n]*build/);
    } finally {
      s.done();
    }
  });
});

// ── case 5: gate liveness ────────────────────────────────────────────────────
test.describe("gate liveness", () => {
  test.setTimeout(60_000);

  test("a pipeline/*-regression.mts that no gate runs is refused, by name", () => {
    const s = stubRoot([{ id: "known", exit: 0 }], {
      pipelineFiles: ["known-regression.mts", "foo-regression.mts", "check-bar.mjs", "helper.mts"],
      scriptFor: { "gate:known": "node stub.mjs 0 0 && node pipeline/known-regression.mts" },
    });
    try {
      const live = s.run("--liveness");
      expect(live.status, live.out).toBe(1);
      expect(live.out).toContain("pipeline/foo-regression.mts");
      expect(live.out).toContain("pipeline/check-bar.mjs");
      expect(live.out).not.toContain("pipeline/known-regression.mts");
      expect(live.out, "a file outside the gate patterns is not a gate").not.toContain("helper.mts");
      // A full run refuses it too: liveness is a verdict in the run, not a separate courtesy.
      const full = s.run();
      expect(full.status, full.out).toBe(1);
      expect(row(full.report, "liveness").verdict).toBe("fail");
    } finally {
      s.done();
    }
  });

  test("an `unregistered` entry with a reason excuses the file", () => {
    const s = stubRoot([{ id: "known", exit: 0 }], {
      pipelineFiles: ["foo-regression.mts"],
      unregistered: { "foo-regression.mts": "superseded by a probe" },
    });
    try {
      const live = s.run("--liveness");
      expect(live.status, live.out).toBe(0);
    } finally {
      s.done();
    }
  });

  test("this tree has no orphan gate, and the walk read real files", () => {
    const r = runner(["--liveness", "--json"]);
    expect(r.status, r.out).toBe(0);
    const live = JSON.parse(r.stdout) as { candidates: string[]; orphans: string[] };
    expect(live.candidates.length, "the liveness walk found almost nothing to check").toBeGreaterThan(5);
    expect(live.candidates).toContain("pipeline/gate-regression.mts");
    expect(live.orphans).toEqual([]);
  });
});

// ── the real registry ────────────────────────────────────────────────────────
function registry(): ListedGate[] {
  const r = runner(["--list", "--json", "--all"]);
  expect(r.status, r.out).toBe(0);
  return JSON.parse(r.stdout) as ListedGate[];
}

test("every registered gate names a real npm script, and bundle needs build", () => {
  const gates = registry();
  expect(gates.length, "the registry parsed to almost nothing").toBeGreaterThan(5);
  const scripts = (JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
  for (const g of gates) expect(scripts[g.npmScript], `gate ${g.id} runs a script package.json does not have`).toBeTruthy();
  const bundle = gates.find((g) => g.npmScript === "check:bundle");
  expect(bundle?.needs).toEqual(["build"]);
  // Only gates that document the three-outcome protocol may have exit 2 read as could-not-run.
  const typecheck = gates.find((g) => g.npmScript === "typecheck");
  expect(typecheck?.outcomes).toBe("01");
});

test("`npm run verify` IS the runner - no hand-written chain to drift", () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> };
  expect(pkg.scripts.verify).toMatch(/^node pipeline\/run-gates\.mts$/);
});

// ── case 6: the pre-push banner is printed from the registry ─────────────────
test("the pre-push skip banner prints `run-gates.mts --list`, and --list is the blocking set in order", () => {
  const hook = readFileSync(path.join(ROOT, ".githooks", "pre-push"), "utf8").replace(/\r\n/g, "\n");
  // sh comments only; the hook has no strings that contain '#'.
  const code = hook
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");
  const skip = code.slice(code.indexOf("GRAVITONE_SKIP_GATE"), code.indexOf("exit 0", code.indexOf("GRAVITONE_SKIP_GATE")));
  expect(skip.length, "no GRAVITONE_SKIP_GATE branch found in .githooks/pre-push").toBeGreaterThan(20);
  expect(skip).toMatch(/run-gates\.mts --list/);

  const blocking = registry().filter((g) => g.class === "blocking");
  const listed = runner(["--list"]);
  expect(listed.status, listed.out).toBe(0);
  const lines = listed.stdout.split(/\r?\n/).filter((l) => l.trim());
  expect(lines.map((l) => l.trim().split(/\s+/)[0])).toEqual(blocking.map((g) => g.id));
  for (const [i, g] of blocking.entries()) expect(lines[i]).toContain(`npm run ${g.npmScript}`);
});
