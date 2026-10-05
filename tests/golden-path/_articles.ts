// Shared fixtures for the article-pipeline probes (articles-*.probe.spec.ts).
//
// Every probe here runs against a THROWAWAY registry (a bare origin plus a
// clone, built by tests/fixtures/articles/registry-fixture.mjs) and a temp run
// store, with the agent — the writer and all four reviewer engines — replaced
// by tests/fixtures/articles/stub-agent.mjs and `gh` by
// tests/fixtures/articles/stub-gh.mjs. Nothing spends, nothing reaches the
// network, and the real registry is never named.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { REPO_LOCATING_GIT_VARS } from "@/lib/gitEnv";

export const ROOT = path.resolve(__dirname, "../..");
export const STUB_AGENT = path.join(ROOT, "tests", "fixtures", "articles", "stub-agent.mjs");
export const STUB_GH = path.join(ROOT, "tests", "fixtures", "articles", "stub-gh.mjs");
const FIXTURE = path.join(ROOT, "tests", "fixtures", "articles", "registry-fixture.mjs");

/** Every variable an article probe may set; pass to keepEnv at file scope. */
export const ARTICLE_ENV = [
  "AI_REGISTRY_DIR",
  "ARTICLES_STORE_DIR",
  "ARTICLES_AGENT_BIN",
  "ARTICLES_CODEX_BIN",
  "ARTICLES_GROK_BIN",
  "ARTICLES_AGY_BIN",
  "ARTICLES_REVIEWERS_FILE",
  "ARTICLES_GH_BIN",
  "ARTICLES_GIT_AUTHOR",
  "STUB_AGENT_MODE",
  "STUB_AGENT_COST",
  "STUB_AGENT_BAD_PATCH",
  "STUB_AGENT_ARGV_LOG",
  "STUB_REVIEWERS",
  "STUB_CRITIQUE_DECISIONS",
  "STUB_DISPOSITIONS",
  "STUB_RESEARCH",
  "STUB_GH_LOG",
  "STUB_GH_FAIL",
  "ANTHROPIC_API_KEY",
  // articleSandbox() deletes these; keepEnv puts a hook's values back after.
  ...REPO_LOCATING_GIT_VARS,
] as const;

/** The three non-claude reviewer engines, each pointed at the stub in its
 *  engine's envelope. A probe that forgot this would spawn the real CLIs. */
export const STUB_ENGINE_BINS = {
  ARTICLES_CODEX_BIN: `node|${STUB_AGENT}|--as=codex`,
  ARTICLES_GROK_BIN: `node|${STUB_AGENT}|--as=grok`,
  ARTICLES_AGY_BIN: `node|${STUB_AGENT}|--as=agy`,
} as const;

export interface ArticleSandbox {
  dir: string;
  registry: string;
  origin: string;
  store: string;
  cleanup: () => void;
}

/** A fresh registry clone and run store, with the env pointed at them. */
export function articleSandbox(): ArticleSandbox {
  // Under a git hook these name the hook's repository, and every git call the
  // article code and these probes make would act on it instead of the sandbox
  // (lib/gitEnv.ts). They are in ARTICLE_ENV, so keepEnv restores them.
  for (const k of REPO_LOCATING_GIT_VARS) delete process.env[k];
  const dir = mkdtempSync(path.join(tmpdir(), "articles-probe-"));
  // A subprocess, not an import: the fixture is an ES module and this lane's
  // transform loads probes as CommonJS.
  const { registry, origin } = JSON.parse(execFileSync(process.execPath, [FIXTURE, path.join(dir, "reg")], { encoding: "utf8" })) as { registry: string; origin: string };
  const store = path.join(dir, "store");
  process.env.AI_REGISTRY_DIR = registry;
  process.env.ARTICLES_STORE_DIR = store;
  process.env.ARTICLES_AGENT_BIN = `node|${STUB_AGENT}`;
  Object.assign(process.env, STUB_ENGINE_BINS);
  process.env.ARTICLES_GH_BIN = `node|${STUB_GH}`;
  for (const k of [
    "STUB_AGENT_MODE",
    "STUB_AGENT_COST",
    "STUB_AGENT_BAD_PATCH",
    "STUB_AGENT_ARGV_LOG",
    "STUB_REVIEWERS",
    "STUB_CRITIQUE_DECISIONS",
    "STUB_DISPOSITIONS",
    "STUB_RESEARCH",
    "STUB_GH_LOG",
    "STUB_GH_FAIL",
    "ARTICLES_GIT_AUTHOR",
    "ARTICLES_REVIEWERS_FILE",
  ])
    delete process.env[k];
  return {
    dir,
    registry,
    origin,
    store,
    cleanup: () => rmSync(dir, { recursive: true, force: true, maxRetries: 3 }),
  };
}
