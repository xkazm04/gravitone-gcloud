// DOJO STATUS — where each gated improvement stands (foundry-dojo-A, 'The move' item 5).
//
//   npm run dojo:status [-- --json] [--ledger <file>] [--repo <dir>] [--stale-days N]
//
// Reads pipeline/foundry/training-ledger.json through the schema-2 reader
// (lib/foundry/training/ledger.ts), answers the two facts lifecycleState needs
// (git ancestry of main, a pin's pattern present in its surface), and prints the
// derived state. `stale` is advisory: an `owed` row older than --stale-days
// (default 14) is flagged, and the flag never changes the exit code, because a
// clock-dependent check may not block. Exit is non-zero only when the ledger
// cannot be read.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { normalizeLedger } from "../lib/foundry/training/ledger.ts";
import { lifecycleState, type LifecycleFacts, type LifecycleState } from "../lib/foundry/training/lifecycle.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DAY = 86_400_000;

export interface StatusRow {
  cycle: string;
  technique: string;
  human: string;
  state: LifecycleState;
  reflection: string | null;
  stale?: true;
}
export interface StatusReport {
  rows: StatusRow[];
  counts: Record<string, number>;
}

/** The two facts, answered from a checkout: `git merge-base --is-ancestor <sha> main`
 *  and "the pin's pattern occurs in its surface file". Both are false on any failure. */
export function gitFacts(repo: string): LifecycleFacts {
  return {
    isAncestor: (sha) => {
      try {
        execFileSync("git", ["-C", repo, "merge-base", "--is-ancestor", sha, "main"], { stdio: "ignore" });
        return true;
      } catch {
        return false;
      }
    },
    pinPasses: (pin) => {
      const file = path.join(repo, pin.surface);
      return existsSync(file) && readFileSync(file, "utf8").includes(pin.pattern);
    },
  };
}

export function statusReport(rawRows: readonly unknown[], facts: LifecycleFacts, now = new Date(), staleDays = 14): StatusReport {
  const counts: Record<string, number> = {};
  const rows = normalizeLedger(rawRows).map((r): StatusRow => {
    const state = lifecycleState(r, facts);
    counts[state] = (counts[state] ?? 0) + 1;
    const age = now.getTime() - Date.parse(r.at);
    return {
      cycle: r.cycle,
      technique: r.technique,
      human: r.human,
      state,
      reflection: r.reflection?.sha ?? null,
      ...(state === "owed" && age > staleDays * DAY ? { stale: true as const } : {}),
    };
  });
  return { rows, counts };
}

/** The CLI, with its output returned so a test can drive it without a child process. */
export function run(argv: string[]): { code: number; stdout: string; stderr: string } {
  const opt = (name: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const ledger = path.resolve(opt("--ledger") ?? path.join(ROOT, "pipeline/foundry/training-ledger.json"));
  const staleDays = Number(opt("--stale-days") ?? 14);
  let raw: unknown[];
  try {
    const parsed = JSON.parse(readFileSync(ledger, "utf8")) as { rows?: unknown[] };
    if (!Array.isArray(parsed.rows)) throw new Error("no `rows` array");
    raw = parsed.rows;
  } catch (e) {
    return { code: 1, stdout: "", stderr: `dojo-status: cannot read ledger ${ledger}: ${(e as Error).message}\n` };
  }
  const report = statusReport(raw, gitFacts(opt("--repo") ?? ROOT), new Date(), staleDays);
  if (argv.includes("--json")) {
    return { code: 0, stdout: JSON.stringify(report, null, 2) + "\n", stderr: "" };
  }
  const w = Math.max(5, ...report.rows.map((r) => r.cycle.length));
  const lines = [
    `${"cycle".padEnd(w)}  verdict  ${"state".padEnd(14)} reflection`,
    ...report.rows.map((r) => `${r.cycle.padEnd(w)}  ${r.human.padEnd(7)}  ${r.state.padEnd(14)} ${r.reflection ?? "-"}${r.stale ? "  stale" : ""}`),
    Object.entries(report.counts).map(([k, v]) => `${k} ${v}`).join("  |  "),
  ];
  return { code: 0, stdout: lines.join("\n") + "\n", stderr: "" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const r = run(process.argv.slice(2));
  process.stdout.write(r.stdout);
  process.stderr.write(r.stderr);
  process.exitCode = r.code;
}
