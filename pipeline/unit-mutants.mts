// THE UNIT MUTATION RUNG - node pipeline/unit-mutants.mts
//
// The Vitest twin of pipeline/probe-mutants.mts. Wave 1-2 builders proved each
// package's key invariants red BY HAND - break the code once, watch the test fail,
// restore - and reported it in prose. tests/mutants-unit/registry.ts turns those
// breaks into data; this runner seeds each into a SCRATCH worktree, runs the one
// Vitest file that claims to guard it, and demands it goes red.
//
//   node pipeline/unit-mutants.mts                     # every mutant
//   node pipeline/unit-mutants.mts --only <id>...      # a subset
//   node pipeline/unit-mutants.mts --registry <path>   # an alternate registry (proving runs)
//
// Verdicts are v1's (pipeline/mutants-core.mts), with the kill made stricter:
//   killed        Vitest reported at least one FAILED TEST (its JSON report, not a
//                 grep of the console), or - for a mutant that names `typecheck` - the
//                 package's `tsc -b` printed an `error TS` line;
//   survived      every command stayed green with the defect alive: a hole in the suite;
//   broken        non-zero exit with no failed test: a suite that could not load, a
//                 transform error, a timeout. A mutant that stops the module from
//                 loading proves nothing about an assertion, so it is not a kill;
//   stale         `find` no longer occurs exactly once; nothing is run;
//   baseline-red  the guard is red WITHOUT the mutant, so a kill would be fake.
//
// Exit 0 only when every mutant is killed; 2 when the runner itself could not run.
// Not part of `verify` (one Vitest start per mutant: minutes).
//
// Two things v1 never needed:
//   - node_modules is NOT one junction to the main tree. npm workspaces link
//     node_modules/@gt/<pkg> to the MAIN checkout's packages/<pkg>, so a kernel test
//     importing "@gt/domain/..." would read the unmutated main tree and a domain
//     mutant could never reach it. The scratch tree gets a real node_modules whose
//     entries junction to the main tree's, except @gt/*, which junction to the
//     scratch tree's own packages.
//   - every guard has a timeout derived from its own baseline (10x, at least 60 s):
//     a mutant that turns a loop bound into an endless loop is `broken`, not a hang.
//
// The MAIN checkout is never written, except tests/mutants-unit/ledger.json (only on
// a full default-registry run). The scratch tree is .claude/worktrees/mutants-unit
// (gitignored), detached at HEAD: uncommitted edits are NOT in it.
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { UnitMutant } from "../tests/mutants-unit/registry.ts";
import { allKilled, ensureWorktree, flagValues, runRung, summarize, type GuardRun } from "./mutants-core.mts";

const ROOT = path.resolve(import.meta.dirname, "..");
const WT = path.join(ROOT, ".claude", "worktrees", "mutants-unit");
const LEDGER = path.join(ROOT, "tests", "mutants-unit", "ledger.json");
const VITEST = path.join(ROOT, "node_modules", "vitest", "vitest.mjs");
const TSC = path.join(ROOT, "node_modules", "typescript", "bin", "tsc");
const REPORT = path.join(WT, ".unit-mutants-report.json");

// Vite writes its bundled config and caches under these; each tree keeps its own.
const LOCAL_ONLY = new Set(["@gt", ".vite", ".vite-temp", ".vitest-cache", ".cache"]);

/** existsSync follows the link; a dangling one would be re-created and throw EEXIST. */
const lexists = (p: string) => {
  try {
    lstatSync(p);
    return true;
  } catch (e: unknown) {
    if (e instanceof Error && "code" in e && e.code === "ENOENT") return false;
    throw e;
  }
};

function linkModules(wt: string) {
  const src = path.join(ROOT, "node_modules");
  const nm = path.join(wt, "node_modules");
  mkdirSync(nm, { recursive: true });
  for (const ent of readdirSync(src, { withFileTypes: true })) {
    // A junction can only name a directory; the loose files here (.package-lock.json) resolve nothing.
    if (!ent.isDirectory() || LOCAL_ONLY.has(ent.name) || lexists(path.join(nm, ent.name))) continue;
    symlinkSync(path.join(src, ent.name), path.join(nm, ent.name), "junction");
  }
  const gt = path.join(nm, "@gt");
  mkdirSync(gt, { recursive: true });
  for (const pkg of readdirSync(path.join(src, "@gt"))) {
    const link = path.join(gt, pkg);
    const want = path.join(wt, "packages", pkg);
    if (!existsSync(want)) throw new Error(`@gt/${pkg} has no packages/${pkg} at HEAD - commit it first`);
    if (!lexists(link)) symlinkSync(want, link, "junction");
    // A link left pointing anywhere else would test the main tree and report every kill as a survivor.
    if (realpathSync(link) !== realpathSync(want)) throw new Error(`${link} resolves to ${realpathSync(link)}, not ${want}`);
  }
}

const pkgOf = (test: string) => {
  const m = /^packages\/([^/]+)\/test\//.exec(test);
  if (!m?.[1]) throw new Error(`not a package test file: ${test}`);
  return m[1];
};

type Run = { status: number | null; out: string; timedOut: boolean };

