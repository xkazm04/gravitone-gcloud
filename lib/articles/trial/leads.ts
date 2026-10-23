// A TRIAL'S FINDING, SENT BACK TO THE REGISTRY AS A LEAD. Server only.
//
// `.ai/registry-leads.jsonl` is the consumer-side channel the registry's leads-collect.mjs
// folds into its librarian inbox, where /intake decides what survives. A lead ORIGINATES a
// finding and never authorizes one (knowledge-registry/propose-then-adopt): nothing here
// writes the registry. The file lives in the MAIN checkout (a disposable worktree takes its
// lines with it when it is removed), so the path is resolved through git's common dir.
// `ARTICLES_LEADS_FILE` overrides it, and every probe sets it.

import { spawnSync } from "node:child_process";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

export interface RegistryLead {
  ts: string;
  bundle: string;
  /** The subject slug the finding sits nearest to. */
  nearest: string | null;
  kind: "technique" | "application" | "subject";
  /** "When X, do Y, because Z" - one sentence. */
  claim: string;
  /** What this trial measured. */
  because: string;
  confidence: "low" | "medium" | "high";
  /** `article-trial@<YYYY-MM-DD>`. */
  from: string;
}

export function leadsFile(cwd: string = process.cwd()): string {
  const env = process.env.ARTICLES_LEADS_FILE?.trim();
  if (env) return path.resolve(env);
  const r = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, encoding: "utf8" });
  const common = r.status === 0 ? r.stdout.trim() : "";
  const main = common && path.basename(common) === ".git" ? path.dirname(common) : cwd;
  return path.join(main, ".ai", "registry-leads.jsonl");
}

/** Append one lead line. Returns the file it went to. */
export async function appendLead(lead: RegistryLead, cwd?: string): Promise<string> {
  const file = leadsFile(cwd);
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(lead)}\n`, "utf8");
  return file;
}
