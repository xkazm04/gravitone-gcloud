// THE NOTEBOOK CORPUS — every tracked `notebook.json`, walked through the one
// door, with an approved per-file verdict.
//
// Shared by `tests/golden-path/notebook-corpus.probe.spec.ts` and
// `pipeline/check-notebook.mts`, so the probe and the terminal gate cannot
// disagree about what the population is or what a verdict means.
//
// THE POPULATION IS DERIVED, NOT LISTED: `git ls-files "*notebook.json"`. A list
// in a test is a list somebody has to remember to extend, and a notebook that
// was never listed is a notebook nothing ever read. Tracked-by-git is the right
// definition because it is what a clone sees — an untracked scratch notebook
// must not change a verdict, and a tracked one must not escape it.
//
// NODE-ONLY: reads the filesystem and shells out to git. Never import it from
// app code.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { detectDialect, fromSchemaDialect, type Dialect } from "./dialect";
import { NotebookError } from "./failure";
import { parseNotebook } from "./validate";

export const SNAPSHOT_PATH = "tests/golden-path/__snapshots__/notebook-corpus.json";
export const UPDATE_ENV = "NOTEBOOK_CORPUS_UPDATE";

export interface MemberVerdict {
  dialect: Dialect;
  verdict: "accepted" | "rejected";
  /** Findings grouped by rule key (see `ruleOf`) -> count. */
  findings: Record<string, number>;
  /** Source keys the dialect adapter did not map -> occurrences. */
  unmapped: Record<string, number>;
}

export type CorpusSnapshot = Record<string, MemberVerdict>;

/** `git ls-files "*notebook.json"`, sorted, repo-relative with forward slashes. */
export function corpusPaths(root: string): string[] {
  const out = execFileSync("git", ["ls-files", "*notebook.json"], { cwd: root, encoding: "utf8" });
  return out
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .sort();
}

/**
 * A finding's rule: the finding with the parts that vary per row removed, so
 * "facts[3].sources is empty" and "facts[7].sources is empty" count as one rule.
 * Graph findings already lead with their `[kind]`.
 */
export function ruleOf(finding: string): string {
  const graph = /^\[([a-z-]+)\]/.exec(finding);
  if (graph) return `graph:${graph[1]}`;
  return finding
    .replace(/\[\d+\]/g, "[]")
    .replace(/"[^"]*"/g, '""')
    .replace(/\d+ characters/g, "N characters")
    .replace(/\([\s\S]*$/, "")
    .split(/(?<=\.)\s/)[0]
    .trim()
    .slice(0, 110);
}

const tally = (rules: string[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const r of rules) out[r] = (out[r] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
};

const sorted = (o: Record<string, number>): Record<string, number> =>
  Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

/** Read one member, adapt it if it is in the schema dialect, and ask the door. */
export function readMember(root: string, path: string): unknown {
  return JSON.parse(readFileSync(join(root, path), "utf8"));
}

export function adaptMember(raw: unknown): {
  dialect: Dialect;
  notebook: Record<string, unknown>;
  unmapped: Record<string, number>;
} {
  const dialect = detectDialect(raw);
  if (dialect === "camel") return { dialect, notebook: raw as Record<string, unknown>, unmapped: {} };
  const { notebook, unmapped } = fromSchemaDialect(raw);
  return { dialect, notebook, unmapped: sorted(unmapped) };
}

/** The notebook the door accepted, or null; plus the verdict record. */
export function judge(raw: unknown): { verdict: MemberVerdict; accepted: ReturnType<typeof parseNotebook> | null } {
  const { dialect, notebook, unmapped } = adaptMember(raw);
  const topic = typeof notebook.topic === "string" ? notebook.topic : "";
  try {
    const accepted = parseNotebook(notebook, topic);
    return { verdict: { dialect, verdict: "accepted", findings: {}, unmapped }, accepted };
  } catch (e) {
    if (!(e instanceof NotebookError)) throw e;
    return {
      verdict: { dialect, verdict: "rejected", findings: tally(e.messages.map(ruleOf)), unmapped },
      accepted: null,
    };
  }
}

export function measureCorpus(root: string): CorpusSnapshot {
  const out: CorpusSnapshot = {};
  for (const p of corpusPaths(root)) out[p] = judge(readMember(root, p)).verdict;
  return out;
}

export function readSnapshot(root: string): CorpusSnapshot {
  const file = join(root, SNAPSHOT_PATH);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as CorpusSnapshot) : {};
}

/** Human-readable differences, empty when the two agree. */
export function diffSnapshots(approved: CorpusSnapshot, actual: CorpusSnapshot): string[] {
  const out: string[] = [];
  for (const p of Object.keys(actual)) {
    if (!(p in approved)) {
      out.push(`unapproved corpus member ${p}`);
      continue;
    }
    const a = JSON.stringify(approved[p], null, 2);
    const b = JSON.stringify(actual[p], null, 2);
    if (a !== b) out.push(`verdict changed for ${p}\n  approved: ${a.replace(/\n/g, "\n  ")}\n  actual:   ${b.replace(/\n/g, "\n  ")}`);
  }
  for (const p of Object.keys(approved)) {
    if (!(p in actual)) out.push(`approved corpus member ${p} is no longer tracked`);
  }
  return out;
}

/**
 * Rewrite the approved snapshot. REFUSED unless `NOTEBOOK_CORPUS_UPDATE=1`, and
 * the refusal prints the diff — so an accidental "make it green" run shows the
 * reviewer exactly what it would have approved instead of approving it.
 */
export function approveSnapshot(
  root: string,
  actual: CorpusSnapshot,
  env: Record<string, string | undefined> = process.env,
): string[] {
  const diff = diffSnapshots(readSnapshot(root), actual);
  if (env[UPDATE_ENV] !== "1") {
    throw new Error(
      `refusing to rewrite ${SNAPSHOT_PATH}: set ${UPDATE_ENV}=1 to approve.\n${diff.length ? diff.join("\n") : "(no differences)"}`,
    );
  }
  writeFileSync(join(root, SNAPSHOT_PATH), JSON.stringify(actual, null, 2) + "\n");
  return diff;
}

/** Field-by-field differences between two JSON-ish values, as paths with array
 *  indices kept (`facts[4].claim`), so a diff can be matched to a declared edit. */
export function diffPaths(a: unknown, b: unknown, path = ""): string[] {
  if (Array.isArray(a) && Array.isArray(b)) {
    const out: string[] = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) out.push(...diffPaths(a[i], b[i], `${path}[${i}]`));
    return out;
  }
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const out: string[] = [];
    for (const k of new Set([...Object.keys(ao), ...Object.keys(bo)])) {
      out.push(...diffPaths(ao[k], bo[k], path ? `${path}.${k}` : k));
    }
    return out;
  }
  return JSON.stringify(a) === JSON.stringify(b) ? [] : [path];
}
