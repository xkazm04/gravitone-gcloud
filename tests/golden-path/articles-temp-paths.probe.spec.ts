// LANE — THE ARTICLE PIPELINE'S TEMP DIRECTORIES ARE UNIQUE BY CONSTRUCTION
// (lib/articles/engine.ts makeWorkspace / makeReviewerWorkspace,
// lib/articles/registryWrite.ts landRun, lib/articles/tempDir.ts).
//
// The run id is the date and the topic and the clock is injected, so two
// processes on one topic in one millisecond (a frozen test clock makes that
// certain) were handed the same `<id>-<name>-<ms>` directory. The two engine
// sites then removed it before using it — deleting a live sibling's workspace —
// and the landing worktree's `git worktree add` failed with "already exists".
// Pinned here, all under a frozen clock and the stub agent in a throwaway
// registry sandbox:
//
//   · two agent workspaces for one id, name and instant are different
//     directories, and a file in the first survives the creation of the second
//   · the same for the reviewer workspace
//   · two landings of one article at one instant get different worktrees
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { approveRun, createRun, defaultDeps, driveRun, makeReviewerWorkspace, makeWorkspace } from "@/lib/articles/engine";
import { landRun, LandingError } from "@/lib/articles/registryWrite";
import { readRun, runDir } from "@/lib/articles/store";
import type { ArticleLanding } from "@/lib/articles/types";

import { keepEnv } from "./_helpers";
import { ARTICLE_ENV, articleSandbox, type ArticleSandbox } from "./_articles";

keepEnv(ARTICLE_ENV);
test.describe.configure({ timeout: 120_000 });

let box: ArticleSandbox;
test.beforeEach(() => {
  box = articleSandbox();
});
test.afterEach(() => box.cleanup());

const FROZEN = new Date("2026-10-07T12:00:00.000Z");

test("two agent workspaces for one id, name and instant are different directories", async () => {
  const a = await makeWorkspace("2026-10-07-tokens", "research", FROZEN);
  writeFileSync(path.join(a, "out", "sources.json"), "[1]");
  const b = await makeWorkspace("2026-10-07-tokens", "research", FROZEN);
  expect(b).not.toBe(a);
  expect(readFileSync(path.join(a, "out", "sources.json"), "utf8"), "the first workspace was removed by the second").toBe("[1]");
  expect(existsSync(path.join(b, "inputs"))).toBe(true);
  expect(existsSync(path.join(b, "out"))).toBe(true);
  expect(path.basename(a)).toContain("2026-10-07-tokens-research-");
});

test("two reviewer workspaces for one id, round, reviewer, attempt and instant are different directories", async () => {
  const a = await makeReviewerWorkspace("2026-10-07-tokens", 1, "claude", 1, FROZEN);
  writeFileSync(path.join(a, "REVIEW.md"), "live");
  const b = await makeReviewerWorkspace("2026-10-07-tokens", 1, "claude", 1, FROZEN);
  expect(b).not.toBe(a);
  expect(readFileSync(path.join(a, "REVIEW.md"), "utf8"), "the first reviewer's workspace was removed by the second").toBe("live");
  expect(existsSync(b)).toBe(true);
  expect(path.basename(a)).toContain("2026-10-07-tokens-r1-claude-1-");
});

test("two landings of one article at one frozen instant get different worktrees", async () => {
  const deps = defaultDeps({ render: false });
  const run = await createRun({ topic: { kind: "free", text: "the token tax" } }, deps);
  await driveRun(run.id, deps);
  // a title that makes the stub gate fail keeps the worktree, so both coexist
  const meta = path.join(runDir(run.id), "post", "meta.json");
  writeFileSync(meta, JSON.stringify({ ...JSON.parse(readFileSync(meta, "utf8")), title: "FAIL-GATE post" }));
  await approveRun(run.id, [], deps);
  const approved = await readRun(run.id);

  const land = async (): Promise<ArticleLanding> => {
    try {
      await landRun({ runDir: runDir(run.id), run: approved, approvedPatches: [], now: () => FROZEN });
    } catch (e) {
      expect(e, "the landing should stop at the stub gate").toBeInstanceOf(LandingError);
      return (e as LandingError).landing;
    }
    throw new Error("the landing was expected to fail at the gate");
  };
  const first = await land();
  const second = await land();
  try {
    expect(first.worktree, "the first landing's worktree").toBeTruthy();
    expect(second.worktree, `the second landing: ${second.branch}`).toBeTruthy();
    expect(second.worktree).not.toBe(first.worktree);
    expect(existsSync(first.worktree!)).toBe(true);
    expect(existsSync(second.worktree!)).toBe(true);
    expect(path.basename(first.worktree!)).toContain(`${approved.id}-`);
  } finally {
    for (const l of [first, second]) {
      if (l.worktree) {
        try {
          execFileSync("git", ["worktree", "remove", "--force", l.worktree], { cwd: box.registry, stdio: "ignore" });
        } catch {
          /* the sandbox is removed whole */
        }
      }
    }
  }
});