function run(argv: string[], timeoutMs: number): Run {
  const r = spawnSync(process.execPath, argv, {
    cwd: WT,
    encoding: "utf8",
    env: { ...process.env, CI: "1", NO_COLOR: "1", FORCE_COLOR: "0" },
    maxBuffer: 64 * 1024 * 1024,
    timeout: timeoutMs,
  });
  const timedOut = r.error !== undefined && /ETIMEDOUT/.test(String(r.error));
  return { status: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}${timedOut ? `\n[timeout after ${timeoutMs}ms]` : ""}`, timedOut };
}

type VitestReport = {
  numFailedTests?: number;
  numPassedTests?: number;
  testResults?: { assertionResults?: { fullName?: string; status?: string }[] }[];
};

function readReport(): { failed: number; passed: number; failedNames: string[] } | null {
  if (!existsSync(REPORT)) return null;
  // Not packages/: the door rule binds the workspace, and this file is Vitest's own output.
  const rep: VitestReport = JSON.parse(readFileSync(REPORT, "utf8"));
  if (typeof rep.numFailedTests !== "number" || typeof rep.numPassedTests !== "number") return null;
  // The ledger keeps WHICH tests caught each mutant, not only that one did: a later
  // edit that moves the catch to an unrelated test is visible in the diff.
  const failedNames = (rep.testResults ?? []).flatMap((f) =>
    (f.assertionResults ?? []).filter((a) => a.status === "failed").map((a) => a.fullName ?? "(unnamed)"),
  );
  return { failed: rep.numFailedTests, passed: rep.numPassedTests, failedNames };
}

const baselineMs = new Map<string, number>();
const MIN_TIMEOUT = 60_000;

function guard(m: UnitMutant): GuardRun {
  const key = guardKey(m);
  const prior = baselineMs.get(key);
  const timeout = prior === undefined ? 10 * MIN_TIMEOUT : Math.max(MIN_TIMEOUT, prior * 10);
  const t0 = Date.now();
  rmSync(REPORT, { force: true });
  const v = run([VITEST, "run", m.test, "--reporter=json", `--outputFile=${REPORT}`, "--reporter=dot"], timeout);
  const rep = readReport();
  let res: GuardRun;
  if (v.status !== 0) {
    res = { status: v.status ?? 1, failed: !v.timedOut && (rep?.failed ?? 0) > 0, out: v.out, caughtBy: rep?.failedNames ?? [] };
  } else if (rep === null) {
    res = { status: 1, failed: false, out: `${v.out}\nvitest exited 0 but wrote no report` };
  } else if (rep.passed === 0) {
    // Green with nothing passed is a file that skipped itself (events.python or
    // lease.mixed without a python3): could-not-run, never a survivor.
    res = { status: 1, failed: false, out: `${v.out}\nvitest passed 0 tests: the file skipped itself` };
  } else if (m.typecheck) {
    // A guard that lives in the type system: the Vitest run cannot see it, tsc can.
    const t = run([TSC, "-b", path.join("packages", pkgOf(m.test))], timeout);
    const tsErrors = t.out.split("\n").filter((l) => /error TS\d+/.test(l)).map((l) => l.trim());
    res = t.status === 0 ? { status: 0, failed: false, out: t.out } : { status: t.status ?? 1, failed: tsErrors.length > 0, out: t.out, caughtBy: tsErrors.slice(0, 5) };
  } else {
    res = { status: 0, failed: false, out: v.out };
  }
  if (prior === undefined) baselineMs.set(key, Date.now() - t0);
  return res;
}

/**
 * The scratch tree is checked out under this machine's core.autocrlf, so on Windows
 * its files can carry CRLF while the registry (and the main tree it was written
 * against) says LF. A multi-line `find` would then read as stale on one machine
 * and live on another; it is matched in the file's own line endings instead.
 */
const eolOf = (wt: string) => (m: UnitMutant): UnitMutant => {
  const target = path.join(wt, m.file);
  if (!m.find.includes("\n") || !existsSync(target) || !readFileSync(target, "utf8").includes("\r\n")) return m;
  const crlf = (s: string) => s.replace(/\r?\n/g, "\r\n");
  return { ...m, find: crlf(m.find), replace: crlf(m.replace) };
};

const guardKey = (m: UnitMutant) => `${m.test}${m.typecheck ? " +tsc" : ""}`;

async function main() {
  const args = process.argv.slice(2);
  const only = flagValues(args, "--only");
  const registryArg = flagValues(args, "--registry")[0];
  const regPath = registryArg ? path.resolve(registryArg) : path.join(ROOT, "tests", "mutants-unit", "registry.ts");
  const mod: { MUTANTS: UnitMutant[] } = await import(pathToFileURL(regPath).href);
  const all = mod.MUTANTS;
  const picked = only.length ? all.filter((m) => only.includes(m.id)) : all;
  if (only.length && picked.length !== only.length) {
    throw new Error(`unknown --only id(s): ${only.filter((i) => !all.some((m) => m.id === i)).join(", ")}`);
  }
  if (!existsSync(VITEST)) throw new Error(`vitest is not installed at ${VITEST}`);

  const head = ensureWorktree(ROOT, WT, linkModules);
  const t0 = Date.now();
  const rows = runRung({
    wt: WT,
    mutants: picked.map(eolOf(WT)),
    label: (m) => ({ test: m.test, ...(m.typecheck ? { typecheck: true } : {}) }),
    baselineKey: guardKey,
    guard,
    tag: "[unit-mutants]",
  });
  rmSync(REPORT, { force: true });

  const summary = summarize(rows);
  const ledger = { commit: head, totalDurationMs: Date.now() - t0, ...summary, mutants: rows };
  // A partial or alternate-registry run must not overwrite the committed ledger.
  if (!only.length && !registryArg) writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + "\n");
  console.log(`[unit-mutants] ${JSON.stringify(summary)} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  process.exit(allKilled(rows) ? 0 : 1);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(2);
});
