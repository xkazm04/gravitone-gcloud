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
import { existsSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { Mutant } from "../tests/mutants/registry";

const ROOT = path.resolve(import.meta.dirname, "..");
const WT = path.join(ROOT, ".claude", "worktrees", "mutants");
const LEDGER = path.join(ROOT, "tests", "mutants", "ledger.json");

const args = process.argv.slice(2);
const flagValues = (flag: string) => {
  const out: string[] = [];
  const i = args.indexOf(flag);
  if (i < 0) return out;
  for (let j = i + 1; j < args.length && !args[j].startsWith("--"); j++) out.push(args[j]);
  return out;
};
const only = flagValues("--only");
const registryArg = flagValues("--registry")[0];

const git = (cwd: string, ...a: string[]) => spawnSync("git", a, { cwd, encoding: "utf8" });
const occurrences = (hay: string, needle: string) => (needle ? hay.split(needle).length - 1 : 0);

function ensureWorktree() {
  const head = git(ROOT, "rev-parse", "HEAD").stdout.trim();
  if (!existsSync(path.join(WT, ".git"))) {
    const r = git(ROOT, "worktree", "add", "--detach", "--force", WT, head);
    if (r.status !== 0) throw new Error(`git worktree add failed: ${r.stderr}`);
  } else {
    git(WT, "checkout", "--detach", "--force", head);
    git(WT, "reset", "--hard", head);
  }
  const nm = path.join(WT, "node_modules");
  if (!existsSync(nm)) symlinkSync(path.join(ROOT, "node_modules"), nm, "junction");
  return head;
}

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

type Verdict = "killed" | "survived" | "broken" | "stale" | "baseline-red";
type Row = { id: string; probe: string; verdict: Verdict; durationMs: number; note?: string };

async function main() {
  const regPath = registryArg ? path.resolve(registryArg) : path.join(ROOT, "tests", "mutants", "registry.ts");
  const mod = await import(pathToFileURL(regPath).href);
  const all: Mutant[] = mod.MUTANTS;
  const picked = only.length ? all.filter((m) => only.includes(m.id)) : all;
  if (only.length && picked.length !== only.length) {
    throw new Error(`unknown --only id(s): ${only.filter((i) => !all.some((m) => m.id === i)).join(", ")}`);
  }

  const head = ensureWorktree();
  const t0 = Date.now();
  const baseline = new Map<string, boolean>(); // probe -> green without the mutant
  const rows: Row[] = [];

  for (const m of picked) {
    const started = Date.now();
    const target = path.join(WT, m.file);
    const original = existsSync(target) ? readFileSync(target, "utf8") : null;
    const n = original === null ? 0 : occurrences(original, m.find);
    if (original === null || n !== 1 || m.find === m.replace) {
      const note = original === null ? "file missing" : m.find === m.replace ? "replace equals find" : `find occurs ${n}x`;
      rows.push({ id: m.id, probe: m.probe, verdict: "stale", durationMs: Date.now() - started, note });
      console.log(`[mutants] ${m.id}: stale (${note})`);
      continue;
    }
    if (!baseline.has(m.probe)) baseline.set(m.probe, runProbe(m.probe).status === 0);
    if (!baseline.get(m.probe)) {
      rows.push({ id: m.id, probe: m.probe, verdict: "baseline-red", durationMs: Date.now() - started });
      console.log(`[mutants] ${m.id}: baseline-red`);
      continue;
    }
    let res: ReturnType<typeof runProbe>;
    try {
      writeFileSync(target, original.replace(m.find, () => m.replace));
      res = runProbe(m.probe);
    } finally {
      writeFileSync(target, original);
      git(WT, "checkout", "--", m.file);
    }
    const verdict: Verdict = res.status === 0 ? "survived" : res.failed ? "killed" : "broken";
    rows.push({
      id: m.id,
      probe: m.probe,
      verdict,
      durationMs: Date.now() - started,
      ...(verdict === "broken" ? { note: res.out.split("\n").slice(-6).join(" | ").slice(0, 300) } : {}),
    });
    console.log(`[mutants] ${m.id}: ${verdict} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  }

  const count = (v: Verdict) => rows.filter((r) => r.verdict === v).length;
  const summary = {
    killed: count("killed"),
    survived: count("survived"),
    stale: count("stale"),
    broken: count("broken"),
    baselineRed: count("baseline-red"),
  };
  const ledger = { commit: head, totalDurationMs: Date.now() - t0, ...summary, mutants: rows };
  // A partial or alternate-registry run must not overwrite the committed ledger.
  if (!only.length && !registryArg) writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + "\n");
  console.log(`[mutants] ${JSON.stringify(summary)} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  process.exit(rows.length > 0 && rows.every((r) => r.verdict === "killed") ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
