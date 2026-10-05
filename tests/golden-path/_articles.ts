// Shared fixtures for the article-pipeline probes (articles-*.probe.spec.ts).
//
// Every probe here runs against a THROWAWAY registry (a bare origin plus a
// clone, built by tests/fixtures/articles/registry-fixture.mjs) and a temp run
// store, with the agent replaced by tests/fixtures/articles/stub-agent.mjs and
// `gh` by tests/fixtures/articles/stub-gh.mjs. Nothing spends, nothing reaches
// the network, and the real registry is never named.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const ROOT = path.resolve(__dirname, "../..");
export const STUB_AGENT = path.join(ROOT, "tests", "fixtures", "articles", "stub-agent.mjs");
export const STUB_GH = path.join(ROOT, "tests", "fixtures", "articles", "stub-gh.mjs");
const FIXTURE = path.join(ROOT, "tests", "fixtures", "articles", "registry-fixture.mjs");

/** Every variable an article probe may set; pass to keepEnv at file scope. */
export const ARTICLE_ENV = [
  "AI_REGISTRY_DIR",
  "ARTICLES_STORE_DIR",
  "ARTICLES_AGENT_BIN",
  "ARTICLES_GH_BIN",
  "ARTICLES_GIT_AUTHOR",
  "STUB_AGENT_MODE",
  "STUB_AGENT_COST",
  "STUB_AGENT_BAD_PATCH",
  "STUB_AGENT_ARGV_LOG",
  "STUB_GH_LOG",
  "STUB_GH_FAIL",
  "ANTHROPIC_API_KEY",
] as const;

export interface ArticleSandbox {
  dir: string;
  registry: string;
  origin: string;
  store: string;
  cleanup: () => void;
}

/** A fresh registry clone and run store, with the env pointed at them. */
export function articleSandbox(): ArticleSandbox {
  const dir = mkdtempSync(path.join(tmpdir(), "articles-probe-"));
  // A subprocess, not an import: the fixture is an ES module and this lane's
  // transform loads probes as CommonJS.
  const { registry, origin } = JSON.parse(execFileSync(process.execPath, [FIXTURE, path.join(dir, "reg")], { encoding: "utf8" })) as { registry: string; origin: string };
  const store = path.join(dir, "store");
  process.env.AI_REGISTRY_DIR = registry;
  process.env.ARTICLES_STORE_DIR = store;
  process.env.ARTICLES_AGENT_BIN = `node|${STUB_AGENT}`;
  process.env.ARTICLES_GH_BIN = `node|${STUB_GH}`;
  for (const k of ["STUB_AGENT_MODE", "STUB_AGENT_COST", "STUB_AGENT_BAD_PATCH", "STUB_AGENT_ARGV_LOG", "STUB_GH_LOG", "STUB_GH_FAIL", "ARTICLES_GIT_AUTHOR"]) delete process.env[k];
  return {
    dir,
    registry,
    origin,
    store,
    cleanup: () => rmSync(dir, { recursive: true, force: true, maxRetries: 3 }),
  };
}
