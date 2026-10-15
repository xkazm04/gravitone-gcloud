// THE MUTATION RUNG - npm run test:mutants
//
// Seeds each declared defect (tests/mutants/registry.ts) into a SCRATCH git
// worktree, runs the probe that claims to guard it, and demands it goes red.
//
//   npx tsx pipeline/probe-mutants.mts                 # every mutant
//   npx tsx pipeline/probe-mutants.mts --only <id>...  # a subset
//   npx tsx pipeline/probe-mutants.mts --registry <module path>
//                                                      # an alternate registry (proving runs)
//
// Verdicts per mutant:
//   killed        the probe ran and failed (non-zero exit AND an "N failed" line);
//   survived      the probe stayed green with the defect alive: a hole in the suite;
//   broken        non-zero exit without a failure count (a compile error, a missing
//                 probe): the mutant proved nothing, so it is not counted as a kill;
//   stale         `find` no longer occurs exactly once; nothing is run;
//   baseline-red  the probe is red WITHOUT the mutant, so a kill would be fake.
//
// Exit 0 only when every mutant is killed. Not part of `verify` (it takes minutes).
//
// The MAIN checkout is never written, except tests/mutants/ledger.json (and only
// on a full default-registry run). The mutant worktree is
// .claude/worktrees/mutants (gitignored), detached at HEAD: uncommitted edits in
// the main tree are NOT in it, so commit the code under test first. Every mutated
// file is restored in `finally`, and again with `git checkout -- <file>`.
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { Mutant } from "../tests/mutants/registry";
import { allKilled, ensureWorktree, flagValues, junctionWholeModules, runRung, summarize } from "./mutants-core.mts";

const ROOT = path.resolve(import.meta.dirname, "..");
const WT = path.join(ROOT, ".claude", "worktrees", "mutants");
const LEDGER = path.join(ROOT, "tests", "mutants", "ledger.json");

const args = process.argv.slice(2);
const only = flagValues(args, "--only");
const registryArg = flagValues(args, "--registry")[0];

function runProbe(probe: string) {
  const t0 = Date.now();
  const r = spawnSync(`npx playwright test tests/golden-path/${probe} --reporter=list`, {
    cwd: WT,
    shell: true,
    encoding: "utf8",
    env: { ...process.env, CI: "", PW_FORBID_ONLY: "" },
    maxBuffer: 64 * 1024 * 1024,
  });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  return { status: r.status ?? 1, failed: /\b\d+ failed\b/.test(out), ms: Date.now() - t0, out };
}

async function main() {
  const regPath = registryArg ? path.resolve(registryArg) : path.join(ROOT, "tests", "mutants", "registry.ts");
  const mod = await import(pathToFileURL(regPath).href);
  const all: Mutant[] = mod.MUTANTS;
  const picked = only.length ? all.filter((m) => only.includes(m.id)) : all;
  if (only.length && picked.length !== only.length) {
    throw new Error(`unknown --only id(s): ${only.filter((i) => !all.some((m) => m.id === i)).join(", ")}`);
  }

  const head = ensureWorktree(ROOT, WT, junctionWholeModules(ROOT));
  const t0 = Date.now();
  const rows = runRung({
    wt: WT,
    mutants: picked,
    label: (m) => ({ probe: m.probe }),
    baselineKey: (m) => m.probe,
    guard: (m) => runProbe(m.probe),
    tag: "[mutants]",
  });

  const summary = summarize(rows);
  const ledger = { commit: head, totalDurationMs: Date.now() - t0, ...summary, mutants: rows };
  // A partial or alternate-registry run must not overwrite the committed ledger.
  if (!only.length && !registryArg) writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + "\n");
  console.log(`[mutants] ${JSON.stringify(summary)} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  process.exit(allKilled(rows) ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
