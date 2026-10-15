// THE MUTATION RUNG'S SHARED CORE - what pipeline/probe-mutants.mts (Playwright
// probes) and pipeline/unit-mutants.mts (Vitest files) both are, once the guard
// that has to go red is factored out.
//
// Extracted from probe-mutants.mts without changing a byte of its behaviour or
// output: the scratch worktree detached at HEAD, the exactly-once `find` check
// that turns a moved mutant STALE instead of silently skipped, the per-guard
// baseline that refuses to count a kill on a guard already red, the restore in
// `finally` plus `git checkout`, and the five verdicts. What differs between the
// rungs - how a guard runs and how node_modules reaches the worktree - is passed in.
//
// Runs under plain `node` (type stripping) and under tsx: erasable TypeScript only.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

export type Verdict = "killed" | "survived" | "broken" | "stale" | "baseline-red";

/** The part of a mutant the core touches; each registry adds what its guard needs. */
export type Seed = { id: string; file: string; find: string; replace: string };

/**
 * One run of a guard. `failed` is the guard's own word that an ASSERTION failed;
 * a non-zero exit without it (a compile error, a missing file, a timeout) proves
 * nothing about the suite and is `broken`, never `killed`.
 */
export type GuardRun = {
  status: number;
  failed: boolean;
  out: string;
  /** What went red, written into a killed row (the unit rung names the failed tests). */
  caughtBy?: string[];
};

export type Row = { id: string; verdict: Verdict; durationMs: number; note?: string } & Record<string, unknown>;

export function flagValues(args: string[], flag: string): string[] {
  const out: string[] = [];
  const i = args.indexOf(flag);
  if (i < 0) return out;
  for (let j = i + 1; j < args.length && !args[j].startsWith("--"); j++) out.push(args[j]);
  return out;
}

export const git = (cwd: string, ...a: string[]) => spawnSync("git", a, { cwd, encoding: "utf8" });
export const occurrences = (hay: string, needle: string) => (needle ? hay.split(needle).length - 1 : 0);

/** v1's link: the whole node_modules as one junction (the probes import no workspace package). */
export function junctionWholeModules(root: string) {
  return (wt: string) => {
    const nm = path.join(wt, "node_modules");
    if (!existsSync(nm)) symlinkSync(path.join(root, "node_modules"), nm, "junction");
  };
}

/** A scratch worktree detached at HEAD; returns the commit it holds. */
export function ensureWorktree(root: string, wt: string, linkModules: (wt: string) => void): string {
  const head = git(root, "rev-parse", "HEAD").stdout.trim();
  if (!existsSync(path.join(wt, ".git"))) {
    const r = git(root, "worktree", "add", "--detach", "--force", wt, head);
    if (r.status !== 0) throw new Error(`git worktree add failed: ${r.stderr}`);
  } else {
    git(wt, "checkout", "--detach", "--force", head);
    git(wt, "reset", "--hard", head);
  }
  linkModules(wt);
  return head;
}

export type RungOptions<M extends Seed> = {
  wt: string;
  mutants: M[];
  /** Fields written into each row between `id` and `verdict` (v1: `{ probe }`). */
  label: (m: M) => Record<string, unknown>;
  /** Mutants sharing a key share one unmutated baseline run. */
  baselineKey: (m: M) => string;
  guard: (m: M) => GuardRun;
  /** Log prefix, e.g. "[mutants]". */
  tag: string;
};

export function runRung<M extends Seed>(o: RungOptions<M>): Row[] {
  const baseline = new Map<string, boolean>(); // guard -> green without the mutant
  const rows: Row[] = [];
  for (const m of o.mutants) {
    const started = Date.now();
    const target = path.join(o.wt, m.file);
    const original = existsSync(target) ? readFileSync(target, "utf8") : null;
    const n = original === null ? 0 : occurrences(original, m.find);
    if (original === null || n !== 1 || m.find === m.replace) {
      const note = original === null ? "file missing" : m.find === m.replace ? "replace equals find" : `find occurs ${n}x`;
      rows.push({ id: m.id, ...o.label(m), verdict: "stale", durationMs: Date.now() - started, note });
      console.log(`${o.tag} ${m.id}: stale (${note})`);
      continue;
    }
    const key = o.baselineKey(m);
    // Nothing is seeded yet, so this run IS the baseline.
    if (!baseline.has(key)) baseline.set(key, o.guard(m).status === 0);
    if (!baseline.get(key)) {
      rows.push({ id: m.id, ...o.label(m), verdict: "baseline-red", durationMs: Date.now() - started });
      console.log(`${o.tag} ${m.id}: baseline-red`);
      continue;
    }
    let res: GuardRun;
    try {
      writeFileSync(target, original.replace(m.find, () => m.replace));
      res = o.guard(m);
    } finally {
      writeFileSync(target, original);
      git(o.wt, "checkout", "--", m.file);
    }
    const verdict: Verdict = res.status === 0 ? "survived" : res.failed ? "killed" : "broken";
    rows.push({
      id: m.id,
      ...o.label(m),
      verdict,
      durationMs: Date.now() - started,
      ...(verdict === "broken" ? { note: res.out.split("\n").slice(-6).join(" | ").slice(0, 300) } : {}),
      ...(verdict === "killed" && res.caughtBy ? { caughtBy: res.caughtBy } : {}),
    });
    console.log(`${o.tag} ${m.id}: ${verdict} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  }
  return rows;
}

export function summarize(rows: Row[]) {
  const count = (v: Verdict) => rows.filter((r) => r.verdict === v).length;
  return {
    killed: count("killed"),
    survived: count("survived"),
    stale: count("stale"),
    broken: count("broken"),
    baselineRed: count("baseline-red"),
  };
}

/** Exit 0 only when there was something to run and every mutant was killed. */
export const allKilled = (rows: Row[]) => rows.length > 0 && rows.every((r) => r.verdict === "killed");
