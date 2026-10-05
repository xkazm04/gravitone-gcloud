// A git hook exports GIT_DIR, and everything the hook starts inherits it — the
// probe lane included, under `npm run verify` from pre-push. The article
// fixture and the landing code run git against temp directories; with GIT_DIR
// inherited, git ignores the cwd and acts on the repository the variable names.
// Measured 2026-10-05: one pre-push turned this checkout bare and set its
// committer to "Fixture <fixture@example.invalid>".
//
// Each case aims an inherited GIT_DIR at a throwaway VICTIM repository and
// asserts the victim's config is untouched afterwards.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { REPO_LOCATING_GIT_VARS, cwdBoundGitEnv } from "@/lib/gitEnv";

import { ROOT, articleSandbox } from "./_articles";
import { keepEnv } from "./_helpers";

keepEnv(REPO_LOCATING_GIT_VARS);

const FIXTURE = path.join(ROOT, "tests", "fixtures", "articles", "registry-fixture.mjs");

function victim(): { dir: string; gitDir: string; config: () => string } {
  const dir = mkdtempSync(path.join(tmpdir(), "git-env-victim-"));
  execFileSync("git", ["init", "--quiet", dir], { env: cwdBoundGitEnv() });
  const gitDir = path.join(dir, ".git");
  return { dir, gitDir, config: () => readFileSync(path.join(gitDir, "config"), "utf8") };
}

test("cwdBoundGitEnv drops every repo-locating variable and keeps the rest", () => {
  const env = cwdBoundGitEnv({ ...process.env, GIT_DIR: "x", GIT_WORK_TREE: "y", GIT_INDEX_FILE: "z", PATH: "p", GIT_AUTHOR_NAME: "a" });
  for (const k of REPO_LOCATING_GIT_VARS) expect(env[k]).toBeUndefined();
  expect(env.PATH).toBe("p");
  // Identity overrides are not repo-locating; a caller that sets one meant it.
  expect(env.GIT_AUTHOR_NAME).toBe("a");
});

test("the registry fixture under an inherited GIT_DIR leaves that repository alone", () => {
  const v = victim();
  const work = mkdtempSync(path.join(tmpdir(), "git-env-fixture-"));
  const before = v.config();
  try {
    try {
      execFileSync(process.execPath, [FIXTURE, path.join(work, "reg")], {
        env: { ...process.env, GIT_DIR: v.gitDir },
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      // A fixture that failed is still a fixture that must not have written
      // through GIT_DIR; the config comparison below is the verdict.
    }
    const after = v.config();
    expect(after).not.toMatch(/bare\s*=\s*true/);
    expect(after).not.toContain("fixture@example.invalid");
    expect(after).toBe(before);
  } finally {
    rmSync(v.dir, { recursive: true, force: true, maxRetries: 3 });
    rmSync(work, { recursive: true, force: true, maxRetries: 3 });
  }
});

test("articleSandbox clears an inherited GIT_DIR before any article code runs git", () => {
  const v = victim();
  process.env.GIT_DIR = v.gitDir;
  process.env.GIT_WORK_TREE = v.dir;
  const box = articleSandbox();
  try {
    expect(process.env.GIT_DIR).toBeUndefined();
    expect(process.env.GIT_WORK_TREE).toBeUndefined();
    // The sandbox registry is its own repository, not the victim.
    const top = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: box.registry, encoding: "utf8" }).trim();
    expect(path.resolve(top)).toBe(path.resolve(box.registry));
  } finally {
    box.cleanup();
    rmSync(v.dir, { recursive: true, force: true, maxRetries: 3 });
  }
});
